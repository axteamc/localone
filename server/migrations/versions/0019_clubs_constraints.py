"""CLUB-1-P1: 모임 글자 수 제약 — book-club 계약 CLUB-1 C5 "열린 제약"(K1-O3).

표(`clubs`·`club_participations`·`club_comments`)는 D가 `0012_m2_targets.py`로 먼저 만들었다.
이 마이그레이션은 열린 길이 CHECK만 더한다(앞뒤 공백을 뺀 글자 수).
"""

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
ALTER TABLE clubs ADD CONSTRAINT clubs_name_len_check
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 40);
ALTER TABLE clubs ADD CONSTRAINT clubs_intro_len_check
  CHECK (intro IS NULL OR char_length(intro) <= 500);
ALTER TABLE clubs ADD CONSTRAINT clubs_place_len_check
  CHECK (place IS NULL OR char_length(place) <= 100);
ALTER TABLE clubs ADD CONSTRAINT clubs_cancel_reason_len_check
  CHECK (cancel_reason IS NULL OR char_length(btrim(cancel_reason)) BETWEEN 1 AND 200);
ALTER TABLE club_comments ADD CONSTRAINT club_comments_body_len_check
  CHECK (char_length(btrim(body)) BETWEEN 1 AND 300);
"""

DOWNGRADE_SQL = """
ALTER TABLE club_comments DROP CONSTRAINT club_comments_body_len_check;
ALTER TABLE clubs DROP CONSTRAINT clubs_cancel_reason_len_check;
ALTER TABLE clubs DROP CONSTRAINT clubs_place_len_check;
ALTER TABLE clubs DROP CONSTRAINT clubs_intro_len_check;
ALTER TABLE clubs DROP CONSTRAINT clubs_name_len_check;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
