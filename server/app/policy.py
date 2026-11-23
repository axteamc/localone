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

# ── 구매 링크(06 #15) ──
# 02 §9 "LIB-0 조회 엔진 수치": Q-41 ②(예스24 링크 생성 방식·약관)가 풀리기 전 기본 연결은 검색 주소
YES24_SEARCH_URL_TEMPLATE = "https://www.yes24.com/Product/Search?domain=BOOK&query={isbn13}"

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
