# YES24 스테디셀러·인기도서 큐레이션 및 구매 연동 진행 (M2 이후 후속)

- **상태:** **0단계(설계·명세화) 완료 — 착수 대기 (`LOCAL-3`, `LOCAL-4`, `MY-3` 완료 후 진행)**
- **목표:** 도서관 정보나루 인기대출의 아동·학습만화 편중을 보완하기 위해 YES24 Open API(스테디셀러·종합 베스트셀러·Goods API)를 `ProviderEngine`에 편입한다. 전국 큐레이션(`#9`·홈 하단 창)과 서가 테마 소장 필터링(`#31` + `theme_holdings`) 후보 소싱, 도서 구매 직링크(`#15`)를 연동한다.
- **착수 선행 조건 (예정 일정):** 현재 진행 중인 M2 작업 **`LOCAL-3`, `LOCAL-4`, `MY-3` 완료 이후** 착수한다(11/26 최종 발표 범위 밖 — 발표 전에는 코드 수정 없이 필요 시 YES24 개발자센터 EXCEL 다운로드 + 기존 `ops` 서가 테마 등록만 선택 활용).
- **근거 문서:**
  - 설계·명세 초안: [YES24_큐레이션_및_구매연동_설계명세.md](명세/YES24_큐레이션_및_구매연동_설계명세.md)
  - 기존 데이터 정의: [03_데이터_조사_정의서.md](03_데이터_조사_정의서.md) §2 D5, [모호점_해소_기록.md](모호점_해소_기록.md) Q-40·Q-41
  - 서가 테마 소장 필터링: [진행_서가테마_소장필터링.md](진행_서가테마_소장필터링.md), [M2-0_서가테마_계약개정_초안.md](명세/M2-0_서가테마_계약개정_초안.md)
- **기준 SHA (설계 시점 2026-11-24):** 코드 `2ccc0db951dcba4e0bc354946984a8adc619cd48`, team `64b9d9e8705c2ced9aa54a33fa98f4beeeb811a7`

---

## 단계

| 단계 | 선행과 작업 | 실행 명령 / 산출물 | 확인(완료) 기준 | 상태 |
| --- | --- | --- | --- | :---: |
| **0. 설계·명세화** | YES24 스테디셀러 응답 JSON(`isbn13`·`cover`·`link` 포함) 기준 Pre-flight 5대 관문, DB 스키마, 엔진 흐름, API 호환, 검증표 작성 | [YES24_큐레이션_및_구매연동_설계명세.md](명세/YES24_큐레이션_및_구매연동_설계명세.md), 본 진행 파일 | Pre-flight 5대 관문 `file:line` 증거 기록, 전 필드·오류·검증표 작성 완료 | **완료 (2026-11-24)** |
| **1. 키 발급·실측·계약 확정** | 선행 완료(PR #296·#297·#300 머지, main `9f05e20`). 실측·명세 §6 확정·계약 개정안 작성 완료. **남은 것: D의 Y-4(A/B) 확정, `03`/`05`/`06`/`../team/contracts/core.md` 실제 반영 및 계약 발행 SHA** | [YES24_1단계_실측_및_계약개정안.md](명세/YES24_1단계_실측_및_계약개정안.md) | Y-1~Y-5 전부 해소, 계약 발행 SHA 확정, 단일 head 확인(`0025_reports_constraints` → 신규 `0026_yes24_curated`) | **진행 중 (Y-4 D 확인 대기, 2026-11-24)** |
| **2. DB·엔진·CLI 구현** | 1단계 선행. 새 Alembic 리비전(`books_source_check` `'yes24'` 추가, `curated_books_cache`·`book_purchase_links` 생성·RLS), `settings.py`·`policy.py`·`Yes24Client`·`ProviderEngine.curated_books`·`sync-yes24-curated` CLI 구현 | `server/`: `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`, `uv run pytest -W error tests/test_lib_engine.py tests/test_yes24_curated.py` | 마이그레이션 왕복·RLS(`relrowsecurity=true`, 정책 0개)·성인물/URL/한도/빈 응답 보호 테스트 및 핵심 가드 변이 4곳 실패 확인 | **대기** |
| **3. API(`#9`/`#15`)·서가 테마 연결** | 2단계 선행. `#9 /books/recommendations` YES24 스테디셀러 연결·정보나루 폴백, `#15 /books/{isbn13}/purchase-link` 직링크(`kind="product"`)·검색 폴백 구현, `sync-yes24-curated --print-isbns` → `ops/shelf-themes` + `sync-theme-holdings` 연동 확인 | `server/`: `uv run pytest -W error tests/test_books.py tests/test_looks_shelf.py tests/test_yes24_curated.py` | `#9` 하위 호환·폴백, `#15` 직링크/폴백, 기존 도서관별 `#31` 회귀 0건 통과 | **대기** |
| **4. 모바일 타입·출처 표기·검증·운영 반영** | 3단계 선행. `mobile/src/lib/publicApi.ts` 타입(`Book.source`, `PurchaseLink.kind`) 확장, 약관상 출처 표기 반영(필요 시), PR·CI 통과 및 운영 환경변수(`YES24_API_KEY`) 등록·초기 `sync-yes24-curated` 적재 | `mobile/`: `npx tsc --noEmit && npx jest --runInBand`, `gh pr checks --watch` | 앱 타입 검사·Jest 통과, CI 전체 녹색, 운영 초기 캐시 적재 및 화면 노출 확인 | **대기** |

---

## 겪은 문제 / 유의사항

- **일정 분리:** 2026-11-24 시점은 M3 기능 동결 및 11/26(목) 최종 발표 직전이므로 프로덕션 코드 변경을 보류하고 설계·명세만 선행 확정했다.
- **기존 테이블 영향 최소화:** `provider_daily_usage`에는 이미 `'yes24'`가 등록되어 있으나(`0002_public_reference.py:203`), `popular_books_cache`는 정보나루 전용 유니크 제약에 묶여 있으므로 신규 `curated_books_cache`로 분리 설계했다.
- **도서관 미소장 괴리 방지:** 신간 베스트셀러보다 **스테디셀러**를 1순위로 채택하고, 방문 책장(`#31`)에는 기존 `theme_holdings.py` 소장 필터링을 거쳐 "이 도서관에 실제 소장된 스테디셀러"만 노출하는 전략을 채택했다.

---

## 다음 세션 시작 지시

> **1단계 잔여(Y-4 확정·계약 반영) 이어서 진행.** 키는 `.env`의 `YES24_API_KEY` 참조(문서·로그에 값 기록 금지).
> **권장 Effort:** `중간` (결정 반영·문서 갱신) — 이후 2~4단계 구현은 `중간`

```text
YES24 큐레이션 1단계 잔여를 진행해줘. 먼저 아래를 읽어:
- 개발산출물/진행_YES24_큐레이션_연동.md
- 개발산출물/명세/YES24_1단계_실측_및_계약개정안.md
Y-4는 [A / B] 안으로 확정. 이 결정을 반영해 03/05/06 및 ../team/contracts/core.md를 개정하고 계약 발행 SHA를 기록해줘.
(head는 0025_reports_constraints 기준이며 착수 시 alembic heads 재확인)
```
