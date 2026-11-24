"""LIB-0: 도서·인기·도서관 조회 엔진. 외부 I/O는 트랜잭션 밖."""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import re
import http.client
import json
import math
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Any, Literal, Protocol, TypeVar
from urllib.parse import urlencode

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError
from app import policy
from app.common import KST, ApiError, now_kst, today_kst
from app.db import run_db
from app.services.homepage_fix import fix_homepage, fix_region_code
from app.services.theme_holdings import holdings_targets, replace_holdings
from app.settings import Settings

T = TypeVar("T")
RecommendationSource = Literal["auto", "yes24_steady", "yes24_bestseller", "library_loan"]
MSG_PROVIDER_LIMIT = "지금은 조회가 많아요. 잠시 뒤 다시 시도해 주세요."
MSG_PROVIDER_UNAVAILABLE = "정보를 가져오지 못했어요. 다시 시도해 주세요."

class ProviderError(Exception):
    """제공자 오류·시간 초과·형식 불일치. 호출자는 unknown/캐시로 바꾼다."""


class ProviderLimitReached(Exception):
    """오늘(서울) 호출 상한에 걸려 호출하지 않았다."""


@dataclass(frozen=True)
class LibraryInfo:
    provider_lib_code: str
    name: str
    address: str | None = None
    tel: str | None = None
    homepage: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    closed_text: str | None = None
    operating_time_text: str | None = None


def _http_get_json(url: str, headers: dict[str, str], timeout: float) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json", **headers})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(policy.PROVIDER_MAX_RESPONSE_BYTES + 1)
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as exc:
        raise ProviderError(type(exc).__name__) from exc
    if len(raw) > policy.PROVIDER_MAX_RESPONSE_BYTES:
        raise ProviderError("응답이 너무 커요")
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise ProviderError("JSON 형식이 아니에요") from exc


def _float_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


@dataclass(frozen=True)
class LibraryRow:
    id: int
    provider_lib_code: str
    name: str
    address: str | None
    tel: str | None
    homepage: str | None
    latitude: float | None
    longitude: float | None
    closed_text: str | None
    operating_time_text: str | None
    region_code: str | None
    dtl_region_code: str | None
    isbn_search_url_template: str | None


def _library_row(row: Any) -> LibraryRow:
    return LibraryRow(**{k: getattr(row, k) for k in LibraryRow.__dataclass_fields__})


def reserve_provider_call(conn: Connection, provider: str, usage_date: date, limit: int) -> bool:
    """호출 전에 원자적으로 +1한다. 상한에 닿았으면 행을 바꾸지 않고 False(05 §11.2)."""
    if limit <= 0:
        return False
    row = conn.execute(
        text(
            """
            INSERT INTO provider_daily_usage (provider, usage_date, call_count)
            VALUES (:provider, :usage_date, 1)
            ON CONFLICT (provider, usage_date) DO UPDATE
                SET call_count = provider_daily_usage.call_count + 1
                WHERE provider_daily_usage.call_count < :limit
            RETURNING call_count
            """
        ),
        {"provider": provider, "usage_date": usage_date, "limit": limit},
    ).first()
    return row is not None


def get_library(conn: Connection, library_id: int) -> LibraryRow | None:
    row = conn.execute(
        text(f"SELECT {LIBRARY_COLUMNS} FROM libraries WHERE id = :id"), {"id": library_id}
    ).first()
    return _library_row(row) if row else None


def libraries_in_region(conn: Connection, dtl_region_code: str) -> list[LibraryRow]:
    # 구가 있는 시 본청 코드(끝자리 0, 예 수원 31010)는 정보나루가 구 코드(31011~31014)에 도서관을 두므로
    # 앞 4자리가 같은 구 코드까지 함께 돌려준다(2026-11-20 D 결정 "하위 구 합치기"). 구·군 코드는 그대로 하나만.
    children = f"{dtl_region_code[:4]}_" if dtl_region_code.endswith("0") else dtl_region_code
    rows = conn.execute(
        text(
            f"SELECT {LIBRARY_COLUMNS} FROM libraries WHERE dtl_region_code = :c OR dtl_region_code LIKE :p "
            'ORDER BY name COLLATE "C", id'
        ),
        {"c": dtl_region_code, "p": children},
    ).all()
    return [_library_row(r) for r in rows]


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """직선(대권) 거리(2026-11-13 `확정`: 직선거리)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def library_content_hash(info: LibraryInfo) -> str:
    raw = json.dumps(info.__dict__, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _store_libraries(
    conn: Connection, dtl_region_code: str, libs: list[LibraryInfo], synced_at: datetime
) -> dict[str, int]:
    """새 도서관은 넣고, 해시가 다른 곳만 고치고, 받은 곳은 모두 synced_at을 갱신한다.

    `isbn_search_url_template`은 제공자가 주지 않으므로 건드리지 않는다.
    `homepage`는 저장 전에 `fix_homepage`로 고친다(깨진 주소·인트로 화면 보정).
    """
    counts = {"inserted": 0, "updated": 0, "unchanged": 0}
    for raw_info in libs:
        info = replace(raw_info, homepage=fix_homepage(raw_info.homepage))  # 해시 전에 고쳐야 기존 행도 갱신된다
        dtl = fix_region_code(dtl_region_code, info.address)  # 정보나루가 다른 시군구에 둔 곳(군위 등)
        params = {
            **info.__dict__,
            "region_code": dtl[:2],
            "dtl_region_code": dtl,
            "content_hash": library_content_hash(info),
            "synced_at": synced_at,
        }
        row = conn.execute(
            text(
                """
                INSERT INTO libraries (
                    provider_lib_code, name, address, tel, homepage, latitude, longitude,
                    closed_text, operating_time_text, region_code, dtl_region_code, content_hash, synced_at
                ) VALUES (
                    :provider_lib_code, :name, :address, :tel, :homepage, :latitude, :longitude,
                    :closed_text, :operating_time_text, :region_code, :dtl_region_code, :content_hash, :synced_at
                )
                ON CONFLICT (provider_lib_code) DO UPDATE SET
                    name = EXCLUDED.name, address = EXCLUDED.address, tel = EXCLUDED.tel,
                    homepage = EXCLUDED.homepage, latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude, closed_text = EXCLUDED.closed_text,
                    operating_time_text = EXCLUDED.operating_time_text,
                    region_code = EXCLUDED.region_code, dtl_region_code = EXCLUDED.dtl_region_code,
                    content_hash = EXCLUDED.content_hash, synced_at = EXCLUDED.synced_at
                WHERE libraries.content_hash <> EXCLUDED.content_hash
                RETURNING (xmax = 0) AS inserted
                """
            ),
            params,
        ).first()
        if row is None:
            conn.execute(
                text("UPDATE libraries SET synced_at = :s WHERE provider_lib_code = :c"),
                {"s": synced_at, "c": info.provider_lib_code},
            )
            counts["unchanged"] += 1
        elif row.inserted:
            counts["inserted"] += 1
        else:
            counts["updated"] += 1
        if dtl != dtl_region_code:  # 지역 코드는 해시에 없으므로 이미 저장된 행도 따로 고친다
            conn.execute(
                text("UPDATE libraries SET region_code = :r, dtl_region_code = :d "
                     "WHERE provider_lib_code = :c AND dtl_region_code IS DISTINCT FROM :d"),
                {"r": dtl[:2], "d": dtl, "c": info.provider_lib_code},
            )
    return counts


def _main(argv: list[str]) -> int:
    """`python -m app.services.provider_engine seed | sync-libraries | sync-theme-holdings | sync-yes24-curated`"""
    from sqlalchemy import create_engine

    from app.seed import seed_reference_data
    from app.settings import get_settings

    if not argv or argv[0] not in {"seed", "sync-libraries", "sync-theme-holdings", "sync-yes24-curated"}:
        print(_main.__doc__)
        return 2
    if argv[0] == "sync-theme-holdings":
        parser = argparse.ArgumentParser(prog="sync-theme-holdings")
        parser.add_argument("--region", action="append", default=[], metavar="NN")
        parser.add_argument("--max-calls", type=int, metavar="N")
        args = parser.parse_args(argv[1:])
        if any(not re.fullmatch(r"[0-9]{2}", region) for region in args.region):
            parser.error("--region은 두 자리 광역 코드여야 해요")
        if args.max_calls is not None and args.max_calls < 1:
            parser.error("--max-calls는 1 이상이어야 해요")
    elif argv[0] == "sync-yes24-curated":
        parser = argparse.ArgumentParser(prog="sync-yes24-curated")
        parser.add_argument("--kind", choices=("steady", "bestseller"), default="steady")
        parser.add_argument("--category", default=policy.YES24_DEFAULT_CATEGORY_ID)
        parser.add_argument("--print-isbns", action="store_true")
        args = parser.parse_args(argv[1:])
        category = args.category.strip()
        if not 1 <= len(category) <= 32:
            parser.error("--category는 공백 제외 1~32자여야 해요")
        args.category = category
    settings = get_settings()
    engine = create_engine(settings.database_url)
    try:
        if argv[0] == "seed":
            print(asyncio.run(run_db(engine, seed_reference_data)))
        elif argv[0] == "sync-theme-holdings":
            try:
                status, report = asyncio.run(
                    ProviderEngine(engine, build_providers(settings)).sync_theme_holdings(args.region, args.max_calls)
                )
            except SQLAlchemyError:
                status, report = 1, {"error": "database_error"}
            print(json.dumps(report, ensure_ascii=False))
            return status
        elif argv[0] == "sync-yes24-curated":
            try:
                result = asyncio.run(
                    ProviderEngine(engine, build_providers(settings)).curated_books(
                        list_kind=args.kind, category_id=args.category
                    )
                )
            except (SQLAlchemyError, ApiError):
                if not args.print_isbns:
                    print(json.dumps({"error": "database_error", "kind": args.kind, "category": args.category}, ensure_ascii=False))
                return 1
            if result is None:
                if not args.print_isbns:
                    print(json.dumps({"kind": args.kind, "category": args.category, "count": 0, "stale": False, "fallback_reason": "no_data"}, ensure_ascii=False))
                return 1
            if args.print_isbns:
                for book in result.books:
                    print(book.isbn13)
            else:
                print(
                    json.dumps(
                        {
                            "kind": result.list_kind,
                            "category": result.category_id,
                            "basis_label": result.basis_label,
                            "count": len(result.books),
                            "stale": result.stale,
                            "fallback_reason": result.fallback_reason,
                        },
                        ensure_ascii=False,
                    )
                )
            return 1 if result.stale else 0
        else:
            codes = argv[1:]
            if not codes:
                print("시군구 코드(예: 11110)를 하나 이상 주세요")
                return 2
            print(asyncio.run(ProviderEngine(engine, build_providers(settings)).sync_libraries(codes)))
    finally:
        engine.dispose()
    return 0

LIBRARY_COLUMNS = ", ".join(LibraryRow.__dataclass_fields__)
EARTH_RADIUS_KM = 6371.0088


def _clean_text(raw: Any) -> str | None:
    return (raw.strip() or None) if isinstance(raw, str) else None


@dataclass(frozen=True)
class HoldingsPage:
    page_no: int
    page_size: int
    total: int
    lib_codes: tuple[str, ...]


def accept_holdings_page(
    page: HoldingsPage, page_no: int, size: int, total: int | None, codes: set[str]
) -> tuple[int, int]:
    """libSrchByBook 페이지 무결성 검사(서가 테마·K24 공용). 통과하면 `codes`에 더하고 (총건수, 크기)를 준다.

    끝까지 받았는지는 부른 쪽이 `len(codes) == total`로 본다.
    """
    if page.page_no != page_no or not 1 <= page.page_size <= size:
        raise ProviderError("소장 도서관 페이지 순서나 크기가 올바르지 않아요")
    if total is None:
        total, size = page.total, page.page_size
    if page.total != total or page.page_size != size:
        raise ProviderError("소장 도서관 페이지 사이의 총건수 또는 크기가 달라졌어요")
    expected = min(size, total - (page_no - 1) * size)
    codes.update(page.lib_codes)
    if len(page.lib_codes) != expected or len(codes) != (page_no - 1) * size + expected:
        raise ProviderError("소장 도서관 페이지에 누락이나 중복이 있어요")
    return total, size


class LibraryDataProvider(Protocol):
    def book_exist(self, lib_code: str, isbn13: str) -> HoldingResult: ...

    def popular(self, lib_code: str | None, start: date, end: date, size: int) -> list[BookInfo]: ...

    def libraries(self, dtl_region: str, page: int, size: int) -> tuple[list[LibraryInfo], int]: ...

    def holdings_page(self, isbn13: str, region: str, page: int, size: int) -> HoldingsPage: ...


@dataclass(frozen=True)
class Providers:
    books: BookSearchProvider | None = None
    library_data: LibraryDataProvider | None = None
    yes24: Yes24Provider | None = None


class Data4LibraryClient:
    def __init__(self, auth_key: str, base_url: str, timeout: float):
        self._key = auth_key
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    def _get(self, op: str, params: dict[str, Any]) -> dict[str, Any]:
        query = urlencode({"authKey": self._key, "format": "json", **params})
        # 정보나루는 Accept: application/json이면 406을 돌려준다(2026-11-18 실서버 확인). 형식은 format=json으로 고른다
        data = _http_get_json(f"{self._base}/{op}?{query}", {"Accept": "*/*"}, self._timeout)
        response = data.get("response") if isinstance(data, dict) else None
        if not isinstance(response, dict) or "error" in response:
            raise ProviderError("정보나루 응답 형식이 다르거나 오류")
        return response

    def book_exist(self, lib_code: str, isbn13: str) -> HoldingResult:
        result = self._get("bookExist", {"libCode": lib_code, "isbn13": isbn13}).get("result")
        if not isinstance(result, dict):
            raise ProviderError("bookExist result가 없어요")
        holding = _yn(result.get("hasBook"))
        if holding == "no":
            return HoldingResult(holding="no", loanable="no")
        return HoldingResult(holding="yes", loanable=_yn(result.get("loanAvailable")))


    def holdings_page(self, isbn13: str, region: str, page: int, size: int) -> HoldingsPage:
        response = self._get("libSrchByBook", {"isbn": isbn13, "region": region, "pageNo": page, "pageSize": size})
        numbers = []
        for key in ("pageNo", "pageSize", "numFound", "resultNum"):
            value = response.get(key)
            if type(value) is int and value >= 0:
                numbers.append(value)
            elif isinstance(value, str) and re.fullmatch(r"[0-9]{1,12}", value):
                numbers.append(int(value))
            else:
                raise ProviderError("소장 도서관 페이지 정보가 올바르지 않아요")
        page_no, page_size, total, returned = numbers
        libs = response.get("libs")
        if libs is None and total == 0 and returned == 0:
            libs = []
        if not isinstance(libs, list) or len(libs) != returned:
            raise ProviderError("소장 도서관 응답 건수가 일치하지 않아요")
        codes = []
        for entry in libs:
            lib = entry.get("lib") if isinstance(entry, dict) else None
            code = lib.get("libCode") if isinstance(lib, dict) else None
            if type(code) is int and code >= 0:
                code = str(code)
            if not isinstance(code, str) or not re.fullmatch(r"[0-9]+", code):
                raise ProviderError("소장 도서관 코드가 올바르지 않아요")
            codes.append(code)
        return HoldingsPage(page_no, page_size, total, tuple(codes))

    def popular(self, lib_code: str | None, start: date, end: date, size: int) -> list[BookInfo]:
        params: dict[str, Any] = {
            "startDt": start.isoformat(),
            "endDt": end.isoformat(),
            "pageNo": 1,
            "pageSize": size,
        }
        op = "loanItemSrch"
        if lib_code is not None:
            op, params["libCode"] = "loanItemSrchByLib", lib_code
        docs = self._get(op, params).get("docs")
        if not isinstance(docs, list):
            raise ProviderError("docs가 없어요")
        books: list[BookInfo] = []
        for entry in docs:
            doc = entry.get("doc") if isinstance(entry, dict) else None
            if not isinstance(doc, dict):
                continue
            isbn13 = normalize_isbn(doc.get("isbn13"))
            title = _clean_book_text(doc.get("bookname"))
            if isbn13 and title:
                books.append(
                    BookInfo(
                        isbn13=isbn13,
                        title=title,
                        author=_clean_book_text(doc.get("authors")),
                        publisher=_clean_book_text(doc.get("publisher")),
                        cover_url=https_cover(doc.get("bookImageURL")),
                        description=_description(doc.get("description")),
                        pub_year=_pub_year(doc.get("publication_year")),
                        class_name=_clean_text(doc.get("class_nm")),
                    )
                )
        return books


    def libraries(self, dtl_region: str, page: int, size: int) -> tuple[list[LibraryInfo], int]:
        response = self._get(
            "libSrch",
            {"region": dtl_region[:2], "dtl_region": dtl_region, "pageNo": page, "pageSize": size},
        )
        libs, total = response.get("libs"), response.get("numFound")
        if not isinstance(libs, list):
            raise ProviderError("libs가 없어요")
        result: list[LibraryInfo] = []
        for entry in libs:
            lib = entry.get("lib") if isinstance(entry, dict) else None
            if not isinstance(lib, dict):
                continue
            code, name = _clean_text(lib.get("libCode")), _clean_text(lib.get("libName"))
            if not code or not name:
                continue
            lat, lng = _float_or_none(lib.get("latitude")), _float_or_none(lib.get("longitude"))
            if lat is None or lng is None:
                lat = lng = None  # 05 CHECK: 둘 다 있거나 둘 다 없음
            result.append(
                LibraryInfo(
                    provider_lib_code=code,
                    name=name,
                    address=_clean_text(lib.get("address")),
                    tel=_clean_text(lib.get("tel")),
                    homepage=_clean_text(lib.get("homepage")),
                    latitude=lat,
                    longitude=lng,
                    closed_text=_clean_text(lib.get("closed")),
                    operating_time_text=_clean_text(lib.get("operatingTime")),
                )
            )
        return result, total if isinstance(total, int) else len(result)


def build_providers(settings: Settings) -> Providers:
    """키가 있는 제공자만 만든다. 없으면 None(시드·캐시 Fallback)."""
    books = None
    if settings.kakao_rest_api_key:
        books = KakaoBookClient(
            settings.kakao_rest_api_key,
            settings.kakao_api_base_url,
            policy.PROVIDER_TIMEOUT_SECONDS,
        )
    library_data = None
    if settings.data4library_api_key:
        library_data = Data4LibraryClient(
            settings.data4library_api_key,
            settings.data4library_api_base_url,
            policy.PROVIDER_TIMEOUT_SECONDS,
        )
    yes24 = None
    if settings.yes24_api_key:
        yes24 = Yes24Client(
            settings.yes24_api_key,
            settings.yes24_api_base_url,
            policy.PROVIDER_TIMEOUT_SECONDS,
        )
    return Providers(books=books, library_data=library_data, yes24=yes24)



def libraries_by_name(conn: Connection, q: str, limit: int) -> list[LibraryRow]:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = conn.execute(text(f"SELECT {LIBRARY_COLUMNS} FROM libraries "
                             'WHERE name ILIKE :q ORDER BY name COLLATE "C", id LIMIT :limit'),
                        {"q": f"%{escaped}%", "limit": limit}).all()
    return [_library_row(row) for row in rows]


def libraries_nearby(conn: Connection, lat: float, lng: float, radius_km: float) -> list[tuple[LibraryRow, float]]:
    # 약 1,300곳: 극점·날짜변경선에서도 누락 없이 대권 거리를 적용한다.
    rows = conn.execute(text(f"SELECT {LIBRARY_COLUMNS} FROM libraries "
                             "WHERE latitude IS NOT NULL AND longitude IS NOT NULL")).all()
    found = []
    for row in rows:
        lib = _library_row(row)
        d = distance_km(lat, lng, lib.latitude, lib.longitude)
        if d <= radius_km:
            found.append((lib, d))
    return sorted(found, key=lambda pair: (pair[1], pair[0].id))


class ProviderEngine:
    def __init__(self, engine: Engine, providers: Providers, now_fn: Callable[[], datetime] = now_kst) -> None:
        self.engine, self.providers, self.now_fn = engine, providers, now_fn

    async def _db(self, fn: Callable[[Connection], T]) -> T:
        return await run_db(self.engine, fn)

    async def _guarded_call(self, provider: str, limit: int, fn: Callable[[], T]) -> T:
        if not await self._db(lambda c: reserve_provider_call(c, provider, today_kst(self.now_fn()), limit)):
            raise ProviderLimitReached(provider)
        try:
            return await asyncio.to_thread(fn)
        except (TimeoutError, OSError, ValueError) as exc:
            raise ProviderError(provider) from exc

    async def search_books(self, query: str, start: int) -> SearchResult:
        size = policy.SEARCH_PAGE_SIZE
        provider = self.providers.books
        reason: FallbackReason
        if provider is None:
            reason = "not_configured"
        else:
            try:
                page = await self._guarded_call(
                    "kakao", policy.KAKAO_DAILY_LIMIT, lambda: provider.search(query, start, size)
                )
            except ProviderLimitReached:
                reason = "limit"
            except ProviderError:
                reason = "provider_error"
            else:
                fetched_at = self.now_fn()
                records = await self._db(
                    lambda c: upsert_books(c, page.items, "kakao", fetched_at, overwrite=True)
                )
                following = start + size
                has_more = following <= min(page.total, policy.SEARCH_MAX_START)
                return SearchResult(records, following if has_more else None, "kakao", None)

        records, has_more = await self._db(lambda c: search_cached_books(c, query, start, size))
        if not records and reason == "limit":
            raise ApiError(429, "PROVIDER_LIMIT", MSG_PROVIDER_LIMIT)
        if not records and reason in {"provider_error", "not_configured"}:
            raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_PROVIDER_UNAVAILABLE)
        return SearchResult(records, start + size if has_more and start + size <= policy.SEARCH_MAX_START else None, "cache", reason)


    async def get_book(self, isbn13: str) -> BookRecord:
        """기존 책의 누락된 소개·연도를 다음 조회 때 채운다(K21). 실패하면 기존 캐시 보존."""
        record = await self._db(lambda c: select_book(c, isbn13))
        if record is not None and record.description is not None and record.pub_year is not None:
            return record
        provider = self.providers.books
        if provider is None:
            if record is not None:
                return record
            raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_PROVIDER_UNAVAILABLE)
        try:
            info = await self._guarded_call(
                "kakao", policy.KAKAO_DAILY_LIMIT, lambda: provider.lookup_isbn(isbn13)
            )
        except ProviderLimitReached:
            if record is not None:
                return record
            raise ApiError(429, "PROVIDER_LIMIT", MSG_PROVIDER_LIMIT) from None
        except ProviderError:
            if record is not None:
                return record
            raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_PROVIDER_UNAVAILABLE) from None
        if info is None:
            if record is not None:
                return record
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND)
        fetched_at = self.now_fn()
        return (await self._db(lambda c: upsert_books(c, [info], "kakao", fetched_at, overwrite=True)))[0]


    async def find_book_quietly(self, isbn13: str) -> BookRecord | None:
        """소장 조회용: 서지를 못 찾아도 오류로 끊지 않는다(관측 저장만 못 함)."""
        try:
            return await self.get_book(isbn13)
        except ApiError as exc:
            if exc.code not in {"NOT_FOUND", "PROVIDER_LIMIT", "PROVIDER_UNAVAILABLE"}:
                raise
            return None


    def _popular_is_fresh(self, scope: str, fetched_at: datetime, now: datetime) -> bool:
        if scope == "national":
            return today_kst(fetched_at) == today_kst(now)  # 전국은 하루 한 번(서울 날짜)
        return now - fetched_at < policy.POPULAR_LIBRARY_TTL


    async def popular_books(self, library: LibraryRow | None) -> PopularResult:
        """도서관 → (데이터 없으면) 전국 순. 아무것도 없으면 429(상한) 또는 503."""
        reasons: list[FallbackReason] = []
        if library is not None:
            result = await self._popular_scope("library", library, reasons)
            if result is not None:
                return result
        result = await self._popular_scope("national", None, reasons)
        if result is not None:
            if library is not None and result.fallback_reason is None:
                # 도서관 데이터가 없어 전국으로 대체했다는 사실을 남긴다(02 LIB-01 "기준을 표시")
                result = PopularResult(**{**result.__dict__, "fallback_reason": reasons[0]})
            return result
        if "limit" in reasons:
            raise ApiError(429, "PROVIDER_LIMIT", MSG_PROVIDER_LIMIT)
        raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_PROVIDER_UNAVAILABLE)


    async def _popular_scope(
        self,
        scope: Literal["national", "library"],
        library: LibraryRow | None,
        reasons: list[FallbackReason],
    ) -> PopularResult | None:
        library_id = library.id if library else None
        now = self.now_fn()
        cached = await self._db(lambda c: _read_popular(c, scope, library_id))
        if cached is not None and self._popular_is_fresh(scope, cached.fetched_at, now):
            return cached

        provider = self.providers.library_data
        reason: FallbackReason
        if provider is None:
            reason = "not_configured"
        else:
            end = today_kst(now) - timedelta(days=1)
            start = end - timedelta(days=policy.POPULAR_PERIOD_DAYS - 1)
            code = library.provider_lib_code if library else None
            try:
                infos = await self._guarded_call(
                    "data4library",
                    policy.DATA4LIBRARY_DAILY_LIMIT,
                    lambda: provider.popular(code, start, end, policy.POPULAR_SIZE),
                )
            except ProviderLimitReached:
                reason = "limit"
            except ProviderError:
                reason = "provider_error"
            else:
                if infos:
                    label = f"{library.name if library else '전국'} · 최근 {policy.POPULAR_PERIOD_DAYS}일 대출"
                    fetched_at = self.now_fn()
                    return await self._db(
                        lambda c: _store_popular(c, scope, library_id, infos, label, fetched_at)
                    )
                reason = "no_data"
        reasons.append(reason)
        if cached is not None:
            return PopularResult(**{**cached.__dict__, "stale": True, "fallback_reason": reason})
        return None


    async def curated_books(
        self,
        list_kind: Literal["steady", "bestseller"] = "steady",
        category_id: str = policy.YES24_DEFAULT_CATEGORY_ID,
    ) -> CuratedResult | None:
        """YES24 큐레이션(스테디셀러·베스트셀러) KST 일 1회 캐시 조회·갱신(K23, C-81)."""
        result, _ = await self._curated_books(list_kind, category_id)
        return result

    async def recommendations(
        self, library: LibraryRow | None, source: RecommendationSource
    ) -> PopularResult:
        if library is not None or source == "library_loan":
            return await self.popular_books(library)

        list_kind = "bestseller" if source == "yes24_bestseller" else "steady"
        curated, reason = await self._curated_books(list_kind, policy.YES24_DEFAULT_CATEGORY_ID)
        if reason is not None:
            try:
                popular = await self.popular_books(None)
            except ApiError as exc:
                if exc.code not in {"PROVIDER_LIMIT", "PROVIDER_UNAVAILABLE"}:
                    raise
                if curated is None:
                    if reason == "limit" and exc.code == "PROVIDER_UNAVAILABLE":
                        raise ApiError(429, "PROVIDER_LIMIT", MSG_PROVIDER_LIMIT) from exc
                    raise
            else:
                if curated is None or not popular.stale:
                    return replace(popular, fallback_reason=reason)

        assert curated is not None
        return PopularResult(
            scope="national",
            library_id=None,
            period_label=curated.basis_label,
            books=curated.books,
            fetched_at=curated.fetched_at,
            stale=curated.stale,
            fallback_reason=curated.fallback_reason,
        )

    async def _curated_books(
        self, list_kind: Literal["steady", "bestseller"], category_id: str
    ) -> tuple[CuratedResult | None, FallbackReason | None]:
        now = self.now_fn()
        cached = await self._db(lambda c: _read_curated(c, "yes24", list_kind, category_id))
        if cached is not None and today_kst(cached.fetched_at) == today_kst(now):
            return cached, None

        provider = self.providers.yes24
        if provider is None:
            return (_mark_curated_stale(cached, "not_configured") if cached else None), "not_configured"

        try:
            page = await self._guarded_call(
                "yes24",
                policy.YES24_DAILY_LIMIT,
                lambda: provider.curated_list(
                    list_kind, category_id, page=1, size=policy.YES24_CURATED_FETCH_SIZE
                ),
            )
        except ProviderLimitReached:
            return (_mark_curated_stale(cached, "limit") if cached else None), "limit"
        except ProviderError:
            return (_mark_curated_stale(cached, "provider_error") if cached else None), "provider_error"

        filtered = _filter_yes24_curated_items(page.items, limit=policy.YES24_CURATED_SIZE)
        if not filtered:
            return (_mark_curated_stale(cached, "no_data") if cached else None), "no_data"

        fetched_at = self.now_fn()
        basis_label = _yes24_basis_label(list_kind, category_id)

        def _write_tx(conn: Connection) -> CuratedResult:
            conn.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
                {"k": f"curated:yes24:{list_kind}:{category_id}"},
            )
            infos = [_yes24_to_book_info(item) for item in filtered]
            records = upsert_books(conn, infos, "yes24", fetched_at, overwrite=False)
            records_by_isbn = {record.isbn13: record for record in records}
            _upsert_yes24_purchase_links(conn, records_by_isbn, filtered, fetched_at)
            _replace_curated_cache(
                conn,
                "yes24",
                list_kind,
                category_id,
                records,
                basis_label,
                page.pub_date,
                fetched_at,
            )
            stored = _read_curated(conn, "yes24", list_kind, category_id)
            assert stored is not None
            return stored

        return await self._db(_write_tx), None


    async def purchase_link(self, isbn13: str) -> PurchaseLinkResult:
        """도서 구매 직링크 조회·캐시(TTL 14일). 조건 미충족·오류 시 검색 URL 폴백(K23, C-81)."""
        fallback = PurchaseLinkResult(
            isbn13=isbn13,
            provider="yes24",
            kind="search",
            url=policy.YES24_SEARCH_URL_TEMPLATE.format(isbn13=isbn13),
        )
        now = self.now_fn()
        cached = await self._db(lambda c: _read_purchase_link(c, isbn13, "yes24"))
        if (
            cached is not None
            and now - cached.fetched_at < policy.YES24_PURCHASE_LINK_TTL
            and _is_valid_yes24_product_url(cached.product_url)
            and cached.item_status in policy.YES24_PURCHASABLE_STATUSES
        ):
            return PurchaseLinkResult(
                isbn13=isbn13,
                provider="yes24",
                kind="product",
                url=cached.product_url,
            )

        provider = self.providers.yes24
        if provider is None:
            return fallback

        try:
            item = await self._guarded_call(
                "yes24",
                policy.YES24_DAILY_LIMIT,
                lambda: provider.item_detail(isbn13),
            )
        except (ProviderLimitReached, ProviderError):
            return fallback

        if item is None or not _is_eligible_purchase_link(item, expected_isbn13=isbn13) or not item.title:
            return fallback

        assert item.product_url is not None
        fetched_at = self.now_fn()

        def _store_tx(conn: Connection) -> None:
            record = upsert_books(conn, [_yes24_to_book_info(item)], "yes24", fetched_at, overwrite=False)[0]
            _upsert_purchase_link(
                conn,
                record.id,
                "yes24",
                item.item_id,
                item.product_url,  # type: ignore[arg-type]
                item.item_status,
                fetched_at,
            )

        await self._db(_store_tx)
        return PurchaseLinkResult(
            isbn13=isbn13,
            provider="yes24",
            kind="product",
            url=item.product_url,
        )


    async def availability(self, isbn13: str, libraries: Sequence[LibraryRow]) -> list[AvailabilityItem]:
        if not libraries:
            return []
        book = await self.find_book_quietly(isbn13)
        now = self.now_fn()
        today = today_kst(now)
        lib_ids = [lib.id for lib in libraries]
        latest: dict[int, _Observation] = (
            await self._db(lambda c: _latest_observations(c, book.id, lib_ids)) if book else {}
        )

        need = [lib for lib in libraries if not (lib.id in latest and latest[lib.id].observed_on == today)]
        fetched: dict[int, _Fetch] = {}
        provider = self.providers.library_data
        if provider is None:
            fetched = {lib.id: _Fetch(reason="not_configured") for lib in need}
        else:
            cap = policy.AVAILABILITY_MAX_CALLS_PER_REQUEST
            for lib in need[cap:]:
                fetched[lib.id] = _Fetch(reason="limit")
            semaphore = asyncio.Semaphore(policy.AVAILABILITY_MAX_CONCURRENCY)

            async def _one(lib: LibraryRow) -> None:
                async with semaphore:
                    try:
                        result = await self._guarded_call(
                            "data4library",
                            policy.DATA4LIBRARY_DAILY_LIMIT,
                            lambda: provider.book_exist(lib.provider_lib_code, isbn13),
                        )
                    except ProviderLimitReached:
                        fetched[lib.id] = _Fetch(reason="limit")
                    except ProviderError:
                        fetched[lib.id] = _Fetch(reason="provider_error")
                    else:
                        if result.holding not in {"yes", "no"} or result.loanable not in {"yes", "no"}:
                            fetched[lib.id] = _Fetch(reason="provider_error")
                        else:
                            fetched[lib.id] = _Fetch(result=result, observed_at=self.now_fn())

            await asyncio.gather(*(_one(lib) for lib in need[:cap]))

        successes = {lid: f for lid, f in fetched.items() if f.result is not None}
        if book is not None and successes:
            await self._db(lambda c: _store_observations(c, book.id, today, successes))

        items: list[AvailabilityItem] = []
        for lib in libraries:
            fetch = fetched.get(lib.id)
            if fetch is None:  # 오늘 캐시
                obs = latest[lib.id]
                items.append(_from_observation(lib, obs, "today", None))
            elif fetch.result is not None:
                assert fetch.observed_at is not None
                data_date, assumed = _data_date(fetch.result.data_date, today)
                items.append(
                    AvailabilityItem(
                        library=lib,
                        holding=fetch.result.holding,
                        loanable=fetch.result.loanable,
                        basis="today",
                        source="data4library",
                        observed_at=fetch.observed_at,
                        data_date=data_date,
                        data_date_assumed=assumed,
                    )
                )
            elif lib.id in latest:  # 새로 못 받았지만 예전 관측이 있다 → 시각과 함께 구별(AC-UNKNOWN)
                items.append(_from_observation(lib, latest[lib.id], "stale", fetch.reason))
            else:
                items.append(
                    AvailabilityItem(
                        library=lib, holding="unknown", loanable="unknown", basis="none",
                        fallback_reason=fetch.reason,
                    )
                )
        if all(i.basis == "none" and i.fallback_reason == "limit" for i in items):
            raise ApiError(429, "PROVIDER_LIMIT", MSG_PROVIDER_LIMIT)
        return items

    async def bulk_availability(
        self, isbn13s: Sequence[str], libraries: Sequence[tuple[LibraryRow, float | None]]
    ) -> BulkAvailabilityResult:
        """여러 ISBN × 주변 도서관 소장 일괄 조회(core K24, book-search LIB-3b #70).

        오늘 bookExist 관측 → ① libSrchByBook 소장 1차(저장 안 함) → ② 상위 후보 bookExist(저장).
        ①·②가 요청당 호출 예산(40)·동시 수(8)를 함께 쓴다. 실패는 예외 대신 unknown + 사유로 남긴다.
        """
        isbns = list(dict.fromkeys(isbn13s))
        libs = list(libraries)
        pairs = {(lib.id, i): _BulkPair() for lib, _ in libs for i in isbns}
        if not pairs:
            return _bulk_result(isbns, libs, pairs)
        today = today_kst(self.now_fn())
        lib_ids = [lib.id for lib, _ in libs]
        book_ids, todays = await self._db(lambda c: _bulk_today(c, isbns, lib_ids, today))
        for key, (holding, loanable) in todays.items():
            pairs[key] = _BulkPair(holding, loanable)
        provider = self.providers.library_data
        if provider is None:
            for pair in pairs.values():
                if pair.holding == "unknown":
                    pair.reason = "not_configured"
            return _bulk_result(isbns, libs, pairs)

        budget = [policy.AVAILABILITY_MAX_CALLS_PER_REQUEST]
        semaphore = asyncio.Semaphore(policy.AVAILABILITY_MAX_CONCURRENCY)

        async def call(fn: Callable[[], T]) -> T:
            async with semaphore:  # 예산은 실제 호출 순서대로 쓴다(앞 ISBN 첫 페이지가 먼저)
                if budget[0] <= 0:
                    raise ProviderLimitReached("request")
                budget[0] -= 1
                return await self._guarded_call("data4library", policy.DATA4LIBRARY_DAILY_LIMIT, fn)

        # ① 소장 1차: ISBN 순서 × 시·도. 오늘 관측이 없는 쌍만 대상
        groups: list[tuple[str, str, list[LibraryRow]]] = []
        for isbn13 in isbns:
            by_region: dict[str, list[LibraryRow]] = {}
            for lib, _ in libs:
                if (lib.id, isbn13) in todays:
                    continue
                region = lib.region_code
                if not region or not re.fullmatch(r"[0-9]{2}", region):
                    pairs[(lib.id, isbn13)].reason = "provider_error"  # 기본값(Claude): 시·도 없으면 1차 불가
                    continue
                by_region.setdefault(region, []).append(lib)
            groups += [(isbn13, region, group) for region, group in by_region.items()]

        async def holdings(isbn13: str, region: str, group: list[LibraryRow]) -> None:
            codes: set[str] = set()
            total: int | None = None
            size = policy.SHELF_HOLDINGS_PAGE_SIZE
            page_no = 1
            reason: FallbackReason
            try:
                while True:
                    page = await call(lambda: provider.holdings_page(isbn13, region, page_no, size))
                    total, size = accept_holdings_page(page, page_no, size, total, codes)
                    if len(codes) == total:
                        break
                    page_no += 1
            except ProviderLimitReached:
                reason = "limit"
            except ProviderError:
                reason = "provider_error"
            else:
                for lib in group:
                    pair = pairs[(lib.id, isbn13)]
                    if lib.provider_lib_code in codes:
                        pair.holding = "yes"
                    else:
                        pair.holding = pair.loanable = "no"
                return
            for lib in group:  # 일부 페이지만으로 no를 단정하지 않는다
                pairs[(lib.id, isbn13)].reason = reason

        await asyncio.gather(*(holdings(*g) for g in groups))

        # ② 대출 가능: 임시 순위(소장 권수 ↓ → 거리 ↑(없으면 뒤) → ID ↑) 앞에서부터 남은 예산만큼
        def held_count(lib: LibraryRow) -> int:
            return sum(pairs[(lib.id, i)].holding == "yes" for i in isbns)

        ordered = sorted(libs, key=lambda x: (-held_count(x[0]), *_distance_key(x[1], x[0].id)))
        targets = [
            (lib, i) for lib, _ in ordered for i in isbns
            if (lib.id, i) not in todays and pairs[(lib.id, i)].holding == "yes"
            and pairs[(lib.id, i)].loanable == "unknown"
        ]
        successes: dict[str, dict[int, _Fetch]] = {}

        async def exist(lib: LibraryRow, isbn13: str) -> None:
            pair = pairs[(lib.id, isbn13)]
            try:
                result = await call(lambda: provider.book_exist(lib.provider_lib_code, isbn13))
            except ProviderLimitReached:
                pair.reason = "limit"
                return
            except ProviderError:
                pair.reason = "provider_error"
                return
            if result.holding not in {"yes", "no"} or result.loanable not in {"yes", "no"}:
                pair.reason = "provider_error"
                return
            pair.holding, pair.loanable, pair.reason = result.holding, result.loanable, None
            successes.setdefault(isbn13, {})[lib.id] = _Fetch(result=result, observed_at=self.now_fn())

        await asyncio.gather(*(exist(lib, i) for lib, i in targets))

        stored = {book_ids[i]: s for i, s in successes.items() if i in book_ids}
        if stored:
            await self._db(lambda c: [_store_observations(c, bid, today, s) for bid, s in stored.items()])
        return _bulk_result(isbns, libs, pairs)


    async def sync_libraries(self, dtl_region_codes: Sequence[str], page_size: int = 100) -> dict[str, int]:
        """시군구별로 도서관 목록을 받아 해시가 달라진 곳만 고친다(05 §3.1 libraries). 요청 경로에서 부르지 않는다."""
        provider = self.providers.library_data
        if provider is None:
            raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_PROVIDER_UNAVAILABLE, "DATA4LIBRARY_API_KEY")
        counts = {"inserted": 0, "updated": 0, "unchanged": 0}
        for code in dtl_region_codes:
            page = 1
            while True:
                try:
                    libs, total = await self._guarded_call(
                        "data4library",
                        policy.DATA4LIBRARY_DAILY_LIMIT,
                        lambda: provider.libraries(code, page, page_size),
                    )
                except ProviderLimitReached:
                    raise ApiError(429, "PROVIDER_LIMIT", MSG_PROVIDER_LIMIT) from None
                except ProviderError:
                    raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_PROVIDER_UNAVAILABLE) from None
                synced_at = self.now_fn()
                for key, value in (await self._db(lambda c: _store_libraries(c, code, libs, synced_at))).items():
                    counts[key] += value
                if not libs or page * page_size >= total:
                    break
                page += 1
        return counts

    async def sync_theme_holdings(
        self, regions: Sequence[str] = (), max_calls: int | None = None,
    ) -> tuple[int, dict[str, Any]]:
        provider = self.providers.library_data
        targets = await self._db(lambda c: holdings_targets(c, today_kst(self.now_fn()), regions))
        summary: dict[str, dict[str, int]] = {}
        for target in targets:
            counts = summary.setdefault(target.region, {
                "targets": 0, "updated": 0, "empty": 0, "reused": 0,
                "failed": 0, "unprocessed": 0, "unmatched_codes": 0, "requests": 0,
            })
            counts["targets"] += 1
            counts["reused" if target.fresh else "unprocessed"] += 1
        if provider is None:
            report: dict[str, Any] = {"requests": 0, "regions": summary}
            if any(counts["unprocessed"] for counts in summary.values()):
                return 1, {**report, "stop_reason": "provider_not_configured"}
            return 0, report
        calls = 0
        stop_reason = None
        for target in targets:
            if target.fresh:
                continue
            if max_calls is not None and calls >= max_calls:
                stop_reason = "run_limit"
                break
            counts = summary[target.region]
            try:
                started = await self._db(lambda c: c.execute(text("SELECT clock_timestamp()")).scalar_one())
                codes: set[str] = set()
                page_no = 1
                size = policy.SHELF_HOLDINGS_PAGE_SIZE
                total = None
                while True:
                    try:
                        page = await self._guarded_call(
                            "data4library", policy.DATA4LIBRARY_DAILY_LIMIT,
                            lambda: provider.holdings_page(target.isbn13, target.region, page_no, size),
                        )
                    except ProviderError:
                        calls += 1
                        counts["requests"] += 1
                        raise
                    calls += 1
                    counts["requests"] += 1
                    total, size = accept_holdings_page(page, page_no, size, total, codes)
                    if len(codes) == total:
                        unmatched = await self._db(lambda c: replace_holdings(c, target, started, codes))
                        counts["unprocessed"] -= 1
                        if unmatched is None:
                            counts["reused"] += 1
                        else:
                            counts["updated"] += 1
                            counts["empty"] += int(not codes)
                            counts["unmatched_codes"] += unmatched
                        break
                    pages_left = (total - len(codes) + size - 1) // size
                    if max_calls is not None and calls + pages_left > max_calls:
                        stop_reason = "run_limit"
                        break
                    page_no += 1
            except ProviderLimitReached:
                stop_reason = "daily_limit"
                break
            except (ProviderError, SQLAlchemyError):
                counts["unprocessed"] -= 1
                counts["failed"] += 1
        incomplete = any(counts["failed"] or counts["unprocessed"] for counts in summary.values())
        return int(incomplete), {"requests": calls, "regions": summary, "stop_reason": stop_reason}


MSG_NOT_FOUND = "찾을 수 없어요."
FallbackReason = Literal["not_configured", "limit", "provider_error", "no_data"]
_TAG_RE = re.compile(r"<[^>]+>")

def _clean_book_text(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    value = html.unescape(_TAG_RE.sub("", raw)).strip()
    return value or None


def isbn13_is_valid(value: str) -> bool:
    if not re.fullmatch(r"[0-9]{13}", value):
        return False
    total = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(value[:12]))
    return (10 - total % 10) % 10 == int(value[12])


def isbn10_to_13(value: str) -> str | None:
    """10자리 ISBN(마지막 X 허용)을 978 접두 13자리로 바꾼다(05 §3.1 books.isbn13). 틀리면 None."""
    value = value.strip().upper()
    if not re.fullmatch(r"[0-9]{9}[0-9X]", value):
        return None
    check10 = sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(value)) % 11
    if check10 != 0:
        return None
    core = "978" + value[:9]
    total = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(core))
    return core + str((10 - total % 10) % 10)


def normalize_isbn(raw: str | None) -> str | None:
    """제공자 ISBN 칸(예: 네이버 "8936434128 9788936434120")에서 유효한 13자리를 고른다."""
    if not raw:
        return None
    tokens = [t.replace("-", "") for t in str(raw).split()]
    for token in tokens:
        if isbn13_is_valid(token):
            return token
    for token in tokens:
        converted = isbn10_to_13(token)
        if converted:
            return converted
    return None


def https_cover(url: Any) -> str | None:
    """표지 주소만 저장하고 이미지는 복사하지 않는다. http는 https로 바꾼다(05 §3.1 books.cover_url)."""
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    if url.startswith("http://"):
        url = "https://" + url[len("http://") :]
    return url if url.startswith("https://") else None


@dataclass(frozen=True)
class BookInfo:
    isbn13: str
    title: str
    author: str | None = None
    publisher: str | None = None
    cover_url: str | None = None
    description: str | None = None
    pub_year: int | None = None
    class_name: str | None = None


@dataclass(frozen=True)
class SearchPage:
    items: list[BookInfo]
    total: int


class BookSearchProvider(Protocol):
    def search(self, query: str, start: int, display: int) -> SearchPage: ...

    def lookup_isbn(self, isbn13: str) -> BookInfo | None: ...


def _kakao_item(item: Any) -> BookInfo | None:
    if not isinstance(item, dict):
        return None
    isbn13 = normalize_isbn(item.get("isbn"))  # "ISBN10 ISBN13"처럼 공백으로 이어서 온다
    title = _clean_book_text(item.get("title"))
    if not isbn13 or not title:
        return None  # 상세·소장 조회 대상이 될 수 없는 항목은 뺀다
    authors = item.get("authors")
    names = [a for a in (_clean_book_text(x) for x in authors) if a] if isinstance(authors, list) else []
    published = item.get("datetime")
    return BookInfo(
        isbn13=isbn13,
        title=title,
        author=", ".join(names) or None,
        publisher=_clean_book_text(item.get("publisher")),
        cover_url=https_cover(item.get("thumbnail")),  # 표지가 없으면 빈 문자열로 온다
        description=_description(item.get("contents")),
        pub_year=_pub_year(published[:4]) if isinstance(published, str) else None,  # ISO 8601 앞 4자리
    )


class KakaoBookClient:
    """카카오(다음) 책 검색 API. REST API 키는 헤더로만 보낸다."""

    def __init__(self, rest_api_key: str, base_url: str, timeout: float):
        self._headers = {"Authorization": f"KakaoAK {rest_api_key}"}
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    def _get(self, params: dict[str, Any]) -> dict[str, Any]:
        data = _http_get_json(f"{self._base}/book?{urlencode(params)}", self._headers, self._timeout)
        if not isinstance(data, dict) or not isinstance(data.get("documents"), list) \
                or not isinstance(data.get("meta"), dict):
            raise ProviderError("카카오 응답 형식이 달라요")
        return data

    def search(self, query: str, start: int, display: int) -> SearchPage:
        # 우리 start(1, 21, 41…)를 카카오 page(1~50)로 바꾼다
        page = (start - 1) // display + 1
        if page > policy.KAKAO_MAX_PAGE:
            return SearchPage(items=[], total=0)
        data = self._get({"query": query, "page": page, "size": display})
        meta = data["meta"]
        pageable = meta.get("pageable_count")
        if not isinstance(pageable, int) or pageable < 0:
            raise ProviderError("카카오 pageable_count가 없어요")
        items = [b for b in (_kakao_item(i) for i in data["documents"]) if b is not None]
        # is_end면 이 쪽이 마지막이다(뒤 쪽을 더 부르지 않게 total을 이 쪽 끝으로 맞춘다)
        total = min(pageable, start + display - 1) if meta.get("is_end") is True else pageable
        return SearchPage(items=items, total=total)

    def lookup_isbn(self, isbn13: str) -> BookInfo | None:
        data = self._get({"query": isbn13, "target": "isbn", "size": 10})
        for item in data["documents"]:
            book = _kakao_item(item)
            if book is not None and book.isbn13 == isbn13:
                return book
        return None


@dataclass(frozen=True)
class BookRecord:
    id: int
    isbn13: str
    title: str
    author: str | None
    publisher: str | None
    cover_url: str | None
    source: str
    description: str | None
    pub_year: int | None

    def public(self) -> dict[str, Any]:
        return {
            "isbn13": self.isbn13,
            "title": self.title,
            "author": self.author,
            "publisher": self.publisher,
            "cover_url": self.cover_url,
            "source": self.source,
            "description": self.description,
            "pub_year": self.pub_year,
        }


def _book_row(row: Any) -> BookRecord:
    return BookRecord(
        id=int(row.id),
        isbn13=row.isbn13,
        title=row.title,
        author=row.author,
        publisher=row.publisher,
        cover_url=row.cover_url,
        source=row.source,
        description=row.description,
        pub_year=row.pub_year,
    )


def select_book(conn: Connection, isbn13: str) -> BookRecord | None:
    row = conn.execute(
        text("SELECT id, isbn13, title, author, publisher, cover_url, source, description, pub_year FROM books WHERE isbn13 = :i"),
        {"i": isbn13},
    ).first()
    return _book_row(row) if row else None


def upsert_books(
    conn: Connection, infos: Iterable[BookInfo], source: str, fetched_at: datetime, *, overwrite: bool
) -> list[BookRecord]:
    """제공자가 준 서지를 books에 넣는다(순서 보존, 같은 ISBN은 한 번).

    overwrite=False(인기 도서)는 이미 있는 서지를 덮지 않고 빈 표지만 채운다.
    """
    seen: set[str] = set()
    records: list[BookRecord] = []
    update = (
        "title = EXCLUDED.title, author = EXCLUDED.author, publisher = EXCLUDED.publisher, "
        "cover_url = COALESCE(EXCLUDED.cover_url, books.cover_url), source = EXCLUDED.source, "
        "description = COALESCE(EXCLUDED.description, books.description), "
        "pub_year = COALESCE(EXCLUDED.pub_year, books.pub_year), fetched_at = EXCLUDED.fetched_at"
        if overwrite
        else "author = COALESCE(books.author, EXCLUDED.author), "
        "publisher = COALESCE(books.publisher, EXCLUDED.publisher), "
        "cover_url = COALESCE(books.cover_url, EXCLUDED.cover_url), "
        "description = COALESCE(books.description, EXCLUDED.description), "
        "pub_year = COALESCE(books.pub_year, EXCLUDED.pub_year)"
    )
    for info in infos:
        if info.isbn13 in seen:
            continue
        seen.add(info.isbn13)
        row = conn.execute(
            text(
                f"""
                INSERT INTO books (isbn13, title, author, publisher, cover_url, source, fetched_at, description, pub_year)
                VALUES (:isbn13, :title, :author, :publisher, :cover_url, :source, :fetched_at, :description, :pub_year)
                ON CONFLICT (isbn13) DO UPDATE SET {update}
                RETURNING id, isbn13, title, author, publisher, cover_url, source, description, pub_year
                """
            ),
            {
                "isbn13": info.isbn13,
                "title": info.title,
                "author": info.author,
                "publisher": info.publisher,
                "cover_url": https_cover(info.cover_url),
                "description": _description(info.description),
                "pub_year": _pub_year(info.pub_year),
                "source": source,
                "fetched_at": fetched_at,
            },
        ).one()
        records.append(_book_row(row))
    return records


def _like_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search_cached_books(conn: Connection, query: str, start: int, size: int) -> tuple[list[BookRecord], bool]:
    rows = conn.execute(
        text(
            """
            SELECT id, isbn13, title, author, publisher, cover_url, source, description, pub_year FROM books
            WHERE isbn13 IS NOT NULL
              AND (title ILIKE :p OR author ILIKE :p OR isbn13 = :q)
            ORDER BY title COLLATE "C", id
            OFFSET :offset LIMIT :limit
            """
        ),
        {"p": _like_pattern(query), "q": query, "offset": start - 1, "limit": size + 1},
    ).all()
    return [_book_row(r) for r in rows[:size]], len(rows) > size


@dataclass(frozen=True)
class SearchResult:
    items: list[BookRecord]
    next_start: int | None
    source: Literal["kakao", "cache"]
    fallback_reason: FallbackReason | None


@dataclass(frozen=True)
class PopularResult:
    scope: Literal["national", "library"]
    library_id: int | None
    period_label: str
    books: list[BookRecord]
    fetched_at: datetime
    stale: bool
    fallback_reason: FallbackReason | None
    class_names: dict[str, str] = field(default_factory=dict)


def _read_popular(conn: Connection, scope: str, library_id: int | None) -> PopularResult | None:
    rows = conn.execute(
        text(
            """
            SELECT b.id, b.isbn13, b.title, b.author, b.publisher, b.cover_url, b.source, b.description, b.pub_year,
                   p.period_label, p.fetched_at, p.provider_class_name
            FROM popular_books_cache p JOIN books b ON b.id = p.book_id
            WHERE p.scope = :scope AND p.library_id IS NOT DISTINCT FROM :library_id
              AND b.isbn13 IS NOT NULL
            ORDER BY p.rank
            """
        ),
        {"scope": scope, "library_id": library_id},
    ).all()
    if not rows:
        return None
    return PopularResult(
        scope=scope,  # type: ignore[arg-type]
        library_id=library_id,
        period_label=rows[0].period_label,
        books=[_book_row(r) for r in rows][: policy.POPULAR_SIZE],
        fetched_at=min(r.fetched_at for r in rows),
        stale=False,
        fallback_reason=None,
        class_names={r.isbn13: r.provider_class_name for r in rows if r.provider_class_name},
    )


def _store_popular(
    conn: Connection,
    scope: Literal["national", "library"],
    library_id: int | None,
    infos: list[BookInfo],
    label: str,
    fetched_at: datetime,
) -> PopularResult:
    # 같은 범위를 동시에 갱신하면 DELETE·INSERT가 엇갈려 순위 UNIQUE에 걸린다 → 범위별로 직렬화
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"popular:{scope}:{library_id}"})
    records = upsert_books(conn, infos[: policy.POPULAR_SIZE], "data4library", fetched_at, overwrite=False)
    class_names = {info.isbn13: info.class_name for info in infos[: policy.POPULAR_SIZE] if info.class_name}
    conn.execute(
        text("DELETE FROM popular_books_cache WHERE scope = :scope AND library_id IS NOT DISTINCT FROM :lid"),
        {"scope": scope, "lid": library_id},
    )
    for rank, record in enumerate(records, start=1):
        conn.execute(
            text(
                """
                INSERT INTO popular_books_cache
                    (scope, library_id, rank, book_id, period_label, fetched_at, provider_class_name)
                VALUES (:scope, :lid, :rank, :book_id, :label, :fetched_at, :class_name)
                """
            ),
            {
                "scope": scope,
                "lid": library_id,
                "rank": rank,
                "book_id": record.id,
                "label": label,
                "fetched_at": fetched_at,
                "class_name": class_names.get(record.isbn13),
            },
        )
    return PopularResult(scope, library_id, label, records, fetched_at, False, None, class_names)



def _description(value: Any) -> str | None:
    cleaned = _clean_book_text(value)
    return cleaned[:policy.BOOK_DESCRIPTION_MAX_CHARS] if cleaned else None


def _pub_year(value: Any) -> int | None:
    raw = str(value) if value is not None else ""
    if not re.fullmatch(r"[0-9]{4}(?:[0-9]{4})?", raw):
        return None
    year = int(raw[:4])
    return year if 1000 <= year <= 2999 else None


Tri = Literal["yes", "no", "unknown"]

@dataclass(frozen=True)
class HoldingResult:
    holding: Literal["yes", "no"]
    loanable: Tri
    data_date: date | None = None


@dataclass(frozen=True)
class AvailabilityItem:
    library: LibraryRow
    holding: Tri
    loanable: Tri
    basis: Literal["today", "stale", "none"]
    source: str | None = None
    observed_at: datetime | None = None
    data_date: date | None = None
    data_date_assumed: bool = False
    fallback_reason: FallbackReason | None = None


@dataclass
class _Observation:
    holding: Tri
    loanable: Tri
    observed_on: date
    observed_at: datetime
    data_date: date | None
    data_date_assumed: bool
    source: str


@dataclass
class _Fetch:
    result: HoldingResult | None = None
    reason: FallbackReason | None = None
    observed_at: datetime | None = None


def _yn(value: Any) -> Literal["yes", "no"]:
    if value == "Y":
        return "yes"
    if value == "N":
        return "no"
    raise ProviderError("Y/N이 아닌 값")  # 모르는 값을 no로 추측하지 않는다


def live_check_link(library: LibraryRow, isbn13: str) -> tuple[str | None, str | None]:
    """"실시간 확인" 주소(02 §9 Q-48): 템플릿 → 홈페이지 → 없음(버튼 숨김). (주소, 종류)."""
    template = library.isbn_search_url_template
    if template and "{isbn13}" in template and template.startswith(("https://", "http://")):
        return template.replace("{isbn13}", isbn13), "isbn_search"
    if library.homepage and library.homepage.startswith(("https://", "http://")):
        return library.homepage, "homepage"
    return None, None


def _data_date(provided: date | None, today: date) -> tuple[date, bool]:
    """기준일이 없으면 조회일 전날로 두고 추정했다고 표시한다(05 §3.1, 02 LIB-03)."""
    if provided is not None:
        return provided, False
    return today - timedelta(days=1), True


def _from_observation(
    lib: LibraryRow, obs: _Observation, basis: Literal["today", "stale"], reason: FallbackReason | None
) -> AvailabilityItem:
    return AvailabilityItem(
        library=lib,
        holding=obs.holding,
        loanable=obs.loanable,
        basis=basis,
        source=obs.source,
        observed_at=obs.observed_at,
        data_date=obs.data_date,
        data_date_assumed=obs.data_date_assumed,
        fallback_reason=reason,
    )


def _latest_observations(conn: Connection, book_id: int, library_ids: list[int]) -> dict[int, _Observation]:
    """도서관마다 가장 최근 관측(unknown 제외 — unknown은 캐시로 치지 않는다, 05 §3.1)."""
    rows = conn.execute(
        text(
            """
            SELECT DISTINCT ON (library_id)
                library_id, holding, loanable, observed_on, observed_at, data_date, data_date_assumed, source
            FROM availability_observations
            WHERE book_id = :book_id AND library_id = ANY(:ids) AND holding <> 'unknown' AND loanable <> 'unknown'
            ORDER BY library_id, observed_on DESC
            """
        ),
        {"book_id": book_id, "ids": library_ids},
    ).all()
    return {
        int(r.library_id): _Observation(
            holding=r.holding,
            loanable=r.loanable,
            observed_on=r.observed_on,
            observed_at=r.observed_at,
            data_date=r.data_date,
            data_date_assumed=r.data_date_assumed,
            source=r.source,
        )
        for r in rows
    }


def _store_observations(conn: Connection, book_id: int, today: date, successes: dict[int, _Fetch]) -> None:
    for library_id, fetch in successes.items():
        assert fetch.result is not None
        if fetch.result.holding not in {"yes", "no"} or fetch.result.loanable not in {"yes", "no"}:
            raise ProviderError("unknown observations cannot be persisted")
        data_date, assumed = _data_date(fetch.result.data_date, today)
        conn.execute(
            text(
                """
                INSERT INTO availability_observations (
                    library_id, book_id, observed_on, holding, loanable,
                    data_date, data_date_assumed, observed_at, source
                ) VALUES (
                    :library_id, :book_id, :observed_on, :holding, :loanable,
                    :data_date, :assumed, :observed_at, 'data4library'
                )
                ON CONFLICT (library_id, book_id, observed_on) DO UPDATE SET
                    holding = EXCLUDED.holding,
                    loanable = EXCLUDED.loanable,
                    data_date = EXCLUDED.data_date,
                    data_date_assumed = EXCLUDED.data_date_assumed,
                    observed_at = EXCLUDED.observed_at,
                    source = EXCLUDED.source
                """
            ),
            {
                "library_id": library_id,
                "book_id": book_id,
                "observed_on": today,
                "holding": fetch.result.holding,
                "loanable": fetch.result.loanable,
                "data_date": data_date,
                "assumed": assumed,
                "observed_at": fetch.observed_at,
            },
        )



# ─────────── 여러 ISBN 소장 일괄 조회(K24, #70) ───────────

BulkBookStatus = Literal["held", "not_held", "unknown"]
BULK_FALLBACK_KEYS: tuple[FallbackReason, ...] = ("limit", "provider_error", "not_configured")


@dataclass
class _BulkPair:
    holding: Tri = "unknown"
    loanable: Tri = "unknown"
    reason: FallbackReason | None = None


@dataclass(frozen=True)
class BulkCandidate:
    library: LibraryRow
    distance_km: float | None
    held_isbn13s: tuple[str, ...]
    loanable_isbn13s: tuple[str, ...]


@dataclass(frozen=True)
class BulkAvailabilityResult:
    complete: bool
    unknown_pairs: int
    fallback_counts: dict[str, int]
    book_status: dict[str, BulkBookStatus]
    candidates: tuple[BulkCandidate, ...]  # 표시 순서(거리 ↑, 없으면 뒤 → ID ↑)


def _bulk_today(
    conn: Connection, isbns: list[str], library_ids: list[int], today: date
) -> tuple[dict[str, int], dict[tuple[int, str], tuple[Tri, Tri]]]:
    """책 ID와 오늘(서울) bookExist 관측. unknown 관측은 캐시로 치지 않는다(05 §3.1)."""
    book_ids = {
        r.isbn13: int(r.id)
        for r in conn.execute(text("SELECT id, isbn13 FROM books WHERE isbn13 = ANY(:isbns)"), {"isbns": isbns})
    }
    rows = conn.execute(
        text(
            """
            SELECT o.library_id, b.isbn13, o.holding, o.loanable
            FROM availability_observations o JOIN books b ON b.id = o.book_id
            WHERE b.isbn13 = ANY(:isbns) AND o.library_id = ANY(:ids) AND o.observed_on = :today
              AND o.holding <> 'unknown' AND o.loanable <> 'unknown'
            """
        ),
        {"isbns": isbns, "ids": library_ids, "today": today},
    ).all()
    return book_ids, {(int(r.library_id), r.isbn13): (r.holding, r.loanable) for r in rows}


def _distance_key(distance_km: float | None, library_id: int) -> tuple[bool, float, int]:
    return distance_km is None, distance_km or 0.0, library_id


def _bulk_result(
    isbns: list[str], libs: list[tuple[LibraryRow, float | None]], pairs: dict[tuple[int, str], _BulkPair]
) -> BulkAvailabilityResult:
    counts = dict.fromkeys(BULK_FALLBACK_KEYS, 0)
    for pair in pairs.values():
        if pair.reason in counts and "unknown" in (pair.holding, pair.loanable):
            counts[pair.reason] += 1
    status: dict[str, BulkBookStatus] = {}
    for isbn13 in isbns:
        holdings = [pairs[(lib.id, isbn13)].holding for lib, _ in libs]
        status[isbn13] = "held" if "yes" in holdings else (
            "not_held" if all(h == "no" for h in holdings) else "unknown")
    found = []
    for lib, distance in libs:
        held = tuple(i for i in isbns if pairs[(lib.id, i)].holding == "yes")
        if held:
            loanable = tuple(i for i in held if pairs[(lib.id, i)].loanable == "yes")
            found.append(BulkCandidate(lib, distance, held, loanable))
    found.sort(key=lambda c: (-len(c.held_isbn13s), -len(c.loanable_isbn13s),
                              *_distance_key(c.distance_km, c.library.id)))
    top = sorted(found[: policy.BATCH_AVAILABILITY_TOP_LIBRARIES],
                 key=lambda c: _distance_key(c.distance_km, c.library.id))
    unknown = sum(pair.holding == "unknown" for pair in pairs.values())
    return BulkAvailabilityResult(
        complete=unknown == 0, unknown_pairs=unknown, fallback_counts=counts,
        book_status=status, candidates=tuple(top),
    )


# ─────────── YES24 큐레이션·구매 직링크(C-81, K23) ───────────


@dataclass(frozen=True)
class Yes24Item:
    sort_order: int
    item_id: str
    isbn13: str | None
    title: str | None
    author: str | None = None
    publisher: str | None = None
    goods_type: str | None = None
    goods_sort_nm: str | None = None
    adult_yn: str = "N"
    pub_year: int | None = None
    item_status: str | None = None
    cover_url: str | None = None
    product_url: str | None = None
    description: str | None = None


@dataclass(frozen=True)
class Yes24CuratedPage:
    items: list[Yes24Item]
    pub_date: datetime | None = None


class Yes24Provider(Protocol):
    def curated_list(
        self,
        list_kind: Literal["steady", "bestseller"],
        category_id: str,
        page: int = 1,
        size: int = policy.YES24_CURATED_FETCH_SIZE,
    ) -> Yes24CuratedPage: ...

    def item_detail(self, isbn13: str) -> Yes24Item | None: ...


@dataclass(frozen=True)
class CuratedResult:
    provider: Literal["yes24"]
    list_kind: Literal["steady", "bestseller"]
    category_id: str
    basis_label: str
    books: list[BookRecord]
    source_published_at: datetime | None
    fetched_at: datetime
    stale: bool
    fallback_reason: FallbackReason | None


@dataclass(frozen=True)
class PurchaseLinkResult:
    isbn13: str
    provider: Literal["yes24"]
    kind: Literal["product", "search"]
    url: str


@dataclass(frozen=True)
class _CachedPurchaseLink:
    external_item_id: str
    product_url: str
    item_status: str | None
    fetched_at: datetime


def _parse_yes24_pub_date(raw: Any) -> datetime | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    text_val = raw.strip()
    if text_val.endswith("Z"):
        text_val = text_val[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text_val)
    except ValueError:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=KST)


def _parse_yes24_item(raw: Any) -> Yes24Item | None:
    if not isinstance(raw, dict):
        return None
    raw_sort = raw.get("sortOrder")
    sort_order = raw_sort if type(raw_sort) is int else 0
    raw_item_id = raw.get("itemId")
    if type(raw_item_id) is int and raw_item_id > 0:
        item_id = str(raw_item_id)
    elif isinstance(raw_item_id, str) and raw_item_id.strip().isdigit() and int(raw_item_id.strip()) > 0:
        item_id = raw_item_id.strip()
    else:
        item_id = ""
    raw_isbn13 = _clean_text(raw.get("isbn13"))
    isbn13 = normalize_isbn(raw_isbn13) if raw_isbn13 else normalize_isbn(raw.get("isbn10"))
    raw_pub = _clean_text(raw.get("publishDate"))
    pub_year = _pub_year(raw_pub) if raw_pub and re.fullmatch(r"[0-9]{8}", raw_pub) else None
    detail = raw.get("contentDetail") if isinstance(raw.get("contentDetail"), dict) else {}
    description = _description(detail.get("bookIntroduction")) or _description(detail.get("bookSummary"))
    adult_yn = (_clean_text(raw.get("adultYn")) or "").upper()
    return Yes24Item(
        sort_order=sort_order,
        item_id=item_id,
        isbn13=isbn13,
        title=_clean_book_text(raw.get("title")),
        author=_clean_book_text(raw.get("author")),
        publisher=_clean_book_text(raw.get("publisher")),
        goods_type=_clean_text(raw.get("goodsType")),
        goods_sort_nm=_clean_text(raw.get("goodsSortNm")),
        adult_yn=adult_yn,
        pub_year=pub_year,
        item_status=_clean_text(raw.get("itemStatus")),
        cover_url=https_cover(raw.get("cover")),  # 약관: cover(앞표지)만 사용, sideCover·backCover 미사용
        product_url=_clean_text(raw.get("link")),
        description=description,
    )


def _is_valid_yes24_product_url(url: str | None) -> bool:
    return isinstance(url, str) and url.startswith(policy.YES24_PRODUCT_URL_PREFIX)


def _filter_yes24_curated_items(
    items: Sequence[Yes24Item], limit: int = policy.YES24_CURATED_SIZE
) -> list[Yes24Item]:
    ordered = sorted(items, key=lambda item: item.sort_order)
    seen_isbns: set[str] = set()
    result: list[Yes24Item] = []
    for item in ordered:
        if item.adult_yn.upper() == "Y":
            continue
        if item.goods_type not in policy.YES24_CURATED_ALLOWED_GOODS_TYPES:
            continue
        if item.goods_sort_nm and any(
            token in item.goods_sort_nm for token in policy.YES24_CURATED_EXCLUDED_SORT_TOKENS
        ):
            continue
        if not item.isbn13 or not isbn13_is_valid(item.isbn13) or not item.title:
            continue
        if item.isbn13 in seen_isbns:
            continue
        seen_isbns.add(item.isbn13)
        result.append(item)
        if len(result) >= limit:
            break
    return result


def _is_eligible_purchase_link(item: Yes24Item, expected_isbn13: str | None = None) -> bool:
    if expected_isbn13 is not None and item.isbn13 != expected_isbn13:
        return False
    if item.adult_yn.upper() == "Y":
        return False
    if item.goods_type not in policy.YES24_PURCHASE_ALLOWED_GOODS_TYPES:
        return False
    if item.item_status not in policy.YES24_PURCHASABLE_STATUSES:
        return False
    if not _is_valid_yes24_product_url(item.product_url):
        return False
    if not item.item_id:
        return False
    return True


def _yes24_to_book_info(item: Yes24Item) -> BookInfo:
    assert item.isbn13 is not None and item.title is not None
    return BookInfo(
        isbn13=item.isbn13,
        title=item.title,
        author=item.author,
        publisher=item.publisher,
        cover_url=item.cover_url,
        description=item.description,
        pub_year=item.pub_year,
    )


def _yes24_basis_label(list_kind: Literal["steady", "bestseller"], category_id: str) -> str:
    kind_label = "스테디셀러" if list_kind == "steady" else "베스트셀러"
    cat_label = "국내도서" if category_id == policy.YES24_DEFAULT_CATEGORY_ID else category_id
    return f"YES24 {kind_label} · {cat_label}"


def _mark_curated_stale(cached: CuratedResult, reason: FallbackReason) -> CuratedResult:
    return replace(cached, stale=True, fallback_reason=reason)


def _read_curated(
    conn: Connection,
    provider: Literal["yes24"],
    list_kind: Literal["steady", "bestseller"],
    category_id: str,
) -> CuratedResult | None:
    rows = conn.execute(
        text(
            """
            SELECT b.id, b.isbn13, b.title, b.author, b.publisher, b.cover_url, b.source, b.description, b.pub_year,
                   c.basis_label, c.source_published_at, c.fetched_at
            FROM curated_books_cache c JOIN books b ON b.id = c.book_id
            WHERE c.provider = :provider AND c.list_kind = :list_kind AND c.category_id = :category_id
              AND b.isbn13 IS NOT NULL
            ORDER BY c.rank
            """
        ),
        {"provider": provider, "list_kind": list_kind, "category_id": category_id},
    ).all()
    if not rows:
        return None
    return CuratedResult(
        provider=provider,
        list_kind=list_kind,
        category_id=category_id,
        basis_label=rows[0].basis_label,
        books=[_book_row(r) for r in rows][: policy.YES24_CURATED_SIZE],
        source_published_at=rows[0].source_published_at,
        fetched_at=min(r.fetched_at for r in rows),
        stale=False,
        fallback_reason=None,
    )


def _replace_curated_cache(
    conn: Connection,
    provider: Literal["yes24"],
    list_kind: Literal["steady", "bestseller"],
    category_id: str,
    records: Sequence[BookRecord],
    basis_label: str,
    source_published_at: datetime | None,
    fetched_at: datetime,
) -> None:
    conn.execute(
        text(
            "DELETE FROM curated_books_cache "
            "WHERE provider = :provider AND list_kind = :list_kind AND category_id = :category_id"
        ),
        {"provider": provider, "list_kind": list_kind, "category_id": category_id},
    )
    for rank, record in enumerate(records[: policy.YES24_CURATED_SIZE], start=1):
        conn.execute(
            text(
                """
                INSERT INTO curated_books_cache (
                    provider, list_kind, category_id, rank, book_id,
                    basis_label, source_published_at, fetched_at
                ) VALUES (
                    :provider, :list_kind, :category_id, :rank, :book_id,
                    :basis_label, :source_published_at, :fetched_at
                )
                """
            ),
            {
                "provider": provider,
                "list_kind": list_kind,
                "category_id": category_id,
                "rank": rank,
                "book_id": record.id,
                "basis_label": basis_label,
                "source_published_at": source_published_at,
                "fetched_at": fetched_at,
            },
        )


def _upsert_purchase_link(
    conn: Connection,
    book_id: int,
    provider: Literal["yes24"],
    external_item_id: str,
    product_url: str,
    item_status: str | None,
    fetched_at: datetime,
) -> None:
    conn.execute(
        text(
            """
            INSERT INTO book_purchase_links (
                book_id, provider, external_item_id, product_url, item_status, fetched_at
            ) VALUES (
                :book_id, :provider, :external_item_id, :product_url, :item_status, :fetched_at
            )
            ON CONFLICT (book_id, provider) DO UPDATE SET
                external_item_id = EXCLUDED.external_item_id,
                product_url = EXCLUDED.product_url,
                item_status = EXCLUDED.item_status,
                fetched_at = EXCLUDED.fetched_at
            """
        ),
        {
            "book_id": book_id,
            "provider": provider,
            "external_item_id": external_item_id,
            "product_url": product_url,
            "item_status": item_status,
            "fetched_at": fetched_at,
        },
    )


def _upsert_yes24_purchase_links(
    conn: Connection,
    records_by_isbn: dict[str, BookRecord],
    items: Sequence[Yes24Item],
    fetched_at: datetime,
) -> None:
    for item in items:
        if item.isbn13 is None or item.isbn13 not in records_by_isbn:
            continue
        if not _is_eligible_purchase_link(item, expected_isbn13=item.isbn13):
            continue
        assert item.product_url is not None
        _upsert_purchase_link(
            conn,
            records_by_isbn[item.isbn13].id,
            "yes24",
            item.item_id,
            item.product_url,
            item.item_status,
            fetched_at,
        )


def _read_purchase_link(
    conn: Connection, isbn13: str, provider: Literal["yes24"]
) -> _CachedPurchaseLink | None:
    row = conn.execute(
        text(
            """
            SELECT l.external_item_id, l.product_url, l.item_status, l.fetched_at
            FROM book_purchase_links l JOIN books b ON b.id = l.book_id
            WHERE b.isbn13 = :isbn13 AND l.provider = :provider
            """
        ),
        {"isbn13": isbn13, "provider": provider},
    ).first()
    if row is None:
        return None
    return _CachedPurchaseLink(
        external_item_id=row.external_item_id,
        product_url=row.product_url,
        item_status=row.item_status,
        fetched_at=row.fetched_at,
    )


class Yes24Client:
    """YES24 Open API 클라이언트. 인증은 X-Api-Key 헤더만 사용한다(Y-1)."""

    _LIST_ENDPOINTS: dict[str, str] = {
        "steady": "category/bestsellerSteady",
        "bestseller": "category/bestseller",
    }

    def __init__(
        self,
        api_key: str,
        base_url: str,
        timeout: float,
        min_interval: float = policy.YES24_MIN_INTERVAL_SECONDS,
    ) -> None:
        self._headers = {policy.YES24_AUTH_HEADER: api_key}
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._min_interval = max(0.0, min_interval)
        self._lock = threading.Lock()
        self._last_call_at = 0.0

    def _wait_interval(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            wait = self._min_interval - (now - self._last_call_at)
            if wait > 0:
                time.sleep(wait)
            self._last_call_at = time.monotonic()

    def _get(
        self,
        path: str,
        params: dict[str, Any],
        *,
        not_found_codes: frozenset[str] = frozenset(),
    ) -> dict[str, Any] | None:
        self._wait_interval()
        url = f"{self._base}/{path}?{urlencode(params)}"
        request = urllib.request.Request(url, headers={"Accept": "application/json", **self._headers})
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                raw = response.read(policy.PROVIDER_MAX_RESPONSE_BYTES + 1)
        except urllib.error.HTTPError as exc:
            error_code: str | None = None
            try:
                err_raw = exc.read(policy.PROVIDER_MAX_RESPONSE_BYTES + 1)
                err_body = json.loads(err_raw)
                if isinstance(err_body, dict) and isinstance(err_body.get("errorCode"), str):
                    error_code = err_body["errorCode"]
            except Exception:
                error_code = None
            if exc.code == 404 and error_code in not_found_codes:
                return None
            raise ProviderError(f"YES24 HTTP {exc.code}: {error_code or 'unknown'}") from exc
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as exc:
            raise ProviderError(type(exc).__name__) from exc

        if len(raw) > policy.PROVIDER_MAX_RESPONSE_BYTES:
            raise ProviderError("응답이 너무 커요")
        try:
            data = json.loads(raw)
        except ValueError as exc:
            raise ProviderError("JSON 형식이 아니에요") from exc

        if (
            not isinstance(data, dict)
            or data.get("success") is not True
            or data.get("errorCode") is not None
            or not isinstance(data.get("data"), dict)
            or not isinstance(data["data"].get("items"), list)
        ):
            code = data.get("errorCode") if isinstance(data, dict) else None
            raise ProviderError(f"YES24 응답 오류: {code or 'invalid_envelope'}")
        return data["data"]

    def curated_list(
        self,
        list_kind: Literal["steady", "bestseller"],
        category_id: str,
        page: int = 1,
        size: int = policy.YES24_CURATED_FETCH_SIZE,
    ) -> Yes24CuratedPage:
        endpoint = self._LIST_ENDPOINTS.get(list_kind)
        if endpoint is None:
            raise ValueError(f"지원하지 않는 YES24 목록 종류: {list_kind}")
        if page < 1:
            raise ValueError("YES24 page는 1 이상이어야 해요")
        if not 1 <= size <= 100:
            raise ValueError("YES24 pageSize는 1~100이어야 해요")
        cat = category_id.strip()
        if not cat:
            raise ValueError("YES24 categoryId가 비어 있어요")

        payload = self._get(
            endpoint,
            {"categoryId": cat, "page": page, "pageSize": size},
            not_found_codes=frozenset({"BEST_001"}),
        )
        if payload is None:
            return Yes24CuratedPage(items=[], pub_date=None)
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        pub_date = _parse_yes24_pub_date(meta.get("pubDate"))
        items = [parsed for parsed in (_parse_yes24_item(x) for x in payload["items"]) if parsed is not None]
        return Yes24CuratedPage(items=items, pub_date=pub_date)

    def item_detail(self, isbn13: str) -> Yes24Item | None:
        payload = self._get(
            "goods/itemDetail",
            {"searchType": "ISBN13", "query": isbn13},
            not_found_codes=frozenset({"GOODS_002"}),
        )
        if payload is None or not payload["items"]:
            return None
        return _parse_yes24_item(payload["items"][0])


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
