"""AUTH-3-P1: 회원 탈퇴 DELETE /api/v1/me (W1·W2·W7, C5 표, C6 #18~#21)."""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.auth import lock_active_user
from app.common import ApiError
from app.main import create_app
from app.routers import me as me_router
from app.routers.me import WITHDRAWN_NICKNAME, withdraw_user_account
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID

A = UUID(USER_A_ID)
B = UUID(USER_B_ID)


@pytest.fixture
def client(test_db_url: str, fake_jwks_client: Any):
    app = create_app(
        Settings(app_env="test", database_url=test_db_url, supabase_url=TEST_SUPABASE_URL),
        fake_jwks_client,
    )
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client: TestClient, make_token: Any) -> dict[str, dict[str, str]]:
    """A·B를 실제 경로(POST /auth/session)로 등록한다 — users·user_profiles 행이 생긴다."""
    headers = {}
    for name, uid in (("A", USER_A_ID), ("B", USER_B_ID)):
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


def scalar(engine: Engine, sql: str, **params: Any) -> Any:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


def status_of(engine: Engine, uid: UUID) -> str:
    return scalar(engine, "SELECT status FROM users WHERE id = :u", u=uid)


def nickname_of(engine: Engine, uid: UUID) -> str:
    return scalar(engine, "SELECT nickname FROM user_profiles WHERE user_id = :u", u=uid)


def err(res: Any) -> tuple[int, str]:
    return res.status_code, res.json()["error"]["code"]


def test_withdraw_marks_user_and_returns_kst(client, auth, db_engine):
    res = client.delete("/api/v1/me", headers=auth["A"])
    assert res.status_code == 200
    body = res.json()
    assert body["user_id"] == USER_A_ID and body["status"] == "withdrawn"
    assert body["withdrawn_at"].endswith("+09:00") and len(body["withdrawn_at"]) == 25
    assert status_of(db_engine, A) == "withdrawn"
    assert status_of(db_engine, B) == "active"
    assert scalar(db_engine, "SELECT count(*) FROM users") == 2  # users 행은 지우지 않는다(W1)


def test_withdraw_blocks_remaining_tokens(client, auth, db_engine):
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    created = scalar(db_engine, "SELECT created_at FROM users WHERE id = :u", u=A)
    for method, path in (("GET", "/api/v1/me"), ("POST", "/api/v1/auth/session"), ("DELETE", "/api/v1/me")):
        res = client.request(method, path, headers=auth["A"])
        assert err(res) == (403, "ACCOUNT_WITHDRAWN"), (method, path)
        assert res.json()["error"]["message"] == "탈퇴한 계정이에요."
    assert status_of(db_engine, A) == "withdrawn"
    assert scalar(db_engine, "SELECT created_at FROM users WHERE id = :u", u=A) == created
    assert nickname_of(db_engine, A) == WITHDRAWN_NICKNAME  # 재등록이 프로필을 되살리지 않음


def test_withdraw_anonymizes_only_own_profile(client, auth, db_engine):
    before_b = nickname_of(db_engine, B)
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert nickname_of(db_engine, A) == "탈퇴한 이웃"
    assert nickname_of(db_engine, B) == before_b


def test_withdraw_twice_second_is_403_unchanged(auth, db_engine):
    # get_current_user를 거치지 않는 직접 호출도 ⓪의 status='active' 조건에서 막힌다
    with db_engine.begin() as conn:
        withdraw_user_account(conn, A)
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE user_profiles SET nickname = '되살아난 이름' WHERE user_id = :u"), {"u": A})
    with pytest.raises(ApiError) as caught, db_engine.begin() as conn:
        withdraw_user_account(conn, A)
    assert (caught.value.status_code, caught.value.code) == (403, "ACCOUNT_WITHDRAWN")
    assert nickname_of(db_engine, A) == "되살아난 이름"  # 두 번째는 아무 단계도 돌지 않음


def test_withdraw_failure_rolls_back(client, auth, db_engine, monkeypatch):
    def boom(conn, user_id, now):
        raise RuntimeError("단계 실패")

    monkeypatch.setattr(me_router, "WITHDRAWAL_STEPS", [*me_router.WITHDRAWAL_STEPS, boom])
    before = nickname_of(db_engine, A)
    res = client.delete("/api/v1/me", headers=auth["A"])
    assert err(res) == (500, "INTERNAL_ERROR")
    assert status_of(db_engine, A) == "active"  # ⓪도 롤백
    assert nickname_of(db_engine, A) == before


def test_withdraw_requires_auth_and_ignores_body(client, auth, db_engine):
    res = client.delete("/api/v1/me")
    assert err(res) == (401, "AUTH_REQUIRED")
    assert status_of(db_engine, A) == "active" and status_of(db_engine, B) == "active"

    res = client.request("DELETE", f"/api/v1/me?user_id={USER_B_ID}", headers=auth["A"],
                         json={"user_id": USER_B_ID})
    assert res.status_code == 200 and res.json()["user_id"] == USER_A_ID
    assert status_of(db_engine, A) == "withdrawn"
    assert status_of(db_engine, B) == "active"


def test_write_during_withdraw_is_403_no_row(auth, db_engine):
    """탈퇴 트랜잭션이 ⓪을 하고 열려 있는 동안 들어온 쓰기는 기다렸다가 403, 행 0(C6 #21)."""
    pids: Queue = Queue()

    def writer():
        with db_engine.connect() as conn:
            pids.put(conn.execute(text("SELECT pg_backend_pid()")).scalar_one())
            conn.rollback()
            with conn.begin():
                lock_active_user(conn, A)
                conn.execute(text("UPDATE user_profiles SET nickname = '쓰기' WHERE user_id = :u"), {"u": A})

    with ThreadPoolExecutor(max_workers=1) as pool:
        with db_engine.connect() as withdraw:
            tx = withdraw.begin()
            withdraw_user_account(withdraw, A)
            future = pool.submit(writer)
            try:
                pid = pids.get(timeout=5)
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(
                            text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": pid}
                        ).scalar_one()
                        if blocked:
                            break
                assert blocked, "쓰기가 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            with pytest.raises(ApiError) as caught:
                future.result(timeout=5)
    assert (caught.value.status_code, caught.value.code) == (403, "ACCOUNT_WITHDRAWN")
    assert nickname_of(db_engine, A) == WITHDRAWN_NICKNAME
