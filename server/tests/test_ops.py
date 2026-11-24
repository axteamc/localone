"""M2-0-P2: 운영자·운영 처리 `/ops/*` — core 계약 M2-0 Z4·Z5·C2·C5·C6·P5.

A = 운영자, B = 작성자·이용자.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_feed import LIB_1, auth, books, client, seed  # noqa: F401  (픽스처)
from tests.test_posts_template import POSTS, clean_template_logs, new_log, template_body  # noqa: F401

A = UUID(USER_A_ID)
B = UUID(USER_B_ID)
REASON = {"reason": "운영 기준 위반"}
FUTURE = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
PRIVATE_KEYS = {"reading_log", "reading_logs", "loan", "loans", "loan_id", "stamp", "stamps", "bookmark",
                "bookmarks", "bookmarked", "reacted", "reactions", "reaction_count", "reporter_id", "reporter"}


@pytest.fixture
def ops(auth, db_engine):
    """A를 운영자로(DB 직접 INSERT, Z4)."""
    with db_engine.begin() as c:
        c.execute(text("INSERT INTO operators (user_id) VALUES (:u)"), {"u": A})
    return auth


def q(db_engine, sql: str, **p):
    with db_engine.begin() as c:
        return c.execute(text(sql), p).all()


def one(db_engine, sql: str, **p):
    with db_engine.begin() as c:
        return c.execute(text(sql), p).scalar_one()


def seed_guestbook(db_engine, user=B) -> str:
    return str(one(db_engine, "INSERT INTO guestbook_entries (user_id, library_id, body, client_request_id) "
                              "VALUES (:u, :l, '다녀가요', :r) RETURNING id", u=user, l=LIB_1, r=uuid4()))


def seed_club(db_engine, host=B, status="open", cancel_reason=None) -> str:
    return str(one(db_engine, "INSERT INTO clubs (library_id, host_id, name, status, cancel_reason, client_request_id) "
                              "VALUES (:l, :h, '정독 북클럽', :s, :cr, :r) RETURNING id",
                   l=LIB_1, h=host, s=status, cr=cancel_reason, r=uuid4()))


def seed_comment(db_engine, club_id: str, user=B, status="published") -> str:
    return str(one(db_engine, "INSERT INTO club_comments (club_id, user_id, body, status, client_request_id) "
                              "VALUES (:c, :u, '댓글 본문', :s, :r) RETURNING id",
                   c=club_id, u=user, s=status, r=uuid4()))


def seed_report(db_engine, kind: str, target_id: str, reporter=A) -> str:
    return str(one(db_engine, "INSERT INTO reports (reporter_id, target_kind, target_id, reason) "
                              "VALUES (:u, :k, :t, 'spam') RETURNING id", u=reporter, k=kind, t=target_id))


def seed_request(db_engine, comment_id: str, requester=A) -> str:
    return str(one(db_engine, "INSERT INTO club_comment_requests (comment_id, requester_id, reason) "
                              "VALUES (:c, :u, '욕설') RETURNING id", c=comment_id, u=requester))


def actions(db_engine) -> list:
    return q(db_engine, "SELECT action, target_kind, target_id, reason, actor_id FROM moderation_actions "
                        "ORDER BY created_at, id")


def inbox_of(db_engine, uid: UUID) -> list:
    return q(db_engine, "SELECT kind, target FROM inbox_items WHERE recipient_id = :u ORDER BY created_at", u=uid)


def all_keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in all_keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in all_keys(v)}
    return set()


def ops_calls(rid: str) -> list[tuple[str, str, dict | None]]:
    """C2의 모든 /ops/* (P2 범위) — 운영자가 아니면 전부 404."""
    return [
        ("GET", "/api/v1/ops/reports?status=open", None),
        ("POST", f"/api/v1/ops/reports/{rid}/resolve", REASON),
        ("POST", f"/api/v1/ops/targets/post/{rid}/hide", REASON),
        ("POST", f"/api/v1/ops/targets/post/{rid}/restore", REASON),
        ("GET", "/api/v1/ops/club-comment-requests", None),
        ("POST", f"/api/v1/ops/club-comment-requests/{rid}/decide", {"decision": "rejected", **REASON}),
        ("GET", "/api/v1/ops/restrictions", None),
        ("POST", "/api/v1/ops/restrictions", {"user_id": str(B), "reason_kind": "no_show", "source_id": rid,
                                              "reason": "불참", "ends_at": None}),
        ("POST", f"/api/v1/ops/restrictions/{rid}/lift", REASON),
    ]


# ─────────── P5 필수 ───────────


def test_ops_routes_are_404_for_non_operators(client, auth, db_engine):
    post_id = seed(db_engine)
    for method, path, body in ops_calls(post_id):
        for headers in (auth["B"], {}):  # 운영자 아님 · 비로그인
            r = client.request(method, path, json=body, headers=headers)
            assert r.status_code == 404, (method, path, r.status_code)
            assert r.json()["error"]["code"] == "NOT_FOUND"
        # 잘못된 본문이어도 검증보다 운영자 확인이 먼저(경로 존재를 422로 흘리지 않음)
        if method == "POST":
            assert client.post(path, json={"bad": 1}, headers=auth["B"]).status_code == 404
    assert q(db_engine, "SELECT status FROM posts WHERE id = :i", i=post_id)[0].status == "published"
    assert actions(db_engine) == []


def test_hide_removes_target_everywhere_and_records_reason(client, ops, db_engine):
    post_id = seed(db_engine)
    report_id = seed_report(db_engine, "post", post_id)
    assert client.get(f"/api/v1/posts/{post_id}").status_code == 200

    r = client.post(f"/api/v1/ops/targets/post/{post_id}/hide", json=REASON, headers=ops["A"])
    assert r.status_code == 200
    assert r.json() == {"target_kind": "post", "target_id": post_id, "status": "hidden"}

    assert client.get(f"/api/v1/posts/{post_id}").status_code == 404  # 직접 조회
    assert client.get(f"/api/v1/libraries/{LIB_1}/posts").json()["items"] == []  # 목록
    acts = actions(db_engine)
    assert [(a.action, a.target_kind, a.target_id, a.reason, a.actor_id) for a in acts] == [
        ("hide", "post", post_id, "운영 기준 위반", A)]
    assert [(i.kind, i.target) for i in inbox_of(db_engine, B)] == [("moderation", {"post_id": post_id})]
    assert inbox_of(db_engine, A) == []  # 신고자(A)에게는 알리지 않는다(Z5)
    assert q(db_engine, "SELECT status FROM reports WHERE id = :i", i=report_id)[0].status == "actioned"

    # 연타: 무변경 200, 기록·안내 그대로
    r = client.post(f"/api/v1/ops/targets/post/{post_id}/hide", json=REASON, headers=ops["A"])
    assert r.status_code == 200 and r.json()["status"] == "hidden"
    assert len(actions(db_engine)) == 1 and len(inbox_of(db_engine, B)) == 1


def test_ops_never_exposes_private_data(client, ops, db_engine):
    post_id = seed(db_engine)
    club_id = seed_club(db_engine)
    comment_id = seed_comment(db_engine, club_id)
    request_id = seed_request(db_engine, comment_id)
    seed_report(db_engine, "post", post_id)
    seed_report(db_engine, "club_comment", comment_id)
    one(db_engine, "INSERT INTO participation_restrictions (user_id, reason_kind, source_id, reason_text, "
                   "review_requested_at) VALUES (:u, 'comment', :s, '욕설', now()) RETURNING id", u=B, s=request_id)
    bodies = [client.get(p, headers=ops["A"]).json() for p in (
        "/api/v1/ops/reports", "/api/v1/ops/club-comment-requests", "/api/v1/ops/restrictions",
        "/api/v1/ops/restrictions?state=active")]
    bodies.append(client.post(f"/api/v1/ops/targets/post/{post_id}/hide", json=REASON, headers=ops["A"]).json())
    assert all(b.get("items", [None]) for b in bodies)  # 빈 응답으로 통과하지 않게
    leaked = all_keys(bodies) & PRIVATE_KEYS
    assert leaked == set()


# ─────────── 숨김·복구 보강 ───────────


@pytest.mark.parametrize("kind", ["guestbook", "club", "club_comment"])
def test_hide_and_restore_each_kind(client, ops, db_engine, kind):
    club_id = seed_club(db_engine)
    target_id = {"guestbook": seed_guestbook, "club": lambda e: club_id,
                 "club_comment": lambda e: seed_comment(e, club_id)}[kind](db_engine)
    table = {"guestbook": "guestbook_entries", "club": "clubs", "club_comment": "club_comments"}[kind]
    r = client.post(f"/api/v1/ops/targets/{kind}/{target_id}/hide", json=REASON, headers=ops["A"])
    assert r.status_code == 200
    assert one(db_engine, f"SELECT status FROM {table} WHERE id = :i", i=target_id) == "hidden"
    expected_target = {"guestbook": {"guestbook_id": target_id}, "club": {"club_id": club_id},
                       "club_comment": {"club_id": club_id}}[kind]
    assert [i.target for i in inbox_of(db_engine, B)] == [expected_target]  # 댓글 id는 dedupe_key에만

    r = client.post(f"/api/v1/ops/targets/{kind}/{target_id}/restore", json=REASON, headers=ops["A"])
    restored = "closed" if kind == "club" else "published"
    assert r.json()["status"] == restored
    assert one(db_engine, f"SELECT status FROM {table} WHERE id = :i", i=target_id) == restored
    assert [a.action for a in actions(db_engine)] == ["hide", "restore"]


def test_restore_is_idempotent_and_rehide_notifies_again(client, ops, db_engine):
    post_id = seed(db_engine)
    path = f"/api/v1/ops/targets/post/{post_id}"
    assert client.post(path + "/restore", json=REASON, headers=ops["A"]).json()["status"] == "published"
    assert actions(db_engine) == []  # 숨김이 아니면 무변경
    client.post(path + "/hide", json=REASON, headers=ops["A"])
    client.post(path + "/restore", json=REASON, headers=ops["A"])
    client.post(path + "/restore", json=REASON, headers=ops["A"])
    client.post(path + "/hide", json=REASON, headers=ops["A"])
    assert [a.action for a in actions(db_engine)] == ["hide", "restore", "hide"]
    assert len(inbox_of(db_engine, B)) == 2  # 다시 숨기면 다시 알린다


def test_canceled_club_restores_to_canceled(client, ops, db_engine):
    club_id = seed_club(db_engine, status="canceled", cancel_reason="사정이 생겼어요")
    client.post(f"/api/v1/ops/targets/club/{club_id}/hide", json=REASON, headers=ops["A"])
    r = client.post(f"/api/v1/ops/targets/club/{club_id}/restore", json=REASON, headers=ops["A"])
    assert r.json()["status"] == "canceled"


def test_hide_missing_or_withdrawn_target_is_404(client, ops, db_engine):
    withdrawn = seed(db_engine, status="withdrawn")
    for path in (f"/api/v1/ops/targets/post/{uuid4()}/hide", f"/api/v1/ops/targets/post/{withdrawn}/hide",
                 f"/api/v1/ops/targets/post/{uuid4()}/restore"):
        assert client.post(path, json=REASON, headers=ops["A"]).status_code == 404
    assert one(db_engine, "SELECT status FROM posts WHERE id = :i", i=withdrawn) == "withdrawn"
    assert actions(db_engine) == []


@pytest.mark.parametrize("body", [{}, {"reason": ""}, {"reason": "   "}, {"reason": "x" * 501},
                                  {"reason": "ok", "extra": 1}])
def test_ops_without_reason_is_422(client, ops, db_engine, body):
    post_id = seed(db_engine)
    r = client.post(f"/api/v1/ops/targets/post/{post_id}/hide", json=body, headers=ops["A"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert one(db_engine, "SELECT status FROM posts WHERE id = :i", i=post_id) == "published"
    assert actions(db_engine) == []


def test_unknown_target_kind_is_422_for_operator(client, ops, db_engine):
    r = client.post(f"/api/v1/ops/targets/user/{uuid4()}/hide", json=REASON, headers=ops["A"])
    assert r.status_code == 422


# ─────────── 신고 ───────────


def test_reports_list_and_dismiss(client, ops, db_engine):
    post_id = seed(db_engine, overlay=None)
    rid = seed_report(db_engine, "post", post_id)
    items = client.get("/api/v1/ops/reports", headers=ops["A"]).json()["items"]
    assert [(i["id"], i["target_status"], i["target_preview"]) for i in items] == [(rid, "published", "본문")]

    r = client.post(f"/api/v1/ops/reports/{rid}/resolve", json=REASON, headers=ops["A"])
    assert r.json() == {"id": rid, "status": "dismissed"}
    assert client.get("/api/v1/ops/reports", headers=ops["A"]).json()["items"] == []
    assert [i["id"] for i in client.get("/api/v1/ops/reports?status=dismissed", headers=ops["A"]).json()["items"]] == [rid]
    assert one(db_engine, "SELECT status FROM posts WHERE id = :i", i=post_id) == "published"  # 기각은 대상 그대로
    client.post(f"/api/v1/ops/reports/{rid}/resolve", json=REASON, headers=ops["A"])  # 연타
    assert [(a.action, a.target_kind) for a in actions(db_engine)] == [("dismiss", "report")]
    assert inbox_of(db_engine, A) == [] and inbox_of(db_engine, B) == []
    assert client.post(f"/api/v1/ops/reports/{uuid4()}/resolve", json=REASON, headers=ops["A"]).status_code == 404


# ─────────── 모임 댓글 운영 요청 ───────────


def test_decide_delete_and_restrict(client, ops, db_engine):
    club_id = seed_club(db_engine, host=A)
    comment_id = seed_comment(db_engine, club_id, user=B)
    req = seed_request(db_engine, comment_id)
    assert [i["id"] for i in client.get("/api/v1/ops/club-comment-requests", headers=ops["A"]).json()["items"]] == [req]

    body = {"decision": "delete_and_restrict", "restriction_ends_at": FUTURE, **REASON}
    r = client.post(f"/api/v1/ops/club-comment-requests/{req}/decide", json=body, headers=ops["A"])
    assert r.status_code == 200 and r.json()["status"] == "delete_and_restrict"
    assert one(db_engine, "SELECT status FROM club_comments WHERE id = :i", i=comment_id) == "deleted"
    rows = q(db_engine, "SELECT user_id, reason_kind, source_id, ends_at FROM participation_restrictions")
    assert [(x.user_id, x.reason_kind, str(x.source_id)) for x in rows] == [(B, "comment", req)]
    assert r.json()["restriction_id"] is not None
    assert q(db_engine, "SELECT decided_by FROM club_comment_requests")[0].decided_by == A
    # 한 트랜잭션이라 created_at(now())이 같다 — 순서 말고 구성만 본다
    assert sorted(a.action for a in actions(db_engine)) == ["comment_delete", "restrict"]

    # 이미 결정: 다른 결정을 보내도 무변경
    r = client.post(f"/api/v1/ops/club-comment-requests/{req}/decide",
                    json={"decision": "rejected", **REASON}, headers=ops["A"])
    assert r.json() == {"id": req, "status": "delete_and_restrict", "restriction_id": None}
    assert len(actions(db_engine)) == 2


@pytest.mark.parametrize("days", [1, 3, 7, None])
def test_comment_restriction_period_and_participation(client, ops, db_engine, days):
    club = seed_club(db_engine, host=A)
    past_club = seed_club(db_engine, host=A)
    own_club = seed_club(db_engine, host=B)
    one(db_engine, "UPDATE clubs SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' "
                   "WHERE id = :c RETURNING id", c=past_club)
    with db_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO club_participations (club_id, user_id, state) "
            "VALUES (:club, :u, 'joined'), (:past, :u, 'joined'), (:own, :u, 'joined')"
        ), {"club": club, "past": past_club, "own": own_club, "u": B})
    req = seed_request(db_engine, seed_comment(db_engine, club))
    decision = f"/api/v1/ops/club-comment-requests/{req}/decide"
    response = client.post(decision, json={**REASON, "decision": "delete_and_restrict", "restriction_days": days},
                           headers=ops["A"])
    assert response.status_code == 200
    rid = response.json()["restriction_id"]
    restriction = q(db_engine, "SELECT starts_at, ends_at FROM participation_restrictions WHERE id = :i", i=rid)[0]
    if days is None:
        assert restriction.ends_at is None
    else:
        assert abs((restriction.ends_at - restriction.starts_at) - timedelta(days=days)) < timedelta(seconds=2)
    states = dict(q(db_engine, "SELECT CAST(club_id AS text), state FROM club_participations WHERE user_id = :u", u=B))
    assert states == {club: "removed", past_club: "joined", own_club: "joined"}
    assert inbox_of(db_engine, B) == [("moderation", {"club_id": club})]
    assert inbox_of(db_engine, A) == []
    participation = f"/api/v1/clubs/{club}/participation"
    assert client.put(participation, headers=ops["B"]).status_code == 403
    assert client.post(f"/api/v1/ops/restrictions/{rid}/lift", json=REASON, headers=ops["A"]).status_code == 200
    assert client.put(participation, headers=ops["B"]).status_code == 200


def test_operator_can_read_first_review_explanation(client, ops, db_engine):
    club = seed_club(db_engine, host=A)
    req = seed_request(db_engine, seed_comment(db_engine, club))
    rid = one(db_engine, "INSERT INTO participation_restrictions (user_id, reason_kind, source_id, reason_text) "
                        "VALUES (:u, 'comment', :s, '사유') RETURNING id", u=B, s=req)
    url = f"/api/v1/me/restrictions/{rid}/review-request"
    first = client.post(url, json={"text": "  재검토 부탁드립니다. "}, headers=ops["B"])
    duplicate = client.post(url, json={"text": "다른 글"}, headers=ops["B"])
    assert (first.status_code, duplicate.status_code) == (201, 200)
    assert "review_text" not in first.json()
    listing = "/api/v1/ops/restrictions?state=review"
    assert client.get(listing, headers=ops["B"]).status_code == 404
    items = client.get(listing, headers=ops["A"]).json()["items"]
    assert [(item["id"], item["review_text"]) for item in items] == [(str(rid), "재검토 부탁드립니다.")]
    active = client.get("/api/v1/ops/restrictions?state=active", headers=ops["A"]).json()["items"]
    assert active[0]["id"] == str(rid) and "review_text" not in active[0]


def test_decide_delete_only_and_rejected(client, ops, db_engine):
    club_id = seed_club(db_engine, host=A)
    c1, c2 = seed_comment(db_engine, club_id), seed_comment(db_engine, club_id)
    r1, r2 = seed_request(db_engine, c1), seed_request(db_engine, c2)
    client.post(f"/api/v1/ops/club-comment-requests/{r1}/decide", json={"decision": "delete_only", **REASON},
                headers=ops["A"])
    client.post(f"/api/v1/ops/club-comment-requests/{r2}/decide", json={"decision": "rejected", **REASON},
                headers=ops["A"])
    assert one(db_engine, "SELECT status FROM club_comments WHERE id = :i", i=c1) == "deleted"
    assert one(db_engine, "SELECT status FROM club_comments WHERE id = :i", i=c2) == "published"
    assert one(db_engine, "SELECT count(*) FROM participation_restrictions") == 0
    assert [(a.action, a.target_kind) for a in actions(db_engine)] == [
        ("comment_delete", "club_comment"), ("dismiss", "club_comment_request")]


@pytest.mark.parametrize("body", [
    {"decision": "delete_and_restrict"},  # 기간 없음
    {"decision": "delete_only", "restriction_ends_at": FUTURE},  # 제한 아닌데 기간
    {"decision": "delete_and_restrict", "restriction_ends_at": PAST},  # 지난 시각
    {"decision": "delete_and_restrict", "restriction_days": 2},
    {"decision": "delete_and_restrict", "restriction_days": None, "restriction_ends_at": FUTURE},
    {"decision": "delete_only", "restriction_days": None},
    {"decision": "approve"},
])
def test_decide_bad_body_is_422(client, ops, db_engine, body):
    club_id = seed_club(db_engine, host=A)
    req = seed_request(db_engine, seed_comment(db_engine, club_id))
    r = client.post(f"/api/v1/ops/club-comment-requests/{req}/decide", json={**REASON, **body}, headers=ops["A"])
    assert r.status_code == 422
    assert one(db_engine, "SELECT status FROM club_comment_requests WHERE id = :i", i=req) == "pending"


# ─────────── 참가 제한 ───────────


def test_create_and_lift_restriction(client, ops, db_engine):
    club_id = seed_club(db_engine, host=A)
    body = {"user_id": str(B), "reason_kind": "no_show", "source_id": club_id, "reason": "연락 없이 불참",
            "ends_at": None}
    r = client.post("/api/v1/ops/restrictions", json=body, headers=ops["A"])
    assert r.status_code == 201
    rid = r.json()["id"]
    assert r.json()["ends_at"] is None and r.json()["lifted_at"] is None
    r2 = client.post("/api/v1/ops/restrictions", json=body, headers=ops["A"])  # 연타
    assert r2.status_code == 200 and r2.json()["id"] == rid
    assert one(db_engine, "SELECT count(*) FROM participation_restrictions") == 1

    assert client.get("/api/v1/ops/restrictions", headers=ops["A"]).json()["items"] == []  # 재검토 요청 없음
    one(db_engine, "UPDATE participation_restrictions SET review_requested_at = now() RETURNING id")
    assert [i["id"] for i in client.get("/api/v1/ops/restrictions", headers=ops["A"]).json()["items"]] == [rid]

    r = client.post(f"/api/v1/ops/restrictions/{rid}/lift", json=REASON, headers=ops["A"])
    assert r.status_code == 200 and r.json()["lifted_at"] is not None
    client.post(f"/api/v1/ops/restrictions/{rid}/lift", json=REASON, headers=ops["A"])  # 연타
    assert q(db_engine, "SELECT lifted_by FROM participation_restrictions")[0].lifted_by == A
    assert [a.action for a in actions(db_engine)] == ["restrict", "lift"]
    assert client.get("/api/v1/ops/restrictions?state=active", headers=ops["A"]).json()["items"] == []
    # 해제 뒤 같은 원인으로 다시 만들 수 있다
    assert client.post("/api/v1/ops/restrictions", json=body, headers=ops["A"]).status_code == 201


def test_create_restriction_checks_user_source_and_time(client, ops, db_engine):
    club_id = seed_club(db_engine, host=A)
    base = {"user_id": str(B), "reason_kind": "no_show", "source_id": club_id, "reason": "불참", "ends_at": None}
    assert client.post("/api/v1/ops/restrictions", json={**base, "user_id": str(uuid4())},
                       headers=ops["A"]).status_code == 404
    assert client.post("/api/v1/ops/restrictions", json={**base, "source_id": str(uuid4())},
                       headers=ops["A"]).status_code == 404
    assert client.post("/api/v1/ops/restrictions", json={**base, "reason_kind": "comment"},
                       headers=ops["A"]).status_code == 404  # 모임 id는 댓글 요청 id가 아님
    assert client.post("/api/v1/ops/restrictions", json={**base, "ends_at": PAST}, headers=ops["A"]).status_code == 422
    no_ends = {k: v for k, v in base.items() if k != "ends_at"}
    assert client.post("/api/v1/ops/restrictions", json=no_ends, headers=ops["A"]).status_code == 422
    assert one(db_engine, "SELECT count(*) FROM participation_restrictions") == 0
    assert actions(db_engine) == []


# ─────────── 표 제약·RLS ───────────


def test_moderation_action_check_and_rls(db_engine, auth):
    with pytest.raises(IntegrityError):
        with db_engine.begin() as c:
            c.execute(text("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id, reason) "
                           "VALUES (:a, 'ban', 'user', 'x', 'r')"), {"a": A})
    tables = ["operators", "moderation_actions", "guestbook_entries", "clubs", "club_participations",
              "club_comments", "reports", "club_comment_requests", "participation_restrictions"]
    rows = q(db_engine, "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(:t)", t=tables)
    assert {r.relname: r.relrowsecurity for r in rows} == {t: True for t in tables}
    assert one(db_engine, "SELECT count(*) FROM pg_policies WHERE tablename = ANY(:t)", t=tables) == 0


def test_restore_template_race_leaves_one_published_and_audits_only_success(
    client, ops, db_engine, monkeypatch, clean_template_logs,
):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    from app.routers import ops as ops_router

    log = new_log(client, ops["B"])
    first = client.post(POSTS, headers=ops["B"], json=template_body(log))
    assert first.status_code == 201, first.text
    old_id = first.json()["id"]
    prefix = f"/api/v1/ops/targets/post/{old_id}"
    assert client.post(f"{prefix}/hide", headers=ops["A"], json=REASON).status_code == 200

    original = ops_router.set_status
    entered, release = Event(), Event()

    def pause_restore(*args):
        entered.set()
        assert release.wait(5)
        return original(*args)

    monkeypatch.setattr(ops_router, "set_status", pause_restore)
    before_actions = actions(db_engine)
    with ThreadPoolExecutor(max_workers=1) as pool:
        restoring = pool.submit(client.post, f"{prefix}/restore", headers=ops["A"], json=REASON)
        try:
            assert entered.wait(5)
            second = client.post(POSTS, headers=ops["B"], json=template_body(log, image_value="ink"))
            assert second.status_code == 201, second.text
        finally:
            release.set()
        conflict = restoring.result(timeout=5)

    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["error"]["code"] == "ALREADY_PUBLISHED"
    assert conflict.json()["error"]["message"] == "같은 독서 기록에서 이미 공개된 다른 게시물이 있어요."
    assert [(str(row.id), row.status) for row in q(
        db_engine, "SELECT id, status FROM posts WHERE reading_log_id = :log ORDER BY status", log=log,
    )] == [(old_id, "hidden"), (second.json()["id"], "published")]
    assert actions(db_engine) == before_actions
