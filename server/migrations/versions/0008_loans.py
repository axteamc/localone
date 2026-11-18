"""LOAN-1-P1: 내 대출(loans) — loan-assistant 계약 LOAN-1 C5.

연체·D-day는 저장하지 않는다(응답 때 계산, M4). 행은 지우지 않는다(탈퇴는 AUTH-3).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("book_id", sa.BigInteger(), sa.ForeignKey("books.id"), nullable=False),
        sa.Column("library_id", sa.BigInteger(), sa.ForeignKey("libraries.id"), nullable=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("loan_plans.id"), nullable=True),
        sa.Column("loaned_on", sa.Date(), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("due_on_assumed", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'on_loan'")),
        sa.Column("returned_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.UniqueConstraint("plan_id", name="uq_loans_plan_id"),
        sa.CheckConstraint("due_on >= loaned_on", name="loans_due_after_loaned_check"),
        sa.CheckConstraint("status IN ('on_loan','returned')", name="loans_status_check"),
        sa.CheckConstraint("(status = 'returned') = (returned_on IS NOT NULL)",
                           name="loans_returned_on_check"),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_loans_user_book_on_loan ON loans (user_id, book_id) "
        "WHERE status = 'on_loan'"
    )
    op.execute("CREATE INDEX ix_loans_user_status ON loans (user_id, status, due_on, id)")
    op.execute("ALTER TABLE loans ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("loans")
