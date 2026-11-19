"""VISIT-3-P1: 방명록 올리기(#33)·철회(#34) — local-feed 계약 VISIT-3 C2·C3·C5·C6·P5."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

LIB_1 = 101


@pytest.fixture
def clean_guestbook(db_engine):
    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM guestbook_entries"))

    clean()
    yield
    clean()


@pytest.fixture
def client(test_db_url, fake_jwks_client, public_reference_data, clean_guestbook):
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


def post_gb(client, headers, body="2층 창가 자리 오늘 햇살 좋아요", rid=None, library_id=LIB_1):
    return client.post(f"/api/v1/libraries/{library_id}/guestbook",
                       json={"body": body, "client_request_id": str(rid or uuid4())}, headers=headers)


def rows(db_engine):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT id, user_id, body, status FROM guestbook_entries ORDER BY published_at")).all()


def test_guestbook_create_is_idempotent_by_client_request_id(client, auth, db_engine):
    rid = uuid4()
    first = post_gb(client, auth["A"], rid=rid)
    second = post_gb(client, auth["A"], rid=rid)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert len(rows(db_engine)) == 1


def test_guestbook_create_strips_and_returns_item(client, auth, db_engine):
    response = post_gb(client, auth["A"], body="  안녕하세요  ")
    assert response.status_code == 201
    item = response.json()
    assert set(item) == {"id", "library_id", "body", "author_nickname", "published_at", "mine"}
    assert item["body"] == "안녕하세요" and item["library_id"] == LIB_1
    assert item["mine"] is True and item["published_at"].endswith("+09:00")
    assert rows(db_engine)[0].body == "안녕하세요"


def test_guestbook_write_requires_auth(client, auth, db_engine):
    mine = post_gb(client, auth["A"]).json()["id"]
    created = post_gb(client, {})
    withdrawn = client.post(f"/api/v1/guestbook/{mine}/withdraw")
    for response in (created, withdrawn):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert [(str(r.id), r.status) for r in rows(db_engine)] == [(mine, "published")]


def test_withdraw_of_other_or_missing_entry_is_same_404(client, auth, db_engine):
    a_entry = post_gb(client, auth["A"]).json()["id"]
    other = client.post(f"/api/v1/guestbook/{a_entry}/withdraw", headers=auth["B"])
    missing = client.post(f"/api/v1/guestbook/{uuid4()}/withdraw", headers=auth["B"])
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()
    assert other.json()["error"]["code"] == "NOT_FOUND"
    assert [r.status for r in rows(db_engine)] == ["published"]


def test_withdraw_of_hidden_entry_is_404_and_stays_hidden(client, auth, db_engine):
    entry = post_gb(client, auth["A"]).json()["id"]
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE guestbook_entries SET status = 'hidden' WHERE id = :id"), {"id": entry})
    response = client.post(f"/api/v1/guestbook/{entry}/withdraw", headers=auth["A"])
    assert response.status_code == 404
    assert [r.status for r in rows(db_engine)] == ["hidden"]


@pytest.mark.parametrize("body", ["   ", "가" * 141])
def test_guestbook_body_blank_or_over_140_is_422_body(client, auth, db_engine, body):
    response = post_gb(client, auth["A"], body=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["detail"] == "body"
    assert rows(db_engine) == []


def test_guestbook_body_exactly_140_is_201(client, auth, db_engine):
    response = post_gb(client, auth["A"], body="가" * 140)
    assert response.status_code == 201
    assert len(rows(db_engine)[0].body) == 140


def test_guestbook_bad_client_request_id_is_422(client, auth, db_engine):
    response = client.post(f"/api/v1/libraries/{LIB_1}/guestbook",
                           json={"body": "안녕", "client_request_id": "깨진값"}, headers=auth["A"])
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == "client_request_id"
    assert rows(db_engine) == []


def test_guestbook_unknown_library_is_404(client, auth, db_engine):
    response = post_gb(client, auth["A"], library_id=999999)
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    assert rows(db_engine) == []


def test_db_check_rejects_over_140_even_without_server(client, auth, db_engine):
    """C5 guestbook_body_len_check — 서버 검사를 거치지 않는 쓰기도 막는다."""
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO guestbook_entries (user_id, library_id, body, client_request_id) "
                "VALUES (:u, :l, :b, :r)"), {"u": USER_A_ID, "l": LIB_1, "b": "가" * 141, "r": uuid4()})
    assert rows(db_engine) == []


def test_withdraw_twice_stays_withdrawn_and_leaves_feed(client, auth, db_engine):
    entry = post_gb(client, auth["A"]).json()["id"]
    first = client.post(f"/api/v1/guestbook/{entry}/withdraw", headers=auth["A"])
    second = client.post(f"/api/v1/guestbook/{entry}/withdraw", headers=auth["A"])
    assert first.status_code == second.status_code == 200
    assert first.json() == {"ok": True}
    assert [(str(r.id), r.status) for r in rows(db_engine)] == [(entry, "withdrawn")]
    items = client.get(f"/api/v1/libraries/{LIB_1}/feed", headers=auth["A"]).json()["items"]
    assert all(i.get("guestbook", {}).get("id") != entry for i in items)
