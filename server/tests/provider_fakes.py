"""공공 테이블은 세션에 한 번 시드하고 시험마다 TRUNCATE하지 않는다."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="session")
def public_reference_data(db_engine):
    with db_engine.begin() as conn:
        # 각 시험 세션에서 같은 전용 코드만 갱신한다. 다른 테이블/실 DB는 사용하지 않는다.
        rows = [
            (101, "정독도서관", "서울특별시 종로구 북촌로5길 48 (화동)", 1 / 111.195, 0, "11010"),
            (102, "종로도서관", "서울특별시 종로구 사직로9길 15-14 (사직동)", 2 / 111.195, 0, "11010"),
            (103, "남산도서관", "서울특별시 용산구 소월로 109", 4 / 111.195, 0, "11030"),
            (104, "좌표없음", None, None, None, "11010"),
            (105, "a_b%\\", None, None, None, "11020"),
        ]
        rows += [(200 + i, f"이름도서관{i:02}", None, None, None, "99000") for i in range(25)]
        for id_, name, address, lat, lng, region in rows:
            conn.execute(text("""
                INSERT INTO libraries (id, provider_lib_code, name, address, latitude, longitude,
                    dtl_region_code, closed_text, operating_time_text, content_hash)
                OVERRIDING SYSTEM VALUE
                VALUES (:id, :code, :name, :address, :lat, :lng, :region,
                    '매주 월요일', '평일 09:00~22:00 / 주말 09:00~17:00', 'test')
                ON CONFLICT (provider_lib_code) DO UPDATE SET name=EXCLUDED.name,
                    address=EXCLUDED.address, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude
            """), dict(id=id_, code=f"test-{id_}", name=name, address=address, lat=lat, lng=lng, region=region))
    return db_engine


class FakeLibraryProvider:
    def __init__(self, pages=(), failure=None, before_call=None):
        self.pages = pages
        self.failure = failure
        self.before_call = before_call
        self.calls = []

    def libraries(self, dtl_region, page, size):
        self.calls.append((dtl_region, page, size))
        if self.before_call:
            self.before_call()
        if self.failure:
            raise self.failure
        return self.pages[page - 1]


from collections.abc import Callable
from datetime import date
from typing import Any

from app.services.provider_engine import BookInfo, LibraryInfo, SearchPage


def _maybe_raise(value: Any) -> Any:
    if isinstance(value, BaseException):
        raise value
    return value


class FakeBookSearch:
    def __init__(
        self,
        books: list[BookInfo] | None = None,
        *,
        error: BaseException | None = None,
        total: int | None = None,
        on_call: Callable[[], None] | None = None,
    ) -> None:
        self.books = books or []
        self.error = error
        self.total = total
        self.on_call = on_call
        self.calls: list[tuple[str, Any]] = []

    def _enter(self, name: str, arg: Any) -> None:
        self.calls.append((name, arg))
        if self.on_call:
            self.on_call()
        if self.error is not None:
            raise self.error

    def search(self, query: str, start: int, display: int) -> SearchPage:
        self._enter("search", (query, start, display))
        matched = [b for b in self.books if query in b.title or (b.author and query in b.author)]
        return SearchPage(
            items=matched[start - 1 : start - 1 + display],
            total=self.total if self.total is not None else len(matched),
        )

    def lookup_isbn(self, isbn13: str) -> BookInfo | None:
        self._enter("lookup", isbn13)
        return next((b for b in self.books if b.isbn13 == isbn13), None)


class FakeLibraryData:
    def __init__(
        self,
        *,
        holdings: dict[str, Any] | None = None,
        default_holding: Any | None = None,
        popular: dict[str | None, list[BookInfo] | BaseException] | None = None,
        libraries: dict[str, list[LibraryInfo]] | None = None,
        on_call: Callable[[], None] | None = None,
    ) -> None:
        self.holdings = holdings or {}
        self.default_holding = default_holding
        self.popular_by_code = popular or {}
        self.libraries_by_region = libraries or {}
        self.on_call = on_call
        self.calls: list[tuple[str, Any]] = []

    def _enter(self, name: str, arg: Any) -> None:
        self.calls.append((name, arg))
        if self.on_call:
            self.on_call()

    def popular(self, lib_code: str | None, start: date, end: date, size: int) -> list[BookInfo]:
        self._enter("popular", (lib_code, start, end, size))
        return _maybe_raise(self.popular_by_code.get(lib_code, []))

    def libraries(self, dtl_region: str, page: int, size: int) -> tuple[list[LibraryInfo], int]:
        self._enter("libraries", (dtl_region, page, size))
        libs = self.libraries_by_region.get(dtl_region, [])
        return libs[(page - 1) * size : page * size], len(libs)
