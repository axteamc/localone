"""방명록 올리기(#33)·철회(#34). local-feed VISIT-3-P1 — 계약 VISIT-3 C2·C3·C5·C6·P4."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.posts import MSG_NOT_FOUND, validation_error

GUESTBOOK_BODY_MAX = 140  # V3-O5 (C5 guestbook_body_len_check와 같은 값)

router = APIRouter(prefix="/api/v1")

GUESTBOOK_COLUMNS = (
    "g.id, g.user_id, g.library_id, g.body, g.status, g.published_at, "
    "COALESCE(up.nickname, '이웃') AS nickname"
)
GUESTBOOK_JOINS = "FROM guestbook_entries g LEFT JOIN user_profiles up ON up.user_id = g.user_id"


class GuestbookIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 user_id 등은 읽지 않는다

    body: str
    client_request_id: UUID


def guestbook_item(row: Any, viewer: CurrentUser | None) -> dict[str, Any]:
    """`GuestbookItem`(C3). user_id는 넣지 않고 `mine`만 준다."""
    return {
        "id": str(row.id),
        "library_id": int(row.library_id),
        "body": row.body,
        "author_nickname": row.nickname,
        "published_at": now_kst(row.published_at).isoformat(timespec="seconds"),
        "mine": viewer is not None and viewer.id == row.user_id,
    }


def select_entry(c: Connection, entry_id: Any) -> Any:
    return c.execute(
        text(f"SELECT {GUESTBOOK_COLUMNS} {GUESTBOOK_JOINS} WHERE g.id = :id"), {"id": entry_id}
    ).one()


INSERT_ENTRY = text(
    "INSERT INTO guestbook_entries (user_id, library_id, body, client_request_id) "
    "VALUES (:uid, :lib, :body, :rid) ON CONFLICT (user_id, client_request_id) DO NOTHING RETURNING id"
)
SELECT_BY_CLIENT_REQUEST = text(
    "SELECT id FROM guestbook_entries WHERE user_id = :uid AND client_request_id = :rid"
)
UPDATE_WITHDRAW = text(
    "UPDATE guestbook_entries SET status = 'withdrawn', updated_at = now() "
    "WHERE id = :id AND user_id = :uid AND status IN ('published', 'withdrawn')"
)


# ─────────── #33 방명록 올리기 ───────────


@router.post("/libraries/{library_id}/guestbook")
async def create_guestbook(
    request: Request, library_id: int, body: GuestbookIn, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    content = body.body.strip()
    if not 1 <= len(content) <= GUESTBOOK_BODY_MAX:  # V3-O5
        raise validation_error("body")

    def tx(c: Connection) -> tuple[Any, bool]:
        lock_active_user(c, user.id)
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        inserted = c.execute(
            INSERT_ENTRY, {"uid": user.id, "lib": library_id, "body": content, "rid": body.client_request_id}
        ).first()
        if inserted is not None:
            return select_entry(c, inserted.id), True
        # 같은 요청 재전송 → 200, 새 행 없음(V3-9)
        entry_id = c.execute(SELECT_BY_CLIENT_REQUEST, {"uid": user.id, "rid": body.client_request_id}).scalar_one()
        return select_entry(c, entry_id), False

    row, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=guestbook_item(row, user))


# ─────────── #34 방명록 철회 ───────────


@router.post("/guestbook/{entry_id}/withdraw")
async def withdraw_guestbook(
    request: Request, entry_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, bool]:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        if c.execute(UPDATE_WITHDRAW, {"id": entry_id, "uid": user.id}).rowcount == 0:
            # 남의 글·없는 글·운영 숨김 글은 같은 응답(존재를 드러내지 않는다)
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "entry_id")

    await run_db(request.app.state.engine, tx)
    return {"ok": True}
