"""AUTH-2-P1: 로그아웃·철회된 Supabase 세션의 토큰 거부(G3·G4, C6 #13, AC-AUTH)."""

from collections.abc import Iterator
from typing import Any
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.auth import CurrentUser, get_current_user
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL

PROBE_PATH = "/__test/write-probe"


@pytest.fixture
def auth_sessions(db_engine: Engine) -> Iterator[None]:
    """시험 DB에는 Supabase auth 스키마가 없어 auth.sessions의 필요한 칸만 대역으로 만든다."""
    with db_engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS auth"))
        conn.execute(text("CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL)"))
        conn.execute(text("CREATE TABLE auth.probe_writes (user_id uuid NOT NULL)"))
    try:
        yield
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DROP SCHEMA auth CASCADE"))


def _client(db_url: str, jwks: Mock, check: bool | None = True) -> TestClient:
    app = create_app(
        Settings(
            app_env="test", database_url=db_url, supabase_url=TEST_SUPABASE_URL,
            auth_session_check=check,
        ),
        jwks_client=jwks,
    )

    # 개인 데이터를 쓰는 기능 엔드포인트와 같은 모양(Depends(get_current_user) 뒤 쓰기)의 시험 전용 경로
    @app.post(PROBE_PATH)
    async def _probe(user: CurrentUser = Depends(get_current_user)) -> dict[str, str]:
        with app.state.engine.begin() as conn:
            conn.execute(text("INSERT INTO auth.probe_writes (user_id) VALUES (:u)"), {"u": user.id})
        return {"ok": "yes"}

    return TestClient(app)


def _h(make_token: Any, sub: UUID, session_id: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=str(sub), session_id=session_id)}"}


def _add_user(engine: Engine, uid: UUID) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": uid})


def _add_session(engine: Engine, sid: UUID, uid: UUID) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO auth.sessions (id, user_id) VALUES (:s, :u)"), {"s": sid, "u": uid})


def _probe_rows(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM auth.probe_writes")).scalar_one()


def _code(res: Any) -> tuple[int, str]:
    return res.status_code, res.json()["error"]["code"]


def test_signed_out_session_rejected_for_reads_and_writes(
    auth_sessions: None, test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    uid, sid = uuid4(), uuid4()
    _add_user(db_engine, uid)
    _add_session(db_engine, sid, uid)
    headers = _h(make_token, uid, str(sid))
    with _client(test_db_url, fake_jwks_client) as client:
        assert client.get("/api/v1/me", headers=headers).status_code == 200
        assert client.post(PROBE_PATH, headers=headers).status_code == 200
        assert _probe_rows(db_engine) == 1

        # Supabase signOut()은 auth.sessions 행을 지운다
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM auth.sessions WHERE id = :s"), {"s": sid})

        me = client.get("/api/v1/me", headers=headers)
        write = client.post(PROBE_PATH, headers=headers)
    assert _code(me) == (401, "AUTH_INVALID")
    assert me.json()["error"]["message"] == "로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요."
    assert _code(write) == (401, "AUTH_INVALID")
    assert _probe_rows(db_engine) == 1  # 철회 뒤 쓰기는 0행


def test_session_of_other_user_rejected(
    auth_sessions: None, test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    a, b, sid_b = uuid4(), uuid4(), uuid4()
    _add_user(db_engine, a)
    _add_user(db_engine, b)
    _add_session(db_engine, sid_b, b)
    with _client(test_db_url, fake_jwks_client) as client:
        res = client.get("/api/v1/me", headers=_h(make_token, a, str(sid_b)))
    assert _code(res) == (401, "AUTH_INVALID")


@pytest.mark.parametrize("session_id", [None, "session-a", 123])
def test_missing_or_bad_session_id_rejected_before_db(
    refusing_db_url: str, fake_jwks_client: Mock, make_token: Any, session_id: Any
) -> None:
    # 연결하자마자 닫히는 DB: DB를 봤다면 503 DB_UNAVAILABLE이 된다
    with _client(refusing_db_url, fake_jwks_client) as client:
        res = client.get("/api/v1/me", headers=_h(make_token, uuid4(), session_id))
    assert _code(res) == (401, "AUTH_INVALID")


def test_session_check_off_ignores_sessions(
    test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    uid = uuid4()
    _add_user(db_engine, uid)
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT to_regnamespace('auth')")).scalar_one() is None
    for check in (False, None):  # 명시적으로 끔 / test 환경 기본값
        with _client(test_db_url, fake_jwks_client, check=check) as client:
            assert client.get("/api/v1/me", headers=_h(make_token, uid, "session-a")).status_code == 200


def test_production_requires_session_check(test_db_url: str) -> None:
    base = {
        "app_env": "production", "database_url": test_db_url, "supabase_url": TEST_SUPABASE_URL,
        "supabase_service_role_key": "service-role-secret",
    }
    with pytest.raises(ValidationError, match="AUTH_SESSION_CHECK"):
        Settings(**base, auth_session_check=False)
    assert Settings(**base, auth_session_check=True).auth_session_check is True
    assert Settings(**base).auth_session_check is True  # 값을 안 주면 production은 켜짐
    assert Settings(app_env="local", database_url=test_db_url).auth_session_check is False


def test_auth_session_endpoint_skips_session_check(
    auth_sessions: None, test_db_url: str, db_engine: Engine, fake_jwks_client: Mock, make_token: Any
) -> None:
    uid = uuid4()
    with _client(test_db_url, fake_jwks_client) as client:
        res = client.post("/api/v1/auth/session", headers=_h(make_token, uid, str(uuid4())))
    assert res.status_code == 200 and res.json()["is_new"] is True
