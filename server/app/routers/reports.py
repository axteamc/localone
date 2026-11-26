"""Accept reports against currently visible public content (#37)."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError
from app.db import run_db
from app.routers.ops import TARGETS, lock_target

router = APIRouter(prefix="/api/v1")

# stamp: C-92 공개 스탬프(한마디). user: C-97 사람 신고(target_id = 공개용 profile_id, 저장은 users.id)
ReportKind = Literal["post", "guestbook", "club", "club_comment", "stamp", "user"]


class ReportIn(BaseModel):
    target_kind: ReportKind
    target_id: UUID
    reason: Literal["spam", "abuse", "privacy", "other"]
    text: str | None = None


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "찾을 수 없어요.")


def select_visible_author(c: Connection, kind: ReportKind, target_id: UUID) -> UUID:
    if kind == "club_comment":
        # Lock the parent before the comment so parent moderation orders with acceptance.
        parent_id = c.execute(
            text("SELECT club_id FROM club_comments WHERE id = :id"), {"id": target_id},
        ).scalar_one_or_none()
        parent = lock_target(c, "club", parent_id) if parent_id is not None else None
        if parent is None or parent.status not in TARGETS["club"][2]:
            raise not_found()

    target = lock_target(c, kind, target_id)
    if target is None or target.status not in TARGETS[kind][2]:
        raise not_found()
    return target.owner_id


def select_reported_user(c: Connection, profile_id: UUID) -> UUID:
    """C-97 M4-8: 공개용 profile_id → users.id. 탈퇴했거나 없으면 404."""
    uid = c.execute(
        text("SELECT id FROM users WHERE public_id = :pid AND status = 'active' FOR SHARE"), {"pid": profile_id},
    ).scalar_one_or_none()
    if uid is None:
        raise not_found()
    return uid


INSERT_REPORT = text(
    "INSERT INTO reports (reporter_id, target_kind, target_id, reason, text) "
    "VALUES (:reporter, :kind, :id, :reason, :text) "
    "ON CONFLICT ON CONSTRAINT reports_once_per_target DO NOTHING RETURNING id"
)


@router.post("/reports")
async def create_report(
    request: Request, body: ReportIn, user: CurrentUser = Depends(get_current_user),
) -> JSONResponse:
    detail = body.text
    if body.reason == "other":
        detail = detail.strip() if detail is not None else ""
        if not 1 <= len(detail) <= 200 or "\x00" in detail:
            raise ApiError(422, "VALIDATION_ERROR", "신고 상세를 확인해 주세요.", "text")
    elif detail is not None:
        raise ApiError(422, "VALIDATION_ERROR", "신고 상세를 확인해 주세요.", "text")

    def tx(c: Connection) -> bool:
        lock_active_user(c, user.id)
        if body.target_kind == "user":
            author = select_reported_user(c, body.target_id)
            target_id = author  # reports에는 내부 users.id로 남긴다(운영자 목록이 닉네임을 붙인다)
        else:
            author = select_visible_author(c, body.target_kind, body.target_id)
            target_id = body.target_id
        if author == user.id:
            raise ApiError(422, "VALIDATION_ERROR", "내 글은 신고할 수 없어요", "target_id")
        return c.execute(INSERT_REPORT, {
            "reporter": user.id, "kind": body.target_kind, "id": target_id,
            "reason": body.reason, "text": detail,
        }).first() is not None

    created = await run_db(request.app.state.engine, tx)
    return JSONResponse({"ok": True}, status_code=201 if created else 200)
