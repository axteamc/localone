"""SRV-0-P2: M1 public display names only (core C5)."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"),
                  primary_key=True, nullable=False),
        sa.Column("nickname", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("char_length(btrim(nickname)) BETWEEN 1 AND 40",
                           name="user_profiles_nickname_len_check"),
    )
    op.execute("ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("user_profiles")
