"""LOAN-1-P1: 내 대출 목록(#19)·빌렸어요(#20) — loan-assistant 계약 LOAN-1 C5·C6·P5."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from time import monotonic

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.common import today_kst
from app.main import create_app
from app.routers import loans as loans_router
from app.services import provider_engine as pe
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

NOW = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
# 2026-11-16 23:59 KST — 서울 날짜로는 아직 16일(UTC로는 14:59)
SERVER_NOW = datetime(2026, 11, 16, 14, 59, tzinfo=timezone.utc)
TODAY = date(2026, 11, 16)
BOOK_PREFIX = "97933333"
URL = "/api/v1/me/loans"
PLANS_URL = "/api/v1/me/loan-plans"


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


@pytest.fixture(autouse=True)
def fixed_server_today(monkeypatch):
    """서버 시계를 2026-11-16 23:59 KST로 고정한다(기기·본문 날짜가 아니라 이 값만 써야 한다)."""
    monkeypatch.setattr(loans_router, "today_kst", lambda: today_kst(SERVER_NOW))


@pytest.fixture
def books(db_engine, public_reference_data):
    """설명·연도를 채운 책 3권(조회 엔진이 외부 제공자를 부르지 않게)."""

    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM loans"))
            conn.execute(text("DELETE FROM loan_plans"))
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})

    clean()
    with db_engine.begin() as conn:
        rows = pe.upsert_books(conn, [
            pe.BookInfo(isbn(0), "소년이 온다", author="한강", cover_url="https://img.test/l0.jpg",
                        description="소개", pub_year=2014),
            pe.BookInfo(isbn(1), "표지 없는 책", author=None, cover_url=None, description="소개", pub_year=2021),
            pe.BookInfo(isbn(2), "세 번째 책", author="김작가", cover_url=None, description="소개", pub_year=2022),
        ], "manual", NOW, overwrite=True)
    yield rows
    clean()


@pytest.fixture
def client(test_db_url, fake_jwks_client, books):
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client, make_token):
    headers = {}
    for name, uid in (("A", USER_A_ID), ("B", USER_B_ID)):
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


def start(client, headers, book: int = 0, **extra):
    return client.post(URL, headers=headers, json={"isbn13": isbn(book), **extra})


def plan(client, headers, book: int = 0, library_id: int = 101) -> str:
    response = client.post(PLANS_URL, headers=headers, json={"isbn13": isbn(book), "library_id": library_id})
    assert response.status_code == 201
    return response.json()["id"]


def rows(db_engine, where: str = "TRUE", **params) -> list:
    with db_engine.connect() as conn:
        return conn.execute(text(f"SELECT * FROM loans WHERE {where}"), params).all()


def plan_status(db_engine, plan_id: str) -> str:
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT status FROM loan_plans WHERE id = :id"), {"id": plan_id}).scalar_one()


def insert_loan(db_engine, user_id: str, book_id: int, due_on: date, **extra) -> str:
    values = {"u": user_id, "b": book_id, "lo": min(due_on, TODAY) - timedelta(days=14), "due": due_on,
              "status": "on_loan", "ret": None, **extra}
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO loans (user_id, book_id, loaned_on, due_on, status, returned_on) "
            "VALUES (:u, :b, :lo, :due, :status, :ret) RETURNING id"), values).scalar_one())


# ─────────── P5 필수 시험 ───────────


def test_start_loan_uses_server_kst_today(client, auth, db_engine):
    response = start(client, auth["A"], library_id=101, loaned_on="2026-01-01", due_on="2026-01-02",
                     user_id=USER_B_ID)
    assert response.status_code == 201
    loan = response.json()
    assert set(loan) == {"id", "book", "library", "plan_id", "loaned_on", "due_on", "due_on_assumed",
                         "status", "returned_on", "d_day", "is_overdue"}
    assert loan["loaned_on"] == "2026-11-16" and loan["due_on"] == "2026-11-30"
    assert loan["due_on_assumed"] is True
    assert loan["status"] == "on_loan" and loan["returned_on"] is None
    assert loan["d_day"] == 14 and loan["is_overdue"] is False
    assert loan["book"] == {"isbn13": isbn(0), "title": "소년이 온다", "author": "한강",
                            "cover_url": "https://img.test/l0.jpg"}
    assert loan["library"] == {"id": 101, "name": "정독도서관"}
    assert loan["plan_id"] is None
    (row,) = rows(db_engine)
    assert row.loaned_on == TODAY and row.due_on == date(2026, 11, 30)
    assert str(row.user_id) == USER_A_ID  # 본문 user_id 무시


def test_start_loan_twice_one_row(client, auth, db_engine):
    first = start(client, auth["A"])
    second = start(client, auth["A"])
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json() == second.json()
    # 동시 연타
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: start(client, auth["A"], book=1), range(4)))
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201]
    assert len({r.json()["id"] for r in results}) == 1
    assert len(rows(db_engine)) == 2


def test_start_from_plan_converts_once(client, auth, db_engine):
    plan_id = plan(client, auth["A"], library_id=102)
    first = start(client, auth["A"], plan_id=plan_id)
    assert first.status_code == 201
    loan = first.json()
    assert loan["plan_id"] == plan_id
    assert loan["library"]["id"] == 102  # 도서관을 안 보내면 예정의 도서관(M6)
    assert plan_status(db_engine, plan_id) == "converted"
    # 같은 예정으로 다시: 이미 converted라 409, 대출은 그대로 하나
    second = start(client, auth["A"], plan_id=plan_id)
    assert second.status_code == 409 and second.json()["error"]["code"] == "CONFLICT"
    assert len(rows(db_engine)) == 1
    assert plan_status(db_engine, plan_id) == "converted"


def test_plan_of_other_user_is_404(client, auth, db_engine):
    other = plan(client, auth["B"])
    response = start(client, auth["A"], plan_id=other)
    assert response.status_code == 404
    assert response.json()["error"] == {"code": "NOT_FOUND", "message": "찾을 수 없어요.", "detail": "plan_id"}
    missing = start(client, auth["A"], plan_id="00000000-0000-4000-8000-000000000999")
    assert missing.status_code == 404 and missing.json() == response.json()  # 남의 것 = 없는 것
    assert rows(db_engine) == []
    assert plan_status(db_engine, other) == "planned"


def test_released_plan_is_409(client, auth, db_engine):
    plan_id = plan(client, auth["A"])
    assert client.delete(f"{PLANS_URL}/{plan_id}", headers=auth["A"]).status_code == 200
    response = start(client, auth["A"], plan_id=plan_id)
    assert response.status_code == 409 and response.json()["error"]["code"] == "CONFLICT"
    assert rows(db_engine) == []
    assert plan_status(db_engine, plan_id) == "released"


def test_plan_book_mismatch_is_422(client, auth, db_engine):
    plan_id = plan(client, auth["A"], book=1)
    response = start(client, auth["A"], book=0, plan_id=plan_id)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR" and response.json()["error"]["detail"] == "plan_id"
    assert rows(db_engine) == []
    assert plan_status(db_engine, plan_id) == "planned"


def test_unknown_book_is_404_detail_isbn13(client, auth, db_engine):
    class NoBook:
        def lookup_isbn(self, isbn13):
            return None

    client.app.state.provider_engine = pe.ProviderEngine(
        db_engine, pe.Providers(books=NoBook(), library_data=None), now_fn=lambda: NOW)
    response = start(client, auth["A"], book=9)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND" and response.json()["error"]["detail"] == "isbn13"
    assert rows(db_engine) == []


def test_unknown_library_is_404_detail_library_id(client, auth, db_engine):
    response = start(client, auth["A"], library_id=999999)
    assert response.status_code == 404
    assert response.json()["error"] == {"code": "NOT_FOUND", "message": "찾을 수 없어요.", "detail": "library_id"}
    assert rows(db_engine) == []


def test_invalid_cursor_is_422_detail_cursor(client, auth):
    for bad in ("bad!", "eyJkIjoxfQ", "bm90LWpzb24"):  # 깨진 base64url / {"d":1} / not-json
        response = client.get(URL, headers=auth["A"], params={"cursor": bad})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
        assert response.json()["error"]["detail"] == "cursor"


def test_list_dday_and_overdue(client, auth, db_engine, books):
    yesterday = insert_loan(db_engine, USER_A_ID, books[0].id, TODAY - timedelta(days=1))
    today = insert_loan(db_engine, USER_A_ID, books[1].id, TODAY)
    plus3 = insert_loan(db_engine, USER_A_ID, books[2].id, TODAY + timedelta(days=3))
    body = client.get(URL, headers=auth["A"]).json()
    assert body["today"] == "2026-11-16"
    assert body["next_cursor"] is None
    got = [(x["id"], x["d_day"], x["is_overdue"]) for x in body["items"]]
    assert got == [(yesterday, -1, True), (today, 0, False), (plus3, 3, False)]
    assert body["items"][0]["library"] is None  # 도서관 없는 대출


def test_list_only_mine_sorted_by_due(client, auth, db_engine, books):
    later = insert_loan(db_engine, USER_A_ID, books[0].id, TODAY + timedelta(days=10))
    sooner = insert_loan(db_engine, USER_A_ID, books[1].id, TODAY + timedelta(days=2))
    insert_loan(db_engine, USER_B_ID, books[2].id, TODAY + timedelta(days=1))
    insert_loan(db_engine, USER_A_ID, books[2].id, TODAY - timedelta(days=3),
                status="returned", ret=TODAY - timedelta(days=1))
    items = client.get(URL, headers=auth["A"]).json()["items"]
    assert [x["id"] for x in items] == [sooner, later]
    returned = client.get(URL, headers=auth["A"], params={"status": "returned"}).json()["items"]
    assert len(returned) == 1
    assert returned[0]["status"] == "returned" and returned[0]["d_day"] == 0 and returned[0]["is_overdue"] is False
    assert client.get(URL, headers=auth["B"]).json()["items"][0]["id"] not in {later, sooner}


def test_loans_check_constraints(db_engine, books):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_A_ID})
    bad = [
        {"lo": TODAY, "due": TODAY - timedelta(days=1), "status": "on_loan", "ret": None},  # 날짜 역전
        {"lo": TODAY, "due": TODAY, "status": "returned", "ret": None},  # 반납인데 반납일 없음
        {"lo": TODAY, "due": TODAY, "status": "on_loan", "ret": TODAY},  # 대출 중인데 반납일 있음
        {"lo": TODAY, "due": TODAY, "status": "overdue", "ret": None},  # 없는 상태
    ]
    for values in bad:
        with pytest.raises(IntegrityError):
            with db_engine.begin() as conn:
                conn.execute(text(
                    "INSERT INTO loans (user_id, book_id, loaned_on, due_on, status, returned_on) "
                    "VALUES (:u, :b, :lo, :due, :status, :ret)"), {"u": USER_A_ID, "b": books[0].id, **values})
    assert rows(db_engine) == []


def test_start_while_withdrawing_is_403(client, auth, db_engine):
    """인증을 통과한 뒤 탈퇴가 먼저 잠그면, 쓰기 트랜잭션의 lock_active_user가 기다렸다가 403."""
    with db_engine.connect() as withdraw:
        tx = withdraw.begin()
        withdraw.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"), {"id": USER_A_ID})
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: start(client, auth["A"]))
            try:
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(text(
                            "SELECT count(*) > 0 FROM pg_stat_activity WHERE wait_event_type = 'Lock' "
                            "AND query LIKE 'SELECT status FROM users%FOR SHARE'")).scalar_one()
                        observer.rollback()  # pg_stat_activity는 트랜잭션마다 스냅숏이라 매번 새로 본다
                        if blocked:
                            break
                assert blocked, "빌렸어요 쓰기가 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            response = future.result(timeout=5)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    assert rows(db_engine) == []


def test_loans_rls_enabled(db_engine):
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname = 'loans'")).scalar_one()
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = 'loans'")).scalar_one() == 0


# ─────────── 그 밖의 C6 예외 ───────────


def test_requires_login(client, db_engine):
    assert client.get(URL).status_code == 401
    response = client.post(URL, json={"isbn13": isbn(0)})
    assert response.status_code == 401 and response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert rows(db_engine) == []


@pytest.mark.parametrize("body,field", [
    ({"isbn13": "9791111111111"}, "isbn13"),  # 검사 숫자 틀림
    ({"isbn13": "12345"}, "isbn13"),
    ({}, "isbn13"),
    ({"isbn13": isbn(0), "library_id": 0}, "library_id"),
    ({"isbn13": isbn(0), "library_id": "x"}, "library_id"),
    ({"isbn13": isbn(0), "plan_id": "not-a-uuid"}, "plan_id"),
])
def test_start_validation_is_422_no_row(client, auth, db_engine, body, field):
    response = client.post(URL, headers=auth["A"], json=body)
    assert response.status_code == 422 and response.json()["error"]["detail"] == field
    assert rows(db_engine) == []


@pytest.mark.parametrize("params,field", [
    ({"status": "overdue"}, "status"),
    ({"limit": 0}, "limit"),
    ({"limit": 101}, "limit"),
])
def test_list_validation_is_422(client, auth, params, field):
    response = client.get(URL, headers=auth["A"], params=params)
    assert response.status_code == 422 and response.json()["error"]["detail"] == field


def test_provider_failure_passes_through_no_row(client, auth, db_engine):
    response = start(client, auth["A"], book=9)  # 제공자 없음 + 캐시 없음
    assert response.status_code == 503 and response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert rows(db_engine) == []


def test_same_book_on_loan_with_plan_keeps_plan(client, auth, db_engine):
    """대출 중인 같은 책을 예정에서 다시 빌렸어요: 있는 대출 200, 예정은 바꾸지 않는다(C6 순서)."""
    existing = start(client, auth["A"]).json()["id"]
    plan_id = plan(client, auth["A"])
    response = start(client, auth["A"], plan_id=plan_id)
    assert response.status_code == 200 and response.json()["id"] == existing
    assert plan_status(db_engine, plan_id) == "planned"
    assert len(rows(db_engine)) == 1


def test_list_cursor_pages_without_dup(client, auth, db_engine, books):
    ids = [insert_loan(db_engine, USER_A_ID, b.id, TODAY + timedelta(days=5)) for b in books]  # 같은 예정일
    seen, cursor, pages = [], None, 0
    while True:
        params = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = client.get(URL, headers=auth["A"], params=params).json()
        seen += [x["id"] for x in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 2 and sorted(seen) == sorted(ids) and seen == sorted(seen)  # 같은 날이면 id 오름차순
