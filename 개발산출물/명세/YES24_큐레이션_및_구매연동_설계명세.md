# YES24 스테디셀러·인기도서 큐레이션 및 구매 연동 — 설계·명세 초안 (M2 이후 후속)

> 작성일: 2026-11-24 · 상태: **3단계 완료 (DB·엔진·CLI·API #9/#15·서가 테마 연결 완료) — 4단계(모바일·검증·운영) 대기, Y-6 시안은 YES24 연동 완료 후 진행**
> 기준 SHA: 설계 시점 코드 `2ccc0db951dcba4e0bc354946984a8adc619cd48`, team `64b9d9e8705c2ced9aa54a33fa98f4beeeb811a7` / **1단계 확정 시점 코드 `17dbd07`+개정(main `9f05e20` 기반, head `0025_reports_constraints`), team 계약 발행 SHA `cb25a44e9eab502b3a7646c7e2c732390b86eef4`(로컬 커밋, push 대기)**
> 실측 근거·계약 개정안: [YES24_1단계_실측_및_계약개정안.md](YES24_1단계_실측_및_계약개정안.md) · 변경 이력: [스펙_변경_이력.md](../스펙_변경_이력.md) C-81
> 근거 문서: [진행_YES24_큐레이션_연동.md](../진행_YES24_큐레이션_연동.md), [03_데이터_조사_정의서.md](../03_데이터_조사_정의서.md) §2 D5, [모호점_해소_기록.md](../모호점_해소_기록.md) Q-40·Q-41, [M2-0_서가테마_계약개정_초안.md](M2-0_서가테마_계약개정_초안.md)

---

## 0. Pre-flight 5대 관문

| 관문 | 현재 코드·계약 근거 (`file:line`) | 본 설계 적용 및 판정 |
| --- | --- | --- |
| ① 격리·권한·호환 | `server/app/routers/books.py:87-103,185-193` (`#9` 추천, `#15` 구매 링크 — 비인증 공개 읽기), `server/app/routers/libraries.py:194-210` (`#31` 책장 공개 읽기), `server/app/routers/ops.py:493-544` (`get_operator` 기반 운영 테마 등록, 실패 `404`), `server/app/common.py` (공통 에러 envelope `{"error": {"code", "message", "detail"}}`), `server/migrations/versions/0002_public_reference.py:10,212-213` (공공 참조 5개 테이블 RLS 활성화·정책 0개) | 신규 테이블(`curated_books_cache`)은 개인 식별자 없는 공공·외부 참조 캐시이며 RLS 활성화(`relrowsecurity=true`)·정책 0개를 적용한다. `#9`·`#15`·`#31` 기존 응답 키와 에러 포맷(`detail`은 쉼표 구분 필드명 문자열)을 보존한다. |
| ② 동시성·트랜잭션·외부 I/O | `server/app/services/provider_engine.py:100-117` (`reserve_provider_call` 일일 한도 원자 증가), `server/app/services/provider_engine.py:462` (`_guarded_call` 예약 후 외부 I/O), `server/app/services/provider_engine.py:548-608` (`popular_books` 트랜잭션 밖 외부 호출 후 별도 DB 저장), `server/app/services/theme_holdings.py:49-73` (`replace_holdings` 원자 교체) | YES24 호출은 반드시 DB 트랜잭션 밖에서 `_guarded_call("yes24", policy.YES24_DAILY_LIMIT, ...)`로 예약 커밋 후 수행한다. 수집 완료 후 별도 단일 트랜잭션에서 `books` upsert + `curated_books_cache` 원자 교체를 수행한다. 개인 리소스 쓰기가 없어 `lock_active_user`·`COALESCE` 부분 upsert·로그아웃 정화는 해당 없음. |
| ③ 참조 심볼·설정·토큰 실재성 | `server/migrations/versions/0002_public_reference.py:51-84,135-210` (`books`, `popular_books_cache`, `provider_daily_usage` — `provider IN ('data4library', 'naver', 'yes24', 'kakao')` 이미 등록됨), `server/migrations/versions/0007_books_source_kakao.py:14-18` (`books_source_check` 현재 `'kakao'`, `'naver'`, `'data4library'`, `'manual'`), `server/app/policy.py:9-10,25-30,50` (`DATA4LIBRARY_DAILY_LIMIT`, `POPULAR_SIZE`, `YES24_SEARCH_URL_TEMPLATE`), `server/app/settings.py:18-40` (`Settings`), `server/app/services/looks.py:87-143` (`shelf_book`, `theme_page`), `mobile/src/lib/publicApi.ts:4-8,22-25,40` (`Book`, `RecommendationResponse`, `PurchaseLink`), `mobile/src/features/book-search/BookDetailScreen.tsx` (도서 상세 화면 — 현재 YES24 링크 버튼 미배치) | `provider_daily_usage`는 `'yes24'`가 이미 허용되어 스키마 변경 불필요. `books_source_check`만 `'yes24'` 추가 필요. `Settings`에 `yes24_api_key`·`yes24_api_base_url` 추가(서버 전용). `mobile/src/lib/publicApi.ts`의 `Book.source`와 `PurchaseLink.kind` 확장 및 `BookDetailScreen.tsx` 배치 개편·YES24 연결 버튼 추가 필요(1단계 시안 검토 대상). 디자인 토큰·기기 저장소 키 변경 없음. |
| ④ 담당 파일·다른 작업 충돌 | `../team/기능_배정.md:13-16` (현재 진행 중인 M2: `LOCAL-3`·`LOCAL-4`는 B `local-feed`, `MY-3`은 D `my-collection`), `server/migrations/versions/0025_reports_constraints.py` (**2026-11-24 main `9f05e20` 단일 head `0025_reports_constraints`**, 설계 시점 `0020`에서 전진), `개발산출물/진행_서가테마_소장필터링.md` | **착수 시점을 `LOCAL-3`, `LOCAL-4`, `MY-3` 완료 이후로 고정**하여 현재 M2 구현·발표(11/26)와 파일·마이그레이션 번호 충돌을 원천 차단한다. 새 리비전은 `0026_yes24_curated`(`down_revision = "0025_reports_constraints"`)로 확정하되, 2단계 착수 시 `alembic heads` 단일 head를 다시 확인하고 달라졌으면 번호만 조정한다. |
| ⑤ 승인·변경 경계 | `02_요구사항_정의서.md` LIB-01·VISIT-04·LOCAL-04, `03_데이터_조사_정의서.md` D5, `05_ERD_및_DB설계서.md`, `06_기능_API_정의서.md` `#9`·`#15`·`#31`, `../team/contracts/core.md` LIB-0·M2-0 | 본 문서는 **설계·명세 초안**이며 소스·DB·팀 계약 수정은 착수 시 D 승인 및 약관·키 실측 완료 후 진행한다. |

---

## 1. 배경, 목표 및 데이터 출처 역할 분담

### 1.1 문제 배경
- 현재 전국·도서관별 인기 도서([provider_engine.py:348-367](file:///c:/seokhunchoi_Ax_Fullstack/libproject/server/app/services/provider_engine.py#L348-L367))는 도서관 정보나루(`loanItemSrch` / `loanItemSrchByLib`) 단일 출처만 사용한다.
- 공공도서관 대출 순위는 아동 전집·학습만화·수험서 비중이 높아, 2040 성인 독서 커뮤니티("동네한권") 이용자가 기대하는 최신 독서 트렌드 및 구매 검증 도서와 어긋나는 경향이 크다.
- YES24 Open API(Category API `bestsellerSteady` 등) 응답에 **`isbn13`·서지·표지·상품 직링크(`link`)**가 모두 포함됨을 실측 확인했다.

### 1.2 출처별 역할 분담 원칙

| 노출 영역 | 데이터 출처 | 역할 및 이유 |
| --- | --- | --- |
| **홈 하단 창(VISIT-1b) · 검색 진입(`#9`)** | **YES24 스테디셀러 / 종합 베스트셀러** (1순위, 캐시) → 장애/미설정 시 정보나루 전국 인기 폴백 | 실제 구매로 검증된 성인 독서 트렌드 제공. 스테디셀러는 동네 도서관 소장 확률도 높아 "발견 → 대출" 여정과 궁합이 높음. |
| **방문 페이지 책장(`#31`) — `theme` 페이지** | **YES24 스테디셀러·베스트셀러 후보 → `shelf_themes` + `theme_holdings` 소장 필터링** | "요즘 서점 스테디셀러 중, 이 도서관에 실제 소장된 책" 큐레이션. 서점 인기 도서가 도서관에 없어 발생하는 이탈을 구조적으로 해결. |
| **방문 페이지 책장(`#31`) — `popular` 페이지** | **도서관 정보나루 도서관별 인기대출** (현행 유지 + 만화/시리즈 제외) | "이 도서관에서 이웃들이 실제로 빌려 읽은 책"이라는 지역 고유성 유지. |
| **도서/게시물 상세 구매 버튼(`#15`)** | **YES24 상품 직링크(`link` / Goods API)** → 미보유 시 기존 검색 URL(`search`) 폴백 | Q-40·Q-41 해소. 단순 검색 페이지 대신 해당 도서 상품 상세 페이지로 바로 연결. |

> **불변 조건 유지:** 서점 인기도서·스테디셀러는 **대출 가능 표시가 아니다.** 도서관 소장·대출 가능 여부는 반드시 기존 정보나루 조회 엔진(`availability` / `theme_holdings`)으로만 판정하며, 화면에 출처(예: `"출처: YES24"` / `"데이터 제공: YES24"`)를 명확히 표기한다.

### 1.3 YES24 이용 약관·데이터 정책 준수 기준 (2026-11-24 확인 반영)

| 항목 | YES24 공식 정책 | 본 서비스 적용 규칙 |
| --- | --- | --- |
| **이용 범위** | **상업적 목적까지 사전 승인 없이 허용** (광고, 인앱 결제, 유료 구독 서비스 포함). | 별도 제휴 심사 없이 프로덕션 적용 가능. 단, 아래 3대 의무 필수 준수. |
| **의무 ① 출처 표기** | 도서 정보가 노출되는 화면에 예스24 출처 표기. | **화면(섹션) 단위 일괄 표기** 적용(개별 도서 카드 반복 표기 지양). 예: 홈 하단 창·검색 진입 추천 섹션 서브타이틀 우측 또는 가로 스크롤 영역 모서리에 `출처: YES24` 또는 `데이터 제공: YES24`를 1회 명시. |
| **의무 ② 상세 연결** | 도서 상세 정보 또는 구매 관련 영역에서 예스24 상품 상세페이지로 연결. | **도서 상세(`BookDetailScreen.tsx`)에 YES24 상품 상세 링크 추가 필수**(현재 미구현). 책 소개의 상세 링크와 도서관 미소장 결과의 구매 링크 위치는 §5.5 개정 시안을 따른다. |
| **의무 ③ 재배포·축적 금지** | 서비스 제공에 필요한 범위 내 **캐싱 허용**. 전체 도서 정보 수집·자체 DB 영구 축적 및 제3자 재배포·재판매 금지. 가격·재고 등 변동 정보는 짧은 갱신 주기 권장. | ① 전체 카테고리 순회/대량 수집 금지(지정 카테고리 상위 20권 등 서비스 노출 범위 한정). ② `curated_books_cache`(일 1회 교체)·`book_purchase_links`(TTL 14일 갱신) 캐시 용도로만 운영. ③ `shopPrice`·`salePrice`·재고 등 변동 필드는 아예 저장하지 않음. ④ 제3자 재배포용 외부 export API 미제공. |
| **응답·페이지네이션** | 공통 응답 `{ success, message, data, errorCode }`. 목록형 API는 `page`(기본 1), `pageSize`(최대 100) 사용. | 파서는 공통 envelope 선검증 후 `data` 처리. 요청 `pageSize`는 1~100 범위로 제한. |
| **표지 이미지 주의** | `cover`(앞표지), `sideCover`(책등), `backCover`(뒷표지) 제공. 단, **책등·뒷표지는 미등록 상품도 URL이 반환되며 대체 이미지가 표시되고 응답만으로 등록 여부 구분 불가.** Excel 다운로드(`/export`)에는 이미지 URL 미포함. | 1차 연동에서는 **`cover`(앞표지)만 사용**하고 `sideCover`·`backCover`는 미사용(대체 이미지 대량 노출 방지). 시연 전 EXCEL 다운로드 활용 시에는 ISBN만 추출해 `ops/shelf-themes`로 등록하면 기존 카카오 서지 조회로 표지를 자동 확보. |

---

## 2. YES24 Open API 응답 스펙 및 매핑 규칙

기준 엔드포인트(사용자 확인 실측 JSON):
- 스테디셀러 조회: `GET https://apis.yes24.com/v1/category/bestsellerSteady?categoryId={categoryId}&page={page}&pageSize={pageSize}` (`page` 기본 1, `pageSize` 1~100)
- (확장 후보) 종합 베스트셀러 조회: `GET https://apis.yes24.com/v1/category/bestseller?categoryId={categoryId}&page={page}&pageSize={pageSize}`
- (확장 후보) 카테고리 목록 조회 / Goods API(단건 ISBN 조회): 키 발급 후 정확한 경로·파라미터 실측(§6 참조).

### 2.1 응답 최상위·메타 필드 매핑 (전수)

| JSON 경로 | 타입 | 필수 | null 허용 | 처리 및 검증 규칙 |
| --- | --- | :---: | :---: | --- |
| `success` | boolean | 예 | 아니오 | `true`가 아니면 `ProviderError` 발생(부분/오류 응답 저장 금지). |
| `message` | string | 예 | 예 | 내부 오류 로그 요약용(응답 원문·키 전체는 로그 금지). |
| `errorCode` | string | 예 | 예 | `null`이 아니면 오류 코드로 기록. |
| `data` | object | 예 | 예 | `success=true`일 때 object 필수. 누락 시 `ProviderError`. |
| `data.meta.apiTitle` | string | 예 | 예 | 로그/디버그 참고용(UI 라벨은 서버 정책 상수 사용). |
| `data.meta.apiLink` | string | 예 | 예 | 미사용(저장 안 함). |
| `data.meta.logoUrl` | string | 예 | 예 | 약관상 로고 표기 의무 확인 후 정적 에셋 또는 정책 상수화(§6). |
| `data.meta.pubDate` | ISO-8601 datetime | 예 | 예 | 파싱 가능 시 기준 시각(`source_published_at`)으로 기록. |
| `data.meta.query` | string | 예 | 예 | 미사용. |
| `data.meta.version` | string | 예 | 예 | 미사용. |
| `data.items` | array (**실측: 목록·단건 모두 `data.items`, 단건도 길이 1 배열**; 오류 응답은 `data:null`) | 예 | 아니오 | `list` 아니면 `ProviderError`. 빈 배열이면 `no_data` 처리(기존 유효 캐시 덮어쓰기 금지). |
| `data.currentPage` | integer | 예 | 아니오 | 페이지네이션 검증용(1 이상). |
| `data.pageSize` | integer | 예 | 아니오 | 요청 크기 검증용(1 이상). |
| `data.totalCount` | integer | 예 | 아니오 | 0 이상 정수. |

### 2.2 `data.items[]` 도서 항목 필드 매핑 (전수)

| JSON 키 | 타입 | 필수 | null 허용 | 우리 DB 매핑 및 필터/정제 규칙 |
| --- | --- | :---: | :---: | --- |
| `sortOrder` | integer | 예 | 아니오 | 필터 통과 후 1부터 재부여하는 `rank`의 정렬 기준(오름차순). |
| `itemId` | integer | 예 | 아니오 | 양의 정수. `book_purchase_links.external_item_id` 저장(구매 링크 식별자, 문자열 변환). |
| `title` | string | 예 | 아니오 | `_clean_book_text` 적용 후 공백이면 해당 항목 스킵. `books.title`. |
| `author` | string | 아니오 | 예 | `_clean_book_text` 적용. `books.author`. |
| `goodsType` | string | 아니오 | 예 | **실측값 `"도서"`·`"만화"`(국내도서 카테고리), 단건 조회에서 `"직수입양서"`·`"교육용CD"` 등도 관측.** 큐레이션은 `"도서"`만, 구매 링크는 `{"도서","만화"}`만 허용(§4.2). 그 외는 제외/검색 폴백. |
| `goodsSortNm` | string | 아니오 | 예 | 보조 분류 확인용(미저장). |
| `adultYn` | string (`"Y"`/`"N"`) | 예 | 아니오 | **`"Y"`인 항목은 무조건 제외** (전 연령 공개 홈·검색·책장 노출 안전 가드). |
| `publisher` | string | 아니오 | 예 | `_clean_book_text` 적용. `books.publisher`. |
| `isbn10` | string | 아니오 | 예 | `isbn13` 누락 시에만 기존 `normalize_isbn`으로 13자리 변환 보조. |
| `isbn13` | string | 아니오 | 예 | `normalize_isbn` 통과(13자리 숫자) 필수. 무효·누락 시 해당 항목 스킵. `books.isbn13`. |
| `shopPrice` | integer | 아니오 | 예 | 미저장(가격 변동성·약관 부담 방지). |
| `salePrice` | integer | 아니오 | 예 | 미저장. |
| `publishDate` | string (**실측 `YYYYMMDD` 8자리**, 예 `"20020131"`) | 아니오 | 예 | 앞 4자리 정수 추출(1000~2999 범위) → `books.pub_year`. 8자리 미만·파싱 불가 시 `None`. |
| `itemStatus` | string | 아니오 | 예 | 실측값 `판매중`·`예약판매`·`일시품절`·`품절`·`절판`. 큐레이션은 상태 무관 허용(도서관 대출 대상). 구매 직링크 `kind="product"`는 `{"판매중","예약판매"}`만, 그 외는 검색 폴백(§5.2). |
| `cover` | string (URL) | 아니오 | 예 | `https://` 스킴 검증 후 `books.cover_url` 저장(이미지 파일 복사·재배포 금지, URL 문자열만 보관). |
| `sideCover` | string (URL) | 아니오 | 예 | 미저장. |
| `backCover` | string (URL) | 아니오 | 예 | 미저장. |
| `link` | string (URL) | 아니오 | 예 | `https://www.yes24.com/` 접두사 검증 후 `book_purchase_links.product_url` 저장. |
| `addOnLink` | string | 아니오 | 예 | 미저장. |
| `upDown` | string/integer | 아니오 | 예 | 미저장. |
| `contentDetail.bookIntroduction` | string | 아니오 | 예 | `_clean_book_text` 후 `BOOK_DESCRIPTION_MAX_CHARS`(2,000자)로 절단 → `books.description`. |
| `contentDetail.bookSummary` | string | 아니오 | 예 | `bookIntroduction`이 비었을 때만 fallback으로 사용(2,000자 절단). |
| `contentDetail.tableOfContents` | string | 아니오 | 예 | 미저장. |

---

## 3. DB 스키마 및 마이그레이션 설계 (초안)

> 리비전: **`0026_yes24_curated`**, `down_revision = "0025_reports_constraints"` (2026-11-24 main 단일 head 확인). 2단계 착수 시 head가 바뀌었으면 번호만 재조정한다.

### 3.1 기존 테이블 변경

1. **`books` 테이블 (`books_source_check` 제약 확장)**
   - 기존(`0007_books_source_kakao.py:17`): `source IN ('kakao', 'naver', 'data4library', 'manual')`
   - 변경: `source IN ('kakao', 'naver', 'data4library', 'yes24', 'manual')`
   - Downgrade 가드: `'yes24'` 행이 있으면 `'data4library'`로 변환 후 기존 제약 복원(데이터 손실 없음, `0007`과 동일 패턴).
   - **기존 서지 보존 원칙:** `books` upsert 시 이미 `'kakao'`나 `'naver'`로 채워진 `title`/`author`/`cover_url`/`description`이 있으면 덮어쓰지 않고 빈 컬럼(`COALESCE`)만 보충한다.

2. **`provider_daily_usage` 테이블 (변경 없음)**
   - `0002_public_reference.py:203`에 이미 `provider IN ('data4library', 'naver', 'yes24', 'kakao')`가 등록되어 있어 마이그레이션 불필요.

### 3.2 신규 테이블 2개 (기존 `popular_books_cache` 무영향 분리 설계)

기존 `popular_books_cache`는 도서관 정보나루의 `scope IN ('national', 'library')` 및 `uq_popular_books_national_rank` 부분 유니크 인덱스에 강하게 결합되어 있다. YES24 큐레이션을 별도 테이블로 분리하면 기존 `#9`·`#31` 도서관 인기 도서 로직과의 회귀·충돌이 0이 된다.

#### (1) `curated_books_cache` — 외부 서점 큐레이션(스테디셀러·베스트셀러) 캐시

| 컬럼 | 타입 | NULL | 기본값 | 키·제약·의미 |
| --- | --- | :---: | --- | --- |
| `id` | `bigint` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | PK |
| `provider` | `text` | NOT NULL | — | `CHECK (provider IN ('yes24'))` |
| `list_kind` | `text` | NOT NULL | — | `CHECK (list_kind IN ('steady', 'bestseller', 'new_notable'))` |
| `category_id` | `text` | NOT NULL | — | 예: `'001'` (국내도서). 공백 금지 `CHECK (char_length(trim(category_id)) BETWEEN 1 AND 32)` |
| `rank` | `smallint` | NOT NULL | — | `CHECK (rank BETWEEN 1 AND 100)` |
| `book_id` | `bigint` | NOT NULL | — | `REFERENCES books(id)` |
| `basis_label` | `text` | NOT NULL | — | 화면 표기 기준 문구 (예: `"YES24 스테디셀러 · 국내도서"`) |
| `source_published_at` | `timestamptz` | NULL | — | 응답 `data.meta.pubDate` |
| `fetched_at` | `timestamptz` | NOT NULL | `now()` | 수집 시각 (KST 날짜 기준 일 1회 신선도 판정) |

- **유니크 인덱스 2개:**
  - `uq_curated_books_slot`: `UNIQUE (provider, list_kind, category_id, rank)`
  - `uq_curated_books_book`: `UNIQUE (provider, list_kind, category_id, book_id)` (같은 목록 내 중복 도서 방지)
- **RLS:** `ALTER TABLE curated_books_cache ENABLE ROW LEVEL SECURITY` (정책 0개, `H-ARCH-01`).

#### (2) `book_purchase_links` — 도서별 구매 직링크 캐시 (`#15` 고도화)

| 컬럼 | 타입 | NULL | 기본값 | 키·제약·의미 |
| --- | --- | :---: | --- | --- |
| `book_id` | `bigint` | NOT NULL | — | `REFERENCES books(id)`, 복합 PK 첫 열 |
| `provider` | `text` | NOT NULL | — | `CHECK (provider IN ('yes24'))`, 복합 PK 둘째 열 |
| `external_item_id` | `text` | NOT NULL | — | YES24 `itemId` 문자열 |
| `product_url` | `text` | NOT NULL | — | `CHECK (product_url ~ '^https://www\.yes24\.com/')` |
| `item_status` | `text` | NULL | — | `"판매중"` 등 |
| `fetched_at` | `timestamptz` | NOT NULL | `now()` | 직링크 갱신 시각 |

- **PK:** `(book_id, provider)`
- **RLS:** `ALTER TABLE book_purchase_links ENABLE ROW LEVEL SECURITY` (정책 0개).

---

## 4. 서버 엔진·정책·설정 및 비동기/트랜잭션 흐름

### 4.1 환경 변수 (`server/app/settings.py`)
- `yes24_api_key: str = ""` (서버 전용, 브라우저/모바일 번들·로그 출력 절대 금지)
- `yes24_api_base_url: str = "https://apis.yes24.com/v1"`
- 키가 비어 있으면 서버 기동을 막지 않고, YES24 조회 시 `fallback_reason = "not_configured"`로 안전하게 정보나루 폴백 또는 기존 검색 URL을 반환한다.

### 4.2 정책 수치 (`server/app/policy.py`)

| 상수명 | 제안 값 | 근거 |
| --- | --- | --- |
| `YES24_DAILY_LIMIT` | `14_000` | 실측 헤더 `x-ratelimit-limit-day: 20000`의 70%(정보나루 70% 규칙과 동일). 초당 `x-ratelimit-limit-second: 10` → 연속 호출 간 `YES24_MIN_INTERVAL_SECONDS` 대기 |
| `YES24_MIN_INTERVAL_SECONDS` | `0.2` | 초당 10회 한도 대비 보수적 간격 |
| `YES24_CURATED_SIZE` | `20` | `RECOMMENDATION_MAX_BOOKS`(20)과 동일(필터 통과 후 최종 개수) |
| `YES24_CURATED_FETCH_SIZE` | `100` | 필터 후에도 20권을 채우기 위해 1회 호출로 상위 100권 조회(`pageSize` 최대 100 실측) |
| `YES24_CURATED_EXCLUDED_SORT_TOKENS` | `("어린이","유아","참고서","수험서","대학교재","국어 외국어 사전","전집","잡지","만화/라이트노벨")` | `goodsSortNm`에 부분 문자열로 포함되면 제외(예 `국내도서-IT 모바일-컴퓨터수험서`). 성인 독서 큐레이션 취지 |
| `YES24_PURCHASABLE_STATUSES` | `frozenset({"판매중","예약판매"})` | `kind="product"` 허용 상태 |
| `YES24_AUTH_HEADER` | `"X-Api-Key"` | 실측 확정(쿼리 파라미터 키 방식 불가) |
| `YES24_PURCHASE_ALLOWED_GOODS_TYPES` | `frozenset({"도서","만화"})` | 구매 직링크는 도서·만화만. `직수입양서`·`교육용CD` 등은 검색 폴백 |
| `YES24_DEFAULT_CATEGORY_ID` | `"001"` | 국내도서 기본값 (실측 후 성인 독서 카테고리 목록으로 조정 가능) |
| `YES24_CURATED_ALLOWED_GOODS_TYPES` | `frozenset({"도서"})` | 비도서·만화 혼입 차단(**실측값 `"도서"`**, 초안의 `"국내도서"`는 오류) |
| `YES24_PRODUCT_URL_PREFIX` | `"https://www.yes24.com/"` | 오픈 리다이렉트·비공식 URL 저장 차단 |
| `YES24_PURCHASE_LINK_TTL` | `timedelta(days=14)` | Goods API 직링크 캐시 만료 기간 |

### 4.3 핵심 비동기·동시성·트랜잭션 흐름 의사코드

```python
async def curated_books(
    self,
    list_kind: Literal["steady", "bestseller"] = "steady",
    category_id: str = policy.YES24_DEFAULT_CATEGORY_ID,
) -> CuratedResult | None:
    now = self.now_fn()
    # 1. 짧은 읽기 트랜잭션: 오늘(KST) 수집된 신선한 캐시가 있으면 외부 I/O 없이 즉시 반환
    cached = await self._db(
        lambda c: _read_curated(c, "yes24", list_kind, category_id)
    )
    if cached is not None and today_kst(cached.fetched_at) == today_kst(now):
        return cached

    # 2. 키 미설정 시 외부 호출 없이 stale 캐시 또는 None 반환(상위에서 정보나루 폴백)
    provider = self.providers.yes24
    if provider is None:
        return _mark_stale(cached, "not_configured") if cached else None

    # 3. DB 트랜잭션 밖에서 일일 한도 원자 예약 + 외부 HTTP 호출 (timeout=5s, max_bytes=2MB)
    try:
        page = await self._guarded_call(
            "yes24",
            policy.YES24_DAILY_LIMIT,
            lambda: provider.curated_list(list_kind, category_id, page=1, size=policy.YES24_CURATED_FETCH_SIZE),
        )
    except ProviderLimitReached:
        return _mark_stale(cached, "limit") if cached else None
    except ProviderError:
        return _mark_stale(cached, "provider_error") if cached else None

    # 4. 필터·정제 (adultYn != 'Y', isbn13 유효, goodsType 허용, 중복 ISBN 제거)
    filtered = _filter_yes24_items(page.items, limit=policy.YES24_CURATED_SIZE)
    if not filtered:
        return _mark_stale(cached, "no_data") if cached else None

    # 5. 단일 쓰기 트랜잭션: advisory xact lock으로 동시 갱신 직렬화 후 원자 교체
    fetched_at = self.now_fn()
    def _write_tx(conn: Connection) -> CuratedResult:
        conn.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
            {"k": f"curated:yes24:{list_kind}:{category_id}"},
        )
        # 5a. books upsert (기존 kakao/naver 서지는 COALESCE로 보존)
        book_ids = _upsert_books_preserving_existing(conn, filtered, fetched_at)
        # 5b. book_purchase_links upsert (https://www.yes24.com/ 검증 통과 항목만)
        _upsert_yes24_links(conn, book_ids, filtered, fetched_at)
        # 5c. curated_books_cache 해당 슬롯 전체 교체
        _replace_curated_cache(conn, "yes24", list_kind, category_id, book_ids, page.pub_date, fetched_at)
        return _read_curated(conn, "yes24", list_kind, category_id)

    return await self._db(_write_tx)
```

---

## 5. API 계약 변화, CLI 및 프론트엔드 호환성

### 5.1 `#9 GET /api/v1/books/recommendations` (하위 호환 유지)
- **쿼리 파라미터 확장 (선택):**
  - 기존: `library_id: int | None = None`
  - 제안 추가: `source: Literal["auto", "yes24_steady", "yes24_bestseller", "library_loan"] = "auto"`
- **동작 규칙:**
  - `library_id`가 주어진 경우: 현행과 100% 동일(해당 도서관 정보나루 인기대출 → 없으면 전국 폴백).
  - `library_id`가 없고 `source="auto"`(또는 `"yes24_steady"`): YES24 스테디셀러 캐시 반환 → 실패/미설정 시 정보나루 전국 인기대출로 안전 폴백(응답 `fallback_reason`에 사유 기록).
  - 기존 응답 키(`kind`, `scope`, `library_id`, `basis_label`, `theme`, `books`, `fetched_at`, `stale`, `fallback_reason`) 100% 유지.
  - `basis_label` 예: `"YES24 스테디셀러 · 국내도서"` (화면에서 출처 구분 가능).

### 5.2 `#15 GET /api/v1/books/{isbn13}/purchase-link` (직링크 고도화)
- **응답 DTO 확장:**
  - `isbn13`: string (필수)
  - `provider`: `"yes24"` (필수)
  - `kind`: `"product" | "search"` (기존 `"search"`에서 `"product"` 추가)
  - `url`: string (HTTPS URL, 필수)
- **동작 순서:**
  1. `book_purchase_links`에 유효한(`YES24_PURCHASE_LINK_TTL` 이내) YES24 직링크가 있으면 즉시 `kind: "product"` 반환(외부 호출 0).
  2. 없거나 만료됐고 `yes24_api_key`가 설정되어 있으면 트랜잭션 밖에서 `_guarded_call("yes24", ...)`로 `GET /v1/goods/itemDetail?searchType=ISBN13&query={isbn13}` 조회(Y-5 확정). **응답 `items[0].isbn13 == 요청 isbn13`·`goodsType ∈ YES24_PURCHASE_ALLOWED_GOODS_TYPES`·`link` 접두 `https://www.yes24.com/`·`itemStatus ∈ YES24_PURCHASABLE_STATUSES`를 모두 만족할 때만** 저장 후 `kind: "product"` 반환. 하나라도 불만족이면 저장하지 않고 3번으로 진행.
  3. 키 미설정·미검색·오류·한도 초과 시 기존 `YES24_SEARCH_URL_TEMPLATE`으로 `kind: "search"` 반환(항상 200 보장, 구매 버튼 깨짐 0).

### 5.3 CLI 확장 (`server/app/services/provider_engine.py`)
- `uv run python -m app.services.provider_engine sync-yes24-curated [--kind steady|bestseller] [--category 001]`
  - 일 1회(또는 수동) YES24 스테디셀러/베스트셀러를 수집·캐시하고 `book_purchase_links`를 함께 갱신.
  - 선택 옵션 `--print-isbns`로 검증된 ISBN 20개를 출력해 운영자가 `POST /api/v1/ops/shelf-themes`에 넣고 `sync-theme-holdings`로 도서관 소장 필터링 테마로 바로 연결할 수 있게 지원.

### 5.4 오류 응답 규격 (전수)

| 경로 | 조건 | HTTP 상태 | `error.code` | `error.detail` | DB 쓰기 효과 |
| --- | --- | :---: | --- | --- | --- |
| `#9` | 잘못된 `source` 또는 `library_id` 범위 초과 | `422` | `VALIDATION_ERROR` | `"source"` 또는 `"library_id"` | 무변경(외부 호출 0) |
| `#9` | 없는 `library_id` | `404` | `NOT_FOUND` | `""` | 무변경(외부 호출 0) |
| `#9` | YES24·정보나루 모두 실패 + 캐시 없음 (한도 도달 포함) | `429` | `PROVIDER_LIMIT` | `""` | 예약 카운터 외 무변경 |
| `#9` | YES24·정보나루 모두 실패 + 캐시 없음 (제공자 오류/미설정) | `503` | `PROVIDER_UNAVAILABLE` | `""` | 무변경 |
| `#15` | 유효하지 않은 `isbn13` | `422` | `VALIDATION_ERROR` | `"isbn13"` | 무변경(외부 호출 0) |
| `#15` | YES24 키 미설정·오류·한도 초과 | `200` | — (`kind: "search"` 폴백) | — | 무변경 |

### 5.5 프론트엔드 호환성 및 UI 변경 범위 (`mobile/`)
- **API 타입 (`mobile/src/lib/publicApi.ts`)**:
  - `Book.source`: `"kakao" | "naver" | "data4library" | "yes24" | "manual"`
  - `PurchaseLink.kind`: `"product" | "search"`
- **홈 하단 창·검색 진입 출처 표기**:
  - 개별 도서 카드에 `YES24` 배지를 반복하지 않고, **섹션 단위 1회 일괄 표기**(예: 서브타이틀 우측 또는 가로 스크롤 섹션 모서리에 `출처: YES24` 또는 `데이터 제공: YES24`)로 약관 의무를 충족한다.
- **도서 상세 페이지 (`mobile/src/features/book-search/BookDetailScreen.tsx`) 개편**: 약관 의무 ②의 상품 상세 연결과 대출 동선을 아래 개정 시안에서 검토한다.

#### Y-6 A안 개정 시안 (5단계)

- **배치·동선 확정**. 시안의 대출·반납 화면은 흐름을 시연하기 위한 예시다. 실제 반영은 기존 하단 탭 `mobile/app/(tabs)/loans.tsx`의 화면 디자인과 `LoansSection` → `LoanPlansSection` 구조를 사용한다. 빌릴 예정 구역에 일괄 검색과 일괄 빌림 표시 동작을 추가한다.
- [도서 상세 HTML 시안](../시안/Y-6_도서상세_YES24_시안.html). 최초 A안은 도서관 목록 아래에 YES24 링크를 두는 배치였다. 최신 지시에 따라 책 소개의 도서 상세 링크와 미소장 결과의 구매 링크로 나눈다.
- 본문은 큰 표지 → 제목·저자 → 책 소개(더 보기) → 도서 정보 순이다. 현재 `Book` 응답으로 제공 가능한 도서 정보는 출판사·출판 연도·ISBN이다. 주제 분류·목차·저자 소개는 첨부의 위치를 확인하기 위한 시안 데이터다.
- 하단 버튼은 `대출 예정 | 도서관 확인` 순이다. 대출 예정은 현재 책을 도서관 지정 없이 대출·반납 탭의 빌릴 예정에 담는다. 도서관 확인은 현재 책만 조회하는 창을 바로 연다. 창은 첨부 배치에 맞춰 제목·닫기, 안내·도시 전체 검색, 카드 목록, 기준일 순으로 구성한다.
- 조회 카드 본문을 누르면 한 곳이 선택된다. 선택한 카드에 테두리, 왼쪽 표시선, `선택됨`을 표시하며 같은 카드를 다시 누르면 해제한다. 오른쪽 필 버튼은 도서관 사이트를 열고 카드 선택과 별도로 동작한다.
- `실시간 ↗`은 옅은 배경과 테두리가 있는 필 버튼을 사용한다. 열기 성공 시 같은 높이와 너비로 초록색 점과 `확인 완료`를 표시한다. 두 상태의 터치 영역은 최소 44px 높이를 유지한다. 다시 누르면 같은 링크를 열고, 열기 실패 시 재시도할 수 있다. 현행 `openExternalUrl`은 외부 페이지 도달을 확인하지 않으며, 링크 열기와 대출 상태는 별개다.
- 책 소개 끝에 `YES24에서 도서 상세 보기 ↗`를 둔다. 현재 조회 범위에 소장 도서관이 없다고 확인되면 도서관 창에 `YES24에서 구매하기 ↗`를 표시한다. YES24 서지는 책 정보에 `출처: YES24`를 한 번 표시한다. `#15`의 `kind="product"`는 상품 상세, `kind="search"`는 ISBN 검색으로 연결한다.
- 우측 상단 리스트 아이콘은 숫자 없이 대출·반납 탭의 빌릴 예정으로 연결한다. 권수는 빌릴 예정 제목 옆에 표시한다. 일괄 검색은 빌릴 예정 전체를 대상으로 하며, 선택한 책이 있으면 그 책만 검색한다. 소장 확인 권수가 많은 순으로 최대 3곳을 고르고, 동률이면 가까운 곳을 우선한다. 선택된 도서관은 창 안에서 거리순으로 표시하고 각 카드에 소장 권수를 표시한다. 여러 책을 선택해 내 대출로 옮기는 빌림 표시도 시연한다.
- 후속 구현에서 도서관 없이 담는 대출 예정 계약, 여러 ISBN의 소장 조회·제공자 호출 한도, 빌렸어요 일괄 표시 시 도서관 결정과 부분 실패 처리를 검토한다. 현행 예정 등록은 도서관을 지정하는 흐름이다.

#### SNS 게시물 상세 도서 카드 (별도 제안)

- 현행 `LOCAL-2` 게시물 상세는 연결 도서 카드 전체를 누르면 도서관 사이트를 열고, 링크가 없으면 책 상세로 이동한다. 제안은 첨부처럼 책 제목·저자, 도서관명과 기준일이 있는 대출 상태, 오른쪽 보조 버튼을 한 카드에 둔다.
- 왼쪽 책 정보는 도서 상세로 연결한다. 오른쪽은 한 줄 `도서관 확인` 필 버튼을 카드 높이의 가운데에 배치하고, 같은 책을 조회하는 공용 창을 연다. 외부 사이트의 `실시간 ↗`은 공용 창에서 제공한다. 게시물의 도서관은 지역 조회 결과와 식별자가 같으면 한 번만 표시한다.
- SNS 카드의 초록색 상태 점은 조회 기준일의 대출 가능을 나타낸다. 외부 링크를 열었을 때의 `확인 완료` 상태와 재시도 동작은 공용 창에 표시한다. 게시물 상세의 동작 변경은 `LOCAL-2` 명세·계약 확인 후 진행한다.

---

## 6. 착수 전 확인(실측·약관) 및 사용자 결정 항목

| 번호 | 항목 | 확인 방법 / 선택지 | 상태 |
| :---: | --- | --- | :---: |
| Y-1 | YES24 API 키 발급 및 인증 방식(헤더 vs 쿼리 파라미터) | 실측: **HTTP 헤더 `X-Api-Key`만 허용**. 헤더 없음 `401 AUTH_001`, 잘못된 키 `401 AUTH_002`, 쿼리(`apiKey`·`api_key`·`key`) 방식은 `AUTH_001`. 일 한도 20,000·초당 10(응답 헤더 `x-ratelimit-*`) | **확정 (2026-11-24 실측)** |
| Y-2 | 이용 약관: 상업 이용, 출처 표기, 상세 연결, 캐싱 범위, 표지(`sideCover`/`backCover`) 제약 | 상업 이용 허용 + 3대 의무(섹션 단위 출처 표기, 도서 상세 연결, 재배포·영구 축적 금지) + `cover`만 사용 확정(§1.3 반영) | **확인 완료 (2026-11-24)** |
| Y-3 | 성인 독서 큐레이션용 `categoryId` 확정 | 실측: `/v1/category/list` 1,361건(3·9·12자리). **`001`(국내도서) 스테디셀러 상위 100권 조회 후 서버 필터**로 확정 — 100권 중 소설 33·인문 19·에세이 9·경제경영 7·자기계발 7, 제외 대상(사전 9·어린이 3·유아 2·수험서 2 등) 약 16권 → 잔여 ≥ 80권으로 20권 충족. 세부 카테고리(`001001046` 소설·`001001047` 에세이·`001001019` 인문 등)는 후속 테마 확장용 | **확정 (2026-11-24 실측)** |
| Y-4 | `#9` 전국 추천 UI 방식 | **A안 확정 (2026-11-24 D)**: YES24 스테디셀러 기본 교체(섹션 단위 출처 표기 `출처: YES24` / `데이터 제공: YES24`, 실패·미설정 시 정보나루 전국 인기대출 폴백). `source` 쿼리로 명시적 선택(`yes24_steady`·`yes24_bestseller`·`library_loan`)도 하위 호환 지원 | **확정 (A안, 2026-11-24 D)** |
| Y-5 | Goods API 단건 ISBN 조회 경로·응답 스펙 | 실측: **`GET /v1/goods/itemDetail?searchType=ISBN13&query={isbn13}`** (`searchType=ItemId`도 가능, `ISBN` 단독은 `400 PARAM_004`). 응답은 목록과 동일한 `data.items[]`(길이 1)·동일 필드. 미존재 ISBN은 `404 GOODS_002`. `/v1/goods/itemList?query=`는 비도서(`직수입양서`·`교육용CD`)가 다건 반환되므로 미사용. **주의: 동일 ISBN13이 서로 다른 상품에 걸린 경우(예: `9780000000002`)가 있어 응답 `isbn13` 일치·`goodsType`·`itemStatus` 검증 필수** | **확정 (2026-11-24 실측)** |
| Y-6 | 도서 상세 배치, 대출 예정 담기·단일/일괄 도서관 확인, YES24 연결 | §5.5 개정 시안 승인. 기존 대출·반납 탭 디자인 사용 | **배치·동선 확정, 구현 계약 확인 대기** |

---

## 7. 구현 시 검증·변이 대조표

| 검증 대상 | 방어 조건 (프로덕션 가드) | 실패해야 할 단언 (테스트) | 변이 실험 후보 |
| --- | --- | --- | :---: |
| 성인물 차단 | `adultYn == "Y"` 항목 필터링 | 성인 도서가 섞인 응답 저장 후 `curated_books_cache`·`books`·`#9` 응답에 미포함 | ★ 후보 1 |
| 비도서·무효 ISBN 차단 | `goodsType` 허용 목록 및 `normalize_isbn` 13자리 검증 | 음반/굿즈·무효 ISBN 항목 제외, 유효 항목만 `rank` 1..N 연속 부여 | |
| URL 오픈 리다이렉트 차단 | `link`의 `https://www.yes24.com/` 접두사 검증 | `javascript:`·타 도메인 URL은 `book_purchase_links` 미저장, `#15`는 `search` 폴백 | ★ 후보 2 |
| 트랜잭션 밖 외부 I/O + 한도 | `_guarded_call("yes24", YES24_DAILY_LIMIT, ...)` 예약 커밋 후 호출 | 한도 도달 시 외부 호출 0회, 기존 유효/stale 캐시 또는 정보나루 폴백 반환 | ★ 후보 3 |
| 빈 응답·오류 시 캐시 보호 | `success != True` 또는 빈 `items` 시 `_replace_curated_cache` 미실행 | 제공자 오류·빈 응답 시 기존 캐시 행과 순위 보존 + `stale=True` | ★ 후보 4 |
| 기존 서지 보존 | `books` upsert 시 `COALESCE`로 기존 `kakao`/`naver` 메타 유지 | 기존 카카오 책의 `description`/`cover_url`이 YES24 빈 값으로 덮어쓰이지 않음 | |
| 구매 링크 ISBN 일치(1단계 실측 추가) | Goods 응답 `items[0].isbn13 == 요청 isbn13` 및 `goodsType`·`itemStatus` 허용 검사 | 동일 ISBN을 공유하는 비도서·품절 상품(`직수입양서` 등) 응답 시 `book_purchase_links` 미저장·`#15`는 `search` 폴백 | ★ 후보 5 |
| `#9` 폴백·호환 | YES24 미설정/실패 시 정보나루 전국 인기로 자동 폴백 | 키 미설정 상태에서 `#9` 200 정상 응답, 기존 `library_id` 지정 요청 회귀 0 | |
| `#15` 직링크·폴백 | 캐시 직링크 있으면 `kind="product"`, 없으면 `kind="search"` | 직링크 보유 ISBN은 상품 URL, 미보유/오류 ISBN은 검색 URL 반환 | |
| 마이그레이션·RLS | `alembic upgrade` / `downgrade` 왕복 + `relrowsecurity=true`·정책 0개 | `curated_books_cache`·`book_purchase_links` RLS 활성·정책 0행, downgrade 시 `'yes24'` 안전 변환 | |
