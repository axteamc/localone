"""CLUB-1-P1: 참가(#55)·참가 취소(#56) — book-club 계약 CLUB-1 K1-3·K1-4·K1-7·K1-10·K1-O6, P5."""

import threading
import time
from datetime import timedelta

from app.common import now_kst
from app.routers import clubs as clubs_router
from tests.conftest import USER_A_ID  # noqa: F401
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_clubs import (  # noqa: F401  (픽스처·도우미)
    at, auth, clean_clubs, client, club_row, count, comment, error, join, new_club, set_times,
)


def leave(client, headers, club_id):
    return client.delete(f"/api/v1/clubs/{club_id}/participation", headers=headers)


def test_join_is_immediate_and_idempotent(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    first, second = join(client, auth["B"], club_id), join(client, auth["B"], club_id)
    assert first.status_code == second.status_code == 200
    assert second.json()["my_participation"] == "joined" and second.json()["participant_count"] == 1
    assert count(db_engine, "club_participations", "state = 'joined'") == 1


def test_capacity_race_lets_only_one_in(client, auth, db_engine, monkeypatch):
    club_id = new_club(client, auth["A"], capacity=1)
    real = clubs_router.is_restricted

    def slow(conn, user_id, now):  # 잠금 뒤·자리 세기 전에 멈춰 두 요청이 겹치게 한다
        time.sleep(0.4)
        return real(conn, user_id, now)

    monkeypatch.setattr(clubs_router, "is_restricted", slow)
    results = {}

    def run(who):
        results[who] = join(client, auth[who], club_id)

    threads = [threading.Thread(target=run, args=(w,)) for w in ("B", "C")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    codes = sorted(r.status_code for r in results.values())
    assert codes == [200, 409]
    assert [error(r)[:2] for r in results.values() if r.status_code == 409] == [(409, "CLUB_FULL")]
    assert count(db_engine, "club_participations", "state = 'joined'") == 1


def test_leave_allowed_anytime_while_undecided_and_only_before_start_when_decided(client, auth, db_engine):
    undecided = new_club(client, auth["A"])
    join(client, auth["B"], undecided)
    assert leave(client, auth["B"], undecided).status_code == 200
    assert leave(client, auth["B"], undecided).json()["my_participation"] == "left"  # 멱등

    decided = new_club(client, auth["A"], starts_at=at(60))
    join(client, auth["B"], decided)
    assert leave(client, auth["B"], decided).status_code == 200

    started = new_club(client, auth["A"], starts_at=at(60))
    join(client, auth["B"], started)
    set_times(db_engine, started, now_kst() - timedelta(minutes=1))
    assert error(leave(client, auth["B"], started))[:2] == (409, "CLUB_STARTED")
    assert count(db_engine, "club_participations", "club_id = :id AND state = 'joined'", id=started) == 1


def test_leave_without_joining_is_ok(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    response = leave(client, auth["B"], club_id)
    assert response.status_code == 200 and response.json()["my_participation"] == "none"
    assert count(db_engine, "club_participations") == 0


def test_start_time_change_still_enforces_leave_before_new_starts_at(client, auth, db_engine):
    club_id = new_club(client, auth["A"], starts_at=at(60 * 24))
    join(client, auth["B"], club_id)
    moved = client.patch(f"/api/v1/clubs/{club_id}", json={"starts_at": at(60 * 2)}, headers=auth["A"])
    assert moved.status_code == 200
    assert leave(client, auth["B"], club_id).status_code == 200  # 바뀐 시작 전 → 취소됨
    join(client, auth["B"], club_id)
    set_times(db_engine, club_id, now_kst() - timedelta(minutes=1))  # 바뀐 시작 시각이 지남
    assert error(leave(client, auth["B"], club_id))[:2] == (409, "CLUB_STARTED")  # 예외 없음(K1-O6 후보 A)
    assert count(db_engine, "club_participations", "state = 'joined'") == 1


def test_auto_close_at_start_time(client, auth, db_engine):
    club_id = new_club(client, auth["A"], starts_at=at(60))
    set_times(db_engine, club_id, now_kst() - timedelta(minutes=1))
    assert error(join(client, auth["B"], club_id))[:2] == (409, "CLUB_CLOSED")
    assert client.get(f"/api/v1/clubs/{club_id}").json()["status"] == "closed"
    assert count(db_engine, "club_participations") == 0


def test_full_canceled_and_ended_clubs_refuse_join(client, auth, db_engine):
    full = new_club(client, auth["A"], capacity=1)
    join(client, auth["B"], full)
    assert error(join(client, auth["C"], full))[:2] == (409, "CLUB_FULL")
    canceled = new_club(client, auth["A"])
    client.post(f"/api/v1/clubs/{canceled}/cancel", json={"reason": "사정"}, headers=auth["A"])
    assert error(join(client, auth["B"], canceled))[:2] == (409, "CLUB_CLOSED")
    ended = new_club(client, auth["A"])
    set_times(db_engine, ended, now_kst() - timedelta(hours=3), now_kst() - timedelta(hours=1))
    assert error(join(client, auth["B"], ended))[:2] == (409, "CLUB_CLOSED")
    assert client.get(f"/api/v1/clubs/{ended}").json()["status"] == "ended"
    assert count(db_engine, "club_participations", "state = 'joined'") == 1


def test_restricted_user_cannot_join_or_comment(client, auth, db_engine, monkeypatch):
    club_id = new_club(client, auth["A"])
    until = now_kst() + timedelta(days=3)
    monkeypatch.setattr(clubs_router, "is_restricted", lambda conn, user_id, now: until)
    expected = (403, "PARTICIPATION_RESTRICTED", until.isoformat(timespec="seconds"))
    assert error(join(client, auth["B"], club_id)) == expected
    assert error(comment(client, auth["B"], club_id)) == expected
    assert count(db_engine, "club_participations") == 0 and count(db_engine, "club_comments") == 0
