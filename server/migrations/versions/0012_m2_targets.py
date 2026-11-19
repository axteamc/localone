"""M2-0-P2 선행: 운영 처리 대상 B 표 — D가 먼저 만든다(2026-11-19 D 결정).

운영 경로(core M2-0-P2)가 숨김·처리하는 표가 아직 없어서, B 계약 C5의 SQL을 **그대로** 옮겨 만든다.
- `guestbook_entries` — local-feed.md VISIT-3 C5
- `clubs`·`club_participations`·`club_comments` — book-club.md CLUB-1 C5
- `reports` — local-feed.md LOCAL-4 C5
- `club_comment_requests`·`participation_restrictions` — book-club.md CLUB-2 C5 (`club_reviews`는 B CLUB-2에 남김)

열린 제약(길이·사유 코드 CHECK, CLUB-2 K2-O1~O5)은 넣지 않는다. B가 자기 마이그레이션에서 ALTER로 더한다.
모든 표 RLS 켬·정책 0개(서버 연결만 쓴다).
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

TABLES = ("participation_restrictions", "club_comment_requests", "reports", "club_comments",
          "club_participations", "clubs", "guestbook_entries")  # 지울 때 순서(FK 역순)

UPGRADE_SQL = """
CREATE TABLE guestbook_entries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id),
  library_id        bigint      NOT NULL REFERENCES libraries(id),
  body              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'published'
                    CHECK (status IN ('published','withdrawn','hidden')),
  client_request_id uuid        NOT NULL,
  published_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guestbook_user_client_request_key UNIQUE (user_id, client_request_id)
);
CREATE INDEX ix_guestbook_library_published
  ON guestbook_entries (library_id, published_at DESC, id DESC) WHERE status = 'published';

CREATE TABLE clubs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id        bigint      NOT NULL REFERENCES libraries(id),
  host_id           uuid        NOT NULL REFERENCES users(id),
  name              text        NOT NULL,
  intro             text        NULL,
  book_id           bigint      NULL REFERENCES books(id),
  place             text        NULL,
  starts_at         timestamptz NULL,
  ends_at           timestamptz NULL,
  capacity          integer     NULL CHECK (capacity IS NULL OR capacity >= 1),
  status            text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','canceled','hidden')),
  cancel_reason     text        NULL,
  previous_club_id  uuid        NULL REFERENCES clubs(id),
  client_request_id uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clubs_time_order CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT clubs_cancel_reason CHECK (status <> 'canceled' OR cancel_reason IS NOT NULL),
  CONSTRAINT clubs_host_client_request_key UNIQUE (host_id, client_request_id)
);
CREATE INDEX ix_clubs_library_created ON clubs (library_id, created_at DESC, id DESC) WHERE status <> 'hidden';

CREATE TABLE club_participations (
  club_id     uuid        NOT NULL REFERENCES clubs(id),
  user_id     uuid        NOT NULL REFERENCES users(id),
  state       text        NOT NULL CHECK (state IN ('joined','left','removed')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE club_comments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid        NOT NULL REFERENCES clubs(id),
  user_id           uuid        NOT NULL REFERENCES users(id),
  body              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted','hidden')),
  client_request_id uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_comments_user_client_request_key UNIQUE (user_id, client_request_id)
);
CREATE INDEX ix_club_comments_club ON club_comments (club_id, created_at, id) WHERE status = 'published';

CREATE TABLE reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid        NOT NULL REFERENCES users(id),
  target_kind  text        NOT NULL CHECK (target_kind IN ('post','guestbook','club','club_comment')),
  target_id    uuid        NOT NULL,
  reason       text        NOT NULL,
  text         text        NULL,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_once_per_target UNIQUE (reporter_id, target_kind, target_id)
);
CREATE INDEX ix_reports_open ON reports (created_at) WHERE status = 'open';

CREATE TABLE club_comment_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   uuid        NOT NULL REFERENCES club_comments(id),
  requester_id uuid        NOT NULL REFERENCES users(id),
  reason       text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','delete_only','delete_and_restrict','rejected')),
  decided_by   uuid        NULL REFERENCES users(id),
  decided_at   timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_comment_requests_once UNIQUE (comment_id)
);

CREATE TABLE participation_restrictions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users(id),
  reason_kind         text        NOT NULL CHECK (reason_kind IN ('comment','no_show')),
  source_id           uuid        NOT NULL,
  reason_text         text        NOT NULL,
  starts_at           timestamptz NOT NULL DEFAULT now(),
  ends_at             timestamptz NULL,
  review_requested_at timestamptz NULL,
  lifted_at           timestamptz NULL,
  lifted_by           uuid        NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_restrictions_active ON participation_restrictions (user_id) WHERE lifted_at IS NULL;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP TABLE {table};")
