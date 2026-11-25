"""방명록 철회(#34). local-feed VISIT-3-P1 — 계약 VISIT-3 C2·C3·C5·C6·P4.

2026-11-25 C-92(V4-12): 방명록은 스탬프 한마디(#36 `body`)로 합쳤다 → 올리기 #33은 없앴다.
이미 있는 방명록은 피드에 그대로 보이고 본인이 지울 수 있다(#34). `INSERT_ENTRY`는 시연 시드만 쓴다.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.posts import MSG_NOT_FOUND

GUESTBOOK_BODY_MAX = 140  # V3-O5 (C5 guestbook_body_len_check와 같은 값)

router = APIRouter(prefix="/api/v1")

GUESTBOOK_COLUMNS = (
    "g.id, g.user_id, g.library_id, g.body, g.status, g.published_at, "
    "COALESCE(up.nickname, '이웃') AS nickname"
)
GUESTBOOK_JOINS = "FROM guestbook_entries g LEFT JOIN user_profiles up ON up.user_id = g.user_id"


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


INSERT_ENTRY = text(
    "INSERT INTO guestbook_entries (user_id, library_id, body, client_request_id) "
    "VALUES (:uid, :lib, :body, :rid) ON CONFLICT (user_id, client_request_id) DO NOTHING RETURNING id"
)
UPDATE_WITHDRAW = text(
    "UPDATE guestbook_entries SET status = 'withdrawn', updated_at = now() "
    "WHERE id = :id AND user_id = :uid AND status IN ('published', 'withdrawn')"
)


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
