"""LIB-3-P1: 빌릴 예정(loan_plans) — book-search 계약 LIB-3 C5."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loan_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("book_id", sa.BigInteger(), sa.ForeignKey("books.id"), nullable=False),
        sa.Column("library_id", sa.BigInteger(), sa.ForeignKey("libraries.id"), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'planned'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('planned','released','converted')", name="loan_plans_status_check"),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_loan_plans_active ON loan_plans (user_id, book_id, library_id) "
        "WHERE status = 'planned'"
    )
    op.execute(
        "CREATE INDEX ix_loan_plans_user_status ON loan_plans (user_id, status, created_at DESC, id DESC)"
    )
    op.execute("ALTER TABLE loan_plans ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("loan_plans")
