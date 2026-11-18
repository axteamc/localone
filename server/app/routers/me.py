"""회원 탈퇴(DELETE /api/v1/me) — 계약 team contracts/auth.md AUTH-3 W1·C5·P4.

탈퇴는 한 트랜잭션이다. 맨 앞에서 users 상태를 바꿔 그 행을 잠그고(동시 쓰기의 lock_active_user
FOR SHARE와 직렬화), C5 표의 테이블을 순서대로 처리한다. users 행은 지우지 않는다(W1·W3).
새로 users를 가리키는 테이블을 만드는 Step은 WITHDRAWAL_STEPS에 한 줄을 더한다(W8, H-ARCH-08).
"""

from collections.abc import Callable
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import MSG_WITHDRAWN, CurrentUser, get_current_user
from app.common import ApiError, now_kst
from app.db import run_db

router = APIRouter()

WITHDRAWN_NICKNAME = "탈퇴한 이웃"

WithdrawalStep = Callable[[Connection, UUID, datetime], None]


def _withdraw_published_posts(conn: Connection, user_id: UUID, now: datetime) -> None:
    # hidden(운영 숨김)은 기록이라 그대로 둔다(W1 ①)
    conn.execute(
        text("UPDATE posts SET status = 'withdrawn', updated_at = :now "
             "WHERE user_id = :uid AND status = 'published'"),
        {"uid": user_id, "now": now},
    )


def _delete_own_reactions_and_bookmarks(conn: Connection, user_id: UUID, now: datetime) -> None:
    # 내가 남긴 것만. 남이 내 글에 남긴 것은 그대로(W7)
    conn.execute(text("DELETE FROM post_reactions WHERE user_id = :uid"), {"uid": user_id})
    conn.execute(text("DELETE FROM post_bookmarks WHERE user_id = :uid"), {"uid": user_id})


def _anonymize_profile(conn: Connection, user_id: UUID, now: datetime) -> None:
    conn.execute(
        text("UPDATE user_profiles SET nickname = :nickname, updated_at = :now WHERE user_id = :uid"),
        {"uid": user_id, "nickname": WITHDRAWN_NICKNAME, "now": now},
    )


# C5 표 순서: ① 공개 철회 → ② 개인 삭제 → ③ 프로필 익명화. ⓪(users 상태)은 withdraw_user_account가 맨 앞에서 한다.
WITHDRAWAL_STEPS: list[WithdrawalStep] = [
    _withdraw_published_posts,  # LOCAL-1 (B)
    _delete_own_reactions_and_bookmarks,  # LOCAL-2 (B)
    _anonymize_profile,
]


def withdraw_user_account(conn: Connection, user_id: UUID) -> dict[str, Any]:
    now = now_kst()
    # ⓪ 맨 앞: 상태 변경으로 users 행을 잠근다. 동시 쓰기(lock_active_user FOR SHARE)는
    #    이 커밋을 기다린 뒤 withdrawn을 보고 403, 두 번째 탈퇴도 여기서 0행 → 403(C6 #19).
    withdrawn = conn.execute(
        text("UPDATE users SET status = 'withdrawn' WHERE id = :uid AND status = 'active' RETURNING id"),
        {"uid": user_id},
    ).one_or_none()
    if withdrawn is None:
        raise ApiError(403, "ACCOUNT_WITHDRAWN", MSG_WITHDRAWN)
    for step in WITHDRAWAL_STEPS:
        step(conn, user_id, now)
    return {
        "user_id": str(user_id),
        "status": "withdrawn",
        "withdrawn_at": now.isoformat(timespec="seconds"),
    }


@router.delete("/api/v1/me")
async def delete_me(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await run_db(request.app.state.engine, lambda c: withdraw_user_account(c, user.id))
