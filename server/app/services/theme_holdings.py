"""Public holdings snapshot storage for the visiting-library shelf."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app import policy


@dataclass(frozen=True)
class HoldingsTarget:
    book_id: int
    isbn13: str
    region: str
    fresh: bool


def holdings_targets(conn: Connection, today: date, regions: Sequence[str]) -> list[HoldingsTarget]:
    rows = conn.execute(text("""
        WITH regions AS (
            SELECT DISTINCT region_code FROM libraries
            WHERE region_code ~ '^[0-9]{2}$'
              AND (:all_regions OR region_code = ANY(CAST(:regions AS text[])))
        ), candidates AS (
            SELECT b.id AS book_id, b.isbn13, r.region_code AS region, MIN(t.starts_on) AS first_day
            FROM shelf_themes t
            JOIN shelf_theme_books tb ON tb.theme_id = t.id
            JOIN books b ON b.id = tb.book_id
            LEFT JOIN libraries l ON l.id = t.library_id
            JOIN regions r ON t.library_id IS NULL OR r.region_code = l.region_code
            WHERE t.ends_on >= :today AND t.starts_on <= :through AND b.isbn13 IS NOT NULL
            GROUP BY b.id, r.region_code
        )
        SELECT c.book_id, c.isbn13, c.region,
               COALESCE(s.fetched_at > statement_timestamp() - :ttl, false) AS fresh
        FROM candidates c
        LEFT JOIN library_holdings_snapshots s ON s.book_id = c.book_id AND s.region_code = c.region
        ORDER BY c.first_day, c.isbn13, c.region
        """), {
            "today": today, "through": today + policy.SHELF_HOLDINGS_LOOKAHEAD,
            "all_regions": not regions, "regions": list(regions), "ttl": policy.SHELF_HOLDINGS_TTL,
        }).all()
    return [HoldingsTarget(row.book_id, row.isbn13, row.region, row.fresh) for row in rows]


def replace_holdings(
    conn: Connection, target: HoldingsTarget, fetched_at: datetime, codes: set[str],
) -> int | None:
    """Publish one finished result. Return the unmatched code count, or None if superseded."""
    params = {"book_id": target.book_id, "region": target.region, "fetched_at": fetched_at}
    accepted = conn.execute(text("""
        INSERT INTO library_holdings_snapshots (book_id, region_code, fetched_at)
        VALUES (:book_id, :region, :fetched_at)
        ON CONFLICT (book_id, region_code) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
        WHERE library_holdings_snapshots.fetched_at < EXCLUDED.fetched_at
        RETURNING book_id
        """), params).scalar_one_or_none()
    if accepted is None:
        return None
    conn.execute(text("""
        DELETE FROM library_holdings_cache WHERE book_id = :book_id AND region_code = :region
        """), params)
    if not codes:
        return 0
    inserted = conn.execute(text("""
        INSERT INTO library_holdings_cache (book_id, region_code, library_id)
        SELECT :book_id, :region, id FROM libraries
        WHERE region_code = :region AND provider_lib_code = ANY(CAST(:codes AS text[]))
        """), {**params, "codes": sorted(codes)})
    return len(codes) - inserted.rowcount
