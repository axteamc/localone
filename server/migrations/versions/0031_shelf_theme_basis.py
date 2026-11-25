"""오늘의 서가 테마 출처 표기(C-94): shelf_themes.basis_label.

- shelf_themes.basis_label text NULL — 책장 둘째 장 오른쪽 기준 문구(예 「YES24 스테디셀러」). 1~40자, 없으면 NULL.
- 기존 행은 NULL(출처 문구 없음)로 남는다. 운영자가 PUT /ops/shelf-themes로 채운다.
"""

from alembic import op

revision = "0031_shelf_theme_basis"
down_revision = "0030_stamp_body"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE shelf_themes ADD COLUMN basis_label text NULL "
        "CONSTRAINT shelf_themes_basis_label_len_check CHECK (basis_label IS NULL OR char_length(basis_label) BETWEEN 1 AND 40)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE shelf_themes DROP COLUMN basis_label")
