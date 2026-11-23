"""CLUB-2-P2: 출석 확인·불참 제한·댓글 처리 요청·재검토·내 제한 — book-club 계약 CLUB-2 K2-7~K2-10, K2-O1~K2-O5, P5."""

from datetime import timedelta
from uuid import uuid4

from sqlalchemy import text

from app.common import now_kst
from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_club_records import (  # noqa: F401  (픽스처·도우미)
    USER_D_ID, auth, clean_records, client, ended_club, inbox_kinds, next_club, record, set_state,
)
from tests.test_clubs import (  # noqa: F401  (픽스처·도우미)
    USER_C_ID, at, clean_clubs, comment, count, error, join, new_club, set_times,
)

LIB_2 = 102


def attendance(client, headers, club_id, *indexes):
    marks = [{"participant_index": i} for i in indexes]
    return client.put(f"/api/v1/clubs/{club_id}/attendance", json={"marks": marks}, headers=headers)


def restrictions(db_engine, uid, where="true"):
    with db_engine.connect() as conn:
        return conn.execute(text(
            f"SELECT * FROM participation_restrictions WHERE user_id = :u AND {where} ORDER BY created_at"
        ), {"u": uid}).all()


def add_restriction(db_engine, uid, kind="no_show", ends=None, created_days_ago=0, lifted=False, source=None):
    created = now_kst() - timedelta(days=created_days_ago)
    with db_engine.begin() as conn:
        return conn.execute(text(
            "INSERT INTO participation_restrictions (user_id, reason_kind, source_id, reason_text, starts_at, "
            "ends_at, created_at, lifted_at) VALUES (:u, :k, :s, '사유', :c, :e, :c, :l) RETURNING id"
        ), {"u": uid, "k": kind, "s": source or uuid4(), "c": created, "e": ends,
            "l": now_kst() if lifted else None}).scalar_one()


def ended_club_with(db_engine, host_id, member_ids) -> str:
    """제한 중인 사람도 참가자였던 끝난 모임을 직접 만든다(참가 API는 제한 중이면 막힌다)."""
    with db_engine.begin() as conn:
        club_id = conn.execute(text(
            "INSERT INTO clubs (library_id, host_id, name, starts_at, ends_at, client_request_id) "
            "VALUES (101, :h, '지난 모임', now() - interval '3 hours', now() - interval '1 hour', :r) RETURNING id"
        ), {"h": host_id, "r": uuid4()}).scalar_one()
        for n, uid in enumerate(member_ids):
            conn.execute(text(
                "INSERT INTO club_participations (club_id, user_id, state, joined_at) "
                "VALUES (:c, :u, 'joined', now() - interval '1 day' + :n * interval '1 second')"
            ), {"c": club_id, "u": uid, "n": n})
    return str(club_id)


def days_left(row) -> int | None:
    return None if row.ends_at is None else round((row.ends_at - row.starts_at) / timedelta(days=1))


# ─────────── #65 출석 확인 ───────────


def test_attendance_marks_only_no_shows_by_participant_index(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth, joiners=("B", "C", "D"))
    first = attendance(client, auth["A"], club_id, 2)
    assert first.status_code == 200 and first.json()["club"]["id"] == club_id
    assert attendance(client, auth["A"], club_id, 2).status_code == 200  # 두 번째 호출 무변경
    with db_engine.connect() as conn:
        marks = dict(conn.execute(text(
            "SELECT user_id::text, attendance_status FROM club_participations WHERE club_id = :id"
        ), {"id": club_id}).all())
    assert marks == {USER_B_ID: "attended", USER_C_ID: "attended", USER_D_ID: "no_show"}
    assert count(db_engine, "participation_restrictions") == 1
    assert record(client, auth["D"], club_id).json()["my_attendance"] == "no_show"
    assert record(client, auth["B"], club_id).json()["my_attendance"] == "attended"
    notice = inbox_kinds(client, auth["D"], "moderation")
    assert [i["target"] for i in notice] == [{"club_id": club_id}]  # 누르면 모임 화면(큰 틀 결정 4)


def test_attendance_rejects_bad_index_and_non_host_and_canceled_and_not_ended(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth, joiners=("B", "C"))
    for bad in ((2,), (-1,), (0, 0)):
        assert error(attendance(client, auth["A"], club_id, *bad))[:3] == (422, "VALIDATION_ERROR", "marks")
    assert error(attendance(client, auth["B"], club_id, 1))[:2] == (403, "NOT_HOST")
    running = new_club(client, auth["A"], starts_at=at(60), ends_at=at(120))
    join(client, auth["B"], running)
    assert error(attendance(client, auth["A"], running, 0))[:2] == (409, "CLUB_NOT_ENDED")
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'canceled', cancel_reason = '사정' WHERE id = :id"),
                     {"id": club_id})
    assert error(attendance(client, auth["A"], club_id, 0))[:2] == (409, "CLUB_CLOSED")
    assert count(db_engine, "participation_restrictions") == 0
    assert count(db_engine, "club_participations", "attendance_status = 'no_show'") == 0


def test_no_show_mark_creates_tiered_restriction_within_180_days(client, auth, db_engine):
    add_restriction(db_engine, USER_B_ID, ends=now_kst() - timedelta(days=170), created_days_ago=181)  # 안 셈
    expected = [3, 7, 30, None]
    for n, want in enumerate(expected, start=1):
        club_id = ended_club_with(db_engine, USER_A_ID, [USER_B_ID])
        assert attendance(client, auth["A"], club_id, 0).status_code == 200
        assert attendance(client, auth["A"], club_id, 0).status_code == 200  # 멱등
        rows = restrictions(db_engine, USER_B_ID, "source_id = :s".replace(":s", f"'{club_id}'"))
        assert len(rows) == 1 and days_left(rows[0]) == want, n
        assert rows[0].reason_kind == "no_show" and rows[0].reason_text == "불참으로 기록됐어요"
    assert len(restrictions(db_engine, USER_B_ID)) == 5


def test_lifted_and_canceled_no_shows_are_not_counted(client, auth, db_engine):
    add_restriction(db_engine, USER_B_ID, ends=now_kst() - timedelta(days=1), created_days_ago=10)
    add_restriction(db_engine, USER_B_ID, ends=now_kst() + timedelta(days=1), created_days_ago=5, lifted=True)
    canceled = ended_club_with(db_engine, USER_A_ID, [USER_B_ID])
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'canceled', cancel_reason = '사정' WHERE id = :id"),
                     {"id": canceled})
    assert error(attendance(client, auth["A"], canceled, 0))[:2] == (409, "CLUB_CLOSED")  # 취소는 세지 않음
    club_id = ended_club_with(db_engine, USER_A_ID, [USER_B_ID])
    attendance(client, auth["A"], club_id, 0)
    (row,) = restrictions(db_engine, USER_B_ID, f"source_id = '{club_id}'")
    assert days_left(row) == 7  # 유효 1건 + 이번 = 2번째


def test_time_alone_never_makes_no_show(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth, joiners=("B",))
    for who in ("A", "B"):
        client.get("/api/v1/me/inbox", headers=auth[who])
    record(client, auth["A"], club_id)
    assert count(db_engine, "participation_restrictions") == 0  # 시각 도달만으로 불참 없음(K2-7)
    assert join(client, auth["B"], new_club(client, auth["C"])).status_code == 200


# ─────────── 제한 효과 (is_restricted) ───────────


def test_restricted_user_cannot_join_or_comment_until_lifted(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    rid = add_restriction(db_engine, USER_B_ID, kind="comment", ends=now_kst() + timedelta(days=3))
    assert error(join(client, auth["B"], club_id))[:2] == (403, "PARTICIPATION_RESTRICTED")
    assert error(comment(client, auth["B"], club_id))[:2] == (403, "PARTICIPATION_RESTRICTED")
    assert count(db_engine, "club_participations") == 0 and count(db_engine, "club_comments") == 0
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE participation_restrictions SET lifted_at = now() WHERE id = :id"), {"id": rid})
    assert join(client, auth["B"], club_id).status_code == 200
    assert comment(client, auth["B"], club_id).status_code == 201


def test_null_ends_at_means_no_participation(client, auth, db_engine):
    add_restriction(db_engine, USER_B_ID, ends=None)
    assert error(join(client, auth["B"], new_club(client, auth["A"]))) == \
        (403, "PARTICIPATION_RESTRICTED", "")


def test_no_show_restriction_blocks_join_and_comment_everywhere(client, auth, db_engine):
    club_id = ended_club(client, db_engine, auth, joiners=("B",))
    attendance(client, auth["A"], club_id, 0)
    (row,) = restrictions(db_engine, USER_B_ID)
    until = now_kst(row.ends_at).isoformat(timespec="seconds")
    elsewhere = new_club(client, auth["C"], library_id=LIB_2)
    assert error(join(client, auth["B"], elsewhere)) == (403, "PARTICIPATION_RESTRICTED", until)
    assert error(comment(client, auth["B"], elsewhere)) == (403, "PARTICIPATION_RESTRICTED", until)
    assert count(db_engine, "club_comments") == 0


def test_expired_restriction_no_longer_blocks(client, auth, db_engine):
    add_restriction(db_engine, USER_B_ID, ends=now_kst() - timedelta(minutes=1), created_days_ago=3)
    assert join(client, auth["B"], new_club(client, auth["A"])).status_code == 200


def test_next_notice_skips_user_with_active_restriction(client, auth, db_engine):
    prev = ended_club(client, db_engine, auth, joiners=("B", "C"))
    add_restriction(db_engine, USER_C_ID, ends=now_kst() + timedelta(days=3))
    next_club(client, auth["A"], prev)
    with db_engine.connect() as conn:
        rows = conn.execute(text("SELECT recipient_id::text FROM inbox_items WHERE kind = 'club_next'")).scalars()
        assert sorted(rows) == [USER_B_ID]  # K2-5 제한된 사람 제외


# ─────────── #66 댓글 처리 요청 ───────────


def moderation_request(client, headers, comment_id, reason="모임과 관계없는 광고예요"):
    return client.post(f"/api/v1/club-comments/{comment_id}/moderation-request",
                       json={"reason": reason}, headers=headers)


def test_moderation_request_is_once_per_comment_and_comment_stays_visible(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    comment_id = comment(client, auth["B"], club_id, body="광고입니다").json()["id"]
    first, second = moderation_request(client, auth["A"], comment_id), moderation_request(client, auth["A"], comment_id)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json() == second.json() and first.json()["status"] == "pending"
    assert count(db_engine, "club_comment_requests") == 1
    listed = client.get(f"/api/v1/clubs/{club_id}/comments").json()["items"]
    assert [c["body"] for c in listed] == ["광고입니다"]  # 승인 전 댓글은 그대로


def test_moderation_request_only_by_host_with_reason(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    by_b = comment(client, auth["B"], club_id).json()["id"]
    by_host = comment(client, auth["A"], club_id).json()["id"]
    assert error(moderation_request(client, auth["C"], by_b))[:2] == (403, "NOT_HOST")
    assert error(moderation_request(client, auth["A"], by_b, reason="  "))[:3] == (422, "VALIDATION_ERROR", "reason")
    assert error(moderation_request(client, auth["A"], by_b, reason="가" * 201))[:3] == \
        (422, "VALIDATION_ERROR", "reason")
    assert error(moderation_request(client, auth["A"], by_host))[:3] == (422, "VALIDATION_ERROR", "comment_id")
    assert error(moderation_request(client, auth["A"], uuid4()))[:2] == (404, "NOT_FOUND")
    assert count(db_engine, "club_comment_requests") == 0


# ─────────── #67 재검토 요청 · #68 내 제한 ───────────


def test_my_restrictions_and_review_request_once(client, auth, db_engine):
    old = add_restriction(db_engine, USER_B_ID, ends=now_kst() - timedelta(days=200), created_days_ago=203)
    no_show = add_restriction(db_engine, USER_B_ID, ends=now_kst() - timedelta(days=1), created_days_ago=4)
    forever = add_restriction(db_engine, USER_B_ID, kind="comment", ends=None, created_days_ago=1)
    add_restriction(db_engine, USER_B_ID, ends=now_kst() + timedelta(days=2), created_days_ago=1, lifted=True)
    items = client.get("/api/v1/me/restrictions", headers=auth["B"]).json()["items"]
    assert [i["id"] for i in items] == [str(forever), str(no_show)]  # 최근순, 해제·180일 지난 것은 없음
    assert items[0] == {"id": str(forever), "reason_kind": "comment", "ends_at": None, "reason_text": "사유",
                        "review_requested": False}
    assert str(old) not in str(items)

    url = f"/api/v1/me/restrictions/{forever}/review-request"
    first = client.post(url, json={"text": "광고가 아니었어요"}, headers=auth["B"])
    second = client.post(url, json={"text": "다시"}, headers=auth["B"])
    assert (first.status_code, second.status_code) == (201, 200)
    assert second.json()["review_requested"] is True
    assert client.get("/api/v1/me/restrictions", headers=auth["B"]).json()["items"][0]["review_requested"] is True
    assert error(client.post(url, json={}, headers=auth["C"]))[:2] == (404, "NOT_FOUND")  # 남의 제한
    assert client.get("/api/v1/me/restrictions", headers=auth["C"]).json() == {"items": []}
    assert client.get("/api/v1/me/restrictions").status_code == 401
