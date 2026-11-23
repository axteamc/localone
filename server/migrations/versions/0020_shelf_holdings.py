"""Theme priorities, regional holdings snapshots, and shelf classification."""

import sqlalchemy as sa
from alembic import op

revision = "0020_shelf_holdings"
down_revision = "0019"
branch_labels = None
depends_on = None

POSITION_CHECK = "shelf_theme_books_position_check"


def upgrade() -> None:
    op.add_column("shelf_themes", sa.Column("priority", sa.SmallInteger(), server_default="1", nullable=False))
    op.create_check_constraint("shelf_themes_priority_check", "shelf_themes", "priority BETWEEN 1 AND 3")
    op.drop_constraint(POSITION_CHECK, "shelf_theme_books", type_="check")
    op.create_check_constraint(POSITION_CHECK, "shelf_theme_books", "position BETWEEN 1 AND 20")
    op.add_column("popular_books_cache", sa.Column("provider_class_name", sa.Text(), nullable=True))
    op.execute("""
        CREATE TABLE library_holdings_snapshots (
            book_id bigint NOT NULL REFERENCES books(id),
            region_code text NOT NULL CHECK (region_code ~ '^[0-9]{2}$'),
            fetched_at timestamptz NOT NULL,
            PRIMARY KEY (book_id, region_code)
        );
        ALTER TABLE library_holdings_snapshots ENABLE ROW LEVEL SECURITY;
        CREATE TABLE library_holdings_cache (
            book_id bigint NOT NULL,
            region_code text NOT NULL,
            library_id bigint NOT NULL REFERENCES libraries(id),
            PRIMARY KEY (book_id, region_code, library_id),
            FOREIGN KEY (book_id, region_code)
                REFERENCES library_holdings_snapshots (book_id, region_code) ON DELETE CASCADE
        );
        ALTER TABLE library_holdings_cache ENABLE ROW LEVEL SECURITY;
        CREATE INDEX ix_library_holdings_cache_library ON library_holdings_cache (library_id, book_id, region_code);
        """)


def downgrade() -> None:
    op.execute("SELECT pg_advisory_xact_lock(hashtext('shelf_themes'))")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM shelf_theme_books WHERE position > 3)
                OR EXISTS (
                    SELECT 1 FROM shelf_themes a JOIN shelf_themes b ON a.id < b.id
                    AND a.library_id IS NOT DISTINCT FROM b.library_id
                    AND a.starts_on <= b.ends_on AND b.starts_on <= a.ends_on
                )
            THEN
                RAISE EXCEPTION 'Cannot downgrade: shelf themes use expanded positions or overlapping periods';
            END IF;
        END $$;
        """)
    op.drop_table("library_holdings_cache")
    op.drop_table("library_holdings_snapshots")
    op.drop_column("popular_books_cache", "provider_class_name")
    op.drop_constraint(POSITION_CHECK, "shelf_theme_books", type_="check")
    op.create_check_constraint(POSITION_CHECK, "shelf_theme_books", "position BETWEEN 1 AND 3")
    op.drop_constraint("shelf_themes_priority_check", "shelf_themes", type_="check")
    op.drop_column("shelf_themes", "priority")
