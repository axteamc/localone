"""LIB-0-P1: 도서관 조회·동기화와 원자 호출량 예약. 외부 I/O는 트랜잭션 밖."""
from __future__ import annotations

import asyncio
import hashlib
import http.client
import json
import math
import sys
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol, TypeVar
from urllib.parse import urlencode

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from app import policy
from app.common import ApiError, now_kst, today_kst
from app.db import run_db
from app.settings import Settings

T = TypeVar("T")
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
    rows = conn.execute(
        text(f"SELECT {LIBRARY_COLUMNS} FROM libraries WHERE dtl_region_code = :c ORDER BY name COLLATE \"C\", id"),
        {"c": dtl_region_code},
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
    """
    counts = {"inserted": 0, "updated": 0, "unchanged": 0}
    for info in libs:
        params = {
            **info.__dict__,
            "region_code": dtl_region_code[:2],
            "dtl_region_code": dtl_region_code,
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
    return counts


def _main(argv: list[str]) -> int:
    """`python -m app.services.provider_engine seed` | `sync-libraries <시군구 코드>...`"""
    from sqlalchemy import create_engine

    from app.seed import seed_reference_data
    from app.settings import get_settings

    if not argv or argv[0] not in {"seed", "sync-libraries"}:
        print(_main.__doc__)
        return 2
    settings = get_settings()
    engine = create_engine(settings.database_url)
    try:
        if argv[0] == "seed":
            print(asyncio.run(run_db(engine, seed_reference_data)))
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


class LibraryDataProvider(Protocol):
    def libraries(self, dtl_region: str, page: int, size: int) -> tuple[list[LibraryInfo], int]: ...


@dataclass(frozen=True)
class Providers:
    library_data: LibraryDataProvider | None = None


class Data4LibraryClient:
    def __init__(self, auth_key: str, base_url: str, timeout: float):
        self._key = auth_key
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    def _get(self, op: str, params: dict[str, Any]) -> dict[str, Any]:
        query = urlencode({"authKey": self._key, "format": "json", **params})
        data = _http_get_json(f"{self._base}/{op}?{query}", {}, self._timeout)
        response = data.get("response") if isinstance(data, dict) else None
        if not isinstance(response, dict) or "error" in response:
            raise ProviderError("정보나루 응답 형식이 다르거나 오류")
        return response

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
    library_data = None
    if settings.data4library_api_key:
        library_data = Data4LibraryClient(settings.data4library_api_key, settings.data4library_api_base_url,
                                         policy.PROVIDER_TIMEOUT_SECONDS)
    return Providers(library_data=library_data)


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


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
