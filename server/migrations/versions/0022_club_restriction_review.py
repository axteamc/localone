"""Store the optional explanation submitted with a restriction review."""

from alembic import op

revision = "0022_club_restriction_review"
down_revision = "0021_club_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE participation_restrictions ADD COLUMN review_text text "
        "CONSTRAINT participation_restrictions_review_text_len CHECK "
        "(review_text IS NULL OR char_length(btrim(review_text)) BETWEEN 1 AND 500)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE participation_restrictions DROP COLUMN review_text")
