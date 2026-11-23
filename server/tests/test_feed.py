"""LOCAL-2-P1: 방문 페이지 피드(#26)·상세(#27)·같은 책 이어 읽기(#28) — local-feed 계약 LOCAL-2 C2·C3·C6·P5."""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.routers.feed import encode_cursor
from app.services import provider_engine as pe
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

LIB_1 = 101  # 정독도서관
LIB_2 = 102  # 종로도서관
T0 = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
BOOK_PREFIX = "97922222"
FEED_KEYS = {"id", "library_id", "library_name", "image_kind", "image_url", "image_color", "overlay_text",
             "book", "published_at", "my_reaction", "my_bookmark"}


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


@pytest.fixture
def books(db_engine, public_reference_data):
    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM posts"))
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})

    clean()
    with db_engine.begin() as conn:
        rows = pe.upsert_books(conn, [
            pe.BookInfo(isbn(0), "소년이 온다", author="한강", cover_url="https://img.test/c0.jpg",
                        description="소개", pub_year=2014),
            pe.BookInfo(isbn(1), "다른 책", author=None, cover_url=None, description="소개", pub_year=2020),
        ], "manual", T0, overwrite=True)
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


def book_id(db_engine, isbn13: str) -> int:
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT id FROM books WHERE isbn13 = :i"), {"i": isbn13}).scalar_one()


def seed(db_engine, *, library_id: int = LIB_1, at: datetime = T0, status: str = "published",
         user_id: str = USER_B_ID, book: str | None = None, overlay: str | None = "글자") -> str:
    """게시물을 직접 넣는다(시각 고정). 반환: id 문자열."""
    bid = book_id(db_engine, book) if book else None
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, book_id, image_kind, image_value, overlay_text, body, "
            "status, client_request_id, published_at) VALUES (:u, :l, :b, 'color', 'fill2', :o, '본문', :s, "
            ":r, :at) RETURNING id"),
            {"u": user_id, "l": library_id, "b": bid, "o": overlay, "s": status, "r": uuid4(), "at": at},
        ).scalar_one())


def react(db_engine, post_id: str, user_id: str) -> None:
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO post_reactions (post_id, user_id) VALUES (:p, :u)"),
                     {"p": post_id, "u": user_id})


def feed(client, library_id: int = LIB_1, headers=None, **params):
    return client.get(f"/api/v1/libraries/{library_id}/posts", params=params, headers=headers or {})


@pytest.fixture
def regional_libraries(db_engine, public_reference_data):
    with db_engine.begin() as conn:
        previous = conn.execute(text(
            "SELECT id, dtl_region_code, region_code FROM libraries WHERE id BETWEEN 101 AND 105"
        )).mappings().all()
        conn.execute(text("""
            UPDATE libraries AS l SET dtl_region_code = r.district, region_code = r.province
            FROM (VALUES (101, '31010', '31'), (102, '31010', '31'), (103, '31020', '31'),
                         (104, '31010', '31'), (105, '32010', '32')) AS r(id, district, province)
            WHERE l.id = r.id
        """))
    yield
    with db_engine.begin() as conn:
        conn.execute(text("""
            UPDATE libraries SET dtl_region_code = :dtl_region_code, region_code = :region_code WHERE id = :id
        """), previous)


def test_region_feed_orders_scopes_and_keeps_flags(client, auth, db_engine, regional_libraries):
    own = seed(db_engine)
    district = [seed(db_engine, library_id=lib) for lib in (102, 104)]
    newer_province = [seed(db_engine, library_id=103, at=T0 + timedelta(days=1)) for _ in range(2)]
    older_province = [seed(db_engine, library_id=103, at=T0 - timedelta(days=1)) for _ in range(2)]
    seed(db_engine, library_id=105, at=T0 + timedelta(days=2))
    seed(db_engine, library_id=102, at=T0 + timedelta(days=2), status="hidden")
    seed(db_engine, library_id=103, at=T0 + timedelta(days=2), status="withdrawn")
    saved = max(newer_province)
    react(db_engine, saved, USER_A_ID)
    react(db_engine, district[0], USER_B_ID)
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO post_bookmarks (post_id, user_id) VALUES (:p, :u)"), {"p": saved, "u": USER_A_ID})

    signed_in = feed(client, headers=auth["A"], expand="region", cursor="")
    assert signed_in.status_code == 200, signed_in.text
    body = signed_in.json()
    assert [p["id"] for p in body["items"]] == [
        own, *sorted(district, reverse=True), *sorted(newer_province, reverse=True), max(older_province),
    ]
    assert body["next_cursor"] is None
    assert all(set(p) == FEED_KEYS for p in body["items"])
    assert [p["id"] for p in body["items"] if p["my_reaction"]] == [saved]
    assert [p["id"] for p in body["items"] if p["my_bookmark"]] == [saved]
    guest = feed(client, expand="region").json()
    assert [p["id"] for p in guest["items"]] == [p["id"] for p in body["items"]]
    assert all(not p["my_reaction"] and not p["my_bookmark"] for p in guest["items"])
    assert [p["id"] for p in feed(client).json()["items"]] == [own]
    assert [p["id"] for p in feed(client, expand="region", limit=2).json()["items"]] == [own, max(district)]


@pytest.mark.parametrize(
    "district,province,expected", [(None, "31", [103, 102]), ("31010", "", [102]), ("", None, [])]
)
def test_region_feed_skips_each_missing_code(client, auth, db_engine, regional_libraries, district, province, expected):
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE libraries SET dtl_region_code = :d, region_code = :p WHERE id = 101"),
                     {"d": district, "p": province})
        conn.execute(text("UPDATE libraries SET dtl_region_code = '', region_code = '' WHERE id = 105"))
    seed(db_engine, library_id=102)
    seed(db_engine, library_id=103, at=T0 + timedelta(days=1))
    seed(db_engine, library_id=105, at=T0 + timedelta(days=2))
    result = feed(client, expand="region")
    assert result.status_code == 200, result.text
    assert [p["library_id"] for p in result.json()["items"]] == expected
    assert result.json()["next_cursor"] is None


def test_region_feed_uses_own_page_and_cursor(client, auth, db_engine, regional_libraries):
    own = sorted([seed(db_engine) for _ in range(8)], reverse=True)
    seed(db_engine, library_id=102, at=T0 + timedelta(days=1))

    assert [p["id"] for p in feed(client, expand="region").json()["items"]] == own
    first = feed(client, expand="region", limit=6).json()
    assert [p["id"] for p in first["items"]] == own[:6]
    cursor = first["next_cursor"]
    assert cursor == encode_cursor(T0, UUID(own[5]))
    second = feed(client, cursor=cursor).json()
    assert second["next_cursor"] is None
    assert [p["id"] for p in second["items"]] == own[6:]
    for params, detail in [
        ({"cursor": cursor, "expand": "region"}, "expand"),
        ({"expand": "district"}, "expand"),
        ({"expand": ""}, "expand"),
        ({"cursor": "broken", "expand": "region"}, "cursor"),
    ]:
        invalid = feed(client, **params)
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
        assert invalid.json()["error"]["detail"] == detail
    assert feed(client, library_id=987654, expand="region").status_code == 404
    assert feed(client, headers={"Authorization": "Bearer x"}, expand="region").status_code == 401


# ─────────── #26 ───────────


def test_feed_latest_only_published(client, auth, db_engine):
    p1 = seed(db_engine, at=T0)
    p2 = seed(db_engine, at=T0 + timedelta(minutes=1))
    seed(db_engine, at=T0 + timedelta(minutes=2), status="withdrawn")
    seed(db_engine, at=T0 + timedelta(minutes=3), status="hidden")
    p3 = seed(db_engine, at=T0 + timedelta(minutes=4))
    seed(db_engine, library_id=LIB_2, at=T0 + timedelta(minutes=5))  # 다른 도서관
    response = feed(client)
    assert response.status_code == 200
    body = response.json()
    assert [i["id"] for i in body["items"]] == [p3, p2, p1]
    assert body["next_cursor"] is None
    assert body["items"][0]["published_at"].endswith("+09:00")
    assert body["items"][0]["library_name"] == "정독도서관"


def test_feed_cursor_no_dup_no_gap_on_ties(client, auth, db_engine):
    ids = {seed(db_engine, at=T0) for _ in range(5)}
    seen: list[str] = []
    cursor = None
    for _ in range(10):
        params = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        body = feed(client, **params).json()
        seen += [i["id"] for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == 5 and set(seen) == ids
    assert seen == sorted(seen, reverse=True)  # 같은 시각이면 id 내림차순


def test_feed_popular_sort_is_422(client):
    response = feed(client, sort="popular")
    assert response.status_code == 422
    assert response.json()["error"] == {"code": "VALIDATION_ERROR", "message": "요청 형식이 올바르지 않아요.",
                                         "detail": "sort"}


@pytest.mark.parametrize("params,field", [
    ({"cursor": "깨진값"}, "cursor"),
    ({"cursor": "bm90LWEtY3Vyc29y"}, "cursor"),  # "not-a-cursor"
    ({"limit": 0}, "limit"),
    ({"limit": 51}, "limit"),
])
def test_feed_bad_params_are_422(client, params, field):
    response = feed(client, **params)
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == field


def test_feed_unknown_library_is_404(client):
    response = feed(client, library_id=999999)
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"


def test_feed_item_has_no_author_or_count(client, auth, db_engine):
    post_id = seed(db_engine, book=isbn(0))
    react(db_engine, post_id, USER_A_ID)
    item = feed(client).json()["items"][0]
    assert set(item) == FEED_KEYS
    for key in ("author", "reaction_count", "user_id", "body", "nickname", "is_mine"):
        assert key not in item
    assert item["book"] == {"isbn13": isbn(0), "title": "소년이 온다", "author": "한강"}
    assert item["image_color"] == "fill2" and item["image_url"] is None
    assert item["overlay_text"] == "글자"


def test_feed_my_flags_signed_in_and_out(client, auth, db_engine):
    reacted = seed(db_engine, at=T0 + timedelta(minutes=1))
    other = seed(db_engine, at=T0)
    react(db_engine, reacted, USER_A_ID)
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO post_bookmarks (user_id, post_id) VALUES (:u, :p)"),
                     {"u": USER_A_ID, "p": other})
    signed_in = {i["id"]: i for i in feed(client, headers=auth["A"]).json()["items"]}
    assert (signed_in[reacted]["my_reaction"], signed_in[reacted]["my_bookmark"]) == (True, False)
    assert (signed_in[other]["my_reaction"], signed_in[other]["my_bookmark"]) == (False, True)
    as_b = feed(client, headers=auth["B"]).json()["items"]
    assert all(not i["my_reaction"] and not i["my_bookmark"] for i in as_b)
    signed_out = feed(client).json()["items"]
    assert all(not i["my_reaction"] and not i["my_bookmark"] for i in signed_out)


def test_bad_token_on_optional_endpoint_is_401(client, auth, db_engine):
    seed(db_engine)
    response = feed(client, headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert client.get(f"/api/v1/posts/{uuid4()}", headers={"Authorization": "Bearer x"}).status_code == 401


# ─────────── #27 ───────────


def test_detail_returns_post_with_count_and_flags(client, auth, db_engine):
    post_id = seed(db_engine, book=isbn(0), user_id=USER_A_ID)
    react(db_engine, post_id, USER_A_ID)
    react(db_engine, post_id, USER_B_ID)
    mine = client.get(f"/api/v1/posts/{post_id}", headers=auth["A"]).json()
    assert mine["id"] == post_id and mine["is_mine"] is True
    assert mine["reaction_count"] == 2 and mine["my_reaction"] is True and mine["my_bookmark"] is False
    assert mine["library"] == {"id": LIB_1, "name": "정독도서관"}
    assert mine["book"]["isbn13"] == isbn(0) and mine["body"] == "본문"
    assert "user_id" not in mine
    anon = client.get(f"/api/v1/posts/{post_id}").json()
    assert anon["is_mine"] is False and anon["my_reaction"] is False and anon["reaction_count"] == 2


@pytest.mark.parametrize("status", ["withdrawn", "hidden"])
def test_detail_withdrawn_is_post_not_available(client, auth, db_engine, status):
    post_id = seed(db_engine, status=status, user_id=USER_A_ID)
    for headers in ({}, auth["A"]):  # 작성자 본인도 같은 404
        response = client.get(f"/api/v1/posts/{post_id}", headers=headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "POST_NOT_AVAILABLE"
        assert "본문" not in response.text


def test_detail_unknown_is_not_found(client):
    response = client.get(f"/api/v1/posts/{uuid4()}")
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    bad = client.get("/api/v1/posts/not-a-uuid")
    assert bad.status_code == 422 and bad.json()["error"]["detail"] == "post_id"


# ─────────── #28 ───────────


def test_same_book_posts_cross_library_exclude(client, auth, db_engine):
    a = seed(db_engine, library_id=LIB_1, book=isbn(0), at=T0)
    b = seed(db_engine, library_id=LIB_2, book=isbn(0), at=T0 + timedelta(minutes=1))
    c = seed(db_engine, library_id=LIB_1, book=isbn(0), at=T0 + timedelta(minutes=2))
    seed(db_engine, library_id=LIB_1, book=isbn(0), at=T0 + timedelta(minutes=3), status="withdrawn")
    seed(db_engine, library_id=LIB_1, book=isbn(1), at=T0 + timedelta(minutes=4))  # 다른 책
    seed(db_engine, library_id=LIB_1, at=T0 + timedelta(minutes=5))  # 책 없음
    response = client.get(f"/api/v1/books/{isbn(0)}/posts", params={"exclude": c})
    assert response.status_code == 200
    items = response.json()["items"]
    assert [i["id"] for i in items] == [b, a]
    assert {i["library_name"] for i in items} == {"정독도서관", "종로도서관"}


def test_same_book_posts_paginates_and_validates(client, auth, db_engine):
    ids = [seed(db_engine, book=isbn(0), at=T0 + timedelta(minutes=i)) for i in range(3)]
    first = client.get(f"/api/v1/books/{isbn(0)}/posts", params={"limit": 2}).json()
    assert [i["id"] for i in first["items"]] == [ids[2], ids[1]] and first["next_cursor"]
    second = client.get(f"/api/v1/books/{isbn(0)}/posts",
                        params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert [i["id"] for i in second["items"]] == [ids[0]] and second["next_cursor"] is None
    assert client.get("/api/v1/books/9780000000000/posts").json()["error"]["detail"] == "isbn13"
    assert client.get(f"/api/v1/books/{isbn(0)}/posts", params={"exclude": "x"}).json()["error"]["detail"] == "exclude"
    unknown = client.get(f"/api/v1/books/{isbn(9)}/posts")
    assert unknown.status_code == 200 and unknown.json() == {"items": [], "next_cursor": None}


def test_cursor_round_trip_is_opaque():
    cursor = encode_cursor(T0, UUID(int=1))
    assert "|" not in cursor and "=" not in cursor
