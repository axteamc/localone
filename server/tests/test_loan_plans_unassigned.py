"""Y-6 파트 1 서버: 도서관 미지정 예정(#16·#17·#20)·일괄 소장 조회(#70)·0027 마이그레이션.

계약: book-search LIB-3b(U1~U5, §2), core LIB-0 K24, loan-assistant LOAN-1 M6(C-84).
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import policy
from app.common import today_kst
from app.main import create_app
from app.services import provider_engine as pe
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

NOW = datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc)
BOOK_PREFIX = "97933333"
URL = "/api/v1/me/loan-plans"
BULK = f"{URL}/availability"
KM = 1 / 111.195  # 위도 1km
CENTER = (-40.0, 170.0)  # 다른 시험 도서관과 겹치지 않는 자리

# id: (지역, 중심에서 km, 홈페이지)
LIBS = {
    30001: ("91", 0.5, None),
    30002: ("91", 1.0, "www.y6-l2.test"),  # fix_homepage → https://
    30003: ("92", 2.0, None),
    30004: ("91", 2.5, "-"),  # 자리표시 → 없음
}


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


def code(lib_id: int) -> str:
    return f"y6-{lib_id}"


@pytest.fixture
def books(db_engine, public_reference_data):
    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM loans"))
            conn.execute(text("DELETE FROM loan_plans"))
            conn.execute(text("DELETE FROM availability_observations WHERE library_id = ANY(:ids)"),
                         {"ids": list(LIBS)})
            conn.execute(text("DELETE FROM libraries WHERE id = ANY(:ids)"), {"ids": list(LIBS)})
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})

    clean()
    with db_engine.begin() as conn:
        for lib_id, (region, km, homepage) in LIBS.items():
            conn.execute(text("""
                INSERT INTO libraries (id, provider_lib_code, name, address, tel, homepage, latitude, longitude,
                    region_code, dtl_region_code, closed_text, operating_time_text, content_hash)
                OVERRIDING SYSTEM VALUE
                VALUES (:id, :code, :name, '서울특별시 종로구 북촌로 1 (화동)', '02-000-0000', :home, :lat, :lng,
                    :region, :dtl, NULL, '평일 09:00~22:00', 'y6-test')
            """), {"id": lib_id, "code": code(lib_id), "name": f"Y6관{lib_id}", "home": homepage,
                   "lat": CENTER[0] + km * KM, "lng": CENTER[1], "region": region, "dtl": f"{region}010"})
        pe.upsert_books(conn, [
            pe.BookInfo(isbn(i), f"책{i}", author="작가", cover_url=None, description="소개", pub_year=2020)
            for i in range(22)
        ], "manual", NOW, overwrite=True)
    yield
    clean()


@pytest.fixture
def client(test_db_url, fake_jwks_client, books):
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client, make_token):
    headers = {}
    for name, uid in (("A", USER_A_ID), ("B", USER_B_ID)):
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


def save(client, headers, book: int = 0, **body):
    return client.post(URL, headers=headers, json={"isbn13": isbn(book), **body})


def plan_rows(db_engine, where: str = "TRUE", **params) -> list:
    with db_engine.connect() as conn:
        return conn.execute(text(f"SELECT * FROM loan_plans WHERE {where}"), params).all()


# ─────────── 0027 마이그레이션 ───────────


def test_unassigned_unique_index_and_nullable(db_engine):
    with db_engine.connect() as conn:
        nullable = conn.execute(text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'loan_plans' AND column_name = 'library_id'")).scalar_one()
        indexdef = conn.execute(text(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_loan_plans_active_unassigned'")).scalar_one()
        old = conn.execute(text("SELECT 1 FROM pg_indexes WHERE indexname = 'uq_loan_plans_active'")).scalar()
    assert nullable == "YES"
    assert "UNIQUE" in indexdef and "(user_id, book_id)" in indexdef and "library_id IS NULL" in indexdef
    assert old == 1  # 지정 예정 UNIQUE 유지(U2)


def test_downgrade_refuses_while_unassigned_rows_exist(client, auth, db_engine, alembic_config):
    assert save(client, auth["A"]).status_code == 201
    try:
        with pytest.raises(Exception, match="0027"):
            command.downgrade(alembic_config, "0026_yes24_curated")
        assert len(plan_rows(db_engine, "library_id IS NULL")) == 1  # 데이터 보존
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM loan_plans WHERE library_id IS NULL"))
        command.downgrade(alembic_config, "0026_yes24_curated")
        with db_engine.connect() as conn:
            assert conn.execute(text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name = 'loan_plans' AND column_name = 'library_id'")).scalar_one() == "NO"
    finally:
        command.upgrade(alembic_config, "head")


# ─────────── #16·#17 미지정 예정 ───────────


@pytest.mark.parametrize("body", [{}, {"library_id": None}])
def test_save_unassigned_plan_idempotent(client, auth, db_engine, body):
    first = save(client, auth["A"], **body)
    second = save(client, auth["A"], **body)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["library"] is None
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: save(client, auth["A"], book=1, **body), range(4)))
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201]
    assert len({r.json()["id"] for r in results}) == 1
    assert len(plan_rows(db_engine, "library_id IS NULL AND status = 'planned'")) == 2


def test_assigned_and_unassigned_coexist(client, auth, db_engine):
    unassigned = save(client, auth["A"])
    assigned = save(client, auth["A"], library_id=101)
    assert (unassigned.status_code, assigned.status_code) == (201, 201)
    assert unassigned.json()["id"] != assigned.json()["id"]
    # 해제한 뒤 다시 담으면 새 예정
    assert client.delete(f"{URL}/{unassigned.json()['id']}", headers=auth["A"]).status_code == 200
    again = save(client, auth["A"])
    assert again.status_code == 201 and again.json()["id"] != unassigned.json()["id"]


def test_list_hides_unassigned_unless_requested(client, auth):
    save(client, auth["A"])
    assigned = save(client, auth["A"], book=1, library_id=101).json()
    save(client, auth["B"], book=2)
    assert client.get(URL, headers=auth["A"]).json()["items"] == [assigned]  # 구 앱 호환
    items = client.get(URL, headers=auth["A"], params={"include_unassigned": "true"}).json()["items"]
    assert [i["book"]["isbn13"] for i in items] == [isbn(1), isbn(0)]
    assert items[1]["library"] is None and set(items[1]) == {"id", "book", "library", "status", "created_at"}
    bad = client.get(URL, headers=auth["A"], params={"include_unassigned": "maybe"})
    assert bad.status_code == 422 and bad.json()["error"]["detail"] == "include_unassigned"


def test_start_loan_from_unassigned_plan_records_null_library(client, auth, db_engine):
    plan = save(client, auth["A"]).json()
    response = client.post("/api/v1/me/loans", headers=auth["A"], json={"isbn13": isbn(0), "plan_id": plan["id"]})
    assert response.status_code == 201
    assert response.json()["library"] is None
    assert plan_rows(db_engine, "id = :id", id=plan["id"])[0].status == "converted"


# ─────────── #70 일괄 소장 조회 ───────────


class FakeBulk:
    """libSrchByBook·bookExist 가짜. holdings[(isbn, 지역)] = 도서관 코드 목록 또는 예외."""

    def __init__(self, holdings=None, exist=None, page_size=None, fail_page=None):
        self.holdings = holdings or {}
        self.exist = exist or {}
        self.page_size = page_size
        self.fail_page = fail_page or {}
        self.calls: list[tuple] = []

    def holdings_page(self, isbn13, region, page, size):
        self.calls.append(("page", isbn13, region, page))
        value = self.holdings.get((isbn13, region), [])
        if isinstance(value, BaseException):
            raise value
        if self.fail_page.get((isbn13, region)) == page:
            raise pe.ProviderError("중간 페이지 실패")
        ps = self.page_size or size
        return pe.HoldingsPage(page, ps, len(value), tuple(value[(page - 1) * ps: page * ps]))

    def book_exist(self, lib_code, isbn13):
        self.calls.append(("exist", lib_code, isbn13))
        value = self.exist.get((lib_code, isbn13), pe.HoldingResult("yes", "no"))
        if isinstance(value, BaseException):
            raise value
        return value

    def kinds(self, kind):
        return [c for c in self.calls if c[0] == kind]


def use(client, db_engine, fake):
    client.app.state.provider_engine = pe.ProviderEngine(db_engine, pe.Providers(library_data=fake))


def bulk(client, headers, **body):
    return client.post(BULK, headers=headers, json={"lat": CENTER[0], "lng": CENTER[1], "radius_km": 3, **body})


def plan_books(client, headers, *books):
    return [save(client, headers, book=b).json()["id"] for b in books]


# 책 0~3: 0은 L1·L2·L4(91)+L3(92), 1은 L2·L4+L3, 2는 L3만, 3은 아무 데도 없음
def standard_fake(**kw):
    a, b, c, d = isbn(0), isbn(1), isbn(2), isbn(3)
    return FakeBulk(
        holdings={
            (a, "91"): [code(30001), code(30002), code(30004), "999999"],  # 모르는 코드는 무시
            (b, "91"): [code(30002), code(30004)], (c, "91"): [], (d, "91"): [],
            (a, "92"): [code(30003)], (b, "92"): [code(30003)], (c, "92"): [code(30003)], (d, "92"): [],
        },
        exist={
            (code(30004), a): pe.HoldingResult("yes", "yes"),
            (code(30004), b): pe.HoldingResult("yes", "yes"),
            (code(30002), a): pe.HoldingResult("yes", "yes"),
        },
        **kw,
    )


def test_bulk_two_stage_ranking_and_response(client, auth, db_engine):
    fake = standard_fake()
    use(client, db_engine, fake)
    ids = plan_books(client, auth["A"], 0, 1, 2, 3)
    response = bulk(client, auth["A"])
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"checked_at", "radius_km", "complete", "unknown_pairs", "fallback_counts",
                         "books", "candidates"}
    assert body["checked_at"].endswith("+09:00") and body["radius_km"] == 3
    assert (body["complete"], body["unknown_pairs"]) == (True, 0)
    assert body["fallback_counts"] == {"limit": 0, "provider_error": 0, "not_configured": 0}
    # 예정 created_at DESC 순
    assert body["books"] == [
        {"isbn13": isbn(3), "plan_ids": [ids[3]], "status": "not_held"},
        {"isbn13": isbn(2), "plan_ids": [ids[2]], "status": "held"},
        {"isbn13": isbn(1), "plan_ids": [ids[1]], "status": "held"},
        {"isbn13": isbn(0), "plan_ids": [ids[0]], "status": "held"},
    ]
    # 선택: L3(소장3·가능0), L4(2·2), L2(2·1) — L1(1)은 탈락. 표시는 거리순
    cands = body["candidates"]
    assert [c["library"]["id"] for c in cands] == [30002, 30003, 30004]
    assert [(c["holding_count"], c["loanable_count"]) for c in cands] == [(2, 1), (3, 0), (2, 2)]
    l2 = cands[0]
    assert set(l2["library"]) == {"id", "name", "address", "area_label", "distance_m", "today", "tel", "homepage"}
    assert l2["library"]["distance_m"] == 1000 and l2["library"]["area_label"] == "화동"
    assert l2["library"]["homepage"] == "https://www.y6-l2.test"
    assert l2["link"] == {"url": "https://www.y6-l2.test", "kind": "homepage"}
    assert sorted(l2["held_isbn13s"]) == sorted([isbn(0), isbn(1)]) and l2["loanable_isbn13s"] == [isbn(0)]
    assert cands[1]["link"] is None and cands[2]["link"] is None and cands[2]["library"]["homepage"] is None
    # ① 4권 × 2지역 = 8쪽, ② 소장 쌍 8개(L1 A, L2 A·B, L3 A·B·C, L4 A·B)
    assert len(fake.kinds("page")) == 8 and len(fake.kinds("exist")) == 8
    with db_engine.connect() as conn:
        stored = conn.execute(text(
            "SELECT count(*) FROM availability_observations WHERE library_id = ANY(:ids)"),
            {"ids": list(LIBS)}).scalar_one()
    assert stored == 8  # ② bookExist만 저장, ①의 no는 저장하지 않는다

    # 다시 조회: 오늘 관측을 먼저 써서 bookExist를 다시 부르지 않는다
    fake.calls.clear()
    again = bulk(client, auth["A"]).json()
    assert again["candidates"] == cands and len(fake.kinds("exist")) == 0


def test_bulk_selected_plan_ids_only_and_shared_isbn(client, auth, db_engine):
    use(client, db_engine, standard_fake())
    ids = plan_books(client, auth["A"], 0, 2)
    other = save(client, auth["A"], book=0, library_id=101).json()["id"]  # 같은 책 지정 예정
    body = bulk(client, auth["A"], plan_ids=[ids[0], other]).json()
    assert body["books"] == [{"isbn13": isbn(0), "plan_ids": [other, ids[0]], "status": "held"}]
    assert [c["holding_count"] for c in body["candidates"]] == [1, 1, 1]
    # 소장이 모두 1권이면 대출 가능(L2·L4) 먼저, 그다음 가까운 L1 → 더 가까운 L3(2.0)보다 L4(2.5)가 남는다
    assert [c["library"]["id"] for c in body["candidates"]] == [30001, 30002, 30004]


def test_bulk_uses_today_observation_before_provider(client, auth, db_engine):
    fake = standard_fake()
    use(client, db_engine, fake)
    plan_books(client, auth["A"], 2)
    with db_engine.begin() as conn:
        book_id = conn.execute(text("SELECT id FROM books WHERE isbn13 = :i"), {"i": isbn(2)}).scalar_one()
        for lib_id in LIBS:
            conn.execute(text("""
                INSERT INTO availability_observations (library_id, book_id, observed_on, holding, loanable,
                    data_date, data_date_assumed, observed_at, source)
                VALUES (:lib, :book, :today, :h, :l, :today, true, now(), 'data4library')
            """), {"lib": lib_id, "book": book_id, "today": today_kst(),
                   "h": "yes" if lib_id == 30001 else "no", "l": "yes" if lib_id == 30001 else "no"})
    body = bulk(client, auth["A"]).json()
    assert fake.calls == []  # 모든 쌍이 오늘 관측
    assert [(c["library"]["id"], c["loanable_count"]) for c in body["candidates"]] == [(30001, 1)]
    assert body["complete"] is True


def test_bulk_partial_pages_stay_unknown(client, auth, db_engine):
    fake = standard_fake(page_size=1, fail_page={(isbn(0), "91"): 2})
    use(client, db_engine, fake)
    plan_books(client, auth["A"], 0)
    body = bulk(client, auth["A"]).json()
    # 91 지역은 1쪽만 받고 실패 → L1·L2·L4 모두 unknown(no로 단정하지 않음), 92의 L3만 확정
    assert (body["complete"], body["unknown_pairs"]) == (False, 3)
    assert body["fallback_counts"]["provider_error"] == 3
    assert body["books"][0]["status"] == "held"
    assert [c["library"]["id"] for c in body["candidates"]] == [30003]


def test_bulk_integrity_error_is_provider_error(client, auth, db_engine):
    class Broken(FakeBulk):
        def holdings_page(self, isbn13, region, page, size):
            self.calls.append(("page", isbn13, region, page))
            return pe.HoldingsPage(page, size, 2, (code(30001),))  # 총 2건인데 1건만(누락)

    use(client, db_engine, Broken())
    plan_books(client, auth["A"], 0)
    body = bulk(client, auth["A"]).json()
    assert body["unknown_pairs"] == 4 and body["books"][0]["status"] == "unknown"  # 두 지역 모두 누락


def test_bulk_budget_shared_between_stages(client, auth, db_engine, monkeypatch):
    monkeypatch.setattr(policy, "AVAILABILITY_MAX_CALLS_PER_REQUEST", 3)
    fake = standard_fake()
    use(client, db_engine, fake)
    plan_books(client, auth["A"], 0, 1, 2, 3)
    body = bulk(client, auth["A"]).json()
    assert len(fake.calls) == 3 and not fake.kinds("exist")  # ①이 예산을 다 써서 ② 0건
    assert {c[1] for c in fake.calls} == {isbn(3), isbn(2)}  # 앞 ISBN(최근 예정)부터
    assert body["complete"] is False and body["fallback_counts"]["limit"] > 0
    assert all(c["loanable_count"] == 0 for c in body["candidates"])


def test_bulk_second_stage_limit_keeps_holding(client, auth, db_engine, monkeypatch):
    monkeypatch.setattr(policy, "AVAILABILITY_MAX_CALLS_PER_REQUEST", 3)  # ① 2쪽 + ② 1건
    fake = standard_fake()
    use(client, db_engine, fake)
    plan_books(client, auth["A"], 0)
    body = bulk(client, auth["A"]).json()
    assert [c[0] for c in fake.calls].count("exist") == 1
    assert fake.kinds("exist")[0][1] == code(30001)  # 임시 순위: 소장 권수가 같으면 가까운 곳(L1) 먼저
    # 소장은 모두 확정(complete), 대출 가능 못 본 3쌍만 limit
    assert body["complete"] is True and body["fallback_counts"]["limit"] == 3


@pytest.mark.parametrize("mode,reason", [("missing", "not_configured"), ("daily", "limit"),
                                         ("error", "provider_error")])
def test_bulk_provider_failures_are_200_unknown(client, auth, db_engine, monkeypatch, mode, reason):
    if mode == "missing":
        client.app.state.provider_engine = pe.ProviderEngine(db_engine, pe.Providers())
    elif mode == "daily":
        monkeypatch.setattr(policy, "DATA4LIBRARY_DAILY_LIMIT", 0)
        use(client, db_engine, standard_fake())
    else:
        use(client, db_engine, FakeBulk(holdings={(isbn(0), r): pe.ProviderError("x") for r in ("91", "92")}))
    plan_books(client, auth["A"], 0)
    response = bulk(client, auth["A"])
    assert response.status_code == 200
    body = response.json()
    assert (body["complete"], body["unknown_pairs"], body["candidates"]) == (False, 4, [])
    assert body["fallback_counts"][reason] == 4
    assert body["books"][0]["status"] == "unknown"


def test_bulk_library_without_region_is_unknown(client, auth, db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE libraries SET region_code = NULL WHERE id = 30001"))
    fake = standard_fake()
    use(client, db_engine, fake)
    plan_books(client, auth["A"], 3)
    body = bulk(client, auth["A"]).json()
    assert (body["complete"], body["unknown_pairs"]) == (False, 1)
    assert body["books"][0]["status"] == "unknown"  # 나머지가 no여도 not_held로 단정하지 않는다


def test_bulk_empty_cases(client, auth, db_engine):
    fake = standard_fake()
    use(client, db_engine, fake)
    empty = bulk(client, auth["A"]).json()
    assert (empty["complete"], empty["books"], empty["candidates"]) == (True, [], [])
    plan_books(client, auth["A"], 0)
    far = client.post(BULK, headers=auth["A"], json={"lat": 10.0, "lng": 10.0}).json()
    assert (far["complete"], far["candidates"], far["radius_km"]) == (True, [], policy.NEARBY_DEFAULT_RADIUS_KM)
    assert fake.calls == []


def test_bulk_requires_login(client):
    assert client.post(BULK, json={"lat": CENTER[0], "lng": CENTER[1]}).status_code == 401


def test_bulk_not_mine_or_inactive_is_404(client, auth, db_engine):
    use(client, db_engine, standard_fake())
    mine = plan_books(client, auth["A"], 0)[0]
    theirs = plan_books(client, auth["B"], 1)[0]
    released = plan_books(client, auth["A"], 2)[0]
    client.delete(f"{URL}/{released}", headers=auth["A"])
    for ids in ([mine, theirs], [released], [str(uuid4())]):
        response = bulk(client, auth["A"], plan_ids=ids)
        assert response.status_code == 404 and response.json()["error"]["detail"] == "plan_ids"


def test_bulk_isbn_cap(client, auth, db_engine):
    fake = standard_fake()
    use(client, db_engine, fake)
    ids = plan_books(client, auth["A"], *range(policy.BATCH_AVAILABILITY_MAX_ISBNS + 1))
    over = bulk(client, auth["A"])
    assert over.status_code == 422 and over.json()["error"]["detail"] == "plan_ids"
    assert bulk(client, auth["A"], plan_ids=ids[:policy.BATCH_AVAILABILITY_MAX_ISBNS]).status_code == 200
    fake.calls.clear()
    assert bulk(client, auth["A"], plan_ids=ids).status_code == 422 and fake.calls == []


@pytest.mark.parametrize("body,field", [
    ({"plan_ids": []}, "plan_ids"),
    ({"plan_ids": "x"}, "plan_ids"),
    ({"plan_ids": ["not-uuid"]}, "plan_ids"),
    ({"plan_ids": [1]}, "plan_ids"),
    ({"plan_ids": ["00000000-0000-4000-8000-000000000001"] * 2}, "plan_ids"),
    ({"plan_ids": [str(uuid4()) for _ in range(51)]}, "plan_ids"),
    ({"lat": 91}, "lat"),
    ({"lng": -181}, "lng"),
    ({"lat": None}, "lat"),
    ({"radius_km": 4}, "radius_km"),
])
def test_bulk_validation_is_422(client, auth, body, field):
    response = bulk(client, auth["A"], **body)
    assert response.status_code == 422 and response.json()["error"]["detail"] == field


def test_bulk_missing_coordinates_is_422(client, auth):
    response = client.post(BULK, headers=auth["A"], json={})
    assert response.status_code == 422 and response.json()["error"]["detail"] == "lat,lng"
