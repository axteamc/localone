"""Support template posts and link them to reading logs."""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022_club_restriction_review"
branch_labels = None
depends_on = None

PREVIOUS_VALUE_CHECK = (
    "(image_kind = 'photo' AND image_value ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$') "
    "OR (image_kind = 'cover' AND image_value LIKE 'https://%') "
    "OR (image_kind = 'color' AND image_value IN ("
    "'bold','coral','lemonZest','vanillaCanvas','vanilla','complementary','atlanticBlue','indigoDrift','crimsonWhisper',"
    "'fill1','fill2','fill3','cream','paper','inkStrong'))"
)

def set_image_checks(kinds: str, values: str) -> None:
    op.drop_constraint("posts_image_value_check", "posts", type_="check")
    op.drop_constraint("posts_image_kind_check", "posts", type_="check")
    op.create_check_constraint("posts_image_kind_check", "posts", f"image_kind IN ({kinds})")
    op.create_check_constraint("posts_image_value_check", "posts", values)


def upgrade() -> None:
    set_image_checks(
        "'photo','cover','color','template'",
        PREVIOUS_VALUE_CHECK + " OR (image_kind = 'template' AND image_value IN ('minimal','ink'))",
    )
    op.add_column("posts", sa.Column("reading_log_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_posts_reading_log_id", "posts", "reading_logs", ["reading_log_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "ux_posts_reading_log_published", "posts", ["reading_log_id"], unique=True,
        postgresql_where=sa.text("reading_log_id IS NOT NULL AND status = 'published'"),
    )


def downgrade() -> None:
    # The previous CHECK rejects template rows. PostgreSQL rolls back the migration on failure.
    set_image_checks("'photo','cover','color'", PREVIOUS_VALUE_CHECK)
    op.drop_index("ux_posts_reading_log_published", table_name="posts")
    op.drop_constraint("fk_posts_reading_log_id", "posts", type_="foreignkey")
    op.drop_column("posts", "reading_log_id")
