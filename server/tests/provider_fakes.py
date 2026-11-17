"""공공 테이블은 세션에 한 번 시드하고 시험마다 TRUNCATE하지 않는다."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="session")
def public_reference_data(db_engine):
    with db_engine.begin() as conn:
        # 각 시험 세션에서 같은 전용 코드만 갱신한다. 다른 테이블/실 DB는 사용하지 않는다.
        rows = [
            (101, "정독도서관", "서울특별시 종로구 북촌로5길 48 (화동)", 1 / 111.195, 0, "11010"),
            (102, "종로도서관", "서울특별시 종로구 사직로9길 15-14 (사직동)", 2 / 111.195, 0, "11010"),
            (103, "남산도서관", "서울특별시 용산구 소월로 109", 4 / 111.195, 0, "11030"),
            (104, "좌표없음", None, None, None, "11010"),
            (105, "a_b%\\", None, None, None, "11020"),
        ]
        rows += [(200 + i, f"이름도서관{i:02}", None, None, None, "99000") for i in range(25)]
        for id_, name, address, lat, lng, region in rows:
            conn.execute(text("""
                INSERT INTO libraries (id, provider_lib_code, name, address, latitude, longitude,
                    dtl_region_code, closed_text, operating_time_text, content_hash)
                OVERRIDING SYSTEM VALUE
                VALUES (:id, :code, :name, :address, :lat, :lng, :region,
                    '매주 월요일', '평일 09:00~22:00 / 주말 09:00~17:00', 'test')
                ON CONFLICT (provider_lib_code) DO UPDATE SET name=EXCLUDED.name,
                    address=EXCLUDED.address, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude
            """), dict(id=id_, code=f"test-{id_}", name=name, address=address, lat=lat, lng=lng, region=region))
    return db_engine


class FakeLibraryProvider:
    def __init__(self, pages=(), failure=None, before_call=None):
        self.pages = pages
        self.failure = failure
        self.before_call = before_call
        self.calls = []

    def libraries(self, dtl_region, page, size):
        self.calls.append((dtl_region, page, size))
        if self.before_call:
            self.before_call()
        if self.failure:
            raise self.failure
        return self.pages[page - 1]
