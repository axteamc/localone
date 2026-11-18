"""MY-1-P1: user_profiles에 한 줄 소개(bio)·프로필 사진(avatar_url) 추가 — my-collection 계약 MY-1 C5.

0003_user_profiles.py는 이미 push되었으므로 새 순번으로 ALTER TABLE만 한다(H-GIT-04).
RLS(0003의 ENABLE ROW LEVEL SECURITY, 정책 0개)는 그대로 둔다.
"""

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_profiles", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("user_profiles", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.create_check_constraint(
        "user_profiles_bio_len_check",
        "user_profiles",
        "bio IS NULL OR char_length(btrim(bio)) BETWEEN 1 AND 160",
    )
    op.create_check_constraint(
        "user_profiles_avatar_url_https_check",
        "user_profiles",
        "avatar_url IS NULL OR avatar_url LIKE 'https://%'",
    )


def downgrade() -> None:
    op.drop_constraint("user_profiles_avatar_url_https_check", "user_profiles", type_="check")
    op.drop_constraint("user_profiles_bio_len_check", "user_profiles", type_="check")
    op.drop_column("user_profiles", "avatar_url")
    op.drop_column("user_profiles", "bio")
