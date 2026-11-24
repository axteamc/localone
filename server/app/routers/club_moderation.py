"""작은 모임 CLUB-2-P2: 출석 확인(#65)·댓글 처리 요청(#66)·재검토 요청(#67)·내 제한(#68).

book-club 계약 CLUB-2 K2-7~K2-10, K2-O1~K2-O5(C-77 확정), C2·C3·C6·P4.
- 출석은 기본 전체 출석이고, 만든 사람이 참가 신청 명단에서 불참자만 `participant_index`로 보낸다(K2-O1).
  보내는 즉시 불참이 확정되고 최근 180일 유효 불참 수로 3일·7일·30일·영구 제한을 만든다(K2-O2·K2-O3).
  시각만으로 불참·제한을 만들지 않는다(K2-7). 되돌리기는 없고 불복은 #67 → 운영자 해제(D M2-0-P2).
- 댓글 처리 요청은 만든 사람만, 댓글 하나에 한 번(B6). 승인 전 댓글은 그대로 보인다. 결정은 D 운영 경로.
- 응답에 `user_id`를 넣지 않는다.
"""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.club_records import MSG_NOT_ENDED, record_view
from app.routers.clubs import (
    MSG_CLOSED, MSG_NOT_HOST, REASON_MAX, SELECT_CLUB_FOR_UPDATE, ended, iso, not_found, validation_error,
)
from app.services.inbox import add_inbox_items

router = APIRouter(prefix="/api/v1")

NO_SHOW_WINDOW = timedelta(days=180)  # K2-O3 최근 6개월
NO_SHOW_DAYS = {1: 3, 2: 7, 3: 30}  # K2-8, 4번째부터 영구(ends_at NULL)
NO_SHOW_TEXT = "불참으로 기록됐어요"  # 불참 제한의 본인에게 보이는 사유(C3)
REVIEW_TEXT_MAX = 500  # 재검토 요청 글(기본값 Claude)


# ─────────── #65 출석 확인 ───────────


class AttendanceMark(BaseModel):
    model_config = ConfigDict(extra="ignore")

    participant_index: int


class AttendanceIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    marks: list[AttendanceMark]


SELECT_PEOPLE_FOR_ATTENDANCE = text(
    "SELECT p.user_id, p.attendance_status FROM club_participations p JOIN clubs c ON c.id = p.club_id "
    "WHERE p.club_id = :id AND p.state = 'joined' AND p.user_id <> c.host_id ORDER BY p.joined_at, p.user_id"
)  # CLUB-1 SELECT_PARTICIPANTS와 같은 순서 = 앱이 받은 Club.participants 순서
COUNT_NO_SHOW = text(
    "SELECT count(*) FROM participation_restrictions WHERE user_id = :uid AND reason_kind = 'no_show' "
    "AND lifted_at IS NULL AND created_at > :since"
)
INSERT_RESTRICTION = text(
    "INSERT INTO participation_restrictions (user_id, reason_kind, source_id, reason_text, starts_at, ends_at) "
    "VALUES (:uid, :kind, :source, :reason, :now, :ends) RETURNING id"
)


def no_show_ends(count_with_this: int, now: datetime) -> datetime | None:
    if count_with_this >= 4:
        return None
    return now + timedelta(days=NO_SHOW_DAYS[count_with_this])


@router.put("/clubs/{club_id}/attendance")
async def put_attendance(
    request: Request, club_id: UUID, body: AttendanceIn, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        lock_active_user(c, user.id)
        club = c.execute(SELECT_CLUB_FOR_UPDATE, {"id": club_id}).first()
        if not club or club.status == "hidden":
            raise not_found()
        if club.host_id != user.id:
            raise ApiError(403, "NOT_HOST", MSG_NOT_HOST)
        if club.status == "canceled":
            raise ApiError(409, "CLUB_CLOSED", MSG_CLOSED)  # 패널티 없음(K1-12)
        now = now_kst()
        if not ended(club, now):
            raise ApiError(409, "CLUB_NOT_ENDED", MSG_NOT_ENDED)
        people = c.execute(SELECT_PEOPLE_FOR_ATTENDANCE, {"id": club_id}).all()
        idx = [m.participant_index for m in body.marks]
        if len(set(idx)) != len(idx) or any(i < 0 or i >= len(people) for i in idx):
            raise validation_error("marks")
        for i in idx:
            p = people[i]
            if p.attendance_status == "no_show":
                continue  # 멱등, 되돌리기 없음
            # 같은 사람의 제한 수 세기·만들기를 줄 세운다(동시에 두 모임에서 불참 확인)
            c.execute(text("SELECT 1 FROM users WHERE id = :uid FOR UPDATE"), {"uid": p.user_id})
            c.execute(text("UPDATE club_participations SET attendance_status = 'no_show', updated_at = now() "
                           "WHERE club_id = :id AND user_id = :uid"), {"id": club_id, "uid": p.user_id})
            n = c.execute(COUNT_NO_SHOW, {"uid": p.user_id, "since": now - NO_SHOW_WINDOW}).scalar_one() + 1
            restriction_id = c.execute(INSERT_RESTRICTION, {
                "uid": p.user_id, "kind": "no_show", "source": club_id, "reason": NO_SHOW_TEXT,
                "now": now, "ends": no_show_ends(n, now),
            }).scalar_one()
            add_inbox_items(c, [p.user_id], "moderation", {"club_id": str(club_id), "restriction": str(restriction_id)})
        return record_view(c, club_id, user)

    return await run_db(request.app.state.engine, tx)


# ─────────── #66 댓글 처리 요청 ───────────


class ModerationRequestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: str


def request_view(row: Any) -> dict[str, Any]:
    return {"id": str(row.id), "comment_id": str(row.comment_id), "status": row.status}


@router.post("/club-comments/{comment_id}/moderation-request")
async def request_comment_moderation(
    request: Request, comment_id: UUID, body: ModerationRequestIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    reason = body.reason.strip()
    if not 1 <= len(reason) <= REASON_MAX:  # C3 사유 1~200
        raise validation_error("reason")

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_active_user(c, user.id)
        row = c.execute(text(
            "SELECT m.id, m.user_id, m.status, c.host_id, c.status AS club_status "
            "FROM club_comments m JOIN clubs c ON c.id = m.club_id WHERE m.id = :id"
        ), {"id": comment_id}).first()
        if row is None or row.status != "published" or row.club_status == "hidden":
            raise not_found("comment_id")
        if row.host_id != user.id:
            raise ApiError(403, "NOT_HOST", MSG_NOT_HOST)
        if row.user_id == user.id:
            raise validation_error("comment_id")  # 내 댓글은 직접 지운다(#59)
        inserted = c.execute(text(
            "INSERT INTO club_comment_requests (comment_id, requester_id, reason) VALUES (:cid, :uid, :reason) "
            "ON CONFLICT ON CONSTRAINT club_comment_requests_once DO NOTHING RETURNING id, comment_id, status"
        ), {"cid": comment_id, "uid": user.id, "reason": reason}).first()
        if inserted is not None:
            return request_view(inserted), True
        existing = c.execute(text("SELECT id, comment_id, status FROM club_comment_requests WHERE comment_id = :cid"),
                             {"cid": comment_id}).one()
        return request_view(existing), False  # 이미 요청(B6)

    view, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=view)


# ─────────── #67 재검토 요청 · #68 내 제한 ───────────

RESTRICTION_COLUMNS = "id, reason_kind, reason_text, ends_at, review_requested_at"


def restriction_view(row: Any) -> dict[str, Any]:
    """응답 `Restriction`(C3)."""
    return {
        "id": str(row.id),
        "reason_kind": row.reason_kind,
        "ends_at": iso(row.ends_at),
        "reason_text": row.reason_text,
        "review_requested": row.review_requested_at is not None,
    }


class ReviewRequestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str | None = None


@router.post("/me/restrictions/{restriction_id}/review-request")
async def request_restriction_review(
    request: Request, restriction_id: UUID, body: ReviewRequestIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    review_text = (body.text or "").strip() or None
    if review_text is not None and len(review_text) > REVIEW_TEXT_MAX:
        raise validation_error("text")

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_active_user(c, user.id)
        row = c.execute(text(
            f"SELECT {RESTRICTION_COLUMNS}, lifted_at FROM participation_restrictions "
            "WHERE id = :id AND user_id = :uid FOR UPDATE"
        ), {"id": restriction_id, "uid": user.id}).first()
        if row is None:
            raise not_found("restriction_id")  # 남의 제한은 있는지도 알리지 않는다
        if row.review_requested_at is not None or row.lifted_at is not None:
            return restriction_view(row), False  # 이미 요청·이미 해제: 무변경
        updated = c.execute(text(
            f"UPDATE participation_restrictions SET review_requested_at = now(), review_text = :review_text "
            f"WHERE id = :id RETURNING {RESTRICTION_COLUMNS}"
        ), {"id": restriction_id, "review_text": review_text}).one()
        return restriction_view(updated), True

    view, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=view)


@router.get("/me/restrictions")
async def list_my_restrictions(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """해제 전 제한 중 지금 걸려 있거나, 최근 180일 안이라 불참 횟수에 세는 것. 최근순."""

    def tx(c: Connection) -> list[Any]:
        now = now_kst()
        return c.execute(text(
            f"SELECT {RESTRICTION_COLUMNS} FROM participation_restrictions WHERE user_id = :uid "
            "AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > :now "
            "OR (reason_kind = 'no_show' AND created_at > :since)) ORDER BY created_at DESC, id DESC"
        ), {"uid": user.id, "now": now, "since": now - NO_SHOW_WINDOW}).all()

    return {"items": [restriction_view(r) for r in await run_db(request.app.state.engine, tx)]}
