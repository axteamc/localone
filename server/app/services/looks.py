"""M2-0-P3: 도서관 룩 배정(Z6)·서가 테마 읽기(Z7)·책장 페이지(Z8) — core 계약 M2-0.

- 룩: 운영자는 `modern`만 지정한다. 나머지는 `warm`·`toffee`·`oxford` 중 자동 — 반경 5km 안(직선거리, 자기 제외)
  도서관들이 이미 쓰는 팔레트 중 가장 적게 쓰인 것(동률은 이름순). 주변에 배정된 곳이 2곳 이하면 자연히 서로 다르다.
  한 번 정하면 저장하고, 새 도서관이 생겨도 바꾸지 않는다. 동시에 두 곳을 배정해도 규칙이 지켜지게 전역 잠금으로 줄 세운다.
- 책장(2026-11-25 C-92 3장 체제): DB만 읽는 `theme`을 여기서 만든다. `popular`(YES24 베스트셀러)와
  `recent_reads`(정보나루 도서관별 최근 30일 대출)는 외부 조회가 있어 라우터가 엔진으로 만든다(이 파일은 필터만).
"""

import unicodedata
from collections import Counter
from datetime import date
from typing import Any, Literal, cast

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app import policy
from app.services.provider_engine import PopularResult, distance_km

LookPreset = Literal["modern", "warm", "toffee", "oxford"]
AUTO_LOOKS: tuple[LookPreset, ...] = ("warm", "toffee", "oxford")
LOOK_RADIUS_KM = 5.0  # Z6
LOOK_LOCK_KEY = "libraries:look"

TITLE_POPULAR = "화제의 책"  # ① YES24 베스트셀러(C-92, C-94 이름 변경: 이전 "인기 도서")
TITLE_RECENT_LOANS = "요즘 사람들이 읽고 간 책"  # ③ 정보나루 loanItemSrchByLib 최근 30일(C-92, C-94 이름 변경: 이전 "최근 대출 도서")
SHELF_BESTSELLER_LABEL = "YES24 베스트셀러"


# ─────────── 룩 ───────────

def _lock_library(conn: Connection, library_id: int) -> Any:
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": LOOK_LOCK_KEY})
    row = conn.execute(text("SELECT id, latitude, longitude, look, look_assigned_by FROM libraries "
                            "WHERE id = :id FOR UPDATE"), {"id": library_id}).one_or_none()
    if row is None:
        raise ValueError(f"library {library_id} not found")
    return row


def _nearby_looks(conn: Connection, row: Any) -> list[str]:
    if row.latitude is None or row.longitude is None:
        return []
    others = conn.execute(text("SELECT latitude, longitude, look FROM libraries WHERE id <> :id "
                               "AND look IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL"),
                          {"id": row.id}).all()
    return [o.look for o in others
            if distance_km(row.latitude, row.longitude, o.latitude, o.longitude) <= LOOK_RADIUS_KM]


def _pick_auto(conn: Connection, row: Any) -> LookPreset:
    used = Counter(look for look in _nearby_looks(conn, row) if look in AUTO_LOOKS)
    return min(AUTO_LOOKS, key=lambda p: (used[p], p))


def _save(conn: Connection, library_id: int, look: str, by: str) -> None:
    conn.execute(text("UPDATE libraries SET look = :l, look_assigned_by = :b WHERE id = :id"),
                 {"l": look, "b": by, "id": library_id})


def assign_look(conn: Connection, library_id: int) -> LookPreset:
    """이미 정해졌으면 그대로, 아니면 자동으로 골라 저장한다(Z6). 없는 도서관은 ValueError(프로그램 오류)."""
    row = _lock_library(conn, library_id)
    if row.look:
        return cast(LookPreset, row.look)  # 한 번 정하면 그대로
    pick = _pick_auto(conn, row)
    _save(conn, library_id, pick, "auto")
    return pick


def set_look_by_operator(conn: Connection, library_id: int, mode: Literal["modern", "auto"]) -> tuple[str, str, bool]:
    """운영자 지정(`modern`) 또는 재배정(`auto` = 지금 주변 기준으로 다시 고름). 반환 (look, 배정 주체, 바뀜)."""
    row = _lock_library(conn, library_id)
    if mode == "modern":
        look, by = "modern", "operator"
    else:
        look, by = _pick_auto(conn, row), "auto"
    changed = (row.look, row.look_assigned_by) != (look, by)
    if changed:
        _save(conn, library_id, look, by)
    return look, by, changed


# ─────────── 책장 ───────────

def shelf_book(row: Any) -> dict[str, Any]:
    """core `Book` 네 칸만(VISIT-3 C3)."""
    return {"isbn13": row.isbn13, "title": row.title, "author": row.author, "cover_url": row.cover_url}


def theme_page(conn: Connection, library_id: int, today: date) -> dict[str, Any] | None:
    rows = conn.execute(text("""
        WITH matched AS (
            SELECT t.id AS theme_id, t.title AS theme_title, t.basis_label AS theme_basis, t.library_id, t.priority,
                   b.isbn13, b.title, b.author, b.cover_url, MIN(tb.position) AS position
            FROM libraries l
            JOIN library_holdings_cache h ON h.library_id = l.id AND h.region_code = l.region_code
            JOIN library_holdings_snapshots s ON s.book_id = h.book_id AND s.region_code = h.region_code
            JOIN shelf_theme_books tb ON tb.book_id = h.book_id
            JOIN shelf_themes t ON t.id = tb.theme_id AND (t.library_id = l.id OR t.library_id IS NULL)
            JOIN books b ON b.id = h.book_id
            WHERE l.id = :library_id AND :today BETWEEN t.starts_on AND t.ends_on
              AND t.title NOT ILIKE '%베스트셀러%'
              AND s.fetched_at > statement_timestamp() - :ttl AND b.isbn13 IS NOT NULL
            GROUP BY t.id, b.id
        ), selected AS (
            SELECT theme_id
            FROM matched
            GROUP BY theme_id, library_id, priority
            HAVING COUNT(*) >= CASE WHEN library_id IS NULL THEN :common_min ELSE :local_min END
            ORDER BY library_id IS NULL, priority, theme_id
            LIMIT 1
        )
        SELECT m.theme_title, m.theme_basis, m.isbn13, m.title, m.author, m.cover_url
        FROM matched m JOIN selected USING (theme_id)
        ORDER BY m.position LIMIT :limit
        """), {
            "library_id": library_id, "today": today, "ttl": policy.SHELF_HOLDINGS_TTL,
            "common_min": policy.SHELF_COMMON_THEME_MIN_HOLDINGS,
            "local_min": policy.SHELF_LOCAL_THEME_MIN_HOLDINGS, "limit": policy.SHELF_BOOKS_PER_PAGE,
        }).all()
    if not rows:
        return None
    return {"kind": "theme", "title": rows[0].theme_title, "basis_label": rows[0].theme_basis,
            "books": [shelf_book(row) for row in rows]}


def _normalized_title(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _is_series_title(title: str, series: str) -> bool:
    if not title.startswith(series):
        return False
    suffix = title[len(series):]
    return not suffix or suffix[0].isspace() or suffix[0].isdecimal() or unicodedata.category(suffix[0]).startswith("P")


def _is_comic_class(class_name: str) -> bool:
    # 정보나루 class_nm은 "예술 > 회화 > 만화"처럼 경로로 온다 → 마디 하나라도 만화류면 만화
    return any(part.strip() in policy.SHELF_POPULAR_COMIC_CLASSES for part in class_name.split(">"))


def shelf_popular_books(result: PopularResult) -> list[dict[str, Any]]:
    series_names = [_normalized_title(name) for name in policy.SHELF_POPULAR_EXCLUDED_SERIES]
    prefixes = [_normalized_title(name) for name in policy.SHELF_POPULAR_EXCLUDED_TITLE_PREFIXES]
    books = []
    for book in result.books:
        class_name = _normalized_title(result.class_names.get(book.isbn13, ""))
        if _is_comic_class(class_name) or book.isbn13 in policy.SHELF_POPULAR_EXCLUDED_ISBNS:
            continue
        title = _normalized_title(book.title)
        if any(_is_series_title(title, series) for series in series_names) or title.startswith(tuple(prefixes)):
            continue
        books.append(shelf_book(book))
        if len(books) == policy.SHELF_BOOKS_PER_PAGE:
            break
    return books
