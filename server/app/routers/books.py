"""도서 검색·상세·인기 추천·대출 가능·구매 링크. 인증 없음.

외부 데이터는 조회 엔진(`ProviderEngine`)으로만 얻는다(H-ARCH-07: 이 파일에 HTTP 클라이언트 import 없음).
"""

from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Query, Request

from app import policy
from app.common import KST, ApiError, now_kst
from app.db import run_db
from app.routers.libraries import (
    BIGINT_MAX,
    check_radius,
    library_summary,
    validation_error,
)
from app.services.provider_engine import (
    AvailabilityItem,
    live_check_link,
    libraries_in_region,
    libraries_nearby,
    LibraryRow,
    ProviderEngine,
    PurchaseLinkResult,
    RecommendationSource,
    get_library,
    isbn13_is_valid,
)

DTL_REGION_PATTERN = r"^[0-9]{5}$"

MSG_NOT_FOUND = "찾을 수 없어요."

router = APIRouter(prefix="/api/v1/books")


def _engine(request: Request) -> ProviderEngine:
    return request.app.state.provider_engine


def _isbn(isbn13: str) -> str:
    if not isbn13_is_valid(isbn13):
        raise validation_error("isbn13")
    return isbn13


def _iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(KST).isoformat(timespec="seconds")
    return value.isoformat()


async def _library_or_404(request: Request, library_id: int) -> LibraryRow:
    lib = await run_db(request.app.state.engine, lambda c: get_library(c, library_id))
    if lib is None:
        raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND)
    return lib


# ─────────── #7 검색 ───────────


@router.get("/search")
async def search_books(
    request: Request,
    q: str = Query(..., min_length=1, max_length=policy.SEARCH_QUERY_MAX_CHARS),
    start: int = Query(1, ge=1, le=policy.SEARCH_MAX_START),
) -> Any:
    query = q.strip()
    if not query:
        raise validation_error("q")
    result = await _engine(request).search_books(query, start)
    return {
        "items": [book.public() for book in result.items],
        "next_start": result.next_start,
        "source": result.source,
        "fallback_reason": result.fallback_reason,
    }


# ─────────── #9 인기 도서 추천(K8·K23) ───────────


@router.get("/recommendations")
async def recommendations(
    request: Request,
    library_id: int | None = Query(None, ge=1, le=BIGINT_MAX),
    source: RecommendationSource = Query("auto"),
) -> Any:
    library = await _library_or_404(request, library_id) if library_id is not None else None
    popular = await _engine(request).recommendations(library, source)
    return {
        "kind": "popular",
        "scope": popular.scope,
        "library_id": popular.library_id,
        "basis_label": popular.period_label,
        "theme": None,
        "books": [book.public() for book in popular.books[: policy.RECOMMENDATION_MAX_BOOKS]],
        "fetched_at": _iso(popular.fetched_at),
        "stale": popular.stale,
        "fallback_reason": popular.fallback_reason,
    }


# ─────────── #8 상세 ───────────


@router.get("/{isbn13}")
async def book_detail(request: Request, isbn13: str) -> Any:
    return (await _engine(request).get_book(_isbn(isbn13))).public()


# ─────────── #12~#14 소장·대출 가능 ───────────


def _availability_item(item: AvailabilityItem, isbn13: str, distance_km: float | None) -> dict[str, Any]:
    url, kind = live_check_link(item.library, isbn13)
    summary = library_summary(item.library, distance_km)
    return {
        "library": {**{k: summary[k] for k in ("id", "name", "address", "area_label", "distance_m", "today")},
                    "tel": item.library.tel},
        "holding": item.holding,
        "loanable": item.loanable,
        "basis": item.basis,
        "source": item.source,
        "observed_at": _iso(item.observed_at),
        "data_date": _iso(item.data_date),
        "data_date_assumed": item.data_date_assumed,
        "fallback_reason": item.fallback_reason,
        "live_check": {"url": url, "kind": kind} if url else None,
    }


@router.get("/{isbn13}/availability")
async def availability(
    request: Request,
    isbn13: str,
    scope: Literal["nearby", "city"] | None = Query(None),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    radius_km: int | None = Query(None),
    dtl_region: str | None = Query(None, pattern=DTL_REGION_PATTERN),
    library_id: int | None = Query(None, ge=1, le=BIGINT_MAX),
) -> Any:
    isbn13 = _isbn(isbn13)
    db = request.app.state.engine
    distances: dict[int, float] = {}
    radius: int | None = None
    if library_id is not None:
        if scope is not None or lat is not None or lng is not None or radius_km is not None or dtl_region:
            raise validation_error("library_id", "scope")
        libraries = [await _library_or_404(request, library_id)]
        scope_name = "library"
    elif scope == "nearby":
        if lat is None or lng is None or dtl_region is not None:
            raise validation_error("lat", "lng")
        radius = check_radius(radius_km)
        found = await run_db(db, lambda c: libraries_nearby(c, lat, lng, radius))
        libraries = [lib for lib, _ in found]
        distances = {lib.id: d for lib, d in found}
        scope_name = "nearby"
    elif scope == "city":
        if dtl_region is None or lat is not None or lng is not None or radius_km is not None:
            raise validation_error("dtl_region")
        libraries = await run_db(db, lambda c: libraries_in_region(c, dtl_region))
        scope_name = "city"
    else:
        raise validation_error("scope")

    items = await _engine(request).availability(isbn13, libraries)
    return {
        "isbn13": isbn13,
        "scope": scope_name,
        "radius_km": radius,
        "dtl_region": dtl_region if scope_name == "city" else None,
        "checked_at": now_kst().isoformat(timespec="seconds"),
        "items": [_availability_item(i, isbn13, distances.get(i.library.id)) for i in items],
    }


# ─────────── #15 구매 링크(K23) ───────────


@router.get("/{isbn13}/purchase-link")
async def purchase_link(request: Request, isbn13: str) -> PurchaseLinkResult:
    return await _engine(request).purchase_link(_isbn(isbn13))
