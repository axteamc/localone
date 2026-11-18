"""MY-1-P1: 내 프로필·내 게시물·좋아요·북마크 조회 — my-collection 계약 MY-1 C2·C3·C5·C6·P5."""

import base64
import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_feed import FEED_KEYS, T0, auth, books, client, seed  # noqa: F401  (픽스처·도우미)

PROFILE_KEYS = {"user_id", "nickname", "bio", "avatar_url", "updated_at"}
ITEM_KEYS = FEED_KEYS | {"item_kind", "collected_at"}
LISTS = ("posts", "reactions", "bookmarks")
ENDPOINTS = ("/api/v1/me/profile",) + tuple(f"/api/v1/me/{k}" for k in LISTS)
USER_C_ID = "00000000-0000-4000-8000-00000000000c"


def react(db_engine, post_id: str, user_id: str, at: datetime) -> None:
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO post_reactions (post_id, user_id, created_at) VALUES (:p, :u, :at)"),
                     {"p": post_id, "u": user_id, "at": at})


def bookmark(db_engine, post_id: str, user_id: str, at: datetime) -> None:
    """B #30과 같은 결과: 이미 있으면 saved_at만 새 시각으로(재저장 → 맨 앞)."""
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO post_bookmarks (user_id, post_id, saved_at) VALUES (:u, :p, :at) "
                          "ON CONFLICT (user_id, post_id) DO UPDATE SET saved_at = EXCLUDED.saved_at"),
                     {"p": post_id, "u": user_id, "at": at})


def set_status(db_engine, post_id: str, status: str) -> None:
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE posts SET status = :s WHERE id = :p"), {"s": status, "p": post_id})


def count(db_engine, table: str) -> int:
    with db_engine.connect() as conn:
        return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


def get(client, kind: str, headers, **params):
    return client.get(f"/api/v1/me/{kind}", params=params, headers=headers)


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [i["id"] for i in response.json()["items"]]


# ─────────── /me/profile ───────────


def test_me_profile_returns_own_profile_without_follower_or_email(client, auth, db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE user_profiles SET nickname = '책읽는 이웃', bio = '동네 도서관 산책을 좋아해요', "
                          "avatar_url = 'https://img.test/a.jpg' WHERE user_id = :u"), {"u": USER_A_ID})
        conn.execute(text("UPDATE user_profiles SET nickname = '다른 이웃' WHERE user_id = :u"), {"u": USER_B_ID})
    response = client.get("/api/v1/me/profile", headers=auth["A"])
    assert response.status_code == 200
    body = response.json()
    assert set(body) == PROFILE_KEYS  # follower_count·email 등 다른 키 없음(Y5)
    assert body["user_id"] == USER_A_ID
    assert body["nickname"] == "책읽는 이웃"
    assert body["bio"] == "동네 도서관 산책을 좋아해요"
    assert body["avatar_url"] == "https://img.test/a.jpg"
    assert body["updated_at"].endswith("+09:00")
    assert "follower_count" not in body and "email" not in body


def test_me_profile_fallback_when_profile_row_absent(client, make_token, db_engine):
    with db_engine.begin() as conn:  # users만 있고 user_profiles 행 없음
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": USER_C_ID})
    headers = {"Authorization": f"Bearer {make_token(sub=USER_C_ID)}"}
    response = client.get("/api/v1/me/profile", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == USER_C_ID
    assert body["nickname"] == "이웃"
    assert body["bio"] is None and body["avatar_url"] is None
    assert body["updated_at"].endswith("+09:00")
    assert count(db_engine, "user_profiles") == 0  # 조회는 프로필 행을 만들지 않음


# ─────────── /me/posts ───────────


def test_me_posts_returns_only_own_published_posts(client, auth, db_engine):
    a1 = seed(db_engine, user_id=USER_A_ID, at=T0)
    a2 = seed(db_engine, user_id=USER_A_ID, at=T0 + timedelta(minutes=2))
    seed(db_engine, user_id=USER_A_ID, at=T0 + timedelta(minutes=3), status="withdrawn")
    seed(db_engine, user_id=USER_A_ID, at=T0 + timedelta(minutes=4), status="hidden")
    seed(db_engine, user_id=USER_B_ID, at=T0 + timedelta(minutes=5))
    response = get(client, "posts", auth["A"])
    assert ids(response) == [a2, a1]
    items = response.json()["items"]
    assert response.json()["next_cursor"] is None
    for item in items:
        assert set(item) == ITEM_KEYS
        assert item["item_kind"] == "post"
        assert item["collected_at"] == item["published_at"]
        assert item["published_at"].endswith("+09:00")
        assert item["my_reaction"] is False and item["my_bookmark"] is False


# ─────────── /me/reactions · /me/bookmarks ───────────


def test_me_reactions_and_bookmarks_isolate_owner_and_order(client, auth, db_engine):
    # 게시 시각과 모은 시각 순서를 반대로 둬서 "모은 시각" 정렬을 확인한다
    p1 = seed(db_engine, at=T0 + timedelta(minutes=3))
    p2 = seed(db_engine, at=T0 + timedelta(minutes=2))
    p3 = seed(db_engine, at=T0 + timedelta(minutes=1))
    react(db_engine, p1, USER_A_ID, T0 + timedelta(hours=1))
    react(db_engine, p2, USER_A_ID, T0 + timedelta(hours=2))
    react(db_engine, p3, USER_B_ID, T0 + timedelta(hours=3))  # B 것은 A에게 안 보인다
    bookmark(db_engine, p1, USER_A_ID, T0 + timedelta(hours=1))
    bookmark(db_engine, p2, USER_A_ID, T0 + timedelta(hours=2))
    bookmark(db_engine, p3, USER_B_ID, T0 + timedelta(hours=3))
    bookmark(db_engine, p1, USER_A_ID, T0 + timedelta(hours=4))  # 재저장 → 맨 앞

    reactions = get(client, "reactions", auth["A"])
    assert ids(reactions) == [p2, p1]
    r_items = reactions.json()["items"]
    assert all(i["my_reaction"] is True for i in r_items)
    assert {i["id"]: i["my_bookmark"] for i in r_items} == {p1: True, p2: True}
    # T0 = 03:00Z → 공감 시각 T0+2h = 서울 14:00
    assert r_items[0]["collected_at"] == "2026-11-17T14:00:00+09:00"
    assert r_items[0]["published_at"] == "2026-11-17T12:02:00+09:00"

    bookmarks = get(client, "bookmarks", auth["A"])
    assert ids(bookmarks) == [p1, p2]
    b_items = bookmarks.json()["items"]
    assert all(i["my_bookmark"] is True for i in b_items)
    assert all(set(i) == ITEM_KEYS for i in b_items)

    assert ids(get(client, "reactions", auth["B"])) == [p3]
    assert ids(get(client, "bookmarks", auth["B"])) == [p3]


def test_me_collections_hide_withdrawn_and_restore_on_republish(client, auth, db_engine):
    p1 = seed(db_engine, at=T0)
    p2 = seed(db_engine, at=T0 + timedelta(minutes=1))
    p3 = seed(db_engine, at=T0 + timedelta(minutes=2))
    for i, p in enumerate((p1, p2, p3)):
        bookmark(db_engine, p, USER_A_ID, T0 + timedelta(hours=i + 1))
        react(db_engine, p, USER_A_ID, T0 + timedelta(hours=i + 1))
    set_status(db_engine, p2, "withdrawn")
    set_status(db_engine, p3, "hidden")
    assert ids(get(client, "bookmarks", auth["A"])) == [p1]
    assert ids(get(client, "reactions", auth["A"])) == [p1]
    assert count(db_engine, "post_bookmarks") == 3 and count(db_engine, "post_reactions") == 3  # 행은 유지
    set_status(db_engine, p2, "published")
    set_status(db_engine, p3, "published")
    assert ids(get(client, "bookmarks", auth["A"])) == [p3, p2, p1]  # 원래 saved_at 순서로 복원
    assert ids(get(client, "reactions", auth["A"])) == [p3, p2, p1]


def test_me_collections_ignore_other_user_id_query_param(client, auth, db_engine):
    a_post = seed(db_engine, user_id=USER_A_ID, at=T0)
    b_post = seed(db_engine, user_id=USER_B_ID, at=T0 + timedelta(minutes=1))
    react(db_engine, a_post, USER_A_ID, T0)
    bookmark(db_engine, a_post, USER_A_ID, T0)
    react(db_engine, b_post, USER_B_ID, T0)
    bookmark(db_engine, b_post, USER_B_ID, T0)
    for kind in LISTS:
        response = get(client, kind, auth["A"], user_id=USER_B_ID)
        assert ids(response) == [a_post], kind
    profile = client.get("/api/v1/me/profile", params={"user_id": USER_B_ID}, headers=auth["A"])
    assert profile.status_code == 200 and profile.json()["user_id"] == USER_A_ID


@pytest.mark.parametrize("kind", LISTS)
def test_me_collections_cursor_no_dup_no_gap_on_ties(client, auth, db_engine, kind):
    owner = USER_A_ID if kind == "posts" else USER_B_ID
    posts = {seed(db_engine, user_id=owner, at=T0) for _ in range(5)}
    for p in posts:  # 모은 시각도 모두 같게
        react(db_engine, p, USER_A_ID, T0)
        bookmark(db_engine, p, USER_A_ID, T0)
    seen: list[str] = []
    cursor = None
    for _ in range(10):
        params = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        body = get(client, kind, auth["A"], **params).json()
        assert len(body["items"]) <= 2
        seen += [i["id"] for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert cursor is None
    assert len(seen) == 5 and set(seen) == posts
    assert seen == sorted(seen, reverse=True)  # 같은 시각이면 id 내림차순


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


BAD_CURSORS = [
    "bad!",
    _b64(b"not json"),
    _b64(json.dumps({"ts": "2026-11-17T12:00:00+09:00"}).encode()),
    _b64(json.dumps(["2026-11-17T12:00:00", "7c9e6679-7425-40de-944b-e07fc1f90ae7"]).encode()),  # 시간대 없음
    _b64(json.dumps(["2026-11-17T12:00:00+09:00", "not-a-uuid"]).encode()),
    _b64(json.dumps([123, None]).encode()),
]


@pytest.mark.parametrize("kind", LISTS)
def test_me_collections_invalid_cursor_and_limit_are_422(client, auth, db_engine, kind):
    for cursor in BAD_CURSORS:
        response = get(client, kind, auth["A"], cursor=cursor)
        assert response.status_code == 422, cursor
        assert response.json()["error"] == {"code": "VALIDATION_ERROR", "message": "요청 형식이 올바르지 않아요.",
                                             "detail": "cursor"}
    for limit in (0, 51):
        response = get(client, kind, auth["A"], limit=limit)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
        assert response.json()["error"]["detail"] == "limit"
    for limit in (1, 50):
        assert get(client, kind, auth["A"], limit=limit).status_code == 200


def test_me_endpoints_require_auth_and_block_withdrawn(client, auth, db_engine):
    seed(db_engine, user_id=USER_A_ID, at=T0)
    for path in ENDPOINTS:
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.json()["error"]["code"] == "AUTH_REQUIRED"
        bad = client.get(path, headers={"Authorization": "Bearer broken"})
        assert bad.status_code == 401 and bad.json()["error"]["code"] == "AUTH_INVALID"
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :u"), {"u": USER_A_ID})
    for path in ENDPOINTS:
        response = client.get(path, headers=auth["A"])
        assert response.status_code == 403, path
        assert response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"


# ─────────── user_profiles 확장(C5) ───────────


def test_user_profiles_bio_avatar_checks_and_rls(auth, db_engine):
    def update(**values):
        sets = ", ".join(f"{k} = :{k}" for k in values)
        with db_engine.begin() as conn:
            conn.execute(text(f"UPDATE user_profiles SET {sets} WHERE user_id = :u"), values | {"u": USER_A_ID})

    def current():
        with db_engine.connect() as conn:
            return conn.execute(text("SELECT bio, avatar_url FROM user_profiles WHERE user_id = :u"),
                                {"u": USER_A_ID}).one()

    update(bio="가" * 160, avatar_url="https://img.test/a.jpg")  # 경계값은 허용
    before = current()
    for bad in ({"bio": "   "}, {"bio": "가" * 161}, {"avatar_url": "http://img.test/a.jpg"}):
        with pytest.raises(IntegrityError):
            update(**bad)
    assert current() == before  # 거부된 값은 남지 않음
    update(bio=None, avatar_url=None)
    assert tuple(current()) == (None, None)
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class "
                                 "WHERE oid = 'public.user_profiles'::regclass")).scalar_one() is True
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public' "
                                 "AND tablename = 'user_profiles'")).scalar_one() == 0
