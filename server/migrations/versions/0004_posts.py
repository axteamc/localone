"""LOCAL-1-P1: 방문 페이지 피드 게시물(posts) — local-feed 계약 C5."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

IMAGE_VALUE_CHECK = (
    "(image_kind = 'photo' AND image_value ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$') "
    "OR (image_kind = 'cover' AND image_value LIKE 'https://%') "
    "OR (image_kind = 'color' AND image_value IN ('fill1','fill2','fill3','cream','paper','inkStrong'))"
)


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("library_id", sa.BigInteger(), sa.ForeignKey("libraries.id"), nullable=False),
        sa.Column("book_id", sa.BigInteger(), sa.ForeignKey("books.id"), nullable=True),
        sa.Column("image_kind", sa.Text(), nullable=False),
        sa.Column("image_value", sa.Text(), nullable=False),
        sa.Column("overlay_text", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'published'")),
        sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("image_kind IN ('photo','cover','color')", name="posts_image_kind_check"),
        sa.CheckConstraint("image_kind <> 'cover' OR book_id IS NOT NULL", name="posts_cover_book_check"),
        sa.CheckConstraint(IMAGE_VALUE_CHECK, name="posts_image_value_check"),
        sa.CheckConstraint("overlay_text IS NULL OR char_length(overlay_text) BETWEEN 1 AND 80",
                           name="posts_overlay_text_len_check"),
        sa.CheckConstraint("body IS NULL OR char_length(body) BETWEEN 1 AND 2000",
                           name="posts_body_len_check"),
        sa.CheckConstraint("status IN ('published','withdrawn','hidden')", name="posts_status_check"),
        sa.UniqueConstraint("user_id", "client_request_id", name="posts_user_client_request_key"),
    )
    op.execute(
        "CREATE INDEX ix_posts_library_published ON posts (library_id, published_at DESC, id DESC) "
        "WHERE status = 'published'"
    )
    op.execute(
        "CREATE INDEX ix_posts_book_published ON posts (book_id, published_at DESC, id DESC) "
        "WHERE status = 'published'"
    )
    op.execute("ALTER TABLE posts ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("posts")
