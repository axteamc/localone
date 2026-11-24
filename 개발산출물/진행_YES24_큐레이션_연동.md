# YES24 스테디셀러·인기도서 큐레이션 및 구매 연동 진행 (M2 이후 후속)

- **상태:** **3단계(API `#9`/`#15`·서가 테마 연결) 완료 — 4단계(모바일 타입·출처 표기·검증·운영 반영) 대기** (Y-6 도서 상세 시안은 4단계 완료 후 후속 진행)
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
| **4. 모바일 타입·출처 표기·검증·운영 반영** | 3단계 선행. `mobile/src/lib/publicApi.ts` 타입(`Book.source`, `PurchaseLink.kind`) 확장, 약관상 섹션 단위 출처 표기(`출처: YES24` / `데이터 제공: YES24`) 반영, 전체 검증·로컬 커밋 및 (별도 지시 시) PR·CI·운영 환경변수(`YES24_API_KEY`) 등록·초기 `sync-yes24-curated` 적재 | `mobile/`: `npx tsc --noEmit && npx jest --runInBand`, `server/`: 전체 `pytest -W error` | 앱 타입 검사·Jest 통과, 서버 전체 회귀 통과, 로컬 커밋 완료(push·PR·운영 반영은 별도 지시 시) | **대기** |
| **5. 도서 상세 시안·배치 개편 (Y-6, 후속)** | 4단계 선행(1단계 시안 패스 → 2026-11-24 D 결정으로 YES24 연동 완료 후 이연). `BookDetailScreen.tsx` 배치 개편 및 YES24 상품 상세 연결 버튼 위치 HTML 시안 검토·반영 | `개발산출물/시안/` HTML 시안 검토 → `BookDetailScreen.tsx` 반영 | 사용자 시안 확정 및 도서 상세 YES24 연결 반영 | **대기 (4단계 후 이연)** |

---

## 겪은 문제 / 유의사항

- **일정 분리:** 2026-11-24 시점은 M3 기능 동결 및 11/26(목) 최종 발표 직전이므로 프로덕션 코드 변경을 보류하고 설계·명세만 선행 확정했다.
- **기존 테이블 영향 최소화:** `provider_daily_usage`에는 이미 `'yes24'`가 등록되어 있으나(`0002_public_reference.py:203`), `popular_books_cache`는 정보나루 전용 유니크 제약에 묶여 있으므로 신규 `curated_books_cache`로 분리 설계했다.
- **도서관 미소장 괴리 방지:** 신간 베스트셀러보다 **스테디셀러**를 1순위로 채택하고, 방문 책장(`#31`)에는 기존 `theme_holdings.py` 소장 필터링을 거쳐 "이 도서관에 실제 소장된 스테디셀러"만 노출하는 전략을 채택했다.

---

## 다음 세션 시작 지시

> **4단계(모바일 타입·출처 표기·검증·운영 반영) 착수.** (Y-6 도서 상세 시안은 4단계 완료 후 5단계로 이연)
> **권장 Effort:** `중간` (`mobile/src/lib/publicApi.ts` 타입 확장, 섹션 단위 `출처: YES24` 표기, `tsc`/`jest`/`pytest` 검증 및 로컬 커밋)

```text
YES24 큐레이션 및 구매 연동 4단계(모바일 타입·출처 표기·검증)를 진행해줘.
먼저 아래 문서와 계약을 읽고 현재 브랜치(docs/yes24-curation-and-design-drafts) 상태를 확인한 뒤 시작해:
- 개발산출물/진행_YES24_큐레이션_연동.md
- 개발산출물/명세/YES24_큐레이션_및_구매연동_설계명세.md (§1.3, §5.5)
- ../team/contracts/core.md (LIB-0 K23·C3)

작업 범위:
1. mobile/src/lib/publicApi.ts의 Book.source("yes24" 추가)와 PurchaseLink.kind("product" | "search") 타입 확장
2. 홈 하단 창(VISIT-1b)·검색 진입(#9) 추천 섹션에 약관 의무 ① 섹션 단위 출처 표기("출처: YES24" 또는 "데이터 제공: YES24", YES24 출처일 때만 노출) 반영
   - Y-6(BookDetailScreen.tsx 배치 개편·YES24 연결 버튼 시안)은 4단계 완료 후 5단계로 이연됨 — 이번 단계에서 건드리지 않음
3. mobile/에서 npx tsc --noEmit, npx jest --runInBand 실행 및 관련 테스트 추가/통과 확인
4. 진행 파일(4단계 완료) 동기화 후, 검증을 통과한 변경을 로컬 커밋(Owner: D, 문서 커밋 분리)까지 필수로 완료해줘. (push·PR·배포는 별도 지시 시 진행)
```
