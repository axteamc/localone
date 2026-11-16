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
| (LIB-1) | 실제 서버 연결 | D LIB-0 서버 | 실제 #7·#8·#9 | 같은 화면 | 미실행 | D LIB-0·APP-0 미머지 | 미실행 | 미실행 | 대기 |

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
- 실제 서버 연결 미실행: D LIB-0(#7~#9)·APP-0(theme·publicApi 등) 머지 뒤 `TODO(연결): D`를 바꾸고 다시 확인.
- 저장 버튼의 로그인 뒤 동작은 LIB-3(`TODO(연결): C LIB-3`).
