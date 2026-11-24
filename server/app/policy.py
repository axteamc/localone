"""정책 수치 한 곳(계획 §3.1-6, H-DOC-04). 각 값은 02 §9·05 §11·05 §3.1의 행과 1:1로 대응한다.

사용자 결정이 바뀌면 이 파일의 한 줄만 고친다. 행 이름은 줄 끝 주석에 적는다.
"""

from datetime import timedelta

# ── 외부 제공자 하루 호출 상한(서울 날짜 기준, provider_daily_usage) ──
DATA4LIBRARY_DAILY_LIMIT = 21_000  # 05 §3.1 `확정`: 정보나루 일 30,000의 70%
KAKAO_DAILY_LIMIT = 17_500  # 기본값(Claude): 카카오 책 검색 한도는 공식 문서에서 미확인(2026-11-18). 네이버 때 값 유지

# ── 외부 호출 ──
PROVIDER_TIMEOUT_SECONDS = 5.0  # 05 §3.1 availability_observations: "시간 초과 5초"
PROVIDER_MAX_RESPONSE_BYTES = 2_000_000  # 02 §9 "LIB-0 조회 엔진 수치": 응답 크기 상한
AVAILABILITY_MAX_CONCURRENCY = 8  # 02 §9 "LIB-0 조회 엔진 수치": 한 요청의 동시 호출 수
AVAILABILITY_MAX_CALLS_PER_REQUEST = 40  # 02 §9 "LIB-0 조회 엔진 수치": 넘는 도서관은 unknown(limit)

# ── 빌릴 예정 일괄 소장 조회(06 #70, book-search LIB-3b·core K24, C-84) ──
# 요청당 호출·동시 수는 위 40·8을 libSrchByBook 페이지와 bookExist가 함께 쓴다(Y6-4).
# libSrchByBook 페이지 크기는 SHELF_HOLDINGS_PAGE_SIZE(100) 재사용. 정보나루 매뉴얼 v20260620 39쪽은
# pageSize 상한·기본값과 소장 데이터 기준일을 적지 않는다(2026-11-24 확인) → 기준일은 전날로 보고 오늘 bookExist 우선.
BATCH_AVAILABILITY_MAX_ISBNS = 20  # 05 §11 `확정`(Y6-3): 서로 다른 ISBN 상한, 넘으면 422
BATCH_AVAILABILITY_MAX_PLAN_IDS = 50  # 05 §11 기본값(Claude): #16 limit 상한과 같음
BATCH_AVAILABILITY_TOP_LIBRARIES = 3  # 05 §11 `확정`(시안): 후보 도서관 최대 수

# ── 도서 검색(06 #7) ──
SEARCH_PAGE_SIZE = 20  # 06 §1 `확정`: 20건씩 "더 보기"
SEARCH_MAX_START = 1000  # 06 #7 start 상한(1~1000). 카카오는 page 50까지라 그 뒤 start는 빈 결과
KAKAO_MAX_PAGE = 50  # 카카오 책 검색 page 상한(공식 문서 1~50)
SEARCH_QUERY_MAX_CHARS = 100  # 02 §9 "LIB-0 조회 엔진 수치"

# ── 인기 도서·추천(06 #9) ──
POPULAR_SIZE = 20  # 05 §3.1 popular_books_cache: "최근 30일 상위 20권"
POPULAR_PERIOD_DAYS = 30  # 02 LIB-01 "최근 한 달"
POPULAR_LIBRARY_TTL = timedelta(days=3)  # 05 §3.1 `확정`: 도서관별은 열 때 받아 3일 보관
# 전국은 "하루 한 번"(05 §3.1 `확정`): 서울 날짜가 바뀌면 다시 받는다(provider_engine에서 날짜 비교)
RECOMMENDATION_MAX_BOOKS = 20  # 02 §9 "LIB-0 조회 엔진 수치": 테마 책도 같은 상한

# ── 방문 책장 (#31) ──
SHELF_BOOKS_PER_PAGE = 4
SHELF_LOCAL_THEME_MAX_BOOKS = 3
SHELF_LOCAL_THEME_MIN_HOLDINGS = 1
SHELF_COMMON_THEME_MIN_HOLDINGS = 2
SHELF_THEME_MAX_PRIORITY = 3
SHELF_HOLDINGS_LOOKAHEAD = timedelta(days=7)
SHELF_HOLDINGS_TTL = timedelta(hours=72)
SHELF_HOLDINGS_PAGE_SIZE = 100
SHELF_POPULAR_COMIC_CLASSES = frozenset({"만화", "만화책", "학습만화", "웹툰"})
SHELF_POPULAR_EXCLUDED_ISBNS: frozenset[str] = frozenset()
SHELF_POPULAR_EXCLUDED_SERIES = ("빨간내복야코", "빨간 내복 야코", "백앤아")

# ── 도서관 목록·소장 조회(06 #10·#12·#13) ──
NEARBY_RADII_KM = (3, 5)  # 02 LIB-02 `확정`(O-39)
NEARBY_DEFAULT_RADIUS_KM = 3  # 02 LIB-02 `확정`

# ── 구매 링크(06 #15) · YES24 큐레이션(C-81, K23) ──
# 기본 폴백 검색 주소(키 미설정·미검색·오류·비판매 시)
YES24_SEARCH_URL_TEMPLATE = "https://www.yes24.com/Product/Search?domain=BOOK&query={isbn13}"
YES24_DAILY_LIMIT = 14_000  # 실측 일 20,000의 70%
YES24_MIN_INTERVAL_SECONDS = 0.2  # 실측 초당 10회 한도 대비 보수적 간격
YES24_AUTH_HEADER = "X-Api-Key"  # 실측 확정(쿼리 파라미터 불가)
YES24_DEFAULT_CATEGORY_ID = "001"  # 국내도서
YES24_CURATED_SIZE = 20  # 필터 통과 후 최종 개수(RECOMMENDATION_MAX_BOOKS와 동일)
YES24_CURATED_FETCH_SIZE = 100  # 필터 손실 대비 1회 조회 크기(pageSize 최대 100 실측)
YES24_CURATED_ALLOWED_GOODS_TYPES = frozenset({"도서"})  # 비도서·만화 혼입 차단
YES24_CURATED_EXCLUDED_SORT_TOKENS = (
    "어린이",
    "유아",
    "참고서",
    "수험서",
    "대학교재",
    "국어 외국어 사전",
    "전집",
    "잡지",
    "만화/라이트노벨",
)
YES24_PURCHASE_ALLOWED_GOODS_TYPES = frozenset({"도서", "만화"})
YES24_PURCHASABLE_STATUSES = frozenset({"판매중", "예약판매"})
YES24_PRODUCT_URL_PREFIX = "https://www.yes24.com/"
YES24_PURCHASE_LINK_TTL = timedelta(days=14)

LIBRARY_SEARCH_LIMIT = 20  # 05 §11 LIB-0 조회 엔진 정책 수치
LIBRARY_QUERY_MAX_CHARS = 30  # 같은 절
BOOK_DESCRIPTION_MAX_CHARS = 2_000  # 같은 절, K21

# ── [loan-assistant-C] ──
LOAN_DEFAULT_DAYS = 14  # loan-assistant LOAN-1 M3: 반납 예정일 기본 = 대출일 + 14일(추정, 도서관 공식 기간 아님)
# ── [/loan-assistant-C] ──

# ── [m2-core-D] ──
# core M2-0 Z9: 반납 집계(library_return_stats) 쓰기. Q-49(동의 문구·철회·재식별 방지·법적 검토) 결정 전에는 끈다.
# 켜기는 이 한 줄만 바꾼다(D 결정 뒤). 꺼져 있으면 #22는 동의해도 집계를 쓰지 않는다(C6).
RETURN_STATS_WRITE_ENABLED = False
# ── [/m2-core-D] ──
