"""방문 페이지 피드(#26)·게시물 상세(#27)·같은 책 이어 읽기(#28). local-feed LOCAL-2-P1.

혼합 피드(#32, 게시물+방명록)는 VISIT-3-P1에서 맨 아래에 더했다(기존 경로 무변경)."""

import base64
import binascii
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, get_optional_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.clubs import FEED_CLUB_COLUMNS, club_item
from app.routers.guestbook import GUESTBOOK_COLUMNS, GUESTBOOK_JOINS, guestbook_item
from app.routers.posts import (
    BODY_MAX,
    MSG_FORBIDDEN,
    MSG_NOT_FOUND,
    OVERLAY_MAX,
    POST_COLUMNS,
    POST_JOINS,
    _clean_text,
    post_public,
    validation_error,
    with_image_url,
)
from app.routers.stamps import STAMP_FEED_COLUMNS, STAMP_FEED_JOINS, my_stamp_bookmarks, stamp_item
from app.services.provider_engine import isbn13_is_valid

FEED_LIMIT_DEFAULT = 20  # H2
FEED_LIMIT_MAX = 50
HOME_FEED_MIN = 6
MSG_POST_NOT_AVAILABLE = "더 이상 공개되지 않는 게시물이에요."

router = APIRouter(prefix="/api/v1")


# ─────────── 커서(H2): (published_at, id)를 base64url로 감싼다. 앱은 뜻을 읽지 않는다 ───────────


def encode_cursor(published_at: datetime, post_id: UUID) -> str:
    raw = f"{published_at.isoformat()}|{post_id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[datetime, UUID] | None:
    if cursor is None or cursor == "":
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        at_text, id_text = raw.split("|")
        at = datetime.fromisoformat(at_text)
        if at.tzinfo is None:
            raise ValueError("cursor time without tz")
        return at, UUID(id_text)
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise validation_error("cursor") from exc


# ─────────── 공통 ───────────


def my_flags(c: Connection, viewer: CurrentUser | None, post_ids: list[Any]) -> tuple[set[Any], set[Any]]:
    """보는 사람이 공감·북마크한 게시물 id 집합. 비로그인이면 둘 다 비어 있다."""
    if viewer is None or not post_ids:
        return set(), set()
    reacted = c.execute(
        text("SELECT post_id FROM post_reactions WHERE user_id = :u AND post_id = ANY(:ids)"),
        {"u": viewer.id, "ids": post_ids},
    ).scalars().all()
    saved = c.execute(
        text("SELECT post_id FROM post_bookmarks WHERE user_id = :u AND post_id = ANY(:ids)"),
        {"u": viewer.id, "ids": post_ids},
    ).scalars().all()
    return set(reacted), set(saved)


def feed_post(request: Request, row: Any, reacted: set[Any], saved: set[Any]) -> dict[str, Any]:
    """`FeedPost`(C3). 작성자·공감 수·본문·user_id는 넣지 않는다(H4)."""
    r = with_image_url(request, row)
    book = None
    if r.book_isbn13 is not None:
        book = {"isbn13": r.book_isbn13, "title": r.book_title, "author": r.book_author}
    return {
        "id": str(r.id),
        "library_id": int(r.library_id),
        "library_name": r.library_name,
        "image_kind": r.image_kind,
        "image_url": r.image_url,
        "image_value": r.image_value if r.image_kind == "template" else None,
        "image_color": r.image_value if r.image_kind == "color" else None,
        "overlay_text": r.overlay_text,
        "book": book,
        "published_at": now_kst(r.published_at).isoformat(timespec="seconds"),
        "my_reaction": r.id in reacted,
        "my_bookmark": r.id in saved,
    }


def select_page(c: Connection, where: str, args: dict[str, Any], after: tuple[datetime, UUID] | None,
                limit: int) -> list[Any]:
    """공개 게시물만, 최신순(H1), 커서 다음부터 limit+1개."""
    sql = f"SELECT {POST_COLUMNS} {POST_JOINS} WHERE p.status = 'published' AND {where}"
    params = dict(args, n=limit + 1)
    if after is not None:
        sql += " AND (p.published_at, p.id) < (:after_at, :after_id)"
        params.update(after_at=after[0], after_id=after[1])
    sql += " ORDER BY p.published_at DESC, p.id DESC LIMIT :n"
    return c.execute(text(sql), params).all()


def page_response(request: Request, rows: list[Any], flags: tuple[set[Any], set[Any]],
                  limit: int) -> dict[str, Any]:
    page = rows[:limit]
    return {
        "items": [feed_post(request, r, *flags) for r in page],
        "next_cursor": encode_cursor(page[-1].published_at, page[-1].id) if len(rows) > limit else None,
    }


LimitQuery = Query(FEED_LIMIT_DEFAULT, ge=1, le=FEED_LIMIT_MAX)


# ─────────── #26 도서관 게시물과 홈 지역 보충 ───────────


def select_region_posts(
    c: Connection, library_id: int, library: Any, remaining: int
) -> list[Any]:
    district = []
    if library.dtl_region_code:
        district = select_page(
            c, "p.library_id <> :lib AND l.dtl_region_code = :code",
            {"lib": library_id, "code": library.dtl_region_code}, None, remaining,
        )[:remaining]
        remaining -= len(district)
    if remaining <= 0 or not library.region_code:
        return district
    province = select_page(
        c, "p.library_id <> :lib AND l.region_code = :code AND NOT (p.id = ANY(:seen))",
        {"lib": library_id, "code": library.region_code, "seen": [r.id for r in district]},
        None, remaining,
    )[:remaining]
    return district + province


@router.get("/libraries/{library_id}/posts")
async def library_feed(
    request: Request,
    library_id: int,
    sort: str = "latest",
    cursor: str | None = None,
    limit: int = LimitQuery,
    expand: str | None = None,
    viewer: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if sort != "latest":
        raise validation_error("sort")  # H1 (Q-31 전)
    after = decode_cursor(cursor)
    if expand is not None and (expand != "region" or after is not None):
        raise validation_error("expand")

    def tx(c: Connection) -> tuple[list[Any], list[Any], tuple[set[Any], set[Any]]]:
        library = c.execute(
            text("SELECT dtl_region_code, region_code FROM libraries WHERE id = :id"),
            {"id": library_id},
        ).one_or_none()
        if library is None:
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        rows = select_page(c, "p.library_id = :lib", {"lib": library_id}, after, limit)
        remaining = min(HOME_FEED_MIN, limit) - len(rows)
        extra = select_region_posts(c, library_id, library, remaining) if expand and remaining > 0 else []
        flags = my_flags(c, viewer, [r.id for r in rows[:limit] + extra])
        return rows, extra, flags

    rows, extra, flags = await run_db(request.app.state.engine, tx)
    page = page_response(request, rows, flags, limit)
    page["items"].extend(feed_post(request, r, *flags) for r in extra)
    return page


# ─────────── #28 같은 책 이어 읽기 ───────────


@router.get("/books/{isbn13}/posts")
async def book_posts(
    request: Request,
    isbn13: str,
    exclude: UUID | None = None,
    cursor: str | None = None,
    limit: int = LimitQuery,
    viewer: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if not isbn13_is_valid(isbn13):
        raise validation_error("isbn13")
    after = decode_cursor(cursor)

    def tx(c: Connection) -> tuple[list[Any], tuple[set[Any], set[Any]]]:
        where = "b.isbn13 = :isbn"
        args: dict[str, Any] = {"isbn": isbn13}
        if exclude is not None:
            where += " AND p.id <> :exclude"
            args["exclude"] = exclude
        rows = select_page(c, where, args, after, limit)
        return rows, my_flags(c, viewer, [r.id for r in rows[:limit]])

    rows, flags = await run_db(request.app.state.engine, tx)
    return page_response(request, rows, flags, limit)


# ─────────── #27 게시물 상세 ───────────


def ensure_published(status: str | None) -> None:
    """없는 글은 NOT_FOUND, 철회·숨김은 POST_NOT_AVAILABLE(H3). #27·#29·#30이 같이 쓴다."""
    if status is None:
        raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "post_id")
    if status != "published":
        raise ApiError(404, "POST_NOT_AVAILABLE", MSG_POST_NOT_AVAILABLE, "post_id")


def reaction_count(c: Connection, post_id: Any) -> int:
    """공감 수는 표를 세어 준다(H8)."""
    return c.execute(
        text("SELECT count(*) FROM post_reactions WHERE post_id = :id"), {"id": post_id}
    ).scalar_one()


@router.get("/posts/{post_id}")
async def post_detail(
    request: Request, post_id: UUID, viewer: CurrentUser | None = Depends(get_optional_user)
) -> dict[str, Any]:
    def tx(c: Connection) -> tuple[Any, int, tuple[set[Any], set[Any]]]:
        row = c.execute(text(f"SELECT {POST_COLUMNS} {POST_JOINS} WHERE p.id = :id"), {"id": post_id}).one_or_none()
        ensure_published(row.status if row is not None else None)
        return row, reaction_count(c, row.id), my_flags(c, viewer, [row.id])

    row, count, (reacted, saved) = await run_db(request.app.state.engine, tx)
    return post_public(
        with_image_url(request, row),
        viewer=viewer,
        nickname=row.nickname,
        reaction_count=count,
        my_reaction=row.id in reacted,
        my_bookmark=row.id in saved,
    )


# ─────────── #72 게시물 고치기 (2026-11-25 실기기 개선 P5, C-91) ───────────
# 본문과 이미지 위 글자만 고친다(사용자 결정 — 책·이미지는 그대로). 보낸 칸만, 빈 글자·null은 비움.
# 본인 글만(403), 없는 글 404 NOT_FOUND, 철회·숨김은 404 POST_NOT_AVAILABLE. 응답은 #27 상세와 같은 모양.


class PostEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overlay_text: str | None = None
    body: str | None = None

    @field_validator("overlay_text", mode="before")
    @classmethod
    def _overlay(cls, v: Any) -> str | None:
        return _clean_text(v, OVERLAY_MAX)

    @field_validator("body", mode="before")
    @classmethod
    def _body(cls, v: Any) -> str | None:
        return _clean_text(v, BODY_MAX)


@router.patch("/posts/{post_id}")
async def edit_post(
    request: Request, post_id: UUID, body: PostEdit, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    fields = {k: getattr(body, k) for k in ("overlay_text", "body") if k in body.model_fields_set}
    if not fields:
        raise validation_error("body")

    def tx(c: Connection) -> tuple[Any, int, tuple[set[Any], set[Any]]]:
        lock_active_user(c, user.id)
        cur = c.execute(text("SELECT user_id, status FROM posts WHERE id = :id FOR UPDATE"), {"id": post_id}).one_or_none()
        if cur is None:
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "post_id")
        if cur.user_id != user.id:
            raise ApiError(403, "FORBIDDEN", MSG_FORBIDDEN)
        ensure_published(cur.status)
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        c.execute(text(f"UPDATE posts SET {sets}, updated_at = now() WHERE id = :id"), {**fields, "id": post_id})
        row = c.execute(text(f"SELECT {POST_COLUMNS} {POST_JOINS} WHERE p.id = :id"), {"id": post_id}).one()
        return row, reaction_count(c, row.id), my_flags(c, user, [row.id])

    row, count, (reacted, saved) = await run_db(request.app.state.engine, tx)
    return post_public(
        with_image_url(request, row),
        viewer=user,
        nickname=row.nickname,
        reaction_count=count,
        my_reaction=row.id in reacted,
        my_bookmark=row.id in saved,
    )


# ─────────── #32 혼합 피드 (VISIT-3-P1, 계약 VISIT-3 V3-8·P4) ───────────
# 정렬: 모든 종류를 합쳐 published_at DESC, kind ASC, id DESC. 커서는 base64url JSON [published_at, kind, id].
# `#26`(게시물만, 홈 하단 창)은 바꾸지 않는다.

FEED_ITEM_KINDS = ("club", "guestbook", "post", "stamp")  # kind ASC 순서(CLUB-1 club, VISIT-4 stamp 더함)


def encode_items_cursor(published_at: datetime, kind: str, item_id: Any) -> str:
    raw = json.dumps([published_at.isoformat(), kind, str(item_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_items_cursor(cursor: str | None) -> tuple[datetime, str, UUID] | None:
    if cursor is None or cursor == "":
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode())
        if not isinstance(raw, list) or len(raw) != 3 or not all(isinstance(v, str) for v in raw):
            raise ValueError("cursor shape")
        at_text, kind, id_text = raw
        at = datetime.fromisoformat(at_text)
        if at.tzinfo is None or kind not in FEED_ITEM_KINDS:
            raise ValueError("cursor value")
        return at, kind, UUID(id_text)
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise validation_error("cursor") from exc


def after_clause(alias: str, kind: str, after: tuple[datetime, str, UUID] | None) -> tuple[str, dict[str, Any]]:
    """(published_at, kind, id) 튜플 비교를 이 종류에 맞게 풀어 쓴 "커서 뒤" 조건."""
    if after is None:
        return "", {}
    at, after_kind, after_id = after
    if kind > after_kind:  # 같은 시각이면 뒤 종류는 모두 뒤
        return f" AND {alias}.published_at <= :after_at", {"after_at": at}
    if kind < after_kind:  # 같은 시각이면 앞 종류는 이미 지나감
        return f" AND {alias}.published_at < :after_at", {"after_at": at}
    return f" AND ({alias}.published_at, {alias}.id) < (:after_at, :after_id)", {"after_at": at, "after_id": after_id}


def select_posts_page(c: Connection, library_id: int, after: tuple[datetime, str, UUID] | None,
                      n: int) -> list[Any]:
    cond, args = after_clause("p", "post", after)
    sql = (f"SELECT {POST_COLUMNS} {POST_JOINS} WHERE p.status = 'published' AND p.library_id = :lib{cond} "
           "ORDER BY p.published_at DESC, p.id DESC LIMIT :n")
    return c.execute(text(sql), dict(args, lib=library_id, n=n)).all()


def select_guestbook_page(c: Connection, library_id: int, after: tuple[datetime, str, UUID] | None,
                          n: int) -> list[Any]:
    cond, args = after_clause("g", "guestbook", after)
    sql = (f"SELECT {GUESTBOOK_COLUMNS} {GUESTBOOK_JOINS} WHERE g.status = 'published' AND g.library_id = :lib"
           f"{cond} ORDER BY g.published_at DESC, g.id DESC LIMIT :n")
    return c.execute(text(sql), dict(args, lib=library_id, n=n)).all()


def select_clubs_page(c: Connection, library_id: int, after: tuple[datetime, str, UUID] | None,
                      n: int) -> list[Any]:
    """CLUB-1: 모임 카드. 정렬 시각은 `clubs.created_at`(book-club C2 #32), 운영 숨김은 빼고 취소된 모임은 남긴다(K1-8)."""
    cond, args = after_clause("c", "club", after)
    cond = cond.replace("c.published_at", "c.created_at")
    sql = (f"SELECT {FEED_CLUB_COLUMNS} FROM clubs c WHERE c.status <> 'hidden' AND c.library_id = :lib{cond} "
           "ORDER BY c.created_at DESC, c.id DESC LIMIT :n")
    return c.execute(text(sql), dict(args, lib=library_id, n=n)).all()


def select_stamps_page(c: Connection, library_id: int, after: tuple[datetime, str, UUID] | None,
                       n: int) -> list[Any]:
    """VISIT-4: 공개 스탬프 카드만. 정렬 시각은 `visit_stamps.created_at`(local-feed VISIT-4 C2 #32)."""
    cond, args = after_clause("s", "stamp", after)
    cond = cond.replace("s.published_at", "s.created_at")
    sql = (f"SELECT {STAMP_FEED_COLUMNS} {STAMP_FEED_JOINS} WHERE s.visibility = 'public' AND s.status = 'published'"
           " AND s.library_id = :lib"
           f"{cond} ORDER BY s.created_at DESC, s.id DESC LIMIT :n")
    return c.execute(text(sql), dict(args, lib=library_id, n=n)).all()


@router.get("/libraries/{library_id}/feed")
async def library_feed_items(
    request: Request,
    library_id: int,
    cursor: str | None = None,
    limit: int = LimitQuery,
    viewer: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    after = decode_items_cursor(cursor)

    def tx(c: Connection) -> tuple[list[tuple[str, Any]], bool, tuple[set[Any], set[Any]], set[Any]]:
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        merged = [("post", r) for r in select_posts_page(c, library_id, after, limit + 1)]
        merged += [("guestbook", r) for r in select_guestbook_page(c, library_id, after, limit + 1)]
        merged += [("club", r) for r in select_clubs_page(c, library_id, after, limit + 1)]
        merged += [("stamp", r) for r in select_stamps_page(c, library_id, after, limit + 1)]
        # 안정 정렬을 뒤 기준부터: id DESC → kind ASC → published_at DESC
        merged.sort(key=lambda kv: kv[1].id, reverse=True)
        merged.sort(key=lambda kv: kv[0])
        merged.sort(key=lambda kv: kv[1].published_at, reverse=True)
        page = merged[:limit]
        post_ids = [r.id for kind, r in page if kind == "post"]
        stamp_ids = [r.id for kind, r in page if kind == "stamp"]
        return page, len(merged) > limit, my_flags(c, viewer, post_ids), my_stamp_bookmarks(c, viewer, stamp_ids)

    page, more, flags, stamp_marks = await run_db(request.app.state.engine, tx)
    items: list[dict[str, Any]] = []
    for kind, row in page:
        if kind == "post":
            items.append({"kind": "post", "post": feed_post(request, row, *flags)})
        elif kind == "club":
            items.append({"kind": "club", "club": club_item(row, int(row.joined_count))})
        elif kind == "stamp":
            items.append({"kind": "stamp", "stamp": stamp_item(row, viewer, stamp_marks)})
        else:
            items.append({"kind": "guestbook", "guestbook": guestbook_item(row, viewer)})
    next_cursor = None
    if more:
        last_kind, last = page[-1]
        next_cursor = encode_items_cursor(last.published_at, last_kind, last.id)
    return {"items": items, "next_cursor": next_cursor}
