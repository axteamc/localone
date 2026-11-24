"""내 독서 기록: 목록(#41)·하나(#42)·쓰기(#43)·지우기(#44)·고치기(#45). reading-log READ-1.

기록은 본인만 본다(R1-1) — 모든 조회·수정·삭제는 `user_id = 토큰 사용자`로 거르고, 남의 것과 없는 것은
같은 `404 NOT_FOUND`다. 도서관 없는 기록은 NULL 그대로 두고(R1-3), 대출 연결은 사용자가 보낸 `loan_id`만 쓴다(R1-4).
책 확보(LIB-0 조회 엔진)는 DB 트랜잭션 밖에서 한다(PROJECT.md §3-7).
"""

import base64
import binascii
import json
from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import KST, ApiError, today_kst
from app.db import run_db
from app.services.provider_engine import isbn13_is_valid

LIST_LIMIT_DEFAULT = 20
LIST_LIMIT_MAX = 50
NOTE_MAX = 2000  # R1-O3
QUOTE_MAX = 300  # R1-O3

MSG_VALIDATION = "요청 형식이 올바르지 않아요."
MSG_TOO_LONG = "글자 수를 넘었어요"
MSG_FUTURE = "앞으로 올 날짜는 고를 수 없어요."
MSG_NOT_FOUND = "찾을 수 없어요."

router = APIRouter(prefix="/api/v1/me/reading-logs")

# 책장 위치: 읽은 날, 없으면 쓴 날(서울 날짜)
SORT_DATE = "coalesce(r.read_on, (r.created_at AT TIME ZONE 'Asia/Seoul')::date)"
LOG_COLUMNS = (
    f"r.id, r.read_on, r.note, r.quote, r.loan_id, r.created_at, r.updated_at, {SORT_DATE} AS sort_on, "
    "b.isbn13, b.title, b.author, b.cover_url, l.id AS library_id, l.name AS library_name, "
    "(SELECT p.id FROM posts p WHERE p.reading_log_id = r.id AND p.user_id = r.user_id "
    "AND p.status = 'published') AS published_post_id"
)
LOG_JOINS = "FROM reading_logs r JOIN books b ON b.id = r.book_id LEFT JOIN libraries l ON l.id = r.library_id"


def validation_error(field: str, message: str = MSG_VALIDATION) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", message, field)


def not_found(field: str = "") -> ApiError:
    return ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, field)


def iso_kst(value: datetime) -> str:
    return value.astimezone(KST).isoformat(timespec="seconds")


def reading_log_public(row: Any) -> dict[str, Any]:
    """응답 `ReadingLog` 모양(C3). user_id는 넣지 않는다."""
    return {
        "id": str(row.id),
        "book": {"isbn13": row.isbn13, "title": row.title, "author": row.author, "cover_url": row.cover_url},
        "library": (
            {"id": int(row.library_id), "name": row.library_name} if row.library_id is not None else None
        ),
        "read_on": row.read_on.isoformat() if row.read_on is not None else None,
        "note": row.note,
        "quote": row.quote,
        "loan_id": str(row.loan_id) if row.loan_id is not None else None,
        "published_post_id": str(row.published_post_id) if row.published_post_id is not None else None,
        "created_at": iso_kst(row.created_at),
        "updated_at": iso_kst(row.updated_at),
    }


def select_own_log(c: Connection, user_id: UUID, log_id: UUID) -> Any:
    row = c.execute(
        text(f"SELECT {LOG_COLUMNS} {LOG_JOINS} WHERE r.id = :id AND r.user_id = :uid"),
        {"id": log_id, "uid": user_id},
    ).first()
    if row is None:
        raise not_found()  # 남의 것 = 없는 것
    return row


# ─────────── 칸 검사 (R1-O3·read_on) ───────────


def clean_text(value: str | None, field: str, limit: int) -> str | None:
    """앞뒤 공백을 지우고 빈 문자열은 None. 상한을 넘으면 422 field."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > limit:
        raise validation_error(field, MSG_TOO_LONG)
    return value


def check_read_on(value: date | None) -> date | None:
    if value is not None and value > today_kst():
        raise validation_error("read_on", MSG_FUTURE)
    return value


def ensure_own_loan(c: Connection, user_id: UUID, loan_id: UUID) -> None:
    hit = c.execute(
        text("SELECT 1 FROM loans WHERE id = :id AND user_id = :uid"), {"id": loan_id, "uid": user_id}
    ).first()
    if hit is None:
        raise not_found("loan_id")  # 남의 대출 = 없는 대출


def ensure_library_exists(c: Connection, library_id: int) -> None:
    if c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": library_id}).first() is None:
        raise validation_error("library_id")


# ─────────── 커서: base64url JSON {"d": 책장 날짜, "c": created_at, "id": uuid} ───────────


def encode_cursor(row: Any) -> str:
    raw = json.dumps(
        {"d": row.sort_on.isoformat(), "c": row.created_at.isoformat(), "id": str(row.id)},
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[date, datetime, UUID]:
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode())
        if not isinstance(raw, dict) or not all(isinstance(raw.get(k), str) for k in ("d", "c", "id")):
            raise ValueError("커서 모양이 다름")
        created = datetime.fromisoformat(raw["c"])
        if created.tzinfo is None:
            raise ValueError("시간대 없는 시각")
        return date.fromisoformat(raw["d"]), created, UUID(raw["id"])
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:  # JSONDecodeError는 ValueError
        raise validation_error("cursor") from exc


# ─────────── #41 목록 ───────────


@router.get("")
async def list_reading_logs(
    request: Request,
    library_id: int | None = None,
    cursor: str | None = None,
    limit: int = Query(LIST_LIMIT_DEFAULT, ge=1, le=LIST_LIMIT_MAX),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    after = decode_cursor(cursor) if cursor else None

    def tx(c: Connection) -> list[Any]:
        where = "r.user_id = :uid"
        params: dict[str, Any] = {"uid": user.id, "n": limit + 1}
        if library_id is not None:
            where += " AND r.library_id = :lib"  # 도서관 없는 기록(NULL)은 도서관별 보기에 안 나온다(R1-3)
            params["lib"] = library_id
        if after is not None:
            where += f" AND ({SORT_DATE}, r.created_at, r.id) < (:c_on, :c_at, :c_id)"
            params.update(c_on=after[0], c_at=after[1], c_id=after[2])
        return c.execute(
            text(f"SELECT {LOG_COLUMNS} {LOG_JOINS} WHERE {where} "
                 f"ORDER BY {SORT_DATE} DESC, r.created_at DESC, r.id DESC LIMIT :n"),
            params,
        ).all()

    rows = await run_db(request.app.state.engine, tx)
    page, more = rows[:limit], len(rows) > limit
    return {
        "items": [reading_log_public(r) for r in page],
        "next_cursor": encode_cursor(page[-1]) if more and page else None,
    }


# ─────────── #46 기초 통계 (READ-2) ───────────
# 본인 기록만 센다(R2-4). 날짜는 읽은 날, 없으면 쓴 날의 서울 날짜(#41 책장 위치와 같다). 기록이 없으면 모두 0(R2-3).
# `/{log_id}`보다 먼저 등록해야 "stats"가 기록 id로 읽히지 않는다.

STATS_COUNTS = text(
    "SELECT count(*) AS total, "
    "count(*) FILTER (WHERE date_trunc('year', d) = date_trunc('year', CAST(:today AS date))) AS this_year, "
    "count(*) FILTER (WHERE date_trunc('month', d) = date_trunc('month', CAST(:today AS date))) AS this_month "
    "FROM (SELECT coalesce(read_on, (created_at AT TIME ZONE 'Asia/Seoul')::date) AS d "
    "FROM reading_logs WHERE user_id = :uid) t"
)
# R2-O3: 첫 줄은 가장 최근에 읽은 도서관 하나(마지막 읽은 날 DESC → 그 날짜 기록의 created_at DESC → id ASC),
# 둘째 줄부터 count DESC, library_id ASC. 도서관 없는 기록은 넣지 않는다(R2-2).
STATS_LIBRARIES = text(
    "WITH dated AS ("
    " SELECT library_id, created_at,"
    " coalesce(read_on, (created_at AT TIME ZONE 'Asia/Seoul')::date) AS d"
    " FROM reading_logs WHERE user_id = :uid AND library_id IS NOT NULL"
    "), per_library AS ("
    " SELECT DISTINCT ON (library_id) library_id, d AS last_read_on, created_at,"
    " count(*) OVER (PARTITION BY library_id) AS count"
    " FROM dated ORDER BY library_id, d DESC, created_at DESC"
    "), ranked AS ("
    " SELECT *, row_number() OVER (ORDER BY last_read_on DESC, created_at DESC, library_id ASC) AS recent_rank"
    " FROM per_library"
    ") "
    "SELECT r.library_id, l.name, r.count, r.last_read_on "
    "FROM ranked r JOIN libraries l ON l.id = r.library_id "
    "ORDER BY (r.recent_rank = 1) DESC, r.count DESC, r.library_id ASC"
)


@router.get("/stats")
async def reading_stats(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    today = today_kst()

    def tx(c: Connection) -> tuple[Any, list[Any]]:
        counts = c.execute(STATS_COUNTS, {"uid": user.id, "today": today}).one()
        libraries = c.execute(STATS_LIBRARIES, {"uid": user.id}).all()
        return counts, libraries

    counts, libraries = await run_db(request.app.state.engine, tx)
    return {
        "total": int(counts.total),
        "this_year": int(counts.this_year),
        "this_month": int(counts.this_month),
        "libraries": [
            {"library_id": int(r.library_id), "name": r.name, "count": int(r.count),
             "last_read_on": r.last_read_on.isoformat()}
            for r in libraries
        ],
    }


# ─────────── #42 하나 ───────────


@router.get("/{log_id}")
async def get_reading_log(
    request: Request, log_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    row = await run_db(request.app.state.engine, lambda c: select_own_log(c, user.id, log_id))
    return reading_log_public(row)


# ─────────── #43 쓰기 ───────────


class ReadingLogIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 user_id 등은 읽지 않는다(PROJECT.md §3-4)

    isbn13: str
    library_id: int | None = None
    read_on: date | None = None
    note: str | None = None
    quote: str | None = None
    loan_id: UUID | None = None
    client_request_id: UUID


INSERT_LOG_ON_CONFLICT_DO_NOTHING_RETURNING = text(
    "INSERT INTO reading_logs (user_id, book_id, library_id, loan_id, read_on, note, quote, client_request_id) "
    "VALUES (:uid, :book, :lib, :loan, :read_on, :note, :quote, :req) "
    "ON CONFLICT (user_id, client_request_id) DO NOTHING RETURNING id"
)
SELECT_BY_CLIENT_REQUEST = text(
    "SELECT id FROM reading_logs WHERE user_id = :uid AND client_request_id = :req"
)


async def ensure_book(request: Request, isbn13: str) -> int:
    """LIB-0으로 책을 확보한다(트랜잭션 밖). 책을 찾지 못하면 422 isbn13, 제공자 실패는 503·429 그대로."""
    try:
        book = await request.app.state.provider_engine.get_book(isbn13)
    except ApiError as exc:
        if exc.status_code == 404:
            raise validation_error("isbn13") from None
        raise
    return book.id


@router.post("")
async def create_reading_log(
    request: Request, body: ReadingLogIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    isbn13 = body.isbn13.strip()
    if not isbn13_is_valid(isbn13):
        raise validation_error("isbn13")
    note = clean_text(body.note, "note", NOTE_MAX)
    quote = clean_text(body.quote, "quote", QUOTE_MAX)
    read_on = check_read_on(body.read_on)
    book_id = await ensure_book(request, isbn13)

    def tx(c: Connection) -> tuple[Any, bool]:
        lock_active_user(c, user.id)
        hit = c.execute(SELECT_BY_CLIENT_REQUEST, {"uid": user.id, "req": body.client_request_id}).first()
        if hit is not None:
            return select_own_log(c, user.id, hit.id), False  # 연타·다시 저장: 같은 기록 200
        if body.loan_id is not None:
            ensure_own_loan(c, user.id, body.loan_id)
        if body.library_id is not None:
            ensure_library_exists(c, body.library_id)
        inserted = c.execute(
            INSERT_LOG_ON_CONFLICT_DO_NOTHING_RETURNING,
            {"uid": user.id, "book": book_id, "lib": body.library_id, "loan": body.loan_id,
             "read_on": read_on, "note": note, "quote": quote, "req": body.client_request_id},
        ).first()
        if inserted is None:  # 동시에 들어온 같은 요청이 먼저 넣었다
            log_id = c.execute(SELECT_BY_CLIENT_REQUEST, {"uid": user.id, "req": body.client_request_id}).scalar_one()
            return select_own_log(c, user.id, log_id), False
        return select_own_log(c, user.id, inserted.id), True

    row, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=reading_log_public(row))


# ─────────── #44 지우기 ───────────


@router.delete("/{log_id}")
async def delete_reading_log(
    request: Request, log_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> Response:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        own = c.execute(
            text("SELECT id FROM reading_logs WHERE id = :id AND user_id = :uid FOR UPDATE"),
            {"id": log_id, "uid": user.id},
        ).first()
        if own is None:
            raise not_found()
        c.execute(text("DELETE FROM reading_logs WHERE id = :id"), {"id": log_id})

    await run_db(request.app.state.engine, tx)
    return Response(status_code=204)


# ─────────── #45 고치기 ───────────


class ReadingLogPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")  # isbn13은 받지 않는다(책은 바꾸지 않는다)

    library_id: int | None = None
    read_on: date | None = None
    note: str | None = None
    quote: str | None = None
    loan_id: UUID | None = None


@router.patch("/{log_id}")
async def update_reading_log(
    request: Request, log_id: UUID, body: ReadingLogPatch, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    sent = body.model_fields_set  # 보낸 칸만 바꾼다
    changes: dict[str, Any] = {}
    if "note" in sent:
        changes["note"] = clean_text(body.note, "note", NOTE_MAX)
    if "quote" in sent:
        changes["quote"] = clean_text(body.quote, "quote", QUOTE_MAX)
    if "read_on" in sent:
        changes["read_on"] = check_read_on(body.read_on)
    if "library_id" in sent:
        changes["library_id"] = body.library_id
    if "loan_id" in sent:
        changes["loan_id"] = body.loan_id

    def tx(c: Connection) -> Any:
        lock_active_user(c, user.id)
        own = c.execute(
            text("SELECT id FROM reading_logs WHERE id = :id AND user_id = :uid FOR UPDATE"),
            {"id": log_id, "uid": user.id},
        ).first()
        if own is None:
            raise not_found()
        if changes.get("loan_id") is not None:
            ensure_own_loan(c, user.id, changes["loan_id"])
        if changes.get("library_id") is not None:
            ensure_library_exists(c, changes["library_id"])
        if changes:
            assignments = ", ".join(f"{column} = :{column}" for column in changes)
            c.execute(
                text(f"UPDATE reading_logs SET {assignments}, updated_at = now() WHERE id = :id"),
                {**changes, "id": log_id},
            )
        return select_own_log(c, user.id, log_id)

    row = await run_db(request.app.state.engine, tx)
    return reading_log_public(row)
