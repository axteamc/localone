"""06 #10·#11·#31. 공공 참조 DB만 읽고 요청 좌표는 저장하지 않는다.

#11 `look`·#31 책장은 core 계약 M2-0-P3(Z6·Z8). #11은 룩이 아직 없으면 그 자리에서 자동 배정해 저장한다.
"""
import re
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Path, Query, Request
from sqlalchemy.engine import Connection

from app import policy
from app.common import ApiError, today_kst
from app.db import run_db
from app.services.looks import TITLE_POPULAR, assign_look, recent_reads_page, shelf_popular_books, theme_page
from app.services.provider_engine import (
    LibraryRow, ProviderEngine, get_library, libraries_by_name, libraries_in_region, libraries_nearby,
)

router = APIRouter(prefix="/api/v1/libraries")
MSG_VALIDATION = "요청 형식이 올바르지 않아요."
BIGINT_MAX = 2**63 - 1
WEEKDAYS = "월화수목금토일"
ORDINALS = {"첫째": 1, "둘째": 2, "셋째": 3, "넷째": 4, "다섯째": 5, "마지막": -1}
_WEEKLY = re.compile(r"매주\s*([월화수목금토일](?:\s*[·,]\s*[월화수목금토일])*)\s*요일")
_MONTHLY = re.compile(
    r"매월\s*((?:첫째|둘째|셋째|넷째|다섯째|마지막)(?:\s*[·,]\s*(?:첫째|둘째|셋째|넷째|다섯째|마지막))*)"
    r"\s*(?:주\s*)?([월화수목금토일])\s*요일"
)
_HOURS = re.compile(r"(.*?)\s*(\d{1,2}:\d{2})\s*[~–-]\s*(\d{1,2}:\d{2})")


def validation_error(*fields: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, ",".join(sorted(set(fields))))


def check_radius(radius_km: int | None) -> int:
    if radius_km is None:
        return policy.NEARBY_DEFAULT_RADIUS_KM
    if radius_km not in policy.NEARBY_RADII_KM:
        raise validation_error("radius_km")
    return radius_km


def area_label_of(address: str | None) -> str | None:
    # 제공자 괄호 주소도 낱말로 읽는다: "48 (화동)" → "화동".
    normalized = re.sub(r"[()]", " ", address or "")
    match = re.search(r"\S+(?:동|읍|면|가)(?=\s|$)", normalized)
    return match.group() if match else None


def _parse_days(spec: str) -> set[int] | None:
    spec = spec.replace("요일", "").replace(" ", "")
    if spec in {"", "매일"}:
        return set(range(7))
    days = set()
    for part in re.split(r"[·,]", spec):
        if part == "평일":
            days.update(range(5))
        elif part == "주말":
            days.update({5, 6})
        elif re.fullmatch(r"[월화수목금토일]~[월화수목금토일]", part):
            start, end = WEEKDAYS.index(part[0]), WEEKDAYS.index(part[2])
            days.update(range(start, end + 1))
        elif len(part) == 1 and part in WEEKDAYS:
            days.add(WEEKDAYS.index(part))
        else:
            return None
    return days or None


def today_hours(operating_time_text: str | None, today: date) -> str | None:
    for segment in re.split(r"[/\n]", operating_time_text or ""):
        match = _HOURS.fullmatch(segment.strip())
        if not match:
            continue
        days = _parse_days(match[1])
        if days is None or today.weekday() not in days:
            continue
        times = [tuple(map(int, value.split(":"))) for value in (match[2], match[3])]
        if any(hour > 23 or minute > 59 for hour, minute in times):
            continue
        return f"{match[2]}~{match[3]}"
    return None


def closed_today(closed_text: str | None, today: date) -> tuple[bool | None, bool]:
    """아는 정기 규칙만 계산한다. 미해석·공휴일 미확인 상태를 숨기지 않는다."""
    if not closed_text or not closed_text.strip():
        return None, True
    # 규칙 안의 쉼표(매월 첫째,셋째)와 규칙 사이 쉼표를 구별한다.
    clauses = re.split(r"[/\n]|,(?!\s*(?:[월화수목금토일]\s*요일|첫째|둘째|셋째|넷째|다섯째|마지막))", closed_text)
    unknown = False
    closed = False
    for raw in clauses:
        clause = raw.strip()
        weekly, monthly = _WEEKLY.fullmatch(clause), _MONTHLY.fullmatch(clause)
        if weekly:
            closed |= today.weekday() in {WEEKDAYS.index(d) for d in re.findall(r"[월화수목금토일]", weekly[1])}
        elif monthly:
            nths = [ORDINALS[n] for n in re.findall(r"첫째|둘째|셋째|넷째|다섯째|마지막", monthly[1])]
            is_last = (today + timedelta(days=7)).month != today.month
            closed |= (today.weekday() == WEEKDAYS.index(monthly[2]) and
                       ((today.day - 1) // 7 + 1 in nths or (-1 in nths and is_last)))
        else:
            unknown = True
    if closed:
        return True, unknown
    return (None, True) if unknown else (False, False)


def library_summary(lib: LibraryRow, distance_km: float | None, today: date | None = None) -> dict[str, Any]:
    today = today or today_kst()
    is_closed, unchecked = closed_today(lib.closed_text, today)
    return {
        "id": lib.id, "name": lib.name, "address": lib.address,
        "latitude": lib.latitude, "longitude": lib.longitude,
        "dtl_region_code": lib.dtl_region_code, "area_label": area_label_of(lib.address),
        "distance_m": round(distance_km * 1000) if distance_km is not None else None,
        "today": {"date": today.isoformat(), "is_closed": is_closed,
                  "hours_text": today_hours(lib.operating_time_text, today) if is_closed is False else None,
                  "holiday_unchecked": unchecked},
    }


@router.get("")
async def list_libraries(
    request: Request,
    lat: float | None = Query(None, ge=-90, le=90, allow_inf_nan=False),
    lng: float | None = Query(None, ge=-180, le=180, allow_inf_nan=False),
    radius_km: int | None = Query(None),
    dtl_region: str | None = Query(None, pattern=r"^[0-9]{5}$"),
    q: str | None = Query(None),
) -> Any:
    modes = int(lat is not None or lng is not None or radius_km is not None) + int(dtl_region is not None) + int(q is not None)
    if modes > 1:
        raise validation_error(*(key for key, value in {"lat": lat, "lng": lng, "radius_km": radius_km,
                                                       "dtl_region": dtl_region, "q": q}.items() if value is not None))
    engine, today = request.app.state.engine, today_kst()
    if dtl_region is not None:
        libs = await run_db(engine, lambda c: libraries_in_region(c, dtl_region))
        mode, radius = "region", None
        items = [library_summary(lib, None, today) for lib in libs]
    elif q is not None:
        q = q.strip()
        if not 1 <= len(q) <= policy.LIBRARY_QUERY_MAX_CHARS:
            raise validation_error("q")
        libs = await run_db(engine, lambda c: libraries_by_name(c, q, policy.LIBRARY_SEARCH_LIMIT))
        mode, radius = "search", None
        items = [library_summary(lib, None, today) for lib in libs]
    else:
        if lat is None or lng is None:
            raise validation_error(*(["lat"] if lat is None else []), *(["lng"] if lng is None else []))
        radius = check_radius(radius_km)
        found = await run_db(engine, lambda c: libraries_nearby(c, lat, lng, radius))
        mode = "nearby"
        items = [library_summary(lib, distance, today) for lib, distance in found]
    return {"mode": mode, "radius_km": radius, "dtl_region": dtl_region, "q": q, "items": items}


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "찾을 수 없어요.")


@router.get("/{library_id}")
async def library_detail(request: Request, library_id: int = Path(ge=1, le=BIGINT_MAX)) -> Any:
    def tx(c: Connection) -> tuple[LibraryRow, str] | None:
        lib = get_library(c, library_id)
        return None if lib is None else (lib, assign_look(c, library_id))

    found = await run_db(request.app.state.engine, tx)
    if found is None:
        raise not_found()
    lib, look = found
    return {**library_summary(lib, None), "tel": lib.tel, "homepage": lib.homepage,
            "operating_time_text": lib.operating_time_text, "closed_text": lib.closed_text, "look": look}


async def popular_page(engine: ProviderEngine, lib: LibraryRow) -> dict[str, Any] | None:
    """LIB-0 도서관별 인기 캐시 상위 3권(외부 조회는 엔진, 트랜잭션 밖). 도서관 데이터가 없어 전국으로 대체되거나
    받지 못하면 페이지를 뺀다(책장은 "이 도서관"). Q-42 실측 전 임시."""
    try:
        result = await engine.popular_books(lib)
    except ApiError:
        return None
    if result.scope != "library":
        return None
    books = shelf_popular_books(result)
    if not books:
        return None
    return {"kind": "popular", "title": TITLE_POPULAR, "basis_label": result.period_label, "books": books}


@router.get("/{library_id}/shelf")
async def library_shelf(request: Request, library_id: int = Path(ge=1, le=BIGINT_MAX)) -> Any:
    """#31 책장 페이지(Z8): ① recent_reads ② popular ③ theme 순, 빈 페이지는 뺀다."""
    today = today_kst()

    def tx(c: Connection) -> tuple[LibraryRow, dict[str, Any] | None, dict[str, Any] | None] | None:
        lib = get_library(c, library_id)
        if lib is None:
            return None
        return lib, recent_reads_page(c, library_id, today), theme_page(c, library_id, today)

    found = await run_db(request.app.state.engine, tx)
    if found is None:
        raise not_found()
    lib, recent, theme = found
    popular = await popular_page(request.app.state.provider_engine, lib)
    return {"pages": [page for page in (recent, popular, theme) if page is not None]}
