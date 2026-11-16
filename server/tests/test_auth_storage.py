"""AUTH-1-P2: users 테이블 스키마·제약·RLS·마이그레이션 왕복 및 run_db 트랜잭션/스레드 검증."""

import asyncio
import threading
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError

from app.common import ApiError
from app.db import run_db

USER_A = UUID("00000000-0000-4000-8000-00000000000a")
USER_B = UUID("00000000-0000-4000-8000-00000000000b")


def _count_users(engine: Engine) -> int:
    with engine.connect() as conn:
        return int(conn.execute(text("SELECT count(*) FROM users")).scalar_one())


def test_users_status_check(db_engine: Engine) -> None:
    with db_engine.begin() as conn:
        row = conn.execute(
            text("INSERT INTO users (id) VALUES (:id) RETURNING id, status, created_at"),
            {"id": USER_A},
        ).one()
        assert row.id == USER_A
        assert row.status == "active"
        assert row.created_at is not None
        assert row.created_at.tzinfo is not None

        dup = conn.execute(
            text("INSERT INTO users (id) VALUES (:id) ON CONFLICT (id) DO NOTHING RETURNING id"),
            {"id": USER_A},
        ).one_or_none()
        assert dup is None

        conn.execute(
            text("INSERT INTO users (id, status) VALUES (:id, 'withdrawn')"),
            {"id": USER_B},
        )
        conn.execute(text("TRUNCATE TABLE users CASCADE"))

    for bad_status in ("x", "", None):
        with pytest.raises(IntegrityError):
            with db_engine.begin() as conn:
                conn.execute(
                    text("INSERT INTO users (id, status) VALUES (:id, :status)"),
                    {"id": USER_A, "status": bad_status},
                )

    assert _count_users(db_engine) == 0


def test_users_rls_enabled(db_engine: Engine) -> None:
    with db_engine.connect() as conn:
        rls_enabled = conn.execute(
            text("SELECT relrowsecurity FROM pg_class WHERE relname = 'users'")
        ).scalar_one()
        policy_count = conn.execute(
            text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'")
        ).scalar_one()

    assert rls_enabled is True
    assert policy_count == 0


def test_migration_round_trip(alembic_config: Config, db_engine: Engine) -> None:
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")

    with db_engine.connect() as conn:
        exists_after_downgrade = conn.execute(
            text("SELECT to_regclass('public.users')")
        ).scalar_one()
    assert exists_after_downgrade is None

    command.upgrade(alembic_config, "head")

    with db_engine.connect() as conn:
        exists_after_upgrade = conn.execute(
            text("SELECT to_regclass('public.users')")
        ).scalar_one()
        rls_after_upgrade = conn.execute(
            text("SELECT relrowsecurity FROM pg_class WHERE relname = 'users'")
        ).scalar_one()

    assert exists_after_upgrade == "users"
    assert rls_after_upgrade is True


def test_run_db_commit_rollback(db_engine: Engine, refusing_db_url: str) -> None:
    async def _scenario() -> None:
        caller_thread = threading.get_ident()
        worker_threads: list[int] = []

        def _insert_ok(conn: Connection) -> UUID:
            worker_threads.append(threading.get_ident())
            conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_A})
            return USER_A

        result = await run_db(db_engine, _insert_ok)
        assert result == USER_A
        assert worker_threads and worker_threads[0] != caller_thread
        assert _count_users(db_engine) == 1

        def _insert_then_api_error(conn: Connection) -> None:
            conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_B})
            raise ApiError(403, "ACCOUNT_WITHDRAWN", "탈퇴한 계정이에요.")

        with pytest.raises(ApiError) as exc_info:
            await run_db(db_engine, _insert_then_api_error)
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "ACCOUNT_WITHDRAWN"
        # 실패한 트랜잭션은 롤백되어 USER_A 1건만 남아야 한다.
        assert _count_users(db_engine) == 1

        def _insert_then_runtime_error(conn: Connection) -> None:
            conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_B})
            raise RuntimeError("unexpected failure")

        with pytest.raises(RuntimeError, match="unexpected failure"):
            await run_db(db_engine, _insert_then_runtime_error)
        assert _count_users(db_engine) == 1

        bad_engine = create_engine(refusing_db_url, connect_args={"connect_timeout": 1})
        try:
            with pytest.raises(ApiError) as db_err:
                await run_db(bad_engine, lambda conn: conn.execute(text("SELECT 1")))
            assert db_err.value.status_code == 503
            assert db_err.value.code == "DB_UNAVAILABLE"
            assert db_err.value.message == "데이터베이스에 연결하지 못했어요."
        finally:
            bad_engine.dispose()

    asyncio.run(_scenario())
