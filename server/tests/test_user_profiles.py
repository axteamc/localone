"""SRV-0-P2: 닉네임 생성·멱등·롤백 및 M1 스키마/RLS 계약."""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Event
from time import monotonic
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app import auth
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL

USER_ID = UUID("abcd1234-0000-4000-8000-00000000000a")


@pytest.fixture
def client(test_db_url, fake_jwks_client):
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    with TestClient(app, raise_server_exceptions=False) as result:
        yield result


def _session(client, make_token):
    return client.post("/api/v1/auth/session",
                       headers={"Authorization": f"Bearer {make_token(sub=str(USER_ID))}"})


def _profile(engine):
    with engine.connect() as conn:
        return conn.execute(text("SELECT user_id, nickname, updated_at FROM user_profiles")).all()


def test_session_creates_profile_once(client, make_token, db_engine):
    first = _session(client, make_token)
    before = _profile(db_engine)
    second = _session(client, make_token)
    assert first.status_code == second.status_code == 200
    assert first.json()["is_new"] is True
    assert second.json()["is_new"] is False
    assert set(first.json()) == {"user_id", "status", "is_new", "created_at"}
    assert len(before) == 1
    assert before[0].user_id == USER_ID
    assert before[0].nickname == "이웃-abcd"
    assert before[0].updated_at.tzinfo is not None
    assert _profile(db_engine) == before


def test_session_preserves_existing_nickname(client, make_token, db_engine):
    assert _session(client, make_token).status_code == 200
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE user_profiles SET nickname = '기존 이웃'"))
    before = _profile(db_engine)
    assert _session(client, make_token).status_code == 200
    assert _profile(db_engine) == before


def test_session_backfills_existing_active_user(client, make_token, db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_ID})
    response = _session(client, make_token)
    assert response.status_code == 200
    assert response.json()["is_new"] is False
    assert _profile(db_engine)[0].nickname == "이웃-abcd"


def test_session_concurrent_profile_is_single_row(client, make_token, db_engine):
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_session, client, make_token) for _ in range(2)]
        responses = [f.result(timeout=10) for f in futures]
    assert [r.status_code for r in responses] == [200, 200]
    assert sorted(r.json()["is_new"] for r in responses) == [False, True]
    assert len(_profile(db_engine)) == 1


def test_session_rollback_leaves_no_profile(client, make_token, db_engine, monkeypatch):
    original = auth.ensure_user_profile_if_absent

    def fail_after_profile(conn, user_id):
        original(conn, user_id)
        raise RuntimeError("injected failure after both inserts")

    monkeypatch.setattr(auth, "ensure_user_profile_if_absent", fail_after_profile)
    assert _session(client, make_token).status_code == 500
    assert _profile(db_engine) == []
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 0


def test_withdrawn_session_leaves_no_profile(client, make_token, db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, status) VALUES (:id, 'withdrawn')"),
                     {"id": USER_ID})
    response = _session(client, make_token)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    assert _profile(db_engine) == []


def test_withdraw_between_registration_and_profile_is_rejected(client, make_token, db_engine, monkeypatch):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_ID})
    paused, release = Event(), Event()
    original = auth.insert_user_if_absent

    def pause_before_insert(conn, user_id):
        paused.set()
        assert release.wait(5)
        return original(conn, user_id)

    monkeypatch.setattr(auth, "insert_user_if_absent", pause_before_insert)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_session, client, make_token)
        try:
            assert paused.wait(5)
            with db_engine.begin() as conn:
                conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"),
                             {"id": USER_ID})
        finally:
            release.set()
        response = future.result(timeout=5)
    assert response.status_code == 403
    assert _profile(db_engine) == []


def test_session_holds_user_lock_until_profile_commit(client, make_token, db_engine, monkeypatch):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_ID})
    paused, release = Event(), Event()
    pids = Queue()
    original = auth.select_user

    def pause_after_select(conn, user_id):
        row = original(conn, user_id)
        paused.set()
        assert release.wait(5)
        return row

    def withdraw():
        with db_engine.connect() as conn:
            pids.put(conn.execute(text("SELECT pg_backend_pid()")).scalar_one())
            conn.rollback()
            with conn.begin():
                conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"),
                             {"id": USER_ID})

    monkeypatch.setattr(auth, "select_user", pause_after_select)
    with ThreadPoolExecutor(max_workers=2) as pool:
        session_future = pool.submit(_session, client, make_token)
        try:
            assert paused.wait(5)
            withdrawal_future = pool.submit(withdraw)
            pid = pids.get(timeout=5)
            deadline = monotonic() + 3
            blocked = False
            with db_engine.connect() as observer:
                while monotonic() < deadline and not withdrawal_future.done():
                    blocked = observer.execute(
                        text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": pid}
                    ).scalar_one()
                    if blocked:
                        break
            assert blocked, "상태 조회 뒤 프로필 생성까지 users 잠금을 유지해야 한다"
        finally:
            release.set()
        assert session_future.result(timeout=5).status_code == 200
        withdrawal_future.result(timeout=5)
    assert len(_profile(db_engine)) == 1


@pytest.mark.parametrize("nickname", ["", "   ", "가" * 41])
def test_user_profiles_nickname_check(db_engine, nickname):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_ID})
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text("INSERT INTO user_profiles (user_id, nickname) VALUES (:id, :nickname)"),
                         {"id": USER_ID, "nickname": nickname})
    assert _profile(db_engine) == []


def test_user_profiles_schema_and_foreign_key(db_engine):
    columns = {c["name"]: c for c in inspect(db_engine).get_columns("user_profiles")}
    # MY-1-P1(my-collection C5)이 bio·avatar_url(NULL 허용)을 더했다. M1 3컬럼은 그대로 NOT NULL
    # C-90(0028)이 club_notices(NOT NULL, 기본 true)를 더했다
    assert set(columns) == {"user_id", "nickname", "updated_at", "bio", "avatar_url", "club_notices"}
    assert all(not columns[name]["nullable"] for name in ("user_id", "nickname", "updated_at", "club_notices"))
    assert columns["club_notices"]["default"] == "true"
    assert columns["bio"]["nullable"] and columns["avatar_url"]["nullable"]
    assert columns["updated_at"]["default"] == "now()"
    assert columns["updated_at"]["type"].timezone is True
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_ID})
        conn.execute(text("INSERT INTO user_profiles (user_id, nickname) VALUES (:id, :nickname)"),
                     {"id": USER_ID, "nickname": "가" * 40})
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": USER_ID})
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text("INSERT INTO user_profiles (user_id, nickname) VALUES (:id, '중복')"),
                         {"id": USER_ID})
    assert len(_profile(db_engine)) == 1


def test_user_profiles_rls_enabled(db_engine):
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class "
                                 "WHERE oid = 'public.user_profiles'::regclass")).scalar_one() is True
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public' "
                                 "AND tablename = 'user_profiles'")).scalar_one() == 0


def test_nickname_of_fallback_and_existing(client, make_token, db_engine):
    with db_engine.connect() as conn:
        assert auth.nickname_of(conn, USER_ID) == "이웃"
    assert _session(client, make_token).status_code == 200
    with db_engine.connect() as conn:
        assert auth.nickname_of(conn, USER_ID) == "이웃-abcd"
