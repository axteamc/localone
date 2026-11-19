"""M2-0-P3: 도서관 룩 배정(Z6)·서가 테마 읽기(Z7)·책장 페이지(Z8) — core 계약 M2-0.

- 룩: 운영자는 `modern`만 지정한다. 나머지는 `warm`·`toffee`·`oxford` 중 자동 — 반경 5km 안(직선거리, 자기 제외)
  도서관들이 이미 쓰는 팔레트 중 가장 적게 쓰인 것(동률은 이름순). 주변에 배정된 곳이 2곳 이하면 자연히 서로 다르다.
  한 번 정하면 저장하고, 새 도서관이 생겨도 바꾸지 않는다. 동시에 두 곳을 배정해도 규칙이 지켜지게 전역 잠금으로 줄 세운다.
- 책장: DB만 읽는 페이지(`recent_reads`·`theme`)를 여기서 만든다. `popular`는 외부 조회가 있어 라우터가 엔진으로 만든다.
"""

from collections import Counter
from datetime import date, timedelta
from typing import Any, Literal, cast

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.services.provider_engine import distance_km

LookPreset = Literal["modern", "warm", "toffee", "oxford"]
AUTO_LOOKS: tuple[LookPreset, ...] = ("warm", "toffee", "oxford")
LOOK_RADIUS_KM = 5.0  # Z6
LOOK_LOCK_KEY = "libraries:look"

SHELF_BOOKS = 3  # 페이지당 책 최대 3(VISIT-3 C2)
RECENT_READS_DAYS = 30  # Q-49 미확인(임시)
RECENT_READS_MIN_COUNT = 3  # Q-49 미확인(임시): 도서관-책 합계 3건 이상만
TITLE_RECENT_READS = "요즘 사람들이 읽은 책"
TITLE_POPULAR = "인기 도서"


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


def recent_reads_page(conn: Connection, library_id: int, today: date) -> dict[str, Any] | None:
    rows = conn.execute(text(
        """
        SELECT b.isbn13, b.title, b.author, b.cover_url, SUM(s.return_count) AS n
        FROM library_return_stats s JOIN books b ON b.id = s.book_id
        WHERE s.library_id = :lid AND s.returned_on BETWEEN :start AND :today AND b.isbn13 IS NOT NULL
        GROUP BY b.id HAVING SUM(s.return_count) >= :min
        ORDER BY n DESC, b.id LIMIT :limit
        """),
        {"lid": library_id, "start": today - timedelta(days=RECENT_READS_DAYS - 1), "today": today,
         "min": RECENT_READS_MIN_COUNT, "limit": SHELF_BOOKS}).all()
    if not rows:
        return None
    return {"kind": "recent_reads", "title": TITLE_RECENT_READS,
            "basis_label": f"최근 {RECENT_READS_DAYS}일 · 이 도서관", "books": [shelf_book(r) for r in rows]}


def active_theme(conn: Connection, library_id: int, today: date) -> Any:
    """Q-47 임시: 이 도서관 테마가 있으면 그것, 없으면 전체 공통. 범위마다 동시에 하나(쓰기에서 보장)."""
    return conn.execute(text(
        "SELECT id, title FROM shelf_themes WHERE starts_on <= :d AND ends_on >= :d "
        "AND (library_id = :lid OR library_id IS NULL) "
        "ORDER BY library_id IS NULL, created_at DESC, id LIMIT 1"), {"d": today, "lid": library_id}).one_or_none()


def theme_books(conn: Connection, theme_id: Any) -> list[dict[str, Any]]:
    rows = conn.execute(text(
        "SELECT b.isbn13, b.title, b.author, b.cover_url FROM shelf_theme_books t JOIN books b ON b.id = t.book_id "
        "WHERE t.theme_id = :t AND b.isbn13 IS NOT NULL ORDER BY t.position"), {"t": theme_id}).all()
    return [shelf_book(r) for r in rows]


def theme_page(conn: Connection, library_id: int, today: date) -> dict[str, Any] | None:
    theme = active_theme(conn, library_id, today)
    if theme is None:
        return None
    books = theme_books(conn, theme.id)
    if not books:
        return None
    return {"kind": "theme", "title": theme.title, "basis_label": None, "books": books}
