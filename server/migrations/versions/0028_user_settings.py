"""실기기 개선 P4(C-90): 내 설정 — 모임 안내 받기.

- user_profiles.club_notices boolean NOT NULL DEFAULT true
- 끈 사람에게는 새 모임 안내(club_*)를 알림함에 넣지 않는다(app/services/inbox.py). 이미 받은 안내는 그대로.
- downgrade는 칸을 지운다(끈 기록만 사라지고 다른 데이터는 그대로).
"""

from alembic import op

revision = "0028_user_settings"
down_revision = "0027_loan_plans_unassigned"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE user_profiles ADD COLUMN club_notices boolean NOT NULL DEFAULT true")


def downgrade() -> None:
    op.execute("ALTER TABLE user_profiles DROP COLUMN club_notices")
