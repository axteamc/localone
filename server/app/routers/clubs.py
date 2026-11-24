"""작은 모임 CLUB-1-P1: 만들기·보기·고치기·마감·취소(#50~#54), 참가·참가 취소(#55·#56), 댓글(#57~#59).

book-club 계약 CLUB-1 C1~C7·P4. 표는 D가 `0012_m2_targets.py`로 만들었고 길이 제약은 `0016`.
- 시각 비교는 서버 `now_kst()`(PROJECT.md §3-6). `ended`는 저장하지 않고 `ends_at < now`로 계산한다(C3).
- 참가는 모임 행을 `FOR UPDATE`로 잠그고 정원·마감·제한을 본 뒤 넣는다(정원 경합, C6).
- 응답에 `user_id`를 넣지 않는다. 명단은 닉네임과 `is_me`, 댓글은 `mine`만(C3).
"""

import base64
import binascii
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, get_optional_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.services.inbox import add_inbox_items
from app.services.provider_engine import BookRecord, isbn13_is_valid

router = APIRouter(prefix="/api/v1")

# K1-O3 (C5 0016 길이 CHECK와 같은 값, 앞뒤 공백을 뺀 글자 수)
NAME_MAX, INTRO_MAX, PLACE_MAX, COMMENT_MAX, REASON_MAX = 40, 500, 100, 300, 200
COMMENTS_LIMIT_DEFAULT, COMMENTS_LIMIT_MAX = 30, 50

MSG_VALIDATION = "요청 형식이 올바르지 않아요."
MSG_NOT_FOUND = "찾을 수 없어요."
MSG_NOT_HOST = "모임을 만든 사람만 할 수 있어요."
MSG_FULL = "자리가 다 찼어요."
MSG_CLOSED = "참가할 수 없는 모임이에요."
MSG_STARTED = "시작한 모임이라 바꿀 수 없어요."
MSG_RESTRICTED = "지금은 모임에 참가할 수 없어요."


def validation_error(field: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, field)


def not_found(detail: str = "club_id") -> ApiError:
    return ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, detail)


def is_restricted(conn: Connection, user_id: UUID, now: datetime) -> datetime | None | bool:
    """참가 제한 확인(K1-10, CLUB-2 K2-10). 제한 중이면 만료 시각(무기한이면 True), 아니면 False.

    사유(불참·댓글 운영)와 모임에 관계없이 해제 전·기간 안의 제한이 하나라도 있으면 막는다(K2-O4).
    여러 개면 가장 늦게 끝나는 것을 돌려준다.
    """
    rows = conn.execute(text(
        "SELECT ends_at FROM participation_restrictions WHERE user_id = :uid AND lifted_at IS NULL "
        "AND starts_at <= :now AND (ends_at IS NULL OR ends_at > :now)"
    ), {"uid": user_id, "now": now}).scalars().all()
    if not rows:
        return False
    if any(ends is None for ends in rows):
        return True  # 4번째 불참·영구 댓글 제한(K2-8·K2-O5)
    return max(rows)


def iso_or_empty(until: datetime | None | bool) -> str:
    return now_kst(until).isoformat(timespec="seconds") if isinstance(until, datetime) else ""


def iso(value: datetime | None) -> str | None:
    return None if value is None else now_kst(value).isoformat(timespec="seconds")


# ─────────── 읽기 ───────────

CLUB_COLUMNS = (
    "c.id, c.library_id, l.name AS library_name, c.host_id, c.name, c.intro, c.place, c.starts_at, c.ends_at, "
    "c.capacity, c.status, c.cancel_reason, c.previous_club_id, c.created_at, "
    "COALESCE(hp.nickname, '이웃') AS host_nickname, "
    "b.isbn13 AS book_isbn13, b.title AS book_title, b.author AS book_author, b.publisher AS book_publisher, "
    "b.cover_url AS book_cover_url, b.source AS book_source, b.description AS book_description, "
    "b.pub_year AS book_pub_year"
)
CLUB_JOINS = (
    "FROM clubs c JOIN libraries l ON l.id = c.library_id "
    "LEFT JOIN user_profiles hp ON hp.user_id = c.host_id LEFT JOIN books b ON b.id = c.book_id"
)
SELECT_CLUB = text(f"SELECT {CLUB_COLUMNS} {CLUB_JOINS} WHERE c.id = :id")
SELECT_CLUB_FOR_UPDATE = text("SELECT * FROM clubs WHERE id = :id FOR UPDATE")
SELECT_PARTICIPANTS = text(
    "SELECT p.user_id, COALESCE(up.nickname, '이웃') AS nickname FROM club_participations p "
    "JOIN clubs c ON c.id = p.club_id LEFT JOIN user_profiles up ON up.user_id = p.user_id "
    "WHERE p.club_id = :id AND p.state = 'joined' AND p.user_id <> c.host_id ORDER BY p.joined_at, p.user_id"
)
SELECT_MINE = text("SELECT state FROM club_participations WHERE club_id = :id AND user_id = :uid")
# 만든 사람은 참가자 수·정원에 세지 않는다(K1-O4)
COUNT_JOINED = text(
    "SELECT count(*) FROM club_participations p JOIN clubs c ON c.id = p.club_id "
    "WHERE p.club_id = :id AND p.state = 'joined' AND p.user_id <> c.host_id"
)
UPSERT_PARTICIPATION = text(
    "INSERT INTO club_participations (club_id, user_id, state) VALUES (:id, :uid, :state) "
    "ON CONFLICT (club_id, user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now(), "
    "joined_at = CASE WHEN EXCLUDED.state = 'joined' THEN now() ELSE club_participations.joined_at END"
)


def started(club: Any, now: datetime) -> bool:
    return club.starts_at is not None and now >= club.starts_at


def ended(club: Any, now: datetime) -> bool:
    return club.ends_at is not None and now > club.ends_at


def public_status(club: Any, now: datetime) -> str:
    """C3 `status`: 취소 > 끝남(계산) > 마감(저장값 또는 시작 시각 지남, K1-7) > 열림."""
    if club.status == "canceled":
        return "canceled"
    if ended(club, now):
        return "ended"
    if club.status == "closed" or started(club, now):
        return "closed"
    return "open"


def load_club(c: Connection, club_id: UUID) -> Any:
    row = c.execute(SELECT_CLUB, {"id": club_id}).one_or_none()
    if row is None or row.status == "hidden":
        raise not_found()
    return row


def club_view(c: Connection, club_id: UUID, viewer: CurrentUser | None) -> dict[str, Any]:
    """응답 `Club`(C3). user_id는 넣지 않는다."""
    row = load_club(c, club_id)
    people = c.execute(SELECT_PARTICIPANTS, {"id": club_id}).all()
    mine = None
    if viewer is not None:
        mine = c.execute(SELECT_MINE, {"id": club_id, "uid": viewer.id}).scalar_one_or_none()
    book = None
    if row.book_isbn13 is not None:
        book = {
            "isbn13": row.book_isbn13, "title": row.book_title, "author": row.book_author,
            "publisher": row.book_publisher, "cover_url": row.book_cover_url, "source": row.book_source,
            "description": row.book_description, "pub_year": row.book_pub_year,
        }
    return {
        "id": str(row.id),
        "library": {"id": int(row.library_id), "name": row.library_name},
        "name": row.name,
        "intro": row.intro,
        "book": book,
        "place": row.place,
        "starts_at": iso(row.starts_at),
        "ends_at": iso(row.ends_at),
        "capacity": row.capacity,
        "status": public_status(row, now_kst()),
        "cancel_reason": row.cancel_reason if row.status == "canceled" else None,
        "host_nickname": row.host_nickname,
        "is_host": viewer is not None and viewer.id == row.host_id,
        "participant_count": len(people),
        "participants": [{"nickname": p.nickname, "is_me": viewer is not None and viewer.id == p.user_id}
                         for p in people],
        "my_participation": mine if mine in ("joined", "left") else "none",
        "previous_club_id": None if row.previous_club_id is None else str(row.previous_club_id),
    }


def club_item(row: Any, participant_count: int) -> dict[str, Any]:
    """피드 카드 `ClubItem`(C3, #32 `kind="club"`)."""
    return {
        "id": str(row.id),
        "library_id": int(row.library_id),
        "name": row.name,
        "starts_at": iso(row.starts_at),
        "place": row.place,
        "status": public_status(row, now_kst()),
        "participant_count": participant_count,
        "capacity": row.capacity,
        "published_at": iso(row.created_at),
    }


@router.get("/clubs/{club_id}")
async def get_club(
    request: Request, club_id: UUID, viewer: CurrentUser | None = Depends(get_optional_user)
) -> dict[str, Any]:
    return await run_db(request.app.state.engine, lambda c: club_view(c, club_id, viewer))


# ─────────── 입력 검사 ───────────


class ClubInput(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 host_id·user_id 등은 읽지 않는다

    name: str | None = None
    intro: str | None = None
    isbn13: str | None = None
    place: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    capacity: int | None = None


class ClubCreate(ClubInput):
    name: str  # type: ignore[assignment]  # 만들 때는 필수(K1-1)
    client_request_id: UUID


def clean_fields(body: ClubInput) -> dict[str, Any]:
    """보낸 칸만 다듬어 돌려준다. 길이·시간대·정원 검사(K1-O3, C3)."""
    sent = body.model_fields_set
    out: dict[str, Any] = {}
    if "name" in sent:
        name = (body.name or "").strip()
        if not 1 <= len(name) <= NAME_MAX:
            raise validation_error("name")
        out["name"] = name
    for field, limit in (("intro", INTRO_MAX), ("place", PLACE_MAX)):
        if field in sent:
            value = getattr(body, field)
            value = value.strip() if value is not None else None
            if value is not None and len(value) > limit:
                raise validation_error(field)
            out[field] = value or None
    if "isbn13" in sent:
        isbn = body.isbn13.strip() if body.isbn13 is not None else None
        if isbn and not isbn13_is_valid(isbn):
            raise validation_error("isbn13")
        out["isbn13"] = isbn or None
    for field in ("starts_at", "ends_at"):
        if field in sent:
            value = getattr(body, field)
            if value is not None and value.tzinfo is None:
                raise validation_error(field)
            out[field] = value
    if "capacity" in sent:
        if body.capacity is not None and body.capacity < 1:
            raise validation_error("capacity")
        out["capacity"] = body.capacity
    return out


def check_time_order(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at is not None and ends_at is not None and not ends_at > starts_at:
        raise validation_error("ends_at")


async def book_for(request: Request, isbn13: str | None) -> BookRecord | None:
    """책 조회는 외부 I/O라 트랜잭션 밖(PROJECT.md §3-7)."""
    if isbn13 is None:
        return None
    try:
        return await request.app.state.provider_engine.get_book(isbn13)
    except ApiError as exc:
        if exc.status_code == 404:
            raise not_found("isbn13") from exc
        raise


# ─────────── #50 만들기 ───────────

INSERT_CLUB = text(
    "INSERT INTO clubs (library_id, host_id, name, intro, book_id, place, starts_at, ends_at, capacity, "
    "client_request_id) VALUES (:lib, :uid, :name, :intro, :book_id, :place, :starts_at, :ends_at, :capacity, :rid) "
    "ON CONFLICT ON CONSTRAINT clubs_host_client_request_key DO NOTHING RETURNING id"
)


@router.post("/libraries/{library_id}/clubs")
async def create_club(
    request: Request, library_id: int, body: ClubCreate, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    fields = clean_fields(body)
    check_time_order(fields.get("starts_at"), fields.get("ends_at"))
    book = await book_for(request, fields.get("isbn13"))

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_active_user(c, user.id)
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": library_id}).first():
            raise not_found("library_id")
        inserted = c.execute(INSERT_CLUB, {
            "lib": library_id, "uid": user.id, "name": fields["name"], "intro": fields.get("intro"),
            "book_id": book.id if book else None, "place": fields.get("place"),
            "starts_at": fields.get("starts_at"), "ends_at": fields.get("ends_at"),
            "capacity": fields.get("capacity"), "rid": body.client_request_id,
        }).first()
        if inserted is not None:
            return club_view(c, inserted.id, user), True
        # 같은 요청 재전송 → 200, 새 행 없음(C2 멱등)
        club_id = c.execute(
            text("SELECT id FROM clubs WHERE host_id = :uid AND client_request_id = :rid"),
            {"uid": user.id, "rid": body.client_request_id},
        ).scalar_one()
        return club_view(c, club_id, user), False

    view, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=view)


# ─────────── 만든 사람만: #52 고치기 · #53 마감 · #54 취소 ───────────


def lock_hosted(c: Connection, club_id: UUID, user: CurrentUser) -> Any:
    lock_active_user(c, user.id)
    club = c.execute(SELECT_CLUB_FOR_UPDATE, {"id": club_id}).first()
    if club is None or club.status == "hidden":
        raise not_found()
    if club.host_id != user.id:
        raise ApiError(403, "NOT_HOST", MSG_NOT_HOST)
    return club


def joined_user_ids(c: Connection, club_id: UUID) -> list[UUID]:
    return list(c.execute(
        text("SELECT p.user_id FROM club_participations p JOIN clubs c ON c.id = p.club_id "
             "WHERE p.club_id = :id AND p.state = 'joined' AND p.user_id <> c.host_id"), {"id": club_id}
    ).scalars())


UPDATABLE = ("name", "intro", "place", "starts_at", "ends_at", "capacity")


@router.patch("/clubs/{club_id}")
async def update_club(
    request: Request, club_id: UUID, body: ClubInput, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    fields = clean_fields(body)  # 보낸 칸만(부분 갱신, 안 보낸 칸은 그대로)
    book = await book_for(request, fields.get("isbn13"))

    def tx(c: Connection) -> dict[str, Any]:
        club = lock_hosted(c, club_id, user)
        now = now_kst()
        if club.status == "canceled" or ended(club, now):
            raise ApiError(409, "CLUB_CLOSED", MSG_CLOSED)
        new = {k: fields[k] if k in fields else getattr(club, k) for k in UPDATABLE}
        if "starts_at" in fields and new["starts_at"] != club.starts_at and started(club, now):
            raise ApiError(409, "CLUB_STARTED", MSG_STARTED)  # 시작 뒤 시작 시각은 못 바꾼다(K1-5)
        check_time_order(new["starts_at"], new["ends_at"])
        book_id = (book.id if book else None) if "isbn13" in fields else club.book_id
        c.execute(text(
            "UPDATE clubs SET name = :name, intro = :intro, place = :place, starts_at = :starts_at, "
            "ends_at = :ends_at, capacity = :capacity, book_id = :book_id, updated_at = now() WHERE id = :id"
        ), dict(new, book_id=book_id, id=club_id))
        # 미정 → 확정이면 club_confirmed, 그 밖의 시간·장소 변경은 club_changed (K1-6)
        kind = None
        if club.starts_at is None and new["starts_at"] is not None:
            kind = "club_confirmed"
        elif any(new[k] != getattr(club, k) for k in ("starts_at", "ends_at", "place")):
            kind = "club_changed"
        if kind is not None:
            target = {"club_id": str(club_id)}
            if kind == "club_changed":
                target["changed_at"] = now.isoformat()  # 바뀔 때마다 새 안내(같은 안내 한 번 규칙의 키)
            add_inbox_items(c, joined_user_ids(c, club_id), kind, target)
        return club_view(c, club_id, user)

    return await run_db(request.app.state.engine, tx)


@router.post("/clubs/{club_id}/close")
async def close_club(request: Request, club_id: UUID, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        club = lock_hosted(c, club_id, user)
        if club.status == "open":  # 이미 마감·취소면 그대로 200(멱등)
            c.execute(text("UPDATE clubs SET status = 'closed', updated_at = now() WHERE id = :id"), {"id": club_id})
        return club_view(c, club_id, user)

    return await run_db(request.app.state.engine, tx)


class CancelIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: str | None = None


@router.post("/clubs/{club_id}/cancel")
async def cancel_club(
    request: Request, club_id: UUID, body: CancelIn, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    reason = (body.reason or "").strip()
    if not 1 <= len(reason) <= REASON_MAX:  # 이유 필수(K1-8, K1-O3)
        raise validation_error("reason")

    def tx(c: Connection) -> dict[str, Any]:
        club = lock_hosted(c, club_id, user)
        if club.status == "canceled":
            return club_view(c, club_id, user)  # 이미 취소 → 200(멱등)
        if ended(club, now_kst()):
            raise ApiError(409, "CLUB_CLOSED", MSG_CLOSED)  # 종료 전에만 취소(K1-8)
        c.execute(text(
            "UPDATE clubs SET status = 'canceled', cancel_reason = :reason, updated_at = now() WHERE id = :id"
        ), {"id": club_id, "reason": reason})
        add_inbox_items(c, joined_user_ids(c, club_id), "club_canceled", {"club_id": str(club_id)})
        return club_view(c, club_id, user)  # 취소 기록은 남는다(카드 "취소됨"), 패널티 없음(K1-12)

    return await run_db(request.app.state.engine, tx)


# ─────────── #55 참가 · #56 참가 취소 ───────────


@router.put("/clubs/{club_id}/participation")
async def join_club(request: Request, club_id: UUID, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        lock_active_user(c, user.id)
        club = c.execute(SELECT_CLUB_FOR_UPDATE, {"id": club_id}).first()  # FOR UPDATE: 정원 경합 막기
        if not club or club.status == "hidden":
            raise not_found()
        if club.host_id == user.id:
            return club_view(c, club_id, user)  # 만든 사람은 참가자로 넣지 않는다(K1-O4, 자리 소진 방지)
        now = now_kst()
        if club.status in ("closed", "canceled") or started(club, now) or ended(club, now):
            raise ApiError(409, "CLUB_CLOSED", MSG_CLOSED)  # 시작 시각에 자동 마감(K1-7)
        until = is_restricted(c, user.id, now)  # CLUB-2가 채움(K1-10)
        if until:
            raise ApiError(403, "PARTICIPATION_RESTRICTED", MSG_RESTRICTED, iso_or_empty(until))
        mine = c.execute(SELECT_MINE, {"id": club_id, "uid": user.id}).scalar_one_or_none()
        if mine == "joined":
            return club_view(c, club_id, user)  # 멱등
        if club.capacity is not None and c.execute(COUNT_JOINED, {"id": club_id}).scalar_one() >= club.capacity:
            raise ApiError(409, "CLUB_FULL", MSG_FULL)
        c.execute(UPSERT_PARTICIPATION, {"id": club_id, "uid": user.id, "state": "joined"})
        return club_view(c, club_id, user)

    return await run_db(request.app.state.engine, tx)


@router.delete("/clubs/{club_id}/participation")
async def leave_club(request: Request, club_id: UUID, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        lock_active_user(c, user.id)
        club = c.execute(SELECT_CLUB_FOR_UPDATE, {"id": club_id}).first()
        if not club or club.status == "hidden":
            raise not_found()
        mine = c.execute(SELECT_MINE, {"id": club_id, "uid": user.id}).scalar_one_or_none()
        if mine != "joined":
            return club_view(c, club_id, user)  # 멱등: 참가 안 했어도 200
        if club.starts_at is not None and now_kst() >= club.starts_at:  # 확정 뒤 시작했음(K1-4·K1-O6 후보 A)
            raise ApiError(409, "CLUB_STARTED", MSG_STARTED)  # 참가 그대로
        c.execute(UPSERT_PARTICIPATION, {"id": club_id, "uid": user.id, "state": "left"})  # 불참 아님(K1-12)
        return club_view(c, club_id, user)

    return await run_db(request.app.state.engine, tx)


# ─────────── #57 댓글 목록 · #58 쓰기 · #59 지우기 ───────────

COMMENT_COLUMNS = (
    "m.id, m.user_id, m.body, m.created_at, COALESCE(up.nickname, '이웃') AS nickname"
)
COMMENT_JOINS = "FROM club_comments m LEFT JOIN user_profiles up ON up.user_id = m.user_id"


def comment_view(row: Any, viewer: CurrentUser | None) -> dict[str, Any]:
    """`ClubComment`(C3). user_id는 넣지 않는다."""
    return {
        "id": str(row.id),
        "body": row.body,
        "author_nickname": row.nickname,
        "created_at": iso(row.created_at),
        "mine": viewer is not None and viewer.id == row.user_id,
    }


def encode_comment_cursor(created_at: datetime, comment_id: Any) -> str:
    raw = json.dumps([created_at.isoformat(), str(comment_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_comment_cursor(cursor: str | None) -> tuple[datetime, UUID] | None:
    if cursor is None or cursor == "":
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode())
        if not isinstance(raw, list) or len(raw) != 2 or not all(isinstance(v, str) for v in raw):
            raise ValueError("cursor shape")
        at = datetime.fromisoformat(raw[0])
        if at.tzinfo is None:
            raise ValueError("cursor tz")
        return at, UUID(raw[1])
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise validation_error("cursor") from exc


def ensure_visible_club(c: Connection, club_id: UUID) -> Any:
    club = c.execute(text("SELECT id, status FROM clubs WHERE id = :id"), {"id": club_id}).first()
    if club is None or club.status == "hidden":
        raise not_found()
    return club


@router.get("/clubs/{club_id}/comments")
async def list_comments(
    request: Request,
    club_id: UUID,
    cursor: str | None = None,
    limit: int = Query(COMMENTS_LIMIT_DEFAULT, ge=1, le=COMMENTS_LIMIT_MAX),
    viewer: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    after = decode_comment_cursor(cursor)

    def tx(c: Connection) -> list[Any]:
        ensure_visible_club(c, club_id)
        cond, args = "", {}
        if after is not None:
            cond, args = " AND (m.created_at, m.id) > (:after_at, :after_id)", {"after_at": after[0], "after_id": after[1]}
        return c.execute(text(
            f"SELECT {COMMENT_COLUMNS} {COMMENT_JOINS} WHERE m.club_id = :id AND m.status = 'published'{cond} "
            "ORDER BY m.created_at ASC, m.id ASC LIMIT :n"
        ), dict(args, id=club_id, n=limit + 1)).all()

    rows = await run_db(request.app.state.engine, tx)
    page = rows[:limit]
    next_cursor = encode_comment_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit else None
    return {"items": [comment_view(r, viewer) for r in page], "next_cursor": next_cursor}


class CommentIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    body: str
    client_request_id: UUID


INSERT_COMMENT = text(
    "INSERT INTO club_comments (club_id, user_id, body, client_request_id) VALUES (:id, :uid, :body, :rid) "
    "ON CONFLICT ON CONSTRAINT club_comments_user_client_request_key DO NOTHING RETURNING id"
)


@router.post("/clubs/{club_id}/comments")
async def create_comment(
    request: Request, club_id: UUID, body: CommentIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    content = body.body.strip()
    if not 1 <= len(content) <= COMMENT_MAX:  # K1-O3
        raise validation_error("body")

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_active_user(c, user.id)
        ensure_visible_club(c, club_id)
        until = is_restricted(c, user.id, now_kst())  # 제한 중이면 댓글도 못 쓴다(K1-10)
        if until:
            raise ApiError(403, "PARTICIPATION_RESTRICTED", MSG_RESTRICTED, iso_or_empty(until))
        inserted = c.execute(INSERT_COMMENT, {"id": club_id, "uid": user.id, "body": content,
                                              "rid": body.client_request_id}).first()
        comment_id = inserted.id if inserted is not None else c.execute(
            text("SELECT id FROM club_comments WHERE user_id = :uid AND client_request_id = :rid"),
            {"uid": user.id, "rid": body.client_request_id},
        ).scalar_one()
        row = c.execute(text(f"SELECT {COMMENT_COLUMNS} {COMMENT_JOINS} WHERE m.id = :id"), {"id": comment_id}).one()
        return comment_view(row, user), inserted is not None

    view, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=view)


@router.delete("/club-comments/{comment_id}")
async def delete_comment(
    request: Request, comment_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> Response:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        done = c.execute(text(
            "UPDATE club_comments SET status = 'deleted' WHERE id = :id AND user_id = :uid AND status = 'published'"
        ), {"id": comment_id, "uid": user.id}).rowcount
        if done == 0:  # 남의 댓글·없는 댓글·이미 지운 댓글은 같은 응답(K1-O8, 두 번째 404)
            raise not_found("comment_id")

    await run_db(request.app.state.engine, tx)
    return Response(status_code=204)


# ─────────── #32 혼합 피드에 넣는 모임 카드 (feed.py가 부른다) ───────────

FEED_CLUB_COLUMNS = (
    "c.id, c.library_id, c.name, c.starts_at, c.ends_at, c.place, c.status, c.capacity, c.created_at, "
    "c.created_at AS published_at, "
    "(SELECT count(*) FROM club_participations p WHERE p.club_id = c.id AND p.state = 'joined' "
    "AND p.user_id <> c.host_id) AS joined_count"
)
