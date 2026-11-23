"""CLUB-1-P1: 모임 만들기·보기·고치기·마감·취소·댓글·피드 카드 — book-club 계약 CLUB-1 C2·C3·C5·C6·P5."""

from datetime import datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.common import now_kst
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

LIB_1 = 101
USER_C_ID = "00000000-0000-4000-8000-00000000000c"
ISBN = "9788936434120"


@pytest.fixture
def clean_clubs(db_engine):
    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM inbox_items"))
            conn.execute(text("DELETE FROM club_comments"))
            conn.execute(text("DELETE FROM club_participations"))
            conn.execute(text("DELETE FROM clubs"))
            conn.execute(text("DELETE FROM posts"))
            conn.execute(text("DELETE FROM guestbook_entries"))

    clean()
    yield
    clean()


@pytest.fixture
def client(test_db_url, fake_jwks_client, public_reference_data, clean_clubs):
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client, make_token):
    headers = {}
    for name, uid in (("A", USER_A_ID), ("B", USER_B_ID), ("C", USER_C_ID)):
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


@pytest.fixture
def book(db_engine):
    """책 조회가 외부로 나가지 않도록 소개·연도까지 채운 책을 미리 넣는다(get_book 캐시)."""
    with db_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO books (isbn13, title, author, publisher, source, description, pub_year) "
            "VALUES (:isbn, '소년이 온다', '한강', '창비', 'kakao', '소개', 2014) "
            "ON CONFLICT (isbn13) DO UPDATE SET description = '소개', pub_year = 2014"), {"isbn": ISBN})
    return ISBN


def at(minutes: int) -> str:
    return (now_kst() + timedelta(minutes=minutes)).isoformat(timespec="seconds")


def create(client, headers, rid=None, library_id=LIB_1, **fields):
    body = {"name": "소년이 온다 같이 읽기", "client_request_id": str(rid or uuid4())}
    body.update(fields)
    return client.post(f"/api/v1/libraries/{library_id}/clubs", json=body, headers=headers)


def new_club(client, headers, **fields) -> str:
    response = create(client, headers, **fields)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def set_times(db_engine, club_id: str, starts: datetime | None, ends: datetime | None = None) -> None:
    """시각이 지난 상황을 만든다(서버 시계를 바꾸지 않고 모임 시각을 옮긴다)."""
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET starts_at = :s, ends_at = :e WHERE id = :id"),
                     {"s": starts, "e": ends, "id": club_id})


def club_row(db_engine, club_id: str):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT * FROM clubs WHERE id = :id"), {"id": club_id}).one()


def count(db_engine, table: str, where: str = "true", **args) -> int:
    with db_engine.connect() as conn:
        return conn.execute(text(f"SELECT count(*) FROM {table} WHERE {where}"), args).scalar_one()


def join(client, headers, club_id):
    return client.put(f"/api/v1/clubs/{club_id}/participation", headers=headers)


def comment(client, headers, club_id, body="토요일 오후 어때요?", rid=None):
    return client.post(f"/api/v1/clubs/{club_id}/comments",
                       json={"body": body, "client_request_id": str(rid or uuid4())}, headers=headers)


def error(response) -> tuple[int, str, str]:
    e = response.json()["error"]
    return response.status_code, e["code"], e["detail"]


# ─────────── 만들기·보기 ───────────


def test_create_returns_club_and_undecided_schedule_is_allowed(client, auth, db_engine):
    response = create(client, auth["A"])
    assert response.status_code == 201
    club = response.json()
    assert set(club) == {"id", "library", "name", "intro", "book", "place", "starts_at", "ends_at", "capacity",
                         "status", "cancel_reason", "host_nickname", "is_host", "participant_count",
                         "participants", "my_participation", "previous_club_id"}
    assert club["library"] == {"id": LIB_1, "name": "정독도서관"}
    assert club["starts_at"] is None and club["place"] is None  # 미정 게시(K1-2)
    assert club["status"] == "open" and club["is_host"] is True and club["participant_count"] == 0
    assert club["my_participation"] == "none"


def test_create_with_book_and_schedule(client, auth, book):
    starts, ends = at(60 * 24), at(60 * 26)
    club = create(client, auth["A"], isbn13=book, place=" 2층 세미나실 ", starts_at=starts, ends_at=ends,
                  capacity=6, intro="같이 읽어요").json()
    assert club["book"]["isbn13"] == ISBN and club["book"]["title"] == "소년이 온다"
    assert club["place"] == "2층 세미나실" and club["capacity"] == 6
    assert club["starts_at"] == starts and club["starts_at"].endswith("+09:00")


def test_create_and_comment_are_idempotent_by_client_request_id(client, auth, db_engine):
    rid = uuid4()
    first, second = create(client, auth["A"], rid=rid), create(client, auth["A"], rid=rid)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    assert count(db_engine, "clubs") == 1
    crid = uuid4()
    c1, c2 = comment(client, auth["B"], first.json()["id"], rid=crid), comment(client, auth["B"], first.json()["id"], rid=crid)
    assert (c1.status_code, c2.status_code) == (201, 200) and c1.json()["id"] == c2.json()["id"]
    assert count(db_engine, "club_comments") == 1


def test_club_writes_require_auth(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    assert create(client, {}).status_code == 401
    assert join(client, {}, club_id).status_code == 401
    assert comment(client, {}, club_id).status_code == 401
    assert count(db_engine, "clubs") == 1
    assert count(db_engine, "club_participations") == 0 and count(db_engine, "club_comments") == 0


def test_club_text_lengths_are_enforced_with_field_detail(client, auth, db_engine):
    cases = [({"name": "가" * 41}, "name"), ({"name": "   "}, "name"), ({"intro": "가" * 501}, "intro"),
             ({"place": "가" * 101}, "place")]
    for fields, field in cases:
        assert error(create(client, auth["A"], **fields)) == (422, "VALIDATION_ERROR", field)
    assert count(db_engine, "clubs") == 0
    ok = create(client, auth["A"], name="가" * 40, intro="가" * 500, place="가" * 100)
    assert ok.status_code == 201
    club_id = ok.json()["id"]
    assert error(comment(client, auth["B"], club_id, body="가" * 301)) == (422, "VALIDATION_ERROR", "body")
    assert comment(client, auth["B"], club_id, body="가" * 300).status_code == 201
    long_reason = client.post(f"/api/v1/clubs/{club_id}/cancel", json={"reason": "가" * 201}, headers=auth["A"])
    assert error(long_reason) == (422, "VALIDATION_ERROR", "reason")
    assert club_row(db_engine, club_id).status == "open"
    assert count(db_engine, "club_comments") == 1


def test_db_rejects_overlong_text_directly(db_engine, client, auth):
    club_id = new_club(client, auth["A"])
    with pytest.raises(IntegrityError), db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET name = :n WHERE id = :id"), {"n": "가" * 41, "id": club_id})
    with pytest.raises(IntegrityError), db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET place = :n WHERE id = :id"), {"n": "가" * 101, "id": club_id})


def test_end_must_be_after_start(client, auth, db_engine):
    assert error(create(client, auth["A"], starts_at=at(120), ends_at=at(60))) == (422, "VALIDATION_ERROR", "ends_at")
    assert count(db_engine, "clubs") == 0


def test_missing_or_hidden_club_is_not_found(client, auth, db_engine):
    missing = str(uuid4())
    hidden = new_club(client, auth["A"])
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'hidden' WHERE id = :id"), {"id": hidden})
    for club_id in (missing, hidden):
        assert error(client.get(f"/api/v1/clubs/{club_id}"))[:2] == (404, "NOT_FOUND")
        assert error(join(client, auth["B"], club_id))[:2] == (404, "NOT_FOUND")
        assert error(comment(client, auth["B"], club_id))[:2] == (404, "NOT_FOUND")
    assert count(db_engine, "club_participations") == 0 and count(db_engine, "club_comments") == 0


def test_participants_expose_nickname_only(client, auth):
    club_id = new_club(client, auth["A"])
    join(client, auth["B"], club_id)
    seen_by_b = client.get(f"/api/v1/clubs/{club_id}", headers=auth["B"]).json()
    anonymous = client.get(f"/api/v1/clubs/{club_id}").json()
    assert seen_by_b["participants"] == [{"nickname": seen_by_b["participants"][0]["nickname"], "is_me": True}]
    assert set(seen_by_b["participants"][0]) == {"nickname", "is_me"}
    assert "user_id" not in str(seen_by_b) and "host_id" not in str(seen_by_b)
    assert anonymous["is_host"] is False and anonymous["my_participation"] == "none"
    assert anonymous["participants"][0]["is_me"] is False


# ─────────── 고치기·마감·취소 (만든 사람만) ───────────


def test_only_host_can_edit_close_cancel(client, auth, db_engine):
    club_id = new_club(client, auth["A"], place="2층")
    before = club_row(db_engine, club_id)
    for response in (
        client.patch(f"/api/v1/clubs/{club_id}", json={"place": "3층"}, headers=auth["B"]),
        client.post(f"/api/v1/clubs/{club_id}/close", headers=auth["B"]),
        client.post(f"/api/v1/clubs/{club_id}/cancel", json={"reason": "사정"}, headers=auth["B"]),
    ):
        assert error(response)[:2] == (403, "NOT_HOST")
    after = club_row(db_engine, club_id)
    assert (after.place, after.status, after.cancel_reason) == (before.place, before.status, before.cancel_reason)


def test_patch_keeps_unsent_fields(client, auth, db_engine):
    starts = at(60 * 24)
    club_id = new_club(client, auth["A"], place="2층", starts_at=starts, capacity=6, intro="소개")
    response = client.patch(f"/api/v1/clubs/{club_id}", json={"place": "3층 열람실"}, headers=auth["A"])
    assert response.status_code == 200
    club = response.json()
    assert club["place"] == "3층 열람실"
    assert (club["name"], club["starts_at"], club["capacity"], club["intro"]) == ("소년이 온다 같이 읽기", starts, 6, "소개")


def test_start_time_cannot_change_after_start_but_place_can(client, auth, db_engine):
    club_id = new_club(client, auth["A"], place="2층")
    started_at = now_kst() - timedelta(minutes=10)
    set_times(db_engine, club_id, started_at, now_kst() + timedelta(hours=2))
    moved = client.patch(f"/api/v1/clubs/{club_id}", json={"starts_at": at(60)}, headers=auth["A"])
    assert error(moved)[:2] == (409, "CLUB_STARTED")
    assert club_row(db_engine, club_id).starts_at == started_at
    placed = client.patch(f"/api/v1/clubs/{club_id}", json={"place": "3층"}, headers=auth["A"])
    assert placed.status_code == 200 and placed.json()["place"] == "3층"
    ends = client.patch(f"/api/v1/clubs/{club_id}", json={"ends_at": at(180)}, headers=auth["A"])
    assert ends.status_code == 200


def inbox_kinds(db_engine) -> list[tuple[str, str]]:
    with db_engine.connect() as conn:
        return sorted((str(r.recipient_id), r.kind) for r in conn.execute(
            text("SELECT recipient_id, kind FROM inbox_items")).all())


def test_confirm_and_change_notify_joined_participants(client, auth, db_engine):
    club_id = new_club(client, auth["A"])  # 미정
    for who in ("B", "C"):
        assert join(client, auth[who], club_id).status_code == 200
    confirmed = client.patch(f"/api/v1/clubs/{club_id}", json={"starts_at": at(60 * 24)}, headers=auth["A"])
    assert confirmed.status_code == 200
    assert inbox_kinds(db_engine) == sorted([(USER_B_ID, "club_confirmed"), (USER_C_ID, "club_confirmed")])
    # C가 떠난 뒤 장소를 바꾸면 B만 안내
    assert client.delete(f"/api/v1/clubs/{club_id}/participation", headers=auth["C"]).status_code == 200
    client.patch(f"/api/v1/clubs/{club_id}", json={"place": "3층"}, headers=auth["A"])
    client.patch(f"/api/v1/clubs/{club_id}", json={"place": "4층"}, headers=auth["A"])
    changed = [k for k in inbox_kinds(db_engine) if k[1] == "club_changed"]
    assert changed == [(USER_B_ID, "club_changed"), (USER_B_ID, "club_changed")]  # 바뀔 때마다, 떠난 사람 제외
    # 이름만 바꾸면 안내 없음
    before = len(inbox_kinds(db_engine))
    client.patch(f"/api/v1/clubs/{club_id}", json={"name": "새 이름"}, headers=auth["A"])
    assert len(inbox_kinds(db_engine)) == before


def test_cancel_requires_reason_and_keeps_record(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    join(client, auth["B"], club_id)
    blank = client.post(f"/api/v1/clubs/{club_id}/cancel", json={"reason": "  "}, headers=auth["A"])
    assert error(blank) == (422, "VALIDATION_ERROR", "reason")
    assert club_row(db_engine, club_id).status == "open"
    done = client.post(f"/api/v1/clubs/{club_id}/cancel", json={"reason": "사정이 생겼어요"}, headers=auth["A"])
    again = client.post(f"/api/v1/clubs/{club_id}/cancel", json={"reason": "다시"}, headers=auth["A"])
    assert done.status_code == 200 and again.status_code == 200
    assert done.json()["status"] == "canceled" and done.json()["cancel_reason"] == "사정이 생겼어요"
    assert again.json()["cancel_reason"] == "사정이 생겼어요"
    assert inbox_kinds(db_engine) == [(USER_B_ID, "club_canceled")]
    feed = client.get(f"/api/v1/libraries/{LIB_1}/feed").json()["items"]
    assert [i["club"]["status"] for i in feed if i["kind"] == "club"] == ["canceled"]  # 카드 남음 "취소됨"


def test_close_is_host_only_and_idempotent(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    first = client.post(f"/api/v1/clubs/{club_id}/close", headers=auth["A"])
    second = client.post(f"/api/v1/clubs/{club_id}/close", headers=auth["A"])
    assert first.status_code == second.status_code == 200 and second.json()["status"] == "closed"
    assert error(join(client, auth["B"], club_id))[:2] == (409, "CLUB_CLOSED")


# ─────────── 댓글 ───────────


def test_comments_open_to_anyone_signed_in_and_list_without_user_id(client, auth):
    club_id = new_club(client, auth["A"])
    assert comment(client, auth["C"], club_id).status_code == 201  # 참가하지 않아도(K1-9)
    listed = client.get(f"/api/v1/clubs/{club_id}/comments", headers=auth["C"]).json()
    assert [set(i) for i in listed["items"]] == [{"id", "body", "author_nickname", "created_at", "mine"}]
    assert listed["items"][0]["mine"] is True and listed["next_cursor"] is None
    assert client.get(f"/api/v1/clubs/{club_id}/comments").json()["items"][0]["mine"] is False


def test_comments_page_by_created_at_then_id(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    same = now_kst() - timedelta(minutes=5)
    ids = []
    with db_engine.begin() as conn:
        for body in ("하나", "둘", "셋"):
            ids.append(str(conn.execute(text(
                "INSERT INTO club_comments (club_id, user_id, body, client_request_id, created_at) "
                "VALUES (:c, :u, :b, :r, :t) RETURNING id"),
                {"c": club_id, "u": USER_B_ID, "b": body, "r": uuid4(), "t": same}).scalar_one()))
    first = client.get(f"/api/v1/clubs/{club_id}/comments", params={"limit": 2}).json()
    second = client.get(f"/api/v1/clubs/{club_id}/comments",
                        params={"limit": 2, "cursor": first["next_cursor"]}).json()
    seen = [i["id"] for i in first["items"]] + [i["id"] for i in second["items"]]
    assert seen == sorted(ids) and second["next_cursor"] is None
    bad = client.get(f"/api/v1/clubs/{club_id}/comments", params={"cursor": "!!"})
    assert error(bad) == (422, "VALIDATION_ERROR", "cursor")


def test_comment_delete_is_author_only(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    comment_id = comment(client, auth["B"], club_id).json()["id"]
    assert error(client.delete(f"/api/v1/club-comments/{comment_id}", headers=auth["C"]))[:2] == (404, "NOT_FOUND")
    assert count(db_engine, "club_comments", "status = 'published'") == 1
    assert client.delete(f"/api/v1/club-comments/{comment_id}", headers=auth["B"]).status_code == 204
    assert client.delete(f"/api/v1/club-comments/{comment_id}", headers=auth["B"]).status_code == 404
    assert client.get(f"/api/v1/clubs/{club_id}/comments").json()["items"] == []


# ─────────── #32 피드 카드 ───────────


def test_club_card_appears_in_library_feed(client, auth, db_engine):
    starts = at(60 * 24)
    club_id = new_club(client, auth["A"], place="2층", starts_at=starts, capacity=6)
    join(client, auth["B"], club_id)
    items = client.get(f"/api/v1/libraries/{LIB_1}/feed").json()["items"]
    clubs = [i for i in items if i["kind"] == "club"]
    assert len(clubs) == 1
    card = clubs[0]["club"]
    assert set(card) == {"id", "library_id", "name", "starts_at", "place", "status", "participant_count",
                         "capacity", "published_at"}
    assert (card["id"], card["starts_at"], card["participant_count"], card["capacity"]) == (club_id, starts, 1, 6)
    other = client.get("/api/v1/libraries/102/feed").json()["items"]
    assert [i for i in other if i["kind"] == "club"] == []


def test_feed_merges_clubs_with_other_kinds_by_time_across_pages(client, auth, db_engine):
    base = now_kst() - timedelta(hours=1)
    with db_engine.begin() as conn:
        for i in range(3):
            conn.execute(text(
                "INSERT INTO clubs (library_id, host_id, name, client_request_id, created_at) "
                "VALUES (:lib, :u, :n, :r, :t)"),
                {"lib": LIB_1, "u": USER_A_ID, "n": f"모임{i}", "r": uuid4(), "t": base + timedelta(minutes=i * 2)})
            conn.execute(text(
                "INSERT INTO guestbook_entries (user_id, library_id, body, client_request_id, published_at) "
                "VALUES (:u, :lib, :b, :r, :t)"),
                {"lib": LIB_1, "u": USER_B_ID, "b": f"방명록{i}", "r": uuid4(), "t": base + timedelta(minutes=i * 2 + 1)})
    seen, cursor = [], None
    while True:
        page = client.get(f"/api/v1/libraries/{LIB_1}/feed", params={"limit": 2, "cursor": cursor}).json()
        seen += [(i["kind"], (i.get("club") or i.get("guestbook"))["id"]) for i in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    kinds = [k for k, _ in seen]
    assert kinds == ["guestbook", "club"] * 3  # 시각 내림차순으로 번갈아
    assert len(set(seen)) == 6


def test_hidden_club_is_not_in_feed(client, auth, db_engine):
    club_id = new_club(client, auth["A"])
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE clubs SET status = 'hidden' WHERE id = :id"), {"id": club_id})
    assert [i for i in client.get(f"/api/v1/libraries/{LIB_1}/feed").json()["items"] if i["kind"] == "club"] == []
