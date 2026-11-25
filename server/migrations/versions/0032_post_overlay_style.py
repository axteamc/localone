"""게시 꾸미기 저장(C-94 LOCAL-1b): posts.overlay_pos·overlay_tone·image_fit.

- overlay_pos text NULL — 이미지 위 글자 자리 top·mid·bot(사진·표지만 앱이 보낸다).
- overlay_tone text NULL — 글자 색 light·dark·auto.
- image_fit text NULL — 표지 맞춤 contain(여백)·blur(흐림)·cover(확대), image_kind='cover'일 때만.
- 기존 행은 모두 NULL이고 앱이 옛 모양으로 해석한다(bot·auto·contain). 데이터 바꾸기 없음.
"""

from alembic import op

revision = "0032_post_overlay_style"
down_revision = "0031_shelf_theme_basis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE posts ADD COLUMN overlay_pos text NULL "
        "CONSTRAINT posts_overlay_pos_check CHECK (overlay_pos IS NULL OR overlay_pos IN ('top','mid','bot'))"
    )
    op.execute(
        "ALTER TABLE posts ADD COLUMN overlay_tone text NULL "
        "CONSTRAINT posts_overlay_tone_check CHECK (overlay_tone IS NULL OR overlay_tone IN ('light','dark','auto'))"
    )
    op.execute(
        "ALTER TABLE posts ADD COLUMN image_fit text NULL "
        "CONSTRAINT posts_image_fit_check CHECK "
        "(image_fit IS NULL OR (image_kind = 'cover' AND image_fit IN ('contain','blur','cover')))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE posts DROP COLUMN image_fit")
    op.execute("ALTER TABLE posts DROP COLUMN overlay_tone")
    op.execute("ALTER TABLE posts DROP COLUMN overlay_pos")
