# YES24 스테디셀러·인기도서 큐레이션 및 구매 연동 진행 (M2 이후 후속)

- **상태:** **4단계(모바일 타입·출처 표기·검증) 완료 — 5단계(Y-6 도서 상세 시안·배치 개편) 대기**. 운영 반영은 별도 지시 시 진행한다.
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
| **5. 도서 상세 시안·배치 개편 (Y-6, 후속)** | 4단계 선행(1단계 시안 패스 → 2026-11-24 D 결정으로 YES24 연동 완료 후 이연). `BookDetailScreen.tsx` 배치 개편 및 YES24 상품 상세 연결 버튼 위치 HTML 시안 검토·반영 | `개발산출물/시안/` HTML 시안 검토 → `BookDetailScreen.tsx` 반영 | 사용자 시안 확정 및 도서 상세 YES24 연결 반영 | **대기 (4단계 후 이연)** |

---

## 겪은 문제 / 유의사항

- **일정 분리:** 2026-11-24 시점은 M3 기능 동결 및 11/26(목) 최종 발표 직전이므로 프로덕션 코드 변경을 보류하고 설계·명세만 선행 확정했다.
- **기존 테이블 영향 최소화:** `provider_daily_usage`에는 이미 `'yes24'`가 등록되어 있으나(`0002_public_reference.py:203`), `popular_books_cache`는 정보나루 전용 유니크 제약에 묶여 있으므로 신규 `curated_books_cache`로 분리 설계했다.
- **도서관 미소장 괴리 방지:** 신간 베스트셀러보다 **스테디셀러**를 1순위로 채택하고, 방문 책장(`#31`)에는 기존 `theme_holdings.py` 소장 필터링을 거쳐 "이 도서관에 실제 소장된 스테디셀러"만 노출하는 전략을 채택했다.
- **4단계 출처 표기 검증:** `#9`의 `basis_label`로 추천 제공자를 구분한다. YES24 스테디셀러와 오래된 YES24 베스트셀러 캐시는 표기하고, 정보나루 전국 폴백 및 도서관별 인기 대출은 표기하지 않는다. 처음 추가한 화면 테스트 두 건은 구현 전 표기 누락으로 실패했다. 모바일 전체 회귀 중 색상 검사가 다른 테스트의 색상 기대값까지 검사하던 문제를 확인해 `__tests__`를 제외하고 화면 소스 검사는 유지했다.
- **운영·실기기 확인:** 이번 단계에서 서버 전체 회귀를 로컬로 재실행하지 않았다. 실제 서버 연결, 웹·Android·iOS 화면, 운영 환경변수(`YES24_API_KEY`) 및 초기 `sync-yes24-curated` 적재는 미확인이다.

---

## 다음 세션 시작 지시

> **5단계(Y-6 도서 상세 시안·배치 개편)는 별도 착수 지시 후 진행한다.**

```text
시니어 D로 YES24 5단계(Y-6)를 진행해줘.
AGENTS.md 시작 규칙에 따라 문서를 읽고 브랜치·HEAD·status·diff 및 PR #302 상태를 확인해. 기존 변경은 보존해.
이 진행 파일, 설계명세 §1.3·§5.5·§6 Y-6, ../team/contracts/core.md LIB-0 K23·C3를 읽어.
도서 상세 배치와 YES24 연결 버튼 위치를 HTML 시안으로 검토하고, 사용자 확정 후 BookDetailScreen.tsx에 반영해.
승인 범위의 변경은 검증 후 Owner: D 로컬 커밋까지 완료해. 문서는 별도 커밋으로 남겨.
push·PR·머지·배포는 별도 지시 시 진행해.
```
