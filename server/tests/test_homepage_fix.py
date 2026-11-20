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
    ("-", None),
    ("www.dscf.or.kr", "https://www.dscf.or.kr"),
    ("lib.yongin.go.kr/dongcheon", "https://lib.yongin.go.kr/dongcheon"),
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


def test_sync_moves_gunwi_library_to_its_own_region(db_engine):
    """정보나루가 달성군(22510)으로 준 군위 도서관은 군위군(22520)으로 저장된다(이미 저장된 행도)."""
    now = datetime(2000, 1, 2, 0, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    gunwi = LibraryInfo("gw-fix", "군위 도서관", address="대구광역시 군위군 군위읍 군청로 175", latitude=36, longitude=128)
    dalseong = LibraryInfo("ds-fix", "달성 도서관", address="대구광역시 달성군 화원읍 1", latitude=35, longitude=128)
    fake = FakeLibraryProvider([([gunwi, dalseong], 2)])
    engine = ProviderEngine(db_engine, Providers(library_data=fake), now_fn=lambda: now)
    sql = text("SELECT provider_lib_code, dtl_region_code, region_code FROM libraries WHERE provider_lib_code IN ('gw-fix','ds-fix') ORDER BY 1")
    try:
        asyncio.run(engine.sync_libraries(["22510"]))
        with db_engine.connect() as conn:
            assert [tuple(r) for r in conn.execute(sql)] == [("ds-fix", "22510", "22"), ("gw-fix", "22520", "22")]
        # 옛 위치(22510)에 저장돼 있던 행도 다음 동기화에 고쳐진다
        with db_engine.begin() as conn:
            conn.execute(text("UPDATE libraries SET dtl_region_code='22510' WHERE provider_lib_code='gw-fix'"))
        fake.pages = [([gunwi, dalseong], 2)]
        asyncio.run(engine.sync_libraries(["22510"]))
        with db_engine.connect() as conn:
            assert [tuple(r) for r in conn.execute(sql)][1] == ("gw-fix", "22520", "22")
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM libraries WHERE provider_lib_code IN ('gw-fix','ds-fix')"))
