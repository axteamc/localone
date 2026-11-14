"""AUTH-1-P3: POST /api/v1/auth/session 및 GET /api/v1/me 통합 검증."""

from concurrent.futures import ThreadPoolExecutor
import time
from typing import Any
from unittest.mock import Mock
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID

USER_A = UUID(USER_A_ID)
USER_B = UUID(USER_B_ID)


def _make_client(
    db_url: str,
    fake_jwks_client: Mock,
    supabase_url: str = TEST_SUPABASE_URL,
) -> TestClient:
    app = create_app(
        Settings(app_env="test", database_url=db_url, supabase_url=supabase_url),
        fake_jwks_client,
    )
    return TestClient(app, raise_server_exceptions=False)


def _count_users(engine: Engine) -> int:
    with engine.connect() as conn:
        return int(conn.execute(text("SELECT count(*) FROM users")).scalar_one())


def test_session_creates_user_once(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    with _make_client(test_db_url, fake_jwks_client) as client:
        r1 = client.post("/api/v1/auth/session", headers=headers)
        r2 = client.post("/api/v1/auth/session", headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    b1, b2 = r1.json(), r2.json()
    assert b1["user_id"] == USER_A_ID
    assert b1["status"] == "active"
    assert b1["is_new"] is True
    assert b1["created_at"].endswith("+09:00")

    assert b2 == {
        "user_id": USER_A_ID,
        "status": "active",
        "is_new": False,
        "created_at": b1["created_at"],
    }
    assert _count_users(db_engine) == 1


def test_session_concurrent_same_user_one_row(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    def _call() -> dict[str, Any]:
        with _make_client(test_db_url, fake_jwks_client) as client:
            resp = client.post("/api/v1/auth/session", headers=headers)
            assert resp.status_code == 200
            return resp.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_call) for _ in range(2)]
        results = [f.result() for f in futures]

    assert _count_users(db_engine) == 1
    assert sorted(r["is_new"] for r in results) == [False, True]
    assert results[0]["created_at"] == results[1]["created_at"]


def test_session_ignores_body_user_id(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    with _make_client(test_db_url, fake_jwks_client) as client:
        r = client.post(
            f"/api/v1/auth/session?user_id={USER_B_ID}",
            headers=headers,
            json={"user_id": USER_B_ID},
        )

    assert r.status_code == 200
    assert r.json()["user_id"] == USER_A_ID
    with db_engine.connect() as conn:
        ids = [str(row.id) for row in conn.execute(text("SELECT id FROM users")).all()]
    assert ids == [USER_A_ID]


def test_auth_db_failure_is_503(
    refusing_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    with _make_client(refusing_db_url, fake_jwks_client) as client:
        r_post = client.post("/api/v1/auth/session", headers=headers)
        r_get = client.get("/api/v1/me", headers=headers)

    for r in (r_post, r_get):
        assert r.status_code == 503
        assert r.json() == {
            "error": {
                "code": "DB_UNAVAILABLE",
                "message": "데이터베이스에 연결하지 못했어요.",
                "detail": "",
            }
        }
    assert _count_users(db_engine) == 0


def test_me_returns_own_user(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    with db_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO users (id) VALUES (:a), (:b)"),
            {"a": USER_A, "b": USER_B},
        )

    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    with _make_client(test_db_url, fake_jwks_client) as client:
        r = client.get(f"/api/v1/me?user_id={USER_B_ID}", headers=headers)

    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"user_id", "status", "created_at"}
    assert body["user_id"] == USER_A_ID
    assert body["status"] == "active"
    assert body["created_at"].endswith("+09:00")


def test_me_not_registered(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    with _make_client(test_db_url, fake_jwks_client) as client:
        r = client.get("/api/v1/me", headers=headers)

    assert r.status_code == 401
    assert r.json() == {
        "error": {
            "code": "AUTH_NOT_REGISTERED",
            "message": "다시 로그인해 주세요.",
            "detail": "",
        }
    }
    assert _count_users(db_engine) == 0


def test_withdrawn_user_forbidden(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    with db_engine.begin() as conn:
        before = conn.execute(
            text(
                "INSERT INTO users (id, status) VALUES (:id, 'withdrawn') "
                "RETURNING status, created_at"
            ),
            {"id": USER_A},
        ).one()

    tok = make_token(sub=USER_A_ID)
    headers = {"Authorization": f"Bearer {tok}"}

    with _make_client(test_db_url, fake_jwks_client) as client:
        r_post = client.post("/api/v1/auth/session", headers=headers)
        r_get = client.get("/api/v1/me", headers=headers)

    for r in (r_post, r_get):
        assert r.status_code == 403
        assert r.json() == {
            "error": {
                "code": "ACCOUNT_WITHDRAWN",
                "message": "탈퇴한 계정이에요.",
                "detail": "",
            }
        }

    with db_engine.connect() as conn:
        rows = conn.execute(text("SELECT id, status, created_at FROM users")).all()
    assert len(rows) == 1
    assert rows[0].status == "withdrawn"
    assert rows[0].created_at == before.created_at


def test_invalid_token_does_not_create_user(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    other_key = ec.generate_private_key(ec.SECP256R1())
    cases: list[tuple[dict[str, str], int, str]] = [
        ({}, 401, "AUTH_REQUIRED"),
        ({"Authorization": "Basic abc"}, 401, "AUTH_REQUIRED"),
        ({"Authorization": "Bearer broken.token"}, 401, "AUTH_INVALID"),
        (
            {"Authorization": f"Bearer {make_token(key=other_key)}"},
            401,
            "AUTH_INVALID",
        ),
        (
            {"Authorization": f"Bearer {make_token(iss='https://wrong.test/auth/v1')}"},
            401,
            "AUTH_INVALID",
        ),
        (
            {"Authorization": f"Bearer {make_token(aud='anon')}"},
            401,
            "AUTH_INVALID",
        ),
        (
            {"Authorization": f"Bearer {make_token(role='anon')}"},
            401,
            "AUTH_INVALID",
        ),
        (
            {"Authorization": f"Bearer {make_token(sub='not-a-uuid')}"},
            401,
            "AUTH_INVALID",
        ),
        (
            {"Authorization": f"Bearer {make_token(exp=int(time.time()) - 60)}"},
            401,
            "AUTH_EXPIRED",
        ),
    ]

    with _make_client(test_db_url, fake_jwks_client) as client:
        for headers, expected_status, expected_code in cases:
            for r in (
                client.post("/api/v1/auth/session", headers=headers),
                client.get("/api/v1/me", headers=headers),
            ):
                assert r.status_code == expected_status
                assert r.json()["error"]["code"] == expected_code

        # #4: JWKS 장애 및 빈 SUPABASE_URL -> 503 AUTH_UNAVAILABLE
        valid_headers = {"Authorization": f"Bearer {make_token()}"}
        fake_jwks_client.get_signing_key_from_jwt.side_effect = (
            jwt.PyJWKClientConnectionError()
        )
        for r in (
            client.post("/api/v1/auth/session", headers=valid_headers),
            client.get("/api/v1/me", headers=valid_headers),
        ):
            assert r.status_code == 503
            assert r.json()["error"]["code"] == "AUTH_UNAVAILABLE"
        fake_jwks_client.get_signing_key_from_jwt.side_effect = None

    with _make_client(test_db_url, fake_jwks_client, supabase_url="") as unconfigured:
        for r in (
            unconfigured.post("/api/v1/auth/session", headers=valid_headers),
            unconfigured.get("/api/v1/me", headers=valid_headers),
        ):
            assert r.status_code == 503
            assert r.json()["error"]["code"] == "AUTH_UNAVAILABLE"

    assert _count_users(db_engine) == 0
