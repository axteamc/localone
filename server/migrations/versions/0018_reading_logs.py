"""READ-1-P1: 비공개 독서 기록(reading_logs) — reading-log 계약 READ-1 C5.

기록은 본인만 본다(R1-1). 도서관 없는 기록은 library_id NULL 그대로(R1-3).
loan_id ON DELETE SET NULL은 탈퇴 순서에서 loans를 먼저 지워도 부딪히지 않게 하는 확정 예외(C5).
길이 CHECK는 R1-O3(note 2000·quote 300, 빈 문자열은 앱·서버가 NULL로 바꿔 저장).
"""

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
CREATE TABLE reading_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id),
  book_id           bigint      NOT NULL REFERENCES books(id),
  library_id        bigint      NULL REFERENCES libraries(id),
  loan_id           uuid        NULL REFERENCES loans(id) ON DELETE SET NULL,
  read_on           date        NULL,
  note              text        NULL,
  quote             text        NULL,
  client_request_id uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_logs_user_client_request_key UNIQUE (user_id, client_request_id),
  CONSTRAINT reading_logs_note_len_check CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000),
  CONSTRAINT reading_logs_quote_len_check CHECK (quote IS NULL OR char_length(quote) BETWEEN 1 AND 300)
);
CREATE INDEX ix_reading_logs_user_order ON reading_logs
  (user_id, (coalesce(read_on, (created_at AT TIME ZONE 'Asia/Seoul')::date)) DESC, created_at DESC, id DESC);
CREATE INDEX ix_reading_logs_user_library ON reading_logs (user_id, library_id);
ALTER TABLE reading_logs ENABLE ROW LEVEL SECURITY;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE reading_logs")
