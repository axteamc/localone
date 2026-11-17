"""책 검색 제공자 네이버 → 카카오(2026-11-18 사용자 결정): books.source에 'kakao'를 더한다.

이미 저장된 'naver' 행은 그대로 둔다(제공자가 바뀌어도 옛 캐시는 유효).
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("books_source_check", "books", type_="check")
    op.create_check_constraint(
        "books_source_check", "books", "source IN ('kakao', 'naver', 'data4library', 'manual')"
    )


def downgrade() -> None:
    # 옛 제약에는 'kakao'가 없어서, 되돌릴 때는 같은 "외부 책 검색" 출처인 'naver'로 바꿔 둔다
    op.execute("UPDATE books SET source = 'naver' WHERE source = 'kakao'")
    op.drop_constraint("books_source_check", "books", type_="check")
    op.create_check_constraint(
        "books_source_check", "books", "source IN ('naver', 'data4library', 'manual')"
    )
