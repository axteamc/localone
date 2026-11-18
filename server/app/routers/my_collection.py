"""내 정보 모음: 내 프로필·내 게시물·좋아요·북마크 조회 — my-collection 계약 MY-1 (MY-1-P1).

- 4개 경로 모두 필수 인증. 토큰의 user.id 본인 것만 조회하고 쿼리의 user_id 등은 받지 않는다(Y2, M-#4).
- 공개(published) 게시물만 보인다. 철회·숨김 글은 목록에서 빠지지만 공감·북마크 행은 그대로라
  다시 공개되면 원래 시각 순서로 돌아온다(Y3, C-46 D5, M-#5).
- 커서는 (정렬 시각, post_id) 복합 키를 base64url JSON으로 감싼다. 동률에도 중복·누락이 없다(H-ARCH-10).
"""

import base64
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.feed import feed_post, my_flags
from app.routers.posts import POST_COLUMNS, POST_JOINS

LIMIT_DEFAULT = 20
LIMIT_MAX = 50
MSG_VALIDATION = "요청 형식이 올바르지 않아요."
DEFAULT_NICKNAME = "이웃"  # nickname_of 규칙(행이 없을 때)

router = APIRouter()

LimitQuery = Query(LIMIT_DEFAULT, ge=1, le=LIMIT_MAX)


# ─────────── 커서: base64url(JSON [ts_iso, post_id]) ───────────


def encode_cursor(ts: datetime, post_id: Any) -> str:
    raw = json.dumps([ts.isoformat(), str(post_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[datetime, UUID] | None:
    if cursor is None or cursor == "":
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        if not isinstance(raw, list) or len(raw) != 2:
            raise ValueError("cursor shape")
        ts = datetime.fromisoformat(raw[0])
        if ts.tzinfo is None:
            raise ValueError("tz required")
        return ts, UUID(raw[1])
    except Exception as exc:  # 깨진 base64·JSON·ISO·UUID 모두 422 cursor(M-#3), 500으로 새지 않게
        raise ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, "cursor") from exc


# ─────────── 목록 공통 ───────────

# 탭마다: (추가 JOIN, 정렬 시각 식). 모든 탭은 p.status = 'published'만 본다(Y3)
COLLECTIONS: dict[str, tuple[str, str]] = {
    "posts": ("", "p.published_at"),
    "reactions": (" JOIN post_reactions pr ON pr.post_id = p.id AND pr.user_id = :uid", "pr.created_at"),
    "bookmarks": (" JOIN post_bookmarks pb ON pb.post_id = p.id AND pb.user_id = :uid", "pb.saved_at"),
}


def select_collection(c: Connection, kind: str, uid: UUID, after: tuple[datetime, UUID] | None,
                      limit: int) -> list[Any]:
    join, sort_col = COLLECTIONS[kind]
    sql = (f"SELECT {POST_COLUMNS}, {sort_col} AS collected_at {POST_JOINS}{join} "
           "WHERE p.status = 'published'")
    if kind == "posts":
        sql += " AND p.user_id = :uid"
    params: dict[str, Any] = {"uid": uid, "n": limit + 1}
    if after is not None:
        sql += f" AND ({sort_col}, p.id) < (:after_ts, :after_id)"
        params.update(after_ts=after[0], after_id=after[1])
    sql += f" ORDER BY {sort_col} DESC, p.id DESC LIMIT :n"
    return c.execute(text(sql), params).all()


def collection_post(request: Request, row: Any, reacted: set[Any], saved: set[Any]) -> dict[str, Any]:
    """`MyCollectionPost` = `FeedPost`(B C3) + item_kind + collected_at (C3)."""
    item = feed_post(request, row, reacted, saved)
    item["item_kind"] = "post"  # TODO(연결): VISIT-4 D3 — 방문 기록 카드 북마크
    item["collected_at"] = now_kst(row.collected_at).isoformat(timespec="seconds")
    return item


async def list_collection(request: Request, kind: str, user: CurrentUser, cursor: str | None,
                          limit: int) -> dict[str, Any]:
    after = decode_cursor(cursor)

    def tx(c: Connection) -> tuple[list[Any], tuple[set[Any], set[Any]]]:
        rows = select_collection(c, kind, user.id, after, limit)
        return rows, my_flags(c, user, [r.id for r in rows[:limit]])

    rows, (reacted, saved) = await run_db(request.app.state.engine, tx)
    page = rows[:limit]
    return {
        "items": [collection_post(request, r, reacted, saved) for r in page],
        "next_cursor": encode_cursor(page[-1].collected_at, page[-1].id) if len(rows) > limit else None,
    }


# ─────────── 경로 ───────────


@router.get("/api/v1/me/profile")
async def get_my_profile(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    def tx(c: Connection) -> Any:
        return c.execute(text(
            "SELECT u.id AS user_id, u.created_at, p.nickname, p.bio, p.avatar_url, p.updated_at "
            "FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id "
            "WHERE u.id = :uid"), {"uid": user.id}).one()

    row = await run_db(request.app.state.engine, tx)
    return {
        "user_id": str(row.user_id),
        "nickname": row.nickname or DEFAULT_NICKNAME,
        "bio": row.bio,
        "avatar_url": row.avatar_url,
        "updated_at": now_kst(row.updated_at or row.created_at).isoformat(timespec="seconds"),
    }


@router.get("/api/v1/me/posts")
async def list_my_posts(request: Request, cursor: str | None = None, limit: int = LimitQuery,
                        user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await list_collection(request, "posts", user, cursor, limit)


@router.get("/api/v1/me/reactions")
async def list_my_reactions(request: Request, cursor: str | None = None, limit: int = LimitQuery,
                            user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await list_collection(request, "reactions", user, cursor, limit)


@router.get("/api/v1/me/bookmarks")
async def list_my_bookmarks(request: Request, cursor: str | None = None, limit: int = LimitQuery,
                            user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await list_collection(request, "bookmarks", user, cursor, limit)
