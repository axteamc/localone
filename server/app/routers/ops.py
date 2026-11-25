"""운영 경로 `/ops/*` — core 계약 M2-0-P2 (Z4·Z5, C2·C6).

- 모든 경로는 `get_operator` 하나로 막는다. 비로그인·운영자 아님 모두 `404 NOT_FOUND`(경로가 있는 것을 알리지 않음).
  의존성이 본문·경로 검증보다 먼저 돌아서, 운영자가 아니면 잘못된 본문을 보내도 `404`다.
- 처리 하나 = 한 트랜잭션: 대상 `FOR UPDATE` → 상태 변경 → `moderation_actions`(사유) → 필요하면 `add_inbox_items`.
  이미 그 상태면 아무것도 바꾸지 않고 `200`(멱등 — 기록 행도 늘지 않는다).
- 숨기면 작성자에게 `moderation` 안내(Z5). 신고자에게는 결과를 알리지 않는다.
- 응답에 독서 기록·대출·비공개 스탬프·북마크·좋아요·신고자를 넣지 않는다(① 격리).
- 도서관 룩 재배정·서가 테마(`/ops/libraries/*`·`/ops/shelf-themes*`)는 M2-0-P3(아래 마지막 두 절).
"""

from datetime import date, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationInfo, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from app import policy
from app.auth import CurrentUser, get_current_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.routers.posts import reading_log_publish_conflict
from app.services.inbox import add_inbox_items
from app.services.looks import set_look_by_operator, shelf_book
from app.services.provider_engine import isbn13_is_valid

REASON_MAX = 500  # 기본값(Claude)
LIST_MAX = 100  # 목록은 커서 없이 오래된 순 최대 100(C2 "목록 —")
PREVIEW_MAX = 80

router = APIRouter(prefix="/api/v1/ops")

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=REASON_MAX)]
TargetKind = Literal["post", "guestbook", "club", "club_comment", "stamp"]  # stamp: C-92 V4-12


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "찾을 수 없어요.")


async def get_operator(request: Request) -> CurrentUser:
    try:
        user = await get_current_user(request)
    except ApiError:
        raise not_found() from None

    def tx(c: Connection) -> bool:
        return c.execute(text("SELECT EXISTS (SELECT 1 FROM operators WHERE user_id = :uid)"),
                         {"uid": user.id}).scalar_one()

    if not await run_db(request.app.state.engine, tx):
        raise not_found()
    return user


class ReasonBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Reason


class DecideBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["delete_only", "delete_and_restrict", "rejected"]
    reason: Reason
    restriction_ends_at: datetime | None = None
    restriction_days: Literal[1, 3, 7] | None = None

    @model_validator(mode="after")
    def _ends_at(self) -> "DecideBody":
        fields = self.model_fields_set & {"restriction_days", "restriction_ends_at"}
        if self.decision == "delete_and_restrict":
            if len(fields) != 1 or ("restriction_ends_at" in fields and self.restriction_ends_at is None):
                raise ValueError("제한 기간을 하나 선택해 주세요.")
        elif fields:
            raise ValueError("참가 제한을 할 때만 기간을 선택해 주세요.")
        return self


class RestrictionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID
    reason_kind: Literal["comment", "no_show"]
    source_id: UUID
    reason: Reason
    ends_at: datetime | None  # null = 참가 불가(기간 없음). 키는 꼭 보낸다


def iso(value: datetime | None) -> str | None:
    return None if value is None else now_kst(value).isoformat(timespec="seconds")


def check_future(value: datetime | None, field: str) -> None:
    if value is None:
        return
    if value.tzinfo is None or value <= now_kst():
        raise ApiError(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않아요.", field)


def record(c: Connection, actor: UUID, action: str, target_kind: str, target_id: Any, reason: str) -> UUID:
    return c.execute(text(
        "INSERT INTO moderation_actions (actor_id, action, target_kind, target_id, reason) "
        "VALUES (:a, :act, :k, :t, :r) RETURNING id"),
        {"a": actor, "act": action, "k": target_kind, "t": str(target_id), "r": reason}).scalar_one()


# ─────────── 숨김·복구 ───────────

# 종류 → (표, 작성자 칸, 보이는 상태들, updated_at 칸 있음)
TARGETS: dict[str, tuple[str, str, tuple[str, ...], bool]] = {
    "post": ("posts", "user_id", ("published",), True),
    "guestbook": ("guestbook_entries", "user_id", ("published",), True),
    "club": ("clubs", "host_id", ("open", "closed", "canceled"), True),
    "club_comment": ("club_comments", "user_id", ("published",), False),
    # C-92: 공개 스탬프(한마디)도 게시물과 같이 숨긴다. 비공개는 남에게 안 보이므로 대상이 아니다(아래 상태 계산)
    "stamp": ("visit_stamps", "user_id", ("published",), True),
}

# 스탬프 상태 = 숨김이면 hidden, 공개면 published, 비공개면 private(신고·숨김 대상 아님)
STAMP_STATUS_SQL = "CASE WHEN status = 'hidden' THEN 'hidden' WHEN visibility = 'public' THEN 'published' ELSE 'private' END"


def lock_target(c: Connection, kind: str, target_id: UUID) -> Any:
    table, owner, _, _ = TARGETS[kind]
    extra = ", club_id" if kind == "club_comment" else ", cancel_reason" if kind == "club" else ""
    extra += ", library_id" if kind == "stamp" else ""
    status = f"{STAMP_STATUS_SQL} AS status" if kind == "stamp" else "status"
    return c.execute(text(f"SELECT id, {status}, {owner} AS owner_id{extra} FROM {table} WHERE id = :id FOR UPDATE"),
                     {"id": target_id}).one_or_none()


def set_status(c: Connection, kind: str, target_id: UUID, status: str) -> None:
    table, _, _, has_updated = TARGETS[kind]
    stamp = ", updated_at = now()" if has_updated else ""
    c.execute(text(f"UPDATE {table} SET status = :s{stamp} WHERE id = :id"), {"s": status, "id": target_id})


def inbox_target(kind: str, row: Any) -> dict[str, str]:
    """작성자 안내가 누르면 갈 곳(C3 InboxItem.target). 댓글은 모임으로, 댓글 id는 dedupe_key에만."""
    if kind == "post":
        return {"post_id": str(row.id)}
    if kind == "guestbook":
        return {"guestbook_id": str(row.id)}
    if kind == "club":
        return {"club_id": str(row.id)}
    if kind == "stamp":
        return {"stamp_id": str(row.id)}
    return {"club_id": str(row.club_id), "comment_id": str(row.id)}


def target_out(kind: str, target_id: UUID, status: str) -> dict[str, str]:
    return {"target_kind": kind, "target_id": str(target_id), "status": status}


@router.post("/targets/{kind}/{target_id}/hide")
async def hide_target(request: Request, kind: TargetKind, target_id: UUID, body: ReasonBody,
                      op: CurrentUser = Depends(get_operator)) -> dict[str, str]:
    def tx(c: Connection) -> dict[str, str]:
        row = lock_target(c, kind, target_id)
        if row is None:
            raise not_found()
        if row.status == "hidden":
            return target_out(kind, target_id, "hidden")  # 이미 숨김: 무변경
        if row.status not in TARGETS[kind][2]:
            raise not_found()  # 작성자가 이미 철회·삭제
        set_status(c, kind, target_id, "hidden")
        c.execute(text("UPDATE reports SET status = 'actioned' "
                       "WHERE target_kind = :k AND target_id = :id AND status = 'open'"),
                  {"k": kind, "id": target_id})
        action_id = record(c, op.id, "hide", kind, target_id, body.reason)
        # 숨길 때마다 새 안내(같은 글을 복구 뒤 다시 숨겨도 알린다): 처리 id는 dedupe_key에만 들어간다
        add_inbox_items(c, [row.owner_id], "moderation", {**inbox_target(kind, row), "action_id": str(action_id)})
        return target_out(kind, target_id, "hidden")

    return await run_db(request.app.state.engine, tx)


def restored_status(kind: str, row: Any) -> str:
    if kind != "club":
        return "published"
    # 숨기기 전 상태를 저장하지 않아서: 취소 사유가 있으면 취소, 아니면 마감(새 참가가 갑자기 열리지 않게). 기본값(Claude)
    return "canceled" if row.cancel_reason is not None else "closed"


@router.post("/targets/{kind}/{target_id}/restore")
async def restore_target(request: Request, kind: TargetKind, target_id: UUID, body: ReasonBody,
                         op: CurrentUser = Depends(get_operator)) -> dict[str, str]:
    def tx(c: Connection) -> dict[str, str]:
        row = lock_target(c, kind, target_id)
        if row is None:
            raise not_found()
        if row.status != "hidden":
            return target_out(kind, target_id, row.status)  # 숨김이 아님: 무변경
        status = restored_status(kind, row)
        set_status(c, kind, target_id, status)
        record(c, op.id, "restore", kind, target_id, body.reason)
        return target_out(kind, target_id, status)

    try:
        return await run_db(request.app.state.engine, tx)
    except IntegrityError as exc:
        if kind == "post" and reading_log_publish_conflict(exc):
            raise ApiError(409, "ALREADY_PUBLISHED", "같은 독서 기록에서 이미 공개된 다른 게시물이 있어요.") from exc
        raise


# ─────────── 신고 ───────────

REPORT_SQL = f"""
SELECT r.id, r.target_kind, r.target_id, r.reason, r.text, r.status, r.created_at,
       COALESCE(p.status, g.status, cl.status, cc.status,
                CASE WHEN vs.status = 'hidden' THEN 'hidden' WHEN vs.visibility = 'public' THEN 'published'
                     WHEN vs.id IS NOT NULL THEN 'private' END) AS target_status,
       LEFT(COALESCE(p.overlay_text, p.body, g.body, cl.name, cc.body, vs.body), {PREVIEW_MAX}) AS target_preview
FROM reports r
LEFT JOIN posts p ON r.target_kind = 'post' AND p.id = r.target_id
LEFT JOIN guestbook_entries g ON r.target_kind = 'guestbook' AND g.id = r.target_id
LEFT JOIN clubs cl ON r.target_kind = 'club' AND cl.id = r.target_id
LEFT JOIN club_comments cc ON r.target_kind = 'club_comment' AND cc.id = r.target_id
LEFT JOIN visit_stamps vs ON r.target_kind = 'stamp' AND vs.id = r.target_id
"""


def report_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r.id), "target_kind": r.target_kind, "target_id": str(r.target_id),
        "reason": r.reason, "text": r.text, "status": r.status, "created_at": iso(r.created_at),
        "target_status": r.target_status, "target_preview": r.target_preview,
    }


@router.get("/reports")
async def list_reports(request: Request, status: Literal["open", "actioned", "dismissed"] = "open",
                       op: CurrentUser = Depends(get_operator)) -> dict[str, Any]:
    def tx(c: Connection) -> list[Any]:
        return c.execute(text(REPORT_SQL + " WHERE r.status = :s ORDER BY r.created_at, r.id LIMIT :n"),
                         {"s": status, "n": LIST_MAX}).all()

    return {"items": [report_out(r) for r in await run_db(request.app.state.engine, tx)]}


@router.post("/reports/{report_id}/resolve")
async def resolve_report(request: Request, report_id: UUID, body: ReasonBody,
                         op: CurrentUser = Depends(get_operator)) -> dict[str, str]:
    """신고 기각(대상은 그대로). 숨김은 `/targets/.../hide`가 그 대상의 열린 신고를 `actioned`로 바꾼다."""
    def tx(c: Connection) -> dict[str, str]:
        row = c.execute(text("SELECT status FROM reports WHERE id = :id FOR UPDATE"), {"id": report_id}).one_or_none()
        if row is None:
            raise not_found()
        if row.status != "open":
            return {"id": str(report_id), "status": row.status}
        c.execute(text("UPDATE reports SET status = 'dismissed' WHERE id = :id"), {"id": report_id})
        record(c, op.id, "dismiss", "report", report_id, body.reason)
        return {"id": str(report_id), "status": "dismissed"}

    return await run_db(request.app.state.engine, tx)


# ─────────── 모임 댓글 운영 요청 ───────────


def request_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r.id), "comment_id": str(r.comment_id), "club_id": str(r.club_id),
        "comment_body": r.comment_body, "comment_status": r.comment_status,
        "reason": r.reason, "status": r.status, "created_at": iso(r.created_at), "decided_at": iso(r.decided_at),
    }


@router.get("/club-comment-requests")
async def list_comment_requests(request: Request,
                                status: Literal["pending", "delete_only", "delete_and_restrict", "rejected"] = "pending",
                                op: CurrentUser = Depends(get_operator)) -> dict[str, Any]:
    def tx(c: Connection) -> list[Any]:
        return c.execute(text(
            "SELECT q.id, q.comment_id, cc.club_id, cc.body AS comment_body, cc.status AS comment_status, "
            "q.reason, q.status, q.created_at, q.decided_at "
            "FROM club_comment_requests q JOIN club_comments cc ON cc.id = q.comment_id "
            "WHERE q.status = :s ORDER BY q.created_at, q.id LIMIT :n"), {"s": status, "n": LIST_MAX}).all()

    return {"items": [request_out(r) for r in await run_db(request.app.state.engine, tx)]}


@router.post("/club-comment-requests/{request_id}/decide")
async def decide_comment_request(request: Request, request_id: UUID, body: DecideBody,
                                 op: CurrentUser = Depends(get_operator)) -> dict[str, str | None]:
    check_future(body.restriction_ends_at, "restriction_ends_at")

    def tx(c: Connection) -> dict[str, str | None]:
        author_status = None
        if body.decision == "delete_and_restrict":
            # 참가·댓글 작성과 탈퇴가 같은 사용자 행을 잠근다.
            author_status = c.execute(text(
                "SELECT u.status FROM users u JOIN club_comments cc ON cc.user_id = u.id "
                "JOIN club_comment_requests q ON q.comment_id = cc.id WHERE q.id = :id FOR NO KEY UPDATE OF u"
            ), {"id": request_id}).scalar_one_or_none()
        q = c.execute(text(
            "SELECT q.id, q.status, cc.id AS comment_id, cc.club_id, cc.user_id AS author_id "
            "FROM club_comment_requests q JOIN club_comments cc ON cc.id = q.comment_id "
            "WHERE q.id = :id FOR UPDATE OF q, cc"), {"id": request_id}).one_or_none()
        if q is None:
            raise not_found()
        if q.status != "pending":
            return {"id": str(request_id), "status": q.status, "restriction_id": None}  # 이미 결정: 무변경
        restriction_id = None
        if body.decision == "rejected":
            record(c, op.id, "dismiss", "club_comment_request", request_id, body.reason)
        else:
            c.execute(text("UPDATE club_comments SET status = 'deleted' WHERE id = :id AND status = 'published'"),
                      {"id": q.comment_id})
            record(c, op.id, "comment_delete", "club_comment", q.comment_id, body.reason)
            if body.decision == "delete_and_restrict":
                now = now_kst()
                ends_at = body.restriction_ends_at
                if body.restriction_days is not None:
                    ends_at = now + timedelta(days=body.restriction_days)
                restriction_id = insert_restriction(c, op.id, q.author_id, "comment", request_id, body.reason, ends_at)
                c.execute(text(
                    "UPDATE club_participations p SET state = 'removed', updated_at = :now "
                    "FROM clubs c WHERE c.id = p.club_id AND p.user_id = :uid AND p.state = 'joined' "
                    "AND c.host_id <> :uid AND c.status IN ('open', 'closed') AND (c.ends_at IS NULL OR c.ends_at > :now)"
                ), {"uid": q.author_id, "now": now})
                if author_status == "active":
                    add_inbox_items(c, [q.author_id], "moderation",
                                    {"club_id": str(q.club_id), "restriction": str(restriction_id)},
                                    title="모임 참가와 댓글이 제한됐어요")
        c.execute(text("UPDATE club_comment_requests SET status = :s, decided_by = :op, decided_at = now() "
                       "WHERE id = :id"), {"s": body.decision, "op": op.id, "id": request_id})
        return {"id": str(request_id), "status": body.decision,
                "restriction_id": None if restriction_id is None else str(restriction_id)}

    return await run_db(request.app.state.engine, tx)


# ─────────── 참가 제한 ───────────

RESTRICTION_COLUMNS = ("id, user_id, reason_kind, source_id, reason_text, starts_at, ends_at, "
                       "review_requested_at, review_text, lifted_at")


def restriction_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r.id), "user_id": str(r.user_id), "reason_kind": r.reason_kind, "source_id": str(r.source_id),
        "reason_text": r.reason_text, "starts_at": iso(r.starts_at), "ends_at": iso(r.ends_at),
        "review_requested_at": iso(r.review_requested_at), "lifted_at": iso(r.lifted_at),
    }


def insert_restriction(c: Connection, actor: UUID, user_id: UUID, kind: str, source_id: UUID,
                       reason: str, ends_at: datetime | None) -> UUID:
    rid = c.execute(text(
        "INSERT INTO participation_restrictions (user_id, reason_kind, source_id, reason_text, ends_at) "
        "VALUES (:u, :k, :s, :r, :e) RETURNING id"),
        {"u": user_id, "k": kind, "s": source_id, "r": reason, "e": ends_at}).scalar_one()
    record(c, actor, "restrict", "participation_restriction", rid, reason)
    return rid


def select_restriction(c: Connection, rid: UUID, lock: bool = False) -> Any:
    return c.execute(text(f"SELECT {RESTRICTION_COLUMNS} FROM participation_restrictions WHERE id = :id"
                          + (" FOR UPDATE" if lock else "")), {"id": rid}).one_or_none()


@router.get("/restrictions")
async def list_restrictions(request: Request, state: Literal["review", "active"] = "review",
                            op: CurrentUser = Depends(get_operator)) -> dict[str, Any]:
    """`review` = 재검토 요청이 온 해제 전 제한, `active` = 해제 전 제한 전부."""
    where = "lifted_at IS NULL" + (" AND review_requested_at IS NOT NULL" if state == "review" else "")
    order = "review_requested_at" if state == "review" else "created_at"

    def tx(c: Connection) -> list[Any]:
        return c.execute(text(f"SELECT {RESTRICTION_COLUMNS} FROM participation_restrictions WHERE {where} "
                              f"ORDER BY {order}, id LIMIT :n"), {"n": LIST_MAX}).all()

    rows = await run_db(request.app.state.engine, tx)
    if state == "review":
        return {"items": [{**restriction_out(r), "review_text": r.review_text} for r in rows]}
    return {"items": [restriction_out(r) for r in rows]}


@router.post("/restrictions")
async def create_restriction(request: Request, body: RestrictionBody,
                             op: CurrentUser = Depends(get_operator)) -> JSONResponse:
    check_future(body.ends_at, "ends_at")
    source_table = "club_comment_requests" if body.reason_kind == "comment" else "clubs"

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        user_ok = c.execute(text("SELECT EXISTS (SELECT 1 FROM users WHERE id = :u)"), {"u": body.user_id}).scalar_one()
        source_ok = c.execute(text(f"SELECT EXISTS (SELECT 1 FROM {source_table} WHERE id = :s)"),
                              {"s": body.source_id}).scalar_one()
        if not (user_ok and source_ok):
            raise not_found()
        # 같은 사람·같은 원인의 해제 전 제한이 있으면 그대로 돌려준다(연타 멱등). 동시 요청은 사용자 행 잠금으로 줄 세운다
        c.execute(text("SELECT 1 FROM users WHERE id = :u FOR UPDATE"), {"u": body.user_id})
        existing = c.execute(text(
            f"SELECT {RESTRICTION_COLUMNS} FROM participation_restrictions "
            "WHERE user_id = :u AND reason_kind = :k AND source_id = :s AND lifted_at IS NULL"),
            {"u": body.user_id, "k": body.reason_kind, "s": body.source_id}).first()
        if existing is not None:
            return restriction_out(existing), False
        rid = insert_restriction(c, op.id, body.user_id, body.reason_kind, body.source_id, body.reason, body.ends_at)
        return restriction_out(select_restriction(c, rid)), True

    out, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=out)


@router.post("/restrictions/{restriction_id}/lift")
async def lift_restriction(request: Request, restriction_id: UUID, body: ReasonBody,
                           op: CurrentUser = Depends(get_operator)) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        row = select_restriction(c, restriction_id, lock=True)
        if row is None:
            raise not_found()
        if row.lifted_at is not None:
            return restriction_out(row)  # 이미 해제: 무변경
        c.execute(text("UPDATE participation_restrictions SET lifted_at = now(), lifted_by = :op WHERE id = :id"),
                  {"op": op.id, "id": restriction_id})
        record(c, op.id, "lift", "participation_restriction", restriction_id, body.reason)
        return restriction_out(select_restriction(c, restriction_id))

    return await run_db(request.app.state.engine, tx)


# ─────────── 도서관 룩 (M2-0-P3, Z6) ───────────

BIGINT_MAX = 2**63 - 1


class LookBody(BaseModel):
    """`modern` = 운영자 지정, `auto` = 지금 주변 기준으로 다시 자동 배정. 다른 팔레트를 직접 고르지 못한다(Z6)."""
    model_config = ConfigDict(extra="forbid")
    look: Literal["modern", "auto"]
    reason: Reason


@router.put("/libraries/{library_id}/look")
async def put_library_look(request: Request, body: LookBody, library_id: int = Path(ge=1, le=BIGINT_MAX),
                           op: CurrentUser = Depends(get_operator)) -> dict[str, Any]:
    def tx(c: Connection) -> dict[str, Any]:
        if not c.execute(text("SELECT EXISTS (SELECT 1 FROM libraries WHERE id = :id)"), {"id": library_id}).scalar_one():
            raise not_found()
        look, by, changed = set_look_by_operator(c, library_id, body.look)
        if changed:  # 같은 결과면 무변경(멱등, 기록 행도 늘지 않음)
            record(c, op.id, "look_assign", "library", library_id, body.reason)
        return {"library_id": library_id, "look": look, "look_assigned_by": by}

    return await run_db(request.app.state.engine, tx)


# ─────────── 서가 테마 (M2-0-P3, Z7 — Q-47 임시) ───────────

THEME_TITLE_MAX = 40  # 기본값(Claude): 책장 페이지 제목 한 줄
THEME_LOCK_KEY = "shelf_themes"


class ThemeBody(BaseModel):
    """공통과 전용의 후보 상한을 구분하고 PUT에서 생략한 우선순위는 보존한다."""
    model_config = ConfigDict(extra="forbid")
    library_id: int | None = Field(ge=1, le=BIGINT_MAX)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=THEME_TITLE_MAX)]
    starts_on: date
    ends_on: date
    isbn13s: list[str] = Field(min_length=1, max_length=policy.RECOMMENDATION_MAX_BOOKS)
    priority: int = Field(default=1, strict=True, ge=1, le=policy.SHELF_THEME_MAX_PRIORITY)
    reason: Reason

    @field_validator("isbn13s")
    @classmethod
    def _isbns(cls, value: list[str], info: ValidationInfo) -> list[str]:
        if info.data.get("library_id") is not None and len(value) > policy.SHELF_LOCAL_THEME_MAX_BOOKS:
            raise ValueError("도서관 전용 테마는 최대 3권")
        if len(set(value)) != len(value) or not all(isbn13_is_valid(v) for v in value):
            raise ValueError("isbn13s는 서로 다른 올바른 ISBN-13")
        return value

    @model_validator(mode="after")
    def _period(self) -> "ThemeBody":
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on은 starts_on과 같거나 뒤")
        return self


def theme_overlap() -> ApiError:
    return ApiError(409, "THEME_OVERLAP", "같은 범위에 기간이 겹치는 테마가 있어요.")


async def fetch_theme_books(request: Request, isbns: list[str]) -> list[int]:
    """쓰기 트랜잭션 전에 서지를 확보한다(외부 조회는 엔진, 없으면 404·제공자 오류는 엔진 그대로)."""
    engine = request.app.state.provider_engine
    return [(await engine.get_book(isbn)).id for isbn in isbns]


def theme_state(c: Connection, theme_id: Any) -> tuple[Any, ...]:
    row = c.execute(text("SELECT library_id, title, starts_on, ends_on, priority FROM shelf_themes WHERE id = :t"),
                    {"t": theme_id}).one()
    books = c.execute(text("SELECT book_id FROM shelf_theme_books WHERE theme_id = :t ORDER BY position"),
                      {"t": theme_id}).scalars().all()
    return (row.library_id, row.title, row.starts_on, row.ends_on, row.priority, tuple(books))


def overlapping(c: Connection, body: ThemeBody, priority: int, exclude: Any = None) -> list[Any]:
    return c.execute(text(
        "SELECT id FROM shelf_themes WHERE library_id IS NOT DISTINCT FROM :lid "
        "AND priority = :p AND starts_on <= :e AND ends_on >= :s AND id IS DISTINCT FROM :x"),
        {"lid": body.library_id, "p": priority, "s": body.starts_on, "e": body.ends_on, "x": exclude}).scalars().all()


def write_theme_books(c: Connection, theme_id: Any, book_ids: list[int]) -> None:
    c.execute(text("DELETE FROM shelf_theme_books WHERE theme_id = :t"), {"t": theme_id})
    for position, book_id in enumerate(book_ids, start=1):
        c.execute(text("INSERT INTO shelf_theme_books (theme_id, book_id, position) VALUES (:t, :b, :p)"),
                  {"t": theme_id, "b": book_id, "p": position})


def theme_out(c: Connection, theme_id: Any) -> dict[str, Any]:
    row = c.execute(text("SELECT id, library_id, title, starts_on, ends_on, priority FROM shelf_themes WHERE id = :t"),
                    {"t": theme_id}).one()
    books = c.execute(text(
        "SELECT b.isbn13, b.title, b.author, b.cover_url FROM shelf_theme_books t JOIN books b ON b.id = t.book_id "
        "WHERE t.theme_id = :t ORDER BY t.position"), {"t": theme_id}).all()
    return {"id": str(row.id), "library_id": row.library_id, "title": row.title,
            "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat(), "priority": row.priority,
            "books": [shelf_book(b) for b in books]}


def lock_themes(c: Connection, library_id: int | None) -> None:
    # 범위·우선순위의 겹침 검사와 쓰기를 같은 잠금으로 직렬화한다.
    c.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": THEME_LOCK_KEY})
    if library_id is not None and not c.execute(
            text("SELECT EXISTS (SELECT 1 FROM libraries WHERE id = :id)"), {"id": library_id}).scalar_one():
        raise not_found()


@router.post("/shelf-themes")
async def create_shelf_theme(request: Request, body: ThemeBody,
                             op: CurrentUser = Depends(get_operator)) -> JSONResponse:
    book_ids = await fetch_theme_books(request, body.isbn13s)
    wanted = (body.library_id, body.title, body.starts_on, body.ends_on, body.priority, tuple(book_ids))

    def tx(c: Connection) -> tuple[dict[str, Any], bool]:
        lock_themes(c, body.library_id)
        clash = overlapping(c, body, body.priority)
        if clash:
            # 같은 내용을 다시 보낸 것(연타)이면 그 테마를 그대로 돌려준다
            if len(clash) == 1 and theme_state(c, clash[0]) == wanted:
                return theme_out(c, clash[0]), False
            raise theme_overlap()
        theme_id = c.execute(text(
            "INSERT INTO shelf_themes (library_id, title, starts_on, ends_on, priority) "
            "VALUES (:l, :t, :s, :e, :p) RETURNING id"),
            {"l": body.library_id, "t": body.title, "s": body.starts_on, "e": body.ends_on,
             "p": body.priority}).scalar_one()
        write_theme_books(c, theme_id, book_ids)
        record(c, op.id, "theme_edit", "shelf_theme", theme_id, body.reason)
        return theme_out(c, theme_id), True

    out, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=out)


@router.put("/shelf-themes/{theme_id}")
async def put_shelf_theme(request: Request, theme_id: UUID, body: ThemeBody,
                          op: CurrentUser = Depends(get_operator)) -> dict[str, Any]:
    book_ids = await fetch_theme_books(request, body.isbn13s)

    def tx(c: Connection) -> dict[str, Any]:
        lock_themes(c, body.library_id)
        current_priority = c.execute(
            text("SELECT priority FROM shelf_themes WHERE id = :t FOR UPDATE"), {"t": theme_id}
        ).scalar_one_or_none()
        if current_priority is None:
            raise not_found()
        priority = body.priority if "priority" in body.model_fields_set else current_priority
        wanted = (body.library_id, body.title, body.starts_on, body.ends_on, priority, tuple(book_ids))
        if theme_state(c, theme_id) == wanted:
            return theme_out(c, theme_id)  # 같은 내용: 무변경
        if overlapping(c, body, priority, exclude=theme_id):
            raise theme_overlap()
        c.execute(text("UPDATE shelf_themes SET library_id = :l, title = :t, starts_on = :s, ends_on = :e, priority = :p "
                       "WHERE id = :id"),
                  {"l": body.library_id, "t": body.title, "s": body.starts_on, "e": body.ends_on,
                   "p": priority, "id": theme_id})
        write_theme_books(c, theme_id, book_ids)
        record(c, op.id, "theme_edit", "shelf_theme", theme_id, body.reason)
        return theme_out(c, theme_id)

    return await run_db(request.app.state.engine, tx)
