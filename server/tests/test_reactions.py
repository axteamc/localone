"""LOCAL-2-P2: 공감(#29)·북마크(#30) — local-feed 계약 LOCAL-2 C5·C6·P5."""

from concurrent.futures import ThreadPoolExecutor
from time import monotonic
from uuid import uuid4

import pytest
from sqlalchemy import text

from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_feed import auth, books, client, seed  # noqa: F401  (픽스처·도우미)


def rows(db_engine, table: str, post_id: str | None = None) -> int:
    sql = f"SELECT count(*) FROM {table}" + (" WHERE post_id = :p" if post_id else "")
    with db_engine.connect() as conn:
        return conn.execute(text(sql), {"p": post_id} if post_id else {}).scalar_one()


def saved_at(db_engine, post_id: str):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT saved_at FROM post_bookmarks WHERE post_id = :p AND user_id = :u"),
                            {"p": post_id, "u": USER_A_ID}).scalar_one()


def url(post_id: str, kind: str = "reaction") -> str:
    return f"/api/v1/posts/{post_id}/{kind}"


# ─────────── #29 ───────────


def test_reaction_put_twice_one_row(client, auth, db_engine):
    post_id = seed(db_engine)
    first = client.put(url(post_id), headers=auth["A"])
    second = client.put(url(post_id), headers=auth["A"])
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"post_id": post_id, "reacted": True, "reaction_count": 1}
    with ThreadPoolExecutor(max_workers=4) as pool:  # 동시에 여러 번
        results = list(pool.map(lambda _: client.put(url(post_id), headers=auth["A"]), range(4)))
    assert all(r.status_code == 200 for r in results)
    assert rows(db_engine, "post_reactions", post_id) == 1
    b = client.put(url(post_id), headers=auth["B"]).json()
    assert b["reaction_count"] == 2
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth["A"]).json()["reaction_count"] == 2


def test_reaction_delete_twice_zero_rows(client, auth, db_engine):
    post_id = seed(db_engine)
    client.put(url(post_id), headers=auth["A"])
    client.put(url(post_id), headers=auth["B"])
    first = client.delete(url(post_id), headers=auth["A"])
    second = client.delete(url(post_id), headers=auth["A"])
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"post_id": post_id, "reacted": False, "reaction_count": 1}
    with db_engine.connect() as conn:  # B의 공감은 그대로
        assert conn.execute(text("SELECT user_id::text FROM post_reactions WHERE post_id = :p"),
                            {"p": post_id}).scalars().all() == [USER_B_ID]


@pytest.mark.parametrize("kind", ["reaction", "bookmark"])
@pytest.mark.parametrize("status", ["withdrawn", "hidden"])
def test_reaction_on_withdrawn_is_404_no_row(client, auth, db_engine, kind, status):
    post_id = seed(db_engine, status=status)
    for method in (client.put, client.delete):
        response = method(url(post_id, kind), headers=auth["A"])
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "POST_NOT_AVAILABLE"
    assert rows(db_engine, "post_reactions") == rows(db_engine, "post_bookmarks") == 0


@pytest.mark.parametrize("kind", ["reaction", "bookmark"])
def test_reaction_unknown_post_is_404_no_row(client, auth, db_engine, kind):
    response = client.put(url(str(uuid4()), kind), headers=auth["A"])
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    assert client.put(url("not-a-uuid", kind), headers=auth["A"]).json()["error"]["detail"] == "post_id"
    assert rows(db_engine, "post_reactions") == rows(db_engine, "post_bookmarks") == 0


@pytest.mark.parametrize("kind", ["reaction", "bookmark"])
def test_reaction_requires_login(client, auth, db_engine, kind):
    post_id = seed(db_engine)
    for method in (client.put, client.delete):
        response = method(url(post_id, kind))
        assert response.status_code == 401
    assert rows(db_engine, "post_reactions") == rows(db_engine, "post_bookmarks") == 0


@pytest.mark.parametrize("kind", ["reaction", "bookmark"])
def test_reaction_while_withdrawing_is_403(client, auth, db_engine, kind):
    """인증을 통과한 뒤 탈퇴가 먼저 잠그면, 쓰기 트랜잭션의 lock_active_user가 기다렸다가 403."""
    post_id = seed(db_engine)
    with db_engine.connect() as withdraw:
        tx = withdraw.begin()
        withdraw.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"), {"id": USER_A_ID})
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: client.put(url(post_id, kind), headers=auth["A"]))
            try:
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(text(
                            "SELECT count(*) > 0 FROM pg_stat_activity WHERE wait_event_type = 'Lock' "
                            "AND query LIKE 'SELECT status FROM users%FOR SHARE'")).scalar_one()
                        observer.rollback()
                        if blocked:
                            break
                assert blocked, "공감·북마크 쓰기가 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            response = future.result(timeout=5)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    assert rows(db_engine, "post_reactions") == rows(db_engine, "post_bookmarks") == 0


# ─────────── #30 ───────────


def test_bookmark_resave_updates_saved_at(client, auth, db_engine):
    post_id = seed(db_engine)
    first = client.put(url(post_id, "bookmark"), headers=auth["A"])
    assert first.status_code == 200 and first.json() == {"post_id": post_id, "bookmarked": True}
    before = saved_at(db_engine, post_id)
    again = client.put(url(post_id, "bookmark"), headers=auth["A"])
    assert again.json() == {"post_id": post_id, "bookmarked": True}
    assert rows(db_engine, "post_bookmarks", post_id) == 1
    assert saved_at(db_engine, post_id) > before
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth["A"]).json()["my_bookmark"] is True


def test_bookmark_delete_twice_zero_rows(client, auth, db_engine):
    post_id = seed(db_engine)
    client.put(url(post_id, "bookmark"), headers=auth["A"])
    client.put(url(post_id, "bookmark"), headers=auth["B"])
    first = client.delete(url(post_id, "bookmark"), headers=auth["A"])
    second = client.delete(url(post_id, "bookmark"), headers=auth["A"])
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"post_id": post_id, "bookmarked": False}
    assert rows(db_engine, "post_bookmarks", post_id) == 1  # B의 북마크는 그대로


def test_reactions_bookmarks_rls_enabled(db_engine):
    with db_engine.connect() as conn:
        for table in ("post_reactions", "post_bookmarks"):
            assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname = :t"),
                                {"t": table}).scalar_one()
            assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = :t"),
                                {"t": table}).scalar_one() == 0
