"""LOAN-2-P1: 반납 집계(library_return_stats) — loan-assistant 계약 LOAN-2 C5.

사용자와 잇는 컬럼(user_id·loan_id)을 일부러 두지 않는다(05 R15). M1에는 쓰는 코드가 없다(E4, Q-49).
"""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "library_return_stats",
        sa.Column("library_id", sa.BigInteger(), sa.ForeignKey("libraries.id"), primary_key=True),
        sa.Column("book_id", sa.BigInteger(), sa.ForeignKey("books.id"), primary_key=True),
        sa.Column("returned_on", sa.Date(), primary_key=True),
        sa.Column("return_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.CheckConstraint("return_count >= 1", name="library_return_stats_count_check"),
    )
    op.execute("ALTER TABLE library_return_stats ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("library_return_stats")
