"""CLUB-2-P1: 모임 후기(club_reviews)와 출석 칸 — book-club 계약 CLUB-2 C5.

`club_comment_requests`·`participation_restrictions`는 D가 `0012_m2_targets.py`로 먼저 만들었다.
이 마이그레이션은 C 몫인 `club_reviews`와 열린 제약(후기 길이 K2-O7, 출석 칸 K2-O1)만 더한다.
"""

from alembic import op

revision = "0021_club_records"
down_revision = "0020_shelf_holdings"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
CREATE TABLE club_reviews (
  club_id        uuid        NOT NULL REFERENCES clubs(id),
  user_id        uuid        NOT NULL REFERENCES users(id),
  body           text        NOT NULL,
  shared_post_id uuid        NULL REFERENCES posts(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id),
  CONSTRAINT club_reviews_body_len_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);
ALTER TABLE club_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE club_participations ADD COLUMN attendance_status text NOT NULL DEFAULT 'attended'
  CHECK (attendance_status IN ('attended','no_show'));
"""

DOWNGRADE_SQL = """
ALTER TABLE club_participations DROP COLUMN attendance_status;
DROP TABLE club_reviews;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
