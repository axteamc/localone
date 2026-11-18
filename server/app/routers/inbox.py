"""알림함 #47~#49 — core 계약 M2-0-P1 (C2·C3·C6).

- 세 경로 모두 필수 인증, 토큰 본인(recipient_id) 것만 읽고 바꾼다(Z1, 05 R19).
- 읽을 때(#47·#48) 같은 트랜잭션에서 `materialize_due`를 먼저 돌린다(Z2, C-11 작업자 없음).
  #47도 돌려야 내 정보 점(MY-2 Y2-7)이 종료 안내를 놓치지 않는다.
- 목록은 `created_at DESC, id DESC`, 커서는 MY-1과 같은 (시각, id) base64url JSON.
- 읽음 처리(#49)는 `{ids:[...]}` 또는 `{all:true}` 하나만. 남의 id는 조용히 무시하고 멱등이다(C6).
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user
from app.common import now_kst
from app.db import run_db
from app.routers.my_collection import decode_cursor, encode_cursor
from app.services.inbox import materialize_due

LIMIT_DEFAULT = 30
LIMIT_MAX = 50
READ_IDS_MAX = 100

router = APIRouter()


class ReadBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[UUID] | None = Field(default=None, min_length=1, max_length=READ_IDS_MAX)
    all: bool | None = None

    @model_validator(mode="after")
    def _one_of(self) -> "ReadBody":
        if (self.ids is None) == (self.all is None) or self.all is False:
            raise ValueError("ids 또는 all: true 중 하나만")
        return self


def has_unread(c: Connection, uid: UUID) -> bool:
    return c.execute(text("SELECT EXISTS (SELECT 1 FROM inbox_items WHERE recipient_id = :uid AND read_at IS NULL)"),
                     {"uid": uid}).scalar_one()


def inbox_item(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "kind": row.kind,
        "title": row.title,
        "target": row.target,
        "created_at": now_kst(row.created_at).isoformat(timespec="seconds"),
        "read": row.read_at is not None,
    }


@router.get("/api/v1/me/inbox/unread")
async def get_inbox_unread(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, bool]:
    def tx(c: Connection) -> bool:
        materialize_due(c, user.id, now_kst())
        return has_unread(c, user.id)

    return {"has_unread": await run_db(request.app.state.engine, tx)}


@router.get("/api/v1/me/inbox")
async def list_inbox(request: Request, cursor: str | None = None,
                     limit: int = Query(LIMIT_DEFAULT, ge=1, le=LIMIT_MAX),
                     user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    after = decode_cursor(cursor)

    def tx(c: Connection) -> list[Any]:
        materialize_due(c, user.id, now_kst())
        sql = ("SELECT id, kind, title, target, created_at, read_at FROM inbox_items "
               "WHERE recipient_id = :uid")
        params: dict[str, Any] = {"uid": user.id, "n": limit + 1}
        if after is not None:
            sql += " AND (created_at, id) < (:after_ts, :after_id)"
            params.update(after_ts=after[0], after_id=after[1])
        sql += " ORDER BY created_at DESC, id DESC LIMIT :n"
        return c.execute(text(sql), params).all()

    rows = await run_db(request.app.state.engine, tx)
    page = rows[:limit]
    return {
        "items": [inbox_item(r) for r in page],
        "next_cursor": encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit else None,
    }


@router.post("/api/v1/me/inbox/read")
async def mark_inbox_read(request: Request, body: ReadBody,
                          user: CurrentUser = Depends(get_current_user)) -> dict[str, bool]:
    def tx(c: Connection) -> bool:
        sql = "UPDATE inbox_items SET read_at = now() WHERE recipient_id = :uid AND read_at IS NULL"
        params: dict[str, Any] = {"uid": user.id}
        if body.ids is not None:
            sql += " AND id = ANY(:ids)"
            params["ids"] = list(body.ids)
        c.execute(text(sql), params)
        return has_unread(c, user.id)

    return {"has_unread": await run_db(request.app.state.engine, tx)}
