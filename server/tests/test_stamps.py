"""VISIT-4-P1: 방문 스탬프 #35·#36, 스탬프 북마크 #69, 혼합 피드 #32 stamp — local-feed 계약 VISIT-4 C2·C3·C5·C6·P5."""

import json
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.common import today_kst
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

LIB_1 = 101
LIB_2 = 102
KST = timezone(timedelta(hours=9))


@pytest.fixture
def clean(db_engine):
    def run():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM stamp_bookmarks"))
            conn.execute(text("DELETE FROM visit_stamps"))
            conn.execute(text("DELETE FROM guestbook_entries"))
            conn.execute(text("DELETE FROM posts"))

    run()
    yield
    run()


@pytest.fixture
def clock(monkeypatch):
    """서버 '오늘'(서울)을 고정한다. clock.set(datetime)로 옮긴다."""
    class Clock:
        def set(self, at: datetime) -> None:
            monkeypatch.setattr("app.routers.stamps.today_kst", lambda: today_kst(at))

    c = Clock()
    c.set(datetime(2026, 11, 24, 10, 0, tzinfo=KST))
    return c


@pytest.fixture
def client(test_db_url, fake_jwks_client, public_reference_data, clean, clock):
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


def put_stamp(client, headers, visibility="private", library_id=LIB_1, **extra):
    return client.put(f"/api/v1/libraries/{library_id}/stamps/today",
                      json={"visibility": visibility, **extra}, headers=headers)


def rows(db_engine):
    with db_engine.connect() as conn:
        return conn.execute(text(
            "SELECT id, user_id, library_id, stamped_on, visibility FROM visit_stamps ORDER BY created_at")).all()


def feed(client, headers=None, library_id=LIB_1, **params):
    return client.get(f"/api/v1/libraries/{library_id}/feed", params=params, headers=headers or {})


def stamp_items(body):
    return [i["stamp"] for i in body["items"] if i["kind"] == "stamp"]


# ─────────── #35·#36 ───────────


def test_stamp_is_one_per_user_library_seoul_day(client, auth, db_engine):
    responses = [put_stamp(client, auth["A"], v) for v in ("public", "private", "public")]
    assert [r.status_code for r in responses] == [200, 200, 200]
    assert len({r.json()["stamp"]["id"] for r in responses}) == 1
    assert [(str(r.user_id), r.visibility) for r in rows(db_engine)] == [(USER_A_ID, "public")]
    today = client.get(f"/api/v1/libraries/{LIB_1}/stamps/today", headers=auth["A"]).json()
    assert today == {"stamped": True, "stamp": responses[0].json()["stamp"] | {"visibility": "public"}}


def test_today_stamp_before_stamping_is_empty(client, auth):
    response = client.get(f"/api/v1/libraries/{LIB_1}/stamps/today", headers=auth["A"])
    assert response.status_code == 200
    assert response.json() == {"stamped": False, "stamp": None}


def test_today_stamp_ignores_yesterday_and_other_users(client, auth, clock):
    clock.set(datetime(2026, 11, 24, 23, 59, tzinfo=KST))
    assert put_stamp(client, auth["A"], "public").status_code == 200
    assert client.get(f"/api/v1/libraries/{LIB_1}/stamps/today", headers=auth["B"]).json() == {
        "stamped": False, "stamp": None}  # 남의 오늘 스탬프는 내 것이 아니다
    clock.set(datetime(2026, 11, 25, 0, 1, tzinfo=KST))
    assert client.get(f"/api/v1/libraries/{LIB_1}/stamps/today", headers=auth["A"]).json() == {
        "stamped": False, "stamp": None}  # 자정이 지나면 어제 스탬프는 오늘 것이 아니다


def test_stamp_date_comes_from_server_seoul_today(client, auth, db_engine, clock):
    clock.set(datetime(2026, 11, 24, 23, 59, tzinfo=KST))
    first = put_stamp(client, auth["A"], stamped_on="2020-01-01")  # 본문 날짜는 무시
    clock.set(datetime(2026, 11, 25, 0, 1, tzinfo=KST))
    second = put_stamp(client, auth["A"])
    assert first.json()["stamp"]["stamped_on"] == "2026-11-24"
    assert second.json()["stamp"]["stamped_on"] == "2026-11-25"
    assert [r.stamped_on for r in rows(db_engine)] == [date(2026, 11, 24), date(2026, 11, 25)]


def test_stamp_endpoints_require_auth(client, auth, db_engine):
    stamp_id = put_stamp(client, auth["A"], "public").json()["stamp"]["id"]
    calls = [
        client.get(f"/api/v1/libraries/{LIB_1}/stamps/today"),
        put_stamp(client, {}, "public", library_id=LIB_2),
        client.put(f"/api/v1/stamps/{stamp_id}/bookmark"),
        client.delete(f"/api/v1/stamps/{stamp_id}/bookmark"),
    ]
    for response in calls:
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert len(rows(db_engine)) == 1
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM stamp_bookmarks")).scalar_one() == 0


def test_stamp_bad_visibility_is_422_and_keeps_row(client, auth, db_engine):
    put_stamp(client, auth["A"], "private")
    response = put_stamp(client, auth["A"], "friends")
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == "visibility"
    assert [r.visibility for r in rows(db_engine)] == ["private"]


def test_stamp_unknown_library_is_404(client, auth, db_engine):
    assert put_stamp(client, auth["A"], library_id=999999).status_code == 404
    assert client.get("/api/v1/libraries/999999/stamps/today", headers=auth["A"]).status_code == 404
    assert rows(db_engine) == []


def test_delayed_visibility_change_after_midnight_returns_409_without_creating_row(client, auth, db_engine, clock):
    clock.set(datetime(2026, 11, 24, 23, 59, tzinfo=KST))
    stamp_id = put_stamp(client, auth["A"], "private").json()["stamp"]["id"]
    clock.set(datetime(2026, 11, 25, 0, 1, tzinfo=KST))
    response = put_stamp(client, auth["A"], "public", expected_stamp_id=stamp_id)
    assert response.status_code == 409
    assert response.json()["error"] == {"code": "STAMP_DATE_CHANGED", "message": "날짜가 바뀌었어요. 다시 확인해 주세요",
                                         "detail": None}
    assert [(r.stamped_on, r.visibility) for r in rows(db_engine)] == [(date(2026, 11, 24), "private")]


def test_expected_stamp_id_of_another_user_returns_409_without_creating_row(client, auth, db_engine):
    stamp_a = put_stamp(client, auth["A"], "private").json()["stamp"]["id"]
    response = put_stamp(client, auth["B"], "public", expected_stamp_id=stamp_a)
    assert response.status_code == 409 and response.json()["error"]["code"] == "STAMP_DATE_CHANGED"
    assert [(str(r.user_id), r.visibility) for r in rows(db_engine)] == [(USER_A_ID, "private")]


def test_expected_stamp_id_same_day_changes_visibility(client, auth, db_engine):
    stamp_id = put_stamp(client, auth["A"], "private").json()["stamp"]["id"]
    response = put_stamp(client, auth["A"], "public", expected_stamp_id=stamp_id)
    assert response.status_code == 200
    assert response.json()["stamp"] == {"id": stamp_id, "stamped_on": "2026-11-24", "visibility": "public"}
    other_library = put_stamp(client, auth["A"], "public", library_id=LIB_2, expected_stamp_id=stamp_id)
    assert other_library.status_code == 409  # 다른 도서관의 오늘 행이 아니다
    assert [r.visibility for r in rows(db_engine)] == ["public"]


# ─────────── #32 stamp ───────────


def test_private_stamp_never_appears_to_others(client, auth):
    put_stamp(client, auth["A"], "private")
    for headers in (auth["B"], {}, auth["A"]):
        assert stamp_items(feed(client, headers).json()) == []


def test_public_stamp_card_in_feed_and_flags(client, auth):
    stamp_id = put_stamp(client, auth["A"], "public").json()["stamp"]["id"]
    assert client.put(f"/api/v1/stamps/{stamp_id}/bookmark", headers=auth["B"]).status_code == 200
    as_a, as_b, anon = (stamp_items(feed(client, h).json()) for h in (auth["A"], auth["B"], {}))
    assert set(as_a[0]) == {"id", "library_id", "stamped_on", "author_nickname", "published_at", "mine", "my_bookmark"}
    assert as_a[0]["id"] == stamp_id and as_a[0]["stamped_on"] == "2026-11-24"
    assert as_a[0]["published_at"].endswith("+09:00")
    assert (as_a[0]["mine"], as_a[0]["my_bookmark"]) == (True, False)
    assert (as_b[0]["mine"], as_b[0]["my_bookmark"]) == (False, True)
    assert (anon[0]["mine"], anon[0]["my_bookmark"]) == (False, False)
    assert stamp_items(feed(client, auth["A"], library_id=LIB_2).json()) == []


def test_stamp_response_has_no_user_id(client, auth):
    put_stamp(client, auth["A"], "public")
    for body in (feed(client, auth["A"]).json(),
                 client.get(f"/api/v1/libraries/{LIB_1}/stamps/today", headers=auth["A"]).json(),
                 put_stamp(client, auth["A"], "public").json()):
        assert "user_id" not in json.dumps(body)


def test_feed_mixes_stamps_by_created_at_across_pages(client, auth, db_engine):
    t0 = datetime(2026, 11, 24, 1, 0, tzinfo=timezone.utc)
    expected = []
    with db_engine.begin() as conn:
        for n in range(12):  # 같은 시각 묶음(3개씩)에 게시물·스탬프를 섞는다
            at = t0 + timedelta(minutes=n // 3)
            if n % 2:
                pid = conn.execute(text(
                    "INSERT INTO posts (user_id, library_id, image_kind, image_value, overlay_text, body, status, "
                    "client_request_id, published_at) VALUES (:u, :l, 'color', 'fill2', '글자', '본문', 'published', "
                    ":r, :at) RETURNING id"), {"u": USER_B_ID, "l": LIB_1, "r": uuid4(), "at": at}).scalar_one()
                expected.append(("post", str(pid), at))
            else:
                user = USER_A_ID if n % 4 == 0 else USER_B_ID
                sid = conn.execute(text(
                    "INSERT INTO visit_stamps (user_id, library_id, stamped_on, visibility, created_at) "
                    "VALUES (:u, :l, :d, 'public', :at) RETURNING id"),
                    {"u": user, "l": LIB_1, "d": date(2026, 11, 1) + timedelta(days=n), "at": at}).scalar_one()
                expected.append(("stamp", str(sid), at))
    expected.sort(key=lambda e: e[1], reverse=True)
    expected.sort(key=lambda e: e[0])
    expected.sort(key=lambda e: e[2], reverse=True)
    seen, cursor = [], None
    for _ in range(10):
        body = feed(client, limit=4, **({"cursor": cursor} if cursor else {})).json()
        seen += [(i["kind"], i[i["kind"]]["id"]) for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert seen == [(k, i) for k, i, _ in expected]


# ─────────── #69 ───────────


def bookmark_rows(db_engine):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT user_id, stamp_id, saved_at FROM stamp_bookmarks")).all()


def test_stamp_bookmark_requires_public_stamp_and_updates_saved_at_on_resave(client, auth, db_engine):
    public_id = put_stamp(client, auth["A"], "public").json()["stamp"]["id"]
    private_id = put_stamp(client, auth["B"], "private").json()["stamp"]["id"]
    first = client.put(f"/api/v1/stamps/{public_id}/bookmark", headers=auth["B"])
    saved_first = bookmark_rows(db_engine)[0].saved_at
    second = client.put(f"/api/v1/stamps/{public_id}/bookmark", headers=auth["B"])
    assert first.status_code == second.status_code == 200 and second.json() == {"bookmarked": True}
    marks = bookmark_rows(db_engine)
    assert len(marks) == 1 and marks[0].saved_at > saved_first
    hidden = client.put(f"/api/v1/stamps/{private_id}/bookmark", headers=auth["A"])
    missing = client.put(f"/api/v1/stamps/{uuid4()}/bookmark", headers=auth["A"])
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()
    assert len(bookmark_rows(db_engine)) == 1
    deletes = [client.delete(f"/api/v1/stamps/{public_id}/bookmark", headers=auth["B"]) for _ in range(2)]
    assert [d.status_code for d in deletes] == [200, 200] and deletes[0].json() == {"bookmarked": False}
    assert bookmark_rows(db_engine) == []


def test_bookmark_row_kept_when_stamp_turns_private(client, auth, db_engine):
    stamp_id = put_stamp(client, auth["A"], "public").json()["stamp"]["id"]
    client.put(f"/api/v1/stamps/{stamp_id}/bookmark", headers=auth["B"])
    put_stamp(client, auth["A"], "private", expected_stamp_id=stamp_id)
    assert len(bookmark_rows(db_engine)) == 1  # C-46 D4·D5: 행은 남긴다
    assert stamp_items(feed(client, auth["B"]).json()) == []


def test_visit_stamps_and_bookmarks_rls_enabled_with_no_policies(db_engine):
    with db_engine.connect() as conn:
        for table in ("visit_stamps", "stamp_bookmarks"):
            assert conn.execute(
                text("SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname = :t"),
                {"t": table},
            ).scalar_one() is True
            assert conn.execute(
                text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = :t"),
                {"t": table},
            ).scalar_one() == 0


def test_withdrawn_user_cannot_write_stamps_or_bookmarks(client, auth, db_engine):
    stamp_id = put_stamp(client, auth["A"], "public").json()["stamp"]["id"]
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :uid"), {"uid": USER_B_ID})
    for resp in (
        put_stamp(client, auth["B"], "public", library_id=LIB_2),
        client.put(f"/api/v1/stamps/{stamp_id}/bookmark", headers=auth["B"]),
        client.delete(f"/api/v1/stamps/{stamp_id}/bookmark", headers=auth["B"]),
    ):
        assert resp.status_code == 403
    assert [(str(r.user_id), r.library_id) for r in rows(db_engine)] == [(USER_A_ID, LIB_1)]
    assert bookmark_rows(db_engine) == []
