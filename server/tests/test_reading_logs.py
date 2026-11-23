"""READ-1-P1: 내 독서 기록 #41~#45 — reading-log 계약 READ-1 C2·C3·C5·C6·P5."""

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.common import today_kst
from app.main import create_app
from app.routers import reading_logs as reading_logs_router
from app.services import provider_engine as pe
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import FakeBookSearch, public_reference_data  # noqa: F401  (픽스처)

NOW = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
# 2026-11-19 23:30 KST — 서울로는 19일, UTC로는 아직 14:30
SERVER_NOW = datetime(2026, 11, 19, 14, 30, tzinfo=timezone.utc)
TODAY = date(2026, 11, 19)
BOOK_PREFIX = "97944444"
URL = "/api/v1/me/reading-logs"
LOG_KEYS = {"id", "book", "library", "read_on", "note", "quote", "loan_id", "published_post_id",
            "created_at", "updated_at"}


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


@pytest.fixture(autouse=True)
def fixed_server_today(monkeypatch):
    """서버 시계를 2026-11-19 23:30 KST로 고정한다(기기 날짜가 아니라 이 값만 써야 한다)."""
    monkeypatch.setattr(reading_logs_router, "today_kst", lambda: today_kst(SERVER_NOW))


def clean(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("DELETE FROM reading_logs"))
        conn.execute(text("DELETE FROM loans"))
        conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})


@pytest.fixture
def books(db_engine, public_reference_data):
    """설명·연도를 채운 책 3권(조회 엔진이 외부 제공자를 부르지 않게)."""
    clean(db_engine)
    with db_engine.begin() as conn:
        rows = pe.upsert_books(conn, [
            pe.BookInfo(isbn(0), "소년이 온다", author="한강", cover_url="https://img.test/r0.jpg",
                        description="소개", pub_year=2014),
            pe.BookInfo(isbn(1), "표지 없는 책", author=None, cover_url=None, description="소개", pub_year=2021),
            pe.BookInfo(isbn(2), "세 번째 책", author="김작가", cover_url=None, description="소개", pub_year=2022),
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


def create(client, headers, book: int = 0, **extra):
    body = {"isbn13": isbn(book), "client_request_id": str(uuid4()), **extra}
    return client.post(URL, headers=headers, json=body)


def log_rows(db_engine, where: str = "TRUE", **params) -> list:
    with db_engine.connect() as conn:
        return conn.execute(text(f"SELECT * FROM reading_logs WHERE {where}"), params).all()


def insert_loan(db_engine, user_id: str, book_id: int, loaned_on: date, library_id: int | None = 101) -> str:
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO loans (user_id, book_id, library_id, loaned_on, due_on) "
            "VALUES (:u, :b, :l, :lo, :due) RETURNING id"),
            {"u": user_id, "b": book_id, "l": library_id, "lo": loaned_on, "due": loaned_on + timedelta(days=14)},
        ).scalar_one())


# ─────────── P5 필수 시험 ───────────


def test_reading_logs_are_owner_only_with_same_404(client, auth, db_engine):
    mine = create(client, auth["A"], note="내 감상", library_id=101).json()
    before = log_rows(db_engine)
    missing = str(uuid4())
    for log_id in (mine["id"], missing):
        got = client.get(f"{URL}/{log_id}", headers=auth["B"])
        patched = client.patch(f"{URL}/{log_id}", headers=auth["B"], json={"note": "남이 고침"})
        deleted = client.delete(f"{URL}/{log_id}", headers=auth["B"])
        for response in (got, patched, deleted):
            assert response.status_code == 404
            assert response.json()["error"]["code"] == "NOT_FOUND"
    # 남의 것과 없는 것은 같은 응답
    assert client.get(f"{URL}/{mine['id']}", headers=auth["B"]).json() == \
        client.get(f"{URL}/{missing}", headers=auth["B"]).json()
    assert log_rows(db_engine) == before
    assert client.get(URL, headers=auth["B"]).json()["items"] == []
    assert client.get(f"{URL}/{mine['id']}", headers=auth["A"]).json()["note"] == "내 감상"


def test_create_is_idempotent_by_client_request_id(client, auth, db_engine):
    request_id = str(uuid4())
    first = create(client, auth["A"], note="처음", client_request_id=request_id)
    second = create(client, auth["A"], note="두 번째", client_request_id=request_id)
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["note"] == "처음"
    assert len(log_rows(db_engine)) == 1
    # 다른 사람이 같은 요청 id를 써도 남의 기록을 돌려받지 않는다
    other = create(client, auth["B"], client_request_id=request_id)
    assert other.status_code == 201 and other.json()["id"] != first.json()["id"]


def test_create_returns_contract_shape(client, auth):
    response = create(client, auth["A"], library_id=101, read_on="2026-11-15", note="  오래 남는 책 ",
                      quote="마음에 남은 문장", user_id=USER_B_ID)
    assert response.status_code == 201
    log = response.json()
    assert set(log) == LOG_KEYS
    assert log["book"] == {"isbn13": isbn(0), "title": "소년이 온다", "author": "한강",
                           "cover_url": "https://img.test/r0.jpg"}
    assert log["library"] == {"id": 101, "name": "정독도서관"}
    assert log["read_on"] == "2026-11-15" and log["note"] == "오래 남는 책"
    assert log["loan_id"] is None and log["published_post_id"] is None
    assert log["created_at"].endswith("+09:00") and log["updated_at"].endswith("+09:00")


def test_log_without_library_stays_null(client, auth):
    loose = create(client, auth["A"], book=0).json()
    at_101 = create(client, auth["A"], book=1, library_id=101).json()
    assert loose["library"] is None
    filtered = client.get(URL, headers=auth["A"], params={"library_id": 101}).json()["items"]
    assert [i["id"] for i in filtered] == [at_101["id"]]
    everything = client.get(URL, headers=auth["A"]).json()["items"]
    assert {i["id"] for i in everything} == {loose["id"], at_101["id"]}


def test_linking_other_users_loan_is_404(client, auth, db_engine, books):
    b_loan = insert_loan(db_engine, USER_B_ID, books[0].id, date(2026, 11, 3))
    response = create(client, auth["A"], loan_id=b_loan)
    assert response.status_code == 404
    assert response.json()["error"] == {"code": "NOT_FOUND", "message": "찾을 수 없어요.", "detail": "loan_id"}
    assert log_rows(db_engine) == []
    # 고치기로도 남의 대출을 붙일 수 없다
    mine = create(client, auth["A"]).json()
    patched = client.patch(f"{URL}/{mine['id']}", headers=auth["A"], json={"loan_id": b_loan})
    assert patched.status_code == 404
    assert log_rows(db_engine)[0].loan_id is None


def test_own_loan_link_is_saved_and_not_automatic(client, auth, db_engine, books):
    a_loan = insert_loan(db_engine, USER_A_ID, books[0].id, date(2026, 11, 3), library_id=102)
    unlinked = create(client, auth["A"], book=0).json()
    assert unlinked["loan_id"] is None and unlinked["library"] is None  # 같은 책 대출이 있어도 자동 연결 없음(R1-4)
    linked = create(client, auth["A"], book=0, loan_id=a_loan).json()
    assert linked["loan_id"] == a_loan and linked["library"] is None  # 도서관은 앱이 채워 보낸다


def test_patch_keeps_unsent_fields_and_cannot_change_book(client, auth, db_engine):
    log = create(client, auth["A"], library_id=101, read_on="2026-11-10", note="처음", quote="문장").json()
    patched = client.patch(f"{URL}/{log['id']}", headers=auth["A"], json={"note": "x", "isbn13": isbn(1)})
    assert patched.status_code == 200
    body = patched.json()
    assert body["note"] == "x"
    assert body["book"]["isbn13"] == isbn(0)
    assert body["library"] == {"id": 101, "name": "정독도서관"}
    assert body["read_on"] == "2026-11-10" and body["quote"] == "문장"
    # null을 보내면 그 칸만 비운다
    cleared = client.patch(f"{URL}/{log['id']}", headers=auth["A"], json={"library_id": None}).json()
    assert cleared["library"] is None and cleared["note"] == "x"


def test_delete_keeps_published_post(client, auth, db_engine, books):
    log = create(client, auth["A"], library_id=101).json()
    # LOCAL-3 전이면 posts.reading_log_id를 LOCAL-3 C5 그대로 잠시 만든다
    with db_engine.begin() as conn:
        added = conn.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'reading_log_id'"
        )).first() is None
        if added:
            conn.execute(text("ALTER TABLE posts ADD COLUMN reading_log_id uuid NULL "
                              "REFERENCES reading_logs(id) ON DELETE SET NULL"))
    try:
        with db_engine.begin() as conn:
            post_id = conn.execute(text(
                "INSERT INTO posts (user_id, library_id, book_id, image_kind, image_value, overlay_text, body, "
                "status, client_request_id, reading_log_id) VALUES (:u, 101, :b, 'color', 'fill2', '글자', "
                "'본문', 'published', :r, :log) RETURNING id"),
                {"u": USER_A_ID, "b": books[0].id, "r": uuid4(), "log": log["id"]}).scalar_one()
        response = client.delete(f"{URL}/{log['id']}", headers=auth["A"])
        assert response.status_code == 204
        assert log_rows(db_engine) == []
        with db_engine.connect() as conn:
            post = conn.execute(text("SELECT status, reading_log_id FROM posts WHERE id = :id"),
                                {"id": post_id}).one()
        assert post.status == "published" and post.reading_log_id is None
        again = client.delete(f"{URL}/{log['id']}", headers=auth["A"])
        assert again.status_code == 404
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM posts WHERE user_id = :u"), {"u": USER_A_ID})
            if added:
                conn.execute(text("ALTER TABLE posts DROP COLUMN reading_log_id"))


def test_reading_log_endpoints_require_auth(client, auth):
    log_id = create(client, auth["A"]).json()["id"]
    calls = [
        client.get(URL),
        client.get(f"{URL}/{log_id}"),
        client.post(URL, json={"isbn13": isbn(0), "client_request_id": str(uuid4())}),
        client.delete(f"{URL}/{log_id}"),
        client.patch(f"{URL}/{log_id}", json={"note": "x"}),
    ]
    for response in calls:
        assert response.status_code == 401
    assert client.get(f"{URL}/{log_id}", headers=auth["A"]).status_code == 200


def test_future_read_date_is_rejected(client, auth, db_engine):
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    response = create(client, auth["A"], read_on=tomorrow)
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == "read_on"
    assert log_rows(db_engine) == []
    # 서울 오늘(UTC로는 전날 밤이어도)은 된다
    assert create(client, auth["A"], read_on=TODAY.isoformat()).status_code == 201
    log_id = log_rows(db_engine)[0].id
    patched = client.patch(f"{URL}/{log_id}", headers=auth["A"], json={"read_on": tomorrow})
    assert patched.status_code == 422 and patched.json()["error"]["detail"] == "read_on"
    assert log_rows(db_engine)[0].read_on == TODAY


def test_note_and_quote_length_limits_are_422(client, auth, db_engine):
    long_note = create(client, auth["A"], note="가" * 2001)
    long_quote = create(client, auth["A"], quote="나" * 301)
    assert long_note.status_code == 422 and long_note.json()["error"]["detail"] == "note"
    assert long_quote.status_code == 422 and long_quote.json()["error"]["detail"] == "quote"
    assert log_rows(db_engine) == []
    exact = create(client, auth["A"], note="가" * 2000, quote="나" * 300)
    assert exact.status_code == 201
    log_id = exact.json()["id"]
    patched = client.patch(f"{URL}/{log_id}", headers=auth["A"], json={"quote": "다" * 301})
    assert patched.status_code == 422 and patched.json()["error"]["detail"] == "quote"
    assert log_rows(db_engine)[0].quote == "나" * 300


def test_blank_note_is_stored_as_null(client, auth, db_engine):
    response = create(client, auth["A"], note="   ", quote="\n ")
    assert response.status_code == 201
    assert response.json()["note"] is None and response.json()["quote"] is None
    row = log_rows(db_engine)[0]
    assert row.note is None and row.quote is None


# ─────────── C6 나머지 ───────────


def test_list_order_and_cursor(client, auth):
    older = create(client, auth["A"], book=0, read_on="2026-11-01").json()
    newer = create(client, auth["A"], book=1, read_on="2026-11-18").json()
    no_date = create(client, auth["A"], book=2).json()  # 읽은 날이 없으면 쓴 날(오늘)로 책장에 꽂힌다
    first = client.get(URL, headers=auth["A"], params={"limit": 2}).json()
    assert [i["id"] for i in first["items"]] == [no_date["id"], newer["id"]]
    assert first["next_cursor"]
    second = client.get(URL, headers=auth["A"], params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert [i["id"] for i in second["items"]] == [older["id"]]
    assert second["next_cursor"] is None


def test_empty_list_and_bad_cursor(client, auth):
    assert client.get(URL, headers=auth["A"]).json() == {"items": [], "next_cursor": None}
    bad = client.get(URL, headers=auth["A"], params={"cursor": "깨진커서"})
    assert bad.status_code == 422 and bad.json()["error"]["detail"] == "cursor"
    assert client.get(URL, headers=auth["A"], params={"limit": 51}).status_code == 422


def test_unknown_library_is_422_and_unknown_book_is_422(client, auth, db_engine, test_db_url):
    response = create(client, auth["A"], library_id=999999)
    assert response.status_code == 422 and response.json()["error"]["detail"] == "library_id"
    bad_isbn = client.post(URL, headers=auth["A"], json={"isbn13": "123", "client_request_id": str(uuid4())})
    assert bad_isbn.status_code == 422 and bad_isbn.json()["error"]["detail"] == "isbn13"
    client.app.state.provider_engine = pe.ProviderEngine(db_engine, pe.Providers(books=FakeBookSearch([])))
    unknown = create(client, auth["A"], book=9)
    assert unknown.status_code == 422 and unknown.json()["error"]["detail"] == "isbn13"
    assert log_rows(db_engine) == []


def test_provider_failure_keeps_nothing(client, auth, db_engine):
    failing = FakeBookSearch(error=pe.ProviderError("down"))
    client.app.state.provider_engine = pe.ProviderEngine(db_engine, pe.Providers(books=failing))
    response = create(client, auth["A"], book=9, note="쓴 감상")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert log_rows(db_engine) == []


def test_book_not_in_db_is_fetched_once(client, auth, db_engine):
    fetched = pe.BookInfo(isbn(7), "새로 확보한 책", author="저자", cover_url=None, description="소개", pub_year=2020)
    fake = FakeBookSearch([fetched])
    client.app.state.provider_engine = pe.ProviderEngine(db_engine, pe.Providers(books=fake))
    response = create(client, auth["A"], book=7)
    assert response.status_code == 201
    assert response.json()["book"]["title"] == "새로 확보한 책"
    assert fake.calls == [("lookup", isbn(7))]
