"""LIB-3-P1: 빌릴 예정 목록(#16)·저장(#17)·해제(#18) — book-search 계약 LIB-3 C5·C6·P5."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from time import monotonic

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.services import provider_engine as pe
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

NOW = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
BOOK_PREFIX = "97922222"
URL = "/api/v1/me/loan-plans"


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


@pytest.fixture
def books(db_engine, public_reference_data):
    """설명·연도를 채운 책 2권(조회 엔진이 외부 제공자를 부르지 않게)."""

    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM loan_plans"))
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})

    clean()
    with db_engine.begin() as conn:
        rows = pe.upsert_books(conn, [
            pe.BookInfo(isbn(0), "편의점 책", author="김작가", cover_url="https://img.test/c0.jpg",
                        description="소개", pub_year=2020),
            pe.BookInfo(isbn(1), "표지 없는 책", author=None, cover_url=None, description="소개", pub_year=2021),
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


def save(client, headers, book: int = 0, library_id: int = 101, **extra):
    return client.post(URL, headers=headers, json={"isbn13": isbn(book), "library_id": library_id, **extra})


def rows(db_engine, where: str = "TRUE", **params) -> list:
    with db_engine.connect() as conn:
        return conn.execute(text(f"SELECT * FROM loan_plans WHERE {where}"), params).all()


def set_status(db_engine, plan_id: str, status: str) -> None:
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE loan_plans SET status = :s WHERE id = :id"), {"s": status, "id": plan_id})


def test_save_plan_then_list(client, auth):
    response = save(client, auth["A"])
    assert response.status_code == 201
    plan = response.json()
    assert set(plan) == {"id", "book", "library", "status", "created_at"}
    assert plan["book"] == {"isbn13": isbn(0), "title": "편의점 책", "author": "김작가",
                            "cover_url": "https://img.test/c0.jpg"}
    assert plan["library"] == {"id": 101, "name": "정독도서관", "area_label": "화동"}
    assert plan["status"] == "planned"
    assert plan["created_at"].endswith("+09:00")

    listed = client.get(URL, headers=auth["A"])
    assert listed.status_code == 200
    assert listed.json() == {"items": [plan], "next_cursor": None}


def test_save_same_plan_twice_one_row(client, auth, db_engine):
    first = save(client, auth["A"])
    second = save(client, auth["A"])
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    # 동시 연타
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: save(client, auth["A"], book=1), range(4)))
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201]
    assert len({r.json()["id"] for r in results}) == 1
    assert len(rows(db_engine, "status = 'planned'")) == 2


def test_same_book_other_library_is_separate(client, auth, db_engine):
    a = save(client, auth["A"], library_id=101)
    b = save(client, auth["A"], library_id=102)
    assert (a.status_code, b.status_code) == (201, 201)
    assert a.json()["id"] != b.json()["id"]
    assert len(rows(db_engine)) == 2


def test_release_then_save_again_creates_new(client, auth, db_engine):
    old = save(client, auth["A"]).json()["id"]
    assert client.delete(f"{URL}/{old}", headers=auth["A"]).status_code == 200
    again = save(client, auth["A"])
    assert again.status_code == 201 and again.json()["id"] != old
    assert len(rows(db_engine)) == 2
    assert len(rows(db_engine, "status = 'planned'")) == 1


def test_release_twice_is_200(client, auth, db_engine):
    plan_id = save(client, auth["A"]).json()["id"]
    for _ in range(2):
        response = client.delete(f"{URL}/{plan_id}", headers=auth["A"])
        assert response.status_code == 200
        assert response.json() == {"id": plan_id, "status": "released"}
    assert rows(db_engine)[0].status == "released"
    assert client.get(URL, headers=auth["A"]).json()["items"] == []
    released = client.get(URL, headers=auth["A"], params={"status": "released"}).json()["items"]
    assert [p["id"] for p in released] == [plan_id]


def test_release_other_users_plan_is_404_unchanged(client, auth, db_engine):
    plan_id = save(client, auth["B"]).json()["id"]
    response = client.delete(f"{URL}/{plan_id}", headers=auth["A"])
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    missing = client.delete(f"{URL}/00000000-0000-4000-8000-000000000999", headers=auth["A"])
    assert missing.status_code == 404 and missing.json() == response.json()  # 남의 것 = 없는 것
    assert rows(db_engine)[0].status == "planned"


def test_list_only_mine(client, auth):
    mine = save(client, auth["A"]).json()["id"]
    save(client, auth["B"], book=1)
    items = client.get(URL, headers=auth["A"]).json()["items"]
    assert [p["id"] for p in items] == [mine]


def test_release_converted_is_409(client, auth, db_engine):
    plan_id = save(client, auth["A"]).json()["id"]
    set_status(db_engine, plan_id, "converted")
    response = client.delete(f"{URL}/{plan_id}", headers=auth["A"])
    assert response.status_code == 409 and response.json()["error"]["code"] == "CONFLICT"
    assert rows(db_engine)[0].status == "converted"


def test_unknown_library_is_404_detail_library_id(client, auth, db_engine):
    response = save(client, auth["A"], library_id=999999)
    assert response.status_code == 404
    assert response.json()["error"] == {"code": "NOT_FOUND", "message": "찾을 수 없어요.", "detail": "library_id"}
    assert rows(db_engine) == []


def test_unknown_book_is_404_detail_isbn13(client, auth, db_engine):
    class NoBook:
        def lookup_isbn(self, isbn13):
            return None

    client.app.state.provider_engine = pe.ProviderEngine(
        db_engine, pe.Providers(books=NoBook(), library_data=None), now_fn=lambda: NOW)
    response = save(client, auth["A"], book=9)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND" and response.json()["error"]["detail"] == "isbn13"
    assert rows(db_engine) == []


def test_provider_failure_passes_through_no_row(client, auth, db_engine):
    """L3-#5: 책 조회 제공자 실패는 503 그대로(캐시 없음)."""
    response = save(client, auth["A"], book=9)  # 제공자 없음 + 캐시 없음
    assert response.status_code == 503 and response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert rows(db_engine) == []


def test_invalid_cursor_is_422_detail_cursor(client, auth):
    response = client.get(URL, headers=auth["A"], params={"cursor": "bad!"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR" and response.json()["error"]["detail"] == "cursor"


@pytest.mark.parametrize("params,field", [
    ({"status": "reserved"}, "status"),
    ({"limit": 0}, "limit"),
    ({"limit": 51}, "limit"),
])
def test_list_validation_is_422(client, auth, params, field):
    response = client.get(URL, headers=auth["A"], params=params)
    assert response.status_code == 422 and response.json()["error"]["detail"] == field


@pytest.mark.parametrize("body,field", [
    ({"isbn13": "9791111111111", "library_id": 101}, "isbn13"),  # 검사 숫자 틀림
    ({"isbn13": "12345", "library_id": 101}, "isbn13"),
    ({"library_id": 101}, "isbn13"),
    ({"isbn13": None, "library_id": 101}, "isbn13"),
    ({"library_id": "x"}, "isbn13,library_id"),
    # library_id 생략·null은 도서관 미지정 예정(LIB-3b U4) → test_loan_plans_unassigned.py
    ({"isbn13": isbn(0), "library_id": -1}, "library_id"),
    ({"isbn13": isbn(0), "library_id": 0}, "library_id"),
])
def test_save_validation_is_422_no_row(client, auth, db_engine, body, field):
    response = client.post(URL, headers=auth["A"], json=body)
    assert response.status_code == 422 and response.json()["error"]["detail"] == field
    assert rows(db_engine) == []


def test_release_invalid_plan_id_is_422(client, auth):
    response = client.delete(f"{URL}/not-a-uuid", headers=auth["A"])
    assert response.status_code == 422 and response.json()["error"]["detail"] == "plan_id"


def test_requires_login(client, db_engine, books):
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"isbn13": isbn(0), "library_id": 101}).status_code == 401
    assert client.delete(f"{URL}/00000000-0000-4000-8000-000000000999").status_code == 401
    assert rows(db_engine) == []


def test_body_user_id_ignored(client, auth, db_engine):
    response = save(client, auth["A"], user_id=USER_B_ID)
    assert response.status_code == 201
    assert str(rows(db_engine)[0].user_id) == USER_A_ID


def test_save_while_withdrawing_is_403_no_row(client, auth, db_engine):
    """인증을 통과한 뒤 탈퇴가 먼저 잠그면, 쓰기 트랜잭션의 lock_active_user가 기다렸다가 403."""
    with db_engine.connect() as withdraw:
        tx = withdraw.begin()
        withdraw.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"), {"id": USER_A_ID})
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: save(client, auth["A"]))
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
                assert blocked, "저장 쓰기가 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            response = future.result(timeout=5)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    assert rows(db_engine) == []


def test_list_cursor_no_dup_on_ties(client, auth, db_engine, books):
    with db_engine.begin() as conn:
        for library_id in (101, 102, 103, 104, 105):
            conn.execute(text(
                "INSERT INTO loan_plans (user_id, book_id, library_id, created_at) "
                "VALUES (:u, :b, :l, :at)"),
                {"u": USER_A_ID, "b": books[0].id, "l": library_id, "at": NOW})
    seen, cursor, pages = [], None, 0
    while True:
        params = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = client.get(URL, headers=auth["A"], params=params).json()
        seen += [p["id"] for p in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3 and len(seen) == 5 and len(set(seen)) == 5
    assert seen == sorted(seen, reverse=True)  # 같은 시각이면 id 내림차순


def test_list_newest_first(client, auth):
    first = save(client, auth["A"], book=0).json()["id"]
    second = save(client, auth["A"], book=1).json()["id"]
    assert [p["id"] for p in client.get(URL, headers=auth["A"]).json()["items"]] == [second, first]


def test_status_check_constraint(db_engine, books):
    from sqlalchemy.exc import IntegrityError

    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_A_ID})
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO loan_plans (user_id, book_id, library_id, status) VALUES (:u, :b, 101, 'reserved')"),
                {"u": USER_A_ID, "b": books[0].id})
    assert rows(db_engine) == []


def test_loan_plans_rls_enabled(db_engine):
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname = 'loan_plans'")).scalar_one()
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = 'loan_plans'")).scalar_one() == 0
