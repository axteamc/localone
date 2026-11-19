"""M2-0-P3: 도서관 룩(libraries.look)·서가 테마(shelf_themes·shelf_theme_books) — core 계약 M2-0 C5.

같은 계약 마이그레이션의 `user_settings`는 M2-0-P4가 새 마이그레이션으로 만든다(이 파일은 룩·테마 부분만).
"범위마다 동시에 하나"(Z7, Q-47 임시)는 서버 쓰기에서 검사한다. 새 표는 RLS 켬·정책 0개.
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
ALTER TABLE libraries ADD COLUMN look text NULL CHECK (look IS NULL OR look IN ('modern','warm','toffee','oxford'));
ALTER TABLE libraries ADD COLUMN look_assigned_by text NULL CHECK (look_assigned_by IS NULL OR look_assigned_by IN ('auto','operator'));
CREATE TABLE shelf_themes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id  bigint      NULL REFERENCES libraries(id),
  title       text        NOT NULL,
  starts_on   date        NOT NULL,
  ends_on     date        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelf_themes_period CHECK (ends_on >= starts_on)
);
CREATE TABLE shelf_theme_books (
  theme_id uuid     NOT NULL REFERENCES shelf_themes(id),
  book_id  bigint   NOT NULL REFERENCES books(id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  PRIMARY KEY (theme_id, position)
);
ALTER TABLE shelf_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf_theme_books ENABLE ROW LEVEL SECURITY;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE shelf_theme_books; DROP TABLE shelf_themes;")
    op.execute("ALTER TABLE libraries DROP COLUMN look_assigned_by; ALTER TABLE libraries DROP COLUMN look;")
