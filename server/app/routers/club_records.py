"""작은 모임 CLUB-2-P1: 종료 안내·모임 기록(#60)·후기(#61·#62)·다음 모임(#63·#64).

book-club 계약 CLUB-2 K2-1~K2-6, C2·C3·C5·C6·P4.
- 종료 안내(`club_ended`)는 서버 작업자 없이 알림함을 읽을 때 만든다(K2-1, `register_inbox_source`).
- 기록은 만든 사람과 참가 기록이 있는 사람만 본다. 후기는 본인 것만 돌려준다(K2-3, 남의 기록 404).
- 후기를 게시물로 올리면 #24와 같은 저장 규칙으로 게시물 한 건을 만들고, 이후 후기와 게시물은 따로 고친다(K2-3).
- 다음 모임은 이름·소개·책·도서관을 복사하고 장소는 보낸 값 또는 이전 값, 시각은 새로 받는다.
  자동 참가는 없고 이전 회차 참가자(취소·제한 제외)에게 `club_next` 안내만 넣는다(K2-4·K2-5).
"""

from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, get_optional_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers import clubs as clubs_router
from app.routers import posts as posts_router
from app.routers.clubs import (
    FEED_CLUB_COLUMNS, MSG_CLOSED, PLACE_MAX, check_time_order, club_item, club_view, ended, iso, joined_user_ids,
    not_found, participant_rows, roster_version, validation_error,
)
from app.services.inbox import InboxDraft, add_inbox_items, register_inbox_source

router = APIRouter(prefix="/api/v1")

REVIEW_MAX = 2000  # K2-O7 (C5 club_reviews_body_len_check와 같은 값, 앞뒤 공백을 뺀 글자 수)
ENDED_NOTICE_DAYS = 90  # K2-O8 보관 90일 — 그보다 오래 전에 끝난 모임은 종료 안내를 새로 만들지 않는다
SHARE_COLOR = posts_router.FEED_COLOR_TOKENS[0]  # 책 표지가 없을 때 게시물 바탕색

MSG_NOT_ENDED = "아직 끝나지 않은 모임이에요."


# ─────────── K2-1 종료 안내: 알림함을 읽을 때 만든다 ───────────

ENDED_CLUBS_FOR_USER = text(
    "SELECT c.id FROM clubs c WHERE c.status IN ('open', 'closed') AND c.ends_at IS NOT NULL "
    "AND c.ends_at < :now AND c.ends_at > :since AND (c.host_id = :uid OR EXISTS ("
    "SELECT 1 FROM club_participations p WHERE p.club_id = c.id AND p.user_id = :uid AND p.state = 'joined'))"
)


def club_end_items_due(conn: Connection, user_id: UUID, now: datetime) -> list[InboxDraft]:
    """만든 사람·끝까지 참가한 사람에게 지난 종료 안내. 같은 안내는 inbox_once가 한 번만 남긴다."""
    since = now - timedelta(days=ENDED_NOTICE_DAYS)
    rows = conn.execute(ENDED_CLUBS_FOR_USER, {"uid": user_id, "now": now, "since": since}).scalars()
    return [InboxDraft(target={"club_id": str(club_id)}) for club_id in rows]


register_inbox_source("club_ended", club_end_items_due)


# ─────────── #60 기록 ───────────

SELECT_CLUB_ROW = text("SELECT * FROM clubs WHERE id = :id")
SELECT_MY_PARTICIPATION = text(
    "SELECT state, attendance_status FROM club_participations WHERE club_id = :id AND user_id = :uid"
)
# 공유한 게시물이 철회·숨김되면 공유 안 한 것으로 본다(다시 올릴 수 있음)
REVIEW_SQL = (
    "SELECT r.body, r.updated_at, CASE WHEN p.status = 'published' THEN r.shared_post_id END AS shared_post_id "
    "FROM club_reviews r LEFT JOIN posts p ON p.id = r.shared_post_id WHERE r.club_id = :id AND r.user_id = :uid"
)
SELECT_REVIEW = text(REVIEW_SQL)
SELECT_REVIEW_FOR_UPDATE = text(REVIEW_SQL + " FOR UPDATE OF r")


def load_record_club(c: Connection, club_id: UUID, user: CurrentUser) -> tuple[Any, Any]:
    """기록을 볼 수 있는 끝난 모임과 내 참가 행. 남의 기록 404 → 취소 409 → 종료 전 409 (C6)."""
    club = c.execute(SELECT_CLUB_ROW, {"id": club_id}).first()
    if club is None or club.status == "hidden":
        raise not_found()
    mine = c.execute(SELECT_MY_PARTICIPATION, {"id": club_id, "uid": user.id}).first()
    if club.host_id != user.id and mine is None:
        raise not_found()  # 참가하지 않은 사람에게는 있는지도 알리지 않는다
    if club.status == "canceled":
        raise ApiError(409, "CLUB_CLOSED", MSG_CLOSED)  # 취소된 모임은 기록·후기 없음(K1-12)
    if not ended(club, now_kst()):
        raise ApiError(409, "CLUB_NOT_ENDED", MSG_NOT_ENDED)
    return club, mine


def record_view(c: Connection, club_id: UUID, user: CurrentUser) -> dict[str, Any]:
    """응답 `ClubRecord`(C3). 후기는 본인 것만. 명단과 명단 버전은 한 번 읽은 같은 행에서 만든다(#60·#65)."""
    club, mine = load_record_club(c, club_id, user)
    is_host = club.host_id == user.id
    state = mine.state if mine is not None else "none"
    review = c.execute(SELECT_REVIEW, {"id": club_id, "uid": user.id}).first()
    people = participant_rows(c, club_id)
    return {
        "club": club_view(c, club_id, user, people),
        "my_participation": state,
        # 끝까지 참가 신청이 남은 사람만 출석 값이 있다(기본 전체 출석, K2-O1)
        "my_attendance": mine.attendance_status if state == "joined" else None,
        "review": None if review is None else {"body": review.body, "updated_at": iso(review.updated_at)},
        "shared_post_id": None if review is None or review.shared_post_id is None else str(review.shared_post_id),
        "can_create_next": is_host or state == "joined",
        "suggest_next": is_host,  # 다음 모임 제안은 만든 사람에게만(K2-2)
        "attendance_roster_version": roster_version(people) if is_host else None,  # 만든 사람 전용
    }


@router.get("/clubs/{club_id}/record")
async def get_club_record(
    request: Request, club_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    return await run_db(request.app.state.engine, lambda c: record_view(c, club_id, user))


# ─────────── #61 후기 쓰기·고치기 ───────────


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    body: str


UPSERT_REVIEW = text(
    "INSERT INTO club_reviews (club_id, user_id, body) VALUES (:id, :uid, :body) "
    "ON CONFLICT (club_id, user_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()"
)


@router.put("/clubs/{club_id}/review")
async def put_club_review(
    request: Request, club_id: UUID, body: ReviewIn, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    content = body.body.strip()
    if not 1 <= len(content) <= REVIEW_MAX:  # K2-O7
        raise validation_error("body")

    def tx(c: Connection) -> dict[str, Any]:
        lock_active_user(c, user.id)
        load_record_club(c, club_id, user)
        # 공유한 게시물은 건드리지 않는다(따로 고침, K2-3)
        c.execute(UPSERT_REVIEW, {"id": club_id, "uid": user.id, "body": content})
        return record_view(c, club_id, user)

    return await run_db(request.app.state.engine, tx)


# ─────────── #62 후기를 게시물로 ───────────


class ShareIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    client_request_id: UUID


@router.post("/clubs/{club_id}/review/share")
async def share_club_review(
    request: Request, club_id: UUID, body: ShareIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_active_user(c, user.id)
        club, _ = load_record_club(c, club_id, user)
        review = c.execute(SELECT_REVIEW_FOR_UPDATE, {"id": club_id, "uid": user.id}).first()
        if review is None:
            raise not_found("review")  # 저장한 후기가 있어야 올린다
        if review.shared_post_id is not None:
            return record_view(c, club_id, user), False  # 이미 올림(멱등, 한 건)
        book = None
        if club.book_id is not None:
            book = c.execute(text("SELECT id, isbn13, cover_url FROM books WHERE id = :id"),
                             {"id": club.book_id}).first()
        has_cover = book is not None and book.cover_url is not None
        post = posts_router.PostCreate(
            client_request_id=body.client_request_id, library_id=club.library_id,
            isbn13=book.isbn13 if book is not None else None,
            image_kind="cover" if has_cover else "color", image_color=None if has_cover else SHARE_COLOR,
            body=review.body,
        )
        posts_router.validate_kind_fields(post, user.id)
        record = SimpleNamespace(id=book.id, cover_url=book.cover_url) if book is not None else None
        inserted = c.execute(posts_router.INSERT_POST_ON_CONFLICT_DO_NOTHING_RETURNING,
                             posts_router.params(post, user.id, record)).first()  # type: ignore[arg-type]
        post_id = inserted.id if inserted is not None else c.execute(
            posts_router.SELECT_BY_CLIENT_REQUEST_ID, {"uid": user.id, "rid": body.client_request_id}
        ).scalar_one()
        c.execute(text("UPDATE club_reviews SET shared_post_id = :pid WHERE club_id = :id AND user_id = :uid"),
                  {"pid": post_id, "id": club_id, "uid": user.id})
        return record_view(c, club_id, user), inserted is not None

    view, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=view)


# ─────────── #63 다음 모임 만들기 · #64 이미 만든 다음 모임 ───────────


class NextClubIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 이름·책 등은 받지 않는다(복사, K2-4)

    place: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    client_request_id: UUID


def clean_next(body: NextClubIn) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if "place" in body.model_fields_set:
        place = (body.place or "").strip()
        if len(place) > PLACE_MAX:
            raise validation_error("place")
        out["place"] = place or None
    for field in ("starts_at", "ends_at"):
        value = getattr(body, field)
        if value is not None and value.tzinfo is None:
            raise validation_error(field)
        out[field] = value
    check_time_order(out["starts_at"], out["ends_at"])
    return out


INSERT_NEXT_CLUB = text(
    "INSERT INTO clubs (library_id, host_id, name, intro, book_id, place, starts_at, ends_at, previous_club_id, "
    "client_request_id) VALUES (:lib, :uid, :name, :intro, :book_id, :place, :starts_at, :ends_at, :prev, :rid) "
    "ON CONFLICT ON CONSTRAINT clubs_host_client_request_key DO NOTHING RETURNING id"
)
SELECT_BY_CLIENT_REQUEST = text("SELECT id FROM clubs WHERE host_id = :uid AND client_request_id = :rid")


@router.post("/clubs/{club_id}/next")
async def create_next_club(
    request: Request, club_id: UUID, body: NextClubIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    fields = clean_next(body)

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_active_user(c, user.id)
        prev = c.execute(SELECT_CLUB_ROW, {"id": club_id}).first()
        if prev is None or prev.status == "hidden":
            raise not_found()
        if prev.status == "canceled":
            raise ApiError(409, "CLUB_CLOSED", MSG_CLOSED)
        now = now_kst()
        if not ended(prev, now):
            raise ApiError(409, "CLUB_NOT_ENDED", MSG_NOT_ENDED)
        at_end = joined_user_ids(c, club_id)  # 시작 뒤에는 참가 취소가 막혀 지금 명단 = 끝날 때 명단
        if not (prev.host_id == user.id or user.id in at_end):
            raise not_found()
        hit = c.execute(SELECT_BY_CLIENT_REQUEST, {"uid": user.id, "rid": body.client_request_id}).scalar()
        if hit is not None:
            return club_view(c, hit, user), False  # 같은 요청 재전송(C2 멱등)
        inserted = c.execute(INSERT_NEXT_CLUB, {
            "lib": prev.library_id, "uid": user.id, "name": prev.name, "intro": prev.intro, "book_id": prev.book_id,
            "place": fields["place"] if "place" in fields else prev.place,
            "starts_at": fields["starts_at"], "ends_at": fields["ends_at"], "prev": prev.id,
            "rid": body.client_request_id,
        }).first()
        if inserted is None:  # 동시에 같은 요청이 먼저 들어감
            new_id = c.execute(SELECT_BY_CLIENT_REQUEST, {"uid": user.id, "rid": body.client_request_id}).scalar_one()
            return club_view(c, new_id, user), False
        # K2-5: 끝날 때 참가자 중 취소·참가 제한된 사람을 빼고 안내만(자동 참가 없음)
        recipients = [uid for uid in at_end if uid != user.id and not clubs_router.is_restricted(c, uid, now)]
        add_inbox_items(c, recipients, "club_next", {"club_id": str(inserted.id)})
        return club_view(c, inserted.id, user), True

    view, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=view)


@router.get("/clubs/{club_id}/next")
async def list_next_clubs(
    request: Request, club_id: UUID, viewer: CurrentUser | None = Depends(get_optional_user)
) -> dict[str, Any]:
    def tx(c: Connection) -> list[Any]:
        clubs_router.ensure_visible_club(c, club_id)
        return c.execute(text(
            f"SELECT {FEED_CLUB_COLUMNS} FROM clubs c WHERE c.previous_club_id = :id AND c.status <> 'hidden' "
            "ORDER BY c.created_at ASC, c.id ASC"
        ), {"id": club_id}).all()

    rows = await run_db(request.app.state.engine, tx)
    return {"items": [club_item(r, r.joined_count) for r in rows]}
