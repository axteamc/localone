"""반납 집계 동의(PUT /me/settings/return-stats)·집계 쓰기 — core 계약 M2-0-P4 (Z9·C2·C3·C6).

- 동의는 `user_settings.return_stats_consent` 한 칸. 행이 없으면 동의 안 함(기본 false).
- 동의로 바뀔 때만 `consented_at`을 찍고, 같은 값을 다시 보내면 무변경(멱등). 철회하면 `consented_at`은 NULL.
  이미 쌓인 집계는 사용자와 이어지지 않아 되돌릴 수 없다 — 철회 뒤 반납부터 쌓지 않는다(Q-49 임시).
- `record_return_stat`은 #22(`loans.py` 안 D 블록)가 반납 트랜잭션 안에서 부른다.
  `RETURN_STATS_WRITE_ENABLED`가 꺼져 있으면 아무것도 하지 않는다(Q-49 전).
- 집계 행은 도서관-책-서울 날짜뿐이다. `user_id`·`loan_id`는 남기지 않는다(05 R15).
"""

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app import policy
from app.auth import CurrentUser, get_current_user, lock_active_user
from app.db import run_db

router = APIRouter(prefix="/api/v1/me/settings")


class ReturnStatsConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consent: StrictBool


# 같은 값이면 WHERE가 거짓이라 갱신하지 않는다(updated_at·consented_at 그대로)
UPSERT_CONSENT = text(
    "INSERT INTO user_settings (user_id, return_stats_consent, consented_at) "
    "VALUES (:uid, :c, CASE WHEN :c THEN now() END) "
    "ON CONFLICT (user_id) DO UPDATE SET return_stats_consent = EXCLUDED.return_stats_consent, "
    "consented_at = EXCLUDED.consented_at, updated_at = now() "
    "WHERE user_settings.return_stats_consent IS DISTINCT FROM EXCLUDED.return_stats_consent"
)


def set_return_stats_consent(c: Connection, uid: UUID, consent: bool) -> dict[str, Any]:
    lock_active_user(c, uid)
    c.execute(UPSERT_CONSENT, {"uid": uid, "c": consent})
    return {"consent": consent}


@router.put("/return-stats")
async def put_return_stats_consent(
    request: Request, body: ReturnStatsConsent, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    return await run_db(request.app.state.engine, lambda c: set_return_stats_consent(c, user.id, body.consent))


def record_return_stat(c: Connection, uid: UUID, loan_id: UUID, returned_on: date) -> bool:
    """방금 반납된 대출이 동의한 본인의 것이고 도서관이 있으면 집계 +1. 쓴 경우 True.

    부르는 쪽(#22)이 `on_loan → returned`로 바꾼 같은 트랜잭션에서 한 번만 부른다.
    """
    if not policy.RETURN_STATS_WRITE_ENABLED:
        return False
    row = c.execute(
        text("SELECT o.library_id, o.book_id FROM loans o "
             "JOIN user_settings s ON s.user_id = o.user_id AND s.return_stats_consent "
             "WHERE o.id = :id AND o.user_id = :uid AND o.library_id IS NOT NULL"),
        {"id": loan_id, "uid": uid},
    ).first()
    if row is None:
        return False
    c.execute(
        text("INSERT INTO library_return_stats (library_id, book_id, returned_on, return_count) "
             "VALUES (:l, :b, :d, 1) ON CONFLICT (library_id, book_id, returned_on) "
             "DO UPDATE SET return_count = library_return_stats.return_count + 1"),
        {"l": row.library_id, "b": row.book_id, "d": returned_on},
    )
    return True
