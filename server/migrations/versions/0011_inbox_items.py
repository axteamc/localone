"""M2-0-P1: 알림함 항목(inbox_items) — core 계약 M2-0 C5.

수신자 본인만 본다(Z1). 같은 수신자·같은 안내는 UNIQUE (recipient_id, dedupe_key)로 한 번만 저장한다(Z2, 05 R19).
RLS는 켜고 정책은 두지 않는다(서버 연결만 쓴다).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

KINDS = ("club_confirmed", "club_changed", "club_canceled", "club_ended", "club_next", "moderation")


def upgrade() -> None:
    op.create_table(
        "inbox_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("target", postgresql.JSONB(), nullable=False),
        sa.Column("dedupe_key", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("kind IN (" + ",".join(f"'{k}'" for k in KINDS) + ")", name="inbox_items_kind_check"),
        sa.UniqueConstraint("recipient_id", "dedupe_key", name="inbox_once"),
    )
    op.execute("CREATE INDEX ix_inbox_recipient ON inbox_items (recipient_id, created_at DESC, id DESC);")
    op.execute("ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("inbox_items")
