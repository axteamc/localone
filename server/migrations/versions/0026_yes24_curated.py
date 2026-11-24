"""YES24 큐레이션 캐시 및 구매 직링크 테이블 생성(C-81, K23).

- books.source CHECK에 'yes24' 추가
- curated_books_cache 생성 및 RLS 활성화(정책 0개)
- book_purchase_links 생성 및 RLS 활성화(정책 0개)
"""

from alembic import op
import sqlalchemy as sa

revision = "0026_yes24_curated"
down_revision = "0025_reports_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. books.source CHECK 확장
    op.drop_constraint("books_source_check", "books", type_="check")
    op.create_check_constraint(
        "books_source_check",
        "books",
        "source IN ('kakao', 'naver', 'data4library', 'yes24', 'manual')",
    )

    # 2. curated_books_cache
    op.create_table(
        "curated_books_cache",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("list_kind", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Text(), nullable=False),
        sa.Column("rank", sa.SmallInteger(), nullable=False),
        sa.Column(
            "book_id",
            sa.BigInteger(),
            sa.ForeignKey("books.id"),
            nullable=False,
        ),
        sa.Column("basis_label", sa.Text(), nullable=False),
        sa.Column("source_published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "provider IN ('yes24')",
            name="curated_books_cache_provider_check",
        ),
        sa.CheckConstraint(
            "list_kind IN ('steady', 'bestseller', 'new_notable')",
            name="curated_books_cache_list_kind_check",
        ),
        sa.CheckConstraint(
            "char_length(trim(category_id)) BETWEEN 1 AND 32",
            name="curated_books_cache_category_id_check",
        ),
        sa.CheckConstraint(
            "rank BETWEEN 1 AND 100",
            name="curated_books_cache_rank_check",
        ),
    )
    op.create_index(
        "uq_curated_books_slot",
        "curated_books_cache",
        ["provider", "list_kind", "category_id", "rank"],
        unique=True,
    )
    op.create_index(
        "uq_curated_books_book",
        "curated_books_cache",
        ["provider", "list_kind", "category_id", "book_id"],
        unique=True,
    )
    op.execute("ALTER TABLE curated_books_cache ENABLE ROW LEVEL SECURITY")

    # 3. book_purchase_links
    op.create_table(
        "book_purchase_links",
        sa.Column(
            "book_id",
            sa.BigInteger(),
            sa.ForeignKey("books.id"),
            nullable=False,
        ),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("external_item_id", sa.Text(), nullable=False),
        sa.Column("product_url", sa.Text(), nullable=False),
        sa.Column("item_status", sa.Text(), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("book_id", "provider"),
        sa.CheckConstraint(
            "provider IN ('yes24')",
            name="book_purchase_links_provider_check",
        ),
        sa.CheckConstraint(
            r"product_url ~ '^https://www\.yes24\.com/'",
            name="book_purchase_links_product_url_check",
        ),
    )
    op.execute("ALTER TABLE book_purchase_links ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("book_purchase_links")
    op.drop_table("curated_books_cache")
    op.execute("UPDATE books SET source = 'data4library' WHERE source = 'yes24'")
    op.drop_constraint("books_source_check", "books", type_="check")
    op.create_check_constraint(
        "books_source_check",
        "books",
        "source IN ('kakao', 'naver', 'data4library', 'manual')",
    )
