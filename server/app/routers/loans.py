"""내 대출: 목록(#19)·빌렸어요(#20). loan-assistant LOAN-1.

대출은 사용자가 "빌렸어요"를 눌러야 시작한다(M1). 대출일은 서버 서울 날짜만 쓰고(M2),
연체·D-day는 저장하지 않고 응답 때 계산한다(M4). #21·#22는 LOAN-2.
"""

import base64
import binascii
import json
from datetime import date, timedelta
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, today_kst
from app.db import run_db
from app.policy import LOAN_DEFAULT_DAYS
from app.services.provider_engine import isbn13_is_valid

LIST_LIMIT_DEFAULT = 50
LIST_LIMIT_MAX = 100

MSG_VALIDATION = "요청 형식이 올바르지 않아요."
MSG_NOT_FOUND = "찾을 수 없어요."
MSG_CONFLICT = "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요."

router = APIRouter(prefix="/api/v1/me/loans")

LoanStatus = Literal["on_loan", "returned"]

LOAN_COLUMNS = (
    "o.id, o.plan_id, o.loaned_on, o.due_on, o.due_on_assumed, o.status, o.returned_on, "
    "b.isbn13, b.title, b.author, b.cover_url, l.id AS library_id, l.name AS library_name"
)
LOAN_JOINS = "FROM loans o JOIN books b ON b.id = o.book_id LEFT JOIN libraries l ON l.id = o.library_id"

# 목록 정렬(C2): 빌린 책은 반납 임박 순, 지난 대출은 최근 반납 순
SORT = {
    "on_loan": ("o.due_on", "ASC", ">"),
    "returned": ("o.returned_on", "DESC", "<"),
}


def validation_error(field: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, field)


def loan_public(row: Any, today: date) -> dict[str, Any]:
    """응답 `Loan` 모양(C3). #19~#22가 함께 쓴다. user_id는 넣지 않는다."""
    on_loan = row.status == "on_loan"
    d_day = (row.due_on - today).days if on_loan else 0  # 반납한 대출은 남은 날을 세지 않는다
    return {
        "id": str(row.id),
        "book": {"isbn13": row.isbn13, "title": row.title, "author": row.author, "cover_url": row.cover_url},
        "library": (
            {"id": int(row.library_id), "name": row.library_name} if row.library_id is not None else None
        ),
        "plan_id": str(row.plan_id) if row.plan_id is not None else None,
        "loaned_on": row.loaned_on.isoformat(),
        "due_on": row.due_on.isoformat(),
        "due_on_assumed": bool(row.due_on_assumed),
        "status": row.status,
        "returned_on": row.returned_on.isoformat() if row.returned_on is not None else None,
        "d_day": d_day,
        "is_overdue": on_loan and d_day < 0,
    }


# ─────────── 커서: base64url JSON {"d": "YYYY-MM-DD", "id": "<uuid>"} ───────────


def encode_cursor(on: date, loan_id: UUID) -> str:
    raw = json.dumps({"d": on.isoformat(), "id": str(loan_id)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[date, UUID]:
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode())
        if not isinstance(raw, dict) or not isinstance(raw.get("d"), str) or not isinstance(raw.get("id"), str):
            raise ValueError("커서 모양이 다름")
        return date.fromisoformat(raw["d"]), UUID(raw["id"])
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:  # JSONDecodeError는 ValueError
        raise validation_error("cursor") from exc


# ─────────── #19 목록 ───────────


@router.get("")
async def list_loans(
    request: Request,
    status: LoanStatus = "on_loan",
    cursor: str | None = None,
    limit: int = Query(LIST_LIMIT_DEFAULT, ge=1, le=LIST_LIMIT_MAX),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    after = decode_cursor(cursor) if cursor else None
    column, direction, compare = SORT[status]
    today = today_kst()

    def tx(c: Connection) -> list[Any]:
        where = "o.user_id = :uid AND o.status = :status"
        params: dict[str, Any] = {"uid": user.id, "status": status, "n": limit + 1}
        if after is not None:
            where += f" AND ({column}, o.id) {compare} (:c_on, :c_id)"
            params.update(c_on=after[0], c_id=after[1])
        return c.execute(
            text(f"SELECT {LOAN_COLUMNS} {LOAN_JOINS} WHERE {where} "
                 f"ORDER BY {column} {direction}, o.id {direction} LIMIT :n"),
            params,
        ).all()

    rows = await run_db(request.app.state.engine, tx)
    page, more = rows[:limit], len(rows) > limit
    last = page[-1] if page else None
    next_cursor = None
    if more and last is not None:
        next_cursor = encode_cursor(last.due_on if status == "on_loan" else last.returned_on, last.id)
    return {
        "items": [loan_public(r, today) for r in page],
        "next_cursor": next_cursor,
        "today": today.isoformat(),
    }


# ─────────── #20 빌렸어요 ───────────


class LoanCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 loaned_on·due_on·user_id는 읽지 않는다(M2, M-#10)

    isbn13: str
    library_id: int | None = None
    plan_id: UUID | None = None


INSERT_LOAN_ON_CONFLICT_DO_NOTHING_RETURNING = text(
    "INSERT INTO loans (user_id, book_id, library_id, plan_id, loaned_on, due_on) "
    "VALUES (:uid, :book, :lib, :plan, :loaned, :due) "
    "ON CONFLICT (user_id, book_id) WHERE status = 'on_loan' DO NOTHING RETURNING id"
)
SELECT_ON_LOAN_SAME_BOOK = text(
    "SELECT id FROM loans WHERE user_id = :uid AND book_id = :book AND status = 'on_loan'"
)


@router.post("")
async def start_loan(
    request: Request, body: LoanCreate, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    isbn13 = body.isbn13.strip()
    if not isbn13_is_valid(isbn13):
        raise validation_error("isbn13")
    if body.library_id is not None and body.library_id < 1:
        raise validation_error("library_id")
    try:
        book = await request.app.state.provider_engine.get_book(isbn13)  # 트랜잭션 밖(PROJECT.md §3-7)
    except ApiError as exc:
        if exc.status_code == 404 and not exc.detail:  # get_book은 detail이 비어 있어 보강한다(M-#6)
            raise ApiError(404, "NOT_FOUND", exc.message, "isbn13") from None
        raise  # 429·503 그대로(M-#7)
    today = today_kst()

    def tx(c: Connection) -> tuple[Any, bool]:
        lock_active_user(c, user.id)
        lib_id = body.library_id
        if body.plan_id is not None:
            plan = c.execute(
                text("SELECT id, book_id, library_id, status FROM loan_plans "
                     "WHERE id = :id AND user_id = :uid FOR UPDATE"),
                {"id": body.plan_id, "uid": user.id},
            ).first()
            if plan is None:
                raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "plan_id")  # 남의 것 = 없는 것
            if plan.book_id != book.id:
                raise validation_error("plan_id")
            if plan.status != "planned":
                raise ApiError(409, "CONFLICT", MSG_CONFLICT)
            lib_id = lib_id or plan.library_id
        if lib_id is not None:
            if c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": lib_id}).first() is None:
                raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        inserted = c.execute(
            INSERT_LOAN_ON_CONFLICT_DO_NOTHING_RETURNING,
            {"uid": user.id, "book": book.id, "lib": lib_id, "plan": body.plan_id,
             "loaned": today, "due": today + timedelta(days=LOAN_DEFAULT_DAYS)},
        ).first()
        created = inserted is not None
        if created:
            loan_id = inserted.id
            if body.plan_id is not None:
                c.execute(
                    text("UPDATE loan_plans SET status = 'converted', updated_at = now() WHERE id = :id"),
                    {"id": body.plan_id},
                )
        else:  # 대출 중인 같은 책(M5): 있는 대출을 주고 예정은 바꾸지 않는다
            loan_id = c.execute(SELECT_ON_LOAN_SAME_BOOK, {"uid": user.id, "book": book.id}).scalar_one()
        row = c.execute(text(f"SELECT {LOAN_COLUMNS} {LOAN_JOINS} WHERE o.id = :id"), {"id": loan_id}).one()
        return row, created

    row, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=loan_public(row, today))
