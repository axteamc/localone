"""빌릴 예정: 목록(#16)·저장(#17)·해제(#18). book-search LIB-3.

본인만 보는 메모이고 도서관 예약이 아니다(N1). `converted` 전환은 LOAN-1 #20만 한다(N6).
"""

import base64
import binascii
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.libraries import area_label_of
from app.services.provider_engine import BookRecord, isbn13_is_valid

LIST_LIMIT_DEFAULT = 20
LIST_LIMIT_MAX = 50

MSG_VALIDATION = "요청 형식이 올바르지 않아요."
MSG_NOT_FOUND = "찾을 수 없어요."
MSG_CONFLICT = "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요."

router = APIRouter(prefix="/api/v1/me/loan-plans")

PlanStatus = Literal["planned", "released", "converted"]

PLAN_COLUMNS = (
    "p.id, p.status, p.created_at, b.isbn13, b.title, b.author, b.cover_url, "
    "l.id AS library_id, l.name AS library_name, l.address AS library_address"
)
PLAN_JOINS = "FROM loan_plans p JOIN books b ON b.id = p.book_id JOIN libraries l ON l.id = p.library_id"


def validation_error(field: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, field)


def plan_public(row: Any) -> dict[str, Any]:
    """응답 `LoanPlan` 모양(C3). user_id는 넣지 않는다."""
    return {
        "id": str(row.id),
        "book": {"isbn13": row.isbn13, "title": row.title, "author": row.author, "cover_url": row.cover_url},
        "library": {
            "id": int(row.library_id),
            "name": row.library_name,
            "area_label": area_label_of(row.library_address),
        },
        "status": row.status,
        "created_at": now_kst(row.created_at).isoformat(timespec="seconds"),
    }


# ─────────── 커서: base64url "(created_at ISO)|(id)" ───────────


def encode_cursor(created_at: datetime, plan_id: UUID) -> str:
    raw = f"{created_at.isoformat()}|{plan_id}".encode()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        created, plan_id = raw.split("|")
        created_at = datetime.fromisoformat(created)
        if created_at.tzinfo is None:
            raise ValueError("시간대 없음")
        return created_at, UUID(plan_id)
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise validation_error("cursor") from exc


# ─────────── #16 목록 ───────────


@router.get("")
async def list_loan_plans(
    request: Request,
    status: PlanStatus = "planned",
    cursor: str | None = None,
    limit: int = Query(LIST_LIMIT_DEFAULT, ge=1, le=LIST_LIMIT_MAX),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    after = decode_cursor(cursor) if cursor else None

    def tx(c: Connection) -> list[Any]:
        where = "p.user_id = :uid AND p.status = :status"
        params: dict[str, Any] = {"uid": user.id, "status": status, "n": limit + 1}
        if after is not None:
            where += " AND (p.created_at, p.id) < (:c_at, :c_id)"
            params.update(c_at=after[0], c_id=after[1])
        return c.execute(
            text(f"SELECT {PLAN_COLUMNS} {PLAN_JOINS} WHERE {where} "
                 "ORDER BY p.created_at DESC, p.id DESC LIMIT :n"),
            params,
        ).all()

    rows = await run_db(request.app.state.engine, tx)
    page, more = rows[:limit], len(rows) > limit
    last = page[-1] if page else None
    return {
        "items": [plan_public(r) for r in page],
        "next_cursor": encode_cursor(last.created_at, last.id) if more and last is not None else None,
    }


# ─────────── #17 저장 ───────────


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 user_id 등은 읽지 않는다

    isbn13: str
    library_id: int


async def _book_for(request: Request, isbn13: str) -> BookRecord:
    try:
        return await request.app.state.provider_engine.get_book(isbn13)
    except ApiError as exc:
        if exc.status_code == 404:  # get_book은 detail이 비어 있어 보강한다(C6 L3-#4)
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "isbn13") from exc
        raise  # 429·503 그대로


INSERT_PLAN_ON_CONFLICT_DO_NOTHING_RETURNING = text(
    "INSERT INTO loan_plans (user_id, book_id, library_id) VALUES (:uid, :book_id, :library_id) "
    "ON CONFLICT (user_id, book_id, library_id) WHERE status = 'planned' DO NOTHING RETURNING id"
)
SELECT_ACTIVE_PLAN = text(
    "SELECT id FROM loan_plans WHERE user_id = :uid AND book_id = :book_id "
    "AND library_id = :library_id AND status = 'planned'"
)


@router.post("")
async def save_loan_plan(
    request: Request, body: PlanCreate, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    isbn13 = body.isbn13.strip()
    if not isbn13_is_valid(isbn13):
        raise validation_error("isbn13")
    if body.library_id < 1:
        raise validation_error("library_id")
    # 책 조회는 외부 I/O라 트랜잭션 밖(PROJECT.md §3-7)
    book = await _book_for(request, isbn13)
    params = {"uid": user.id, "book_id": book.id, "library_id": body.library_id}

    def tx(c: Connection) -> tuple[Any, bool]:
        lock_active_user(c, user.id)
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": body.library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        inserted = c.execute(INSERT_PLAN_ON_CONFLICT_DO_NOTHING_RETURNING, params).first()
        created = inserted is not None
        plan_id = inserted.id if created else c.execute(SELECT_ACTIVE_PLAN, params).scalar_one()
        row = c.execute(text(f"SELECT {PLAN_COLUMNS} {PLAN_JOINS} WHERE p.id = :id"), {"id": plan_id}).one()
        return row, created

    row, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=plan_public(row))


# ─────────── #18 해제 ───────────


def release_tx(c: Connection, uid: UUID, plan_id: UUID) -> dict[str, str]:
    lock_active_user(c, uid)
    row = c.execute(
        text("SELECT id, status FROM loan_plans WHERE id = :id AND user_id = :uid FOR UPDATE"),
        {"id": plan_id, "uid": uid},
    ).first()
    if row is None:
        raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND)  # 남의 것·없는 것 같은 응답(PROJECT.md §3-4)
    if row.status == "converted":
        raise ApiError(409, "CONFLICT", MSG_CONFLICT)
    if row.status == "planned":
        c.execute(
            text("UPDATE loan_plans SET status = 'released', updated_at = now() WHERE id = :id"),
            {"id": plan_id},
        )
    return {"id": str(plan_id), "status": "released"}


@router.delete("/{plan_id}")
async def release_loan_plan(
    request: Request, plan_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, str]:
    return await run_db(request.app.state.engine, lambda c: release_tx(c, user.id, plan_id))
