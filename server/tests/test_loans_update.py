"""LOAN-2-P1: 예정일 고치기(#21)·반납(#22) — loan-assistant 계약 LOAN-2 C5·C6·P5."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import text

from app.common import today_kst
from app.routers import loans as loans_router
from tests.conftest import USER_A_ID, USER_B_ID

# 픽스처(books·client·auth)와 도우미는 LOAN-1 시험의 것을 그대로 쓴다. test_* 이름은 가져오지 않는다.
from tests.test_loans_start import auth, books, client, isbn  # noqa: F401
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

URL = "/api/v1/me/loans"
CLOCK = {"now": datetime(2026, 11, 16, 3, 0, tzinfo=timezone.utc)}  # 2026-11-16 12:00 KST


@pytest.fixture(autouse=True)
def movable_server_today(monkeypatch):
    """서버 서울 날짜를 시험에서 옮길 수 있게 고정한다(기기 날짜를 쓰지 않는다)."""
    CLOCK["now"] = datetime(2026, 11, 16, 3, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(loans_router, "today_kst", lambda: today_kst(CLOCK["now"]))


def start(client, headers, book: int = 0, **extra) -> dict:
    response = client.post(URL, headers=headers, json={"isbn13": isbn(book), **extra})
    assert response.status_code == 201
    return response.json()


def loan_row(db_engine, loan_id: str):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT * FROM loans WHERE id = :id"), {"id": loan_id}).one()


def change(client, headers, loan_id: str, due_on) -> object:
    return client.patch(f"{URL}/{loan_id}", headers=headers, json={"due_on": due_on})


def give_back(client, headers, loan_id: str) -> object:
    return client.post(f"{URL}/{loan_id}/return", headers=headers)


def stats_count(db_engine) -> int:
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM library_return_stats")).scalar_one()


# ─────────── P5 필수 시험 ───────────


def test_change_due_before_loaned_is_422_unchanged(client, auth, db_engine):
    loan = start(client, auth["A"])
    response = change(client, auth["A"], loan["id"], "2026-11-15")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR" and response.json()["error"]["detail"] == "due_on"
    row = loan_row(db_engine, loan["id"])
    assert row.due_on == date(2026, 11, 30) and row.due_on_assumed is True


@pytest.mark.parametrize("bad", ["2026-02-30", "2026-13-01", "20261128", "2026-11-28T00:00:00", "", 20261128, None])
def test_invalid_due_on_format_is_422_detail_due_on(client, auth, db_engine, bad):
    loan = start(client, auth["A"])
    response = change(client, auth["A"], loan["id"], bad)
    assert response.status_code == 422 and response.json()["error"]["detail"] == "due_on"
    assert loan_row(db_engine, loan["id"]).due_on == date(2026, 11, 30)


def test_change_due_sets_not_assumed(client, auth, db_engine):
    loan = start(client, auth["A"], library_id=101)
    response = change(client, auth["A"], loan["id"], "2026-12-05")
    assert response.status_code == 200
    body = response.json()
    assert body["due_on"] == "2026-12-05" and body["due_on_assumed"] is False
    assert body["d_day"] == 19 and body["is_overdue"] is False
    assert body["loaned_on"] == "2026-11-16" and body["library"] == {"id": 101, "name": "정독도서관"}
    # 대출일 당일도 고를 수 있다(E1 "대출일보다 빠를 수 없다") — 같은 값 다시 보내도 같은 결과
    for _ in range(2):
        same = change(client, auth["A"], loan["id"], "2026-11-16")
        assert same.status_code == 200 and same.json()["due_on"] == "2026-11-16" and same.json()["d_day"] == 0
    row = loan_row(db_engine, loan["id"])
    assert row.due_on == date(2026, 11, 16) and row.due_on_assumed is False


def test_change_due_after_return_is_409(client, auth, db_engine):
    loan = start(client, auth["A"])
    assert give_back(client, auth["A"], loan["id"]).status_code == 200
    response = change(client, auth["A"], loan["id"], "2026-12-05")
    assert response.status_code == 409 and response.json()["error"]["code"] == "CONFLICT"
    row = loan_row(db_engine, loan["id"])
    assert row.due_on == date(2026, 11, 30) and row.due_on_assumed is True and row.status == "returned"


def test_other_users_loan_is_404(client, auth, db_engine):
    loan = start(client, auth["B"])
    for response in (change(client, auth["A"], loan["id"], "2026-12-05"), give_back(client, auth["A"], loan["id"])):
        assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    missing = give_back(client, auth["A"], "00000000-0000-4000-8000-000000000999")
    assert missing.status_code == 404 and missing.json() == give_back(client, auth["A"], loan["id"]).json()
    row = loan_row(db_engine, loan["id"])
    assert (row.status, row.due_on, row.returned_on) == ("on_loan", date(2026, 11, 30), None)
    assert str(row.user_id) == USER_B_ID


def test_return_twice_keeps_first_date(client, auth, db_engine):
    loan = start(client, auth["A"])
    first = give_back(client, auth["A"], loan["id"])
    assert first.status_code == 200
    assert first.json()["status"] == "returned" and first.json()["returned_on"] == "2026-11-16"
    assert first.json()["d_day"] == 0 and first.json()["is_overdue"] is False
    CLOCK["now"] = datetime(2026, 11, 20, 3, 0, tzinfo=timezone.utc)  # 서버 날짜가 바뀐 뒤 다시
    second = give_back(client, auth["A"], loan["id"])
    assert second.status_code == 200 and second.json()["returned_on"] == "2026-11-16"
    assert loan_row(db_engine, loan["id"]).returned_on == date(2026, 11, 16)
    # 지난 대출 목록으로 옮겨 감(LOAN-1 #19)
    assert client.get(URL, headers=auth["A"]).json()["items"] == []
    returned = client.get(URL, headers=auth["A"], params={"status": "returned"}).json()["items"]
    assert [x["id"] for x in returned] == [loan["id"]]


def test_return_does_not_write_stats(client, auth, db_engine):
    loan = start(client, auth["A"], library_id=101)
    assert give_back(client, auth["A"], loan["id"]).status_code == 200
    assert stats_count(db_engine) == 0


def test_return_and_change_race(client, auth, db_engine):
    """반납·수정이 동시에: 먼저 잠근 쪽이 이기고, 뒤는 409(수정) 또는 200(반납). 500 없음."""
    for book in range(3):
        loan = start(client, auth["A"], book=book)
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_return = pool.submit(give_back, client, auth["A"], loan["id"])
            f_change = pool.submit(change, client, auth["A"], loan["id"], "2026-12-24")
            r_return, r_change = f_return.result(timeout=10), f_change.result(timeout=10)
        assert r_return.status_code == 200
        assert r_change.status_code in (200, 409)
        row = loan_row(db_engine, loan["id"])
        assert row.status == "returned" and row.returned_on == date(2026, 11, 16)
        if r_change.status_code == 409:  # 반납이 먼저: 예정일 그대로
            assert row.due_on == date(2026, 11, 30) and row.due_on_assumed is True
        else:  # 수정이 먼저, 그 뒤 반납
            assert row.due_on == date(2026, 12, 24) and row.due_on_assumed is False


def test_library_return_stats_rls_and_no_user_columns(db_engine):
    with db_engine.connect() as conn:
        assert conn.execute(text(
            "SELECT relrowsecurity FROM pg_class WHERE relname = 'library_return_stats'")).scalar_one()
        assert conn.execute(text(
            "SELECT count(*) FROM pg_policies WHERE tablename = 'library_return_stats'")).scalar_one() == 0
        columns = set(conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'library_return_stats'"
        )).scalars())
    assert columns == {"library_id", "book_id", "returned_on", "return_count"}


# ─────────── 그 밖의 C6 예외 ───────────


def test_invalid_loan_id_is_422(client, auth):
    for response in (change(client, auth["A"], "not-a-uuid", "2026-12-05"), give_back(client, auth["A"], "not-a-uuid")):
        assert response.status_code == 422 and response.json()["error"]["detail"] == "loan_id"


def test_requires_login(client):
    some = "00000000-0000-4000-8000-000000000999"
    assert client.patch(f"{URL}/{some}", json={"due_on": "2026-12-05"}).status_code == 401
    assert client.post(f"{URL}/{some}/return").status_code == 401


def test_return_body_ignored(client, auth, db_engine):
    loan = start(client, auth["A"])
    response = client.post(f"{URL}/{loan['id']}/return", headers=auth["A"], json={"returned_on": "2026-01-01"})
    assert response.status_code == 200 and response.json()["returned_on"] == "2026-11-16"


def test_change_ignores_other_fields(client, auth, db_engine):
    loan = start(client, auth["A"])
    response = client.patch(f"{URL}/{loan['id']}", headers=auth["A"],
                            json={"due_on": "2026-12-01", "loaned_on": "2026-01-01", "status": "returned"})
    assert response.status_code == 200
    row = loan_row(db_engine, loan["id"])
    assert (row.loaned_on, row.status, row.due_on) == (date(2026, 11, 16), "on_loan", date(2026, 12, 1))


def test_withdrawn_is_403_unchanged(client, auth, db_engine):
    loan = start(client, auth["A"])
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"), {"id": USER_A_ID})
    for response in (change(client, auth["A"], loan["id"], "2026-12-05"), give_back(client, auth["A"], loan["id"])):
        assert response.status_code == 403 and response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    row = loan_row(db_engine, loan["id"])
    assert (row.status, row.due_on) == ("on_loan", date(2026, 11, 30))
