"""LOCAL-2: 공감(post_reactions)·북마크(post_bookmarks) — local-feed 계약 LOCAL-2 C5."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "post_reactions",
        sa.Column("post_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "post_bookmarks",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("post_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    # 내 표시(my_reaction·my_bookmark)를 사용자 기준으로 찾는다
    op.create_index("ix_post_reactions_user", "post_reactions", ["user_id"])
    op.create_index("ix_post_bookmarks_post", "post_bookmarks", ["post_id"])
    op.execute("ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE post_bookmarks ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("post_bookmarks")
    op.drop_table("post_reactions")
