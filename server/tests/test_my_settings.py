"""실기기 개선 P4(C-90): 내 설정 #71 GET/PATCH /api/v1/me/settings — 모임 안내 받기."""

from uuid import UUID

from sqlalchemy import text

from app.services.inbox import add_inbox_items
from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_feed import auth, books, client  # noqa: F401  (픽스처)

A = UUID(USER_A_ID)
B = UUID(USER_B_ID)
CLUB = "c1a2b3c4-d5e6-47f8-9a0b-1c2d3e4f5a6b"


def kinds(db_engine, uid: UUID) -> list[str]:
    with db_engine.connect() as c:
        return list(c.execute(text("SELECT kind FROM inbox_items WHERE recipient_id = :u ORDER BY created_at"), {"u": uid}).scalars())


def add(db_engine, recipients, kind="club_confirmed", target=None) -> int:
    with db_engine.begin() as c:
        return add_inbox_items(c, recipients, kind, target or {"club_id": CLUB})


def test_settings_default_on_and_patch_round_trip(client, auth):
    assert client.get("/api/v1/me/settings", headers=auth["A"]).json() == {"club_notices": True}
    r = client.patch("/api/v1/me/settings", json={"club_notices": False}, headers=auth["A"])
    assert r.status_code == 200 and r.json() == {"club_notices": False}
    assert client.get("/api/v1/me/settings", headers=auth["A"]).json() == {"club_notices": False}
    assert client.get("/api/v1/me/settings", headers=auth["B"]).json() == {"club_notices": True}  # 본인 것만


def test_settings_validation_and_auth(client, auth):
    for body in ({}, {"club_notices": "x"}, {"club_notices": True, "other": 1}):
        r = client.patch("/api/v1/me/settings", json=body, headers=auth["A"])
        assert r.status_code == 422, body
    assert client.get("/api/v1/me/settings").status_code == 401
    assert client.patch("/api/v1/me/settings", json={"club_notices": False}).status_code == 401


def test_club_notices_off_skips_new_club_items_only(client, auth, db_engine):
    client.patch("/api/v1/me/settings", json={"club_notices": False}, headers=auth["A"])
    assert add(db_engine, [A, B]) == 1  # 끈 A는 빼고 B만
    assert kinds(db_engine, A) == []
    assert kinds(db_engine, B) == ["club_confirmed"]
    # 운영 안내(moderation)는 모임 안내가 아니라 그대로 받는다
    assert add(db_engine, [A], "moderation", {"post_id": "p1"}) == 1
    assert kinds(db_engine, A) == ["moderation"]
    # 다시 켜면 그다음 안내부터 받는다(지난 안내를 되살리지 않는다)
    client.patch("/api/v1/me/settings", json={"club_notices": True}, headers=auth["A"])
    assert add(db_engine, [A], "club_canceled") == 1
    assert kinds(db_engine, A) == ["moderation", "club_canceled"]
