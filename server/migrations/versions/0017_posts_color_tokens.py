"""H6 피드 단색 9색 추가 + 옛 6색 호환 — local-feed 계약 F7."""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

LEGACY_CHECK = (
    "(image_kind = 'photo' AND image_value ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$') "
    "OR (image_kind = 'cover' AND image_value LIKE 'https://%') "
    "OR (image_kind = 'color' AND image_value IN ('fill1','fill2','fill3','cream','paper','inkStrong'))"
)

NEW_CHECK = (
    "(image_kind = 'photo' AND image_value ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$') "
    "OR (image_kind = 'cover' AND image_value LIKE 'https://%') "
    "OR (image_kind = 'color' AND image_value IN ("
    "'bold','coral','lemonZest','vanillaCanvas','vanilla','complementary','atlanticBlue','indigoDrift','crimsonWhisper',"
    "'fill1','fill2','fill3','cream','paper','inkStrong'))"
)


def upgrade() -> None:
    op.drop_constraint("posts_image_value_check", "posts", type_="check")
    op.create_check_constraint("posts_image_value_check", "posts", NEW_CHECK)


def downgrade() -> None:
    op.drop_constraint("posts_image_value_check", "posts", type_="check")
    op.create_check_constraint("posts_image_value_check", "posts", LEGACY_CHECK)
