"""내 정보 모음: 내 프로필·내 게시물·좋아요·북마크 조회 — my-collection 계약 MY-1 (MY-1-P1).

- 4개 경로 모두 필수 인증. 토큰의 user.id 본인 것만 조회하고 쿼리의 user_id 등은 받지 않는다(Y2, M-#4).
- 공개(published) 게시물만 보인다. 철회·숨김 글은 목록에서 빠지지만 공감·북마크 행은 그대로라
  다시 공개되면 원래 시각 순서로 돌아온다(Y3, C-46 D5, M-#5).
- 커서는 (정렬 시각, post_id) 복합 키를 base64url JSON으로 감싼다. 동률에도 중복·누락이 없다(H-ARCH-10).

MY-2-P1(계약 MY-2 C2·C3·C6·P4): #38 `PATCH /me/profile`(보낸 칸만), #39 `POST /uploads/avatar`(EXIF 지움, DB 쓰기 없음).
"""

import asyncio
import base64
import json
import re
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, ensure_user_profile_if_absent, get_current_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.feed import feed_post, my_flags
from app.routers.posts import (ALLOWED_TYPES, MSG_STORAGE, MSG_TOO_LARGE, POST_COLUMNS, POST_IMAGE_MAX_BYTES,
                               POST_JOINS, reencode_without_exif)

LIMIT_DEFAULT = 20
LIMIT_MAX = 50
MSG_VALIDATION = "요청 형식이 올바르지 않아요."
DEFAULT_NICKNAME = "이웃"  # nickname_of 규칙(행이 없을 때)
NICKNAME_MAX = 40  # Y2-2(0003 CHECK와 같음)
BIO_MAX = 60  # Y2-O2
MSG_NOTHING = "바꿀 내용이 없어요"
MSG_STORAGE_CHECK = "사진을 확인하지 못했어요. 다시 시도해 주세요."

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
    return my_profile(row)


def my_profile(row: Any) -> dict[str, Any]:
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


# ─────────── MY-2: 프로필 수정(#38)·사진 올리기(#39) ───────────


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 모르는 칸은 버린다 → 남는 칸이 없으면 detail="body"

    nickname: str | None = None
    bio: str | None = None
    avatar_path: str | None = None


def profile_field_error(field: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, field)


def avatar_path_pattern(user_id: UUID) -> re.Pattern[str]:
    return re.compile(rf"avatars/{re.escape(str(user_id))}/[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}}\.jpg")


def ensure_own_avatar_path(path: str, user_id: UUID) -> None:
    if not avatar_path_pattern(user_id).fullmatch(path):  # 남의 경로·모르는 형식(C3)
        raise profile_field_error("avatar_path")


@router.patch("/api/v1/me/profile")
async def patch_my_profile(request: Request, body: ProfilePatch,
                           user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)  # 보낸 칸만 (Y2-5)
    if not fields:
        raise ApiError(422, "VALIDATION_ERROR", MSG_NOTHING, "body")
    # 열린 칸 Y2-O2: bio 길이 검사를 여기에 둔다
    if "nickname" in fields:
        nickname = (fields["nickname"] or "").strip()  # null도 빈 글자로 보고 막는다(C3 null 불가)
        if not 1 <= len(nickname) <= NICKNAME_MAX:
            raise profile_field_error("nickname")
        fields["nickname"] = nickname
    if fields.get("bio") is not None:
        fields["bio"] = fields["bio"].strip() or None  # 공백만이면 null(Y2-3)
    if fields.get("bio") is not None and len(fields["bio"]) > BIO_MAX:
        raise profile_field_error("bio")
    columns: dict[str, Any] = {k: fields[k] for k in ("nickname", "bio") if k in fields}
    if "avatar_path" in fields:
        path = fields["avatar_path"]
        if path is None:
            columns["avatar_url"] = None  # 사진 지우기(Y2-4)
        else:
            ensure_own_avatar_path(path, user.id)
            storage = request.app.state.post_storage
            try:  # 저장소 I/O는 run_db 밖(P4)
                exists = await asyncio.to_thread(storage.exists, path)
            except Exception as exc:
                raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_STORAGE_CHECK) from exc
            if not exists:
                raise profile_field_error("avatar_path")  # #39가 준 적 없는 경로
            url = storage.public_url(path)
            columns["avatar_url"] = url if url.startswith("https://") else f"https://memory.local/{path}"  # 0010 CHECK

    def tx(c: Connection) -> Any:
        lock_active_user(c, user.id)
        ensure_user_profile_if_absent(c, user.id)  # 행이 없던 사용자도 같은 결과
        sets = ", ".join(f"{k} = :{k}" for k in columns)  # SET 절은 보낸 칸만(키는 위 고정 목록)
        c.execute(text(f"UPDATE user_profiles SET {sets}, updated_at = now() WHERE user_id = :uid"),
                  {**columns, "uid": user.id})
        return c.execute(text(
            "SELECT u.id AS user_id, u.created_at, p.nickname, p.bio, p.avatar_url, p.updated_at "
            "FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = :uid"), {"uid": user.id}).one()

    return my_profile(await run_db(request.app.state.engine, tx))


@router.post("/api/v1/uploads/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...),
                        user: CurrentUser = Depends(get_current_user)) -> JSONResponse:
    """읽기·EXIF 지우기·저장소 올리기만 한다. DB에는 쓰지 않는다(#38이 경로를 받아 저장)."""
    data = await file.read(POST_IMAGE_MAX_BYTES + 1)
    if len(data) > POST_IMAGE_MAX_BYTES:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", MSG_TOO_LARGE)
    if file.content_type not in ALLOWED_TYPES:
        raise profile_field_error("file")
    try:
        jpeg, _, _ = await asyncio.to_thread(reencode_without_exif, data)
    except ApiError as exc:  # LOCAL-1 디코더의 detail="image"를 이 경로의 칸 이름으로(P4)
        raise profile_field_error("file") from exc
    path = f"avatars/{user.id}/{uuid4()}.jpg"
    try:
        await asyncio.to_thread(request.app.state.post_storage.put, path, jpeg, "image/jpeg")
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_STORAGE) from exc
    return JSONResponse(status_code=201, content={"avatar_path": path})
