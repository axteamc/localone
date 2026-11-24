# YES24 스테디셀러·인기도서 큐레이션 및 구매 연동 진행 (M2 이후 후속)

- **상태:** **4단계 완료 — 5단계(Y-6) 계약 발행(team `2843458`)·서버 파트 1 구현 완료(2026-11-24 mac, 미커밋), 모바일 파트 2 대기**. YES24 1단계 K23도 같은 커밋에서 다시 써서 원격 반영(원 `cb25a44`는 미반영·폐기). 운영 반영은 별도 지시에 따른다.
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
| **5. 도서 상세 시안·배치 개편 (Y-6, 후속)** | 4단계 선행. 도서 상세·단일 조회는 기존 API 재사용. 도서관 미지정 예정·일괄 조회·일괄 빌림은 아래 결정 후 관련 계약 개정 | [최신 HTML 시안](시안/Y-6_도서상세_YES24_시안.html), 설계명세 §5.5·§6, 아래 구현 범위 | 시안·계약 일치, 승인된 변경 구현, 경로별 검증 및 최신 PR HEAD 필수 CI 확인 | **계약 발행 완료(team `2843458`), 서버 파트 1 완료(미커밋), 모바일 파트 2 대기** |

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
4. **구현 파트 1(서버) 완료 (2026-11-24 mac, 미커밋)** — 아래 "Y-6 파트 1 결과".
5. **구현 파트 2(모바일) 대기** — `saveLoanPlan(isbn13, libraryId | null)`, `#16 include_unassigned=true`, `#70` 조회 창·일괄 빌림(`#20` 순차), 도서 상세 V1~V10. 머지·배포는 별도 지시.

### Y-6 파트 1 결과 (서버, 2026-11-24 mac)

- **바꾼 파일(9)**: `server/app/policy.py`(`BATCH_AVAILABILITY_MAX_ISBNS=20`·`_MAX_PLAN_IDS=50`·`_TOP_LIBRARIES=3`), `server/app/services/provider_engine.py`(`accept_holdings_page` 공용 무결성 검사로 `sync_theme_holdings` 정리, `bulk_availability`·`BulkAvailabilityResult`·`BulkCandidate`), `server/app/routers/loan_plans.py`(#16 `include_unassigned`, #17 `library_id` 선택, `LoanPlan.library` null, #70), 새 `server/migrations/versions/0027_loan_plans_unassigned.py`, 새 `server/tests/test_loan_plans_unassigned.py`(33건), `server/tests/test_loan_plans.py`(생략=미지정이 돼 검증 케이스 1개 교체), `server/tests/test_yes24_curated.py`(0026 왕복 시험이 `downgrade -1` → `0025_reports_constraints` 명시. 0027이 위에 생겨서). `loans.py` #20은 이미 `lib_id or plan.library_id`라 수정 없음(미지정 예정 → 대출 `library` null 시험 추가).
- **공식 문서 확인(개정안 §7)**: 정보나루 API 매뉴얼 v20260620. `bookExist` 35쪽 "대출 가능여부는 조회일 기준 전날의 대출 상태를 기준으로 제공". `libSrchByBook` 38~39쪽은 `pageSize` "선택·숫자"만 적고 **상한·기본값·소장 데이터 기준일은 적지 않음** → 임시 처리 유지(전날 기준으로 보고 오늘 `bookExist` 우선, 페이지 100은 운영 `sync-theme-holdings`에서 쓰던 값). 두 API 결과 대조 1회(실제 키 호출)는 아직 안 함.
- **검증(격리 PostgreSQL 16 컨테이너 `y6-test-pg`, `127.0.0.1:55434/y6_test`, 데모 DB 5433 미사용, `.env` 키는 빈 값으로 덮음)**: `alembic upgrade head` → `downgrade -1`(0026) → `upgrade head`, 단일 head `0027_loan_plans_unassigned`. 미지정 행이 있으면 downgrade 실패·행 보존 시험 포함. 표적 pytest `-W error` 262건 통과(`test_loan_plans_unassigned`·`test_loan_plans`·`test_loans_start`·`test_lib_engine`·`test_looks_shelf`·`test_books`·`test_me_withdraw`·`test_yes24_curated`), 전체 882건 통과. 가드 변이 7곳(부분 페이지를 no로·예산 무시·대출 가능 정렬 제거·오늘 관측 무시·미지정 숨김 제거·404 소유 검사 제거·ISBN 상한 제거) 모두 실패 확인(정렬 변이는 처음 살아남아 단언 추가 뒤 실패).
- **계약에 없던 세부를 기본값(Claude)으로 정함 — 계약 보완 필요**:
  1. 0027 downgrade는 미지정 **활성** 행이 아니라 **미지정 행이 하나라도**(해제·전환 포함) 있으면 실패한다. `NOT NULL`을 되돌릴 수 없어서다(U1 문구 "미지정 활성 행" → "미지정 행"으로 고칠 것).
  2. `region_code`가 시·도 2자리가 아닌 도서관은 ①을 못 해서 `holding=unknown`, `fallback_reason="provider_error"`(운영 `_store_libraries`는 항상 채워 실제로는 0곳).
  3. `fallback_counts`는 사유가 있고 `holding`이나 `loanable`이 `unknown`인 쌍 수(①로 소장은 확정됐는데 ②를 예산·오류로 못 본 쌍도 센다). `complete`·`unknown_pairs`는 `holding`만 본다.
  4. 예산은 실제 호출 순서대로 쓴다(동시 8 안에서 앞 ISBN 첫 페이지부터, 여러 페이지인 지역의 뒤 페이지는 나중). 주변 도서관 0곳이면 `books[].status`는 `not_held`(모든 쌍이 no라는 공허한 참).
- **아직 안 함**: 커밋·push·PR, 모바일 파트 2, 실제 정보나루 호출 대조, 운영 DB `0027` 적용·배포.
```text
Y-6 구현 파트 2(모바일: 도서 상세·미지정 예정·#70 조회 창·일괄 빌림)를 시작해.
먼저 읽어: 개발산출물/인수인계_메모.md, 이 진행 파일 "Y-6 파트 1 결과", 개발산출물/명세/Y-6_계약개정안.md §3~§5, ../team/contracts/book-search.md LIB-3b.
범위: mobile/ 만. 서버는 파트 1 결과 그대로.
```
