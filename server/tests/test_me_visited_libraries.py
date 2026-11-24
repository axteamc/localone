"""MY-3-P1: 도서관 방문 모음(#40) 및 북마크 통합(post + stamp) — my-collection 계약 MY-3 C2·C3·C6·P5."""

import base64
import json
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처: 도서관 101·102·103)
from tests.test_feed import T0, auth, books, client, seed  # noqa: F401  (픽스처·도우미)

KST = timezone(timedelta(hours=9))
STAMP_BOOKMARK_KEYS = {
    "item_kind",
    "id",
    "library_id",
    "library_name",
    "stamped_on",
    "author_nickname",
    "published_at",
    "mine",
    "my_bookmark",
    "collected_at",
}


def _b64(value: object) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


def _stamp(db_engine, user_id: str, library_id: int, stamped_on: date,
           visibility: str = "public", created_at: datetime | None = None) -> str:
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO visit_stamps (user_id, library_id, stamped_on, visibility, created_at) "
            "VALUES (:u, :lib, :day, :vis, COALESCE(:at, now())) RETURNING id"
        ), {"u": user_id, "lib": library_id, "day": stamped_on, "vis": visibility, "at": created_at}).scalar_one())


def _guestbook(db_engine, user_id: str, library_id: int, published_at: datetime,
               status: str = "published") -> str:
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO guestbook_entries (user_id, library_id, body, status, published_at, client_request_id) "
            "VALUES (:u, :lib, '다녀가요', :s, :at, gen_random_uuid()) RETURNING id"
        ), {"u": user_id, "lib": library_id, "s": status, "at": published_at}).scalar_one())


def _bookmark_post(db_engine, user_id: str, post_id: str, saved_at: datetime) -> None:
    with db_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO post_bookmarks (user_id, post_id, saved_at) VALUES (:u, :p, :at)"
        ), {"u": user_id, "p": post_id, "at": saved_at})


def _bookmark_stamp(db_engine, user_id: str, stamp_id: str, saved_at: datetime) -> None:
    with db_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO stamp_bookmarks (user_id, stamp_id, saved_at) VALUES (:u, :s, :at)"
        ), {"u": user_id, "s": stamp_id, "at": saved_at})


def test_visited_libraries_list_only_stamp_or_guestbook_libraries(client, auth, db_engine):
    """스탬프(공개·비공개) 또는 공개 방명록이 있는 도서관만 반환한다(M3-2·Q-45 ②)."""
    # 101: 스탬프 2일(비공개 1 + 공개 1) + 방명록 1건(더 이른 날)
    _stamp(db_engine, USER_A_ID, 101, date(2026, 11, 5), visibility="private")
    _stamp(db_engine, USER_A_ID, 101, date(2026, 11, 18), visibility="public")
    _guestbook(db_engine, USER_A_ID, 101, datetime(2026, 11, 2, 10, 0, tzinfo=KST))
    # 102: 방명록만 1건(UTC 15:30 = KST 다음날 00:30 → 서울 날짜 기준 확인)
    _guestbook(db_engine, USER_A_ID, 102, datetime(2026, 11, 9, 15, 30, tzinfo=timezone.utc))
    # 103: B의 스탬프와 A의 일반 게시물만 → A 방문 모음에는 나오면 안 된다
    _stamp(db_engine, USER_B_ID, 103, date(2026, 11, 20), visibility="public")
    seed(db_engine, user_id=USER_A_ID, library_id=103, at=T0)

    res = client.get("/api/v1/me/visited-libraries", headers=auth["A"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["next_cursor"] is None
    assert [i["library"]["id"] for i in body["items"]] == [101, 102]

    first, second = body["items"]
    assert set(first) == {"library", "stamp_days", "guestbook_count", "first_on", "last_on"}
    assert set(first["library"]) == {"id", "name", "address", "area_label"}
    assert "user_id" not in first
    assert first["stamp_days"] == 2
    assert first["guestbook_count"] == 1
    assert first["first_on"] == "2026-11-02"
    assert first["last_on"] == "2026-11-18"
    assert first["library"]["area_label"] == "화동"

    assert second["stamp_days"] == 0
    assert second["guestbook_count"] == 1
    assert second["first_on"] == "2026-11-10"  # UTC 11-09 15:30 → KST 11-10
    assert second["last_on"] == "2026-11-10"


def test_visited_libraries_sort_by_last_day_then_id(client, auth, db_engine):
    """정렬은 last_on DESC, library_id ASC이며 커서 동률에도 중복·누락이 없다(M3-6)."""
    # 103(최신), 101·102(같은 last_on 11-10 → id 오름차순 101 먼저 102 나중)
    _stamp(db_engine, USER_A_ID, 103, date(2026, 11, 15))
    _stamp(db_engine, USER_A_ID, 102, date(2026, 11, 10))
    _stamp(db_engine, USER_A_ID, 101, date(2026, 11, 10))

    seen: list[int] = []
    cursor = None
    for _ in range(5):
        params = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        res = client.get("/api/v1/me/visited-libraries", params=params, headers=auth["A"])
        assert res.status_code == 200, res.text
        body = res.json()
        assert len(body["items"]) <= 2
        seen.extend(i["library"]["id"] for i in body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert cursor is None
    assert seen == [103, 101, 102]


def test_visited_libraries_require_auth_and_never_take_user_id(client, auth, db_engine):
    """비로그인은 401, 쿼리 user_id는 무시한다(M3-5)."""
    _stamp(db_engine, USER_A_ID, 101, date(2026, 11, 12))
    _stamp(db_engine, USER_B_ID, 102, date(2026, 11, 13))

    unauth = client.get("/api/v1/me/visited-libraries")
    assert unauth.status_code == 401
    assert unauth.json()["error"]["code"] == "AUTH_REQUIRED"

    res = client.get("/api/v1/me/visited-libraries", params={"user_id": USER_B_ID}, headers=auth["A"])
    assert res.status_code == 200
    assert [i["library"]["id"] for i in res.json()["items"]] == [101]


def test_withdrawn_guestbook_does_not_count(client, auth, db_engine):
    """철회·숨김 방명록은 모음에 포함되지 않는다."""
    _guestbook(db_engine, USER_A_ID, 101, datetime(2026, 11, 10, 12, 0, tzinfo=KST), status="withdrawn")
    _guestbook(db_engine, USER_A_ID, 102, datetime(2026, 11, 11, 12, 0, tzinfo=KST), status="hidden")
    _stamp(db_engine, USER_A_ID, 103, date(2026, 11, 12))
    _guestbook(db_engine, USER_A_ID, 103, datetime(2026, 11, 13, 12, 0, tzinfo=KST), status="withdrawn")

    res = client.get("/api/v1/me/visited-libraries", headers=auth["A"])
    assert res.status_code == 200
    items = res.json()["items"]
    assert [i["library"]["id"] for i in items] == [103]
    assert items[0]["stamp_days"] == 1
    assert items[0]["guestbook_count"] == 0
    assert items[0]["last_on"] == "2026-11-12"


@pytest.mark.parametrize("bad_cursor", [
    "not-base64!!!",
    _b64(["2026-11-10"]),
    _b64(["not-a-date", 101]),
    _b64(["2026-11-10", True]),
    _b64(["2026-11-10", 0]),
    _b64(["2026-11-10", "101"]),
])
def test_visited_libraries_invalid_cursor_returns_422(client, auth, bad_cursor):
    res = client.get("/api/v1/me/visited-libraries", params={"cursor": bad_cursor}, headers=auth["A"])
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert res.json()["error"]["detail"] == "cursor"


@pytest.mark.parametrize("bad_limit", [0, -1, 61])
def test_visited_libraries_invalid_limit_returns_422(client, auth, bad_limit):
    res = client.get("/api/v1/me/visited-libraries", params={"limit": bad_limit}, headers=auth["A"])
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert res.json()["error"]["detail"] == "limit"


def test_bookmarks_merge_posts_and_public_stamps_and_restore_on_republish(client, auth, db_engine):
    """post_bookmarks·stamp_bookmarks가 saved_at DESC로 합쳐지고, 비공개 스탬프는 숨겼다가 재공개 시 복원된다(M3-7)."""
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE user_profiles SET nickname = '스탬프이웃' WHERE user_id = :u"), {"u": USER_B_ID})

    p1 = seed(db_engine, user_id=USER_B_ID, at=T0)
    p2 = seed(db_engine, user_id=USER_B_ID, at=T0 + timedelta(minutes=1))
    s1 = _stamp(db_engine, USER_B_ID, 101, date(2026, 11, 17), visibility="public", created_at=T0 + timedelta(minutes=2))
    s2 = _stamp(db_engine, USER_A_ID, 102, date(2026, 11, 18), visibility="public", created_at=T0 + timedelta(minutes=3))

    # 시각: s2(+3h) > p1·s1 동률(+2h → post 먼저, stamp 나중) > p2(+1h)
    _bookmark_post(db_engine, USER_A_ID, p2, T0 + timedelta(hours=1))
    _bookmark_post(db_engine, USER_A_ID, p1, T0 + timedelta(hours=2))
    _bookmark_stamp(db_engine, USER_A_ID, s1, T0 + timedelta(hours=2))
    _bookmark_stamp(db_engine, USER_A_ID, s2, T0 + timedelta(hours=3))

    # 페이지 크기 2로 전체 순회해 동률 커서 검증
    merged: list[dict] = []
    cursor = None
    for _ in range(5):
        params = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        res = client.get("/api/v1/me/bookmarks", params=params, headers=auth["A"])
        assert res.status_code == 200, res.text
        body = res.json()
        merged.extend(body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert cursor is None
    assert [(i["item_kind"], i["id"]) for i in merged] == [
        ("stamp", s2),
        ("post", p1),
        ("stamp", s1),
        ("post", p2),
    ]

    stamp_entry = merged[2]
    assert set(stamp_entry) == STAMP_BOOKMARK_KEYS
    assert stamp_entry["library_id"] == 101
    assert stamp_entry["library_name"] == "정독도서관"
    assert stamp_entry["stamped_on"] == "2026-11-17"
    assert stamp_entry["author_nickname"] == "스탬프이웃"
    assert stamp_entry["mine"] is False
    assert stamp_entry["my_bookmark"] is True
    assert stamp_entry["published_at"].endswith("+09:00")
    assert stamp_entry["collected_at"].endswith("+09:00")
    assert merged[0]["mine"] is True

    # 기존 2-원소 [ts, post_id] 커서 하위 호환 파싱 확인
    legacy_cursor = _b64([(T0 + timedelta(hours=2)).isoformat(), p1])
    legacy_res = client.get("/api/v1/me/bookmarks", params={"cursor": legacy_cursor, "limit": 10}, headers=auth["A"])
    assert legacy_res.status_code == 200
    assert [(i["item_kind"], i["id"]) for i in legacy_res.json()["items"]] == [
        ("stamp", s1),
        ("post", p2),
    ]

    # s1을 비공개로 바꾸면 목록에서 숨기되 stamp_bookmarks 행은 유지
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE visit_stamps SET visibility = 'private' WHERE id = :s"), {"s": s1})
    hidden_res = client.get("/api/v1/me/bookmarks", headers=auth["A"])
    assert [(i["item_kind"], i["id"]) for i in hidden_res.json()["items"]] == [
        ("stamp", s2),
        ("post", p1),
        ("post", p2),
    ]
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM stamp_bookmarks WHERE stamp_id = :s"), {"s": s1}).scalar_one() == 1

    # 다시 공개하면 원래 saved_at 순서로 복원
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE visit_stamps SET visibility = 'public' WHERE id = :s"), {"s": s1})
    restored_res = client.get("/api/v1/me/bookmarks", headers=auth["A"])
    assert [(i["item_kind"], i["id"]) for i in restored_res.json()["items"]] == [
        ("stamp", s2),
        ("post", p1),
        ("stamp", s1),
        ("post", p2),
    ]

    # 잘못된 3-원소 커서 item_kind → 422 detail="cursor"
    bad_kind = _b64([(T0 + timedelta(hours=2)).isoformat(), "guestbook", p1])
    bad_res = client.get("/api/v1/me/bookmarks", params={"cursor": bad_kind}, headers=auth["A"])
    assert bad_res.status_code == 422
    assert bad_res.json()["error"]["detail"] == "cursor"
