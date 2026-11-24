"""회원 탈퇴(DELETE /api/v1/me) — 계약 team contracts/auth.md AUTH-3 W1·C5·P4, core.md M2-0 Z10·P5 세부.

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
from app.services.inbox import add_inbox_items

router = APIRouter()

WITHDRAWN_NICKNAME = "탈퇴한 이웃"
CLUB_CANCEL_REASON = "만든 사람이 탈퇴했어요"  # book-club.md CLUB-1 C5 "탈퇴"

WithdrawalStep = Callable[[Connection, UUID, datetime], None]


def _withdraw_published_posts(conn: Connection, user_id: UUID, now: datetime) -> None:
    # hidden(운영 숨김)은 기록이라 그대로 둔다(W1 ①)
    conn.execute(
        text("UPDATE posts SET status = 'withdrawn', updated_at = :now "
             "WHERE user_id = :uid AND status = 'published'"),
        {"uid": user_id, "now": now},
    )


# ── [m2-core-D+B] M2-0-P5: 0012 B 표(Z10, local-feed VISIT-3) ──

def _withdraw_published_guestbook(conn: Connection, user_id: UUID, now: datetime) -> None:
    # VISIT-3. hidden은 운영 기록이라 그대로(posts와 같음)
    conn.execute(
        text("UPDATE guestbook_entries SET status = 'withdrawn', updated_at = :now "
             "WHERE user_id = :uid AND status = 'published'"),
        {"uid": user_id, "now": now},
    )


# ── [m2-core-D+C] M2-0-P5: 0012 C 표(Z10, book-club CLUB-1 — 2026-11-19 B→C 재배분) ──

def _leave_joined_clubs(conn: Connection, user_id: UUID, now: datetime) -> None:
    # CLUB-1. removed는 운영·만든 사람 처리 기록이라 그대로
    conn.execute(
        text("UPDATE club_participations SET state = 'left', updated_at = :now "
             "WHERE user_id = :uid AND state = 'joined'"),
        {"uid": user_id, "now": now},
    )


def _delete_published_club_comments(conn: Connection, user_id: UUID, now: datetime) -> None:
    # CLUB-1. hidden은 그대로
    conn.execute(
        text("UPDATE club_comments SET status = 'deleted' WHERE user_id = :uid AND status = 'published'"),
        {"uid": user_id},
    )


def _cancel_unstarted_hosted_clubs(conn: Connection, user_id: UUID, now: datetime) -> None:
    # CLUB-1. 시작 전(미정 포함)·open/closed만. 시작한 모임·hidden·canceled는 그대로.
    # 남아 있는 참가자에게 club_canceled 안내(K1-8과 같음)
    canceled = conn.execute(
        text("UPDATE clubs SET status = 'canceled', cancel_reason = :reason, updated_at = :now "
             "WHERE host_id = :uid AND status IN ('open', 'closed') "
             "AND (starts_at IS NULL OR starts_at > :now) RETURNING id"),
        {"uid": user_id, "now": now, "reason": CLUB_CANCEL_REASON},
    ).scalars().all()
    for club_id in canceled:
        recipients = conn.execute(
            text("SELECT user_id FROM club_participations "
                 "WHERE club_id = :c AND state = 'joined' AND user_id <> :uid"),
            {"c": club_id, "uid": user_id},
        ).scalars().all()
        add_inbox_items(conn, list(recipients), "club_canceled", {"club_id": str(club_id)})


# ── 개인 삭제 ──

def _delete_own_reactions_and_bookmarks(conn: Connection, user_id: UUID, now: datetime) -> None:
    # 내가 남긴 것만. 남이 내 글에 남긴 것은 그대로(W7)
    conn.execute(text("DELETE FROM post_reactions WHERE user_id = :uid"), {"uid": user_id})
    conn.execute(text("DELETE FROM post_bookmarks WHERE user_id = :uid"), {"uid": user_id})


# ── [m2-core-D+B] M2-0-P5 2차: VISIT-4(0023) · LOCAL-3(0024) ──

def _delete_own_stamp_bookmarks(conn: Connection, user_id: UUID, now: datetime) -> None:
    # VISIT-4(0023): visit_stamps 삭제보다 먼저 내가 저장한 스탬프 북마크를 삭제한다(Z10·P5 세부).
    conn.execute(text("DELETE FROM stamp_bookmarks WHERE user_id = :uid"), {"uid": user_id})


def _delete_own_visit_stamps(conn: Connection, user_id: UUID, now: datetime) -> None:
    # VISIT-4(0023): 내 방문 스탬프 삭제(남이 내 스탬프에 남긴 북마크는 FK ON DELETE CASCADE로 정리).
    conn.execute(text("DELETE FROM visit_stamps WHERE user_id = :uid"), {"uid": user_id})


def _delete_own_loans(conn: Connection, user_id: UUID, now: datetime) -> None:
    # loan_plans보다 먼저 — loans.plan_id가 loan_plans를 가리킨다(C5 마지막 행)
    conn.execute(text("DELETE FROM loans WHERE user_id = :uid"), {"uid": user_id})


def _delete_own_loan_plans(conn: Connection, user_id: UUID, now: datetime) -> None:
    conn.execute(text("DELETE FROM loan_plans WHERE user_id = :uid"), {"uid": user_id})


def _clear_own_post_reading_logs(conn: Connection, user_id: UUID, now: datetime) -> None:
    # LOCAL-3(0024): reading_logs 삭제보다 먼저 내 게시물(hidden 포함)의 reading_log_id 연결을 끊는다(Z10·P5 세부).
    conn.execute(
        text("UPDATE posts SET reading_log_id = NULL WHERE user_id = :uid AND reading_log_id IS NOT NULL"),
        {"uid": user_id},
    )


# ── [m2-core-D+A] M2-0-P5 2차: READ-1(0018) ──

def _delete_own_reading_logs(conn: Connection, user_id: UUID, now: datetime) -> None:
    # READ-1(0018): 비공개 독서 기록 본인 행만 삭제(Z10·P5 세부).
    conn.execute(text("DELETE FROM reading_logs WHERE user_id = :uid"), {"uid": user_id})


# ── [m2-core-D] M2-0-P5: D 표(Z10) ──

def _delete_own_inbox_items(conn: Connection, user_id: UUID, now: datetime) -> None:
    # P1 알림함. 공개 철회 단계(모임 취소 안내)가 남에게만 쓰므로 그 뒤에 둔다
    conn.execute(text("DELETE FROM inbox_items WHERE recipient_id = :uid"), {"uid": user_id})


def _delete_own_user_settings(conn: Connection, user_id: UUID, now: datetime) -> None:
    # P4 내 설정(반납 집계 동의 포함). 이미 쌓인 집계는 사용자와 이어지지 않아 그대로
    conn.execute(text("DELETE FROM user_settings WHERE user_id = :uid"), {"uid": user_id})


def _anonymize_profile(conn: Connection, user_id: UUID, now: datetime) -> None:
    conn.execute(
        text("UPDATE user_profiles SET nickname = :nickname, updated_at = :now WHERE user_id = :uid"),
        {"uid": user_id, "nickname": WITHDRAWN_NICKNAME, "now": now},
    )


def _delete_own_club_reviews(conn: Connection, user_id: UUID, now: datetime) -> None:
    conn.execute(text("DELETE FROM club_reviews WHERE user_id = :uid"), {"uid": user_id})


# C5 표 순서: ① 공개 철회 → ② 개인 삭제 → ③ 프로필 익명화. ⓪(users 상태)은 withdraw_user_account가 맨 앞에서 한다.
# 남기는 표(운영 기록, Z10): reports(B LOCAL-4), club_comment_requests·participation_restrictions(C CLUB-2),
#   moderation_actions·operators(D)
WITHDRAWAL_STEPS: list[WithdrawalStep] = [
    _withdraw_published_posts,  # LOCAL-1 (B)
    _withdraw_published_guestbook,  # VISIT-3 (B, 0012)
    _leave_joined_clubs,  # CLUB-1 (C, 0012)
    _delete_published_club_comments,  # CLUB-1 (C, 0012)
    _cancel_unstarted_hosted_clubs,  # CLUB-1 (C, 0012)
    _delete_own_reactions_and_bookmarks,  # LOCAL-2 (B)
    _delete_own_stamp_bookmarks,  # VISIT-4 (B, 0023) — visit_stamps보다 먼저
    _delete_own_visit_stamps,  # VISIT-4 (B, 0023)
    _delete_own_loans,  # LOAN-1 (C) — loan_plans보다 먼저
    _delete_own_loan_plans,  # LIB-3 (C)
    _clear_own_post_reading_logs,  # LOCAL-3 (B, 0024) — reading_logs보다 먼저
    _delete_own_reading_logs,  # READ-1 (A, 0018)
    _delete_own_inbox_items,  # M2-0-P1 (D)
    _delete_own_user_settings,  # M2-0-P4 (D)
    _delete_own_club_reviews,  # CLUB-2 (C)
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
