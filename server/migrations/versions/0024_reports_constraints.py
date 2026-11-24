"""Enforce the allowed report reasons and detail lengths."""

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "reports_reason_check", "reports", "reason IN ('spam','abuse','privacy','other')",
    )
    op.create_check_constraint(
        "reports_text_len_check", "reports",
        "(reason = 'other' AND text IS NOT NULL AND char_length(btrim(text)) BETWEEN 1 AND 200) "
        "OR (reason <> 'other' AND text IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("reports_text_len_check", "reports", type_="check")
    op.drop_constraint("reports_reason_check", "reports", type_="check")
