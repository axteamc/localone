"""도서 검색·상세·인기 추천(06 #7~#9). 인증 없음.

외부 데이터는 조회 엔진(`ProviderEngine`)으로만 얻는다(H-ARCH-07: 이 파일에 HTTP 클라이언트 import 없음).
"""

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Query, Request

from app import policy
from app.common import KST, ApiError
from app.db import run_db
from app.routers.libraries import (
    BIGINT_MAX,
    validation_error,
)
from app.services.provider_engine import (
    LibraryRow,
    ProviderEngine,
    get_library,
    isbn13_is_valid,
)

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


# ─────────── #9 M1 인기 도서 추천(K8) ───────────


@router.get("/recommendations")
async def recommendations(
    request: Request, library_id: int | None = Query(None, ge=1, le=BIGINT_MAX)
) -> Any:
    library = await _library_or_404(request, library_id) if library_id is not None else None
    popular = await _engine(request).popular_books(library)
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


