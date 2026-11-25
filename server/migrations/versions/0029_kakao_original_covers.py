"""실기기 개선 P5(C-91): 저장된 카카오 축소 표지(120×174)를 원본 표지 주소로 바꾼다.

- books.cover_url, 표지형 게시물 posts.image_value(image_kind='cover', 만들 때 표지 주소를 복사해 둔다)
- `https://searchN.kakaocdn.net/thumb/...?fname=<daumcdn 주소>` → `https://tN.daumcdn.net/...`(원본, 약 4배)
- 새로 받는 책은 provider_engine.kakao_original_cover가 같은 변환을 한다. 변환 규칙은 이 파일에 따로 둔다(마이그레이션은 앱 코드에 기대지 않는다)
- downgrade는 하지 않는다(원본 주소도 유효한 표지 주소라 되돌릴 까닭이 없다 — 데이터는 그대로 둔다)
"""

import re
from urllib.parse import parse_qs, urlsplit, urlunsplit

import sqlalchemy as sa
from alembic import op

revision = "0029_kakao_original_covers"
down_revision = "0028_user_settings"
branch_labels = None
depends_on = None

_THUMB = re.compile(r"^search\d*\.kakaocdn\.net$")
_DAUM = re.compile(r"^t\d*\.daumcdn\.net$")


def original(url: str) -> str | None:
    parts = urlsplit(url)
    if not (parts.hostname and _THUMB.match(parts.hostname) and parts.path.startswith("/thumb/")):
        return None
    inner = urlsplit(parse_qs(parts.query).get("fname", [""])[0])
    if inner.scheme not in ("http", "https") or not (inner.hostname and _DAUM.match(inner.hostname)):
        return None
    return urlunsplit(("https", inner.netloc, inner.path, inner.query, ""))


def _rewrite(conn: sa.engine.Connection, select_sql: str, update_sql: str) -> None:
    for key, url in conn.execute(sa.text(select_sql)).all():
        new = original(url)
        if new and new != url:
            conn.execute(sa.text(update_sql), {"k": key, "u": new})


def upgrade() -> None:
    conn = op.get_bind()
    _rewrite(conn, "SELECT id, cover_url FROM books WHERE cover_url LIKE 'https://search%.kakaocdn.net/thumb/%'",
             "UPDATE books SET cover_url = :u WHERE id = :k")
    _rewrite(conn, "SELECT id, image_value FROM posts WHERE image_kind = 'cover' AND image_value LIKE 'https://search%.kakaocdn.net/thumb/%'",
             "UPDATE posts SET image_value = :u WHERE id = :k")


def downgrade() -> None:
    pass
