"""알림함 쓰기·읽을 때 생성 — core 계약 M2-0-P1 (Z1·Z2, C2 서버 함수).

- 기능(CLUB-1·CLUB-2·LOCAL-4·M2-0-P2)은 안내를 `add_inbox_items` 하나로만 쓴다. 호출한 쪽 트랜잭션 안에서 실행된다.
- 같은 수신자·같은 안내는 한 번만 저장한다: `dedupe_key`(종류 + 대상 전체) + `UNIQUE (recipient_id, dedupe_key)`.
  대상(`target`)에 `club_id`·`post_id`·`guestbook_id` 밖의 키(예: 변경 안내의 `changed_at`)를 넣으면
  그 키는 `dedupe_key`에만 쓰고 저장·응답 `target`에서는 뺀다(C5 "변경이면 변경 시각").
- 시각이 지나서 생기는 안내(예: 모임 종료)는 서버 작업자 없이(C-11) `register_inbox_source`로 등록하고,
  수신자가 알림함을 읽을 때 `materialize_due`가 만든다.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, get_args
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection

InboxKind = Literal["club_confirmed", "club_changed", "club_canceled", "club_ended", "club_next", "moderation"]
INBOX_KINDS: frozenset[str] = frozenset(get_args(InboxKind))
TARGET_KEYS = ("club_id", "post_id", "guestbook_id")  # C3 InboxItem.target — 누르면 갈 곳

# 서버가 만드는 한 줄(C3 title). 기본값(Claude) — CLUB-2·LOCAL-4 열린 칸 문구가 정해지면 이 상수만 바꾼다
TITLES: dict[str, str] = {
    "club_confirmed": "모임 일정이 확정됐어요",
    "club_changed": "모임 일정이 바뀌었어요",
    "club_canceled": "모임이 취소됐어요",
    "club_ended": "모임이 끝났어요",
    "club_next": "다음 모임이 열렸어요",
    "moderation": "운영 기준에 따라 글이 숨겨졌어요",
}


@dataclass(frozen=True)
class InboxDraft:
    """읽을 때 생성 원천(`register_inbox_source`)이 돌려주는 안내 한 건. 수신자는 읽는 사람이다."""

    target: dict[str, str]


InboxSource = Callable[[Connection, UUID, datetime], list[InboxDraft]]
_SOURCES: dict[str, InboxSource] = {}

_INSERT = text(
    "INSERT INTO inbox_items (recipient_id, kind, target, dedupe_key, title) "
    "VALUES (:uid, :kind, CAST(:target AS jsonb), :key, :title) "
    "ON CONFLICT ON CONSTRAINT inbox_once DO NOTHING"
)


def _check_kind(kind: str) -> None:
    if kind not in INBOX_KINDS:
        raise ValueError(f"unknown inbox kind: {kind}")


def dedupe_key(kind: str, target: dict[str, str]) -> str:
    return kind + ":" + json.dumps(target, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def register_inbox_source(kind: InboxKind, fn: InboxSource) -> None:
    """읽을 때 생성 원천을 등록한다(같은 종류는 마지막 등록이 이긴다)."""
    _check_kind(kind)
    _SOURCES[kind] = fn


def add_inbox_items(
    conn: Connection, recipients: list[UUID], kind: InboxKind, target: dict[str, str], *, title: str | None = None
) -> int:
    """수신자마다 안내 한 건을 넣는다. 반환: 새로 넣은 행 수(이미 있던 안내는 0으로 센다)."""
    _check_kind(kind)
    if not any(target.get(k) for k in TARGET_KEYS):
        raise ValueError("inbox target needs club_id, post_id or guestbook_id")
    key = dedupe_key(kind, target)
    stored = json.dumps({k: str(target[k]) for k in TARGET_KEYS if target.get(k)}, ensure_ascii=False)
    title = TITLES[kind] if title is None else title
    return sum(
        conn.execute(_INSERT, {"uid": uid, "kind": kind, "target": stored, "key": key, "title": title}).rowcount
        for uid in set(recipients)
    )


def materialize_due(conn: Connection, user_id: UUID, now: datetime) -> int:
    """등록된 원천마다 지금 생겨야 할 안내를 이 수신자에게 만든다. 두 번 불러도 한 번만 생긴다."""
    n = 0
    for kind, fn in _SOURCES.items():
        for draft in fn(conn, user_id, now):
            n += add_inbox_items(conn, [user_id], kind, draft.target)  # type: ignore[arg-type]
    return n
