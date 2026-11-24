"""빌릴 예정: 목록(#16)·저장(#17)·해제(#18)·일괄 소장 조회(#70). book-search LIB-3·LIB-3b.

본인만 보는 메모이고 도서관 예약이 아니다(N1). `converted` 전환은 LOAN-1 #20만 한다(N6).
도서관 미지정 예정(`library_id IS NULL`, LIB-3b U1~U5)은 #16 `include_unassigned=true`일 때만 보인다.
"""

import base64
import binascii
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app import policy
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.libraries import area_label_of, check_radius, library_summary
from app.services.homepage_fix import fix_homepage
from app.services.provider_engine import (
    BulkAvailabilityResult, BulkCandidate, BookRecord, isbn13_is_valid, libraries_nearby,
)

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
PLAN_JOINS = "FROM loan_plans p JOIN books b ON b.id = p.book_id LEFT JOIN libraries l ON l.id = p.library_id"


def validation_error(field: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, field)


def plan_public(row: Any) -> dict[str, Any]:
    """응답 `LoanPlan` 모양(C3). user_id는 넣지 않는다."""
    return {
        "id": str(row.id),
        "book": {"isbn13": row.isbn13, "title": row.title, "author": row.author, "cover_url": row.cover_url},
        "library": None if row.library_id is None else {  # 미지정 예정은 null(LIB-3b U5)
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
    include_unassigned: bool = False,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    after = decode_cursor(cursor) if cursor else None

    def tx(c: Connection) -> list[Any]:
        where = "p.user_id = :uid AND p.status = :status"
        if not include_unassigned:  # 구 앱 호환: 지정 예정만(LIB-3b U5)
            where += " AND p.library_id IS NOT NULL"
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
    library_id: int | None = None  # 없거나 null이면 도서관 미지정 예정(LIB-3b U4)


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
INSERT_UNASSIGNED_ON_CONFLICT_DO_NOTHING_RETURNING = text(
    "INSERT INTO loan_plans (user_id, book_id, library_id) VALUES (:uid, :book_id, NULL) "
    "ON CONFLICT (user_id, book_id) WHERE status = 'planned' AND library_id IS NULL DO NOTHING RETURNING id"
)
SELECT_ACTIVE_UNASSIGNED = text(
    "SELECT id FROM loan_plans WHERE user_id = :uid AND book_id = :book_id "
    "AND library_id IS NULL AND status = 'planned'"
)


@router.post("")
async def save_loan_plan(
    request: Request, body: PlanCreate, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    isbn13 = body.isbn13.strip()
    if not isbn13_is_valid(isbn13):
        raise validation_error("isbn13")
    if body.library_id is not None and body.library_id < 1:
        raise validation_error("library_id")
    # 책 조회는 외부 I/O라 트랜잭션 밖(PROJECT.md §3-7)
    book = await _book_for(request, isbn13)
    unassigned = body.library_id is None
    params: dict[str, Any] = {"uid": user.id, "book_id": book.id}
    if unassigned:
        insert, select = INSERT_UNASSIGNED_ON_CONFLICT_DO_NOTHING_RETURNING, SELECT_ACTIVE_UNASSIGNED
    else:
        insert, select = INSERT_PLAN_ON_CONFLICT_DO_NOTHING_RETURNING, SELECT_ACTIVE_PLAN
        params["library_id"] = body.library_id

    def tx(c: Connection) -> tuple[Any, bool]:
        lock_active_user(c, user.id)
        if not unassigned and not c.execute(
            text("SELECT 1 FROM libraries WHERE id = :id"), {"id": body.library_id}
        ).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        inserted = c.execute(insert, params).first()
        created = inserted is not None
        plan_id = inserted.id if created else c.execute(select, params).scalar_one()
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


# ─────────── #70 여러 권 소장 일괄 조회(LIB-3b §2, core K24) ───────────


class AvailabilityRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 그 밖 필드는 무시(#17과 같음)

    plan_ids: list[Any] | None = None  # 원소 형식은 직접 검사해 detail을 "plan_ids"로 모은다
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radius_km: int | None = None


def _plan_ids(raw: list[Any] | None) -> list[UUID] | None:
    if raw is None:
        return None
    if not 1 <= len(raw) <= policy.BATCH_AVAILABILITY_MAX_PLAN_IDS:
        raise validation_error("plan_ids")
    ids: list[UUID] = []
    for value in raw:
        if not isinstance(value, str):
            raise validation_error("plan_ids")
        try:
            ids.append(UUID(value))
        except ValueError as exc:
            raise validation_error("plan_ids") from exc
    if len(set(ids)) != len(ids):
        raise validation_error("plan_ids")
    return ids


def _library_link(homepage: str | None) -> dict[str, str] | None:
    return {"url": homepage, "kind": "homepage"} if homepage and homepage.startswith(("https://", "http://")) else None


def _candidate_public(c: BulkCandidate) -> dict[str, Any]:
    summary = library_summary(c.library, c.distance_km)
    homepage = fix_homepage(c.library.homepage)
    return {
        "library": {**{k: summary[k] for k in ("id", "name", "address", "area_label", "distance_m", "today")},
                    "tel": c.library.tel, "homepage": homepage},
        "holding_count": len(c.held_isbn13s),
        "loanable_count": len(c.loanable_isbn13s),
        "held_isbn13s": list(c.held_isbn13s),
        "loanable_isbn13s": list(c.loanable_isbn13s),
        "link": _library_link(homepage),
    }


@router.post("/availability")
async def bulk_plan_availability(
    request: Request, body: AvailabilityRequest, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    plan_ids = _plan_ids(body.plan_ids)
    radius = check_radius(body.radius_km)

    def tx(c: Connection) -> tuple[list[Any], list[Any]]:
        where = "p.user_id = :uid AND p.status = 'planned'"
        params: dict[str, Any] = {"uid": user.id}
        if plan_ids is not None:
            where += " AND p.id = ANY(:ids)"
            params["ids"] = plan_ids
        plans = c.execute(
            text(f"SELECT p.id, b.isbn13 FROM loan_plans p JOIN books b ON b.id = p.book_id WHERE {where} "
                 "ORDER BY p.created_at DESC, p.id DESC"),
            params,
        ).all()
        if plan_ids is not None and len(plans) != len(plan_ids):
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "plan_ids")  # 남의·없는·활성 아닌 것 구별 안 함
        isbn_count = len({p.isbn13 for p in plans})
        if isbn_count > policy.BATCH_AVAILABILITY_MAX_ISBNS:
            raise validation_error("plan_ids")
        nearby = libraries_nearby(c, body.lat, body.lng, radius) if plans else []
        return plans, nearby

    plans, nearby = await run_db(request.app.state.engine, tx)
    by_isbn: dict[str, list[str]] = {}
    for plan in plans:  # created_at DESC, id DESC 첫 등장 순
        by_isbn.setdefault(plan.isbn13, []).append(str(plan.id))
    # 외부 호출은 트랜잭션 밖(K11·H-ARCH-03)
    result: BulkAvailabilityResult = await request.app.state.provider_engine.bulk_availability(
        list(by_isbn), nearby
    )
    return {
        "checked_at": now_kst().isoformat(timespec="seconds"),
        "radius_km": radius,
        "complete": result.complete,
        "unknown_pairs": result.unknown_pairs,
        "fallback_counts": result.fallback_counts,
        "books": [{"isbn13": i, "plan_ids": ids, "status": result.book_status[i]} for i, ids in by_isbn.items()],
        "candidates": [_candidate_public(c) for c in result.candidates],
    }
