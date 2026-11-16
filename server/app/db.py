"""동기 SQLAlchemy 엔진을 스레드 풀의 단일 트랜잭션으로 실행하는 헬퍼."""

import asyncio
from collections.abc import Callable
from typing import TypeVar

from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import InterfaceError, OperationalError

from app.common import ApiError

T = TypeVar("T")
MSG_DB_UNAVAILABLE = "데이터베이스에 연결하지 못했어요."


async def run_db(engine: Engine, fn: Callable[[Connection], T]) -> T:
    """`with engine.begin() as conn: return fn(conn)`을 워커 스레드에서 실행한다."""

    def _run_in_tx() -> T:
        with engine.begin() as conn:
            return fn(conn)

    try:
        return await asyncio.to_thread(_run_in_tx)
    except ApiError:
        raise
    except (OperationalError, InterfaceError, TimeoutError) as exc:
        raise ApiError(503, "DB_UNAVAILABLE", MSG_DB_UNAVAILABLE) from exc
