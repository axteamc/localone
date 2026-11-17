"""공감(#29)·북마크(#30) 켜기·끄기. local-feed LOCAL-2-P2. 몇 번 보내도 결과가 같다(H5·H6)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.db import run_db
from app.routers.feed import ensure_published, reaction_count

router = APIRouter(prefix="/api/v1")


def lock_published_post(c: Connection, post_id: UUID) -> None:
    """철회와 직렬화하려고 게시물 행을 공유 잠금한 뒤 공개 상태를 확인한다(H-#3·H-#4)."""
    status = c.execute(
        text("SELECT status FROM posts WHERE id = :id FOR SHARE"), {"id": post_id}
    ).scalar_one_or_none()
    ensure_published(status)


# ─────────── #29 공감 ───────────


async def _set_reaction(request: Request, post_id: UUID, user: CurrentUser, on: bool) -> dict[str, Any]:
    def tx(c: Connection) -> int:
        lock_active_user(c, user.id)
        lock_published_post(c, post_id)
        if on:
            c.execute(text("INSERT INTO post_reactions (post_id, user_id) VALUES (:p, :u) "
                           "ON CONFLICT (post_id, user_id) DO NOTHING"), {"p": post_id, "u": user.id})
        else:
            c.execute(text("DELETE FROM post_reactions WHERE post_id = :p AND user_id = :u"),
                      {"p": post_id, "u": user.id})
        return reaction_count(c, post_id)

    count = await run_db(request.app.state.engine, tx)
    return {"post_id": str(post_id), "reacted": on, "reaction_count": count}


@router.put("/posts/{post_id}/reaction")
async def put_reaction(request: Request, post_id: UUID,
                       user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await _set_reaction(request, post_id, user, True)


@router.delete("/posts/{post_id}/reaction")
async def delete_reaction(request: Request, post_id: UUID,
                          user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await _set_reaction(request, post_id, user, False)


# ─────────── #30 북마크 ───────────


async def _set_bookmark(request: Request, post_id: UUID, user: CurrentUser, on: bool) -> dict[str, Any]:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        lock_published_post(c, post_id)
        if on:  # 다시 저장하면 saved_at을 새 시각으로(H6)
            c.execute(text("INSERT INTO post_bookmarks (user_id, post_id) VALUES (:u, :p) "
                           "ON CONFLICT (user_id, post_id) DO UPDATE SET saved_at = now()"),
                      {"p": post_id, "u": user.id})
        else:
            c.execute(text("DELETE FROM post_bookmarks WHERE user_id = :u AND post_id = :p"),
                      {"p": post_id, "u": user.id})

    await run_db(request.app.state.engine, tx)
    return {"post_id": str(post_id), "bookmarked": on}


@router.put("/posts/{post_id}/bookmark")
async def put_bookmark(request: Request, post_id: UUID,
                       user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await _set_bookmark(request, post_id, user, True)


@router.delete("/posts/{post_id}/bookmark")
async def delete_bookmark(request: Request, post_id: UUID,
                          user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await _set_bookmark(request, post_id, user, False)
