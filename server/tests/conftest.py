"""서버 공통 pytest 픽스처: 시험 세션 마이그레이션, 시험별 users 정리, 가짜 JWKS·토큰 생성."""

import json
import os
import socket
import threading
import time
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import jwt
import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://localone:localone@localhost:5433/localone_test",
)

TEST_DB_URL = os.environ["DATABASE_URL"]
TEST_SUPABASE_URL = "https://auth.example.test"
USER_A_ID = "00000000-0000-4000-8000-00000000000a"
USER_B_ID = "00000000-0000-4000-8000-00000000000b"
NO_DB_MODULES = {"test_auth_jwt.py", "test_cors.py", "test_ready.py"}


def build_alembic_config() -> Config:
    ini_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    return Config(str(ini_path))


@pytest.fixture(scope="session")
def alembic_config() -> Config:
    return build_alembic_config()


@pytest.fixture(scope="session")
def test_db_url() -> str:
    return TEST_DB_URL


@pytest.fixture(scope="session")
def db_engine(alembic_config: Config, test_db_url: str) -> Engine:
    command.upgrade(alembic_config, "head")
    engine = create_engine(test_db_url, connect_args={"connect_timeout": 2})
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def _clean_users_between_tests(request: pytest.FixtureRequest) -> Any:
    if request.node.path.name in NO_DB_MODULES:
        yield
        return
    engine: Engine = request.getfixturevalue("db_engine")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE users CASCADE"))
    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE users CASCADE"))


@pytest.fixture
def refusing_db_url() -> Any:
    """연결을 받자마자 닫는 로컬 소켓으로 DB_UNAVAILABLE(503)을 즉시 재현한다."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen()

    def _accept_and_close() -> None:
        try:
            while True:
                conn, _ = srv.accept()
                conn.close()
        except OSError:
            pass

    threading.Thread(target=_accept_and_close, daemon=True).start()
    try:
        yield f"postgresql+psycopg://localone:localone@127.0.0.1:{srv.getsockname()[1]}/localone_test"
    finally:
        srv.close()


@pytest.fixture(scope="session")
def jwt_signing_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def fake_jwks_client(jwt_signing_key: ec.EllipticCurvePrivateKey) -> Mock:
    jwk_dict = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(jwt_signing_key.public_key()))
    jwk = jwt.PyJWK.from_dict(jwk_dict)
    return Mock(get_signing_key_from_jwt=Mock(return_value=jwk))


@pytest.fixture
def make_token(jwt_signing_key: ec.EllipticCurvePrivateKey):
    def _encode(
        sub: str = USER_A_ID,
        kid: str = "test-kid",
        key: ec.EllipticCurvePrivateKey | None = None,
        **overrides: Any,
    ) -> str:
        claims: dict[str, Any] = {
            "exp": int(time.time()) + 3600,
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "aud": "authenticated",
            "sub": sub,
            "role": "authenticated",
            "session_id": "session-a",
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(
            claims,
            key or jwt_signing_key,
            algorithm="ES256",
            headers={"kid": kid},
        )

    return _encode
