"""VISIT-3-P1: 혼합 피드(#32, 게시물 + 방명록) — local-feed 계약 VISIT-3 V3-8·C3·C6·P5."""

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

LIB_1 = 101
LIB_2 = 102
T0 = datetime(2026, 11, 19, 3, 0, tzinfo=timezone.utc)


@pytest.fixture
def clean(db_engine):
    def run():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM guestbook_entries"))
            conn.execute(text("DELETE FROM posts"))

    run()
    yield
    run()


@pytest.fixture
def client(test_db_url, fake_jwks_client, public_reference_data, clean):
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


def seed_post(db_engine, *, at=T0, status="published", library_id=LIB_1, user_id=USER_B_ID) -> str:
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, image_kind, image_value, overlay_text, body, status, "
            "client_request_id, published_at) VALUES (:u, :l, 'color', 'fill2', '글자', '본문', :s, :r, :at) "
            "RETURNING id"), {"u": user_id, "l": library_id, "s": status, "r": uuid4(), "at": at}).scalar_one())


def seed_gb(db_engine, *, at=T0, status="published", library_id=LIB_1, user_id=USER_A_ID, body="안녕") -> str:
    with db_engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO guestbook_entries (user_id, library_id, body, status, client_request_id, published_at) "
            "VALUES (:u, :l, :b, :s, :r, :at) RETURNING id"),
            {"u": user_id, "l": library_id, "b": body, "s": status, "r": uuid4(), "at": at}).scalar_one())


def feed(client, library_id=LIB_1, headers=None, **params):
    return client.get(f"/api/v1/libraries/{library_id}/feed", params=params, headers=headers or {})


def key(item):
    return item["kind"], item[item["kind"]]["id"]


def test_feed_items_mix_kinds_newest_first(client, auth, db_engine):
    p_old = seed_post(db_engine, at=T0)
    g_mid = seed_gb(db_engine, at=T0 + timedelta(minutes=1))
    p_new = seed_post(db_engine, at=T0 + timedelta(minutes=2))
    seed_gb(db_engine, at=T0 + timedelta(minutes=3), library_id=LIB_2)  # 다른 도서관
    body = feed(client).json()
    assert [key(i) for i in body["items"]] == [("post", p_new), ("guestbook", g_mid), ("post", p_old)]
    assert body["next_cursor"] is None
    gb = body["items"][1]["guestbook"]
    assert gb["published_at"].endswith("+09:00") and gb["author_nickname"]


def test_withdrawn_and_hidden_entries_never_appear_in_feed_items(client, auth, db_engine):
    keep = seed_gb(db_engine, at=T0)
    seed_gb(db_engine, at=T0 + timedelta(minutes=1), status="withdrawn")
    seed_gb(db_engine, at=T0 + timedelta(minutes=2), status="hidden")
    seed_post(db_engine, at=T0 + timedelta(minutes=3), status="hidden")
    seed_post(db_engine, at=T0 + timedelta(minutes=4), status="withdrawn")
    body = feed(client).json()
    assert [key(i) for i in body["items"]] == [("guestbook", keep)]


@pytest.mark.parametrize("limit", [10, 3, 7])  # 3·7은 같은 시각 묶음 한가운데(방명록 뒤)에서 쪽이 끊긴다
def test_feed_items_merge_kinds_by_time_without_duplicates_across_pages(client, auth, db_engine, limit):
    expected = []
    for n in range(25):  # 같은 시각 묶음(5개씩)에 두 종류를 섞는다
        at = T0 + timedelta(minutes=n // 5)
        if n % 2:
            expected.append(("post", seed_post(db_engine, at=at), at))
        else:
            expected.append(("guestbook", seed_gb(db_engine, at=at), at))
    # V3-8: published_at DESC, kind ASC, id DESC
    expected.sort(key=lambda e: e[1], reverse=True)
    expected.sort(key=lambda e: e[0])
    expected.sort(key=lambda e: e[2], reverse=True)
    seen = []
    cursor = None
    for _ in range(10):
        body = feed(client, limit=limit, **({"cursor": cursor} if cursor else {})).json()
        seen += [key(i) for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == 25 and len(set(seen)) == 25
    assert seen == [(k, i) for k, i, _ in expected]


def test_guestbook_response_has_no_user_id(client, auth, db_engine):
    created = client.post(f"/api/v1/libraries/{LIB_1}/guestbook",
                          json={"body": "안녕", "client_request_id": str(uuid4())}, headers=auth["A"])
    seed_gb(db_engine, at=T0, user_id=USER_B_ID)
    assert "user_id" not in created.json()
    as_a = feed(client, headers=auth["A"]).json()["items"]
    as_anon = feed(client).json()["items"]
    assert "user_id" not in json.dumps(as_a) and "user_id" not in json.dumps(as_anon)
    mine_a = {i["guestbook"]["id"]: i["guestbook"]["mine"] for i in as_a}
    assert mine_a == {created.json()["id"]: True, next(k for k in mine_a if k != created.json()["id"]): False}
    assert all(i["guestbook"]["mine"] is False for i in as_anon)


def test_feed_items_post_shape_is_feed_post(client, auth, db_engine):
    seed_post(db_engine)
    item = feed(client).json()["items"][0]
    assert item["kind"] == "post"
    assert set(item["post"]) == {"id", "library_id", "library_name", "image_kind", "image_url", "image_color",
                                 "overlay_text", "book", "published_at", "my_reaction", "my_bookmark", "image_value"}


@pytest.mark.parametrize("params,field", [
    ({"cursor": "깨진값"}, "cursor"),
    ({"cursor": "bm90LWEtY3Vyc29y"}, "cursor"),  # "not-a-cursor"
    ({"cursor": "WyIyMDI2LTExLTE5VDAzOjAwOjAwKzAwOjAwIiwic3RhbXAiLCIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMGEiXQ=="},
     "cursor"),  # 모르는 kind "stamp"
    ({"limit": 0}, "limit"),
    ({"limit": 51}, "limit"),
])
def test_feed_items_bad_params_are_422(client, params, field):
    response = feed(client, **params)
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == field


def test_feed_items_unknown_library_is_404(client):
    response = feed(client, library_id=999999)
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"


def test_feed_items_empty(client):
    assert feed(client).json() == {"items": [], "next_cursor": None}


def test_posts_feed_26_unchanged_has_no_guestbook(client, auth, db_engine):
    """#26(홈 하단 창)은 게시물만 그대로 낸다(V3-8)."""
    p = seed_post(db_engine)
    seed_gb(db_engine, at=T0 + timedelta(minutes=1))
    body = client.get(f"/api/v1/libraries/{LIB_1}/posts").json()
    assert [i["id"] for i in body["items"]] == [p]
    assert "kind" not in body["items"][0]
