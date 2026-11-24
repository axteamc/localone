"""AUTH-3-P1: 회원 탈퇴 DELETE /api/v1/me (W1·W2·W7, C5 표, C6 #18~#21)."""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.auth import lock_active_user
from app.common import ApiError
from app.main import create_app
from app.routers import me as me_router
from app.routers.me import WITHDRAWN_NICKNAME, withdraw_user_account
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처: 도서관 101)

A = UUID(USER_A_ID)
B = UUID(USER_B_ID)


@pytest.fixture
def client(test_db_url: str, fake_jwks_client: Any):
    app = create_app(
        Settings(app_env="test", database_url=test_db_url, supabase_url=TEST_SUPABASE_URL),
        fake_jwks_client,
    )
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client: TestClient, make_token: Any) -> dict[str, dict[str, str]]:
    """A·B를 실제 경로(POST /auth/session)로 등록한다 — users·user_profiles 행이 생긴다."""
    headers = {}
    for name, uid in (("A", USER_A_ID), ("B", USER_B_ID)):
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


def scalar(engine: Engine, sql: str, **params: Any) -> Any:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


def status_of(engine: Engine, uid: UUID) -> str:
    return scalar(engine, "SELECT status FROM users WHERE id = :u", u=uid)


def nickname_of(engine: Engine, uid: UUID) -> str:
    return scalar(engine, "SELECT nickname FROM user_profiles WHERE user_id = :u", u=uid)


def err(res: Any) -> tuple[int, str]:
    return res.status_code, res.json()["error"]["code"]


def test_withdraw_marks_user_and_returns_kst(client, auth, db_engine):
    res = client.delete("/api/v1/me", headers=auth["A"])
    assert res.status_code == 200
    body = res.json()
    assert body["user_id"] == USER_A_ID and body["status"] == "withdrawn"
    assert body["withdrawn_at"].endswith("+09:00") and len(body["withdrawn_at"]) == 25
    assert status_of(db_engine, A) == "withdrawn"
    assert status_of(db_engine, B) == "active"
    assert scalar(db_engine, "SELECT count(*) FROM users") == 2  # users 행은 지우지 않는다(W1)


def test_withdraw_blocks_remaining_tokens(client, auth, db_engine):
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    created = scalar(db_engine, "SELECT created_at FROM users WHERE id = :u", u=A)
    for method, path in (("GET", "/api/v1/me"), ("POST", "/api/v1/auth/session"), ("DELETE", "/api/v1/me")):
        res = client.request(method, path, headers=auth["A"])
        assert err(res) == (403, "ACCOUNT_WITHDRAWN"), (method, path)
        assert res.json()["error"]["message"] == "탈퇴한 계정이에요."
    assert status_of(db_engine, A) == "withdrawn"
    assert scalar(db_engine, "SELECT created_at FROM users WHERE id = :u", u=A) == created
    assert nickname_of(db_engine, A) == WITHDRAWN_NICKNAME  # 재등록이 프로필을 되살리지 않음


def test_withdraw_anonymizes_only_own_profile(client, auth, db_engine):
    before_b = nickname_of(db_engine, B)
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert nickname_of(db_engine, A) == "탈퇴한 이웃"
    assert nickname_of(db_engine, B) == before_b


def test_withdraw_twice_second_is_403_unchanged(auth, db_engine):
    # get_current_user를 거치지 않는 직접 호출도 ⓪의 status='active' 조건에서 막힌다
    with db_engine.begin() as conn:
        withdraw_user_account(conn, A)
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE user_profiles SET nickname = '되살아난 이름' WHERE user_id = :u"), {"u": A})
    with pytest.raises(ApiError) as caught, db_engine.begin() as conn:
        withdraw_user_account(conn, A)
    assert (caught.value.status_code, caught.value.code) == (403, "ACCOUNT_WITHDRAWN")
    assert nickname_of(db_engine, A) == "되살아난 이름"  # 두 번째는 아무 단계도 돌지 않음


def test_withdraw_failure_rolls_back(client, auth, db_engine, monkeypatch):
    def boom(conn, user_id, now):
        raise RuntimeError("단계 실패")

    monkeypatch.setattr(me_router, "WITHDRAWAL_STEPS", [*me_router.WITHDRAWAL_STEPS, boom])
    before = nickname_of(db_engine, A)
    res = client.delete("/api/v1/me", headers=auth["A"])
    assert err(res) == (500, "INTERNAL_ERROR")
    assert status_of(db_engine, A) == "active"  # ⓪도 롤백
    assert nickname_of(db_engine, A) == before


def test_withdraw_requires_auth_and_ignores_body(client, auth, db_engine):
    res = client.delete("/api/v1/me")
    assert err(res) == (401, "AUTH_REQUIRED")
    assert status_of(db_engine, A) == "active" and status_of(db_engine, B) == "active"

    res = client.request("DELETE", f"/api/v1/me?user_id={USER_B_ID}", headers=auth["A"],
                         json={"user_id": USER_B_ID})
    assert res.status_code == 200 and res.json()["user_id"] == USER_A_ID
    assert status_of(db_engine, A) == "withdrawn"
    assert status_of(db_engine, B) == "active"


def test_write_during_withdraw_is_403_no_row(auth, db_engine):
    """탈퇴 트랜잭션이 ⓪을 하고 열려 있는 동안 들어온 쓰기는 기다렸다가 403, 행 0(C6 #21)."""
    pids: Queue = Queue()

    def writer():
        with db_engine.connect() as conn:
            pids.put(conn.execute(text("SELECT pg_backend_pid()")).scalar_one())
            conn.rollback()
            with conn.begin():
                lock_active_user(conn, A)
                conn.execute(text("UPDATE user_profiles SET nickname = '쓰기' WHERE user_id = :u"), {"u": A})

    with ThreadPoolExecutor(max_workers=1) as pool:
        with db_engine.connect() as withdraw:
            tx = withdraw.begin()
            withdraw_user_account(withdraw, A)
            future = pool.submit(writer)
            try:
                pid = pids.get(timeout=5)
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(
                            text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": pid}
                        ).scalar_one()
                        if blocked:
                            break
                assert blocked, "쓰기가 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            with pytest.raises(ApiError) as caught:
                future.result(timeout=5)
    assert (caught.value.status_code, caught.value.code) == (403, "ACCOUNT_WITHDRAWN")
    assert nickname_of(db_engine, A) == WITHDRAWN_NICKNAME


# ── LOCAL-1·LOCAL-2 (B) 테이블: Owner D+B ──

def _post(engine: Engine, user: UUID, status: str = "published") -> str:
    with engine.begin() as conn:
        return str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, image_kind, image_value, body, status, client_request_id) "
            "VALUES (:u, 101, 'color', 'fill2', '본문', :s, gen_random_uuid()) RETURNING id"),
            {"u": user, "s": status}).scalar_one())


def _post_status(engine: Engine, post_id: str) -> str:
    return scalar(engine, "SELECT status FROM posts WHERE id = :p", p=post_id)


def test_withdraw_withdraws_published_posts_only_mine(client, auth, db_engine, public_reference_data):
    mine = _post(db_engine, A)
    mine_hidden = _post(db_engine, A, "hidden")
    theirs = _post(db_engine, B)
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert _post_status(db_engine, mine) == "withdrawn"
    assert _post_status(db_engine, mine_hidden) == "hidden"
    assert _post_status(db_engine, theirs) == "published"
    # 피드(published만)에서 사라진다
    feed = client.get("/api/v1/libraries/101/posts")
    assert feed.status_code == 200
    ids = [item["id"] for item in feed.json()["items"]]
    assert mine not in ids and theirs in ids


def test_withdraw_deletes_own_reactions_and_bookmarks(client, auth, db_engine, public_reference_data):
    mine, theirs = _post(db_engine, A), _post(db_engine, B)
    with db_engine.begin() as conn:
        for table in ("post_reactions", "post_bookmarks"):
            conn.execute(text(f"INSERT INTO {table} (post_id, user_id) VALUES (:p, :u)"), {"p": theirs, "u": A})
            conn.execute(text(f"INSERT INTO {table} (post_id, user_id) VALUES (:p, :u)"), {"p": mine, "u": B})
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    for table in ("post_reactions", "post_bookmarks"):
        assert scalar(db_engine, f"SELECT count(*) FROM {table} WHERE user_id = :u", u=A) == 0
        assert scalar(db_engine, f"SELECT count(*) FROM {table} WHERE user_id = :u AND post_id = :p",
                      u=B, p=mine) == 1  # W7


# ── LIB-3 (C) 테이블: Owner D+C ──

AUTH3_ISBN = "9790000003001"


@pytest.fixture
def book(db_engine: Engine, public_reference_data):  # noqa: F811
    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM books WHERE isbn13 = :i"), {"i": AUTH3_ISBN})

    clean()
    with db_engine.begin() as conn:
        bid = conn.execute(text(
            "INSERT INTO books (isbn13, title, source) VALUES (:i, '탈퇴 시험 책', 'manual') RETURNING id"),
            {"i": AUTH3_ISBN}).scalar_one()
    yield bid
    with db_engine.begin() as conn:
        conn.execute(text("DELETE FROM reading_logs WHERE book_id = :b"), {"b": bid})
        conn.execute(text("DELETE FROM loans WHERE book_id = :b"), {"b": bid})
        conn.execute(text("DELETE FROM loan_plans WHERE book_id = :b"), {"b": bid})
    clean()


def _plan(conn, user: UUID, book_id: int, library_id: int = 101) -> None:
    conn.execute(text("INSERT INTO loan_plans (user_id, book_id, library_id) VALUES (:u, :b, :l)"),
                 {"u": user, "b": book_id, "l": library_id})


def _plans(engine: Engine, user: UUID) -> int:
    return scalar(engine, "SELECT count(*) FROM loan_plans WHERE user_id = :u", u=user)


def test_withdraw_deletes_own_loan_plans(client, auth, db_engine, book):
    with db_engine.begin() as conn:
        _plan(conn, A, book)
        _plan(conn, B, book)
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert _plans(db_engine, A) == 0
    assert _plans(db_engine, B) == 1


def _loan(conn, user: UUID, book_id: int, plan_id: Any = None) -> None:
    conn.execute(text(
        "INSERT INTO loans (user_id, book_id, library_id, plan_id, loaned_on, due_on) "
        "VALUES (:u, :b, 101, :p, DATE '2026-11-01', DATE '2026-11-15')"),
        {"u": user, "b": book_id, "p": plan_id})


def _loans(engine: Engine, user: UUID) -> int:
    return scalar(engine, "SELECT count(*) FROM loans WHERE user_id = :u", u=user)


def test_withdraw_deletes_own_loans_before_plans(client, auth, db_engine, book):
    """loans는 loan_plans보다 먼저 지운다(plan_id FK). 내 대출만 지우고 B 대출은 그대로."""
    with db_engine.begin() as conn:
        _plan(conn, A, book)
        _plan(conn, B, book)
        a_plan = conn.execute(text("SELECT id FROM loan_plans WHERE user_id = :u"), {"u": A}).scalar_one()
        _loan(conn, A, book, a_plan)  # 예정에서 시작한 대출 — 순서가 거꾸로면 FK 위반
        _loan(conn, B, book)
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert (_loans(db_engine, A), _plans(db_engine, A)) == (0, 0)
    assert (_loans(db_engine, B), _plans(db_engine, B)) == (1, 1)


def test_write_committed_before_withdraw_is_cleaned(auth, db_engine, book):
    """쓰기가 lock_active_user(FOR SHARE)를 잡은 채 열려 있으면 탈퇴 ⓪이 기다리고,
    쓰기가 커밋된 뒤 같은 탈퇴 트랜잭션이 그 행까지 지운다(상태 변경이 맨 앞·한 트랜잭션)."""
    pids: Queue = Queue()

    def withdrawer():
        with db_engine.connect() as conn:
            pids.put(conn.execute(text("SELECT pg_backend_pid()")).scalar_one())
            conn.rollback()
            with conn.begin():
                return withdraw_user_account(conn, A)

    with ThreadPoolExecutor(max_workers=1) as pool:
        with db_engine.connect() as writer:
            tx = writer.begin()
            lock_active_user(writer, A)
            _plan(writer, A, book)
            future = pool.submit(withdrawer)
            try:
                pid = pids.get(timeout=5)
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(
                            text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": pid}
                        ).scalar_one()
                        if blocked:
                            break
                assert blocked, "탈퇴가 진행 중인 쓰기를 기다리지 않았다"
            finally:
                tx.commit()
            assert future.result(timeout=5)["status"] == "withdrawn"
    assert _plans(db_engine, A) == 0


# ── M2-0-P5: M2 표(core.md M2-0 Z10·P5 세부) — 0012 방명록 D+B, 0012 모임 D+C, 0011·0015 D ──

USER_C_ID = "00000000-0000-4000-8000-00000000000c"


def _one(engine: Engine, sql: str, **params: Any) -> Any:
    with engine.begin() as conn:
        return conn.execute(text(sql), params).scalar_one()


def _guestbook(engine: Engine, user: UUID, status: str = "published") -> str:
    return str(_one(engine, "INSERT INTO guestbook_entries (user_id, library_id, body, status, client_request_id) "
                            "VALUES (:u, 101, '다녀가요', :s, gen_random_uuid()) RETURNING id", u=user, s=status))


def _club(engine: Engine, host: UUID, status: str = "open", starts: str | None = None) -> str:
    """starts: SQL 식(예: "now() + interval '1 day'"), None이면 시작 미정."""
    return str(_one(
        engine,
        "INSERT INTO clubs (library_id, host_id, name, status, cancel_reason, starts_at, client_request_id) "
        f"VALUES (101, :h, '정독 북클럽', :s, :cr, {starts or 'NULL'}, gen_random_uuid()) RETURNING id",
        h=host, s=status, cr="먼저 취소" if status == "canceled" else None))


def _join(engine: Engine, club_id: str, user: UUID, state: str = "joined") -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO club_participations (club_id, user_id, state) VALUES (:c, :u, :s)"),
                     {"c": club_id, "u": user, "s": state})


def _comment(engine: Engine, club_id: str, user: UUID, status: str = "published") -> str:
    return str(_one(engine, "INSERT INTO club_comments (club_id, user_id, body, status, client_request_id) "
                            "VALUES (:c, :u, '댓글', :s, gen_random_uuid()) RETURNING id",
                    c=club_id, u=user, s=status))


def _club_row(engine: Engine, club_id: str) -> tuple[str, str | None]:
    with engine.connect() as conn:
        row = conn.execute(text("SELECT status, cancel_reason FROM clubs WHERE id = :c"), {"c": club_id}).one()
    return row[0], row[1]


def _state(engine: Engine, club_id: str, user: UUID) -> str:
    return scalar(engine, "SELECT state FROM club_participations WHERE club_id = :c AND user_id = :u",
                  c=club_id, u=user)


def _inbox(engine: Engine, user: UUID) -> list[tuple[str, dict]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT kind, target FROM inbox_items WHERE recipient_id = :u ORDER BY created_at, id"),
            {"u": user}).all()
    return [(r[0], r[1]) for r in rows]


def test_withdraw_steps_follow_z10_order():
    """순서 기본값(core P5 세부): ① 공개 철회(posts → 방명록 → 참가 → 댓글 → 모임) ② 개인 삭제
    (반응·북마크 → 스탬프 북마크 → 스탬프 → 대출 → 예정 → 게시물 reading_log_id NULL → 독서 기록 → 알림함 → 설정 → 후기)
    ③ 프로필. 알림함 삭제는 모임 취소 안내 뒤."""
    names = [step.__name__ for step in me_router.WITHDRAWAL_STEPS]
    assert names == [
        "_withdraw_published_posts",
        "_withdraw_published_guestbook",
        "_leave_joined_clubs",
        "_delete_published_club_comments",
        "_cancel_unstarted_hosted_clubs",
        "_delete_own_reactions_and_bookmarks",
        "_delete_own_stamp_bookmarks",
        "_delete_own_visit_stamps",
        "_delete_own_loans",
        "_delete_own_loan_plans",
        "_clear_own_post_reading_logs",
        "_delete_own_reading_logs",
        "_delete_own_inbox_items",
        "_delete_own_user_settings",
        "_delete_own_club_reviews",
        "_anonymize_profile",
    ]


def test_withdraw_cleans_m2_tables_in_order(client, auth, db_engine, book):
    """P5 필수: Z10 표마다 기대 상태(1차 + 2차 reading_log_id NULL → reading_logs, stamp_bookmarks → visit_stamps)."""
    gb_mine, gb_theirs = _guestbook(db_engine, A), _guestbook(db_engine, B)
    theirs_club = _club(db_engine, B, starts="now() + interval '1 day'")
    _join(db_engine, theirs_club, A)
    _join(db_engine, theirs_club, B)
    cm_mine, cm_theirs = _comment(db_engine, theirs_club, A), _comment(db_engine, theirs_club, B)
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO club_reviews (club_id, user_id, body) "
                          "VALUES (:club, :a, '내 후기'), (:club, :b, '다른 사람 후기')"),
                     {"club": theirs_club, "a": A, "b": B})
    my_club = _club(db_engine, A, starts="now() + interval '1 day'")
    _join(db_engine, my_club, A)
    _join(db_engine, my_club, B)
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO inbox_items (recipient_id, kind, target, dedupe_key, title) VALUES "
                          "(:a, 'club_next', '{}'::jsonb, 'k-a', 't'), (:b, 'club_next', '{}'::jsonb, 'k-b', 't')"),
                     {"a": A, "b": B})
        conn.execute(text("INSERT INTO user_settings (user_id, return_stats_consent) VALUES (:a, true), (:b, true)"),
                     {"a": A, "b": B})
        # 2차: reading_logs + posts.reading_log_id (published·hidden 모두)
        a_log = str(conn.execute(text(
            "INSERT INTO reading_logs (user_id, book_id, library_id, note, client_request_id) "
            "VALUES (:a, :b, 101, 'A 감상', gen_random_uuid()) RETURNING id"
        ), {"a": A, "b": book}).scalar_one())
        b_log = str(conn.execute(text(
            "INSERT INTO reading_logs (user_id, book_id, library_id, note, client_request_id) "
            "VALUES (:b_uid, :b, 101, 'B 감상', gen_random_uuid()) RETURNING id"
        ), {"b_uid": B, "b": book}).scalar_one())
        a_post_pub = str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, image_kind, image_value, body, status, reading_log_id, client_request_id) "
            "VALUES (:a, 101, 'color', 'fill2', 'A 공개글', 'published', :log, gen_random_uuid()) RETURNING id"
        ), {"a": A, "log": a_log}).scalar_one())
        a_post_hid = str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, image_kind, image_value, body, status, reading_log_id, client_request_id) "
            "VALUES (:a, 101, 'color', 'fill2', 'A 숨김글', 'hidden', :log, gen_random_uuid()) RETURNING id"
        ), {"a": A, "log": a_log}).scalar_one())
        b_post = str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, image_kind, image_value, body, status, reading_log_id, client_request_id) "
            "VALUES (:b_uid, 101, 'color', 'fill2', 'B 공개글', 'published', :log, gen_random_uuid()) RETURNING id"
        ), {"b_uid": B, "log": b_log}).scalar_one())
        # 2차: visit_stamps + stamp_bookmarks
        a_stamp = str(conn.execute(text(
            "INSERT INTO visit_stamps (user_id, library_id, stamped_on, visibility) "
            "VALUES (:a, 101, DATE '2026-11-18', 'public') RETURNING id"
        ), {"a": A}).scalar_one())
        b_stamp = str(conn.execute(text(
            "INSERT INTO visit_stamps (user_id, library_id, stamped_on, visibility) "
            "VALUES (:b_uid, 101, DATE '2026-11-18', 'public') RETURNING id"
        ), {"b_uid": B}).scalar_one())
        conn.execute(text("INSERT INTO stamp_bookmarks (user_id, stamp_id) VALUES (:a, :bs), (:b_uid, :as_), (:b_uid, :bs)"),
                     {"a": A, "b_uid": B, "as_": a_stamp, "bs": b_stamp})

    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200

    # 방명록 withdrawn, 남의 것 그대로
    assert scalar(db_engine, "SELECT status FROM guestbook_entries WHERE id = :g", g=gb_mine) == "withdrawn"
    assert scalar(db_engine, "SELECT status FROM guestbook_entries WHERE id = :g", g=gb_theirs) == "published"
    # 참가 left, 남의 참가 그대로
    assert _state(db_engine, theirs_club, A) == "left"
    assert _state(db_engine, theirs_club, B) == "joined"
    assert _state(db_engine, my_club, A) == "left"
    # 댓글 deleted, 남의 댓글 그대로
    assert scalar(db_engine, "SELECT status FROM club_comments WHERE id = :c", c=cm_mine) == "deleted"
    assert scalar(db_engine, "SELECT status FROM club_comments WHERE id = :c", c=cm_theirs) == "published"
    # 시작 전 만든 모임 canceled(사유 필수), 남의 모임 그대로
    assert _club_row(db_engine, my_club) == ("canceled", "만든 사람이 탈퇴했어요")
    assert _club_row(db_engine, theirs_club) == ("open", None)
    # 알림함: 내 것 삭제. B에게는 원래 것 + 내 모임 취소 안내 1
    assert _inbox(db_engine, A) == []
    assert _inbox(db_engine, B) == [("club_next", {}), ("club_canceled", {"club_id": my_club})]
    # 모임 후기: 탈퇴한 이용자의 비공개 글만 삭제
    assert scalar(db_engine, "SELECT count(*) FROM club_reviews WHERE user_id = :u", u=A) == 0
    assert scalar(db_engine, "SELECT body FROM club_reviews WHERE user_id = :u", u=B) == "다른 사람 후기"
    # 설정: 내 행만 삭제
    assert scalar(db_engine, "SELECT count(*) FROM user_settings WHERE user_id = :u", u=A) == 0
    assert scalar(db_engine, "SELECT count(*) FROM user_settings WHERE user_id = :u", u=B) == 1
    # 독서 기록 + 게시물 reading_log_id NULL(hidden 포함), 남의 기록·연결은 그대로
    assert scalar(db_engine, "SELECT count(*) FROM reading_logs WHERE user_id = :u", u=A) == 0
    assert scalar(db_engine, "SELECT count(*) FROM reading_logs WHERE user_id = :u", u=B) == 1
    assert scalar(db_engine, "SELECT reading_log_id FROM posts WHERE id = :p", p=a_post_pub) is None
    assert scalar(db_engine, "SELECT reading_log_id FROM posts WHERE id = :p", p=a_post_hid) is None
    assert scalar(db_engine, "SELECT status FROM posts WHERE id = :p", p=a_post_hid) == "hidden"
    assert str(scalar(db_engine, "SELECT reading_log_id FROM posts WHERE id = :p", p=b_post)) == b_log
    # 방문 스탬프 + 스탬프 북마크: A의 스탬프·북마크 삭제(B가 A 스탬프에 남긴 북마크도 CASCADE 정리), B의 스탬프·북마크 유지
    assert scalar(db_engine, "SELECT count(*) FROM visit_stamps WHERE user_id = :u", u=A) == 0
    assert scalar(db_engine, "SELECT count(*) FROM visit_stamps WHERE user_id = :u", u=B) == 1
    assert scalar(db_engine, "SELECT count(*) FROM stamp_bookmarks WHERE user_id = :u", u=A) == 0
    assert scalar(db_engine, "SELECT count(*) FROM stamp_bookmarks WHERE stamp_id = :s", s=a_stamp) == 0
    assert scalar(db_engine, "SELECT count(*) FROM stamp_bookmarks WHERE user_id = :u AND stamp_id = :s",
                  u=B, s=b_stamp) == 1


def test_withdraw_clears_post_reading_log_before_deleting_reading_logs(auth, db_engine, book, monkeypatch):
    """_clear_own_post_reading_logs가 _delete_own_reading_logs보다 먼저 실행되어 명시적으로 NULL 처리한다."""
    with db_engine.begin() as conn:
        a_log = str(conn.execute(text(
            "INSERT INTO reading_logs (user_id, book_id, library_id, note, client_request_id) "
            "VALUES (:a, :b, 101, '순서 확인', gen_random_uuid()) RETURNING id"
        ), {"a": A, "b": book}).scalar_one())
        a_post = str(conn.execute(text(
            "INSERT INTO posts (user_id, library_id, image_kind, image_value, body, status, reading_log_id, client_request_id) "
            "VALUES (:a, 101, 'color', 'fill2', '연결 글', 'published', :log, gen_random_uuid()) RETURNING id"
        ), {"a": A, "log": a_log}).scalar_one())

    observed_before_delete: list[Any] = []
    original_delete = me_router._delete_own_reading_logs

    def spy_delete(conn, user_id, now):
        observed_before_delete.append(
            conn.execute(text("SELECT reading_log_id FROM posts WHERE id = :p"), {"p": a_post}).scalar_one()
        )
        original_delete(conn, user_id, now)

    steps = [spy_delete if s is original_delete else s for s in me_router.WITHDRAWAL_STEPS]
    monkeypatch.setattr(me_router, "WITHDRAWAL_STEPS", steps)

    with db_engine.begin() as conn:
        withdraw_user_account(conn, A)
    assert observed_before_delete == [None]
    assert scalar(db_engine, "SELECT count(*) FROM reading_logs WHERE user_id = :u", u=A) == 0


def test_withdraw_keeps_hidden_and_removed_m2_rows(client, auth, db_engine, public_reference_data):
    """운영 숨김·내보냄은 기록이라 그대로(posts의 hidden과 같은 규칙)."""
    gb_hidden = _guestbook(db_engine, A, "hidden")
    club = _club(db_engine, B, starts="now() + interval '1 day'")
    _join(db_engine, club, A, "removed")
    cm_hidden = _comment(db_engine, club, A, "hidden")
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert scalar(db_engine, "SELECT status FROM guestbook_entries WHERE id = :g", g=gb_hidden) == "hidden"
    assert _state(db_engine, club, A) == "removed"
    assert scalar(db_engine, "SELECT status FROM club_comments WHERE id = :c", c=cm_hidden) == "hidden"


def test_withdraw_cancels_only_unstarted_open_or_closed_hosted_clubs(client, auth, db_engine, public_reference_data):
    undecided = _club(db_engine, A)  # 시작 미정 = 시작 전
    closed_future = _club(db_engine, A, "closed", "now() + interval '1 day'")
    started = _club(db_engine, A, starts="now() - interval '1 hour'")
    hidden = _club(db_engine, A, "hidden", "now() + interval '1 day'")
    canceled = _club(db_engine, A, "canceled", "now() + interval '1 day'")
    for club in (undecided, started):
        _join(db_engine, club, B)
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert _club_row(db_engine, undecided) == ("canceled", "만든 사람이 탈퇴했어요")
    assert _club_row(db_engine, closed_future) == ("canceled", "만든 사람이 탈퇴했어요")
    assert _club_row(db_engine, started) == ("open", None)  # 시작한 모임은 기록으로 남음
    assert _club_row(db_engine, hidden) == ("hidden", None)
    assert _club_row(db_engine, canceled) == ("canceled", "먼저 취소")
    # 취소 안내는 실제로 취소된 모임의 남은 참가자에게만(시작한 모임 참가자 B에게 그 모임 안내 없음)
    assert _inbox(db_engine, B) == [("club_canceled", {"club_id": undecided})]


def test_withdraw_cancel_notice_skips_left_and_removed(client, auth, db_engine, public_reference_data, make_token):
    h = {"Authorization": f"Bearer {make_token(sub=USER_C_ID)}"}
    assert client.post("/api/v1/auth/session", headers=h).status_code == 200
    club = _club(db_engine, A, starts="now() + interval '1 day'")
    _join(db_engine, club, A)
    _join(db_engine, club, B, "left")
    _join(db_engine, club, UUID(USER_C_ID), "removed")
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    assert _club_row(db_engine, club)[0] == "canceled"
    assert scalar(db_engine, "SELECT count(*) FROM inbox_items") == 0  # 남은 참가자 없음 → 안내 0


def test_withdraw_keeps_operation_records(client, auth, db_engine, public_reference_data):
    """신고·댓글 운영 요청·참가 제한·운영 기록·운영자 행은 남긴다(Z10). 탈퇴한 운영자는 /ops 404."""
    club = _club(db_engine, B, starts="now() + interval '1 day'")
    comment = _comment(db_engine, club, B)
    with db_engine.begin() as conn:
        p = {"a": A, "c": club, "m": comment}
        conn.execute(text("INSERT INTO operators (user_id) VALUES (:a)"), p)
        conn.execute(text("INSERT INTO reports (reporter_id, target_kind, target_id, reason) "
                          "VALUES (:a, 'club', :c, 'spam')"), p)
        conn.execute(text("INSERT INTO club_comment_requests (comment_id, requester_id, reason) "
                          "VALUES (:m, :a, '부적절')"), p)
        conn.execute(text("INSERT INTO participation_restrictions (user_id, reason_kind, source_id, reason_text) "
                          "VALUES (:a, 'no_show', :c, '불참')"), p)
        conn.execute(text("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id, reason) "
                          "VALUES (:a, 'hide', 'club', :c, '사유')"), p)
    assert client.get("/api/v1/ops/reports", headers=auth["A"]).status_code == 200
    assert client.delete("/api/v1/me", headers=auth["A"]).status_code == 200
    for sql in ("SELECT count(*) FROM operators WHERE user_id = :u",
                "SELECT count(*) FROM reports WHERE reporter_id = :u AND status = 'open'",
                "SELECT count(*) FROM club_comment_requests WHERE requester_id = :u AND status = 'pending'",
                "SELECT count(*) FROM participation_restrictions WHERE user_id = :u AND lifted_at IS NULL",
                "SELECT count(*) FROM moderation_actions WHERE actor_id = :u"):
        assert scalar(db_engine, sql, u=A) == 1, sql
    assert err(client.get("/api/v1/ops/reports", headers=auth["A"])) == (404, "NOT_FOUND")
