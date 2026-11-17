"""LIB-0-P1 public reference tables (core C5)."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

PUBLIC_TABLES = ("libraries", "books", "availability_observations", "popular_books_cache", "provider_daily_usage")


def upgrade() -> None:
    # 4. libraries
    op.create_table(
        "libraries",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("provider_lib_code", sa.Text(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("tel", sa.Text(), nullable=True),
        sa.Column("homepage", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Double(), nullable=True),
        sa.Column("longitude", sa.Double(), nullable=True),
        sa.Column("closed_text", sa.Text(), nullable=True),
        sa.Column("operating_time_text", sa.Text(), nullable=True),
        sa.Column("region_code", sa.Text(), nullable=True),
        sa.Column("dtl_region_code", sa.Text(), nullable=True),
        sa.Column("isbn_search_url_template", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)",
            name="libraries_coords_pair_check",
        ),
    )
    op.create_index("ix_libraries_dtl_region_code", "libraries", ["dtl_region_code"])

    # 5. books
    op.create_table(
        "books",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("isbn13", sa.Text(), nullable=True, unique=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("author", sa.Text(), nullable=True),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("pub_year", sa.SmallInteger(), nullable=True),
        sa.CheckConstraint("description IS NULL OR char_length(description) <= 2000", name="books_description_check"),
        sa.CheckConstraint("pub_year IS NULL OR pub_year BETWEEN 1000 AND 2999", name="books_pub_year_check"),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            r"isbn13 IS NULL OR isbn13 ~ '^[0-9]{13}$'",
            name="books_isbn13_format_check",
        ),
        sa.CheckConstraint(
            "source IN ('naver', 'data4library', 'manual')",
            name="books_source_check",
        ),
    )

    # 6. availability_observations
    op.create_table(
        "availability_observations",
        sa.Column(
            "library_id",
            sa.BigInteger(),
            sa.ForeignKey("libraries.id"),
            nullable=False,
        ),
        sa.Column(
            "book_id",
            sa.BigInteger(),
            sa.ForeignKey("books.id"),
            nullable=False,
        ),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("holding", sa.Text(), nullable=False),
        sa.Column("loanable", sa.Text(), nullable=False),
        sa.Column("data_date", sa.Date(), nullable=True),
        sa.Column(
            "data_date_assumed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "observed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "source",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'data4library'"),
        ),
        sa.PrimaryKeyConstraint("library_id", "book_id", "observed_on"),
        sa.CheckConstraint(
            "holding IN ('yes', 'no', 'unknown')",
            name="availability_observations_holding_check",
        ),
        sa.CheckConstraint(
            "loanable IN ('yes', 'no', 'unknown')",
            name="availability_observations_loanable_check",
        ),
    )

    # 7. popular_books_cache
    op.create_table(
        "popular_books_cache",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column(
            "library_id",
            sa.BigInteger(),
            sa.ForeignKey("libraries.id"),
            nullable=True,
        ),
        sa.Column("rank", sa.SmallInteger(), nullable=False),
        sa.Column(
            "book_id",
            sa.BigInteger(),
            sa.ForeignKey("books.id"),
            nullable=False,
        ),
        sa.Column("period_label", sa.Text(), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "scope IN ('national', 'library')",
            name="popular_books_cache_scope_check",
        ),
        sa.CheckConstraint(
            "(scope = 'library') = (library_id IS NOT NULL)",
            name="popular_books_cache_scope_library_check",
        ),
        sa.CheckConstraint("rank >= 1", name="popular_books_cache_rank_check"),
    )
    op.create_index(
        "uq_popular_books_national_rank",
        "popular_books_cache",
        ["rank"],
        unique=True,
        postgresql_where=sa.text("scope = 'national'"),
    )
    op.create_index(
        "uq_popular_books_library_rank",
        "popular_books_cache",
        ["library_id", "rank"],
        unique=True,
        postgresql_where=sa.text("scope = 'library'"),
    )

    # 8. provider_daily_usage
    op.create_table(
        "provider_daily_usage",
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column(
            "call_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.PrimaryKeyConstraint("provider", "usage_date"),
        sa.CheckConstraint(
            "provider IN ('data4library', 'naver', 'yes24', 'kakao')",
            name="provider_daily_usage_provider_check",
        ),
        sa.CheckConstraint(
            "call_count >= 0",
            name="provider_daily_usage_call_count_check",
        ),
    )

    for table in PUBLIC_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in reversed(PUBLIC_TABLES):
        op.drop_table(table)
