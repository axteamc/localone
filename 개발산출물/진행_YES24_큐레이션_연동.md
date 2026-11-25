# YES24 스테디셀러·인기도서 큐레이션 및 구매 연동 진행 (M2 이후 후속)

- **상태:** **4단계·5단계(Y-6) PR #304~#306 머지 및 운영 반영·실기기 확인 완료(전제).** 계약 발행 team `2843458`·`5646974`(C-85)·`abd82a5`(C-86)·`c6dc579`(C-87), 코드 `main` `6dcb531`(#306). 운영 반영: DB `0027`, `YES24_API_KEY` Cloud Run 연결, `localone-api`·`localone-web` 배포 및 실기기 통합 확인 완료.
- **기준 SHA:**
  - 설계 시점(2026-11-24): 코드 `2ccc0db951dcba4e0bc354946984a8adc619cd48`, team `64b9d9e8705c2ced9aa54a33fa98f4beeeb811a7`
  - **1단계 계약 확정(2026-11-24, C-81):** 코드 `main` `9f05e2021fdcff11f98a5b326691b546d35c65d1`(단일 `alembic head = 0025_reports_constraints`), **team 계약 발행 SHA `cb25a44e9eab502b3a7646c7e2c732390b86eef4`**(로컬 커밋, 원격 push 대기)
- **목표:** 도서관 정보나루 인기대출의 아동·학습만화 편중을 보완하기 위해 YES24 Open API(스테디셀러·종합 베스트셀러·Goods API)를 `ProviderEngine`에 편입한다. 전국 큐레이션(`#9`·홈 하단 창)과 서가 테마 소장 필터링(`#31` + `theme_holdings`) 후보 소싱, 도서 구매 직링크(`#15`)를 연동한다.
- **착수 선행 조건 (예정 일정):** 현재 진행 중인 M2 작업 **`LOCAL-3`, `LOCAL-4`, `MY-3` 완료 이후** 착수한다(11/26 최종 발표 범위 밖 — 발표 전에는 코드 수정 없이 필요 시 YES24 개발자센터 EXCEL 다운로드 + 기존 `ops` 서가 테마 등록만 선택 활용).
- **근거 문서:**
  - 설계·명세 초안: [YES24_큐레이션_및_구매연동_설계명세.md](명세/YES24_큐레이션_및_구매연동_설계명세.md)
  - 기존 데이터 정의: [03_데이터_조사_정의서.md](03_데이터_조사_정의서.md) §2 D5, [모호점_해소_기록.md](모호점_해소_기록.md) Q-40·Q-41
  - 서가 테마 소장 필터링: [진행_서가테마_소장필터링.md](진행_서가테마_소장필터링.md), [M2-0_서가테마_계약개정_초안.md](명세/M2-0_서가테마_계약개정_초안.md)

---

## 단계

| 단계 | 선행과 작업 | 실행 명령 / 산출물 | 확인(완료) 기준 | 상태 |
| --- | --- | --- | --- | :---: |
| **0. 설계·명세화** | YES24 스테디셀러 응답 JSON(`isbn13`·`cover`·`link` 포함) 기준 Pre-flight 5대 관문, DB 스키마, 엔진 흐름, API 호환, 검증표 작성 | [YES24_큐레이션_및_구매연동_설계명세.md](명세/YES24_큐레이션_및_구매연동_설계명세.md), 본 진행 파일 | Pre-flight 5대 관문 `file:line` 증거 기록, 전 필드·오류·검증표 작성 완료 | **완료 (2026-11-24)** |
| **1. 키 발급·실측·계약 확정** | 선행 완료(PR #296·#297·#300 머지, main `9f05e20`). Y-1~Y-5 전부 확정(Y-4 A안 확정), `03`/`05`/`06`/`스펙_변경_이력.md`(C-81)·`../team/contracts/core.md` 개정 및 계약 발행 SHA(`cb25a44`) 기록 | [YES24_1단계_실측_및_계약개정안.md](명세/YES24_1단계_실측_및_계약개정안.md), `../team/contracts/core.md`(`cb25a44`) | Y-1~Y-5 전부 해소, 계약 발행 SHA 확정(`cb25a44e9eab502b3a7646c7e2c732390b86eef4`), 단일 head 확인(`0025_reports_constraints` → 신규 `0026_yes24_curated`) | **완료 (2026-11-24)** |
| **2. DB·엔진·CLI 구현** | 1단계 선행. 새 Alembic 리비전(`books_source_check` `'yes24'` 추가, `curated_books_cache`·`book_purchase_links` 생성·RLS), `settings.py`·`policy.py`·`Yes24Client`·`ProviderEngine.curated_books`·`sync-yes24-curated` CLI 구현 | `server/`: `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`, `uv run pytest -W error tests/test_lib_engine.py tests/test_yes24_curated.py` | 마이그레이션 왕복·RLS(`relrowsecurity=true`, 정책 0개)·성인물/URL/ISBN일치/한도/빈 응답 보호 테스트 및 핵심 가드 변이 5곳 실패 확인 | **완료 (2026-11-24)** |
| **3. API(`#9`/`#15`)·서가 테마 연결** | 2단계 선행. `#9 /books/recommendations` YES24 스테디셀러 연결·정보나루 폴백(양쪽 stale 시 YES24 stale 유지), `#15 /books/{isbn13}/purchase-link` 직링크(`kind="product"`)·검색 폴백 구현, `sync-yes24-curated --print-isbns` → `ops/shelf-themes` + `sync-theme-holdings` 연동 확인 | `server/`: `uv run pytest -W error tests/test_books.py tests/test_looks_shelf.py tests/test_yes24_curated.py` | `#9` 하위 호환·폴백, `#15` 직링크/폴백, 기존 도서관별 `#31` 회귀 0건(108 passed) 통과 | **완료 (2026-11-24)** |
| **4. 모바일 타입·출처 표기·검증** | 3단계 선행. `Book.source`, `PurchaseLink.kind` 확장. 홈 하단 창(VISIT-1b)·검색 진입의 `#9` YES24 추천 섹션에 `출처: YES24`를 한 번 표기 | `mobile/`: `npx tsc --noEmit`, `npx jest --runInBand`. 구현·진행 기록을 각각 `Owner: D` 커밋으로 기록하고 [PR #302](https://github.com/axteamc/localone/pull/302)에 반영 | 타입 검사 통과, Jest 49개 스위트·870개 테스트 통과 | **완료 (2026-11-24)** |
| **5. 도서 상세 시안·배치 개편 (Y-6, 후속)** | 4단계 선행. 도서 상세·단일 조회는 기존 API 재사용. 도서관 미지정 예정·일괄 조회·일괄 빌림은 아래 결정 후 관련 계약 개정 | [최신 HTML 시안](시안/Y-6_도서상세_YES24_시안.html), 설계명세 §5.5·§6, 아래 구현 범위 | 시안·계약 일치, 승인된 변경 구현, 경로별 검증 및 최신 PR HEAD 필수 CI 확인 | **PR #304 머지·운영 반영 완료, 실기기 최종 확인 대기** |

---

## 겪은 문제 / 유의사항

- **일정 분리:** 2026-11-24 시점은 M3 기능 동결 및 11/26(목) 최종 발표 직전이므로 프로덕션 코드 변경을 보류하고 설계·명세만 선행 확정했다.
- **기존 테이블 영향 최소화:** `provider_daily_usage`에는 이미 `'yes24'`가 등록되어 있으나(`0002_public_reference.py:203`), `popular_books_cache`는 정보나루 전용 유니크 제약에 묶여 있으므로 신규 `curated_books_cache`로 분리 설계했다.
- **도서관 미소장 괴리 방지:** 신간 베스트셀러보다 **스테디셀러**를 1순위로 채택하고, 방문 책장(`#31`)에는 기존 `theme_holdings.py` 소장 필터링을 거쳐 "이 도서관에 실제 소장된 스테디셀러"만 노출하는 전략을 채택했다.
- **4단계 출처 표기 검증:** `#9`의 `basis_label`로 추천 제공자를 구분한다. YES24 스테디셀러와 오래된 YES24 베스트셀러 캐시는 표기하고, 정보나루 전국 폴백 및 도서관별 인기 대출은 표기하지 않는다. 처음 추가한 화면 테스트 두 건은 구현 전 표기 누락으로 실패했다. 모바일 전체 회귀 중 색상 검사가 다른 테스트의 색상 기대값까지 검사하던 문제를 확인해 `__tests__`를 제외하고 화면 소스 검사는 유지했다.
- **운영·실기기 확인:** 이번 단계에서 서버 전체 회귀를 로컬로 재실행하지 않았다. 실제 서버 연결, 웹·Android·iOS 화면, 운영 환경변수(`YES24_API_KEY`) 및 초기 `sync-yes24-curated` 적재는 미확인이다.

---

## Y-6 구현 범위와 계약 결정안

- 시작 기준은 `feat/yes24-y6-book-detail`의 `0635aa9`다. 원격 `main` 및 PR #302 머지 커밋과 일치하고 Y-6 원격 브랜치·PR은 없다. `../team`의 K23·C3는 로컬 `cb25a44`에서 확인했다. team 원격 조회는 `Repository not found`로 종료되어 해당 SHA의 원격 반영 여부는 미확인이다.
- 사용자가 권장 방향으로 계약 개정을 준비하기로 했다. 기존 3개 계약 전체와 제품 기준 02·05·06을 고정 SHA에서 복사해 로컬 비교본·개정 초안을 작성했다. 작성한 초안의 세부 필드·한도·경로와 발행 SHA는 검토 후 확정한다.
- **화면 범위**는 도서 상세의 큰 표지·제목·저자·책 소개·도서 정보, 숫자 없는 빌릴 예정 바로가기, 하단 `대출 예정 | 도서관 확인`, 단일 도서 조회 창, 현행 대출·반납 탭의 빌릴 예정 구역이다. 출처는 `Book.source === "yes24"`일 때 책 정보에 한 번 표시한다. 책 소개의 YES24 연결과 조회 창의 구매 연결은 `#15`의 `product`/ `search`에 맞는 문구를 쓴다. 최신 시안의 SNS 도서 카드는 별도 `LOCAL-2` 제안으로 남긴다.
- **조회 창**에서 카드 본문은 한 도서관을 선택·해제하고, 오른쪽 필 버튼은 해당 링크만 연다. 필 버튼의 두 상태는 크기가 같고 터치 영역 높이는 최소 44px이다. 열기 처리에 성공하면 초록 점·`확인 완료`를 표시하고, 다시 누르면 같은 링크를 연다. 실패 시 다시 시도할 수 있다. 링크 열기 상태와 조회 기준일의 대출 상태는 별도이며, 단일 조회의 `live_check = null` 카드에는 외부 버튼을 두지 않는다. 구매 버튼은 해당 조회 범위에서 미소장이 확인된 때만 표시한다. `useAvailability.ts`의 `empty`만으로 판단하면 `unknown`이 섞인 결과도 미소장으로 처리될 수 있다.

| 승인할 결정 | 권장안 | 승인 후 반영할 기준 |
| --- | --- | --- |
| 도서관 없이 담기 | 기존 지정 예정은 그대로 둔다. 신규 미지정 예정은 계정·ISBN당 활성 1건으로 중복 저장을 막고 지정 예정과 공존시킨다. `#16`은 미지정 행을 명시적으로 요청한 클라이언트에만 포함하고, 새 행의 `library`를 `null`로 반환한다. `#17`의 미지정 입력은 선택 필드로 추가하고 재전송은 동일 ID를 반환한다. | `02` LIB-05·AC-PLAN, `05` R3, `06` #16·#17, `book-search.md` LIB-3. 기존 행·FK·소유자/RLS 유지, 미지정 활성 건에 별도 부분 유니크 제약 적용. |
| 여러 권 소장 조회 | 선택한 예정의 ISBN을 중복 제거해 조회하고, 선택이 없으면 기존 목록의 모든 페이지를 대상으로 한다. 조회별 총 제공자 호출 40건·동시 8건을 ISBN 전체에 공유하고 일일 한도는 기존 정책을 따른다. 미확인 쌍은 소장 권수에 더하지 않고 결과가 일부임을 표시한다. 소장 권수 내림차순, 거리 오름차순, 도서관 ID 순으로 최대 3곳을 고른 뒤 거리순으로 보여 준다. 거리가 없으면 뒤에 표시하고 ID로 동률을 해소한다. 여러 ISBN을 대표할 외부 링크는 도서관 홈페이지를 사용하고, 주소가 없으면 버튼을 숨긴다. | `02` LIB-0 수치 및 수용 기준, `06`과 `core.md` LIB-0 신규 일괄 조회 계약, `book-search.md` LIB-2·3. 요청 스키마·ISBN 입력 상한과 초과 안내·정렬 기준 좌표·부분 결과 및 재조회 응답을 계약에서 확정. |
| 일괄 빌림 | 기존 `#20`을 항목별로 재사용한다. 저장된 도서관을 기본값으로 보여 주고 미지정 건은 사용자가 실제 빌린 도서관 또는 미기록을 확인한다. 조회 창에서 고른 도서관은 후보이며 자동 확정하지 않는다. 서버에서 이동이 확인된 예정만 목록에서 제거하고, 실패 건은 선택을 유지해 재시도할 수 있게 한다. 중복·충돌·응답 유실은 목록 재조회로 상태를 확인한다. | `book-search.md` LIB-3 및 `loan-assistant.md` LOAN-1. 단건 대출·예정 전환의 트랜잭션과 소유권을 재사용하고, 혼합 결과 및 재시도 시 중복 대출 방지를 검증. |

### 변경 위치와 검증

- **공용 조회·제품 문서** — YES24 진행·설계·시안 및 제품 기준 문서. 일괄 조회의 변경 후보는 `server/app/routers/books.py`, `server/app/services/provider_engine.py`, `server/app/policy.py`, `mobile/src/lib/publicApi.ts` 및 해당 공통 테스트다. 기존 `#15` 및 단일 조회는 계약·응답을 유지한다.
- **도서 상세·대출 예정** — `BookDetailScreen.tsx`, `useAvailability.ts`, `LibraryAvailabilityCard.tsx`, `EmptyAvailability.tsx`, `LoanPlansSection.tsx`, `book-search/api.ts`, `mobile/app/(tabs)/loans.tsx`, `#16~#18` 라우터·새 예정 마이그레이션 및 관련 테스트가 변경 후보다. 사용자 승인 범위에 필요한 파일을 함께 변경하고 커밋은 변경 목적에 맞춰 나눈다.
- **검증 항목** — 카드 선택과 링크 열기 독립성, 같은 크기와 최소 44px, 실패 후 재시도, 링크 없는 카드, ISBN·조회 범위 변경 뒤 늦은 응답 무시, YES24 링크 종류·출처, 미소장과 오류·부분 미확인 구분, 구·신규 예정 조회와 멱등·소유권, 총 호출·동시 한도, 순위 동률, 일부 대출 실패·응답 유실 재시도. DB 검증은 격리된 로컬 DB에서 수행하고, 웹·Android·iOS는 실제 확인 범위를 각각 기록한다.

## Y-6 다음 작업

1. **기획 완료** — 최신 도서 상세 시안, 필 버튼·카드 선택, 기존 대출·반납 탭을 사용한다. 도서관 미지정 예정·일괄 조회·일괄 빌림의 개정 방향을 선택했다.
2. **계약 내용 확정 (2026-11-24 D, mac)** — [Y-6_계약개정안.md](명세/Y-6_계약개정안.md) Y6-1~Y6-8. `#70 POST /api/v1/me/loan-plans/availability`(로그인·예정 ID), `libSrchByBook` 소장 1차 + 상위 후보 `bookExist`, ISBN 20권, 요청당 40건·동시 8건 공유, 항상 200 + `complete`·`unknown_pairs`, 정렬 소장 → 대출 가능 → 거리 → ID. Windows의 `.git/y6-contract-review/` 비교본은 이 문서로 대체한다.
3. **team 발행 완료 (2026-11-24 mac)** — team `28434580a8db4a2fa0b0ba426b3df1805a005e2a`. `cb25a44`는 원격 어디에도 없어 사용자 지시로 덮어쓰기 발행. 02·05·06·C-84 반영.
4. **구현 파트 1(서버) 완료 (2026-11-24 mac, `b3e466c` 커밋, push 전)** — 아래 "Y-6 파트 1 결과". 기본값(Claude) 4건은 **사용자가 모두 채택(2026-11-24)** — 계약(U1 문구 등) 반영은 아직.
5. **구현 파트 2(모바일) 완료 (2026-11-24 mac, `cf51892`)** — 아래 "Y-6 파트 2 결과".
6. **웹 화면 확인·계약 보완 완료 (2026-11-24 mac)** — 웹 동선 전부 확인(Android·iOS 미확인), 기본값 14건 + M10 ① 위치를 team `5646974`·C-85로 반영. push·PR [#304](https://github.com/axteamc/localone/pull/304)(머지 전). 머지·운영 DB `0027` 적용·배포는 별도 지시.
7. **시안 재반영 완료 (2026-11-24 mac, `4dcf594`, C-86)** — 에뮬레이터에서 사용자가 본 화면이 확정 시안과 달라 고침. 아래 "Y-6 시안 재반영 결과". 남은 것: PR #304 머지(지시 후) → 운영 DB `0026`·`0027` 적용·배포(지시 후) → 배포된 앱으로 Android·iOS 실기기 최종 확인(Y-6 동선 전체) → LIB-3b §8 갱신.

### Y-6 파트 1 결과 (서버, 2026-11-24 mac)

- **바꾼 파일(9)**: `server/app/policy.py`(`BATCH_AVAILABILITY_MAX_ISBNS=20`·`_MAX_PLAN_IDS=50`·`_TOP_LIBRARIES=3`), `server/app/services/provider_engine.py`(`accept_holdings_page` 공용 무결성 검사로 `sync_theme_holdings` 정리, `bulk_availability`·`BulkAvailabilityResult`·`BulkCandidate`), `server/app/routers/loan_plans.py`(#16 `include_unassigned`, #17 `library_id` 선택, `LoanPlan.library` null, #70), 새 `server/migrations/versions/0027_loan_plans_unassigned.py`, 새 `server/tests/test_loan_plans_unassigned.py`(33건), `server/tests/test_loan_plans.py`(생략=미지정이 돼 검증 케이스 1개 교체), `server/tests/test_yes24_curated.py`(0026 왕복 시험이 `downgrade -1` → `0025_reports_constraints` 명시. 0027이 위에 생겨서). `loans.py` #20은 이미 `lib_id or plan.library_id`라 수정 없음(미지정 예정 → 대출 `library` null 시험 추가).
- **공식 문서 확인(개정안 §7)**: 정보나루 API 매뉴얼 v20260620. `bookExist` 35쪽 "대출 가능여부는 조회일 기준 전날의 대출 상태를 기준으로 제공". `libSrchByBook` 38~39쪽은 `pageSize` "선택·숫자"만 적고 **상한·기본값·소장 데이터 기준일은 적지 않음** → 임시 처리 유지(전날 기준으로 보고 오늘 `bookExist` 우선, 페이지 100은 운영 `sync-theme-holdings`에서 쓰던 값). 두 API 결과 대조 1회(실제 키 호출)는 아직 안 함.
- **검증(격리 PostgreSQL 16 컨테이너 `y6-test-pg`, `127.0.0.1:55434/y6_test`, 데모 DB 5433 미사용, `.env` 키는 빈 값으로 덮음)**: `alembic upgrade head` → `downgrade -1`(0026) → `upgrade head`, 단일 head `0027_loan_plans_unassigned`. 미지정 행이 있으면 downgrade 실패·행 보존 시험 포함. 표적 pytest `-W error` 262건 통과(`test_loan_plans_unassigned`·`test_loan_plans`·`test_loans_start`·`test_lib_engine`·`test_looks_shelf`·`test_books`·`test_me_withdraw`·`test_yes24_curated`), 전체 882건 통과. 가드 변이 7곳(부분 페이지를 no로·예산 무시·대출 가능 정렬 제거·오늘 관측 무시·미지정 숨김 제거·404 소유 검사 제거·ISBN 상한 제거) 모두 실패 확인(정렬 변이는 처음 살아남아 단언 추가 뒤 실패).
- **계약에 없던 세부를 기본값(Claude)으로 정함 — 계약 보완 필요**:
  1. 0027 downgrade는 미지정 **활성** 행이 아니라 **미지정 행이 하나라도**(해제·전환 포함) 있으면 실패한다. `NOT NULL`을 되돌릴 수 없어서다(U1 문구 "미지정 활성 행" → "미지정 행"으로 고칠 것).
  2. `region_code`가 시·도 2자리가 아닌 도서관은 ①을 못 해서 `holding=unknown`, `fallback_reason="provider_error"`(운영 `_store_libraries`는 항상 채워 실제로는 0곳).
  3. `fallback_counts`는 사유가 있고 `holding`이나 `loanable`이 `unknown`인 쌍 수(①로 소장은 확정됐는데 ②를 예산·오류로 못 본 쌍도 센다). `complete`·`unknown_pairs`는 `holding`만 본다.
  4. 예산은 실제 호출 순서대로 쓴다(동시 8 안에서 앞 ISBN 첫 페이지부터, 여러 페이지인 지역의 뒤 페이지는 나중). 주변 도서관 0곳이면 `books[].status`는 `not_held`(모든 쌍이 no라는 공허한 참).
- **결정(2026-11-24 사용자)**: 위 기본값 4건 모두 채택 → team `5646974` LIB-3b U1·§2.2·§2.3에 반영(C-85). 파트 1은 `b3e466c`로 커밋.
- **아직 안 함**: push·PR, 실제 정보나루 호출 대조, 운영 DB `0027` 적용·배포.

### Y-6 파트 2 결과 (모바일, 2026-11-24 mac, `cf51892`)

- **바꾼 파일(12, 사용자 승인 — 참고 상한 7개 초과)**: `mobile/src/features/book-search/` 아래
  - `api.ts`: `LoanPlan.library` nullable, `listLoanPlans({ includeUnassigned })`(U5), `saveLoanPlan(isbn13, libraryId | null)`(U4·U6), `fetchPlansAvailability`·`BatchAvailabilityResponse`·`BatchCandidate`(#70).
  - `BookDetailScreen.tsx`: V1 순서(큰 표지 → 제목·저자 → 책 소개(더 보기) → 도서 정보 출판사·연도·ISBN, YES24 책만 `출처: YES24`), V2 `YES24에서 도서 상세 보기 ↗`/`도서 검색 ↗`(#15 kind), V3 하단 `대출 예정 | 도서관 확인`(대출 예정 = 미지정 저장, 도서관 확인 = 단일 조회 창), V4 머리 우측 리스트 아이콘(→ `/loans`), V7 `YES24에서 구매하기 ↗`(조회 결과 1곳 이상이 모두 `holding = "no"`일 때만).
  - `LibraryAvailabilityCard.tsx`: V5 카드 본문 눌러 선택·해제(테두리·왼쪽 표시선·`선택됨`), V6 `LivePill`(`실시간 ↗` ↔ 초록 점 `확인 완료`, 96×44 고정, 실패 시 그대로 재시도, 같은 링크 재열기).
  - `LoanPlansSection.tsx`: #16 `includeUnassigned: true`, 미지정 카드 `도서관 미정`(U7), 제목 옆 `n권`(V4), 카드 체크·`전체 선택`, `빌렸어요(선택한 n권) | 일괄 검색`, B4 판정(#16 `limit 50` 재조회로 사라진 예정만 뺌, 실패·이미 빌린 예정은 선택 유지 + 문구).
  - 새 `BatchAvailabilityPanel.tsx`: #70(선택 없으면 `plan_ids` 생략=전체), `소장 n권 · 대출 가능 m권`, `complete=false` → "일부 도서관만 확인했어요." + "다시 조회", 후보 0곳 문구 2종, 422 `plan_ids`·404(목록 재조회)·위치 없음, 20권 초과 선택은 묻기 전에 막음, V9(`createLatestRunner`로 범위 바뀌면 취소·늦은 응답 버림).
  - 새 `BatchLoanSheet.tsx`: B2 확인 창(지정 예정은 그 도서관, 미지정은 소장 후보 칩 또는 `기록 안 함`을 꼭 고름, 일괄 검색에서 고른 도서관은 미리 채움만), B1 `#20` 순차 호출, B3 미지정+기록 안 함은 `library_id` 안 보냄, 연타 1회.
  - 시험: `detail`·`plans`·`availability-nearby`·`availability-city` 수정(조회는 "도서관 확인"을 누른 뒤에만 — `renderDetail` 헬퍼), 새 `batch.test.tsx`(12건).
- **공식 문서 확인**: Expo `Linking.openURL`(SDK 58)은 "OS가 자동으로 열었거나 사용자가 확인하면 `true`로 resolve, 등록된 앱이 없거나 사용자가 취소하면 reject"(RN 0.88 문서도 같음). 앞으로 나왔는지까지는 보장하지 않는다. → V6 "확인 완료"는 기존 `openExternalUrl`이 `true`(resolve)일 때로 판정. 웹은 `window.open` 성공으로 본다(기존 동작).
- **검증**: `npx tsc --noEmit` 통과. 표적 Jest(`src/features/book-search`·`src/features/loan-assistant`) 9 스위트 153건 통과, 전체 Jest 50 스위트 889건 통과. 가드 변이 9곳(일괄 빌림 순차→동시, V7 `every`→`some`, V9 취소 제거, B4 실패도 옮김 처리, U6 도서관 지정, B2 고르지 않아도 보냄, V6 실패도 완료, U5 미지정 안 읽음, 20권 사전 차단 제거) 모두 시험 실패 확인. `grep -rn "실시간" mobile/src`은 `실시간 ↗`·`실시간 확인 ↗` 링크 문구와 주석만(H-ARCH-06). 웹·Android·iOS 실제 화면 확인은 **아직 안 함**.
- **사용자 결정(2026-11-24)**: 도서 상세의 M10 ① `빌렸어요`는 **제목 아래 보조 버튼으로 유지**(V3 하단 두 버튼과 함께). `loan-assistant.md` M10 ① 위치 문구(“`빌릴 예정에 저장` 오른쪽”)를 계약에서 고쳐야 한다.
- **기본값(Claude) → 확정(2026-11-24 사용자 D 10건 모두 채택, team `5646974` LIB-3b V11~V16·B5·B7~B9, C-85)**:
  1. 단일 조회 창의 카드 선택(V5)은 **표시만** 한다(대출 예정은 U6대로 항상 미지정 저장). 도서관 골라 담기(N3·N7 `SavePlanSheet`)는 조회 창 빈 결과의 "나중에 빌릴 책으로 저장"에서만 연다.
  2. 조회 창은 화면 안 겹침 패널(RN `Modal` 아님 — 담기 창 `Modal`과 겹치지 않게). 창을 닫으면 조회를 취소하고, 다시 열면 새로 묻는다.
  3. V7 0곳(빈 목록)은 "모두 no 확정"으로 보지 않고 구매 버튼을 숨긴다.
  4. 일괄 검색 위치를 못 잡으면 "위치를 확인하지 못했어요. 위치 권한을 켠 뒤 다시 조회해 주세요."(지역 고르기 없음 — #70은 `lat`·`lng` 필수). 반경은 `NEARBY_DEFAULT_RADIUS_KM`(3).
  5. 422 `detail="plan_ids"`는 모두 "한 번에 20권까지…"로 보인다(앱은 형식·중복·50개 초과를 만들지 않음).
  6. 확인 창의 미지정 예정 후보는 일괄 검색 후보 중 그 ISBN을 소장한 곳 + `기록 안 함`. 일괄 검색 없이 열면 `기록 안 함`만.
  7. B5 문구 `n권은 이미 빌린 책이에요. 빌릴 예정에 남겨 두었어요.`, 성공 `n권을 내 대출로 옮겼어요.`(시안). 판정: `#20` 응답 `plan_id`가 그 예정이면 converted, 아니면 already(M5).
  8. B4 재조회는 `limit 50` 첫 쪽. 다음 쪽이 있으면 "목록에 없음"만으로 옮긴 것으로 보지 않는다(응답이 converted였던 것만).
  9. 일괄 버튼 줄은 시안의 하단 고정 대신 빌릴 예정 제목 아래에 둔다(탭 화면 `ScrollView` 구조 유지). 일괄 검색 결과도 구역 안에 펼친다.
  10. 일괄 빌림 뒤·404 뒤에는 일괄 검색 패널을 닫는다(낡은 결과로 다시 묻지 않게).
- **웹 화면 확인(2026-11-24 mac, Chromium 390×844)**: 격리 컨테이너 `y6-test-pg`의 새 DB `y6_web`(`alembic upgrade head` = 0027, `seed`, `sync-libraries 24040` 실제 호출로 광주 북구 7곳) + 시험 서명 키(`create_app(jwks_client=…)`, 시험 코드와 같은 방식)로 띄운 서버 + 웹 `localStorage` 세션. 정보나루는 실제 키로 호출. 위치 (35.1765, 126.9253), 반경 3km → 3곳.
  - 상세 → `도서관 확인` 창(3곳, 카드 선택 `선택됨`, 필 `실시간 ↗` → 새 창 → `확인 완료`, 두 상태 96×44) → `닫기` → `대출 예정`(#17 201, `도서관 미정`) 2권 → 리스트 아이콘 → `/loans` `2권` → `일괄 검색`(#70, 후보 3곳 `소장 2권 · 대출 가능 2/2/1권`) → 전체 선택 → `빌렸어요` 확인 창(미지정 예정마다 소장 후보 칩 + `기록 안 함`) → 1권 도서관·1권 기록 안 함 → #20 두 번 201 → `2권을 내 대출로 옮겼어요.`, DB 대출 `library_id` 4·`null`, 예정 `converted`.
  - 책 1권 선택 → 일괄 검색 → 도서관 고름 → `선택한 1권 빌렸어요`: 확인 창에 고른 도서관이 미리 채워짐(B2·B7), 1권만 옮기고 나머지는 남음.
  - **고친 것**: 조회 카드 전체를 선택 `Pressable`(role=button)로 감싸 웹에서 `<button>` 안 `<button>`(`select-library-* > info-open-*`) 경고와 개발 오류 토스트가 났다 → 선택 레이어를 카드 맨 뒤 `absoluteFill`로 옮기고 글자 영역은 `pointerEvents: "none"`(`LibraryAvailabilityCard.tsx`, 시험에 "선택 레이어가 다른 버튼을 감싸지 않음" 단언 추가). 고친 뒤 콘솔 오류 0건, `tsc`·표적 153·전체 Jest 889 통과. `cf51892`에 포함.
  - 참고: 일괄 검색 뒤 선택을 바꾸면(예: `전체 선택`) 범위가 바뀌어 다시 묻고 고른 도서관도 풀린다(V8·V9 그대로).
  - Expo가 `mobile/tsconfig.json` include를 또 고쳐 `git checkout`으로 되돌림(알려진 mac 함정).
- **Android·iOS**: 미확인. 로그인 세션을 기기에 넣을 방법이 없다(Google 로그인 자동화 불가) — 다음 실기기 묶음에서 사용자가 직접 로그인해 같은 동선을 본다. team LIB-3b §8에 기록.
- **아직 안 함**: 머지, 운영 DB `0027` 적용·배포, 실제 정보나루 `libSrchByBook`·`bookExist` 결과 대조 1회(LIB-3b §7 — 웹 확인에서 같은 3곳이 두 API 모두 소장으로 나왔지만 오늘 관측 우선 규칙이 섞여 대조로 치지 않음), Android·iOS 화면 확인.

### Y-6 시안 재반영 결과 (2026-11-24 mac, `4dcf594`, C-86)

- **발견**: Android 에뮬레이터(개발 빌드 + 로컬 서버)에서 사용자가 직접 로그인해 보니 상세·조회 창이 확정 시안([Y-6_도서상세_YES24_시안.html](시안/Y-6_도서상세_YES24_시안.html))과 많이 달랐다 — 제목 아래 `빌렸어요` 둥근 버튼, 가운데 정렬, 구역 구분선 없음, 도서 정보 줄 목록, 조회 창 머리(`닫기` 글자·칩 버튼), 큰 카드. Android 문제가 아니라 구현 문제(같은 JS가 웹에도 나감).
- **원인**: ① 시안을 계약 V1~V16에 **순서·문구만** 옮기고 모양(정렬·줄눈·정보 칸·창 머리·카드)을 값으로 적지 않아, 구현이 기존 화면 스타일을 그대로 씀. ② 웹 확인을 동선·API로만 하고 **시안 캡처와 나란히 대조하지 않음**. ③ `빌렸어요` 제목 아래는 "사용자 결정"으로 기록됐지만 사용자는 그 모양을 예상하지 못함.
- **결정(2026-11-24 사용자)**: `빌렸어요`는 남기되 위치·표기를 바꿈 → [위치 시안](시안/Y-6_빌렸어요_위치_시안.html) 후보 **C 본문 맨 아래 사각 버튼 + 설명**(A 머리 아이콘·B 책 소개 끝은 사용자가 낸 안). YES24 링크는 **본문 맨 아래**. 대출·반납 일괄 버튼 줄은 **현행 유지**(V16). 시안 처음 판에서 하단 버튼 줄이 스크롤과 함께 움직이게 잘못 그려 바로잡음.
- **바꾼 파일(5)**: `BookDetailScreen.tsx`(표지 띠·왼쪽 정렬·구역 줄눈·정보 칸·본문 끝 `빌렸어요`→YES24, 조회 창 X·`현재 책의 대출 상태`·밑줄 범위 링크·구매 링크 줄눈), `LibraryAvailabilityCard.tsx`(촘촘한 카드: 이름·거리(+오늘 운영) / 상태 점 / 주소·전화 접기, 오른쪽 필 — LIB-2 A2 정보는 유지), `StartLoanButton.tsx`(상세 사각 버튼 + 설명, 곡률 `radii.infoCard`), `LoanPlansSection.tsx`(빈 안내의 옛 버튼 이름 → `대출 예정`), `detail.test.tsx`(본문 끝 순서 시험 추가·옛 위치 단언 교체).
- **검증**: `tsc` 통과, 전체 Jest 50 스위트 890건 통과. 변이(`빌렸어요`·YES24 순서 바꿈) → 새 시험 실패 확인 후 원복. 에뮬레이터 화면을 시안 캡처와 나란히 대조(상세 위·아래, 조회 창 머리, 광주 북구 7곳 카드 — 위치를 못 받아 지역 고르기 경로).
- **정보나루 대조(§7)**: 7권 × 북구 7곳 49쌍 `libSrchByBook` 소장 = `bookExist hasBook` 전부 일치. 갱신 주기는 여전히 미확인(임시 처리 유지).
- **아직 안 함**: Android에서 대출 예정 → 일괄 검색 → 일괄 빌림 동선, 일괄 검색 패널 카드의 시안 대조, iOS 전체. 방식은 배포 뒤 최종 확인(iOS = Mac 서명 없는 Release IPA → LiveContainer, `.env.production`).

### Y-6 운영 반영 및 실기기 확인 준비 (2026-11-24 mac, `main` `3853871`)

- **운영 반영 완료**:
  - PR [#304](https://github.com/axteamc/localone/pull/304) 머지 확인 후 `main` `3853871` 동기화.
  - 운영 DB Alembic 마이그레이션: `0017` → **`0027_loan_plans_unassigned (head)`** (`0018`~`0027` 10개 일괄 적용).
  - `YES24_API_KEY` Secret Manager 등록 후 Cloud Run `localone-api` 연결 및 배포 → 활성 리비전 **`localone-api-00009-5t2`** (`POST /api/v1/me/loan-plans/availability` 401 응답 확인).
  - `sync-yes24-curated` 첫 적재 성공: `{"kind": "steady", "category": "001", "basis_label": "YES24 스테디셀러 · 국내도서", "count": 20, "stale": false, "fallback_reason": null}` (`GET /api/v1/books/recommendations` 20권·`source="yes24"` 확인).
  - `localone-web` 프론트 재배포 → 활성 리비전 **`localone-web-00003-t5k`** (HTTP 200, 두 웹 URL 모두 `localone-api` CORS 허용 확인).
  - Mac에서 `.env.production` 기준 서명 없는 iOS Release IPA 생성 완료: `mobile/ios/localone-unsigned.ipa` (12M, `main.jsbundle`에 운영 API URL 포함·사설 IP 미포함 확인).
- **다음 확인 필요 리스트 (실기기 최종 확인 — Android 에뮬레이터/기기 · iOS LiveContainer · 운영 웹)**:
  1. **로그인·YES24 큐레이션**: Google 로그인(iOS LiveContainer에서 `localone://auth-callback` 복귀 포함), 홈/검색 `#9` `YES24 스테디셀러 · 국내도서`·`출처: YES24` 표시
  2. **도서 상세 (`V1`·`V2`·`M10 ①`)**: 큰 표지·왼쪽 정렬·구역 줄눈·도서 정보 칸·본문 맨 아래 `빌렸어요` 사각 버튼 → `YES24에서 도서 상세/검색 ↗` (시안 캡처와 나란히 대조)
  3. **단일 도서관 확인 창 (`V17`·`V5`·`V6`·`V7`)**: 창 머리 X·`현재 책의 대출 상태`·밑줄 범위 링크·카드 본문 선택/필 버튼(`실시간 ↗` ↔ 초록 점 `확인 완료`) 독립 동작·미소장 확정 시 `YES24에서 구매하기 ↗` (시안 대조)
  4. **도서관 미지정 대출 예정 (`U6`·`U7`·`V4`)**: 하단 `대출 예정` → 우측 상단 리스트 아이콘 → `대출·반납` 탭 `n권`·`도서관 미정` 카드
  5. **일괄 검색 (`#70`·`V8`·`V16`)**: 위치 권한 허용 주변 조회, `소장 n권 · 대출 가능 m권`, **일괄 검색 패널 카드 시안 대조**, `complete=false` 시 재조회
  6. **일괄 빌림 (`#20`·`B1`~`B9`)**: 확인 창(지정 도서관 / 미지정 후보 칩·미리 채움·`기록 안 함`) → 순차 `#20` 전환 → `converted` 목록 갱신
  7. **후처리**: 확인 중 운영 DB에 만든 시험 대출·예정 기록은 사용자 확인 뒤 정리 방법 결정 → `LIB-3b §8`·진행·인수인계 최종 갱신

### 2026-11-25 대화 결정 반영 점검과 개선안

기준은 PR #304의 머지된 변경 HEAD `7e8ca22`이다. 아래는 코드·계약·기존 검증 기록을 대조한 결과이며 이번 점검에서 앱을 실행하지 않았다.

| 항목 | 현재 상태와 원인 | 후속 작업의 완료 기준 |
| --- | --- | --- |
| SNS 도서 카드 | 설계명세 §5.5에는 오른쪽 `도서관 확인` 필과 공용 조회 창이 있지만, 이 기록의 화면 범위에는 LOCAL-2 별도 제안으로 남았다. `PostDetail.tsx`는 여전히 카드 전체를 누르면 외부 사이트 또는 책 상세를 열고, LOCAL-2 테스트도 기존 분기를 기대한다. | LOCAL-2 계약·화면·테스트를 한 변경으로 맞춘다. 제목은 책 상세, 오른쪽 필은 해당 ISBN의 조회 창을 열고, 외부 확인은 창 안에서만 동작하는지 검증한다. 좁은 화면에서 필이 한 줄이고 세로 중앙인지 확인한다. |
| 단일·일괄 도서관 카드 | 단일·일괄 모두 선택·해제와 `LivePill`이 있다. 일괄 카드는 이름·선택·권수·거리를 여러 줄로 쌓고 선택용 Pressable 안에 필을 둔다(`BatchAvailabilityPanel.tsx`). 단일 조회 창의 에뮬레이터 대조를 일괄 패널까지 확대하지 않았다. | 같은 화면 폭에서 양쪽의 미선택·선택·링크 열기 후 모습을 비교한다. 필을 눌러도 선택이 바뀌지 않고, 재클릭으로 링크를 다시 여는지 두 진입점에서 각각 확인한다. 권수 등 일괄 조회 고유 정보는 유지한다. |
| 후속 결정으로 바뀐 동작 | C-85는 기존 대출·반납 탭 안에서 일괄 결과를 펼치도록 했고, C-86은 YES24 일반 링크를 본문 맨 아래로 옮겼다. Y6-6은 소장 권수 동률에서 대출 가능 권수를 먼저 고려하고 최종 3곳은 거리순으로 표시한다. 초기 시안 설명도 남아 있어 서로 다른 판을 비교할 수 있다. | 초기 제안 옆에 이를 대체한 결정과 적용 화면을 연결한다. 검토 시에는 C-85·C-86·Y6-6을 기준으로 삼는다. |

다음 변경부터 진행 기록에 **사용자 결정 → 적용할 화면·계약 → 코드·행동 테스트 → 같은 상태의 시안/앱 화면 증거**를 한 행에 연결한다. 별도 Step으로 넘긴 항목은 인계 경로와 완료 조건을 기록한다. 완료 보고에는 확인한 진입점·플랫폼을 명시하고, 다음 검증은 일괄 조회 패널과 SNS 카드부터 진행한다.


### Y-6 시안 누락 보정 결과 (2026-11-25 win, C-87, `fix/yes24-y6-mockup-gaps`)

| 사용자 결정 | 계약 | 코드·행동 시험 | 화면 증거(390×844, 같은 상태) |
| --- | --- | --- | --- |
| SNS 도서 카드 = 시안 `#sns-review`(왼쪽 책 정보 → 책 상세, 오른쪽 `도서관 확인` 필 → 조회 창), `구매 ↗` 제거(2026-11-25) | team `c6dc579` local-feed H9·문구표·LOCAL-2-P4, core 경로표 `lookup`·`library` | `PostDetail.tsx`, `app/books/[isbn13].tsx`, `BookDetailScreen.tsx`(`openLookup`·`pinLibraryId`) / `local-feed detail.test` 2건 교체, `availability-nearby.test` 2건 추가 | [시안](시안/C-87_대조/m1_sns_card.png) · [앱](시안/C-87_대조/a1_sns_card.png) |
| 게시물 도서관은 조회 창 맨 위, 주변 결과와 같으면 한 번만(추천안 채택) | 위 core 경로표 | `usePinnedLibrary` + 중복 제거(같으면 거리 있는 주변 항목 사용) | [시안](시안/C-87_대조/m4_lookup_done.png) · [앱](시안/C-87_대조/a4_lookup_done.png) |
| 일괄 검색 카드도 단일 카드와 같은 모양, 필은 선택과 독립 | team `c6dc579` LIB-3b 새 V18 | `BatchAvailabilityPanel.tsx`(선택 레이어 맨 뒤, X 닫기, 상태 점) / `batch.test` 1건 추가 | [시안](시안/C-87_대조/m6_batch_selected_done.png) · [앱 미선택](시안/C-87_대조/a5_batch_unselected.png) · [앱 선택·확인 완료](시안/C-87_대조/a6_batch_selected_done.png) |

- **검증**: `tsc` 통과, 전체 Jest 50 스위트 893건 통과. 변이 3곳(중복 제거 삭제, 책 정보가 실시간 링크 열기, 필이 선택 해제) 모두 시험 실패 확인 후 원복.
- **화면 대조 방법**: Metro 웹(`npx expo start --web --port 8091`) + Playwright(설치된 Edge, `channel: "msedge"`)로 API는 가로채 가짜 응답, Supabase 세션은 `localStorage`에 가짜로 넣음([capture.mjs](시안/C-87_대조/capture.mjs)). 시안 HTML도 같은 크기·같은 상태로 캡처. 웹 `<button>` 중첩 0건, 콘솔 오류 0건.
- **시안과 남은 차이(의도)**: 일괄 머리 제목 `일괄 검색`(시안 `가까운 도서관`)·상태 문구 `소장 n권 · 대출 가능 m권`(시안 `3권 중 2권 소장`)은 계약 V8 그대로. SNS 카드 상태 줄의 도서관명/기준 글자 구분은 기존 H9 규칙.
- **아직 안 함**: Android·iOS 실기기(배포 뒤 최종 확인 묶음에서).
