"""SRV-0-P1: 실제 DB 잠금, 선택 인증, 공통 422 응답 계약."""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic
from uuid import UUID

import jwt
import pytest
from fastapi import Body, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import CurrentUser, get_optional_user, lock_active_user
from app.common import ApiError
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID

USER_A = UUID(USER_A_ID)


def _write(conn):
    lock_active_user(conn, USER_A)
    # 다른 기능의 테이블 대신 시험용 사용자 행으로 쓰기 부수효과를 관측한다.
    conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": UUID(USER_B_ID)})


def _assert_no_write(engine):
    with engine.connect() as conn:
        assert conn.execute(
            text("SELECT count(*) FROM users WHERE id = :id"), {"id": UUID(USER_B_ID)}
        ).scalar_one() == 0


@pytest.mark.parametrize("status,expected", [("withdrawn", (403, "ACCOUNT_WITHDRAWN")),
                                             (None, (401, "AUTH_NOT_REGISTERED"))])
def test_lock_active_user_rejects_inactive_or_missing(db_engine, status, expected):
    if status:
        with db_engine.begin() as conn:
            conn.execute(text("INSERT INTO users (id, status) VALUES (:id, :status)"),
                         {"id": USER_A, "status": status})
    with pytest.raises(ApiError) as caught:
        with db_engine.begin() as conn:
            _write(conn)
    assert (caught.value.status_code, caught.value.code) == expected
    _assert_no_write(db_engine)


def test_lock_active_user_allows_active(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_A})
    with db_engine.begin() as conn:
        _write(conn)
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 2


def test_withdraw_during_write_blocks_write(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_A})
    pids = Queue()

    def writer():
        with db_engine.connect() as conn:
            pids.put(conn.execute(text("SELECT pg_backend_pid()")).scalar_one())
            conn.rollback()
            with conn.begin():
                _write(conn)

    with ThreadPoolExecutor(max_workers=1) as pool:
        with db_engine.connect() as withdraw:
            tx = withdraw.begin()
            withdraw.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"),
                             {"id": USER_A})
            future = pool.submit(writer)
            try:
                pid = pids.get(timeout=5)
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(
                            text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"),
                            {"pid": pid},
                        ).scalar_one()
                        if blocked:
                            break
                assert blocked, "쓰기 SQL이 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            with pytest.raises(ApiError) as caught:
                future.result(timeout=5)
    assert (caught.value.status_code, caught.value.code) == (403, "ACCOUNT_WITHDRAWN")
    _assert_no_write(db_engine)


@pytest.fixture
def client(test_db_url, fake_jwks_client):
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)

    @app.get("/test/optional")
    async def optional(user: CurrentUser | None = Depends(get_optional_user)):
        return {"user_id": str(user.id) if user else None}

    @app.get("/test/validation")
    async def validation(b: int, a: int):
        return {"a": a, "b": b}

    @app.post("/test/body")
    async def body(value: dict = Body(...)):
        return value

    @app.get("/test/duplicate-fields")
    async def duplicate_fields():
        raise RequestValidationError([
            {"loc": ("query", "b"), "msg": "bad", "type": "value_error"},
            {"loc": ("query", "a"), "msg": "bad", "type": "value_error"},
            {"loc": ("body", "a"), "msg": "bad", "type": "value_error"},
        ])

    with TestClient(app) as result:
        yield result


def test_optional_user_none_without_header(client):
    response = client.get("/test/optional")
    assert response.status_code == 200
    assert response.json() == {"user_id": None}


@pytest.mark.parametrize("header,code", [("Bearer broken.token", "AUTH_INVALID"),
                                          ("", "AUTH_REQUIRED"), ("Basic abc", "AUTH_REQUIRED")])
def test_optional_user_rejects_bad_token(client, db_engine, header, code):
    response = client.get("/test/optional", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == code
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 0


@pytest.mark.parametrize("status,expected,code", [(None, 401, "AUTH_NOT_REGISTERED"),
                                                  ("withdrawn", 403, "ACCOUNT_WITHDRAWN"),
                                                  ("active", 200, None)])
def test_optional_user_uses_current_user_checks(client, db_engine, make_token, status, expected, code):
    if status:
        with db_engine.begin() as conn:
            conn.execute(text("INSERT INTO users (id, status) VALUES (:id, :status)"),
                         {"id": USER_A, "status": status})
    response = client.get("/test/optional", headers={"Authorization": f"Bearer {make_token()}"})
    assert response.status_code == expected
    if code:
        assert response.json()["error"]["code"] == code
    else:
        assert response.json() == {"user_id": USER_A_ID}


def test_optional_user_preserves_expired_and_unavailable(client, make_token, fake_jwks_client):
    response = client.get("/test/optional", headers={"Authorization": f"Bearer {make_token(exp=1)}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_EXPIRED"
    fake_jwks_client.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientConnectionError()
    response = client.get("/test/optional", headers={"Authorization": f"Bearer {make_token()}"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_UNAVAILABLE"


def test_validation_detail_lists_fields(client):
    for path in ("/test/validation", "/test/duplicate-fields"):
        response = client.get(path)
        assert response.status_code == 422
        assert response.json() == {"error": {"code": "VALIDATION_ERROR",
                                            "message": "요청 형식이 올바르지 않아요.", "detail": "a,b"}}
    response = client.post("/test/body", json=[])
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == "body"
