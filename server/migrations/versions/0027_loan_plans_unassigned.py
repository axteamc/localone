"""Y-6: 도서관 미지정 빌릴 예정 — book-search LIB-3b U1·U2, C-84.

- loan_plans.library_id NULL 허용(FK·소유자·RLS 그대로)
- 미지정 활성 예정 부분 UNIQUE uq_loan_plans_active_unassigned (user_id, book_id)
- downgrade는 미지정 행이 하나라도 있으면 실패한다(데이터를 바꾸거나 지우지 않는다, U1 기본값(Claude))
"""

from alembic import op

revision = "0027_loan_plans_unassigned"
down_revision = "0026_yes24_curated"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE loan_plans ALTER COLUMN library_id DROP NOT NULL")
    op.execute(
        "CREATE UNIQUE INDEX uq_loan_plans_active_unassigned ON loan_plans (user_id, book_id) "
        "WHERE status = 'planned' AND library_id IS NULL"
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM loan_plans WHERE library_id IS NULL) THEN
                RAISE EXCEPTION '도서관 미지정 빌릴 예정이 있어 0027을 되돌릴 수 없어요(LIB-3b U1)';
            END IF;
        END $$;
        """
    )
    op.execute("DROP INDEX uq_loan_plans_active_unassigned")
    op.execute("ALTER TABLE loan_plans ALTER COLUMN library_id SET NOT NULL")
