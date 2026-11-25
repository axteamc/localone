"""방문 스탬프("다녀왔어요") #35·#36과 스탬프 북마크 #69. local-feed VISIT-4-P1 — 계약 VISIT-4 C2·C3·C5·C6·P4.

2026-11-25 C-92: 스탬프와 방명록을 하나의 방문 기록으로 — #36에 선택 `body`(한마디, 1~140자)를 더하고 고칠 수 있다.
공개 범위(private/public) × 본문 유/무 4상태. `body` 키를 보내지 않으면 기존 본문을 그대로 둔다.
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, now_kst, today_kst
from app.db import run_db
from app.routers.posts import MSG_NOT_FOUND, validation_error

router = APIRouter(prefix="/api/v1")

MSG_DATE_CHANGED = "날짜가 바뀌었어요. 다시 확인해 주세요"
STAMP_RETURNING = "RETURNING id, stamped_on, visibility, body"
STAMP_BODY_MAX = 140  # C-92 (0030 visit_stamps_body_len_check와 같은 값, 방명록 V3-O5와 같은 상한)

# 피드(#32)용 공개 스탬프 칸. 정렬 시각은 created_at(C2 #32)
STAMP_FEED_COLUMNS = (
    "s.id, s.user_id, s.library_id, s.stamped_on, s.body, s.created_at, s.created_at AS published_at, "
    "COALESCE(up.nickname, '이웃') AS nickname"
)
STAMP_FEED_JOINS = "FROM visit_stamps s LEFT JOIN user_profiles up ON up.user_id = s.user_id"


class StampIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 날짜·user_id는 받지 않는다

    visibility: Literal["private", "public"]
    expected_stamp_id: UUID | None = None
    body: str | None = None  # C-92: 키가 없으면 그대로, null·빈 글자는 비움, 앞뒤 공백 정리 뒤 1~140자


def stamp_body(body: StampIn) -> tuple[bool, str | None]:
    """(본문을 바꾸는지, 바꿀 값). 키가 없으면 바꾸지 않는다."""
    if "body" not in body.model_fields_set:
        return False, None
    content = (body.body or "").strip()
    if len(content) > STAMP_BODY_MAX:
        raise validation_error("body")
    return True, content or None


def my_stamp(row: Any) -> dict[str, Any]:
    """`MyStamp`(C3)."""
    return {"id": str(row.id), "stamped_on": row.stamped_on.isoformat(), "visibility": row.visibility, "body": row.body}


def stamp_item(row: Any, viewer: CurrentUser | None, bookmarked: set[Any]) -> dict[str, Any]:
    """피드 카드 `StampItem`(C3). user_id는 넣지 않는다."""
    return {
        "id": str(row.id),
        "library_id": int(row.library_id),
        "stamped_on": row.stamped_on.isoformat(),
        "body": row.body,
        "author_nickname": row.nickname,
        "published_at": now_kst(row.published_at).isoformat(timespec="seconds"),
        "mine": viewer is not None and viewer.id == row.user_id,
        "my_bookmark": viewer is not None and row.id in bookmarked,
    }


def my_stamp_bookmarks(c: Connection, viewer: CurrentUser | None, stamp_ids: list[Any]) -> set[Any]:
    if viewer is None or not stamp_ids:
        return set()
    return set(c.execute(
        text("SELECT stamp_id FROM stamp_bookmarks WHERE user_id = :u AND stamp_id = ANY(:ids)"),
        {"u": viewer.id, "ids": stamp_ids},
    ).scalars().all())


def ensure_library_exists(c: Connection, library_id: int) -> None:
    if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": library_id}).first():
        raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")


SELECT_TODAY = text(
    "SELECT id, stamped_on, visibility, body FROM visit_stamps "
    "WHERE user_id = :uid AND library_id = :lib AND stamped_on = :day"
)
def upsert_stamp_sql(set_body: bool) -> Any:
    """처음 찍기·다시 찍기(멱등). 본문을 보낸 때만 본문도 덮는다."""
    body_set = ", body = EXCLUDED.body" if set_body else ""
    return text(
        "INSERT INTO visit_stamps (user_id, library_id, stamped_on, visibility, body) "
        "VALUES (:uid, :lib, :day, :vis, :body) "
        "ON CONFLICT (user_id, library_id, stamped_on) DO UPDATE SET visibility = EXCLUDED.visibility"
        f"{body_set}, updated_at = now() {STAMP_RETURNING}"
    )


def update_today_stamp_sql(set_body: bool) -> Any:
    """공개 범위·한마디 바꾸기(expected_stamp_id로 오늘 본인 행만)."""
    body_set = ", body = :body" if set_body else ""
    return text(
        f"UPDATE visit_stamps SET visibility = :vis{body_set}, updated_at = now() "
        f"WHERE id = :sid AND user_id = :uid AND library_id = :lib AND stamped_on = :day {STAMP_RETURNING}"
    )


# ─────────── #35 내 오늘 스탬프 ───────────


@router.get("/libraries/{library_id}/stamps/today")
async def get_today_stamp(
    request: Request, library_id: int, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    def tx(c: Connection) -> Any:
        ensure_library_exists(c, library_id)
        return c.execute(SELECT_TODAY, {"uid": user.id, "lib": library_id, "day": today_kst()}).one_or_none()

    row = await run_db(request.app.state.engine, tx)
    return {"stamped": row is not None, "stamp": my_stamp(row) if row is not None else None}


# ─────────── #36 오늘 스탬프 찍기·공개 바꾸기 (멱등 + 자정 경계 expected_stamp_id 가드) ───────────


@router.put("/libraries/{library_id}/stamps/today")
async def put_today_stamp(
    request: Request, library_id: int, body: StampIn, user: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    set_body, new_body = stamp_body(body)

    def tx(c: Connection) -> Any:
        lock_active_user(c, user.id)
        ensure_library_exists(c, library_id)
        day = today_kst()  # 본문 날짜 받지 않음
        params = {"uid": user.id, "lib": library_id, "day": day, "vis": body.visibility, "body": new_body}
        if body.expected_stamp_id is not None:
            row = c.execute(update_today_stamp_sql(set_body), {**params, "sid": body.expected_stamp_id}).one_or_none()
            if row is None:  # 자정 경과·남의 것·다른 도서관·없는 id: 새 행을 만들지 않는다
                raise ApiError(409, "STAMP_DATE_CHANGED", MSG_DATE_CHANGED, None)  # type: ignore[arg-type]
            return row
        return c.execute(upsert_stamp_sql(set_body), params).one()

    row = await run_db(request.app.state.engine, tx)
    return {"stamped": True, "stamp": my_stamp(row)}


# ─────────── #69 공개 스탬프 북마크 저장·해제 (멱등, 재저장 시 saved_at = now()) ───────────


@router.put("/stamps/{stamp_id}/bookmark")
async def put_stamp_bookmark(
    request: Request, stamp_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, bool]:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        public = c.execute(
            text("SELECT 1 FROM visit_stamps WHERE id = :id AND visibility = 'public' AND status = 'published'"),
            {"id": stamp_id},
        ).first()
        if public is None:  # 없거나 비공개거나 운영 숨김(C-92)이면 같은 404
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "stamp_id")
        c.execute(
            text("INSERT INTO stamp_bookmarks (user_id, stamp_id) VALUES (:uid, :sid) "
                 "ON CONFLICT (user_id, stamp_id) DO UPDATE SET saved_at = now()"),
            {"uid": user.id, "sid": stamp_id},
        )

    await run_db(request.app.state.engine, tx)
    return {"bookmarked": True}


@router.delete("/stamps/{stamp_id}/bookmark")
async def delete_stamp_bookmark(
    request: Request, stamp_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, bool]:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        c.execute(text("DELETE FROM stamp_bookmarks WHERE user_id = :uid AND stamp_id = :sid"),
                  {"uid": user.id, "sid": stamp_id})

    await run_db(request.app.state.engine, tx)
    return {"bookmarked": False}
