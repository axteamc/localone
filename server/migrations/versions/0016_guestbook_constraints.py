"""VISIT-3-P1: 방명록 열린 제약 — local-feed 계약 VISIT-3 C5 "열린 제약" · V3-O5.

표 `guestbook_entries`는 D가 `0012_m2_targets.py`로 먼저 만들었다(core M2-0-P2). B는 길이 CHECK만 더한다.
서버는 `strip()`한 글을 저장하므로 저장값 길이 = 검사 길이(1~140자).
"""

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE guestbook_entries ADD CONSTRAINT guestbook_body_len_check "
        "CHECK (char_length(btrim(body)) BETWEEN 1 AND 140)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE guestbook_entries DROP CONSTRAINT IF EXISTS guestbook_body_len_check")
