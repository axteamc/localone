"""정보나루 홈페이지 주소 보정(깨진 교육청 주소·시립 인트로)과 동기화 연결."""
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from app.services.homepage_fix import fix_homepage
from app.services.provider_engine import LibraryInfo, ProviderEngine, Providers
from tests.provider_fakes import FakeLibraryProvider


@pytest.mark.parametrize("raw, fixed", [
    ("http://lib.gen.go.kr/gecs", "https://lib.jge.go.kr/gecs"),
    ("http://lib.gen.go.kr/jungang/", "https://lib.jge.go.kr/jungang"),
    ("https://gjlib.jeonnam-gwangju.go.kr", "https://gjlib.jeonnam-gwangju.go.kr/main"),
    ("https://gjlib.jeonnam-gwangju.go.kr/", "https://gjlib.jeonnam-gwangju.go.kr/main"),
    ("https://gjlib.jeonnam-gwangju.go.kr/main", "https://gjlib.jeonnam-gwangju.go.kr/main"),
    ("https://lib.donggu.kr", "https://lib.donggu.kr"),
    (None, None),
    ("", ""),
])
def test_fix_homepage(raw, fixed):
    assert fix_homepage(raw) == fixed


def test_sync_rewrites_stored_broken_homepage(db_engine):
    now = datetime(2000, 1, 2, 0, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    old = LibraryInfo("hp-fix", "교육청 도서관", homepage="http://lib.gen.go.kr/gecs", latitude=37, longitude=127)
    fake = FakeLibraryProvider([([old], 1)])
    engine = ProviderEngine(db_engine, Providers(library_data=fake), now_fn=lambda: now)
    try:
        asyncio.run(engine.sync_libraries(["11010"]))
        with db_engine.connect() as conn:
            assert conn.execute(text("SELECT homepage FROM libraries WHERE provider_lib_code='hp-fix'")).scalar_one() == "https://lib.jge.go.kr/gecs"
        # 같은 값을 다시 받아도 보정 결과가 유지된다(덮어쓰이지 않음)
        fake.pages = [([old], 1)]
        assert asyncio.run(engine.sync_libraries(["11010"])) == {"inserted": 0, "updated": 0, "unchanged": 1}
    finally:  # 다른 시험(지역 목록)에 행이 남지 않게
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM libraries WHERE provider_lib_code='hp-fix'"))
