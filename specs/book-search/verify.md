# 도서 탐색 LIB-1 검증서 (verify.md)

- 기능: `book-search` LIB-1(도서 검색·상세) · 담당: C · 대상 PR: #95 · 작성일: 2026-11-16
- 기준: 02 LIB-01(AC-UI), AC-RACE, 세부 명세 `specs/book-search/세부/LIB-1.md` §3 예외, 계약서 `contracts/book-search.md` LIB-1 P5
- 모든 화면 시험은 **가짜 응답**(`__fakes__/publicApi.ts`)으로 했다. D의 실제 서버(#7·#8·#9)와 연결한 시험은 `미실행`(LIB-0 미머지).

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LIB-01 | AC-UI | 최근 2권·가짜 #9 | `/search` 진입 | 최근 본 도서 → 전국 인기 도서(기준 표시) | 시험 통과, 웹 dev 서버 `/search` 200·번들 200 | `SearchEntry.tsx:28-150`, `search.test.tsx` `entry order is recent then popular`·`entry shows national…` | 통과(가짜) | 미실행(에뮬레이터 없음) | 대기 |
| LIB-01 | AC-UI | — | 검색 → 결과 → 책 누름 | 결과 2열 ↔ 1열, 상세 열림 | 시험 통과 | `SearchScreen.tsx:195-325`, `BookDetailScreen.tsx:24-150`, `view toggle keeps same items`, `opening detail from results records recent` | 통과(가짜) | 미실행 | 대기 |
| LIB-01 | AC-UI | 21권 기록 | 기록·다시 보기·삭제 | 최대 20, 다시 본 책 맨 앞, 개별·전체 삭제, 비로그인은 `recent_books:guest` | 시험 통과 | `recentBooks.ts:34-77`, `recent books max 20…`, `recent books keys are exact`, `remove and clear…` | 통과 | 미실행 | 대기 |
| LIB-01 | AC-UI | #9 503 | 진입 → 다시 해 보기 | 인기 칸만 오류·다시 시도 | 시험 통과 | `SearchEntry.tsx:117-124`, `recommendation failure keeps recent and search` | 통과(가짜) | 미실행 | 대기 |
| (LIB-1) | AC-RACE | 검색 deferred 2개 | "소년" → "편의점", "소년" 늦게 도착 | 편의점 결과만 | 시험 통과 | `useBookSearch.ts:59`, `late response for old query is dropped`, `submit cancels pending suggestion` | 통과 | 미실행 | 대기 |
| (LIB-1) | 실제 서버 연결 | D LIB-0 서버 | 실제 #7·#8·#9 | 같은 화면 | 미실행 | D LIB-0-P2 미머지 | 미실행 | 미실행 | 대기 |

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김·답 없음 | `search failure shows retry`, `detail provider failure shows retry and does not record` | 같음("지금은 책을 찾을 수 없어요. 잠시 후 다시 해 주세요." + 다시 해 보기) | 최근 본 도서 0건 그대로 단언 | 통과 |
| 2 결과 0건·첫날 | `empty result shows message with query`, `first day hides recent section` | 같음(‘해리해리’는 찾지 못했어요… + 다시 찾기) | — | 통과 |
| 3 빠르게 두 번 | `double tap opens results once`, `double tap on result card opens detail once` | — | 요청 1번·이동 1번·기록 1번 | 통과 |
| 4 로그인 안 함 | `save while logged out shows login prompt` | 같음("로그인하면 빌릴 예정을 저장할 수 있어요" + 로그인) | 상세 그대로 | 통과 |
| 5 인기 도서 실패 | `recommendation failure keeps recent and search` | 같음("인기 도서를 불러오지 못했어요" + 다시 해 보기) | 최근 칸·검색창 그대로 | 통과 |

## 3. 명세서와 달라진 점

- 없음(명세서의 `(구현 중 변경)` 없음). 계약·공통 부품 관련 판단은 세부 명세 `검토 메모`의 `[구현 중 변경]`·`[계약 보완 필요]`에 적었다.

## 4. 남은 문제

- Android 미실행: 이 PC에 에뮬레이터가 없음.
- 실제 서버 연결 미실행: D LIB-0-P2(#7~#9) 머지 뒤 `TODO(연결): D LIB-0-P2`(가짜 세 함수)를 `lib/publicApi`로 바꾸고 다시 확인. APP-0-P1 공통 부품(theme·deviceStorage·latest·policy)은 연결 완료.
- 저장 버튼의 로그인 뒤 동작은 LIB-3(`TODO(연결): C LIB-3`).

---

# 도서 탐색 LIB-2 검증서

- 기능: `book-search` LIB-2(도서관 위치·거리·소장·대출 가능 조회) · 담당: C · 대상 PR: #137 · 작성일: 2026-11-17
- 기준: 02 LIB-02·03·04·06·07, AC-UNKNOWN, AC-RACE, 계약서 `contracts/book-search.md` LIB-2 D+C 확정판(`11f0bfaa`) C1 A1~A14·C6 V-1~V-10·P5
- 화면 시험은 core `lib/publicApi`·`lib/platform`을 목으로 바꿔 했다(실제 정보나루·서버 호출 없음). 로컬 서버·DB가 없어 실제 #10~#13 연결 화면은 `미실행`.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·시험) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LIB-02 | AC-UI | 가짜 #12 2곳(300m·1.2km) | 상세 진입 | 가까운 순 그대로, `300m`·`1.2km` | 시험 통과 | `useAvailability.ts` `loadNearby`, `availability-nearby.test.tsx` `nearby list keeps server distance order` | 통과(목) | 미실행(에뮬레이터 없음) | 대기 |
| LIB-03·06 | AC-UI | 어제·추정 / 11-14 | 상세 렌더 | `어제(추정) 기준 · 대출 가능`, `11월 14일 기준 · 대출 불가`, `09:30에 확인 · 출처 도서관 정보나루` | 시험 통과 | `availabilityText.ts` `dataDateLabel`, `data date label yesterday and assumed`, `card renders 4-row layout…` | 통과(목) | 미실행 | 대기 |
| LIB-04 | AC-UNKNOWN | `unknown`·`limit` 항목 | 렌더·도시 전체 | `알 수 없음`/한도 문구 + 다시 시도, `소장 없음`·`대출 불가` 없음, 미확인 요약 | 시험 통과 | `LibraryAvailabilityCard.tsx` `statusLine`, `unknown is never shown as none`, `city search summarizes unknown limit items…` | 통과(목) | 미실행 | 대기 |
| LIB-07 | AC-UI | `items: []` / 전부 no·unknown | 렌더 | 빈 결과 안내 + 도시 전체·나중에 저장, 카드는 아래 그대로 | 시험 통과 | `EmptyAvailability.tsx`, `empty nearby shows city retry and save`, `all no or unknown keeps cards below empty box` | 통과(목) | 미실행 | 대기 |
| (LIB-2) | AC-RACE | deferred 책 A | 책 A → 책 B, A 늦게 성공·실패 | B 화면 유지, A 요청 취소 | 시험 통과 | `useAvailability.ts` 러너·`runner.cancel`, `late response for previous book dropped`, `late error and unmount do not update state` | 통과 | 미실행 | 대기 |
| (LIB-2) | A10 | 검색 결과 | `/search` 검색 | #12·위치 요청 없음 | 시험 통과 | `search results never call availability`(실제 core 함수 목 기준) | 통과 | 미실행 | 대기 |
| (LIB-2) | 실제 서버 연결 | D 서버 #10~#13 | 상세 진입 | 같은 화면 | 미실행 | 로컬 서버·DB(Docker) 없음 | 미실행 | 미실행 | 대기 |

## 2. 계약 예외(C6) 점검

| 예외 # | 확인한 방법 | 화면 문구가 계약과 같은가 | 기록이 안 바뀌었나 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| V-1 일부 실패·상한 | `unknown is never shown as none`, `city search summarizes unknown limit items…` | 같음(`소장 알 수 없음`·`요청 한도로 확인하지 못했어요` + 다시 시도) | — | 통과 |
| V-2 0곳 | `empty nearby shows city retry and save` | 같음(A12 문구·두 버튼) | — | 통과 |
| V-3 소장 yes 0곳 | `all no or unknown keeps cards below empty box` | 같음 | 카드 목록 그대로 | 통과 |
| V-4 모두 상한 429 | `all limited shows 429 message` | 같음 | — | 통과 |
| V-5 위치 거부·시간 초과 | `location denied asks region`, `region picker filters regions and retries location` | 같음(A13 문구) | `no location stored` — 기기 저장에 좌표 없음 | 통과 |
| V-6·V-10 늦은 응답·오류·언마운트 | `late response for previous book dropped`, `late error and unmount do not update state` | — | 화면·오류 무변경, 요청 취소 | 통과 |
| V-7 `live_check` null | `live check opens external url` | 버튼 숨김 | — | 통과 |
| V-8 외부 주소 못 엶 | `live check open failure shows message` | 같음(`주소를 열지 못했어요.`) | — | 통과 |
| V-9 503·네트워크 | `nearby error shows retry` | 같음 | 다시 시도로 2번째 호출 | 통과 |

## 3. 계약과 달라진 점

- `__tests__/detail.test.tsx` 한 줄(LIB-1 "도서관 칸 없음" 단언)을 B5 순서 단언으로 바꿈 — 허용 파일 표 밖이라 PR #137 검토 메모 `[계약 보완 필요]`에 적음.

## 4. 남은 문제

- 웹 브라우저·Android 화면 확인 미실행: 로컬 서버·DB(Docker)가 없고, 이 PC에 에뮬레이터가 없음. `npx expo export --platform web`은 통과.
- 반경은 AUTH-2 전까지 3(`TODO(연결): D(AUTH-2)`), `나중에 빌릴 책으로 저장`은 LIB-3(`TODO(연결): C LIB-3`).

---

# 도서 탐색 LIB-3 검증서

- 기능: `book-search` LIB-3(빌릴 예정 저장·조회) · 담당: C · 대상 PR: #139(스택: #137 위) · 작성일: 2026-11-17
- 기준: 계약서 `contracts/book-search.md` LIB-3 D+C 확정판(`11f0bfaa`) C1 N1~N10·C5·C6 L3-#1~#8·P5, 02 AC-PLAN
- 서버 시험은 **로컬 격리 Postgres 17 컨테이너**에 마이그레이션(`0005`)을 올리고 실제 SQL로 돌렸다(원격·운영 DB 없음). 이 PC는 앱 제어 정책이 venv 실행 파일·psycopg DLL을 막아 서버 시험을 Linux 컨테이너(Python 3.12, `uv.lock` 그대로)에서 실행했다.
- 화면 시험은 `book-search/api.ts`·core `lib/publicApi`·`lib/platform`을 목으로 바꿔 했다.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·시험) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| (LIB-3) | AC-PLAN | 같은 사람·책·도서관 | #17 두 번 + 동시 4번 | `201` 뒤 `200`, 같은 `id`, 활성 행 1 | 시험 통과 | `loan_plans.py` `INSERT … ON CONFLICT … DO NOTHING`, `test_save_same_plan_twice_one_row` | 해당 없음(서버) | 해당 없음 | 해당 없음 |
| (LIB-3) | N2 | 도서관 101·102 | #17 | 행 2 / 해제 뒤 다시 저장은 새 `id` | 시험 통과 | `test_same_book_other_library_is_separate`, `test_release_then_save_again_creates_new` | — | — | — |
| (LIB-3) | N4·L3-#6·#7 | 내 것·남의 것·`converted` | #18 | 두 번째도 `200 released`, 남의 것=없는 것 `404`, `converted` `409` | 시험 통과 | `release_tx`, `test_release_twice_is_200`, `test_release_other_users_plan_is_404_unchanged`, `test_release_converted_is_409` | — | — | — |
| (LIB-3) | N5·H-ARCH-10 | 같은 `created_at` 5개 | `limit=2` 끝까지 | 5개 한 번씩, 최근 저장 위 | 시험 통과 | `test_list_cursor_no_dup_on_ties`, `test_list_newest_first`, `test_list_only_mine` | — | — | — |
| (LIB-3) | N1·N7·N8 | 로그인 + 주변 2곳 | 저장 → `선택` 두 번 | 비로그인은 로그인 안내·창 없음, 로그인은 창, 요청 1번, 메모 안내, `예약`·`확보` 0 | 시험 통과 | `SavePlanSheet.tsx`, `plans.test.tsx` `save sheet opens only when signed in`, `save plan double tap sends once…` | 통과(목) | 미실행(에뮬레이터 없음) | 대기 |
| (LIB-3) | N3·N7 | 소장 yes 0곳 / 0곳 | `나중에 빌릴 책으로 저장` | 지금 찾아본 도서관이 후보 / 없으면 안내 | 시험 통과 | `BookDetailScreen.tsx` `onSaveForLater`, `empty availability save button opens sheet`, `sheet without looked-up libraries…` | 통과(목) | 미실행 | 대기 |
| (LIB-3) | N9 | 비로그인 / 로그인 + 2개 | `/loans` | 로그인 안내(#16 0번) / `내 대출` 아래 `빌릴 예정` 2건 | 시험 통과 | `app/(tabs)/loans.tsx`, `loans tab shows loans slot above planned list…` | 통과(목) | 미실행 | 대기 |
| (LIB-3) | N10 | 2개 / 0개 / 실패 | `빼기`(지연 중 재클릭) / 진입 | 확인창 없이 1번, 끝나면 제거 / 빈 안내 + `책 찾아보기` / 다시 시도·더 보기 | 시험 통과 | `LoanPlansSection.tsx`, `release button removes item without confirm dialog`, `empty planned list guides to search`, `list failure shows retry and more button…` | 통과(목) | 미실행 | 대기 |
| (LIB-3) | 실제 서버 연결 화면 | 로컬 서버 + 로그인 | 상세 저장 → `/loans` | 같은 화면 | 미실행 | 로그인(Supabase OAuth)을 이 PC에서 띄울 수 없음. 서버 동작은 실제 DB 시험으로 확인 | 미실행 | 미실행 | 대기 |

## 2. 계약 예외(C6) 점검

| 예외 # | 확인한 방법 | 화면 문구가 계약과 같은가 | 기록이 안 바뀌었나 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| L3-#1 로그인 안 함 | `test_requires_login`, `save 401 closes sheet and shows login prompt`, `loans tab … guards signed out` | 같음(S-9 / N9 문구) | 행 0 | 통과 |
| L3-#2 형식 | `test_save_validation_is_422_no_row`(7가지), `test_list_validation_is_422`, `test_invalid_cursor_is_422_detail_cursor`, `test_release_invalid_plan_id_is_422` | — | 행 0, `detail` = 필드 | 통과 |
| L3-#3 다시 저장·연타 | `test_save_same_plan_twice_one_row`, `save plan double tap…` | 같음(N8) | 행 1 | 통과 |
| L3-#4 없는 도서관·책 | `test_unknown_library_is_404_detail_library_id`, `test_unknown_book_is_404_detail_isbn13` | 창 안 `저장하지 못했어요…` | 행 0, `detail` 보강 | 통과 |
| L3-#5 제공자 실패 | `test_provider_failure_passes_through_no_row`, `save failure keeps sheet open for retry` | 같음(창 유지·다시 시도) | 행 0 | 통과 |
| L3-#6 남의 것·없는 것 해제 | `test_release_other_users_plan_is_404_unchanged` | 목록 다시 읽기 | B 행 `planned` 그대로 | 통과 |
| L3-#7 `converted` 해제 | `test_release_converted_is_409`, `release failure keeps item and shows message` | 같음 | 행 그대로, 카드 유지 | 통과 |
| L3-#8 탈퇴 경합 | `test_save_while_withdrawing_is_403_no_row`(잠금 대기 관측) | — | 행 0 | 통과 |

## 3. 계약과 달라진 점

- 허용 파일 표 밖 시험 2곳: `__tests__/detail.test.tsx`(LIB-1 "준비 중이에요" 단언 → 창 열림), `src/__tests__/routes.test.tsx`(대출·반납 스텁 "준비 중이에요" → N9 로그인 안내, 빌릴 예정 구역 목). PR #139 검토 메모 `[계약 보완 필요]`.
- `EmptyAvailability.tsx`는 고치지 않음 — 이미 `onSaveForLater` 속성을 받아, 연결은 `BookDetailScreen.tsx`에서만 함.

## 4. 남은 문제

- Android 미실행(에뮬레이터 없음), 웹·실제 서버 화면 미실행(로그인 필요). `npx expo export --platform web` 통과.
- `내 대출` 구역은 `TODO(연결): C LOAN-1-P2` 안내 자리.
