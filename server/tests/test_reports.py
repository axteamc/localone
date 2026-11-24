"""LOCAL-4 #37 validation, public visibility, and moderation integration."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from time import monotonic, sleep
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.routers import ops as ops_router, reports, posts
from tests.conftest import USER_A_ID
from tests.provider_fakes import public_reference_data  # noqa: F401
from tests.test_feed import LIB_1, auth, books, client, seed  # noqa: F401
from tests.test_ops import A, B, PRIVATE_KEYS, REASON, actions, all_keys, inbox_of, ops, q, seed_club, seed_comment, seed_guestbook  # noqa: F401

URL = "/api/v1/reports"


def submit(client, headers, target_id, kind="post", reason="spam", **fields):
    return client.post(URL, headers=headers, json={"target_kind": kind, "target_id": target_id, "reason": reason, **fields})


def records(db_engine):
    return q(db_engine, "SELECT reporter_id, target_kind, target_id, reason, text, status FROM reports")


def assert_response(response, status):
    assert response.status_code == status, response.text
    assert response.json() == {"ok": True}


def test_report_is_once_per_reporter_and_target(client, auth, db_engine, monkeypatch):
    first_target = seed(db_engine)
    assert_response(submit(client, auth["A"], first_target, reason="other", text="  첫 내용  "), 201)
    q_update(db_engine, "UPDATE reports SET status = 'dismissed'")
    assert_response(submit(client, auth["A"], first_target, reason="abuse"), 200)
    row, = records(db_engine)
    assert (row.reporter_id, str(row.target_id), row.reason, row.text, row.status) == (
        A, first_target, "other", "첫 내용", "dismissed",
    )

    next_target = seed(db_engine)
    gate = Barrier(2, timeout=5)
    original = reports.select_visible_author

    def simultaneous(*args):
        gate.wait()
        return original(*args)

    monkeypatch.setattr(reports, "select_visible_author", simultaneous)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(submit, client, auth["A"], next_target, reason=reason) for reason in ("spam", "privacy")]
        responses = [future.result(timeout=8) for future in futures]
    assert sorted(response.status_code for response in responses) == [200, 201]
    for response in responses:
        assert response.json() == {"ok": True}
    accepted, = [row for row in records(db_engine) if str(row.target_id) == next_target]
    winning_reason = "spam" if responses[0].status_code == 201 else "privacy"
    assert (accepted.reason, accepted.text, accepted.status) == (winning_reason, None, "open")


def q_update(db_engine, sql, **params):
    with db_engine.begin() as conn:
        conn.execute(text(sql), params)


def test_report_never_hides_target_and_public_views_expose_no_reporter(client, auth, db_engine, make_token):
    post = seed(db_engine)
    original = client.get(f"/api/v1/posts/{post}").json()
    for _ in range(10):
        uid = str(uuid4())
        headers = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=headers).status_code == 200
        assert_response(submit(client, headers, post), 201)
    assert len(records(db_engine)) == 10
    assert original == client.get(f"/api/v1/posts/{post}").json()
    feed = client.get(f"/api/v1/libraries/{LIB_1}/posts").json()
    assert [item["id"] for item in feed["items"]] == [post]
    assert not {"reporter_id", "reporter", "report_count", "reports", "status"} & all_keys([original, feed])


@pytest.mark.parametrize("kind", ["post", "guestbook", "club", "club_comment"])
def test_report_uses_visibility_and_owner_of_each_target_kind(client, auth, db_engine, kind):
    parent = seed_club(db_engine)
    if kind == "post":
        owner, table, inactive = seed(db_engine), "posts", "withdrawn"
        own = seed(db_engine, user_id=USER_A_ID)
    elif kind == "guestbook":
        owner, table, inactive = seed_guestbook(db_engine), "guestbook_entries", "withdrawn"
        own = seed_guestbook(db_engine, A)
    elif kind == "club":
        owner, table, inactive = seed_club(db_engine), "clubs", "hidden"
        own = seed_club(db_engine, host=A)
    else:
        owner, table, inactive = seed_comment(db_engine, parent), "club_comments", "deleted"
        own = seed_comment(db_engine, parent, user=A)

    own_result = submit(client, auth["A"], own, kind)
    assert own_result.status_code == 422 and own_result.json()["error"]["detail"] == "target_id"
    assert_response(submit(client, auth["A"], owner, kind), 201)
    assert_response(submit(client, auth["A"], owner, kind), 200)
    for state in {inactive, "hidden"}:
        q_update(db_engine, f"UPDATE {table} SET status = :state WHERE id = :id", state=state, id=owner)
        missing = submit(client, auth["A"], str(uuid4()), kind)
        hidden = submit(client, auth["A"], owner, kind)
        assert missing.status_code == hidden.status_code == 404
        assert missing.json() == hidden.json()

    if kind == "club":
        for state in ("closed", "canceled"):
            public = seed_club(db_engine, status=state, cancel_reason="일정 변경" if state == "canceled" else None)
            assert_response(submit(client, auth["A"], public, kind), 201)
    elif kind == "club_comment":
        visible = seed_comment(db_engine, parent)
        other = seed_comment(db_engine, parent)
        assert_response(submit(client, auth["A"], visible, kind), 201)
        q_update(db_engine, "UPDATE clubs SET status = 'hidden' WHERE id = :id", id=parent)
        assert submit(client, auth["A"], other, kind).status_code == 404
        assert submit(client, auth["A"], visible, kind).status_code == 404
    assert len(records(db_engine)) == {"post": 1, "guestbook": 1, "club": 3, "club_comment": 2}[kind]


def wait_for_lock(db_engine, query_like):
    deadline = monotonic() + 5
    with db_engine.connect() as conn:
        while monotonic() < deadline:
            blocked = conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity "
                "WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE :query_like)"
            ), {"query_like": query_like}).scalar_one()
            conn.rollback()
            if blocked:
                return
            sleep(0.01)
    pytest.fail(f"No blocked statement matched {query_like}")


@pytest.mark.parametrize("kind", ["withdraw", "hide"])
@pytest.mark.parametrize("report_first", [False, True])
def test_report_acceptance_is_ordered_with_withdrawal_or_moderation(
    client, ops, db_engine, monkeypatch, kind, report_first,
):
    post_id = seed(db_engine)
    entered, release = Event(), Event()

    if report_first:
        original = reports.select_visible_author

        def gate(*args):
            owner = original(*args)
            entered.set()
            assert release.wait(5)
            return owner

        monkeypatch.setattr(reports, "select_visible_author", gate)
    elif kind == "hide":
        original = ops_router.set_status

        def gate(*args):
            original(*args)
            entered.set()
            assert release.wait(5)

        monkeypatch.setattr(ops_router, "set_status", gate)
    else:
        original = posts.run_db

        async def gate(engine, tx):
            def paused(conn):
                result = tx(conn)
                entered.set()
                assert release.wait(5)
                return result
            return await original(engine, paused)

        monkeypatch.setattr(posts, "run_db", gate)

    def report():
        return submit(client, ops["A"], post_id)

    def change_state():
        if kind == "hide":
            return client.post(f"/api/v1/ops/targets/post/{post_id}/hide", headers=ops["A"], json=REASON)
        return client.post(f"/api/v1/posts/{post_id}/withdraw", headers=ops["B"])

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(report if report_first else change_state)
        try:
            assert entered.wait(5)
            second = pool.submit(change_state if report_first else report)
            wait_for_lock(db_engine, "SELECT%FROM posts WHERE id = %FOR UPDATE")
        finally:
            release.set()
        ordered = [first.result(timeout=5), second.result(timeout=5)]

    report_result, changed = ordered if report_first else ordered[::-1]
    assert changed.status_code == 200
    assert report_result.status_code == (201 if report_first else 404)
    assert [row.status for row in records(db_engine)] == (
        [("actioned" if kind == "hide" else "open")] if report_first else []
    )
    assert report().status_code == 404


@pytest.mark.parametrize(("kind", "target_id", "reason", "fields", "field"), [
    ("book", None, "spam", {}, "target_kind"),
    ("post", "bad-id", "spam", {}, "target_id"),
    ("post", None, "unknown", {}, "reason"),
    ("post", None, "other", {}, "text"),
    ("post", None, "other", {"text": None}, "text"),
    ("post", None, "other", {"text": " \t\n "}, "text"),
    ("post", None, "other", {"text": "가" * 201}, "text"),
    ("post", None, "spam", {"text": ""}, "text"),
    ("post", None, "abuse", {"text": "x"}, "text"),
    ("post", None, "privacy", {"text": "x"}, "text"),
])
def test_report_validation_leaves_no_rows(client, auth, db_engine, kind, target_id, reason, fields, field):
    post = seed(db_engine)
    response = submit(client, auth["A"], target_id or post, kind, reason, **fields)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["detail"] == field
    assert records(db_engine) == []


def test_report_text_database_and_api_boundaries(client, auth, db_engine):
    for reason, value, constraint in [
        ("invalid", None, "reports_reason_check"),
        ("other", None, "reports_text_len_check"),
        ("other", "  ", "reports_text_len_check"),
        ("other", "가" * 201, "reports_text_len_check"),
        ("privacy", "", "reports_text_len_check"),
    ]:
        with pytest.raises(IntegrityError) as failure:
            q_update(db_engine, "INSERT INTO reports (reporter_id, target_kind, target_id, reason, text) "
                     "VALUES (:u, 'post', :target, :reason, :value)",
                     u=A, target=uuid4(), reason=reason, value=value)
        assert failure.value.orig.diag.constraint_name == constraint
    assert records(db_engine) == []
    assert_response(submit(client, auth["A"], seed(db_engine), reason="other", text=" 가 "), 201)
    assert_response(submit(client, auth["A"], seed(db_engine), reason="other", text=" " + "가" * 200 + " "), 201)
    assert sorted(len(row.text) for row in records(db_engine)) == [1, 200]


def test_report_account_closure_leaves_no_rows(client, auth, db_engine):
    target = seed(db_engine)
    with db_engine.connect() as conn:
        closing = conn.begin()
        conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"), {"id": A})
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(submit, client, auth["A"], target)
            try:
                wait_for_lock(db_engine, "SELECT status FROM users%FOR SHARE")
            finally:
                closing.commit()
            response = pending.result(timeout=5)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    assert records(db_engine) == []


@pytest.mark.parametrize("hide", [True, False])
def test_operator_sees_and_resolves_a_report_created_by_api(client, ops, db_engine, hide):
    target = seed(db_engine)
    assert_response(submit(client, ops["A"], target), 201)
    listed = client.get("/api/v1/ops/reports", headers=ops["A"]).json()
    row, = listed["items"]
    assert (row["target_id"], row["target_status"], row["status"]) == (target, "published", "open")
    assert actions(db_engine) == inbox_of(db_engine, B) == []
    url = f"/api/v1/posts/{target}"
    assert client.get(url).status_code == 200
    path = f"targets/post/{target}/hide" if hide else f"reports/{row['id']}/resolve"
    response = client.post(f"/api/v1/ops/{path}", headers=ops["A"], json=REASON)
    assert response.status_code == 200
    assert not PRIVATE_KEYS & all_keys([listed, response.json()])
    assert client.get(url).status_code == (404 if hide else 200)
    assert [row.status for row in records(db_engine)] == [("actioned" if hide else "dismissed")]
    assert [row.action for row in actions(db_engine)] == [("hide" if hide else "dismiss")]
    assert [row.kind for row in inbox_of(db_engine, B)] == (["moderation"] if hide else [])


def test_report_requires_auth(client, db_engine):
    assert submit(client, {}, str(uuid4())).status_code == 401
    assert records(db_engine) == []
