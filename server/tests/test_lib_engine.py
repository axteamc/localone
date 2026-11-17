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
        monkeypatch.setattr(policy, "NAVER_DAILY_LIMIT", 0)
    result = run(engine(reference_db, None if mode == "missing" else fake).search_books("이식", 1))
    assert result.source == "cache" and result.fallback_reason == reason
    assert result.items[0].isbn13 == isbn()
    assert len(fake.calls) == (1 if mode == "failure" else 0)


@pytest.mark.parametrize("mode,status", [("missing", 503), ("failure", 503), ("limit", 429)])
def test_empty_fallback_is_not_success(reference_db, monkeypatch, mode, status):
    fake = FakeBookSearch(error=pe.ProviderError("offline"))
    if mode == "limit":
        monkeypatch.setattr(policy, "NAVER_DAILY_LIMIT", 0)
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


@pytest.mark.parametrize("raw,expected", [("20140519", 2014), ("2014", 2014), ("", None), ("abcd", None), ("9999", None)])
def test_naver_description_year_and_update(reference_db, monkeypatch, raw, expected):
    seed_book(reference_db)
    monkeypatch.setattr(pe, "_http_get_json", lambda *args: {"total": 1, "items": [{
        "isbn": isbn(), "title": "<b>이식</b>", "description": " <b>" + "가" * 2500 + "</b> ",
        "pubdate": raw, "image": "http://example.test/cover", "author": "A^B"}]})
    service = engine(reference_db, pe.NaverBookClient("id", "secret", "https://example.test", 5))
    result = run(service.search_books("이식", 1)).items[0]
    assert result.description == "가" * 2000 and result.pub_year == expected
    assert result.cover_url == "https://example.test/cover" and result.author == "A, B"
    with reference_db.connect() as conn:
        assert pe.select_book(conn, isbn()) == result


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
