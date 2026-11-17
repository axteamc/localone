"""개발·시험용 참조 도서관. 명시적 CLI로만 삽입하며 기존 행은 덮지 않는다."""
import hashlib
from sqlalchemy import text
from sqlalchemy.engine import Connection

SEED_LIBRARIES = (
    {"provider_lib_code": "111001", "name": "정독도서관", "address": "서울특별시 종로구 북촌로5길 48 (화동)",
     "tel": "02-2011-5799", "homepage": "https://jdlib.sen.go.kr", "latitude": 37.5815, "longitude": 126.9831,
     "dtl_region_code": "11010", "closed_text": "매월 첫째·셋째 수요일",
     "operating_time_text": "평일 09:00~22:00 / 주말 09:00~17:00"},
    {"provider_lib_code": "111002", "name": "종로도서관", "address": "서울특별시 종로구 사직로9길 15-14 (사직동)",
     "tel": None, "homepage": None, "latitude": 37.5762, "longitude": 126.9667,
     "dtl_region_code": "11010", "closed_text": "매주 월요일", "operating_time_text": "매일 09:00~18:00"},
    {"provider_lib_code": "111003", "name": "남산도서관", "address": "서울특별시 용산구 소월로 109",
     "tel": None, "homepage": None, "latitude": 37.5531, "longitude": 126.9817,
     "dtl_region_code": "11030", "closed_text": None, "operating_time_text": None},
)


def seed_reference_data(conn: Connection) -> dict[str, int]:
    inserted = 0
    for lib in SEED_LIBRARIES:
        row = conn.execute(text("""
            INSERT INTO libraries (provider_lib_code, name, address, tel, homepage, latitude, longitude,
                dtl_region_code, region_code, closed_text, operating_time_text, content_hash)
            VALUES (:provider_lib_code, :name, :address, :tel, :homepage, :latitude, :longitude,
                :dtl_region_code, :region_code, :closed_text, :operating_time_text, :content_hash)
            ON CONFLICT (provider_lib_code) DO NOTHING RETURNING id
        """), {**lib, "region_code": lib["dtl_region_code"][:2],
               "content_hash": hashlib.sha256(repr(lib).encode()).hexdigest()}).first()
        inserted += row is not None
    return {"libraries": inserted}
