"""M2-0-P4: 내 설정(user_settings) — core 계약 M2-0 C5.

P3가 `0014`를 룩·테마만으로 머지해서 `user_settings`는 이 새 마이그레이션이 만든다(core P2 표 P4 행).
`return_stats_consent`는 반납 집계(Z9) 동의, `nearby_radius_km`은 칸만 둔다(읽고 쓰는 06 #4·#5는 별도 Step).
RLS 켬·정책 0개.
"""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
CREATE TABLE user_settings (
  user_id              uuid        PRIMARY KEY REFERENCES users(id),
  nearby_radius_km     smallint    NOT NULL DEFAULT 3 CHECK (nearby_radius_km IN (3, 5)),
  return_stats_consent boolean     NOT NULL DEFAULT false,
  consented_at         timestamptz NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE user_settings;")
