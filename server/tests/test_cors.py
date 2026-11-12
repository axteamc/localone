import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings

# DB는 쓰지 않는 시험이다(/api/v1/nope 404 응답과 preflight만 본다). 연결은 시도하지 않는다.
DB = "postgresql+psycopg://localone:localone@127.0.0.1:1/localone_test"
ALLOW = "access-control-allow-origin"
WEB_DEV_ORIGIN = "http://localhost:8081"  # Expo 웹 개발 서버 기본 출처


def client(app_env: str) -> TestClient:
    settings = Settings(app_env=app_env, database_url=DB)
    return TestClient(create_app(settings), raise_server_exceptions=False)


def preflight(c: TestClient, origin: str):
    return c.options(
        "/api/v1/ready",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )


@pytest.mark.parametrize("env", ["local", "test"])
@pytest.mark.parametrize(
    "origin", [WEB_DEV_ORIGIN, "http://127.0.0.1:8081", "http://localhost", "https://localhost:3000"]
)
def test_local_origin_is_allowed_in_dev(env, origin):
    with client(env) as c:
        r = preflight(c, origin)
        assert r.status_code == 200
        assert r.headers[ALLOW] == origin
        assert "access-control-allow-credentials" not in r.headers
        simple = c.get("/api/v1/nope", headers={"Origin": origin})
        assert simple.headers[ALLOW] == origin  # 오류 응답에도 붙어 브라우저가 본문을 읽는다


@pytest.mark.parametrize(
    "origin",
    [
        "https://example.com",
        "http://localhost.evil.com",
        "http://evil.com:8081",
        "http://localhost:8081.evil.com",
        "null",
    ],
)
def test_non_local_origin_is_rejected_in_dev(origin):
    with client("local") as c:
        r = preflight(c, origin)
        assert r.status_code == 400
        assert ALLOW not in r.headers
        assert ALLOW not in c.get("/api/v1/nope", headers={"Origin": origin}).headers


def test_production_has_no_cors():
    with client("production") as c:
        r = preflight(c, WEB_DEV_ORIGIN)
        assert ALLOW not in r.headers
        assert ALLOW not in c.get("/api/v1/nope", headers={"Origin": WEB_DEV_ORIGIN}).headers
