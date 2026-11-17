"""LIB-0 발췌 이식: 실제 격리 DB 캐시·상한·외부 I/O 경계."""
import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event, text

from app import policy
from app.common import ApiError, KST
from app.services import provider_engine as pe
from tests.provider_fakes import FakeBookSearch, FakeLibraryData

NOW = datetime(1999, 1, 1, 12, tzinfo=KST)


def isbn(index=0):
    base = f"97800000{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


def book(index=0, **kwargs):
    return pe.BookInfo(isbn(index), f"이식 도서 {index:03}", **kwargs)


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def reference_db(db_engine):
    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM availability_observations WHERE book_id IN "
                              "(SELECT id FROM books WHERE isbn13 LIKE '97800000%')"))
            conn.execute(text("DELETE FROM popular_books_cache WHERE book_id IN "
                              "(SELECT id FROM books WHERE isbn13 LIKE '97800000%')"))
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE '97800000%'"))
            conn.execute(text("DELETE FROM provider_daily_usage WHERE usage_date BETWEEN '1999-01-01' AND '1999-01-10'"))
    clean()
    yield db_engine
    clean()


def seed_book(db, **kwargs):
    with db.begin() as conn:
        return pe.upsert_books(conn, [book(**kwargs)], "manual", NOW, overwrite=True)[0]


def engine(db, books=None, library=None, now=NOW):
    return pe.ProviderEngine(db, pe.Providers(books=books, library_data=library), now_fn=lambda: now)


@pytest.mark.parametrize("mode,reason", [("missing", "not_configured"), ("failure", "provider_error"), ("limit", "limit")])
def test_search_fallback_three_causes(reference_db, monkeypatch, mode, reason):
    seed_book(reference_db)
    fake = FakeBookSearch(error=pe.ProviderError("offline"))
    if mode == "limit":
        monkeypatch.setattr(policy, "KAKAO_DAILY_LIMIT", 0)
    result = run(engine(reference_db, None if mode == "missing" else fake).search_books("이식", 1))
    assert result.source == "cache" and result.fallback_reason == reason
    assert result.items[0].isbn13 == isbn()
    assert len(fake.calls) == (1 if mode == "failure" else 0)


@pytest.mark.parametrize("mode,status", [("missing", 503), ("failure", 503), ("limit", 429)])
def test_empty_fallback_is_not_success(reference_db, monkeypatch, mode, status):
    fake = FakeBookSearch(error=pe.ProviderError("offline"))
    if mode == "limit":
        monkeypatch.setattr(policy, "KAKAO_DAILY_LIMIT", 0)
    service = engine(reference_db, None if mode == "missing" else fake)
    for call in (service.search_books("이식", 1), service.get_book(isbn())):
        with pytest.raises(ApiError) as error:
            run(call)
        assert error.value.status_code == status
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM books WHERE isbn13 LIKE '97800000%'")).scalar_one() == 0
        if mode == "limit":
            assert conn.execute(text("SELECT count(*) FROM provider_daily_usage WHERE usage_date=:d"), {"d": NOW.date()}).scalar_one() == 0
    assert len(fake.calls) == (2 if mode == "failure" else 0)


def test_search_pages_and_repeated_upsert(reference_db):
    fake = FakeBookSearch([book(i) for i in range(25)])
    service = engine(reference_db, fake)
    first = run(service.search_books("이식", 1))
    second = run(service.search_books("이식", 21))
    repeat = run(service.search_books("이식", 1))
    assert len(first.items) == 20 and first.next_start == 21
    assert len(second.items) == 5 and second.next_start is None
    assert [b.id for b in repeat.items] == [b.id for b in first.items]
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM books WHERE isbn13 LIKE '97800000%'")).scalar_one() == 25


@pytest.mark.parametrize("raw,expected", [
    ("2014-05-19T00:00:00.000+09:00", 2014), ("2014", 2014), ("", None), ("abcd", None), ("9999", None)])
def test_kakao_description_year_and_update(reference_db, monkeypatch, raw, expected):
    seed_book(reference_db)
    monkeypatch.setattr(pe, "_http_get_json", lambda *args: {
        "meta": {"total_count": 1, "pageable_count": 1, "is_end": True}, "documents": [{
            "isbn": "8936434128 " + isbn(), "title": "<b>이식</b>", "contents": " <b>" + "가" * 2500 + "</b> ",
            "datetime": raw, "thumbnail": "http://example.test/cover", "authors": ["A", "B"]}]})
    service = engine(reference_db, pe.KakaoBookClient("rest-key", "https://example.test", 5))
    result = run(service.search_books("이식", 1)).items[0]
    assert result.description == "가" * 2000 and result.pub_year == expected
    assert result.cover_url == "https://example.test/cover" and result.author == "A, B"
    assert result.source == "kakao"
    with reference_db.connect() as conn:
        assert pe.select_book(conn, isbn()) == result


def test_kakao_request_paging_and_empty_cover(monkeypatch):
    sent = []

    def fake_get(url, headers, timeout):
        sent.append((url, headers))
        return {"meta": {"total_count": 99, "pageable_count": 45, "is_end": True},
                "documents": [{"isbn": isbn(), "title": "표지 없음", "thumbnail": "", "authors": []}]}

    monkeypatch.setattr(pe, "_http_get_json", fake_get)
    client = pe.KakaoBookClient("rest-key", "https://example.test/v3/search", 5)
    page = client.search("이식", 41, 20)
    assert "page=3" in sent[0][0] and "size=20" in sent[0][0] and sent[0][0].startswith("https://example.test/v3/search/book?")
    assert sent[0][1] == {"Authorization": "KakaoAK rest-key"}
    assert page.total == 45 and page.items[0].cover_url is None and page.items[0].author is None
    assert client.lookup_isbn(isbn()).title == "표지 없음" and "target=isbn" in sent[1][0]
    assert client.search("이식", 1001, 20) == pe.SearchPage(items=[], total=0) and len(sent) == 2


def test_popular_refresh_and_library_fallback(reference_db):
    fake = FakeLibraryData(popular={None: [book()]})
    service = engine(reference_db, library=fake)
    first = run(service.popular_books(None))
    assert first.scope == "national" and first.period_label == "전국 · 최근 30일 대출"
    assert run(service.popular_books(None)) == first and len(fake.calls) == 1
    next_day = engine(reference_db, library=fake, now=NOW + timedelta(days=1))
    assert not run(next_day.popular_books(None)).stale and len(fake.calls) == 2


@pytest.mark.parametrize("mode,reason", [("missing", "not_configured"), ("failure", "provider_error"), ("limit", "limit")])
def test_popular_stale_fallback(reference_db, monkeypatch, mode, reason):
    with reference_db.begin() as conn:
        pe._store_popular(conn, "national", None, [book()], "옛 기준", NOW - timedelta(days=1))
    fake = FakeLibraryData(popular={None: pe.ProviderError("offline")})
    if mode == "limit":
        monkeypatch.setattr(policy, "DATA4LIBRARY_DAILY_LIMIT", 0)
    result = run(engine(reference_db, library=None if mode == "missing" else fake).popular_books(None))
    assert result.stale and result.fallback_reason == reason and result.books[0].isbn13 == isbn()


def test_calls_reserve_before_io_outside_transactions(reference_db):
    active = set()
    def begun(conn): active.add(id(conn))
    def ended(conn): active.discard(id(conn))
    def before_call():
        assert not active, "외부 HTTP가 DB 트랜잭션 안에서 실행됨"
        with reference_db.connect() as conn:
            assert conn.execute(text("SELECT sum(call_count) FROM provider_daily_usage WHERE usage_date=:d"), {"d": NOW.date()}).scalar_one() >= 1
    for name, fn in [("begin", begun), ("commit", ended), ("rollback", ended)]:
        event.listen(reference_db, name, fn)
    try:
        service = engine(reference_db, FakeBookSearch([book()], on_call=before_call),
                         FakeLibraryData(popular={None: [book()]}, on_call=before_call))
        assert run(service.search_books("이식", 1)).items
        assert run(service.popular_books(None)).books
    finally:
        for name, fn in [("begin", begun), ("commit", ended), ("rollback", ended)]:
            event.remove(reference_db, name, fn)


def test_data4library_popular_parser(monkeypatch):
    monkeypatch.setattr(pe, "_http_get_json", lambda *args: {"response": {"docs": [{"doc": {
        "isbn13": isbn(), "bookname": "<b>이식</b>", "publication_year": "2014", "description": " <b>소개</b> "}}]}})
    result = pe.Data4LibraryClient("key", "https://example.test", 5).popular(None, NOW.date(), NOW.date(), 20)
    assert result[0].title == "이식" and result[0].description == "소개" and result[0].pub_year == 2014


def test_data4library_request_does_not_ask_for_application_json(monkeypatch):
    # 정보나루 실서버는 Accept: application/json에 406을 준다. 실제로 나가는 머리글을 본다
    sent = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, size):
            return b'{"response": {"docs": []}}'

    def fake_urlopen(request, timeout):
        sent.append(request.get_header("Accept"))
        return FakeResponse()

    monkeypatch.setattr(pe.urllib.request, "urlopen", fake_urlopen)
    pe.Data4LibraryClient("key", "https://example.test", 5).popular(None, NOW.date(), NOW.date(), 20)
    assert sent == ["*/*"]


def test_normalization_and_quiet_lookup(reference_db):
    assert pe.normalize_isbn("8936434128 9788936434120") == "9788936434120"
    assert pe.normalize_isbn("8936434128") == "9788936434120"
    assert pe.normalize_isbn("bad") is None
    assert pe.https_cover("javascript:bad") is None
    assert run(engine(reference_db).find_book_quietly(isbn())) is None


def test_quiet_lookup_does_not_hide_database_failure(refusing_db_url):
    from sqlalchemy import create_engine
    db = create_engine(refusing_db_url)
    try:
        with pytest.raises(ApiError) as error:
            run(engine(db).find_book_quietly(isbn()))
        assert error.value.code == "DB_UNAVAILABLE"
    finally:
        db.dispose()


class FakeHoldingProvider(FakeLibraryData):
    def __init__(self, result=None, outcomes=None, on_call=None):
        super().__init__(on_call=on_call)
        self.result = result if result is not None else pe.HoldingResult("yes", "yes")
        self.outcomes = outcomes or {}

    def book_exist(self, code, isbn13):
        self._enter("book_exist", (code, isbn13))
        result = self.outcomes.get(code, self.result)
        if isinstance(result, BaseException):
            raise result
        return result


@pytest.fixture
def availability_libraries(reference_db):
    with reference_db.begin() as conn:
        for i in range(45):
            conn.execute(text("""
                INSERT INTO libraries(id,provider_lib_code,name,address,tel,homepage,latitude,longitude,
                    dtl_region_code,isbn_search_url_template,content_hash)
                OVERRIDING SYSTEM VALUE
                VALUES(:id,:code,:name,'서울 화동','02-000-0000',:home,:lat,30,'98001',:template,'availability-test')
                ON CONFLICT(provider_lib_code) DO NOTHING
            """), {"id": 10000 + i, "code": f"availability-test-{i:02}", "name": f"시험관{i:02}",
                     "lat": 30 + i / 100 if i < 3 else 31,
                     "home": "https://example.test" if i == 1 else None,
                     "template": "https://example.test/search?isbn={isbn13}" if i == 0 else None})
        libraries = pe.libraries_in_region(conn, "98001")
    yield libraries
    with reference_db.begin() as conn:
        ids = [lib.id for lib in libraries]
        conn.execute(text("DELETE FROM availability_observations WHERE library_id=ANY(:ids)"), {"ids": ids})
        conn.execute(text("DELETE FROM libraries WHERE id=ANY(:ids)"), {"ids": ids})


@pytest.mark.parametrize("cause,reason", [("missing", "not_configured"), ("error", "provider_error"),
                                         ("timeout", "provider_error"), ("unknown", "provider_error")])
def test_availability_failure_unknown_not_stored(reference_db, availability_libraries, cause, reason):
    seed_book(reference_db)
    outcome = {"error": pe.ProviderError("offline"), "timeout": TimeoutError(),
               "unknown": pe.HoldingResult("yes", "unknown")}.get(cause)
    provider = None if cause == "missing" else FakeHoldingProvider(outcome)
    result = run(engine(reference_db, library=provider).availability(isbn(), availability_libraries[:1]))
    assert result[0].holding == result[0].loanable == "unknown"
    assert result[0].basis == "none" and result[0].fallback_reason == reason
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM availability_observations WHERE library_id=:l"), {"l": availability_libraries[0].id}).scalar_one() == 0


def test_availability_cached_today_and_refresh_next_day(reference_db, availability_libraries):
    seed_book(reference_db)
    fake = FakeHoldingProvider()
    service = engine(reference_db, library=fake)
    first = run(service.availability(isbn(), availability_libraries[:1]))[0]
    second = run(service.availability(isbn(), availability_libraries[:1]))[0]
    assert first == second and len(fake.calls) == 1
    assert first.data_date == NOW.date() - timedelta(days=1) and first.data_date_assumed
    assert first.basis == "today" and first.holding == first.loanable == "yes"
    run(engine(reference_db, library=fake, now=NOW + timedelta(days=1)).availability(isbn(), availability_libraries[:1]))
    assert len(fake.calls) == 2


@pytest.mark.parametrize("cause,reason", [("missing", "not_configured"), ("error", "provider_error"), ("limit", "limit")])
def test_availability_stale_fallback(reference_db, availability_libraries, monkeypatch, cause, reason):
    seed_book(reference_db)
    success = FakeHoldingProvider(pe.HoldingResult("yes", "no", NOW.date()))
    run(engine(reference_db, library=success).availability(isbn(), availability_libraries[:1]))
    if cause == "limit": monkeypatch.setattr(policy, "DATA4LIBRARY_DAILY_LIMIT", 0)
    fake = None if cause == "missing" else FakeHoldingProvider(pe.ProviderError("offline"))
    result = run(engine(reference_db, library=fake, now=NOW + timedelta(days=1)).availability(isbn(), availability_libraries[:1]))[0]
    assert result.holding == "yes" and result.loanable == "no" and result.basis == "stale"
    assert result.fallback_reason == reason and result.data_date == NOW.date()
    assert result.data_date_assumed is False


def test_availability_caps_at_40(reference_db, availability_libraries):
    seed_book(reference_db)
    fake = FakeHoldingProvider()
    result = run(engine(reference_db, library=fake).availability(isbn(), availability_libraries))
    assert policy.AVAILABILITY_MAX_CALLS_PER_REQUEST == 40
    assert len(fake.calls) == 40 and len(result) == 45
    assert all(r.holding == "yes" for r in result[:40])
    assert all(r.holding == r.loanable == "unknown" and r.fallback_reason == "limit" for r in result[40:])
    with reference_db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM availability_observations WHERE library_id=ANY(:ids)"), {"ids": [lib.id for lib in availability_libraries]}).scalar_one() == 40


def test_availability_limit_empty_429_no_call(reference_db, availability_libraries, monkeypatch):
    seed_book(reference_db)
    monkeypatch.setattr(policy, "DATA4LIBRARY_DAILY_LIMIT", 0)
    fake = FakeHoldingProvider()
    with pytest.raises(ApiError) as error:
        run(engine(reference_db, library=fake).availability(isbn(), availability_libraries[:1]))
    assert error.value.status_code == 429 and error.value.code == "PROVIDER_LIMIT"
    assert fake.calls == []


def test_availability_empty_does_not_lookup_book(reference_db):
    fake = FakeBookSearch(error=AssertionError("must not call"))
    assert run(engine(reference_db, books=fake).availability(isbn(), [])) == []
    assert not fake.calls


def test_availability_http_outside_transaction(reference_db, availability_libraries, monkeypatch):
    from contextvars import ContextVar
    seed_book(reference_db)
    in_db = ContextVar("availability_in_db", default=False)
    original = pe.run_db
    async def tracked(db, fn):
        token = in_db.set(True)
        try:
            return await original(db, fn)
        finally:
            in_db.reset(token)
    def check(): assert not in_db.get(), "외부 호출이 해당 요청의 run_db 범위 안에서 실행됨"
    monkeypatch.setattr(pe, "run_db", tracked)
    assert run(engine(reference_db, library=FakeHoldingProvider(on_call=check)).availability(isbn(), availability_libraries[:3]))


@pytest.mark.parametrize("payload,expected", [({"hasBook": "Y", "loanAvailable": "Y"}, ("yes", "yes")),
                                            ({"hasBook": "Y", "loanAvailable": "N"}, ("yes", "no")),
                                            ({"hasBook": "N"}, ("no", "no")),
                                            ({"hasBook": "?"}, None), ({"hasBook": "Y", "loanAvailable": "?"}, None)])
def test_book_exist_parser_rejects_unknown(monkeypatch, payload, expected):
    monkeypatch.setattr(pe, "_http_get_json", lambda *args: {"response": {"result": payload}})
    provider = pe.Data4LibraryClient("key", "https://example.test", 5)
    if expected is None:
        with pytest.raises(pe.ProviderError): provider.book_exist("test", isbn())
    else:
        result = provider.book_exist("test", isbn())
        assert (result.holding, result.loanable) == expected


def test_detail_fills_missing_metadata_without_duplicate(reference_db):
    cached = seed_book(reference_db)
    fake = FakeBookSearch([book(description="새 소개", pub_year=2014)])
    service = engine(reference_db, fake)
    refreshed = run(service.get_book(isbn()))
    assert refreshed.id == cached.id
    assert refreshed.description == "새 소개" and refreshed.pub_year == 2014
    assert run(service.get_book(isbn())) == refreshed and len(fake.calls) == 1



@pytest.mark.parametrize("cause", ["missing", "error", "limit", "no_data"])
def test_detail_enrichment_failure_preserves_cache(reference_db, monkeypatch, cause):
    cached = seed_book(reference_db)
    fake = FakeBookSearch(error=pe.ProviderError("offline")) if cause == "error" else FakeBookSearch([])
    if cause == "limit": monkeypatch.setattr(policy, "KAKAO_DAILY_LIMIT", 0)
    assert run(engine(reference_db, None if cause == "missing" else fake).get_book(isbn())) == cached
