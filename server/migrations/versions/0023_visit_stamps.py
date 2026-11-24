"""VISIT-4-P1: 방문 스탬프("다녀왔어요")·스탬프 북마크 — local-feed 계약 VISIT-4 C5 그대로.

사용자×도서관×서울 날짜 하나(V4-5). RLS 켬·정책 0개(서버 연결만 쓴다).
"""

from alembic import op

revision = "0023_visit_stamps"
down_revision = "0022_club_restriction_review"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
CREATE TABLE visit_stamps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id),
  library_id  bigint      NOT NULL REFERENCES libraries(id),
  stamped_on  date        NOT NULL,
  visibility  text        NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_stamps_user_library_day_key UNIQUE (user_id, library_id, stamped_on)
);
CREATE INDEX ix_visit_stamps_library_public
  ON visit_stamps (library_id, created_at DESC, id DESC) WHERE visibility = 'public';
ALTER TABLE visit_stamps ENABLE ROW LEVEL SECURITY;

CREATE TABLE stamp_bookmarks (
  user_id   uuid        NOT NULL REFERENCES users(id),
  stamp_id  uuid        NOT NULL REFERENCES visit_stamps(id) ON DELETE CASCADE,
  saved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stamp_id)
);
CREATE INDEX ix_stamp_bookmarks_user_saved
  ON stamp_bookmarks (user_id, saved_at DESC, stamp_id DESC);
ALTER TABLE stamp_bookmarks ENABLE ROW LEVEL SECURITY;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS stamp_bookmarks; DROP TABLE IF EXISTS visit_stamps;")
