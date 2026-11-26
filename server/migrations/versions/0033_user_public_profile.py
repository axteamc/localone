"""남의 공개 프로필·작성자 줄(C-97, my-collection MY-4 C5).

- users.public_id uuid — 응답에 내보내는 공개용 id(`author.profile_id`). 내부 users.id는 여전히 내보내지 않는다.
- posts.origin text — 올릴 때 정한 출처 'post' / 'reading_log'. 기록을 지워 reading_log_id가 NULL이 되어도 안 바뀐다.
  기존 행은 reading_log_id가 있거나 템플릿이면 'reading_log'(M4-5).
- reports.target_kind에 'user'를 더한다(사람 신고, target_id = users.id).
"""

from alembic import op

revision = "0033_user_public_profile"
down_revision = "0032_post_overlay_style"
branch_labels = None
depends_on = None

KINDS_OLD = "('post','guestbook','club','club_comment','stamp')"
KINDS_NEW = "('post','guestbook','club','club_comment','stamp','user')"


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE users ADD CONSTRAINT users_public_id_key UNIQUE (public_id)")
    op.execute("ALTER TABLE posts ADD COLUMN origin text NOT NULL DEFAULT 'post'")
    op.execute("UPDATE posts SET origin = 'reading_log' WHERE reading_log_id IS NOT NULL OR image_kind = 'template'")
    op.execute("ALTER TABLE posts ADD CONSTRAINT posts_origin_check CHECK (origin IN ('post','reading_log'))")
    op.execute(
        "CREATE INDEX ix_posts_user_origin_published ON posts (user_id, origin, published_at DESC, id DESC) "
        "WHERE status = 'published'"
    )
    op.execute("ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check")
    op.execute(f"ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check CHECK (target_kind IN {KINDS_NEW})")


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE target_kind = 'user'")
    op.execute("ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check")
    op.execute(f"ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check CHECK (target_kind IN {KINDS_OLD})")
    op.execute("DROP INDEX ix_posts_user_origin_published")
    op.execute("ALTER TABLE posts DROP CONSTRAINT posts_origin_check")
    op.execute("ALTER TABLE posts DROP COLUMN origin")
    op.execute("ALTER TABLE users DROP CONSTRAINT users_public_id_key")
    op.execute("ALTER TABLE users DROP COLUMN public_id")
