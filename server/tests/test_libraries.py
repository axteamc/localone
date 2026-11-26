"""LIB-0-P1 계약 P5 + 경계·실제 접근 로그·트랜잭션·스키마 회귀."""
import asyncio
import logging
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from urllib.request import urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

import pytest
import uvicorn
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, text
from sqlalchemy.exc import IntegrityError

from app import policy
from app.common import ApiError, today_kst
from app.main import create_app
from app.routers.libraries import area_label_of, closed_today, today_hours
from app.seed import seed_reference_data
from app.services.provider_engine import (
    Data4LibraryClient, LibraryInfo, ProviderEngine, ProviderError, Providers,
    build_providers, libraries_nearby, reserve_provider_call,
)
from app.settings import Settings
from tests.provider_fakes import FakeLibraryProvider, public_reference_data

TABLES = ("libraries", "books", "availability_observations", "popular_books_cache", "provider_daily_usage")


@pytest.fixture
def client(public_reference_data, test_db_url):
    app = create_app(Settings(app_env="test", database_url=test_db_url))
    with TestClient(app) as client:
        yield client


def snapshot(engine):
    with engine.connect() as conn:
        return {t: conn.execute(text(f"SELECT row_to_json(t)::text FROM {t} t ORDER BY row_to_json(t)::text")).scalars().all()
                for t in TABLES}


def test_nearby_default_radius_is_3km_sorted_by_distance(client):
    r = client.get("/api/v1/libraries", params={"lat": 0, "lng": 0})
    assert r.status_code == 200
    assert r.json()["radius_km"] == 3
    assert r.json()["mode"] == "nearby"
    assert [x["id"] for x in r.json()["items"]] == [101, 102]
    assert [x["distance_m"] for x in r.json()["items"]] == [1000, 2000]


def test_nearby_5km_includes_more(client):
    data = client.get("/api/v1/libraries", params={"lat": 0, "lng": 0, "radius_km": 5}).json()
    assert data["radius_km"] == 5
    assert [x["id"] for x in data["items"]] == [101, 102, 103]


def test_nearby_2km_and_nearest_when_empty(client):
    """C-96: 반경 2km 허용. 반경 안이 비면 가장 가까운 1곳을 nearest로(그 밖에는 null)."""
    data = client.get("/api/v1/libraries", params={"lat": 0, "lng": 0, "radius_km": 2}).json()
    assert data["radius_km"] == 2 and [x["id"] for x in data["items"]] == [101]
    assert data["nearest"] is None
    empty = client.get("/api/v1/libraries", params={"lat": 0, "lng": 0.1, "radius_km": 2}).json()  # 동쪽 약 11km
    assert empty["items"] == []
    assert empty["nearest"]["id"] == 101 and empty["nearest"]["distance_m"] > 11000


def test_nearest_mode_ignores_radius(client):
    """C-96 홈 지도 모드: 반경과 상관없이 가까운 N곳, 거리순."""
    data = client.get("/api/v1/libraries", params={"lat": 0, "lng": 0, "nearest": 2}).json()
    assert data["mode"] == "nearest" and data["radius_km"] is None
    assert [x["id"] for x in data["items"]] == [101, 102]
    assert [x["distance_m"] for x in data["items"]] == [1000, 2000]
    far = client.get("/api/v1/libraries", params={"lat": 0, "lng": 0.1, "nearest": 3}).json()
    assert [x["id"] for x in far["items"]] == [101, 102, 103]


def test_nearby_excludes_libraries_without_coords(client):
    items = client.get("/api/v1/libraries?lat=0&lng=0").json()["items"]
    assert items and 104 not in [x["id"] for x in items]
    assert all(x["latitude"] is not None and x["longitude"] is not None for x in items)


def test_region_lists_libraries_without_distance(client):
    data = client.get("/api/v1/libraries?dtl_region=11010").json()
    assert data["mode"] == "region" and data["radius_km"] is None and data["q"] is None
    assert data["dtl_region"] == "11010"
    assert [x["name"] for x in data["items"]] == ["정독도서관", "종로도서관", "좌표없음"]
    assert all(x["distance_m"] is None for x in data["items"])


def test_search_by_name_partial_and_limit(client):
    data = client.get("/api/v1/libraries", params={"q": " 이름도서관 "}).json()
    assert data["mode"] == "search" and data["q"] == "이름도서관"
    assert data["radius_km"] is None and data["dtl_region"] is None
    assert [x["name"] for x in data["items"]] == [f"이름도서관{i:02}" for i in range(20)]


@pytest.mark.parametrize("q, ids", [
    ("교육청중앙", [301]),
    ("광주 중앙", [301, 302]),  # 단어마다 이름·주소, 이름에 둘 다 맞은 301이 먼저
    ("광주 교육청중앙", [301]),
    ("  광주   교육청중앙 ", [301]),  # 공백 여러 개
    ("중앙도서관", [303, 302, 301]),  # 이름이 검색어로 시작 → 짧은 이름 순
    ("광주 남산", []),  # 모든 단어가 맞아야 한다
])
def test_search_by_name_words_address_and_order(client, q, ids):
    response = client.get("/api/v1/libraries", params={"q": q})
    assert response.status_code == 200
    assert [x["id"] for x in response.json()["items"]] == ids


@pytest.mark.parametrize("q, ids", [("%", [105]), ("_", [105]), ("\\", [105]), ("a_b", [105]), ("없는%", [])])
def test_search_by_name_escapes_wildcards(client, q, ids):
    response = client.get("/api/v1/libraries", params={"q": q})
    assert response.status_code == 200
    assert [x["id"] for x in response.json()["items"]] == ids


@pytest.mark.parametrize("query, detail", [
    ({}, "lat,lng"), ({"lat": 0}, "lng"), ({"lng": 0}, "lat"),
    ({"radius_km": 3}, "lat,lng"),
    ({"lat": 0, "lng": 0, "q": "a"}, "lat,lng,q"),
    ({"dtl_region": "11010", "q": "a"}, "dtl_region,q"),
    ({"dtl_region": "11010", "radius_km": 3}, "dtl_region,radius_km"),
    ({"lat": 0, "lng": 0, "radius_km": 4}, "radius_km"),
    ({"lat": 0, "lng": 0, "nearest": 0}, "nearest"),
    ({"lat": 0, "lng": 0, "nearest": 11}, "nearest"),
    ({"lat": 0, "nearest": 5}, "lng"),
    ({"lat": 0, "lng": 0, "radius_km": 2, "nearest": 5}, "lat,lng,nearest,radius_km"),
    ({"lat": 91, "lng": 0}, "lat"), ({"lat": 0, "lng": -181}, "lng"),
    ({"lat": "nan", "lng": 0}, "lat"), ({"lat": 0, "lng": "inf"}, "lng"),
    ({"dtl_region": "123"}, "dtl_region"), ({"q": "  "}, "q"), ({"q": "a" * 31}, "q"),
])
def test_list_validation_errors(client, db_engine, query, detail):
    before = snapshot(db_engine)
    r = client.get("/api/v1/libraries", params=query)
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "VALIDATION_ERROR", "message": "요청 형식이 올바르지 않아요.", "detail": detail}}
    assert snapshot(db_engine) == before


def test_list_items_have_today_and_area_label(client, monkeypatch):
    monkeypatch.setattr("app.routers.libraries.today_kst", lambda: date(2026, 11, 17))
    items = client.get("/api/v1/libraries?lat=0&lng=0").json()["items"]
    assert [x["area_label"] for x in items] == ["화동", "사직동"]
    assert all(x["today"] == {"date": "2026-11-17", "is_closed": False,
                             "hours_text": "09:00~22:00", "holiday_unchecked": False} for x in items)


@pytest.mark.parametrize("closed_text, operating_time, is_closed, expected_hours", [
    ("공휴일", "월 07:00~12:00 / 화 09:00~18:00", None, "09:00~18:00"),
    ("매주 화요일", "화 09:00~18:00", True, None),
    ("매주 월요일", "화 09:00~18:00", False, "09:00~18:00"),
    (None, "월 07:00~12:00", None, None),
    ("매주 월요일", "화 29:00~99:99", False, None),
])
def test_today_hours_are_independent_of_unknown_closure(
    client, db_engine, monkeypatch, closed_text, operating_time, is_closed, expected_hours,
):
    utc_on_previous_day = datetime.fromisoformat("2026-11-16T15:05:00+00:00")
    monkeypatch.setattr("app.routers.libraries.today_kst", lambda: today_kst(utc_on_previous_day))
    update = text("""
        UPDATE libraries SET closed_text=:closed, operating_time_text=:hours WHERE id=101
    """)
    with db_engine.begin() as conn:
        previous = conn.execute(text("""
            SELECT closed_text AS closed, operating_time_text AS hours FROM libraries WHERE id=101
        """)).mappings().one()
        conn.execute(update, {"closed": closed_text, "hours": operating_time})

    try:
        listing = client.get("/api/v1/libraries?lat=0&lng=0")
        detail = client.get("/api/v1/libraries/101")
        assert listing.status_code == detail.status_code == 200
        listed = next(item for item in listing.json()["items"] if item["id"] == 101)
        assert listed["today"] == detail.json()["today"] == {
            "date": "2026-11-17",
            "is_closed": is_closed,
            "hours_text": expected_hours,
            "holiday_unchecked": is_closed is None,
        }
    finally:
        with db_engine.begin() as conn:
            conn.execute(update, dict(previous))


@pytest.mark.parametrize("raw, day, expected", [
    (None, "2026-11-17", (None, True)), ("", "2026-11-17", (None, True)),
    ("별도 안내", "2026-11-17", (None, True)), ("공휴일", "2026-11-17", (None, True)),
    ("매주 월요일", "2026-11-16", (True, False)), ("매주 월요일", "2026-11-17", (False, False)),
    ("매주 월·수요일", "2026-11-18", (True, False)),
    ("매주 월,수요일", "2026-11-18", (True, False)),
    ("매월 첫째·셋째 수요일", "2026-11-18", (True, False)),
    ("매월 첫째,셋째 수요일", "2026-11-11", (False, False)),
    ("매월 마지막 월요일", "2026-11-30", (True, False)),
    ("매월 마지막 월요일", "2026-11-23", (False, False)),
    ("매주 월요일, 법정공휴일", "2026-11-16", (True, True)),
    ("매주 월요일, 법정공휴일", "2026-11-17", (None, True)),
    ("매주 월요일 제외", "2026-11-16", (None, True)),
    ("매월 다섯째 월요일", "2026-11-30", (True, False)),
])
def test_closed_today_parser(raw, day, expected):
    assert closed_today(raw, date.fromisoformat(day)) == expected


@pytest.mark.parametrize("raw, day, expected", [
    ("평일 09:00~22:00 / 주말 09:00~17:00", "2026-11-17", "09:00~22:00"),
    ("평일 09:00~22:00 / 주말 09:00~17:00", "2026-11-21", "09:00~17:00"),
    ("화~금 09:00~21:00", "2026-11-17", "09:00~21:00"),
    ("매일 29:00~99:99", "2026-11-17", None), (None, "2026-11-17", None),
    ("예약자만 09:00~18:00", "2026-11-17", None),
])
def test_today_hours_parser(raw, day, expected):
    assert today_hours(raw, date.fromisoformat(day)) == expected


@pytest.mark.parametrize("address, expected", [
    ("서울 종로구 (화동)", "화동"), ("서울 종로구 사직동 12", "사직동"),
    ("양평군 양평읍", "양평읍"), ("양평군 강하면", "강하면"), ("종로구 종로1가", "종로1가"),
    (None, None), ("서울 소월로 109", None),
])
def test_area_label_parser(address, expected):
    assert area_label_of(address) == expected


def test_detail_header_fields_and_today(client):
    r = client.get("/api/v1/libraries/101")
    assert r.status_code == 200
    data = r.json()
    assert set(data) == {"id", "name", "address", "latitude", "longitude", "dtl_region_code",
                         "area_label", "distance_m", "today", "tel", "homepage", "operating_time_text", "closed_text",
                         "look"}  # look: core M2-0-P3
    assert data["distance_m"] is None and data["id"] == 101 and data["area_label"] == "화동"
    assert data["operating_time_text"] == "평일 09:00~22:00 / 주말 09:00~17:00"
    assert data["closed_text"] == "매주 월요일"


@pytest.mark.parametrize("id_, status", [(999999, 404), (0, 422), (-1, 422), ("abc", 422), (2**63, 422)])
def test_detail_not_found_and_bad_ids(client, db_engine, id_, status):
    before = snapshot(db_engine)
    r = client.get(f"/api/v1/libraries/{id_}")
    assert r.status_code == status
    assert r.json()["error"]["code"] == ("NOT_FOUND" if status == 404 else "VALIDATION_ERROR")
    assert r.json()["error"]["detail"] == ("" if status == 404 else "library_id")
    assert snapshot(db_engine) == before


def test_nfr05_access_log_never_keeps_coordinates(public_reference_data, test_db_url, caplog):
    app = create_app(Settings(app_env="test", database_url=test_db_url))
    ready = threading.Event()

    class Server(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets)
            ready.set()

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    server = Server(uvicorn.Config(app, log_config=None, lifespan="on", ws="none"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]})
    caplog.set_level(logging.INFO, logger="uvicorn.access")
    thread.start()
    try:
        assert ready.wait(10)
        base = f"http://127.0.0.1:{sock.getsockname()[1]}"
        with urlopen(base + "/api/v1/libraries?lat=12.34567&lng=76.54321", timeout=5) as r:
            assert r.status == 200
        with pytest.raises(HTTPError) as exc:
            urlopen(base + "/api/v1/libraries?lat=123.45678&lng=76.54321", timeout=5)
        assert exc.value.code == 422
        exc.value.close()
    finally:
        server.should_exit = True
        thread.join(10)
        sock.close()
    assert not thread.is_alive()
    logs = [r.getMessage() for r in caplog.records if r.name == "uvicorn.access"]
    assert len(logs) == 2 and all("/api/v1/libraries" in x for x in logs)
    assert all(token not in "\n".join(logs) for token in ("lat=", "lng=", "12.34567", "76.54321", "123.45678"))


def test_public_reference_rls_enabled(db_engine):
    with db_engine.connect() as conn:
        rows = conn.execute(text("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname = ANY(:names)"), {"names": list(TABLES)}).all()
        assert dict(rows) == dict.fromkeys(TABLES, True)
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename = ANY(:names)"), {"names": list(TABLES)}).scalar_one() == 0


def test_public_reference_columns_and_keys_match_contract(db_engine):
    expected = {
        "libraries": "id provider_lib_code name address tel homepage latitude longitude closed_text operating_time_text region_code dtl_region_code isbn_search_url_template content_hash synced_at look look_assigned_by",  # look*: core M2-0-P3
        "books": "id isbn13 title author publisher cover_url description pub_year source fetched_at",
        "availability_observations": "library_id book_id observed_on holding loanable data_date data_date_assumed observed_at source",
        "popular_books_cache": "id scope library_id rank book_id period_label fetched_at provider_class_name",  # provider_class_name: core M2-0-P3 후속(0020)
        "provider_daily_usage": "provider usage_date call_count",
    }
    inspector = inspect(db_engine)
    for table, columns in expected.items():
        assert {c["name"] for c in inspector.get_columns(table)} == set(columns.split())
    assert inspector.get_pk_constraint("availability_observations")["constrained_columns"] == ["library_id", "book_id", "observed_on"]
    assert inspector.get_pk_constraint("provider_daily_usage")["constrained_columns"] == ["provider", "usage_date"]
    for table, column in [("libraries", "provider_lib_code"), ("books", "isbn13")]:
        assert any(c["column_names"] == [column] for c in inspector.get_unique_constraints(table))
    assert any(i["column_names"] == ["dtl_region_code"] for i in inspector.get_indexes("libraries"))
    for table in ("libraries", "books", "popular_books_cache"):
        id_column = next(c for c in inspector.get_columns(table) if c["name"] == "id")
        assert id_column["identity"]["always"] is True
    assert "shelf_themes" in inspector.get_table_names()  # M1에는 없었고 core M2-0-P3(0014)에서 생김


@pytest.mark.parametrize("statement", [
    "INSERT INTO libraries(provider_lib_code,name,content_hash,latitude) VALUES('bad','bad','x',1)",
    "INSERT INTO books(title,source,isbn13) VALUES('bad','manual','123')",
    "INSERT INTO books(title,source) VALUES('bad','invalid')",
    "INSERT INTO books(title,source,description) VALUES('bad','manual',repeat('a',2001))",
    "INSERT INTO books(title,source,pub_year) VALUES('bad','manual',999)",
    "INSERT INTO books(title,source,pub_year) VALUES('bad','manual',3000)",
    "INSERT INTO provider_daily_usage(provider,usage_date,call_count) VALUES('kakao','2000-01-01',-1)",
    "INSERT INTO provider_daily_usage(provider,usage_date) VALUES('invalid','2000-01-01')",
])
def test_public_reference_checks(db_engine, statement):
    with db_engine.connect() as conn:
        with pytest.raises(IntegrityError):
            with conn.begin():
                conn.execute(text(statement))


def test_public_reference_fk_and_popular_constraints(public_reference_data):
    with public_reference_data.connect() as conn:
        tx = conn.begin()
        try:
            book = conn.execute(text("INSERT INTO books(title,source) VALUES('constraint','manual') RETURNING id")).scalar_one()
            for statement in [
                f"INSERT INTO availability_observations VALUES(101,{book},'2000-01-01','bad','no',NULL,false,now(),'data4library')",
                f"INSERT INTO availability_observations VALUES(101,{book},'2000-01-01','yes','bad',NULL,false,now(),'data4library')",
                f"INSERT INTO availability_observations VALUES(999999,{book},'2000-01-01','yes','yes',NULL,false,now(),'data4library')",
                f"INSERT INTO popular_books_cache(scope,library_id,rank,book_id,period_label) VALUES('national',101,1,{book},'x')",
                f"INSERT INTO popular_books_cache(scope,rank,book_id,period_label) VALUES('library',1,{book},'x')",
                f"INSERT INTO popular_books_cache(scope,rank,book_id,period_label) VALUES('national',0,{book},'x')",
            ]:
                with pytest.raises(IntegrityError):
                    with conn.begin_nested():
                        conn.execute(text(statement))
            for scope, library in [("national", "NULL"), ("library", "101")]:
                sql = f"INSERT INTO popular_books_cache(scope,library_id,rank,book_id,period_label) VALUES('{scope}',{library},1,{book},'x')"
                conn.execute(text(sql))
                with pytest.raises(IntegrityError):
                    with conn.begin_nested():
                        conn.execute(text(sql))
            inspector = inspect(conn)
            for table in ("availability_observations", "popular_books_cache"):
                assert all(fk["options"].get("ondelete", "NO ACTION") == "NO ACTION" for fk in inspector.get_foreign_keys(table))
        finally:
            tx.rollback()


def test_reserve_provider_call_is_atomic(db_engine):
    day = date(2000, 1, 1)
    with db_engine.begin() as conn:
        conn.execute(text("DELETE FROM provider_daily_usage WHERE usage_date=:d"), {"d": day})
    barrier = threading.Barrier(5)

    def reserve(_):
        barrier.wait(timeout=5)
        with db_engine.begin() as conn:
            return reserve_provider_call(conn, "kakao", day, 2)

    with ThreadPoolExecutor(max_workers=5) as pool:
        assert sum(pool.map(reserve, range(5))) == 2
    with db_engine.begin() as conn:
        assert conn.execute(text("SELECT call_count FROM provider_daily_usage WHERE provider='kakao' AND usage_date=:d"), {"d": day}).scalar_one() == 2
        assert not reserve_provider_call(conn, "kakao", day, 2)
        assert not reserve_provider_call(conn, "kakao", day, 0)
        assert not reserve_provider_call(conn, "yes24", day, -1)
        assert conn.execute(text("SELECT count(*) FROM provider_daily_usage WHERE usage_date=:d"), {"d": day}).scalar_one() == 1
        conn.execute(text("DELETE FROM provider_daily_usage WHERE usage_date=:d"), {"d": day})


def test_db_failure_is_503(refusing_db_url):
    with TestClient(create_app(Settings(app_env="test", database_url=refusing_db_url))) as c:
        for path in ("/api/v1/libraries?q=a", "/api/v1/libraries/101"):
            r = c.get(path)
            assert r.status_code == 503 and r.json()["error"]["code"] == "DB_UNAVAILABLE"


def test_list_and_detail_are_read_only_without_provider_calls(client, db_engine, monkeypatch):
    def forbidden(*args):
        raise AssertionError("도서관 조회에서는 제공자 호출 금지")
    monkeypatch.setattr(client.app.state.provider_engine, "_guarded_call", forbidden)
    before = snapshot(db_engine)
    for path in ("/api/v1/libraries?q=정독", "/api/v1/libraries/101", "/api/v1/libraries?lat=0&lng=0"):
        assert client.get(path).status_code == 200
        assert client.get(path).status_code == 200
    assert snapshot(db_engine) == before


@pytest.mark.parametrize("query", ["lat=80&lng=80", "dtl_region=99999", "q=찾을수없는이름"])
def test_empty_library_list_is_200(client, query):
    r = client.get("/api/v1/libraries?" + query)
    assert r.status_code == 200 and r.json()["items"] == []


def test_seed_is_idempotent_and_does_not_replace_provider_rows(db_engine):
    with db_engine.connect() as conn:
        tx = conn.begin()
        try:
            assert seed_reference_data(conn) == {"libraries": 3}
            conn.execute(text("UPDATE libraries SET name='공급자 최신' WHERE provider_lib_code='111001'"))
            assert seed_reference_data(conn) == {"libraries": 0}
            assert conn.execute(text("SELECT name FROM libraries WHERE provider_lib_code='111001'")).scalar_one() == "공급자 최신"
        finally:
            tx.rollback()


def test_sync_libraries_reserves_before_io_and_updates_by_hash(db_engine):
    fixed = datetime(2000, 1, 2, 0, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    active = set()

    def begun(conn):
        active.add(id(conn))

    def ended(conn):
        active.discard(id(conn))

    def before_call():
        assert not active, "외부 호출 중 DB 트랜잭션이 열려 있음"
        with db_engine.connect() as conn:
            assert conn.execute(text("SELECT call_count FROM provider_daily_usage WHERE provider='data4library' AND usage_date='2000-01-02'")).scalar_one() >= 1

    fake = FakeLibraryProvider([([LibraryInfo("test-sync", "동기화 도서관", latitude=37, longitude=127)], 1)], before_call=before_call)
    engine = ProviderEngine(db_engine, Providers(library_data=fake), now_fn=lambda: fixed)
    event.listen(db_engine, "begin", begun)
    event.listen(db_engine, "commit", ended)
    event.listen(db_engine, "rollback", ended)
    try:
        assert asyncio.run(engine.sync_libraries(["11010"])) == {"inserted": 1, "updated": 0, "unchanged": 0}
        with db_engine.begin() as conn:
            conn.execute(text("UPDATE libraries SET isbn_search_url_template='https://example.test/{isbn13}' WHERE provider_lib_code='test-sync'"))
        assert asyncio.run(engine.sync_libraries(["11010"])) == {"inserted": 0, "updated": 0, "unchanged": 1}
        fake.pages = [([LibraryInfo("test-sync", "바뀐 도서관", latitude=37, longitude=127)], 1)]
        assert asyncio.run(engine.sync_libraries(["11010"])) == {"inserted": 0, "updated": 1, "unchanged": 0}
        with db_engine.connect() as conn:
            row = conn.execute(text("SELECT name,isbn_search_url_template,dtl_region_code,synced_at FROM libraries WHERE provider_lib_code='test-sync'")).one()
            assert row.name == "바뀐 도서관" and row.dtl_region_code == "11010"
            assert row.isbn_search_url_template == "https://example.test/{isbn13}"
            assert row.synced_at == fixed
        assert len(fake.calls) == 3
    finally:
        event.remove(db_engine, "begin", begun)
        event.remove(db_engine, "commit", ended)
        event.remove(db_engine, "rollback", ended)
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM libraries WHERE provider_lib_code='test-sync'"))
            conn.execute(text("DELETE FROM provider_daily_usage WHERE usage_date='2000-01-02'"))


@pytest.mark.parametrize("case, status, code, calls", [
    ("no_key", 503, "PROVIDER_UNAVAILABLE", 0),
    ("limit", 429, "PROVIDER_LIMIT", 0),
    ("failure", 503, "PROVIDER_UNAVAILABLE", 1),
])
def test_sync_failures_do_not_write_library_rows(db_engine, monkeypatch, case, status, code, calls):
    fake = FakeLibraryProvider(failure=ProviderError("upstream"))
    engine = ProviderEngine(db_engine, Providers(library_data=None if case == "no_key" else fake),
                            now_fn=lambda: datetime(2000, 1, 3, tzinfo=ZoneInfo("Asia/Seoul")))
    if case == "limit":
        monkeypatch.setattr(policy, "DATA4LIBRARY_DAILY_LIMIT", 0)
    before = snapshot(db_engine)["libraries"]
    try:
        with pytest.raises(ApiError) as exc:
            asyncio.run(engine.sync_libraries(["11010"]))
        assert (exc.value.status_code, exc.value.code) == (status, code)
        assert len(fake.calls) == calls
        assert snapshot(db_engine)["libraries"] == before
        with db_engine.connect() as conn:
            assert conn.execute(text("SELECT COALESCE(sum(call_count),0) FROM provider_daily_usage WHERE usage_date='2000-01-03'")).scalar_one() == calls
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM provider_daily_usage WHERE usage_date='2000-01-03'"))


def test_provider_parser_and_request_configuration(monkeypatch):
    captured = []

    def response(url, headers, timeout):
        captured.append((url, headers, timeout))
        return {"response": {"numFound": 1, "libs": [{"lib": {
            "libCode": "111", "libName": "도서관", "latitude": "37.5", "longitude": "invalid",
            "closed": "모름", "operatingTime": "원문"}}]}}

    monkeypatch.setattr("app.services.provider_engine._http_get_json", response)
    client = Data4LibraryClient("fake-key", "https://example.test/api", policy.PROVIDER_TIMEOUT_SECONDS)
    libs, total = client.libraries("11010", 2, 100)
    assert total == 1 and libs[0].latitude is None and libs[0].longitude is None
    assert libs[0].closed_text == "모름" and libs[0].operating_time_text == "원문"
    assert "dtl_region=11010" in captured[0][0] and "pageNo=2" in captured[0][0]
    assert captured[0][2] == 5
    settings = Settings(app_env="test", database_url="postgresql+psycopg://localhost/localone_test")
    assert build_providers(settings).library_data is None


def test_nearby_ties_and_dateline(db_engine):
    with db_engine.connect() as conn:
        tx = conn.begin()
        try:
            for code, lat, lng in [("test-edge-a", 0, 179.999), ("test-edge-b", 0, 179.999), ("test-edge-c", 0, -179.999)]:
                conn.execute(text("INSERT INTO libraries(provider_lib_code,name,latitude,longitude,content_hash) VALUES(:code,:code,:lat,:lng,'x')"), {"code": code, "lat": lat, "lng": lng})
            found = libraries_nearby(conn, 0, 180, 3)
            assert len(found) == 3
            assert {lib.provider_lib_code for lib, d in found} == {"test-edge-a", "test-edge-b", "test-edge-c"}
            assert [lib.id for lib, d in found if lib.provider_lib_code != "test-edge-c"] == sorted(lib.id for lib, d in found if lib.provider_lib_code != "test-edge-c")
        finally:
            tx.rollback()
