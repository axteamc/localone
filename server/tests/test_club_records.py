"""CLUB-2-P1: 종료 안내·모임 기록·후기·다음 모임 — book-club 계약 CLUB-2 K2-1~K2-6, C2·C3·C6·P5."""

from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.common import now_kst
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_clubs import (  # noqa: F401  (픽스처·도우미)
    ISBN, LIB_1, USER_C_ID, at, book, clean_clubs, club_row, count, error, join, new_club, set_times,
)

USER_D_ID = "00000000-0000-4000-8000-00000000000d"
USERS = (("A", USER_A_ID), ("B", USER_B_ID), ("C", USER_C_ID), ("D", USER_D_ID))


@pytest.fixture
def clean_records(db_engine, clean_clubs):
    """CLUB-2 표를 clean_clubs보다 먼저 비운다(후기·요청이 모임·댓글·게시물을 가리킴)."""

    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM club_reviews"))
            conn.execute(text("DELETE FROM club_comment_requests"))
            conn.execute(text("DELETE FROM participation_restrictions"))

    clean()
    yield
    clean()


@pytest.fixture
def client(test_db_url, fake_jwks_client, public_reference_data, clean_records):  # noqa: F811
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client, make_token):
    headers = {}
    for name, uid in USERS:
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


def ended_club(client, db_engine, auth, host="A", joiners=("B", "C"), **fields) -> str:
    """참가자를 받은 뒤 시각을 지난 쪽으로 옮겨 끝난 모임을 만든다."""
    club_id = new_club(client, auth[host], starts_at=at(60), ends_at=at(120), place="3층 세미나실",
                       intro="같이 읽어요", **fields)
    for who in joiners:
        assert join(client, auth[who], club_id).status_code == 200
    set_times(db_engine, club_id, now_kst() - timedelta(hours=3), now_kst() - timedelta(hours=1))
    return club_id


def record(client, headers, club_id):
    return client.get(f"/api/v1/clubs/{club_id}/record", headers=headers)


def put_review(client, headers, club_id, body):
    return client.put(f"/api/v1/clubs/{club_id}/review", json={"body": body}, headers=headers)


def share(client, headers, club_id, rid=None):
    return client.post(f"/api/v1/clubs/{club_id}/review/share",
                       json={"client_request_id": str(rid or uuid4())}, headers=headers)


def next_club(client, headers, club_id, rid=None, **fields):
    body = {"client_request_id": str(rid or uuid4())}
    body.update(fields)
    return client.post(f"/api/v1/clubs/{club_id}/next", json=body, headers=headers)


def inbox_kinds(client, headers, kind):
    items = client.get("/api/v1/me/inbox", headers=headers).json()["items"]
    return [i for i in items if i["kind"] == kind]


def set_state(db_engine, club_id, uid, **cols):
    sets = ", ".join(f"{k} = :{k}" for k in cols)
    with db_engine.begin() as conn:
        conn.execute(text(f"UPDATE club_participations SET {sets} WHERE club_id = :id AND user_id = :uid"),
                     dict(cols, id=club_id, uid=uid))


# ─────────── K2-1 종료 안내 ───────────


def test_ended_notice_created_once_on_inbox_read(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth)
    for who in ("A", "B", "C"):
        first = inbox_kinds(client, auth[who], "club_ended")
        second = inbox_kinds(client, auth[who], "club_ended")
        assert [i["target"] for i in second] == [{"club_id": club_id}]
        assert first == second and second[0]["title"] == "모임이 끝났어요"
    assert count(db_engine, "inbox_items", "kind = 'club_ended'") == 3
    assert inbox_kinds(client, auth["D"], "club_ended") == []  # 참가하지 않은 사람에게는 없다


def test_ended_notice_skips_unfinished_canceled_and_left(client, auth, db_engine):
    ended_club(client, db_engine, auth, joiners=("B",))
    open_club = new_club(client, auth["A"], starts_at=at(60), ends_at=at(120))
    canceled = ended_club(client, db_engine, auth, joiners=("B",))
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'canceled', cancel_reason = '사정' WHERE id = :id"),
                     {"id": canceled})
    left = ended_club(client, db_engine, auth, joiners=("C",))
    set_state(db_engine, left, USER_C_ID, state="left")
    assert len(inbox_kinds(client, auth["B"], "club_ended")) == 1
    assert inbox_kinds(client, auth["C"], "club_ended") == []
    assert {i["target"]["club_id"] for i in inbox_kinds(client, auth["A"], "club_ended")} \
        .isdisjoint({open_club, canceled})


# ─────────── #60 기록 · #61 후기 ───────────


def test_record_shows_my_attendance(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth)
    set_state(db_engine, club_id, USER_C_ID, attendance_status="no_show")
    b, c = record(client, auth["B"], club_id).json(), record(client, auth["C"], club_id).json()
    assert (b["my_participation"], b["my_attendance"]) == ("joined", "attended")
    assert (c["my_participation"], c["my_attendance"]) == ("joined", "no_show")
    host = record(client, auth["A"], club_id).json()
    assert (host["my_participation"], host["my_attendance"]) == ("none", None)
    assert host["club"]["id"] == club_id and host["club"]["status"] == "ended"
    assert error(record(client, auth["D"], club_id))[:2] == (404, "NOT_FOUND")


def test_review_is_private_by_default(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth)
    saved = put_review(client, auth["A"], club_id, "  좋은 모임이었어요  ")
    assert saved.status_code == 200
    assert saved.json()["review"]["body"] == "좋은 모임이었어요" and saved.json()["shared_post_id"] is None
    other = record(client, auth["B"], club_id)
    assert other.status_code == 200 and other.json()["review"] is None
    assert "좋은 모임" not in other.text
    outsider = record(client, auth["D"], club_id)
    assert error(outsider)[:2] == (404, "NOT_FOUND") and "좋은 모임" not in outsider.text
    anonymous = record(client, {}, club_id)
    assert anonymous.status_code == 401 and "좋은 모임" not in anonymous.text
    assert count(db_engine, "posts") == 0  # 저장만으로는 게시물이 생기지 않는다


def test_review_length_is_1_to_2000(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth)
    assert put_review(client, auth["B"], club_id, "처음 후기").status_code == 200
    assert error(put_review(client, auth["B"], club_id, "   "))[:3] == (422, "VALIDATION_ERROR", "body")
    assert error(put_review(client, auth["B"], club_id, "가" * 2001))[:3] == (422, "VALIDATION_ERROR", "body")
    assert record(client, auth["B"], club_id).json()["review"]["body"] == "처음 후기"  # 실패 때 기존 후기 그대로
    assert put_review(client, auth["B"], club_id, "가" * 2000).status_code == 200
    assert record(client, auth["B"], club_id).json()["review"]["body"] == "가" * 2000


def test_review_last_value_wins_and_outsider_cannot_write(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth)
    put_review(client, auth["B"], club_id, "첫 생각")
    put_review(client, auth["B"], club_id, "다시 생각")
    assert count(db_engine, "club_reviews") == 1
    assert record(client, auth["B"], club_id).json()["review"]["body"] == "다시 생각"
    assert error(put_review(client, auth["D"], club_id, "끼어들기"))[:2] == (404, "NOT_FOUND")
    assert count(db_engine, "club_reviews", "user_id = :u", u=USER_D_ID) == 0


def test_record_and_review_blocked_before_end_and_when_canceled(client, auth, db_engine):
    running = new_club(client, auth["A"], starts_at=at(60), ends_at=at(120))
    join(client, auth["B"], running)
    assert error(record(client, auth["B"], running))[:2] == (409, "CLUB_NOT_ENDED")
    assert error(put_review(client, auth["B"], running, "미리 쓰기"))[:2] == (409, "CLUB_NOT_ENDED")
    canceled = ended_club(client, db_engine, auth, joiners=("B",))
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'canceled', cancel_reason = '사정' WHERE id = :id"),
                     {"id": canceled})
    assert error(record(client, auth["B"], canceled))[:2] == (409, "CLUB_CLOSED")
    assert error(put_review(client, auth["B"], canceled, "취소됐지만"))[:2] == (409, "CLUB_CLOSED")
    assert count(db_engine, "club_reviews") == 0


# ─────────── #62 후기를 게시물로 ───────────


def test_shared_review_and_original_are_edited_separately(client, auth, db_engine, book):
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE books SET cover_url = 'https://img.example/c.jpg' WHERE isbn13 = :i"), {"i": ISBN})
    club_id = ended_club(client, db_engine, auth, isbn13=ISBN)
    put_review(client, auth["B"], club_id, "원래 후기")
    rid = uuid4()
    first, again = share(client, auth["B"], club_id, rid), share(client, auth["B"], club_id, rid)
    assert (first.status_code, again.status_code) == (201, 200)
    post_id = first.json()["shared_post_id"]
    assert post_id is not None and again.json()["shared_post_id"] == post_id
    assert count(db_engine, "posts") == 1
    post = client.get(f"/api/v1/posts/{post_id}", headers=auth["C"]).json()
    assert (post["body"], post["library"]["id"], post["book"]["isbn13"]) == ("원래 후기", LIB_1, ISBN)
    assert post["image_kind"] == "cover"

    put_review(client, auth["B"], club_id, "고친 후기")
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth["C"]).json()["body"] == "원래 후기"
    assert record(client, auth["B"], club_id).json()["review"]["body"] == "고친 후기"
    assert record(client, auth["B"], club_id).json()["shared_post_id"] == post_id  # 고쳐도 공유는 그대로


def test_share_twice_with_new_request_keeps_one_post_and_needs_saved_review(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth)
    assert error(share(client, auth["B"], club_id))[:3] == (404, "NOT_FOUND", "review")
    put_review(client, auth["B"], club_id, "책 없는 모임 후기")
    first, second = share(client, auth["B"], club_id), share(client, auth["B"], club_id)
    assert (first.status_code, second.status_code) == (201, 200)
    assert count(db_engine, "posts") == 1
    with db_engine.connect() as conn:
        kind = conn.execute(text("SELECT image_kind FROM posts")).scalar_one()
    assert kind == "color"  # 책이 없으면 바탕색 게시물
    assert error(share(client, auth["D"], club_id))[:2] == (404, "NOT_FOUND")


# ─────────── #63·#64 다음 모임 ───────────


def test_next_club_copies_fields_and_asks_new_time(client, auth, db_engine, book):
    prev = ended_club(client, db_engine, auth, isbn13=ISBN, capacity=6)
    response = next_club(client, auth["A"], prev)
    assert response.status_code == 201
    new = response.json()
    assert (new["name"], new["intro"], new["book"]["isbn13"], new["library"]["id"]) == \
        ("소년이 온다 같이 읽기", "같이 읽어요", ISBN, LIB_1)
    assert new["place"] == "3층 세미나실"  # 장소 빠지면 이전 값
    assert (new["starts_at"], new["ends_at"]) == (None, None)  # 미정 가능
    assert new["previous_club_id"] == prev and new["is_host"] is True

    starts = at(60 * 24 * 7)
    by_b = next_club(client, auth["B"], prev, place="1층 카페", starts_at=starts, ends_at=at(60 * 24 * 7 + 90))
    assert by_b.status_code == 201
    assert (by_b.json()["place"], by_b.json()["starts_at"]) == ("1층 카페", starts)
    assert by_b.json()["is_host"] is True  # 참가자가 만들면 그 사람이 만든 사람


def test_next_club_is_idempotent_and_guarded(client, auth, db_engine):
    prev = ended_club(client, db_engine, auth)
    rid = uuid4()
    first, again = next_club(client, auth["A"], prev, rid), next_club(client, auth["A"], prev, rid)
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["id"] == again.json()["id"]
    assert count(db_engine, "clubs", "previous_club_id = :p", p=prev) == 1

    assert error(next_club(client, auth["D"], prev))[:2] == (404, "NOT_FOUND")  # 참가하지 않은 사람
    running = new_club(client, auth["A"], starts_at=at(60), ends_at=at(120))
    assert error(next_club(client, auth["A"], running))[:2] == (409, "CLUB_NOT_ENDED")
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'canceled', cancel_reason = '사정' WHERE id = :id"),
                     {"id": prev})
    assert error(next_club(client, auth["A"], prev))[:2] == (409, "CLUB_CLOSED")
    bad = next_club(client, auth["B"], ended_club(client, db_engine, auth), starts_at=at(120), ends_at=at(60))
    assert error(bad)[:3] == (422, "VALIDATION_ERROR", "ends_at")
    assert count(db_engine, "clubs", "previous_club_id IS NOT NULL") == 1


def test_next_notice_skips_canceled_and_restricted_and_never_auto_joins(client, auth, db_engine):
    prev = new_club(client, auth["A"], starts_at=at(60), ends_at=at(120))
    for who in ("B", "C", "D"):
        join(client, auth[who], prev)
    client.delete(f"/api/v1/clubs/{prev}/participation", headers=auth["C"])  # 시작 전 참가 취소
    set_state(db_engine, prev, USER_D_ID, state="removed")  # 참가 제한으로 명단에서 빠짐(K2-9)
    set_times(db_engine, prev, now_kst() - timedelta(hours=3), now_kst() - timedelta(hours=1))

    new_id = next_club(client, auth["A"], prev).json()["id"]
    with db_engine.connect() as conn:
        rows = conn.execute(text("SELECT recipient_id::text FROM inbox_items WHERE kind = 'club_next'")).scalars()
        assert sorted(rows) == [USER_B_ID]
    assert inbox_kinds(client, auth["B"], "club_next")[0]["target"] == {"club_id": new_id}
    assert count(db_engine, "club_participations", "club_id = :id", id=new_id) == 0  # 자동 참가 없음


def test_existing_next_clubs_listed_first(client, auth, db_engine):
    prev = ended_club(client, db_engine, auth)
    assert client.get(f"/api/v1/clubs/{prev}/next").json() == {"items": []}
    first = next_club(client, auth["B"], prev).json()["id"]
    second = next_club(client, auth["A"], prev).json()["id"]
    with db_engine.begin() as conn:  # 만든 순서를 확실히 벌려 둔다
        conn.execute(text("UPDATE clubs SET created_at = now() - interval '1 hour' WHERE id = :id"), {"id": first})
    items = client.get(f"/api/v1/clubs/{prev}/next").json()["items"]  # 로그인 없이도 본다
    assert [i["id"] for i in items] == [first, second]
    assert items[0]["status"] == "open" and items[0]["participant_count"] == 0
    assert club_row(db_engine, prev).status == "open"  # 이전 회차 기록은 그대로(K2-6)
    assert record(client, auth["B"], prev).status_code == 200
