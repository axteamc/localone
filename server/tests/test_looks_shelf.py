"""M2-0-P3: 도서관 룩(Z6)·서가 테마(Z7)·책장 #31(Z8) — core 계약 M2-0 C2·C3·C5·C6·P5.

A = 운영자, B = 일반 이용자. 101·102·103은 서로 5km 안(1km·2km·4km 지점), 104는 좌표 없음.
"""

from datetime import timedelta
from unittest.mock import Mock

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.common import now_kst, today_kst
from app.services import provider_engine as pe
from app.services.theme_holdings import HoldingsTarget, replace_holdings
from app.settings import Settings
from tests.provider_fakes import FakeBookSearch, FakeLibraryData, public_reference_data  # noqa: F401
from tests.test_feed import auth, books, client  # noqa: F401  (픽스처)
from tests.test_lib_engine import NOW, book, engine, isbn, reference_db, run, seed_book  # noqa: F401
from tests.test_ops import REASON, ops, q  # noqa: F401  (픽스처)
from tests.test_yes24_curated import FakeYes24Provider, make_yes24_item, yes24_db  # noqa: F401

NEW_LIB = 106  # 시험 중에만 있는 "새 도서관"(101에서 1.5km)
BOOK_KEYS = {"isbn13", "title", "author", "cover_url"}
PAGE_KEYS = {"kind", "title", "basis_label", "books"}


@pytest.fixture(autouse=True)
def clean_looks_and_themes(db_engine, public_reference_data, reference_db):
    def clean():
        with db_engine.begin() as c:
            c.execute(text("DELETE FROM library_holdings_snapshots"))
            c.execute(text("DELETE FROM shelf_theme_books"))
            c.execute(text("DELETE FROM shelf_themes"))
            c.execute(text("DELETE FROM library_return_stats"))
            c.execute(text("DELETE FROM curated_books_cache WHERE list_kind = 'bestseller'"))  # #31 ① (C-92)
            c.execute(text("DELETE FROM libraries WHERE id = :id"), {"id": NEW_LIB})
            c.execute(text("UPDATE libraries SET look = NULL, look_assigned_by = NULL"))

    clean()
    with db_engine.begin() as c:
        previous_regions = c.execute(text(
            "SELECT id, region_code FROM libraries WHERE id IN (101,102,103)"
        )).mappings().all()
        c.execute(text("UPDATE libraries SET region_code = '11' WHERE id IN (101,102)"))
        c.execute(text("UPDATE libraries SET region_code = '24' WHERE id = 103"))
    yield
    clean()
    with db_engine.begin() as c:
        c.execute(text("UPDATE libraries SET region_code = :region_code WHERE id = :id"), previous_regions)


@pytest.fixture
def seeded(reference_db):
    """책 5권(isbn(0)~isbn(4)) → book_id 목록."""
    return [seed_book(reference_db, index=i).id for i in range(5)]


def use_providers(client, reference_db, library=None, books=None, yes24=None):
    client.app.state.provider_engine = pe.ProviderEngine(
        reference_db, pe.Providers(books=books, library_data=library, yes24=yes24), now_fn=lambda: NOW)


def bestseller(count=5, start=20):
    """YES24 베스트셀러 가짜(isbn은 TEST 접두사, 책장 ①)."""
    return FakeYes24Provider(pe.Yes24CuratedPage([make_yes24_item(start + i, sort_order=i + 1) for i in range(count)]))


def looks(db_engine) -> dict[int, tuple[str | None, str | None]]:
    return {r.id: (r.look, r.look_assigned_by)
            for r in q(db_engine, "SELECT id, look, look_assigned_by FROM libraries WHERE id IN (101,102,103,104,106)")}


def actions(db_engine) -> list:
    return q(db_engine, "SELECT action, target_kind, target_id, reason FROM moderation_actions ORDER BY created_at, id")


def add_return_stats(db_engine, library_id: int, book_id: int, days_ago: int, count: int) -> None:
    with db_engine.begin() as c:
        c.execute(text("INSERT INTO library_return_stats (library_id, book_id, returned_on, return_count) "
                       "VALUES (:l, :b, :d, :n)"),
                  {"l": library_id, "b": book_id, "d": today_kst() - timedelta(days=days_ago), "n": count})


def add_holdings(db_engine, library_id: int, book_ids: list[int], age_hours: int = 0) -> None:
    with db_engine.begin() as c:
        for book_id in book_ids:
            params = {"b": book_id, "l": library_id, "at": now_kst() - timedelta(hours=age_hours)}
            c.execute(text("""
                INSERT INTO library_holdings_snapshots (book_id, region_code, fetched_at)
                SELECT :b, region_code, :at FROM libraries WHERE id = :l ON CONFLICT DO NOTHING
                """), params)
            c.execute(text("""
                INSERT INTO library_holdings_cache (book_id, region_code, library_id)
                SELECT :b, region_code, id FROM libraries WHERE id = :l
                """), params)


def theme_body(library_id=None, title="겨울에 읽는 책", start=0, end=10, isbns=(0, 1), **extra):
    today = today_kst()
    return {"library_id": library_id, "title": title,
            "starts_on": (today + timedelta(days=start)).isoformat(),
            "ends_on": (today + timedelta(days=end)).isoformat(),
            "isbn13s": [isbn(i) for i in isbns], **REASON, **extra}


def shelf(client, library_id=101):
    return client.get(f"/api/v1/libraries/{library_id}/shelf")


# ─────────── 룩 (Z6) ───────────


def test_look_stays_once_assigned_and_differs_when_two_or_fewer_nearby(client, db_engine):
    first = {lib: client.get(f"/api/v1/libraries/{lib}").json()["look"] for lib in (101, 102, 103)}
    # 주변에 배정된 곳이 2곳 이하일 때마다 남은 팔레트를 고른다 → 셋 다 다름, modern은 자동으로 나오지 않음
    assert len(set(first.values())) == 3 and set(first.values()) == {"warm", "toffee", "oxford"}
    assert all(by == "auto" for lib, (_, by) in looks(db_engine).items() if lib in first)

    with db_engine.begin() as c:
        c.execute(text("""
            INSERT INTO libraries (id, provider_lib_code, name, latitude, longitude, dtl_region_code, content_hash)
            OVERRIDING SYSTEM VALUE VALUES (:id, 'test-look-new', '새도서관', :lat, 0, '11010', 'test')"""),
                  {"id": NEW_LIB, "lat": 1.5 / 111.195})
    new_look = client.get(f"/api/v1/libraries/{NEW_LIB}").json()["look"]
    assert new_look in {"warm", "toffee", "oxford"}
    # 새 도서관이 생겨도 기존 값은 그대로, 다시 읽어도 그대로
    assert {lib: client.get(f"/api/v1/libraries/{lib}").json()["look"] for lib in (101, 102, 103)} == first
    assert client.get(f"/api/v1/libraries/{NEW_LIB}").json()["look"] == new_look


def test_look_ignores_libraries_beyond_5km(client, db_engine):
    taken = client.get("/api/v1/libraries/101").json()["look"]
    with db_engine.begin() as c:
        c.execute(text("""
            INSERT INTO libraries (id, provider_lib_code, name, latitude, longitude, dtl_region_code, content_hash)
            OVERRIDING SYSTEM VALUE VALUES (:id, 'test-look-new', '먼도서관', :lat, 0, '11010', 'test')"""),
                  {"id": NEW_LIB, "lat": 7.5 / 111.195})  # 101에서 6.5km
    assert client.get(f"/api/v1/libraries/{NEW_LIB}").json()["look"] == taken  # 주변 없음 → 같은 첫 값


def test_look_without_coordinates_is_assigned_and_unknown_is_404(client, db_engine):
    assert client.get("/api/v1/libraries/104").json()["look"] in {"warm", "toffee", "oxford"}
    assert client.get("/api/v1/libraries/999999999").status_code == 404
    assert looks(db_engine)[104][1] == "auto"


def test_operator_can_only_set_modern_or_reassign(client, ops, db_engine):
    auto = client.get("/api/v1/libraries/101").json()["look"]
    put = lambda body, lib=101: client.put(f"/api/v1/ops/libraries/{lib}/look", json=body, headers=ops["A"])  # noqa: E731

    for bad in ("warm", "toffee", "oxford", "neon"):
        r = put({"look": bad, **REASON})
        assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert put({"look": "modern"}).status_code == 422  # 사유 없음
    assert put({"look": "modern", "reason": "   "}).status_code == 422
    assert actions(db_engine) == [] and looks(db_engine)[101] == (auto, "auto")

    r = put({"look": "modern", **REASON})
    assert r.status_code == 200 and r.json() == {"library_id": 101, "look": "modern", "look_assigned_by": "operator"}
    assert client.get("/api/v1/libraries/101").json()["look"] == "modern"
    assert put({"look": "modern", **REASON}).status_code == 200  # 연타: 무변경
    assert actions(db_engine) == [("look_assign", "library", "101", "운영 기준 위반")]

    # 재배정: 지금 주변 기준으로 다시 자동(주변에 아무도 배정 안 됐으니 처음 값과 같음)
    r = put({"look": "auto", **REASON})
    assert r.status_code == 200 and r.json() == {"library_id": 101, "look": auto, "look_assigned_by": "auto"}
    assert put({"look": "auto", **REASON}).status_code == 200  # 같은 결과: 무변경
    assert len(actions(db_engine)) == 2

    # 주변이 바뀐 뒤 재배정하면 바뀐다: 102가 101과 같은 값을 갖게 만들고 102를 재배정
    with db_engine.begin() as c:
        c.execute(text("UPDATE libraries SET look = :l, look_assigned_by = 'auto' WHERE id = 102"), {"l": auto})
    r = put({"look": "auto", **REASON}, lib=102)
    assert r.status_code == 200 and r.json()["look"] != auto
    assert [a.action for a in actions(db_engine)] == ["look_assign"] * 3

    assert put({"look": "modern", **REASON}, lib=999999999).status_code == 404
    assert put({"look": "modern", **REASON}, lib=0).status_code == 422


def test_look_ops_are_404_for_non_operators(client, auth, db_engine):
    for headers in (auth["B"], {}):
        r = client.put("/api/v1/ops/libraries/101/look", json={"look": "modern", **REASON}, headers=headers)
        assert r.status_code == 404
        assert client.post("/api/v1/ops/shelf-themes", json=theme_body(), headers=headers).status_code == 404
        r = client.put("/api/v1/ops/shelf-themes/00000000-0000-0000-0000-000000000000",
                       json=theme_body(), headers=headers)
        assert r.status_code == 404
    assert actions(db_engine) == [] and q(db_engine, "SELECT id FROM shelf_themes") == []


# ─────────── 책장 #31 (Z8) ───────────


def test_shelf_omits_empty_pages(client, reference_db, seeded, ops, db_engine):
    use_providers(client, reference_db, library=FakeLibraryData())  # 인기: 도서관·전국 모두 데이터 없음
    r = shelf(client)
    assert r.status_code == 200 and r.json() == {"pages": []}

    # C-92: 앱 반납 집계(library_return_stats)는 더 이상 책장에 쓰지 않는다(Q-49 보류로 쌓이지 않던 이전 ①)
    add_return_stats(reference_db, 101, seeded[0], 1, 9)
    # 끝난 테마·아직 시작 전 테마·다른 도서관 테마
    for body in (theme_body(start=-10, end=-1), theme_body(start=1, end=5, title="곧"), theme_body(library_id=102)):
        assert client.post("/api/v1/ops/shelf-themes", json=body, headers=ops["A"]).status_code == 201
    assert shelf(client).json() == {"pages": []}
    with db_engine.begin() as c:  # 책이 하나도 없는 활성 테마(DB 직접) → 페이지 없음
        c.execute(text("INSERT INTO shelf_themes (library_id, title, starts_on, ends_on) "
                       "VALUES (101, '빈 테마', :d, :d)"), {"d": today_kst()})
    assert shelf(client).json() == {"pages": []}


def test_shelf_full_pages_order_and_shape(client, reference_db, seeded, ops, yes24_db):
    fake = FakeLibraryData(popular={"test-101": [book(i) for i in range(5)]})
    yes24 = bestseller()
    use_providers(client, reference_db, library=fake, yes24=yes24)
    add_return_stats(reference_db, 101, seeded[4], 1, 6)  # 반납 집계는 무시(C-92)
    assert client.post("/api/v1/ops/shelf-themes", json=theme_body(isbns=(2, 0)), headers=ops["A"]).status_code == 201
    add_holdings(reference_db, 101, [seeded[2], seeded[0]])

    pages = shelf(client).json()["pages"]
    assert [p["kind"] for p in pages] == ["popular", "theme", "recent_reads"]  # ① 인기 → ② 테마 → ③ 최근 대출
    assert all(set(p) == PAGE_KEYS and 1 <= len(p["books"]) <= 4 for p in pages)
    assert all(set(b) == BOOK_KEYS for p in pages for b in p["books"])
    popular, theme, recent = pages
    assert popular["title"] == "화제의 책" and popular["basis_label"] == "YES24 베스트셀러"
    assert [b["isbn13"] for b in popular["books"]] == [item.isbn13 for item in yes24.curated_page.items[:4]]
    assert theme == {"kind": "theme", "title": "겨울에 읽는 책", "basis_label": None,
                     "books": [{"isbn13": isbn(2), "title": "이식 도서 002", "author": None, "cover_url": None},
                               {"isbn13": isbn(0), "title": "이식 도서 000", "author": None, "cover_url": None}]}
    assert recent["title"] == "요즘 사람들이 읽고 간 책" and recent["basis_label"] == "정독도서관 · 최근 30일 대출"
    assert [b["isbn13"] for b in recent["books"]] == [isbn(0), isbn(1), isbn(2), isbn(3)]
    # 두 캐시 모두: 다시 읽어도 외부 조회 한 번(YES24 베스트셀러 목록 1회, 정보나루 도서관별 1회)
    assert shelf(client).json()["pages"] == pages and len(fake.calls) == 1
    assert [call[0] for call in yes24.calls] == ["curated_list"]
    assert yes24.calls[0][1][0] == "bestseller"


def test_shelf_bestseller_failure_omits_page_and_keeps_stale_cache(client, reference_db, yes24_db, db_engine):
    use_providers(client, reference_db, library=FakeLibraryData(), yes24=FakeYes24Provider(pe.ProviderError("down")))
    assert shelf(client).json() == {"pages": []}  # 캐시 없음 + 실패 → ① 뺌(빈 성공으로 꾸미지 않음)
    use_providers(client, reference_db, library=FakeLibraryData(), yes24=bestseller(count=2))
    first, = shelf(client).json()["pages"]
    assert first["kind"] == "popular" and len(first["books"]) == 2
    with db_engine.begin() as c:  # 어제 받은 캐시로 만든다 → 오늘 실패하면 오래된 캐시를 쓴다
        c.execute(text("UPDATE curated_books_cache SET fetched_at = fetched_at - interval '1 day' "
                       "WHERE list_kind = 'bestseller'"))
    use_providers(client, reference_db, library=FakeLibraryData(), yes24=FakeYes24Provider(pe.ProviderError("down")))
    assert shelf(client).json()["pages"] == [first]
    use_providers(client, reference_db, library=FakeLibraryData(), yes24=None)  # 키 없음도 오래된 캐시
    assert shelf(client).json()["pages"] == [first]


def test_yes24_cli_isbns_feed_shelf_theme_with_confirmed_holdings(
    client, ops, yes24_db, test_db_url, monkeypatch, capsys, request,
):
    items = [make_yes24_item(i, sort_order=rank) for rank, i in enumerate((3, 2, 1), 1)]
    yes24 = FakeYes24Provider(pe.Yes24CuratedPage(items))
    holdings_page = Mock(side_effect=lambda isbn13, region, page, size: pe.HoldingsPage(
        page, size, 0 if isbn13 == items[1].isbn13 else 1,
        () if isbn13 == items[1].isbn13 else ("test-101",),
    ))
    providers = pe.Providers(yes24=yes24, library_data=Mock(holdings_page=holdings_page))
    monkeypatch.setattr("app.settings.get_settings", lambda: Settings(
        app_env="test", database_url=test_db_url,
    ))
    monkeypatch.setattr(pe, "build_providers", lambda _settings: providers)

    assert pe._main(["sync-yes24-curated", "--print-isbns"]) == 0
    isbns = capsys.readouterr().out.splitlines()
    assert isbns == [item.isbn13 for item in items]
    theme = client.post(
        "/api/v1/ops/shelf-themes", json=theme_body(isbn13s=isbns), headers=ops["A"],
    )
    assert theme.status_code == 201

    def clean_theme():
        with yes24_db.begin() as conn:
            conn.execute(text("DELETE FROM library_holdings_snapshots"))
            conn.execute(text("DELETE FROM shelf_theme_books"))
            conn.execute(text("DELETE FROM shelf_themes"))

    request.addfinalizer(clean_theme)
    assert shelf(client).json() == {"pages": []}
    assert pe._main(["sync-theme-holdings", "--region", "11"]) == 0
    assert holdings_page.call_count == len(isbns)
    pages = shelf(client).json()["pages"]
    assert [page["kind"] for page in pages] == ["theme"]
    assert [book["isbn13"] for book in pages[0]["books"]] == [isbns[0], isbns[2]]
    assert shelf(client, 102).json() == {"pages": []}


def test_shelf_library_theme_wins_over_common(client, reference_db, seeded, ops):
    use_providers(client, reference_db, library=FakeLibraryData())
    common = theme_body(title="모두의 테마", isbns=(0, 2))
    mine = theme_body(library_id=101, title="정독 테마", isbns=(1,), priority=3)
    for body in (common, mine):
        assert client.post("/api/v1/ops/shelf-themes", json=body, headers=ops["A"]).status_code == 201
    add_holdings(reference_db, 101, [seeded[0], seeded[1], seeded[2]])
    add_holdings(reference_db, 102, [seeded[0], seeded[2]])
    assert [p["title"] for p in shelf(client, 101).json()["pages"]] == ["정독 테마"]
    assert [p["title"] for p in shelf(client, 102).json()["pages"]] == ["모두의 테마"]


def test_shelf_uses_first_eligible_priority_and_four_confirmed_books(client, reference_db, ops):
    ids = [seed_book(reference_db, index=i).id for i in range(10)]
    use_providers(client, reference_db, library=FakeLibraryData())
    headers = ops["A"]
    for body in (
        theme_body(library_id=101, title="미적재 전용", isbns=(9,)),
        theme_body(title="한 권만 확인", isbns=(0, 1)),
        theme_body(title="채택", isbns=(0, 2, 3, 4, 5, 6, 7), priority=2),
        theme_body(title="후순위", isbns=(2, 3), priority=3),
    ):
        assert client.post("/api/v1/ops/shelf-themes", json=body, headers=headers).status_code == 201
    add_holdings(reference_db, 101, [ids[i] for i in (0, 2, 4, 5, 6, 7)])
    add_holdings(reference_db, 101, [ids[3]], age_hours=72)
    add_holdings(reference_db, 102, [ids[1], ids[9]])
    assert shelf(client, 102).json()["pages"] == []
    page, = shelf(client).json()["pages"]
    assert page["title"] == "채택"
    assert [b["isbn13"] for b in page["books"]] == [isbn(i) for i in (0, 2, 4, 5)]


def test_shelf_filters_comics_and_series_before_slicing_and_preserves_recommendations(client, reference_db):
    candidates = [
        pe.BookInfo(isbn(0), "분류된 그림책", class_name="학습만화"),
        pe.BookInfo(isbn(1), "1984"),
        pe.BookInfo(isbn(2), "백앤아 ３"),
        pe.BookInfo(isbn(3), "백앤아카이브"),
        pe.BookInfo(isbn(7), "흔한남매의 흔한 호기심 5"),  # 제목 앞부분 목록(P8)
        pe.BookInfo(isbn(8), "그림 이야기", class_name="예술 > 회화 > 만화"),  # 경로로 온 분류
        book(4),
        book(5),
        book(6),
    ]
    fake = FakeLibraryData(popular={"test-101": candidates})
    use_providers(client, reference_db, library=fake)
    expected = [isbn(i) for i in (1, 3, 4, 5)]
    for _ in range(2):
        page, = shelf(client).json()["pages"]
        assert page["kind"] == "recent_reads" and page["title"] == "요즘 사람들이 읽고 간 책"
        assert [b["isbn13"] for b in page["books"]] == expected
    r = client.get("/api/v1/books/recommendations", params={"library_id": 101})
    assert [b["isbn13"] for b in r.json()["books"]] == [b.isbn13 for b in candidates]
    assert len(fake.calls) == 1


def test_shelf_recent_loans_is_library_only(client, reference_db, seeded):
    # ③ 최근 대출: 도서관 데이터 실패 → 엔진은 전국으로 대체하지만 책장은 "이 도서관"이라 뺀다
    fake = FakeLibraryData(popular={"test-101": pe.ProviderError("offline"), None: [book(0)]})
    use_providers(client, reference_db, library=fake)
    assert shelf(client).json() == {"pages": []}
    use_providers(client, reference_db, library=None)  # 제공자 없음(503) → 책장은 200, 페이지만 없음
    r = shelf(client)
    assert r.status_code == 200 and r.json() == {"pages": []}


@pytest.mark.parametrize("id_,status", [(999999999, 404), (0, 422), (2**63, 422)])
def test_shelf_unknown_library(client, id_, status):
    assert shelf(client, id_).status_code == status


def test_shelf_has_no_user_identifiers(client, reference_db, seeded, ops):
    use_providers(client, reference_db, library=FakeLibraryData())
    add_return_stats(reference_db, 101, seeded[0], 0, 3)
    assert client.post("/api/v1/ops/shelf-themes", json=theme_body(), headers=ops["A"]).status_code == 201
    raw = shelf(client).text
    for key in ("user_id", "loan_id", "actor_id", "reason", "return_count"):
        assert key not in raw


# ─────────── 서가 테마 운영 (Z7 · C6) ───────────


def test_theme_create_is_idempotent_and_overlap_is_409(client, reference_db, seeded, ops, db_engine):
    post = lambda body: client.post("/api/v1/ops/shelf-themes", json=body, headers=ops["A"])  # noqa: E731
    r = post(theme_body())
    assert r.status_code == 201
    created = r.json()
    assert set(created) == {"id", "library_id", "title", "starts_on", "ends_on", "priority", "basis_label", "books"}
    assert created["priority"] == 1
    assert created["library_id"] is None and [b["isbn13"] for b in created["books"]] == [isbn(0), isbn(1)]
    r = post(theme_body())  # 연타
    assert r.status_code == 200 and r.json() == created
    assert actions(db_engine) == [("theme_edit", "shelf_theme", created["id"], "운영 기준 위반")]

    for clash in (theme_body(title="다른 이름"), theme_body(start=10, end=20), theme_body(isbns=(1, 0))):
        r = post(clash)
        assert r.status_code == 409 and r.json()["error"]["code"] == "THEME_OVERLAP"
    # 다른 범위(도서관별)는 같은 기간이어도 된다, 같은 범위라도 기간이 안 겹치면 된다
    assert post(theme_body(library_id=101)).status_code == 201
    assert post(theme_body(start=11, end=20)).status_code == 201
    assert len(q(db_engine, "SELECT id FROM shelf_themes")) == 3 and len(actions(db_engine)) == 3


@pytest.mark.parametrize("override,field", [
    ({"reason": " "}, "reason"),
    ({"title": "  "}, "title"),
    ({"title": "가" * 41}, "title"),
    ({"isbn13s": []}, "isbn13s"),
    ({"library_id": 101, "isbn13s": [isbn(i) for i in range(4)]}, "isbn13s"),
    ({"isbn13s": [isbn(i) for i in range(21)]}, "isbn13s"),
    ({"priority": "2"}, "priority"),
    ({"priority": True}, "priority"),
    ({"priority": None}, "priority"),
    ({"priority": 4}, "priority"),
    ({"isbn13s": [isbn(0), isbn(0)]}, "isbn13s"),
    ({"isbn13s": ["9780000000000"]}, "isbn13s"),
    ({"library_id": 0}, "library_id"),
    ({"extra": 1}, "extra"),
])
def test_theme_validation(client, reference_db, seeded, ops, db_engine, override, field):
    r = client.post("/api/v1/ops/shelf-themes", json={**theme_body(), **override}, headers=ops["A"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert r.json()["error"]["detail"] == field
    assert q(db_engine, "SELECT id FROM shelf_themes") == [] and actions(db_engine) == []


def test_common_theme_twenty_and_put_omitted_priority(client, reference_db, ops, db_engine):
    for i in range(20):
        seed_book(reference_db, index=i)
    path = "/api/v1/ops/shelf-themes"
    headers = ops["A"]
    assert client.post(path, json=theme_body(), headers=headers).status_code == 201
    body = theme_body(title="후보 20권", isbns=tuple(range(20)), priority=2)
    r = client.post(path, json=body, headers=headers)
    assert r.status_code == 201 and len(r.json()["books"]) == 20
    row = r.json()
    del body["priority"]
    assert client.put(f"{path}/{row['id']}", json=body, headers=headers).json() == row
    assert client.put(f"{path}/{row['id']}", json={**body, "priority": 1}, headers=headers).status_code == 409
    assert len(actions(db_engine)) == 2


def test_theme_period_and_required_keys(client, reference_db, seeded, ops, db_engine):
    post = lambda body: client.post("/api/v1/ops/shelf-themes", json=body, headers=ops["A"])  # noqa: E731
    assert post(theme_body(start=3, end=2)).status_code == 422  # 끝이 시작보다 앞
    for key in ("library_id", "starts_on", "ends_on"):  # 기간 필수(Q-47 임시), 범위 키도 꼭
        body = theme_body()
        del body[key]
        assert post(body).status_code == 422
    assert post(theme_body(start=2, end=2)).status_code == 201  # 하루짜리
    with db_engine.begin() as c, pytest.raises(IntegrityError):
        c.execute(text("INSERT INTO shelf_themes (title, starts_on, ends_on) VALUES ('x', '2026-01-02', '2026-01-01')"))


def test_theme_unknown_library_or_book(client, reference_db, seeded, ops, db_engine):
    post = lambda body: client.post("/api/v1/ops/shelf-themes", json=body, headers=ops["A"])  # noqa: E731
    assert post(theme_body(library_id=999999999)).status_code == 404
    use_providers(client, reference_db, books=FakeBookSearch())  # 제공자도 모르는 ISBN
    r = post(theme_body(isbns=(0, 9)))
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    assert q(db_engine, "SELECT id FROM shelf_themes") == [] and actions(db_engine) == []


def test_theme_put_replaces_and_checks_overlap(client, reference_db, seeded, ops, db_engine):
    post = lambda body: client.post("/api/v1/ops/shelf-themes", json=body, headers=ops["A"])  # noqa: E731
    first = post(theme_body()).json()
    second = post(theme_body(start=11, end=20, title="둘째")).json()
    put = lambda tid, body: client.put(f"/api/v1/ops/shelf-themes/{tid}", json=body, headers=ops["A"])  # noqa: E731

    r = put(first["id"], theme_body(title="고친 이름", isbns=(3,), end=5))
    assert r.status_code == 200
    assert r.json()["title"] == "고친 이름" and [b["isbn13"] for b in r.json()["books"]] == [isbn(3)]
    assert r.json()["ends_on"] == (today_kst() + timedelta(days=5)).isoformat()
    assert put(first["id"], theme_body(title="고친 이름", isbns=(3,), end=5)).status_code == 200  # 같은 내용
    assert len(actions(db_engine)) == 3

    r = put(first["id"], theme_body(end=12))  # 둘째와 겹침
    assert r.status_code == 409 and r.json()["error"]["code"] == "THEME_OVERLAP"
    assert put(second["id"], theme_body(start=11, end=20, title="둘째", library_id=101)).status_code == 200  # 범위 옮김
    assert put(first["id"], theme_body(end=12)).status_code == 200  # 이제 안 겹침
    assert put("00000000-0000-0000-0000-000000000000", theme_body(start=40, end=41)).status_code == 404
    assert put(first["id"], theme_body(library_id=999999999)).status_code == 404
    assert [a.action for a in actions(db_engine)] == ["theme_edit"] * 5
    add_holdings(reference_db, 101, [seeded[0], seeded[1]])
    assert [b["isbn13"] for b in shelf(client).json()["pages"][0]["books"]] == [isbn(0), isbn(1)]


# ─────────── 소장 배치 ───────────


def test_holdings_provider_uses_isbn_and_parses_page(monkeypatch):
    client = pe.Data4LibraryClient("fake", "https://example.test", 5)

    def response(operation, params):
        assert operation == "libSrchByBook"
        assert params == {"isbn": isbn(0), "region": "11", "pageNo": 1, "pageSize": 100}
        return {"pageNo": "1", "pageSize": "100", "numFound": "1", "resultNum": "1",
                "libs": [{"lib": {"libCode": "011123"}}]}

    monkeypatch.setattr(client, "_get", response)
    page = client.holdings_page(isbn(0), "11", 1, 100)
    assert page == pe.HoldingsPage(1, 100, 1, ("011123",))


def test_holdings_batch_preserves_partial_then_replaces_and_reuses(reference_db, seeded, monkeypatch):
    with reference_db.begin() as c:
        theme_id = c.execute(text("""
            INSERT INTO shelf_themes (title, starts_on, ends_on) VALUES ('활성', :d, :d) RETURNING id
            """), {"d": today_kst(NOW)}).scalar_one()
        c.execute(text("INSERT INTO shelf_theme_books VALUES (:t, :b, 1)"), {"t": theme_id, "b": seeded[0]})
    add_holdings(reference_db, 101, [seeded[0]], age_hours=96)
    calls = []

    class Provider:
        def holdings_page(self, isbn13, region, page, size):
            calls.append((isbn13, region, page))
            usage, = q(reference_db, "SELECT call_count FROM provider_daily_usage "
                       "WHERE provider = 'data4library' AND usage_date = :day", day=today_kst(NOW))
            assert usage.call_count == len(calls)
            if page == 2:
                raise pe.ProviderError("interrupted")
            return pe.HoldingsPage(1, 1, 2, ("test-102",))

    provider = Provider()
    worker = engine(reference_db, library=provider)
    status, report = run(worker.sync_theme_holdings(["11"], max_calls=1))
    assert status == 1 and report["stop_reason"] == "run_limit"
    assert report["regions"]["11"]["unprocessed"] == 1
    status, report = run(worker.sync_theme_holdings(["11"]))
    assert status == 1 and report["regions"]["11"]["failed"] == 1
    assert calls == [(isbn(0), "11", 1), (isbn(0), "11", 1), (isbn(0), "11", 2)]
    assert q(reference_db, "SELECT library_id FROM library_holdings_cache") == [(101,)]

    with monkeypatch.context() as patch:
        patch.setattr(pe.policy, "DATA4LIBRARY_DAILY_LIMIT", 3)
        status, report = run(worker.sync_theme_holdings(["11"]))
        assert status == 1 and report["stop_reason"] == "daily_limit"
        assert report["requests"] == 0 and len(calls) == 3

    class FullProvider:
        def holdings_page(self, isbn13, region, page, size):
            return pe.HoldingsPage(page, 1, 2, (("test-102", "test-103")[page - 1],))

    status, report = run(engine(reference_db, library=FullProvider()).sync_theme_holdings(["11"]))
    assert status == 0 and report["regions"]["11"]["unmatched_codes"] == 1
    assert q(reference_db, "SELECT library_id FROM library_holdings_cache") == [(102,)]
    with reference_db.begin() as c:
        c.execute(text("UPDATE library_holdings_snapshots SET fetched_at = now() - interval '4 days'"))

    class EmptyProvider:
        def holdings_page(self, isbn13, region, page, size):
            return pe.HoldingsPage(1, size, 0, ())

    worker = engine(reference_db, library=EmptyProvider())
    status, report = run(worker.sync_theme_holdings(["11"]))
    assert status == 0 and report["regions"]["11"]["empty"] == 1 and report["requests"] == 1
    assert q(reference_db, "SELECT library_id FROM library_holdings_cache") == []
    status, report = run(worker.sync_theme_holdings(["11"]))
    assert status == 0 and report["regions"]["11"]["reused"] == 1 and report["requests"] == 0
    status, report = run(engine(reference_db).sync_theme_holdings(["11"]))
    assert status == 0 and report["regions"]["11"]["reused"] == 1 and report["requests"] == 0


def test_holdings_does_not_replace_a_newer_snapshot(reference_db, seeded):
    target = HoldingsTarget(seeded[0], isbn(0), "11", False)
    now = now_kst()
    with reference_db.begin() as c:
        assert replace_holdings(c, target, now, {"test-102", "unknown"}) == 1
    with reference_db.begin() as c:
        assert replace_holdings(c, target, now - timedelta(seconds=1), {"test-101"}) is None
    assert q(reference_db, "SELECT library_id FROM library_holdings_cache") == [(102,)]


# ─────────── 마이그레이션 ───────────


def test_new_tables_have_rls_and_look_check(db_engine):
    rls = dict(q(db_engine, "SELECT relname, relrowsecurity FROM pg_class "
                            "WHERE relname IN ('shelf_themes', 'shelf_theme_books', "
                            "'library_holdings_snapshots', 'library_holdings_cache')"))
    assert rls == {"shelf_themes": True, "shelf_theme_books": True,
                   "library_holdings_snapshots": True, "library_holdings_cache": True}
    assert q(db_engine, "SELECT policyname FROM pg_policies WHERE tablename LIKE 'library_holdings_%'") == []
    for column, value in (("look", "neon"), ("look_assigned_by", "someone")):
        with db_engine.begin() as c, pytest.raises(IntegrityError):
            c.execute(text(f"UPDATE libraries SET {column} = :v WHERE id = 101"), {"v": value})
    # user_settings는 M2-0-P4 `0015`가 만든다 — 표 시험은 test_return_stats.py


def test_theme_basis_label_is_saved_shown_and_kept_when_put_omits_it(client, reference_db, seeded, ops, db_engine, yes24_db):
    """C-94: 테마 출처 문구(basis_label)를 올리고, 책장 둘째 장에 보이며, PUT에서 생략하면 보존된다."""
    use_providers(client, reference_db, library=FakeLibraryData(popular={}), yes24=bestseller())
    add_holdings(reference_db, 101, [seeded[0], seeded[1]])
    created = client.post("/api/v1/ops/shelf-themes", json=theme_body(basis_label="  YES24 스테디셀러 "), headers=ops["A"])
    assert created.status_code == 201 and created.json()["basis_label"] == "YES24 스테디셀러"
    theme = [p for p in shelf(client).json()["pages"] if p["kind"] == "theme"][0]
    assert theme["basis_label"] == "YES24 스테디셀러"
    tid = created.json()["id"]
    body = theme_body(title="바뀐 이름")  # basis_label 키 없음 → 보존
    assert client.put(f"/api/v1/ops/shelf-themes/{tid}", json=body, headers=ops["A"]).json()["basis_label"] == "YES24 스테디셀러"
    cleared = client.put(f"/api/v1/ops/shelf-themes/{tid}", json={**body, "basis_label": None}, headers=ops["A"])
    assert cleared.json()["basis_label"] is None
    for bad in ("", "   ", "가" * 41):
        assert client.put(f"/api/v1/ops/shelf-themes/{tid}", json={**body, "basis_label": bad}, headers=ops["A"]).status_code == 422
