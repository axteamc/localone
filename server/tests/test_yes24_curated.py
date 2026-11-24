"""YES24 큐레이션 및 구매 직링크(2단계: DB·엔진·CLI) 검증 테스트(C-81, K23)."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timedelta
import io
import json
from typing import Any
import urllib.error

from alembic import command
import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError

from app import policy
from app.common import KST
from app.services import provider_engine as pe
from app.settings import Settings

NOW = datetime(1999, 2, 1, 12, 0, tzinfo=KST)
TEST_ISBN_PREFIX = "97800001"


def make_isbn(index: int) -> str:
    base = f"{TEST_ISBN_PREFIX}{index:04d}"
    check = (-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10
    return base + str(check)


def make_yes24_item(index: int, **overrides: Any) -> pe.Yes24Item:
    isbn13 = overrides.pop("isbn13", make_isbn(index))
    defaults: dict[str, Any] = {
        "sort_order": index + 1,
        "item_id": str(100000 + index),
        "isbn13": isbn13,
        "title": f"예스24 스테디 {index:03d}",
        "author": f"저자 {index:03d}",
        "publisher": "테스트출판사",
        "goods_type": "도서",
        "goods_sort_nm": "국내도서-소설/시/희곡-한국소설",
        "adult_yn": "N",
        "pub_year": 2023,
        "item_status": "판매중",
        "cover_url": f"https://image.yes24.com/goods/{100000 + index}/XL",
        "product_url": f"https://www.yes24.com/product/goods/{100000 + index}",
        "description": f"예스24 도서 소개 {index:03d}",
    }
    defaults.update(overrides)
    return pe.Yes24Item(**defaults)


class FakeYes24Provider:
    def __init__(
        self,
        curated_page: pe.Yes24CuratedPage | BaseException | None = None,
        details: dict[str, pe.Yes24Item | BaseException | None] | None = None,
        *,
        on_call: Callable[[], None] | None = None,
    ) -> None:
        self.curated_page = curated_page if curated_page is not None else pe.Yes24CuratedPage(items=[])
        self.details = details or {}
        self.on_call = on_call
        self.calls: list[tuple[str, Any]] = []

    def curated_list(
        self,
        list_kind: str,
        category_id: str,
        page: int = 1,
        size: int = policy.YES24_CURATED_FETCH_SIZE,
    ) -> pe.Yes24CuratedPage:
        self.calls.append(("curated_list", (list_kind, category_id, page, size)))
        if self.on_call:
            self.on_call()
        if isinstance(self.curated_page, BaseException):
            raise self.curated_page
        return self.curated_page

    def item_detail(self, isbn13: str) -> pe.Yes24Item | None:
        self.calls.append(("item_detail", isbn13))
        if self.on_call:
            self.on_call()
        val = self.details.get(isbn13)
        if isinstance(val, BaseException):
            raise val
        return val


def run(coro: Any) -> Any:
    return asyncio.run(coro)


@pytest.fixture
def yes24_db(db_engine):
    def clean() -> None:
        with db_engine.begin() as conn:
            conn.execute(
                text(
                    "DELETE FROM curated_books_cache WHERE book_id IN "
                    "(SELECT id FROM books WHERE isbn13 LIKE :p)"
                ),
                {"p": f"{TEST_ISBN_PREFIX}%"},
            )
            conn.execute(
                text(
                    "DELETE FROM book_purchase_links WHERE book_id IN "
                    "(SELECT id FROM books WHERE isbn13 LIKE :p)"
                ),
                {"p": f"{TEST_ISBN_PREFIX}%"},
            )
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": f"{TEST_ISBN_PREFIX}%"})
            conn.execute(
                text(
                    "DELETE FROM provider_daily_usage "
                    "WHERE provider = 'yes24' AND usage_date BETWEEN '1999-02-01' AND '1999-03-01'"
                )
            )

    clean()
    yield db_engine
    clean()


def make_engine(db, yes24=None, now: datetime = NOW) -> pe.ProviderEngine:
    return pe.ProviderEngine(db, pe.Providers(yes24=yes24), now_fn=lambda: now)


# ─────────── 1. 마이그레이션 왕복 · RLS · CHECK/UNIQUE 제약 ───────────


def test_0026_migration_roundtrip_and_downgrade_converts_yes24_source(yes24_db, alembic_config):
    isbn13 = make_isbn(900)
    with yes24_db.begin() as conn:
        book_id = conn.execute(
            text(
                "INSERT INTO books (isbn13, title, source) VALUES (:i, '예스24 책', 'yes24') RETURNING id"
            ),
            {"i": isbn13},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO curated_books_cache "
                "(provider, list_kind, category_id, rank, book_id, basis_label) "
                "VALUES ('yes24', 'steady', '001', 1, :bid, 'YES24 스테디셀러 · 국내도서')"
            ),
            {"bid": book_id},
        )
        conn.execute(
            text(
                "INSERT INTO book_purchase_links "
                "(book_id, provider, external_item_id, product_url, item_status) "
                "VALUES (:bid, 'yes24', '999', 'https://www.yes24.com/product/goods/999', '판매중')"
            ),
            {"bid": book_id},
        )

    try:
        command.downgrade(alembic_config, "-1")
        with yes24_db.connect() as conn:
            assert conn.execute(text("SELECT to_regclass('public.curated_books_cache')")).scalar_one() is None
            assert conn.execute(text("SELECT to_regclass('public.book_purchase_links')")).scalar_one() is None
            source = conn.execute(
                text("SELECT source FROM books WHERE isbn13 = :i"), {"i": isbn13}
            ).scalar_one()
            assert source == "data4library"
        with pytest.raises(IntegrityError):
            with yes24_db.begin() as conn:
                conn.execute(
                    text("INSERT INTO books (isbn13, title, source) VALUES (:i, '거부', 'yes24')"),
                    {"i": make_isbn(901)},
                )
    finally:
        command.upgrade(alembic_config, "head")

    with yes24_db.connect() as conn:
        assert conn.execute(text("SELECT to_regclass('public.curated_books_cache')")).scalar_one() is not None
        assert conn.execute(text("SELECT to_regclass('public.book_purchase_links')")).scalar_one() is not None


def test_0026_rls_enabled_with_zero_policies(yes24_db):
    with yes24_db.connect() as conn:
        for table in ("curated_books_cache", "book_purchase_links"):
            enabled = conn.execute(
                text(
                    "SELECT relrowsecurity FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = 'public' AND c.relname = :t"
                ),
                {"t": table},
            ).scalar_one()
            policies = conn.execute(
                text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = :t"),
                {"t": table},
            ).scalar_one()
            assert enabled is True
            assert policies == 0


def test_0026_table_check_and_unique_constraints(yes24_db):
    with yes24_db.begin() as conn:
        bid1 = conn.execute(
            text("INSERT INTO books (isbn13, title, source) VALUES (:i, '책1', 'yes24') RETURNING id"),
            {"i": make_isbn(910)},
        ).scalar_one()
        bid2 = conn.execute(
            text("INSERT INTO books (isbn13, title, source) VALUES (:i, '책2', 'yes24') RETURNING id"),
            {"i": make_isbn(911)},
        ).scalar_one()

    bad_curated = [
        ("naver", "steady", "001", 1, bid1),  # invalid provider
        ("yes24", "unknown", "001", 1, bid1),  # invalid list_kind
        ("yes24", "steady", "   ", 1, bid1),  # blank category_id
        ("yes24", "steady", "001", 0, bid1),  # rank < 1
        ("yes24", "steady", "001", 101, bid1),  # rank > 100
    ]
    for provider, kind, cat, rank, bid in bad_curated:
        with pytest.raises(IntegrityError):
            with yes24_db.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO curated_books_cache "
                        "(provider, list_kind, category_id, rank, book_id, basis_label) "
                        "VALUES (:p, :k, :c, :r, :b, '라벨')"
                    ),
                    {"p": provider, "k": kind, "c": cat, "r": rank, "b": bid},
                )

    with yes24_db.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO curated_books_cache "
                "(provider, list_kind, category_id, rank, book_id, basis_label) "
                "VALUES ('yes24', 'steady', '001', 1, :b, '라벨')"
            ),
            {"b": bid1},
        )
    # 중복 rank 거부
    with pytest.raises(IntegrityError):
        with yes24_db.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO curated_books_cache "
                    "(provider, list_kind, category_id, rank, book_id, basis_label) "
                    "VALUES ('yes24', 'steady', '001', 1, :b, '라벨')"
                ),
                {"b": bid2},
            )
    # 중복 book_id 거부
    with pytest.raises(IntegrityError):
        with yes24_db.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO curated_books_cache "
                    "(provider, list_kind, category_id, rank, book_id, basis_label) "
                    "VALUES ('yes24', 'steady', '001', 2, :b, '라벨')"
                ),
                {"b": bid1},
            )

    # book_purchase_links CHECK: 타 도메인·javascript URL 거부
    for bad_url in ("https://evil.example/product/1", "http://www.yes24.com/product/1", "javascript:alert(1)"):
        with pytest.raises(IntegrityError):
            with yes24_db.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO book_purchase_links "
                        "(book_id, provider, external_item_id, product_url, item_status) "
                        "VALUES (:b, 'yes24', '1', :u, '판매중')"
                    ),
                    {"b": bid1, "u": bad_url},
                )


# ─────────── 2. Yes24Client HTTP 파서 · 헤더 · 오류 코드 ───────────


def test_yes24_client_auth_header_and_parsing(monkeypatch):
    sent: list[tuple[str, str | None]] = []
    isbn_main = make_isbn(1)
    isbn_from_10 = "9788936434120"

    class FakeResp:
        def __init__(self, body: bytes) -> None:
            self._body = body

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, size: int) -> bytes:
            return self._body[:size]

    payload = {
        "success": True,
        "message": "OK",
        "errorCode": None,
        "data": {
            "meta": {"apiTitle": "스테디셀러", "pubDate": "2026-11-24T09:00:00+09:00"},
            "currentPage": 1,
            "pageSize": 100,
            "totalCount": 2,
            "items": [
                {
                    "sortOrder": 1,
                    "itemId": 257435,
                    "title": "<b>테스트 책</b>",
                    "author": "홍길동",
                    "goodsType": "도서",
                    "goodsSortNm": "국내도서-소설/시/희곡",
                    "adultYn": "N",
                    "publisher": "창비",
                    "isbn10": "8937460580",
                    "isbn13": isbn_main,
                    "publishDate": "20020131",
                    "itemStatus": "판매중",
                    "cover": "http://image.yes24.com/goods/257435/XL",
                    "sideCover": "https://image.yes24.com/side",
                    "backCover": "https://image.yes24.com/back",
                    "link": "https://www.yes24.com/product/goods/257435",
                    "contentDetail": {
                        "bookIntroduction": "<p>" + "가" * 2500 + "</p>",
                        "bookSummary": "요약",
                        "tableOfContents": "<b>목차</b>",
                    },
                },
                {
                    "sortOrder": 2,
                    "itemId": 257436,
                    "title": "ISBN10 보조",
                    "goodsType": "도서",
                    "adultYn": "N",
                    "isbn10": "8936434128",
                    "isbn13": "",
                    "publishDate": "2020",  # 8자리 미만 -> None
                    "itemStatus": "예약판매",
                    "cover": "",
                    "link": "https://www.yes24.com/product/goods/257436",
                    "contentDetail": {"bookIntroduction": "", "bookSummary": "<b>요약 폴백</b>"},
                },
            ],
        },
    }

    def fake_urlopen(request, timeout):
        sent.append((request.full_url, request.get_header("X-api-key")))
        return FakeResp(json.dumps(payload).encode("utf-8"))

    monkeypatch.setattr(pe.urllib.request, "urlopen", fake_urlopen)
    client = pe.Yes24Client("secret-yes24-key", "https://apis.yes24.com/v1", 5.0, min_interval=0.0)
    page = client.curated_list("steady", "001", page=1, size=100)

    assert len(sent) == 1
    assert sent[0][0] == "https://apis.yes24.com/v1/category/bestsellerSteady?categoryId=001&page=1&pageSize=100"
    assert "secret-yes24-key" not in sent[0][0]
    assert sent[0][1] == "secret-yes24-key"
    assert page.pub_date == datetime(2026, 11, 24, 9, 0, tzinfo=KST)
    assert len(page.items) == 2
    first, second = page.items
    assert first.isbn13 == isbn_main and first.title == "테스트 책"
    assert first.pub_year == 2002
    assert first.cover_url == "https://image.yes24.com/goods/257435/XL"
    assert first.description == "가" * 2000
    assert second.isbn13 == isbn_from_10 and second.pub_year is None
    assert second.description == "요약 폴백"


def test_yes24_client_error_envelopes_404_and_param_guards(monkeypatch):
    def make_http_error(code: int, body: dict[str, Any]) -> urllib.error.HTTPError:
        return urllib.error.HTTPError(
            "https://apis.yes24.com/v1/test",
            code,
            "ERR",
            {},  # type: ignore[arg-type]
            io.BytesIO(json.dumps(body).encode("utf-8")),
        )

    client = pe.Yes24Client("top-secret-key", "https://apis.yes24.com/v1", 5.0, min_interval=0.0)

    # 파라미터 가드 (page=0 500 사고 방지 등)
    with pytest.raises(ValueError):
        client.curated_list("steady", "001", page=0, size=100)
    with pytest.raises(ValueError):
        client.curated_list("steady", "001", page=1, size=101)
    with pytest.raises(ValueError):
        client.curated_list("steady", "   ", page=1, size=10)

    # 404 BEST_001 -> 빈 페이지(no_data)
    def raise_best_001(*args, **kwargs):
        raise make_http_error(404, {"success": False, "data": None, "errorCode": "BEST_001"})

    monkeypatch.setattr(pe.urllib.request, "urlopen", raise_best_001)
    assert client.curated_list("steady", "999", page=1, size=20) == pe.Yes24CuratedPage(items=[], pub_date=None)

    # 404 GOODS_002 -> None
    def raise_goods_002(*args, **kwargs):
        raise make_http_error(404, {"success": False, "data": None, "errorCode": "GOODS_002"})

    monkeypatch.setattr(pe.urllib.request, "urlopen", raise_goods_002)
    assert client.item_detail(make_isbn(1)) is None

    # 401 AUTH_002 -> ProviderError (키 노출 금지)
    def raise_auth_002(*args, **kwargs):
        raise make_http_error(401, {"success": False, "data": None, "errorCode": "AUTH_002"})

    monkeypatch.setattr(pe.urllib.request, "urlopen", raise_auth_002)
    with pytest.raises(pe.ProviderError) as exc_info:
        client.curated_list("steady", "001", page=1, size=20)
    assert "top-secret-key" not in str(exc_info.value)

    # success=false envelope -> ProviderError
    class BadEnvelopeResp:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, size: int) -> bytes:
            return b'{"success":false,"message":"fail","data":null,"errorCode":"INTERNAL_ERROR"}'

    monkeypatch.setattr(pe.urllib.request, "urlopen", lambda *a, **kw: BadEnvelopeResp())
    with pytest.raises(pe.ProviderError):
        client.curated_list("steady", "001", page=1, size=20)


# ─────────── 3. 성인물·비도서·제외 분류·무효/중복 ISBN 차단 (★후보 1) ───────────


def test_curated_filters_adult_non_book_excluded_sort_invalid_and_duplicate_isbn(yes24_db):
    adult_isbn = make_isbn(500)
    comic_isbn = make_isbn(501)
    kids_isbn = make_isbn(502)
    exam_isbn = make_isbn(503)
    items = [
        make_yes24_item(500, sort_order=1, isbn13=adult_isbn, adult_yn="Y", title="성인 전용 도서"),
        make_yes24_item(501, sort_order=2, isbn13=comic_isbn, goods_type="만화"),
        make_yes24_item(502, sort_order=3, isbn13=kids_isbn, goods_sort_nm="국내도서-어린이-창작동화"),
        make_yes24_item(503, sort_order=4, isbn13=exam_isbn, goods_sort_nm="국내도서-IT 모바일-컴퓨터수험서"),
        make_yes24_item(504, sort_order=5, isbn13="9780000000000", title="무효 체크섬"),
        make_yes24_item(505, sort_order=6, title=None),
        # 정상 도서 22권 + 중복 ISBN 1건
        *[make_yes24_item(i, sort_order=10 + i) for i in range(22)],
        make_yes24_item(0, sort_order=100, title="중복 ISBN"),
    ]
    fake = FakeYes24Provider(pe.Yes24CuratedPage(items=items, pub_date=NOW))
    result = run(make_engine(yes24_db, fake).curated_books("steady", "001"))

    assert result is not None
    assert not result.stale and result.fallback_reason is None
    assert result.basis_label == "YES24 스테디셀러 · 국내도서"
    assert len(result.books) == policy.YES24_CURATED_SIZE == 20
    returned_isbns = [b.isbn13 for b in result.books]
    assert returned_isbns == [make_isbn(i) for i in range(20)]
    for blocked in (adult_isbn, comic_isbn, kids_isbn, exam_isbn):
        assert blocked not in returned_isbns

    with yes24_db.connect() as conn:
        # 성인 도서는 books와 curated_books_cache 어디에도 저장되지 않아야 함
        assert conn.execute(text("SELECT count(*) FROM books WHERE isbn13 = :i"), {"i": adult_isbn}).scalar_one() == 0
        ranks = conn.execute(
            text(
                "SELECT rank FROM curated_books_cache "
                "WHERE provider = 'yes24' AND list_kind = 'steady' AND category_id = '001' ORDER BY rank"
            )
        ).scalars().all()
        assert ranks == list(range(1, 21))


# ─────────── 4. URL 오픈 리다이렉트 차단 (★후보 2) ───────────


def test_purchase_url_rejects_open_redirect_and_non_yes24(yes24_db):
    bad_js_isbn = make_isbn(600)
    bad_host_isbn = make_isbn(601)
    good_isbn = make_isbn(602)
    items = [
        make_yes24_item(600, sort_order=1, isbn13=bad_js_isbn, product_url="javascript:alert(1)"),
        make_yes24_item(601, sort_order=2, isbn13=bad_host_isbn, product_url="https://evil.example/yes24/1"),
        make_yes24_item(602, sort_order=3, isbn13=good_isbn, product_url="https://www.yes24.com/product/goods/602"),
    ]
    fake = FakeYes24Provider(
        pe.Yes24CuratedPage(items=items, pub_date=NOW),
        details={
            bad_js_isbn: items[0],
            bad_host_isbn: items[1],
        },
    )
    service = make_engine(yes24_db, fake)
    curated = run(service.curated_books("steady", "001"))
    assert curated is not None and len(curated.books) == 3

    with yes24_db.connect() as conn:
        saved_isbns = conn.execute(
            text(
                "SELECT b.isbn13 FROM book_purchase_links l JOIN books b ON b.id = l.book_id "
                "WHERE b.isbn13 LIKE :p"
            ),
            {"p": f"{TEST_ISBN_PREFIX}%"},
        ).scalars().all()
        assert saved_isbns == [good_isbn]

    for bad_isbn in (bad_js_isbn, bad_host_isbn):
        link = run(service.purchase_link(bad_isbn))
        assert link.kind == "search"
        assert link.url == policy.YES24_SEARCH_URL_TEMPLATE.format(isbn13=bad_isbn)

    with yes24_db.connect() as conn:
        assert (
            conn.execute(
                text(
                    "SELECT count(*) FROM book_purchase_links l JOIN books b ON b.id = l.book_id "
                    "WHERE b.isbn13 IN (:a, :b)"
                ),
                {"a": bad_js_isbn, "b": bad_host_isbn},
            ).scalar_one()
            == 0
        )


# ─────────── 5. 트랜잭션 밖 외부 I/O + 일일 한도 (★후보 3) ───────────


def test_yes24_calls_reserve_before_io_outside_transaction(yes24_db):
    active: set[int] = set()

    def begun(conn):
        active.add(id(conn))

    def ended(conn):
        active.discard(id(conn))

    def before_call():
        assert not active, "YES24 외부 호출이 DB 트랜잭션 안에서 실행됨"
        with yes24_db.connect() as conn:
            count = conn.execute(
                text(
                    "SELECT call_count FROM provider_daily_usage "
                    "WHERE provider = 'yes24' AND usage_date = :d"
                ),
                {"d": NOW.date()},
            ).scalar_one()
            assert count >= 1

    for ev, fn in (("begin", begun), ("commit", ended), ("rollback", ended)):
        event.listen(yes24_db, ev, fn)
    try:
        item = make_yes24_item(700)
        detail_isbn = make_isbn(701)
        detail_item = make_yes24_item(701, isbn13=detail_isbn)
        fake = FakeYes24Provider(
            pe.Yes24CuratedPage(items=[item], pub_date=NOW),
            details={detail_isbn: detail_item},
            on_call=before_call,
        )
        service = make_engine(yes24_db, fake)
        assert run(service.curated_books("steady", "001")) is not None
        link = run(service.purchase_link(detail_isbn))
        assert link.kind == "product"
        assert len(fake.calls) == 2
    finally:
        for ev, fn in (("begin", begun), ("commit", ended), ("rollback", ended)):
            event.remove(yes24_db, ev, fn)


def test_yes24_daily_limit_blocks_external_call_and_returns_stale_or_fallback(yes24_db, monkeypatch):
    # 어제 캐시 적재
    yesterday = NOW - timedelta(days=1)
    seed_fake = FakeYes24Provider(pe.Yes24CuratedPage(items=[make_yes24_item(710)], pub_date=yesterday))
    assert run(make_engine(yes24_db, seed_fake, now=yesterday).curated_books("steady", "001")) is not None

    monkeypatch.setattr(policy, "YES24_DAILY_LIMIT", 0)
    blocked_isbn = make_isbn(711)
    fake = FakeYes24Provider(
        pe.Yes24CuratedPage(items=[make_yes24_item(711)], pub_date=NOW),
        details={blocked_isbn: make_yes24_item(711, isbn13=blocked_isbn)},
    )
    service = make_engine(yes24_db, fake, now=NOW)

    # 1) 캐시 있는 슬롯 -> stale + limit, 외부 호출 0
    stale = run(service.curated_books("steady", "001"))
    assert stale is not None and stale.stale and stale.fallback_reason == "limit"
    assert [b.isbn13 for b in stale.books] == [make_isbn(710)]

    # 2) 캐시 없는 슬롯 -> None, 외부 호출 0
    assert run(service.curated_books("bestseller", "001")) is None

    # 3) 구매 링크 -> search 폴백, 외부 호출 0
    link = run(service.purchase_link(blocked_isbn))
    assert link.kind == "search"
    assert fake.calls == []
    with yes24_db.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM provider_daily_usage WHERE provider = 'yes24' AND usage_date = :d"),
                {"d": NOW.date()},
            ).scalar_one()
            == 0
        )


# ─────────── 6. 빈 응답·오류 시 캐시 보호 (★후보 4) ───────────


@pytest.mark.parametrize(
    "mode,expected_reason",
    [("empty", "no_data"), ("error", "provider_error"), ("missing", "not_configured")],
)
def test_curated_empty_or_error_preserves_existing_cache(yes24_db, mode, expected_reason):
    yesterday = NOW - timedelta(days=1)
    initial_items = [make_yes24_item(720 + i, sort_order=i + 1) for i in range(3)]
    assert run(make_engine(yes24_db, FakeYes24Provider(pe.Yes24CuratedPage(items=initial_items)), now=yesterday).curated_books("steady", "001")) is not None

    provider: FakeYes24Provider | None
    if mode == "empty":
        provider = FakeYes24Provider(pe.Yes24CuratedPage(items=[]))
    elif mode == "error":
        provider = FakeYes24Provider(pe.ProviderError("upstream down"))
    else:
        provider = None

    result = run(make_engine(yes24_db, provider, now=NOW).curated_books("steady", "001"))
    assert result is not None
    assert result.stale is True
    assert result.fallback_reason == expected_reason
    assert [b.isbn13 for b in result.books] == [make_isbn(720 + i) for i in range(3)]

    with yes24_db.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT b.isbn13, c.rank FROM curated_books_cache c JOIN books b ON b.id = c.book_id "
                "WHERE c.provider = 'yes24' AND c.list_kind = 'steady' AND c.category_id = '001' "
                "ORDER BY c.rank"
            )
        ).all()
        assert [(r.isbn13, r.rank) for r in rows] == [(make_isbn(720 + i), i + 1) for i in range(3)]


# ─────────── 7. 구매 링크 ISBN 일치 · goodsType · itemStatus · TTL (★후보 5) ───────────


@pytest.mark.parametrize(
    "overrides",
    [
        {"isbn13": make_isbn(899)},  # 응답 isbn13 불일치
        {"goods_type": "직수입양서"},  # 비허용 goodsType
        {"goods_type": "교육용CD"},
        {"item_status": "품절"},  # 비판매 상태
        {"item_status": "일시품절"},
        {"item_status": "절판"},
        {"adult_yn": "Y"},
    ],
)
def test_purchase_link_rejects_mismatched_isbn_non_book_and_soldout(yes24_db, overrides):
    req_isbn = make_isbn(800)
    bad_item = make_yes24_item(800, **overrides)
    fake = FakeYes24Provider(details={req_isbn: bad_item})

    result = run(make_engine(yes24_db, fake).purchase_link(req_isbn))
    assert result.kind == "search"
    assert result.url == policy.YES24_SEARCH_URL_TEMPLATE.format(isbn13=req_isbn)
    with yes24_db.connect() as conn:
        assert (
            conn.execute(
                text(
                    "SELECT count(*) FROM book_purchase_links l JOIN books b ON b.id = l.book_id "
                    "WHERE b.isbn13 = :i"
                ),
                {"i": req_isbn},
            ).scalar_one()
            == 0
        )


def test_purchase_link_caches_product_for_14_days_and_refreshes_after_ttl(yes24_db):
    req_isbn = make_isbn(810)
    item_v1 = make_yes24_item(
        810,
        isbn13=req_isbn,
        goods_type="만화",  # 구매 직링크는 도서·만화 허용
        item_status="예약판매",
        product_url="https://www.yes24.com/product/goods/8101",
    )
    item_v2 = make_yes24_item(
        810,
        isbn13=req_isbn,
        goods_type="도서",
        item_status="판매중",
        product_url="https://www.yes24.com/product/goods/8102",
    )
    fake = FakeYes24Provider(details={req_isbn: item_v1})

    first = run(make_engine(yes24_db, fake, now=NOW).purchase_link(req_isbn))
    second = run(make_engine(yes24_db, fake, now=NOW + timedelta(days=13)).purchase_link(req_isbn))
    assert first.kind == "product" and first.url == "https://www.yes24.com/product/goods/8101"
    assert second == first
    assert len(fake.calls) == 1  # TTL 이내 캐시 히트 -> 외부 호출 0

    fake.details[req_isbn] = item_v2
    refreshed = run(make_engine(yes24_db, fake, now=NOW + timedelta(days=15)).purchase_link(req_isbn))
    assert refreshed.kind == "product" and refreshed.url == "https://www.yes24.com/product/goods/8102"
    assert len(fake.calls) == 2


# ─────────── 8. 기존 카카오 서지 보존 (COALESCE) ───────────


def test_curated_preserves_existing_kakao_book_metadata(yes24_db):
    full_isbn = make_isbn(820)
    partial_isbn = make_isbn(821)
    with yes24_db.begin() as conn:
        pe.upsert_books(
            conn,
            [
                pe.BookInfo(
                    isbn13=full_isbn,
                    title="카카오 원본 제목",
                    author="카카오 저자",
                    publisher="카카오 출판사",
                    cover_url="https://kakao.example/cover.jpg",
                    description="카카오 원본 소개",
                    pub_year=2020,
                ),
                pe.BookInfo(
                    isbn13=partial_isbn,
                    title="카카오 부분 책",
                    author=None,
                    publisher=None,
                    cover_url=None,
                    description=None,
                    pub_year=None,
                ),
            ],
            "kakao",
            NOW - timedelta(days=2),
            overwrite=True,
        )

    fake = FakeYes24Provider(
        pe.Yes24CuratedPage(
            items=[
                make_yes24_item(
                    820,
                    sort_order=1,
                    isbn13=full_isbn,
                    title="YES24 다른 제목",
                    author="YES24 저자",
                    publisher="YES24 출판사",
                    cover_url=None,
                    description=None,
                    pub_year=None,
                ),
                make_yes24_item(
                    821,
                    sort_order=2,
                    isbn13=partial_isbn,
                    title="YES24 부분 제목",
                    author="YES24 보충 저자",
                    publisher="YES24 보충 출판사",
                    cover_url="https://image.yes24.com/goods/821/XL",
                    description="YES24 보충 소개",
                    pub_year=2024,
                ),
            ],
            pub_date=NOW,
        )
    )
    result = run(make_engine(yes24_db, fake).curated_books("steady", "001"))
    assert result is not None and len(result.books) == 2
    full_book, partial_book = result.books
    assert full_book.source == "kakao"
    assert full_book.title == "카카오 원본 제목"
    assert full_book.author == "카카오 저자"
    assert full_book.cover_url == "https://kakao.example/cover.jpg"
    assert full_book.description == "카카오 원본 소개"
    assert full_book.pub_year == 2020

    assert partial_book.source == "kakao"
    assert partial_book.title == "카카오 부분 책"
    assert partial_book.author == "YES24 보충 저자"
    assert partial_book.publisher == "YES24 보충 출판사"
    assert partial_book.cover_url == "https://image.yes24.com/goods/821/XL"
    assert partial_book.description == "YES24 보충 소개"
    assert partial_book.pub_year == 2024


# ─────────── 9. sync-yes24-curated CLI ───────────


def test_cli_sync_yes24_curated_json_and_print_isbns(yes24_db, test_db_url, monkeypatch, capsys):
    items = [make_yes24_item(830 + i, sort_order=i + 1) for i in range(3)]
    fake = FakeYes24Provider(pe.Yes24CuratedPage(items=items, pub_date=NOW))

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(app_env="test", database_url=test_db_url, yes24_api_key="dummy"),
    )
    monkeypatch.setattr(pe, "build_providers", lambda _s: pe.Providers(yes24=fake))

    # 1) JSON 요약 출력
    code = pe._main(["sync-yes24-curated", "--kind", "steady", "--category", "001"])
    out = capsys.readouterr().out.strip()
    assert code == 0
    report = json.loads(out)
    assert report["kind"] == "steady" and report["category"] == "001"
    assert report["count"] == 3 and report["stale"] is False

    # 2) --print-isbns 출력 (오늘 캐시 히트)
    code2 = pe._main(["sync-yes24-curated", "--kind", "steady", "--category", "001", "--print-isbns"])
    lines = [line.strip() for line in capsys.readouterr().out.strip().splitlines() if line.strip()]
    assert code2 == 0
    assert lines == [make_isbn(830 + i) for i in range(3)]

    # 3) 키 미설정·캐시 없는 슬롯 -> 종료 코드 1
    monkeypatch.setattr(pe, "build_providers", lambda _s: pe.Providers(yes24=None))
    code3 = pe._main(["sync-yes24-curated", "--kind", "bestseller", "--category", "001"])
    capsys.readouterr()
    assert code3 == 1
