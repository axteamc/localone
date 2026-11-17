"""방문 페이지 피드(#26)·게시물 상세(#27)·같은 책 이어 읽기(#28). local-feed LOCAL-2-P1."""

import base64
import binascii
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_optional_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.posts import (
    MSG_NOT_FOUND,
    POST_COLUMNS,
    POST_JOINS,
    post_public,
    validation_error,
    with_image_url,
)
from app.services.provider_engine import isbn13_is_valid

FEED_LIMIT_DEFAULT = 20  # H2
FEED_LIMIT_MAX = 50
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


# ─────────── #26 방문 페이지 피드 ───────────


@router.get("/libraries/{library_id}/posts")
async def library_feed(
    request: Request,
    library_id: int,
    sort: str = "latest",
    cursor: str | None = None,
    limit: int = LimitQuery,
    viewer: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if sort != "latest":
        raise validation_error("sort")  # H1 (Q-31 전)
    after = decode_cursor(cursor)

    def tx(c: Connection) -> tuple[list[Any], tuple[set[Any], set[Any]]]:
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        rows = select_page(c, "p.library_id = :lib", {"lib": library_id}, after, limit)
        return rows, my_flags(c, viewer, [r.id for r in rows[:limit]])

    rows, flags = await run_db(request.app.state.engine, tx)
    return page_response(request, rows, flags, limit)


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
