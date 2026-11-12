import os
import socket
import threading

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.settings import Settings

# docker-compose.yml의 격리 시험 DB(.env.example과 같은 값)
TEST_DB = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://localone:localone@localhost:5433/localone_test"
)
NO_DB = "postgresql+psycopg://localone:localone@127.0.0.1:1/localone_test"
ERROR_KEYS = {"code", "message", "detail"}


@pytest.fixture
def refusing_db_url():
    """연결을 받자마자 끊는 가짜 DB. 닫힌 포트는 Windows에서 거부가 2초 넘게 걸려 쓰지 않는다."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen()

    def run():
        try:
            while True:
                conn, _ = srv.accept()
                conn.close()
        except OSError:
            pass

    threading.Thread(target=run, daemon=True).start()
    yield f"postgresql+psycopg://localone:localone@127.0.0.1:{srv.getsockname()[1]}/localone_test"
    srv.close()


def client(database_url: str) -> TestClient:
    return TestClient(
        create_app(Settings(app_env="test", database_url=database_url)),
        raise_server_exceptions=False,
    )


def test_ready_ok_when_db_is_up():
    with client(TEST_DB) as c:
        r = c.get("/api/v1/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["db"] == "ok"
    assert body["checked_at"].endswith("+09:00")


def test_ready_503_when_db_is_down(refusing_db_url):
    with client(refusing_db_url) as c:
        r = c.get("/api/v1/ready")
    assert r.status_code == 503
    assert r.json() == {
        "error": {
            "code": "DB_UNAVAILABLE",
            "message": "데이터베이스에 연결하지 못했어요.",
            "detail": "",
        }
    }


def test_unknown_path_uses_error_format():
    with client(NO_DB) as c:  # DB 없이도 서버는 동작한다
        r = c.get("/api/v1/nope")
    assert r.status_code == 404
    assert set(r.json()["error"]) == ERROR_KEYS
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_test_env_rejects_remote_db_host():
    with pytest.raises(ValidationError):
        Settings(app_env="test", database_url="postgresql+psycopg://u:p@db.example.com:5432/x")
