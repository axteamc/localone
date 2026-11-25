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
from datetime import date, datetime
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
from app.routers.libraries import area_label_of
from app.routers.posts import (ALLOWED_TYPES, MSG_STORAGE, MSG_TOO_LARGE, POST_COLUMNS, POST_IMAGE_MAX_BYTES,
                               POST_JOINS, reencode_without_exif)
from app.routers.stamps import stamp_item

LIMIT_DEFAULT = 20
LIMIT_MAX = 50
VISITED_LIMIT_DEFAULT = 30
VISITED_LIMIT_MAX = 60
MSG_VALIDATION = "요청 형식이 올바르지 않아요."
DEFAULT_NICKNAME = "이웃"  # nickname_of 규칙(행이 없을 때)
NICKNAME_MAX = 40  # Y2-2(0003 CHECK와 같음)
BIO_MAX = 60  # Y2-O2
MSG_NOTHING = "바꿀 내용이 없어요"
MSG_STORAGE_CHECK = "사진을 확인하지 못했어요. 다시 시도해 주세요."

router = APIRouter()

LimitQuery = Query(LIMIT_DEFAULT, ge=1, le=LIMIT_MAX)
VisitedLimitQuery = Query(VISITED_LIMIT_DEFAULT, ge=1, le=VISITED_LIMIT_MAX)


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


class SettingsPatch(BaseModel):
    """C-90 내 설정. 지금은 모임 안내 받기 하나(반납 알림·처음 크게 보일 도서관은 기기 설정)."""

    model_config = ConfigDict(extra="forbid")
    club_notices: bool


def _settings_row(c: Connection, uid: UUID) -> dict[str, Any]:
    value = c.execute(text("SELECT club_notices FROM user_profiles WHERE user_id = :uid"), {"uid": uid}).scalar_one_or_none()
    return {"club_notices": True if value is None else bool(value)}


@router.get("/api/v1/me/settings")
async def get_my_settings(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return await run_db(request.app.state.engine, lambda c: _settings_row(c, user.id))


@router.patch("/api/v1/me/settings")
async def patch_my_settings(request: Request, body: SettingsPatch,
                            user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        lock_active_user(c, user.id)
        ensure_user_profile_if_absent(c, user.id)
        c.execute(text("UPDATE user_profiles SET club_notices = :on WHERE user_id = :uid"),
                  {"on": body.club_notices, "uid": user.id})
        return _settings_row(c, user.id)

    return await run_db(request.app.state.engine, tx)


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
    return await list_merged_bookmarks(request, user, cursor, limit)


# ─────────── MY-3: 북마크 통합(post + stamp, M3-7) · 방문 도서관 모음(#40) ───────────


def encode_bookmark_cursor(ts: datetime, item_kind: str, item_id: Any) -> str:
    raw = json.dumps([ts.isoformat(), item_kind, str(item_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_bookmark_cursor(cursor: str | None) -> tuple[datetime, str, UUID] | None:
    """3-원소 [ts, item_kind, id] 및 기존 MY-1 2-원소 [ts, id] 하위 호환 파싱(M3-7)."""
    if cursor is None or cursor == "":
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        if not isinstance(raw, list):
            raise ValueError("cursor shape")
        if len(raw) == 2:
            ts_raw, kind, id_raw = raw[0], "post", raw[1]
        elif len(raw) == 3:
            ts_raw, kind, id_raw = raw[0], raw[1], raw[2]
            if kind not in ("post", "stamp"):
                raise ValueError("item_kind")
        else:
            raise ValueError("cursor len")
        if not isinstance(ts_raw, str) or not isinstance(id_raw, str):
            raise ValueError("cursor types")
        ts = datetime.fromisoformat(ts_raw)
        if ts.tzinfo is None:
            raise ValueError("tz required")
        return ts, kind, UUID(id_raw)
    except Exception as exc:
        raise ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, "cursor") from exc


def select_bookmark_keys(c: Connection, uid: UUID, after: tuple[datetime, str, UUID] | None,
                         limit: int) -> list[Any]:
    sql = (
        "WITH combined AS ("
        "  SELECT pb.saved_at AS collected_at, 'post'::text AS item_kind, p.id AS id "
        "  FROM post_bookmarks pb JOIN posts p ON p.id = pb.post_id "
        "  WHERE pb.user_id = :uid AND p.status = 'published' "
        "  UNION ALL "
        "  SELECT sb.saved_at AS collected_at, 'stamp'::text AS item_kind, vs.id AS id "
        "  FROM stamp_bookmarks sb JOIN visit_stamps vs ON vs.id = sb.stamp_id "
        "  WHERE sb.user_id = :uid AND vs.visibility = 'public'"
        ") "
        "SELECT collected_at, item_kind, id FROM combined"
    )
    params: dict[str, Any] = {"uid": uid, "n": limit + 1}
    if after is not None:
        sql += (
            " WHERE (collected_at < :after_ts"
            " OR (collected_at = :after_ts AND item_kind > :after_kind)"
            " OR (collected_at = :after_ts AND item_kind = :after_kind AND id < :after_id))"
        )
        params.update(after_ts=after[0], after_kind=after[1], after_id=after[2])
    sql += " ORDER BY collected_at DESC, item_kind ASC, id DESC LIMIT :n"
    return c.execute(text(sql), params).all()


async def list_merged_bookmarks(request: Request, user: CurrentUser, cursor: str | None,
                                limit: int) -> dict[str, Any]:
    after = decode_bookmark_cursor(cursor)

    def tx(c: Connection) -> tuple[list[Any], dict[Any, Any], tuple[set[Any], set[Any]], dict[Any, Any]]:
        keys = select_bookmark_keys(c, user.id, after, limit)
        page = keys[:limit]
        post_ids = [k.id for k in page if k.item_kind == "post"]
        stamp_ids = [k.id for k in page if k.item_kind == "stamp"]
        posts_by_id: dict[Any, Any] = {}
        flags: tuple[set[Any], set[Any]] = (set(), set())
        if post_ids:
            post_rows = c.execute(
                text(f"SELECT {POST_COLUMNS} {POST_JOINS} WHERE p.id = ANY(:ids)"),
                {"ids": post_ids},
            ).all()
            posts_by_id = {r.id: r for r in post_rows}
            flags = my_flags(c, user, post_ids)
        stamps_by_id: dict[Any, Any] = {}
        if stamp_ids:
            stamp_rows = c.execute(
                text(
                    "SELECT s.id, s.user_id, s.library_id, l.name AS library_name, s.stamped_on, "
                    "s.created_at AS published_at, COALESCE(up.nickname, '이웃') AS nickname "
                    "FROM visit_stamps s "
                    "JOIN libraries l ON l.id = s.library_id "
                    "LEFT JOIN user_profiles up ON up.user_id = s.user_id "
                    "WHERE s.id = ANY(:ids)"
                ),
                {"ids": stamp_ids},
            ).all()
            stamps_by_id = {r.id: r for r in stamp_rows}
        return keys, posts_by_id, flags, stamps_by_id

    keys, posts_by_id, (reacted, saved), stamps_by_id = await run_db(request.app.state.engine, tx)
    page = keys[:limit]
    items: list[dict[str, Any]] = []
    for k in page:
        collected_at = now_kst(k.collected_at).isoformat(timespec="seconds")
        if k.item_kind == "post":
            row = posts_by_id.get(k.id)
            if row is None:
                continue
            item = feed_post(request, row, reacted, saved)
            item["item_kind"] = "post"
            item["collected_at"] = collected_at
            items.append(item)
        else:
            row = stamps_by_id.get(k.id)
            if row is None:
                continue
            item = stamp_item(row, user, {row.id})
            item["item_kind"] = "stamp"
            item["library_name"] = row.library_name
            item["collected_at"] = collected_at
            items.append(item)
    return {
        "items": items,
        "next_cursor": (
            encode_bookmark_cursor(page[-1].collected_at, page[-1].item_kind, page[-1].id)
            if len(keys) > limit
            else None
        ),
    }


def encode_visited_cursor(last_on: date, library_id: int) -> str:
    raw = json.dumps([last_on.isoformat(), int(library_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_visited_cursor(cursor: str | None) -> tuple[date, int] | None:
    if cursor is None or cursor == "":
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        if not isinstance(raw, list) or len(raw) != 2:
            raise ValueError("cursor shape")
        day_raw, lib_raw = raw[0], raw[1]
        if not isinstance(day_raw, str) or isinstance(lib_raw, bool) or not isinstance(lib_raw, int):
            raise ValueError("cursor types")
        if lib_raw < 1:
            raise ValueError("library_id")
        return date.fromisoformat(day_raw), lib_raw
    except Exception as exc:
        raise ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, "cursor") from exc


@router.get("/api/v1/me/visited-libraries")
async def list_my_visited_libraries(
    request: Request,
    cursor: str | None = None,
    limit: int = VisitedLimitQuery,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """#40 도서관 방문 모음: 본인 스탬프(공개·비공개) 또는 공개 방명록이 있는 도서관만 최신순(M3-2·M3-5·M3-6)."""
    after = decode_visited_cursor(cursor)

    def tx(c: Connection) -> list[Any]:
        sql = (
            "WITH s AS ("
            "  SELECT library_id, count(*)::int AS stamp_days, min(stamped_on) AS f, max(stamped_on) AS l "
            "  FROM visit_stamps WHERE user_id = :uid GROUP BY library_id"
            "), g AS ("
            "  SELECT library_id, count(*)::int AS guestbook_count, "
            "         min((published_at AT TIME ZONE 'Asia/Seoul')::date) AS f, "
            "         max((published_at AT TIME ZONE 'Asia/Seoul')::date) AS l "
            "  FROM guestbook_entries WHERE user_id = :uid AND status = 'published' GROUP BY library_id"
            "), merged AS ("
            "  SELECT COALESCE(s.library_id, g.library_id) AS library_id, "
            "         COALESCE(s.stamp_days, 0) AS stamp_days, "
            "         COALESCE(g.guestbook_count, 0) AS guestbook_count, "
            "         LEAST(s.f, g.f) AS first_on, "
            "         GREATEST(s.l, g.l) AS last_on "
            "  FROM s FULL JOIN g USING (library_id)"
            ") "
            "SELECT m.library_id, l.name, l.address, m.stamp_days, m.guestbook_count, m.first_on, m.last_on "
            "FROM merged m JOIN libraries l ON l.id = m.library_id"
        )
        params: dict[str, Any] = {"uid": user.id, "n": limit + 1}
        if after is not None:
            sql += " WHERE (m.last_on < :after_day OR (m.last_on = :after_day AND m.library_id > :after_lib))"
            params.update(after_day=after[0], after_lib=after[1])
        sql += " ORDER BY m.last_on DESC, m.library_id ASC LIMIT :n"
        return c.execute(text(sql), params).all()

    rows = await run_db(request.app.state.engine, tx)
    page = rows[:limit]
    return {
        "items": [
            {
                "library": {
                    "id": int(r.library_id),
                    "name": r.name,
                    "address": r.address,
                    "area_label": area_label_of(r.address),
                },
                "stamp_days": int(r.stamp_days),
                "guestbook_count": int(r.guestbook_count),
                "first_on": r.first_on.isoformat(),
                "last_on": r.last_on.isoformat(),
            }
            for r in page
        ],
        "next_cursor": encode_visited_cursor(page[-1].last_on, int(page[-1].library_id)) if len(rows) > limit else None,
    }


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
