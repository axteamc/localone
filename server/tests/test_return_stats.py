"""M2-0-P4: 반납 집계 동의(PUT /me/settings/return-stats)·#22 집계 쓰기 — core 계약 M2-0 Z9·C2·C3·C5·C6·P5."""

from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import policy
from app.common import ApiError, today_kst
from app.routers import loans as loans_router
from app.routers.settings import set_return_stats_consent
from tests.conftest import USER_A_ID, USER_B_ID

# 픽스처(books·client·auth)와 도우미는 LOAN-1 시험의 것을 그대로 쓴다. test_* 이름은 가져오지 않는다.
from tests.test_loans_start import auth, books, client, isbn  # noqa: F401
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처: 도서관 101)

A = UUID(USER_A_ID)
B = UUID(USER_B_ID)
LOANS = "/api/v1/me/loans"
CONSENT = "/api/v1/me/settings/return-stats"
CLOCK = {"now": datetime(2026, 11, 16, 3, 0, tzinfo=timezone.utc)}  # 2026-11-16 12:00 KST


@pytest.fixture(autouse=True)
def movable_server_today(monkeypatch):
    CLOCK["now"] = datetime(2026, 11, 16, 3, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(loans_router, "today_kst", lambda: today_kst(CLOCK["now"]))


@pytest.fixture(autouse=True)
def _clean_stats(db_engine, books):  # noqa: F811
    """집계 표는 users를 가리키지 않아 TRUNCATE users CASCADE로 안 지워진다.

    `books` 정리(시험 책 삭제)보다 먼저 집계 행을 지우도록 그 픽스처 뒤에 선다.
    """
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM library_return_stats"))
    yield
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM library_return_stats"))


@pytest.fixture
def write_on(monkeypatch):
    """Q-49 결정 뒤의 켜진 상태를 시험에서만 흉내 낸다(상수 자체는 False 그대로)."""
    monkeypatch.setattr(policy, "RETURN_STATS_WRITE_ENABLED", True)


def consent(client, headers, value) -> object:
    return client.put(CONSENT, headers=headers, json={"consent": value})


def start(client, headers, book: int = 0, **extra) -> dict:
    r = client.post(LOANS, headers=headers, json={"isbn13": isbn(book), **extra})
    assert r.status_code == 201
    return r.json()


def give_back(client, headers, loan_id: str) -> object:
    r = client.post(f"{LOANS}/{loan_id}/return", headers=headers)
    assert r.status_code == 200
    return r


def stats(db_engine) -> list:
    with db_engine.connect() as c:
        return c.execute(text(
            "SELECT library_id, book_id, returned_on, return_count FROM library_return_stats "
            "ORDER BY library_id, book_id, returned_on")).all()


def setting(db_engine, uid: UUID):
    with db_engine.connect() as c:
        return c.execute(text("SELECT * FROM user_settings WHERE user_id = :u"), {"u": uid}).first()


# ─────────── P5 필수 ───────────


def test_return_stats_write_stays_off_until_enabled(client, auth, db_engine):
    assert policy.RETURN_STATS_WRITE_ENABLED is False  # Q-49 전 기본 잠금(Z9)
    assert consent(client, auth["A"], True).status_code == 200
    loan = start(client, auth["A"], library_id=101)
    give_back(client, auth["A"], loan["id"])
    assert stats(db_engine) == []  # 동의·도서관 있음이어도 집계 무변경(C6)


def test_return_stats_rows_have_no_user_or_loan_id(client, auth, db_engine, write_on):
    with db_engine.connect() as c:
        columns = set(c.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'library_return_stats'")).scalars())
    assert "user_id" not in columns and "loan_id" not in columns
    assert columns == {"library_id", "book_id", "returned_on", "return_count"}
    consent(client, auth["A"], True)
    loan = start(client, auth["A"], library_id=101)
    give_back(client, auth["A"], loan["id"])
    (row,) = stats(db_engine)
    assert set(row._mapping) == {"library_id", "book_id", "returned_on", "return_count"}


# ─────────── 켜졌을 때의 쓰기(Z9) ───────────


def test_consented_return_with_library_adds_one(client, auth, db_engine, write_on):
    consent(client, auth["A"], True)
    loan = start(client, auth["A"], library_id=101)
    give_back(client, auth["A"], loan["id"])
    (row,) = stats(db_engine)
    assert (row.library_id, row.returned_on, row.return_count) == (101, CLOCK["now"].date(), 1)


def test_repeat_return_does_not_count_twice(client, auth, db_engine, write_on):
    consent(client, auth["A"], True)
    loan = start(client, auth["A"], library_id=101)
    give_back(client, auth["A"], loan["id"])
    give_back(client, auth["A"], loan["id"])  # 멱등: 이미 반납됨
    assert [r.return_count for r in stats(db_engine)] == [1]


def test_same_library_book_day_accumulates(client, auth, db_engine, write_on):
    for who in ("A", "B"):
        consent(client, auth[who], True)
        give_back(client, auth[who], start(client, auth[who], library_id=101)["id"])
    assert [r.return_count for r in stats(db_engine)] == [2]  # 도서관-책-날짜 한 행에 합침


def test_no_consent_row_or_withdrawn_consent_writes_nothing(client, auth, db_engine, write_on):
    give_back(client, auth["A"], start(client, auth["A"], library_id=101)["id"])  # 설정 행 없음
    consent(client, auth["A"], True)
    consent(client, auth["A"], False)  # 철회
    give_back(client, auth["A"], start(client, auth["A"], book=1, library_id=101)["id"])
    assert stats(db_engine) == []


def test_other_users_consent_does_not_apply(client, auth, db_engine, write_on):
    consent(client, auth["B"], True)
    give_back(client, auth["A"], start(client, auth["A"], library_id=101)["id"])
    assert stats(db_engine) == []


def test_loan_without_library_is_not_counted(client, auth, db_engine, write_on):
    consent(client, auth["A"], True)
    give_back(client, auth["A"], start(client, auth["A"])["id"])  # library_id 없음
    assert stats(db_engine) == []


def test_returned_on_is_seoul_date(client, auth, db_engine, write_on):
    consent(client, auth["A"], True)
    loan = start(client, auth["A"], library_id=101)
    CLOCK["now"] = datetime(2026, 11, 16, 15, 30, tzinfo=timezone.utc)  # 11-17 00:30 KST
    give_back(client, auth["A"], loan["id"])
    assert stats(db_engine)[0].returned_on.isoformat() == "2026-11-17"


# ─────────── 동의 PUT(C2·C3) ───────────


def test_consent_put_stores_and_is_idempotent(client, auth, db_engine):
    r = consent(client, auth["A"], True)
    assert r.status_code == 200 and r.json() == {"consent": True}
    first = setting(db_engine, A)
    assert first.return_stats_consent is True and first.consented_at is not None
    assert first.nearby_radius_km == 3  # 칸만 있음(기본값)

    assert consent(client, auth["A"], True).json() == {"consent": True}
    again = setting(db_engine, A)
    assert (again.consented_at, again.updated_at) == (first.consented_at, first.updated_at)  # 무변경

    assert consent(client, auth["A"], False).json() == {"consent": False}
    off = setting(db_engine, A)
    assert off.return_stats_consent is False and off.consented_at is None
    assert setting(db_engine, B) is None  # 남의 행 안 생김


def test_consent_false_first_creates_row_without_consent_time(client, auth, db_engine):
    assert consent(client, auth["A"], False).json() == {"consent": False}
    row = setting(db_engine, A)
    assert row.return_stats_consent is False and row.consented_at is None


@pytest.mark.parametrize("body", [{}, {"consent": "true"}, {"consent": 1}, {"consent": None},
                                  {"consent": True, "extra": 1}, []])
def test_consent_bad_body_is_422(client, auth, db_engine, body):
    r = client.put(CONSENT, headers=auth["A"], json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert setting(db_engine, A) is None


def test_consent_requires_login(client):
    assert client.put(CONSENT, json={"consent": True}).status_code == 401


def test_consent_withdrawn_user_is_403(client, auth, db_engine):
    with db_engine.begin() as c:
        c.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :u"), {"u": A})
    r = consent(client, auth["A"], True)
    assert r.status_code == 403
    assert setting(db_engine, A) is None


def test_consent_write_rechecks_withdrawal_in_transaction(auth, db_engine):
    """인증을 지난 뒤 탈퇴가 먼저 커밋돼도 쓰기 트랜잭션 첫 SQL(lock_active_user)이 막는다."""
    with db_engine.begin() as c:
        c.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :u"), {"u": A})
    with pytest.raises(ApiError) as caught, db_engine.begin() as c:
        set_return_stats_consent(c, A, True)
    assert caught.value.status_code == 403
    assert setting(db_engine, A) is None


# ─────────── 표(C5) ───────────


def test_user_settings_table_rls_and_checks(db_engine, auth):
    with db_engine.connect() as c:
        assert c.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname = 'user_settings'")).scalar_one()
        assert c.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = 'user_settings'")).scalar_one() == 0
    with pytest.raises(IntegrityError), db_engine.begin() as c:
        c.execute(text("INSERT INTO user_settings (user_id, nearby_radius_km) VALUES (:u, 4)"), {"u": A})
