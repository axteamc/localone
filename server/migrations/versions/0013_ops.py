"""M2-0-P2: 운영자(operators)·운영 기록(moderation_actions) — core 계약 M2-0 C5.

운영자 지정은 DB에 직접 INSERT한다(Z4, 2026-11-19 D 확정). 모든 운영 처리는 사유와 함께 기록한다.
RLS 켬·정책 0개.
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
CREATE TABLE operators (
  user_id    uuid        PRIMARY KEY REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moderation_actions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        NOT NULL REFERENCES users(id),
  action      text        NOT NULL CHECK (action IN ('hide','restore','dismiss','comment_delete','restrict','lift','look_assign','theme_edit')),
  target_kind text        NOT NULL,
  target_id   text        NOT NULL,
  reason      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE moderation_actions;")
    op.execute("DROP TABLE operators;")
