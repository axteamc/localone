"""LIB-0 HTTP 계약: 실제 엔진+격리 DB, 외부 제공자만 대역."""
import ast
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import policy
from app.main import create_app
from app.settings import Settings
from app.services import provider_engine as pe
from tests.provider_fakes import FakeBookSearch, FakeLibraryData, public_reference_data
from tests.test_lib_engine import NOW, book, engine, isbn, reference_db, seed_book
from tests.test_lib_engine import FakeHoldingProvider, availability_libraries
from tests.test_yes24_curated import FakeYes24Provider, make_yes24_item, yes24_db  # noqa: F401


@pytest.fixture
def client(test_db_url, reference_db, public_reference_data):
    app = create_app(Settings(app_env="test", database_url=test_db_url))
    app.state.provider_engine = engine(reference_db)
    with TestClient(app) as c:
        yield c


def test_search_without_key_returns_seed_cache(client, reference_db):
    seed_book(reference_db)
    response = client.get("/api/v1/books/search?q=이식")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "cache" and body["fallback_reason"] == "not_configured"
    assert body["items"][0]["isbn13"] == isbn()


def test_search_with_provider_and_detail_saves_once(client, reference_db):
    fake = FakeBookSearch([book(cover_url="http://example.test/cover", description="소개", pub_year=2014)])
    client.app.state.provider_engine = engine(reference_db, fake)
    first = client.get(f"/api/v1/books/{isbn()}")
    second = client.get(f"/api/v1/books/{isbn()}")
    assert first.status_code == second.status_code == 200 and first.json() == second.json()
    assert len(fake.calls) == 1
    assert first.json() == {"isbn13": isbn(), "title": "이식 도서 000", "author": None,
                            "publisher": None, "cover_url": "https://example.test/cover",
                            "source": "kakao", "description": "소개", "pub_year": 2014}
    response = client.get("/api/v1/books/search?q=이식")
    assert response.status_code == 200 and response.json()["source"] == "kakao"
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM books WHERE isbn13=:i"), {"i": isbn()}).scalar_one() == 1


@pytest.mark.parametrize("query,field", [("", "q"), ("q=", "q"), ("q=%20", "q"),
                                         ("q=" + "a" * 101, "q"), ("q=a&start=0", "start"), ("q=a&start=1001", "start")])
def test_search_validation(client, reference_db, query, field):
    fake = FakeBookSearch([book()])
    client.app.state.provider_engine = engine(reference_db, fake)
    response = client.get("/api/v1/books/search?" + query)
    assert response.status_code == 422 and response.json()["error"]["detail"] == field
    assert fake.calls == []
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM books WHERE isbn13 LIKE '97800000%'")).scalar_one() == 0


@pytest.mark.parametrize("mode,status,code", [("failure", 503, "PROVIDER_UNAVAILABLE"), ("missing", 503, "PROVIDER_UNAVAILABLE"), ("limit", 429, "PROVIDER_LIMIT")])
def test_search_failure_without_cache(client, reference_db, monkeypatch, mode, status, code):
    fake = FakeBookSearch(error=pe.ProviderError("offline"))
    if mode == "limit": monkeypatch.setattr(policy, "KAKAO_DAILY_LIMIT", 0)
    client.app.state.provider_engine = engine(reference_db, None if mode == "missing" else fake)
    response = client.get("/api/v1/books/search?q=이식")
    assert response.status_code == status and response.json()["error"]["code"] == code
    if mode == "limit": assert not fake.calls


def test_book_detail_bad_isbn_and_unknown(client, reference_db):
    fake = FakeBookSearch([])
    client.app.state.provider_engine = engine(reference_db, fake)
    response = client.get("/api/v1/books/9788936434121")
    assert response.status_code == 422 and response.json()["error"]["detail"] == "isbn13"
    assert fake.calls == []
    response = client.get(f"/api/v1/books/{isbn()}")
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"


def test_recommendations_national_popular(client, reference_db):
    fake = FakeLibraryData(popular={None: [book(i) for i in range(25)]})
    client.app.state.provider_engine = engine(reference_db, library=fake)
    path = "/api/v1/books/recommendations?source=library_loan"
    response = client.get(path)
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "popular" and body["theme"] is None
    assert body["scope"] == "national" and body["library_id"] is None
    assert body["basis_label"] == "전국 · 최근 30일 대출"
    assert len(body["books"]) == 20 and body["fetched_at"].endswith("+09:00")
    assert body["stale"] is False and body["fallback_reason"] is None
    assert client.get(path).json() == body
    assert len(fake.calls) == 1


@pytest.mark.parametrize("source,kind,label", [
    (None, "steady", "스테디셀러"),
    ("yes24_steady", "steady", "스테디셀러"),
    ("yes24_bestseller", "bestseller", "베스트셀러"),
])
def test_recommendations_selects_yes24_and_reuses_cache(client, yes24_db, source, kind, label):
    items = [make_yes24_item(1), make_yes24_item(2)]
    yes24 = FakeYes24Provider(pe.Yes24CuratedPage(items))
    library = FakeLibraryData(popular={None: [book()]})
    client.app.state.provider_engine = pe.ProviderEngine(
        yes24_db, pe.Providers(yes24=yes24, library_data=library), now_fn=lambda: NOW
    )
    path = "/api/v1/books/recommendations"
    params = {} if source is None else {"source": source}
    response = client.get(path, params=params)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "kind", "scope", "library_id", "basis_label", "theme", "books",
        "fetched_at", "stale", "fallback_reason",
    }
    assert (body["kind"], body["scope"], body["library_id"], body["theme"]) == (
        "popular", "national", None, None
    )
    assert body["basis_label"] == f"YES24 {label} · 국내도서"
    assert body["fetched_at"] == NOW.isoformat() and body["stale"] is False
    assert body["fallback_reason"] is None
    assert [b["isbn13"] for b in body["books"]] == [item.isbn13 for item in items]
    assert all(b["source"] == "yes24" for b in body["books"])
    assert client.get(path, params=params).json() == body
    assert yes24.calls == [("curated_list", (kind, "001", 1, 100))]
    assert library.calls == []


@pytest.mark.parametrize("reason", ["not_configured", "no_data", "provider_error", "limit"])
def test_recommendations_falls_back_to_library_loans(client, reference_db, monkeypatch, reason):
    yes24 = None if reason == "not_configured" else FakeYes24Provider(
        pe.ProviderError("offline") if reason == "provider_error" else None
    )
    if reason == "limit":
        monkeypatch.setattr(policy, "YES24_DAILY_LIMIT", 0)
    library = FakeLibraryData(popular={None: [book()]})
    client.app.state.provider_engine = pe.ProviderEngine(
        reference_db, pe.Providers(yes24=yes24, library_data=library), now_fn=lambda: NOW
    )
    response = client.get("/api/v1/books/recommendations")
    assert response.status_code == 200
    body = response.json()
    assert body["basis_label"] == "전국 · 최근 30일 대출"
    assert body["fallback_reason"] == reason and body["stale"] is False
    assert [b["isbn13"] for b in body["books"]] == [isbn()]
    if reason == "limit":
        assert yes24.calls == []


def test_recommendations_uses_stale_yes24_only_if_loans_fail(client, yes24_db):
    yes24 = FakeYes24Provider(pe.Yes24CuratedPage([make_yes24_item(1)]))
    providers = pe.Providers(yes24=yes24)
    path = "/api/v1/books/recommendations?source=yes24_bestseller"
    client.app.state.provider_engine = pe.ProviderEngine(yes24_db, providers, now_fn=lambda: NOW)
    assert client.get(path).status_code == 200
    tomorrow = NOW + timedelta(days=1)
    yes24.curated_page = pe.ProviderError("offline")
    client.app.state.provider_engine = pe.ProviderEngine(yes24_db, providers, now_fn=lambda: tomorrow)
    cached = client.get(path)
    assert cached.status_code == 200
    assert cached.json()["stale"] is True and cached.json()["fallback_reason"] == "provider_error"
    assert cached.json()["basis_label"] == "YES24 베스트셀러 · 국내도서"

    providers = pe.Providers(yes24=yes24, library_data=FakeLibraryData(popular={None: [book()]}))
    client.app.state.provider_engine = pe.ProviderEngine(yes24_db, providers, now_fn=lambda: tomorrow)
    fallback = client.get(path)
    assert fallback.status_code == 200
    assert fallback.json()["stale"] is False and fallback.json()["fallback_reason"] == "provider_error"
    assert fallback.json()["basis_label"] == "전국 · 최근 30일 대출"

    # 양쪽 모두 stale이면 원래 요청한 YES24 stale 캐시를 유지한다
    day_after = NOW + timedelta(days=2)
    failing_library = FakeLibraryData(popular={None: pe.ProviderError("offline")})
    providers = pe.Providers(yes24=yes24, library_data=failing_library)
    client.app.state.provider_engine = pe.ProviderEngine(yes24_db, providers, now_fn=lambda: day_after)
    both_stale = client.get(path)
    assert both_stale.status_code == 200
    assert both_stale.json()["stale"] is True and both_stale.json()["fallback_reason"] == "provider_error"
    assert both_stale.json()["basis_label"] == "YES24 베스트셀러 · 국내도서"


def test_recommendations_yes24_limit_without_any_cache_is_429(client, reference_db, monkeypatch):
    monkeypatch.setattr(policy, "YES24_DAILY_LIMIT", 0)
    yes24 = FakeYes24Provider()
    client.app.state.provider_engine = pe.ProviderEngine(
        reference_db, pe.Providers(yes24=yes24), now_fn=lambda: NOW
    )
    response = client.get("/api/v1/books/recommendations")
    assert response.status_code == 429 and response.json()["error"]["code"] == "PROVIDER_LIMIT"
    assert yes24.calls == []


def test_recommendations_source_validation_and_library_priority(client, reference_db):
    yes24 = FakeYes24Provider()
    library = FakeLibraryData(popular={"test-101": [book()]})
    client.app.state.provider_engine = pe.ProviderEngine(
        reference_db, pe.Providers(yes24=yes24, library_data=library), now_fn=lambda: NOW
    )
    path = "/api/v1/books/recommendations"
    invalid = client.get(path, params={"library_id": 101, "source": "invalid"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert invalid.json()["error"]["detail"] == "source"
    assert yes24.calls == library.calls == []

    response = client.get(path, params={"library_id": 101, "source": "yes24_bestseller"})
    assert response.status_code == 200
    assert response.json()["scope"] == "library" and response.json()["library_id"] == 101
    assert yes24.calls == []


def test_recommendations_library_falls_back_to_national(client, reference_db):
    fake = FakeLibraryData(popular={"test-101": pe.ProviderError("offline"), None: [book()]})
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get("/api/v1/books/recommendations?library_id=101")
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "national" and body["library_id"] is None
    assert "전국" in body["basis_label"] and body["fallback_reason"] == "provider_error"


def test_library_popular_cache_three_days(client, reference_db):
    fake = FakeLibraryData(popular={"test-101": [book()]})
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get("/api/v1/books/recommendations?library_id=101")
    assert response.status_code == 200 and response.json()["scope"] == "library"
    for days, calls in [(2, 1), (3, 2)]:
        client.app.state.provider_engine = engine(reference_db, library=fake, now=NOW + timedelta(days=days))
        assert client.get("/api/v1/books/recommendations?library_id=101").status_code == 200
        assert len(fake.calls) == calls


@pytest.mark.parametrize("id_,status", [(999999999, 404), (0, 422), (2**63, 422)])
def test_recommendations_unknown_library(client, reference_db, id_, status):
    fake = FakeLibraryData()
    client.app.state.provider_engine = engine(reference_db, library=fake)
    assert client.get(f"/api/v1/books/recommendations?library_id={id_}").status_code == status
    assert fake.calls == []


def test_recommendations_nothing_at_all_is_503(client):
    response = client.get("/api/v1/books/recommendations")
    assert response.status_code == 503 and response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"


def test_routers_have_no_http_client_imports():
    for path in (Path(__file__).parents[1] / "app" / "routers").glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                assert all(n.name.split(".")[0] not in {"httpx", "requests", "urllib"} for n in node.names)
            elif isinstance(node, ast.ImportFrom):
                assert (node.module or "").split(".")[0] not in {"httpx", "requests", "urllib"}


def test_availability_nearby_three_states_and_live_check(client, reference_db, availability_libraries):
    seed_book(reference_db)
    fake = FakeHoldingProvider(outcomes={"availability-test-01": pe.HoldingResult("no", "no"),
                                        "availability-test-02": pe.ProviderError("offline")})
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get(f"/api/v1/books/{isbn()}/availability?scope=nearby&lat=30&lng=30")
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "nearby" and body["radius_km"] == 3 and body["dtl_region"] is None
    assert body["checked_at"].endswith("+09:00")
    assert [item["holding"] for item in body["items"]] == ["yes", "no", "unknown"]
    assert [item["live_check"]["kind"] if item["live_check"] else None for item in body["items"]] == ["isbn_search", "homepage", None]
    for item in body["items"]:
        lib = item["library"]
        assert set(lib) == {"id", "name", "address", "tel", "area_label", "distance_m", "today"}
        assert lib["tel"] == "02-000-0000" and lib["area_label"] == "화동"
        assert set(lib["today"]) == {"date", "is_closed", "hours_text", "holiday_unchecked"}
    assert len(fake.calls) == 3


def test_availability_city_40_and_single_library(client, reference_db, availability_libraries):
    seed_book(reference_db)
    fake = FakeHoldingProvider()
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get(f"/api/v1/books/{isbn()}/availability?scope=city&dtl_region=98001")
    assert response.status_code == 200 and response.json()["scope"] == "city"
    items = response.json()["items"]
    assert len(items) == 45 and len(fake.calls) == 40
    assert all(i["fallback_reason"] == "limit" and i["holding"] == "unknown" for i in items[40:])
    response = client.get(f"/api/v1/books/{isbn()}/availability?library_id={availability_libraries[0].id}")
    assert response.status_code == 200 and response.json()["scope"] == "library"
    assert len(response.json()["items"]) == 1 and len(fake.calls) == 40


@pytest.mark.parametrize("query,field", [("", "scope"), ("scope=bad", "scope"), ("scope=nearby", "lat,lng"),
    ("scope=nearby&lat=30&lng=30&radius_km=4", "radius_km"), ("scope=city", "dtl_region"),
    ("scope=city&dtl_region=98001&lat=30", "dtl_region"), ("library_id=101&scope=city", "library_id,scope"),
    ("library_id=0", "library_id"), ("library_id=9223372036854775808", "library_id"),
    ("scope=city&dtl_region=123", "dtl_region"), ("scope=nearby&lat=nan&lng=30", "lat")])
def test_availability_validation(client, reference_db, query, field):
    fake = FakeHoldingProvider()
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get(f"/api/v1/books/{isbn()}/availability?{query}")
    assert response.status_code == 422 and response.json()["error"]["detail"] == field
    assert not fake.calls


def test_availability_failure_and_no_results(client, reference_db, availability_libraries):
    seed_book(reference_db)
    fake = FakeHoldingProvider(pe.ProviderError("offline"))
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get(f"/api/v1/books/{isbn()}/availability?library_id={availability_libraries[0].id}")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["holding"] == item["loanable"] == "unknown" and item["fallback_reason"] == "provider_error"
    calls = len(fake.calls)
    response = client.get(f"/api/v1/books/{isbn()}/availability?scope=nearby&lat=80&lng=80")
    assert response.status_code == 200 and response.json()["items"] == [] and len(fake.calls) == calls
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM availability_observations WHERE library_id=ANY(:ids)"), {"ids": [lib.id for lib in availability_libraries]}).scalar_one() == 0


def test_availability_all_limited_is_429(client, reference_db, availability_libraries, monkeypatch):
    seed_book(reference_db)
    fake = FakeHoldingProvider()
    monkeypatch.setattr(policy, "DATA4LIBRARY_DAILY_LIMIT", 0)
    client.app.state.provider_engine = engine(reference_db, library=fake)
    response = client.get(f"/api/v1/books/{isbn()}/availability?library_id={availability_libraries[0].id}")
    assert response.status_code == 429 and response.json()["error"]["code"] == "PROVIDER_LIMIT"
    assert not fake.calls


def test_purchase_link_and_invalid_isbn(client):
    response = client.get(f"/api/v1/books/{isbn()}/purchase-link")
    assert response.status_code == 200
    assert response.json() == {"isbn13": isbn(), "provider": "yes24", "kind": "search",
                               "url": f"https://www.yes24.com/Product/Search?domain=BOOK&query={isbn()}"}
    assert client.get("/api/v1/books/bad/purchase-link").status_code == 422
    assert client.get("/api/v1/books/bad/availability?library_id=101").status_code == 422
    assert client.get(f"/api/v1/books/{isbn()}/availability?library_id=9999999").status_code == 404


def test_purchase_link_returns_product_or_search(client, yes24_db):
    item = make_yes24_item(1)
    unavailable = make_yes24_item(2)
    yes24 = FakeYes24Provider(details={
        item.isbn13: item, unavailable.isbn13: pe.ProviderError("offline")
    })
    client.app.state.provider_engine = pe.ProviderEngine(
        yes24_db, pe.Providers(yes24=yes24), now_fn=lambda: NOW
    )
    invalid = client.get("/api/v1/books/bad/purchase-link")
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert invalid.json()["error"]["detail"] == "isbn13"
    assert yes24.calls == []

    path = f"/api/v1/books/{item.isbn13}/purchase-link"
    direct = client.get(path)
    assert direct.status_code == 200
    assert direct.json() == {
        "isbn13": item.isbn13, "provider": "yes24", "kind": "product", "url": item.product_url,
    }
    assert client.get(path).json() == direct.json()
    fallback = client.get(f"/api/v1/books/{unavailable.isbn13}/purchase-link")
    assert fallback.status_code == 200
    assert fallback.json() == {
        "isbn13": unavailable.isbn13, "provider": "yes24", "kind": "search",
        "url": policy.YES24_SEARCH_URL_TEMPLATE.format(isbn13=unavailable.isbn13),
    }
    assert yes24.calls == [("item_detail", item.isbn13), ("item_detail", unavailable.isbn13)]
