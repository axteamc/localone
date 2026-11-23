"""C-78 시연 시드와 실제 PostgreSQL·FastAPI 피드 연결."""

import json
import os
import subprocess
import sys
from collections import Counter
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.demo_seed import BOOK_POSTS, apply_plan, build_plan, local_database
from app.main import create_app
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID

AUTHOR = UUID(USER_A_ID)
REQUIRED_ROWS = (
    ("24010", "계림꿈나무도서관", "동구 경양로247번길 26"),
    ("24010", "전남광주통합특별시교육청중앙도서관", "동구 장동로 23-16"),
    ("24010", "광주광역시립산수도서관", "동구 경양로 355"),
    ("24030", "광주남구문화정보도서관", "남구 봉선로 208"),
    ("24030", "광주광역시립사직도서관", "남구 제중로 56"),
    ("24030", "전남광주통합특별시교육청금호평생교육관", "남구 중앙로 15"),
    ("24040", "전남광주통합특별시 북구 중흥도서관", "북구 당뫼로 39"),
    ("24040", "광주광역시립무등도서관", "북구 면앙로 130"),
)


def add_library(conn, slot, code, district, name, address, lat=35.1765283, lng=126.9253482):
    conn.execute(text(
        "INSERT INTO libraries (id, provider_lib_code, name, address, dtl_region_code, region_code, "
        "latitude, longitude, content_hash) OVERRIDING SYSTEM VALUE "
        "VALUES (:id,:code,:name,:addr,:district,:region,:lat,:lng,'demo-test')"
    ), {"id": 78_000 + slot, "code": code, "district": district, "region": district[:2], "name": name, "addr": address,
        "lat": lat, "lng": lng})


@pytest.fixture
def catalog(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:uid)"), {"uid": AUTHOR})
        for index, (district, name, address) in enumerate(REQUIRED_ROWS, start=1):
            add_library(conn, index, f"demo-test-{index}", district, name, f"광주광역시 {address}")
        # 구 안은 반경 밖도 포함하고, 반경 안이라도 타 시도는 제외한다.
        add_library(conn, 9, "demo-test-far-dong", "24010", "동구 먼 도서관", "광주 동구", lat=35.12)
        add_library(conn, 10, "demo-test-near-seo", "24020", "서구 가까운 도서관", "광주 서구", lat=35.20345)
        add_library(conn, 11, "demo-test-far-seo", "24020", "서구 먼 도서관", "광주 서구", lat=35.2036)
        add_library(conn, 12, "demo-test-other", "36010", "타 시도 도서관", "전남", lat=35.177)
        conn.execute(text(
            "INSERT INTO books (isbn13, title, source, description, pub_year) "
            "VALUES (:isbn, :title, 'manual', '소개', 2021) ON CONFLICT (isbn13) DO NOTHING"
        ), [{"isbn": isbn, "title": f"시연 도서 {index}"} for index, (isbn, _, _) in enumerate(BOOK_POSTS, start=1)])
    yield
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE users CASCADE"))
        conn.execute(text("DELETE FROM libraries WHERE content_hash = 'demo-test'"))
        conn.execute(text("DELETE FROM books WHERE source = 'manual' AND title LIKE '시연 도서 %'"))


def plan_for(engine):
    with engine.connect() as conn:
        return build_plan(conn, AUTHOR)


def snapshot(engine):
    with engine.connect() as conn:
        return {table: conn.execute(text(f"SELECT * FROM {table} ORDER BY id")).all()
                for table in ("posts", "guestbook_entries", "clubs")}


def cli(url, *args):
    return subprocess.run(
        [sys.executable, "-m", "app.demo_seed", "--author", str(AUTHOR), *args],
        env={**os.environ, "DEMO_SEED_DATABASE_URL": url, "PYTHONUTF8": "1"},
        capture_output=True, text=True, encoding="utf-8", check=False,
    )


def test_preview_then_apply_and_repeat_preserves_entire_rows(catalog, db_engine, test_db_url):
    preview = cli(test_db_url)
    assert preview.returncode == 0, preview.stderr
    plan = json.loads(preview.stdout)
    required = {f"demo-test-{i}" for i in range(1, 9)}
    assert set(plan["required_codes"].values()) == required
    assert set(plan["nearby_codes"]) == required | {"demo-test-near-seo"}
    assert {row["code"] for row in plan["targets"]} == required | {"demo-test-far-dong", "demo-test-near-seo"}
    assert {book["isbn"] for book in plan["books"]} == {isbn for isbn, _, _ in BOOK_POSTS}
    assert not any(snapshot(db_engine).values())
    first = cli(test_db_url, "--apply")
    assert first.returncode == 0, first.stderr
    assert json.loads(first.stdout.splitlines()[-1])["inserted"] == {"post": 50, "guestbook": 10, "club": 10}
    seeded = snapshot(db_engine)
    assert Counter(row.library_id for row in seeded["posts"]) == Counter(
        {row.library_id: 5 for row in seeded["clubs"]}
    )
    assert {row.library_id for row in seeded["guestbook_entries"]} == {row.library_id for row in seeded["clubs"]}
    assert all(row.status == "published" and row.book_id and row.body.startswith("[시연]") for row in seeded["posts"])
    assert len({row.book_id for row in seeded["posts"]}) == 5
    assert all(row.status == "published" and row.body.startswith("[시연]") for row in seeded["guestbook_entries"])
    assert all(row.name.startswith("[시연]") and row.status == "open" and row.starts_at is None
               and row.ends_at is None and row.place is None for row in seeded["clubs"])
    with db_engine.begin() as conn:
        assert conn.execute(text("SELECT count(*) FROM club_participations")).scalar_one() == 0
        conn.execute(text("UPDATE posts SET status = 'withdrawn' WHERE id = :id"), {"id": seeded["posts"][0].id})
        conn.execute(text("UPDATE posts SET status = 'hidden' WHERE id = :id"), {"id": seeded["posts"][1].id})
        conn.execute(text("UPDATE guestbook_entries SET status = 'withdrawn' WHERE id = :id"),
                     {"id": seeded["guestbook_entries"][0].id})
        conn.execute(text("UPDATE guestbook_entries SET status = 'hidden' WHERE id = :id"),
                     {"id": seeded["guestbook_entries"][1].id})
        conn.execute(text("UPDATE clubs SET status = 'canceled', cancel_reason = '시연 취소' WHERE id = :id"),
                     {"id": seeded["clubs"][0].id})
        conn.execute(text("UPDATE clubs SET status = 'hidden' WHERE id = :id"), {"id": seeded["clubs"][1].id})
    before = snapshot(db_engine)
    repeated = cli(test_db_url, "--apply")
    assert repeated.returncode == 0, repeated.stderr
    report = json.loads(repeated.stdout.splitlines()[-1])
    assert report["inserted"] == {"post": 0, "guestbook": 0, "club": 0}
    assert report["existing"] == {"post": 50, "guestbook": 10, "club": 10}
    assert snapshot(db_engine) == before


@pytest.mark.parametrize(("fault", "error"), [
    ("missing", "필수 관 계림꿈나무도서관 식별 실패"),
    ("ambiguous", "후보 코드: demo-test-1, demo-test-duplicate"),
    ("coordinates", "무등도서관 좌표 누락"),
    ("book", "시연 도서 ISBN 확인 실패"),
    ("author", "활성 시연 계정"),
])
def test_preflight_faults_never_write(catalog, db_engine, test_db_url, fault, error):
    with db_engine.begin() as conn:
        if fault == "missing":
            conn.execute(text("UPDATE libraries SET address = '광주광역시 서구' WHERE provider_lib_code = 'demo-test-1'"))
        elif fault == "ambiguous":
            add_library(conn, 13, "demo-test-duplicate", *REQUIRED_ROWS[0])
        elif fault == "coordinates":
            conn.execute(text("UPDATE libraries SET latitude=NULL, longitude=NULL WHERE provider_lib_code='demo-test-8'"))
        elif fault == "book":
            conn.execute(text("UPDATE books SET isbn13 = '9780000000000' WHERE isbn13 = :isbn"),
                         {"isbn": BOOK_POSTS[0][0]})
        elif fault == "author":
            conn.execute(text("DELETE FROM users WHERE id=:uid"), {"uid": AUTHOR})
    try:
        result = cli(test_db_url, "--apply")
        assert result.returncode == 2
        assert error in result.stderr
        assert not any(snapshot(db_engine).values())
    finally:
        if fault == "book":
            with db_engine.begin() as conn:
                conn.execute(text("UPDATE books SET isbn13 = :isbn WHERE isbn13 = '9780000000000'"),
                             {"isbn": BOOK_POSTS[0][0]})


def test_last_insert_failure_rolls_back_one_library_and_allows_retry(catalog, db_engine, capsys):
    plan = plan_for(db_engine)
    blocked = plan.libraries[0]
    with db_engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE clubs ADD CONSTRAINT demo_test_block CHECK (library_id <> {blocked.id})"))
    try:
        assert not apply_plan(db_engine, plan, AUTHOR)
        errors, summary = map(json.loads, capsys.readouterr().out.splitlines())
        assert errors["code"] == blocked.provider_lib_code
        assert summary["failed"] == {"post": 5, "guestbook": 1, "club": 1}
        assert summary["inserted"] == {"post": 45, "guestbook": 9, "club": 9}
        assert all(blocked.id not in {row.library_id for row in rows} for rows in snapshot(db_engine).values())
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("ALTER TABLE clubs DROP CONSTRAINT demo_test_block"))
    assert apply_plan(db_engine, plan, AUTHOR)
    summary = json.loads(capsys.readouterr().out)
    assert summary["inserted"] == {"post": 5, "guestbook": 1, "club": 1}
    assert summary["existing"] == {"post": 45, "guestbook": 9, "club": 9}


@pytest.mark.parametrize("url", [
    "", "postgresql+psycopg://test@remote.example:5432/demo",
    "postgresql+psycopg://test@localhost/demo",
    "postgresql+psycopg://test@127.0.0.1:5432/demo?hostaddr=192.0.2.1",
])
def test_local_database_rejects_implicit_or_remote_destinations(url):
    with pytest.raises(ValueError):
        local_database(url)


def test_seed_posts_and_visit_cards_link_to_details_and_club_join(catalog, db_engine, test_db_url,
                                                          fake_jwks_client, make_token):
    plan = plan_for(db_engine)
    assert apply_plan(db_engine, plan, AUTHOR)
    mudeung_code = plan.required_codes["광주 무등도서관"]
    library = next(row for row in plan.libraries if row.provider_lib_code == mudeung_code)
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    with TestClient(app) as client:
        def read(path):
            response = client.get(f"/api/v1{path}")
            assert response.status_code == 200, response.text
            return response.json()

        items = read(f"/libraries/{library.id}/posts")["items"]
        assert len(items) == 5 and all(post["library_id"] == library.id for post in items)
        detail = read(f"/posts/{items[0]['id']}")
        assert detail["body"].startswith("[시연]")
        isbn = detail["book"]["isbn13"]
        assert read(f"/books/{isbn}")["isbn13"] == isbn

        mixed = read(f"/libraries/{library.id}/feed")["items"]
        assert Counter(card["kind"] for card in mixed) == {"post": 5, "guestbook": 1, "club": 1}
        assert {card["post"]["id"] for card in mixed if card["kind"] == "post"} == {post["id"] for post in items}
        club_id = next(card["club"]["id"] for card in mixed if card["kind"] == "club")
        club = read(f"/clubs/{club_id}")
        assert club["library"]["id"] == library.id and club["status"] == "open"
        assert club["starts_at"] is None and club["place"] is None and club["participants"] == []

        headers = {"Authorization": f"Bearer {make_token(sub=USER_B_ID)}"}
        assert client.post("/api/v1/auth/session", headers=headers).status_code == 200
        joined = client.put(f"/api/v1/clubs/{club_id}/participation", headers=headers)
        assert joined.status_code == 200, joined.text
        assert read(f"/clubs/{club_id}")["participant_count"] == 1
