"""READ-2-P1: 내 독서 기록 기초 통계 #46 — reading-log 계약 READ-2 C1(R2-2~R2-4·R2-O3)·C3·P4·P5."""

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.common import KST, today_kst
from app.main import create_app
from app.routers import reading_logs as reading_logs_router
from app.services import provider_engine as pe
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

NOW = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
BOOK_PREFIX = "97955555"
URL = "/api/v1/me/reading-logs"
STATS = f"{URL}/stats"


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


class Clock:
    """서버 '오늘'(서울). 시험마다 바꿔 끼운다 — 기기 날짜가 아니라 이 값만 써야 한다."""

    now = datetime(2026, 11, 23, 3, 0, tzinfo=timezone.utc)  # 2026-11-23 12:00 KST


@pytest.fixture(autouse=True)
def fixed_server_today(monkeypatch):
    Clock.now = datetime(2026, 11, 23, 3, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(reading_logs_router, "today_kst", lambda: today_kst(Clock.now))


def clean(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("DELETE FROM reading_logs"))
        conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})


@pytest.fixture
def books(db_engine, public_reference_data):
    clean(db_engine)
    with db_engine.begin() as conn:
        rows = pe.upsert_books(conn, [
            pe.BookInfo(isbn(0), "첫 책", author="한강", cover_url=None, description="소개", pub_year=2014),
            pe.BookInfo(isbn(1), "둘째 책", author=None, cover_url=None, description="소개", pub_year=2021),
        ], "manual", NOW, overwrite=True)
    yield rows
    clean(db_engine)


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


def kst(y: int, m: int, d: int, hh: int = 12, mm: int = 0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=KST)


def insert_log(db_engine, books, user_id: str, *, library_id: int | None, read_on: date | None,
               created_at: datetime, book: int = 0) -> str:
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO reading_logs (user_id, book_id, library_id, read_on, client_request_id, created_at, updated_at) "
            "VALUES (:u, :b, :l, :r, :req, :c, :c) RETURNING id"),
            {"u": user_id, "b": books[book].id, "l": library_id, "r": read_on, "req": uuid4(), "c": created_at},
        ).scalar_one())


def log_count(db_engine) -> int:
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM reading_logs")).scalar_one()


def order_of(body: dict) -> list[int]:
    return [lib["library_id"] for lib in body["libraries"]]


# ─────────── P5 필수 시험 ───────────


def test_stats_are_zero_without_logs(client, auth):
    response = client.get(STATS, headers=auth["A"])
    assert response.status_code == 200
    assert response.json() == {"total": 0, "this_year": 0, "this_month": 0, "libraries": []}


def test_stats_count_only_own_logs_in_seoul_calendar(client, auth, db_engine, books):
    # 서버 오늘 = 2027-01-01 09:30 KST(UTC로는 아직 2027-01-01 00:30)
    Clock.now = datetime(2027, 1, 1, 0, 30, tzinfo=timezone.utc)
    # A 3개
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=None,
               created_at=kst(2026, 12, 31, 23, 30))          # 서울 12-31 → 작년
    insert_log(db_engine, books, USER_A_ID, library_id=101, read_on=None,
               created_at=kst(2027, 1, 1, 0, 30))              # 서울 01-01(UTC로는 12-31) → 올해·이번 달
    insert_log(db_engine, books, USER_A_ID, library_id=101, read_on=date(2026, 12, 20),
               created_at=kst(2027, 1, 1, 8, 0))               # 읽은 날이 우선 → 작년
    # B 5개(모두 이번 달) — A 숫자에 섞이면 안 된다
    for i in range(5):
        insert_log(db_engine, books, USER_B_ID, library_id=102, read_on=date(2027, 1, 1),
                   created_at=kst(2027, 1, 1, 1, i))

    a = client.get(STATS, headers=auth["A"]).json()
    assert (a["total"], a["this_year"], a["this_month"]) == (3, 1, 1)
    assert a["libraries"] == [{"library_id": 101, "name": "정독도서관", "count": 2, "last_read_on": "2027-01-01"}]

    # 올해와 이번 달이 따로 세어지는지(11월 23일 기준)
    Clock.now = datetime(2026, 11, 23, 3, 0, tzinfo=timezone.utc)
    clean_logs = "DELETE FROM reading_logs"
    with db_engine.begin() as conn:
        conn.execute(text(clean_logs))
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=date(2026, 11, 2), created_at=kst(2026, 11, 2))
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=date(2026, 3, 1), created_at=kst(2026, 3, 1))
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=date(2025, 11, 20), created_at=kst(2025, 11, 20))
    a = client.get(STATS, headers=auth["A"]).json()
    assert (a["total"], a["this_year"], a["this_month"]) == (3, 2, 1)
    b = client.get(STATS, headers=auth["B"]).json()
    assert (b["total"], b["this_year"], b["this_month"]) == (0, 0, 0)


def test_library_view_lists_only_libraries_with_logs(client, auth, db_engine, books):
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=date(2026, 11, 20), created_at=kst(2026, 11, 20))
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=date(2026, 11, 21), created_at=kst(2026, 11, 21))
    insert_log(db_engine, books, USER_A_ID, library_id=103, read_on=date(2026, 11, 1), created_at=kst(2026, 11, 1))
    body = client.get(STATS, headers=auth["A"]).json()
    assert body["total"] == 3
    assert body["libraries"] == [{"library_id": 103, "name": "남산도서관", "count": 1, "last_read_on": "2026-11-01"}]
    assert all(lib["library_id"] is not None for lib in body["libraries"])


def test_stats_require_auth(client, auth, db_engine, books):
    insert_log(db_engine, books, USER_A_ID, library_id=101, read_on=date(2026, 11, 20), created_at=kst(2026, 11, 20))
    before = log_count(db_engine)
    response = client.get(STATS)
    assert response.status_code == 401
    assert "total" not in response.text
    assert log_count(db_engine) == before
    assert client.get(STATS, headers=auth["A"]).json()["total"] == 1


def test_library_list_pins_only_the_latest_library_before_count_order(client, auth, db_engine, books):
    plan = {101: (5, date(2026, 11, 19)), 102: (2, date(2026, 11, 22)), 103: (1, date(2026, 11, 21)),
            104: (5, date(2026, 11, 20))}
    for lib, (n, last) in plan.items():
        for i in range(n):  # 마지막 읽은 날 하나 + 그보다 이전 날들
            day = last - timedelta(days=i * 3)
            insert_log(db_engine, books, USER_A_ID, library_id=lib, read_on=day, created_at=kst(2026, 11, 23, 1, i))
    insert_log(db_engine, books, USER_A_ID, library_id=None, read_on=date(2026, 11, 23), created_at=kst(2026, 11, 23))
    # B가 103에 많이 읽어도 A 순서·권수는 그대로
    for i in range(9):
        insert_log(db_engine, books, USER_B_ID, library_id=103, read_on=date(2026, 11, 23), created_at=kst(2026, 11, 23, 2, i))

    body = client.get(STATS, headers=auth["A"]).json()
    assert order_of(body) == [102, 101, 104, 103]
    assert len(set(order_of(body))) == 4
    assert {lib["library_id"]: lib["count"] for lib in body["libraries"]} == {101: 5, 102: 2, 103: 1, 104: 5}
    assert body["libraries"][0]["last_read_on"] == "2026-11-22"
    assert body["total"] == 14


def test_latest_library_handles_seoul_fallback_and_same_day_ties(client, auth, db_engine, books):
    day = date(2026, 11, 22)
    insert_log(db_engine, books, USER_A_ID, library_id=101, read_on=date(2026, 11, 10), created_at=kst(2026, 11, 10))
    late_101 = insert_log(db_engine, books, USER_A_ID, library_id=101, read_on=day, created_at=kst(2026, 11, 22, 20))
    insert_log(db_engine, books, USER_A_ID, library_id=102, read_on=day, created_at=kst(2026, 11, 22, 9))
    insert_log(db_engine, books, USER_A_ID, library_id=103, read_on=day, created_at=kst(2026, 11, 22, 9))
    # 102에 뒤늦게 입력한 과거 기록: 입력 시각은 가장 늦지만 읽은 날은 11-01 → 첫 줄을 가져가면 안 된다
    insert_log(db_engine, books, USER_A_ID, library_id=102, read_on=date(2026, 11, 1), created_at=kst(2026, 11, 23, 0, 10))

    first = client.get(STATS, headers=auth["A"]).json()
    assert order_of(first)[0] == 101
    assert first["libraries"][0]["last_read_on"] == "2026-11-22"

    # 서울 11-23 00:30(UTC로는 11-22 15:30)에 만든 읽은 날 없는 기록
    fresh = insert_log(db_engine, books, USER_A_ID, library_id=102, read_on=None,
                       created_at=datetime(2026, 11, 22, 15, 30, tzinfo=timezone.utc))
    second = client.get(STATS, headers=auth["A"]).json()
    assert order_of(second)[0] == 102
    assert second["libraries"][0]["last_read_on"] == "2026-11-23"

    assert client.delete(f"{URL}/{fresh}", headers=auth["A"]).status_code == 204
    third = client.get(STATS, headers=auth["A"]).json()
    assert order_of(third)[0] == 101

    assert client.delete(f"{URL}/{late_101}", headers=auth["A"]).status_code == 204
    fourth = client.get(STATS, headers=auth["A"]).json()
    assert order_of(fourth)[0] == 102  # 102·103 날짜·시각이 같으면 id가 작은 쪽
    assert fourth["libraries"][0]["last_read_on"] == "2026-11-22"
    # 둘째 줄부터는 권수 순: 102를 뺀 101(1)·103(1) → id 순
    assert order_of(fourth)[1:] == [101, 103]

    # 같은 날 읽었으면 그 날짜 기록을 더 늦게 남긴 도서관이 먼저(id가 큰 103이라도)
    insert_log(db_engine, books, USER_A_ID, library_id=103, read_on=day, created_at=kst(2026, 11, 22, 23))
    fifth = client.get(STATS, headers=auth["A"]).json()
    assert order_of(fifth)[0] == 103
    assert order_of(fifth)[1:] == [102, 101]  # 103을 뺀 102(2)·101(1) 권수 순
