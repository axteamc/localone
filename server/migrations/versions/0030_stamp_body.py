"""오늘의 서가·방문 개선(C-92): 방문 스탬프에 한마디(방명록) 본문 + 게시물과 같은 신고·운영 숨김.

- visit_stamps.body text NULL — 앞뒤 공백을 뺀 1~140자(방명록 V3-O5와 같은 상한). 없으면 NULL.
- 스탬프 공개 범위(private/public) × 본문 유/무 4상태. 공개 스탬프 카드(#32 kind="stamp")에 본문이 보인다.
- visit_stamps.status text NOT NULL DEFAULT 'published' CHECK IN ('published','hidden') — 운영 숨김(LOCAL-4, 게시물과 같음).
  숨긴 스탬프는 피드·북마크·#69에서 빠진다. 본인의 #35·#36은 그대로(숨김은 풀리지 않는다).
- reports.target_kind에 'stamp'를 더한다(공개·숨기지 않은 스탬프만 신고 가능).
- downgrade는 칸을 지우고 신고 종류를 되돌린다(스탬프 신고 행은 지운다).
"""

from alembic import op

revision = "0030_stamp_body"
down_revision = "0029_kakao_original_covers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE visit_stamps ADD COLUMN body text NULL "
        "CONSTRAINT visit_stamps_body_len_check CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 140)"
    )
    op.execute(
        "ALTER TABLE visit_stamps ADD COLUMN status text NOT NULL DEFAULT 'published' "
        "CONSTRAINT visit_stamps_status_check CHECK (status IN ('published','hidden'))"
    )
    op.execute("ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check")
    op.execute(
        "ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check "
        "CHECK (target_kind IN ('post','guestbook','club','club_comment','stamp'))"
    )


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE target_kind = 'stamp'")
    op.execute("ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check")
    op.execute(
        "ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check "
        "CHECK (target_kind IN ('post','guestbook','club','club_comment'))"
    )
    op.execute("ALTER TABLE visit_stamps DROP COLUMN status")
    op.execute("ALTER TABLE visit_stamps DROP COLUMN body")
