"""남의 공개 프로필 — my-collection 계약 MY-4 (C-97).

- #74 `GET /users/{profile_id}`: 사진·닉네임·한 줄 소개·출처별 공개 게시물 수·`is_me`.
- #75 `GET /users/{profile_id}/posts?origin=`: 그 사람의 공개 게시물을 출처(`posts.origin`)별로. 한 게시물은 한 탭에만(M4-5).
- `profile_id`는 공개용 `users.public_id`. 내부 `users.id`는 응답에 넣지 않는다. 탈퇴했거나 없으면 같은 `404 NOT_FOUND`.
- 로그인 없이도 본다(M4-12). 로그인했으면 카드의 공감·북마크 표시와 `is_me`만 달라진다.
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_optional_user
from app.common import ApiError
from app.db import run_db
from app.routers.feed import feed_post, my_flags
from app.routers.my_collection import DEFAULT_NICKNAME, LimitQuery, decode_cursor, encode_cursor
from app.routers.posts import POST_COLUMNS, POST_JOINS

router = APIRouter(prefix="/api/v1")

PostOrigin = Literal["post", "reading_log"]


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "찾을 수 없는 사용자예요.", "profile_id")


def active_user_id(c: Connection, profile_id: UUID) -> UUID:
    uid = c.execute(
        text("SELECT id FROM users WHERE public_id = :pid AND status = 'active'"), {"pid": profile_id}
    ).scalar_one_or_none()
    if uid is None:
        raise not_found()
    return uid


@router.get("/users/{profile_id}")
async def get_user_profile(
    request: Request, profile_id: UUID, viewer: CurrentUser | None = Depends(get_optional_user)
) -> dict[str, Any]:
    def tx(c: Connection) -> tuple[UUID, Any, dict[str, int]]:
        uid = active_user_id(c, profile_id)
        profile = c.execute(
            text("SELECT nickname, bio, avatar_url FROM user_profiles WHERE user_id = :u"), {"u": uid}
        ).one_or_none()
        counts = dict(c.execute(text(
            "SELECT origin, count(*) FROM posts WHERE user_id = :u AND status = 'published' GROUP BY origin"
        ), {"u": uid}).all())
        return uid, profile, counts

    uid, profile, counts = await run_db(request.app.state.engine, tx)
    return {
        "profile_id": str(profile_id),
        "nickname": profile.nickname if profile is not None else DEFAULT_NICKNAME,
        "bio": profile.bio if profile is not None else None,
        "avatar_url": profile.avatar_url if profile is not None else None,
        "post_count": int(counts.get("post", 0)),
        "reading_log_count": int(counts.get("reading_log", 0)),
        "is_me": viewer is not None and viewer.id == uid,
    }


@router.get("/users/{profile_id}/posts")
async def list_user_posts(
    request: Request,
    profile_id: UUID,
    origin: PostOrigin,
    cursor: str | None = None,
    limit: int = LimitQuery,
    viewer: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    after = decode_cursor(cursor)

    def tx(c: Connection) -> tuple[list[Any], tuple[set[Any], set[Any]]]:
        uid = active_user_id(c, profile_id)
        sql = (f"SELECT {POST_COLUMNS} {POST_JOINS} "
               "WHERE p.user_id = :u AND p.status = 'published' AND p.origin = :origin")
        params: dict[str, Any] = {"u": uid, "origin": origin, "n": limit + 1}
        if after is not None:
            sql += " AND (p.published_at, p.id) < (:after_ts, :after_id)"
            params.update(after_ts=after[0], after_id=after[1])
        sql += " ORDER BY p.published_at DESC, p.id DESC LIMIT :n"
        rows = c.execute(text(sql), params).all()
        return rows, my_flags(c, viewer, [r.id for r in rows[:limit]])

    rows, (reacted, saved) = await run_db(request.app.state.engine, tx)
    page = rows[:limit]
    return {
        "items": [feed_post(request, r, reacted, saved) for r in page],
        "next_cursor": encode_cursor(page[-1].published_at, page[-1].id) if len(rows) > limit else None,
    }
