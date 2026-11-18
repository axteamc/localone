"""M2-0-P1: 알림함 표·쓰기 함수·#47~#49 — core 계약 M2-0 C2·C3·C5·C6·P5."""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.services import inbox as inbox_service
from app.services.inbox import InboxDraft, add_inbox_items, materialize_due, register_inbox_source
from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_feed import auth, books, client  # noqa: F401  (픽스처)

A = UUID(USER_A_ID)
B = UUID(USER_B_ID)
CLUB = "c1a2b3c4-d5e6-47f8-9a0b-1c2d3e4f5a6b"
ITEM_KEYS = {"id", "kind", "title", "target", "created_at", "read"}
T0 = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _isolated_sources():
    """원천 등록은 모듈 전역이라 시험마다 비우고 되돌린다."""
    saved = dict(inbox_service._SOURCES)
    inbox_service._SOURCES.clear()
    yield
    inbox_service._SOURCES.clear()
    inbox_service._SOURCES.update(saved)


def add(db_engine, recipients, kind="club_confirmed", target=None) -> int:
    with db_engine.begin() as conn:
        return add_inbox_items(conn, recipients, kind, target or {"club_id": CLUB})


def rows(db_engine, uid: UUID | None = None) -> list:
    sql = "SELECT * FROM inbox_items" + (" WHERE recipient_id = :u" if uid else "") + " ORDER BY created_at, id"
    with db_engine.connect() as conn:
        return conn.execute(text(sql), {"u": uid}).all()


def seed_at(db_engine, uid: UUID, at: datetime, n: int = 1) -> list[str]:
    """시각 고정 항목을 직접 넣는다(커서 순회용)."""
    out = []
    with db_engine.begin() as conn:
        for _ in range(n):
            out.append(str(conn.execute(text(
                "INSERT INTO inbox_items (recipient_id, kind, target, dedupe_key, title, created_at) "
                "VALUES (:u, 'moderation', CAST(:t AS jsonb), :k, '안내', :at) RETURNING id"),
                {"u": uid, "t": '{"post_id": "p"}', "k": str(uuid4()), "at": at}).scalar_one()))
    return out


def inbox(client, headers, **params):
    return client.get("/api/v1/me/inbox", params=params, headers=headers)


# ─────────── P5 필수 ───────────


def test_inbox_items_are_recipient_only(client, auth, db_engine):
    add(db_engine, [A], target={"club_id": CLUB})
    add(db_engine, [B], kind="club_canceled", target={"club_id": CLUB})
    body = inbox(client, auth["A"]).json()
    assert [i["kind"] for i in body["items"]] == ["club_confirmed"]  # B 안내 안 보임

    b_id = str(rows(db_engine, B)[0].id)
    r = client.post("/api/v1/me/inbox/read", json={"ids": [b_id]}, headers=auth["A"])
    assert r.status_code == 200  # 남의 id는 조용히 무시(C6)
    assert rows(db_engine, B)[0].read_at is None  # 남의 행 무변경
    assert rows(db_engine, A)[0].read_at is None  # 내 행도 지정 안 했으니 그대로

    r = client.post("/api/v1/me/inbox/read", json={"all": True}, headers=auth["A"])
    assert r.json() == {"has_unread": False}
    assert rows(db_engine, A)[0].read_at is not None
    assert rows(db_engine, B)[0].read_at is None  # all도 본인 것만
    assert client.get("/api/v1/me/inbox/unread", headers=auth["B"]).json() == {"has_unread": True}


def test_same_notice_is_stored_once(client, auth, db_engine):
    assert add(db_engine, [A, B, A]) == 2  # 같은 수신자 중복도 한 번
    assert add(db_engine, [A, B]) == 0  # 같은 dedupe_key 두 번 → 행 그대로
    assert len(rows(db_engine, A)) == 1 and len(rows(db_engine, B)) == 1
    # 변경 안내는 변경 시각이 다르면 다른 안내, 저장·응답 target에는 이동 키만 남는다
    assert add(db_engine, [A], "club_changed", {"club_id": CLUB, "changed_at": "2026-11-20T10:00:00+09:00"}) == 1
    assert add(db_engine, [A], "club_changed", {"club_id": CLUB, "changed_at": "2026-11-20T10:00:00+09:00"}) == 0
    assert add(db_engine, [A], "club_changed", {"club_id": CLUB, "changed_at": "2026-11-20T11:00:00+09:00"}) == 1
    items = inbox(client, auth["A"]).json()["items"]
    assert len(items) == 3
    assert all(i["target"] == {"club_id": CLUB} for i in items)


def test_due_sources_materialize_on_read_only_once(client, auth, db_engine):
    calls = []

    def ended_due(conn, user_id, now):
        calls.append((user_id, now))
        return [InboxDraft(target={"club_id": CLUB})]

    register_inbox_source("club_ended", ended_due)
    assert rows(db_engine, A) == []  # 등록만으로는 아무것도 생기지 않는다(작업자 없음)
    first = inbox(client, auth["A"]).json()["items"]
    second = inbox(client, auth["A"]).json()["items"]
    assert [i["kind"] for i in first] == ["club_ended"] and first == second
    assert len(rows(db_engine, A)) == 1  # 두 번 읽어도 한 번
    assert rows(db_engine, B) == []  # 읽은 사람에게만
    assert all(uid == A for uid, _ in calls) and all(now.utcoffset() == timedelta(hours=9) for _, now in calls)
    # 점(#47)을 먼저 읽어도 같은 안내가 생기고, 그 뒤 목록에서 중복되지 않는다
    assert client.get("/api/v1/me/inbox/unread", headers=auth["B"]).json() == {"has_unread": True}
    assert len(inbox(client, auth["B"]).json()["items"]) == 1


# ─────────── 응답 모양·목록 ───────────


def test_inbox_item_shape_and_unread_flag(client, auth, db_engine):
    assert client.get("/api/v1/me/inbox/unread", headers=auth["A"]).json() == {"has_unread": False}
    assert inbox(client, auth["A"]).json() == {"items": [], "next_cursor": None}
    add(db_engine, [A], "moderation", {"post_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"})
    item = inbox(client, auth["A"]).json()["items"][0]
    assert set(item) == ITEM_KEYS
    assert item["kind"] == "moderation" and item["read"] is False
    assert item["title"] == inbox_service.TITLES["moderation"]
    assert item["target"] == {"post_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"}
    assert item["created_at"].endswith("+09:00")
    assert client.get("/api/v1/me/inbox/unread", headers=auth["A"]).json() == {"has_unread": True}
    r = client.post("/api/v1/me/inbox/read", json={"ids": [item["id"]]}, headers=auth["A"])
    assert r.status_code == 200 and r.json() == {"has_unread": False}
    first_read_at = rows(db_engine, A)[0].read_at
    assert client.post("/api/v1/me/inbox/read", json={"ids": [item["id"]]}, headers=auth["A"]).status_code == 200
    assert rows(db_engine, A)[0].read_at == first_read_at  # 멱등: 읽은 시각 유지
    assert inbox(client, auth["A"]).json()["items"][0]["read"] is True


def test_inbox_cursor_no_dup_no_gap_on_ties(client, auth, db_engine):
    expected = set(seed_at(db_engine, A, T0, 5)) | set(seed_at(db_engine, A, T0 - timedelta(hours=1), 2))
    seen, cursor = [], None
    while True:
        body = inbox(client, auth["A"], limit=2, **({"cursor": cursor} if cursor else {})).json()
        seen += [i["id"] for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == 7 and set(seen) == expected  # 동률에도 중복·누락 없음
    with db_engine.connect() as conn:
        order = [str(i) for i in conn.execute(text(
            "SELECT id FROM inbox_items WHERE recipient_id = :u ORDER BY created_at DESC, id DESC"),
            {"u": A}).scalars()]
    assert seen == order  # created_at DESC, id DESC
    assert len(inbox(client, auth["A"]).json()["items"]) == 7  # 기본 limit 30


@pytest.mark.parametrize("params,field", [({"limit": 0}, "limit"), ({"limit": 51}, "limit"),
                                          ({"cursor": "%%%"}, "cursor")])
def test_inbox_list_validation(client, auth, params, field):
    r = inbox(client, auth["A"], **params)
    assert r.status_code == 422 and r.json()["error"]["detail"] == field


@pytest.mark.parametrize("body", [{}, {"all": False}, {"ids": []}, {"ids": ["not-uuid"]},
                                  {"ids": [str(uuid4())], "all": True}, {"all": True, "extra": 1},
                                  {"ids": [str(uuid4()) for _ in range(101)]}])
def test_inbox_read_rejects_bad_body(client, auth, db_engine, body):
    add(db_engine, [A])
    r = client.post("/api/v1/me/inbox/read", json=body, headers=auth["A"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert rows(db_engine, A)[0].read_at is None  # 무변경


@pytest.mark.parametrize("method,path", [("get", "/api/v1/me/inbox/unread"), ("get", "/api/v1/me/inbox"),
                                         ("post", "/api/v1/me/inbox/read")])
def test_inbox_requires_auth(client, method, path):
    r = getattr(client, method)(path, **({"json": {"all": True}} if method == "post" else {}))
    assert r.status_code == 401


# ─────────── 쓰기 함수·표 ───────────


def test_add_inbox_items_rejects_unknown_kind_and_empty_target(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": A})
    with pytest.raises(ValueError):
        add(db_engine, [A], kind="push")
    with pytest.raises(ValueError):
        add(db_engine, [A], target={"changed_at": "x"})
    with pytest.raises(ValueError):
        register_inbox_source("push", lambda *_: [])  # type: ignore[arg-type]
    assert add(db_engine, []) == 0
    assert rows(db_engine) == []


def test_add_inbox_items_runs_in_callers_transaction(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": A})
    with pytest.raises(RuntimeError):
        with db_engine.begin() as conn:
            add_inbox_items(conn, [A], "club_canceled", {"club_id": CLUB})
            raise RuntimeError("기능 쓰기 실패")
    assert rows(db_engine) == []  # 기능 쓰기와 함께 되돌려진다


def test_materialize_due_counts_new_rows_only(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": A})
    register_inbox_source("club_ended", lambda c, u, now: [InboxDraft({"club_id": CLUB}),
                                                            InboxDraft({"club_id": CLUB})])
    with db_engine.begin() as conn:
        assert materialize_due(conn, A, T0) == 1
        assert materialize_due(conn, A, T0) == 0


def test_inbox_table_constraints_and_rls(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": A})
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text("INSERT INTO inbox_items (recipient_id, kind, target, dedupe_key, title) "
                              "VALUES (:u, 'push', '{}', 'k', 't')"), {"u": A})
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            for _ in range(2):
                conn.execute(text("INSERT INTO inbox_items (recipient_id, kind, target, dedupe_key, title) "
                                  "VALUES (:u, 'moderation', '{}', 'same', 't')"), {"u": A})
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname = 'inbox_items'")).scalar_one()
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = 'inbox_items'")).scalar_one() == 0
        assert conn.execute(text("SELECT count(*) FROM pg_indexes WHERE indexname = 'ix_inbox_recipient'")
                            ).scalar_one() == 1
