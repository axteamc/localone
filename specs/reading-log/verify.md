# 독서 기록 검증서 (verify.md)

- 기능: `reading-log` · 담당: A · 대상 커밋/PR: READ-1 #251 (`353bb00` P1 서버, `f8c4cd9` P2 앱) · 작성일: 2026-11-23
- 기준: 요구사항 READ-01 · AC-READ (`개발산출물/02_요구사항_정의서.md:56,170`), 명세서 `specs/reading-log/세부/READ-1.md` 3절 예외, 계약서 `../team/contracts/reading-log.md` READ-1 P5
- 실행하지 않은 항목은 `미실행`으로 적는다. **서버 시험**은 격리 로컬 DB(postgres 17)에 실제 HTTP로 돌렸다. **웹 화면**은 Metro 웹 + 브라우저(Edge, Playwright)에서 서버 답을 가짜 데이터로 대신해 확인했다(로그인 자동화 불가). 둘을 구분해 적는다.

## 1. 수용 기준 전수 점검 (READ-1 범위)

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| READ-01 | AC-READ 본인 기록만 | A 기록, B 토큰 | B가 #41·#42·#44·#45 | B 목록 0, 나머지 404, A 기록 그대로 | 서버 시험 통과 | `server/tests/test_reading_logs.py:101` | 서버 통과 | 미실행 | 대기 |
| READ-01 | AC-READ 도서관 없는 기록 보정 안 함 | 도서관 없는 기록 + 101 기록 | 전체 / `library_id=101` | 없는 기록 `library: null`, 101 거르기에 안 나옴, 전체엔 나옴 | 서버 시험 통과 | `test_reading_logs.py:147` | 서버 통과 | 미실행 | 대기 |
| READ-01 | AC-READ 도서관 없이 저장(앱) | 쓰기 화면 | 도서관 줄 → "도서관 없이 (집·카페)" → 저장 | 요청 `library_id: null` | 앱 시험 통과 / 웹 화면에서 시트 확인 | `mobile/src/features/reading-log/__tests__/reading-log.test.tsx` `library sheet allows no library`, 캡처 `390_9_library_sheet` | 통과(가짜 응답) | 미실행 | 대기 |
| READ-01 | AC-PUBLISH "기록 원본은 비공개 유지" | — | 기록 쓰기 | 공개 경로 없음(공개는 LOCAL-3 게시물로만) | 응답에 `user_id` 없음, 공개 목록 경로 없음 | `server/app/routers/reading_logs.py:59-75` | 서버 통과 | 미실행 | 대기 |
| READ-01 | R1-4 대출 연결은 고를 때만 | 같은 책 대출 2개(11-03·10-01) | 책 고름 → "아니요" / "연결하기" | 누르기 전 연결 없음, 카드에 11월 3일 대출, 연결하면 그 도서관 채움 | 앱 시험 통과 / 웹 화면 "정독도서관에서 11월 3일에 빌린 책이에요" | `reading-log.test.tsx` `asks before linking loan`, 캡처 `390_8_ask_loan` | 통과(가짜 응답) | 미실행 | 대기 |
| READ-01 | R1-6 탭 두 번째 자리 | — | 탭 렌더 | 홈 → 독서 기록 → 대출·반납 → 내 정보 | 앱 시험 통과 / 웹 탭 띠 확인 | `mobile/src/__tests__/routes.test.tsx` `reading tab is second`, 캡처 `390_1_shelf` | 통과 | 미실행 | 대기 |
| READ-01 | R1-7 지워도 게시물 남음 | 기록 → 게시물(`posts.reading_log_id` 임시 칸) | #44 | 204, 게시물 `published` 그대로 · `reading_log_id` NULL | 서버 시험 통과 | `test_reading_logs.py:192` | 서버 통과 | — | — |

- AC-READ의 "전체·도서관 필터 화면"과 "빈 통계 0"은 READ-2 범위다(이 PR은 서버 `library_id` 거르기까지만).

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김 | 앱 시험 `failed save keeps typed values`·`retry after failed save reuses request id`, 책장 `failed shelf load offers retry` | 같음: "저장하지 못했어요" / "인터넷 연결을 확인해 주세요. 쓴 내용은 그대로 있어요." [다시 저장하기] | 쓴 감상·문장·책 그대로, 다시 저장도 같은 요청 id → 서버 `create is idempotent` | 통과 |
| 2 빈 책장 | 앱 시험 `empty shelf shows first book message` + 웹 캡처 `390_empty_1_shelf` | 같음: "아직 꽂힌 책이 없어요." / "오른쪽 아래 +를 눌러 첫 책을 꽂아 보세요.", + 그대로 | — | 통과(통계 0·0·0은 READ-2) |
| 3 연타 | 앱 `double save creates one log`(요청 1회) + 서버 `create is idempotent by client request id`(행 1) | "저장했어요" 한 번 | 행 1 | 통과 |
| 4 비로그인 | 앱 `signed out tab shows login prompt without api call` | 같음: "로그인하면 나만 보는 독서 기록을 남길 수 있어요." [로그인하기] | API 0회 | 통과 |
| 4 남의 기록 | 서버 `owner only with same 404` + 앱 `missing or others log shows not found` | 같음: "찾을 수 없는 기록이에요" | A 기록 그대로, 수정·지우기 없음 | 통과 |
| E6 길이 | 서버 `note and quote length limits are 422`·`blank note is stored as null`, 앱 `too long note is blocked` | "감상은 2000자까지 쓸 수 있어요" | 행 0 | 통과 |
| E8 지우기 확인 | 앱 `delete asks first and removes from shelf` | "이 기록을 지울까요?" / "지우면 되돌릴 수 없어요." (+ "올린 게시물은 그대로 남아요.") | 취소면 지우기 0회 | 통과 |
| E10 나가기 | 앱 `leaving dirty editor asks before discarding`·`leaving empty editor closes right away` | "쓰던 기록을 버릴까요?" [계속 쓰기] [버리기] | 계속 쓰기면 쓴 내용 그대로 | 통과 |
| 미래 날짜 | 서버 `future read date is rejected`(서울 오늘은 됨) | — | 행 0, 고치기도 무변경 | 통과 |
| 계정 전환 | 앱 `sign out clears cached logs`·`other account cache is never shown` | — | 로그아웃 뒤 책장 캐시 비움, 다른 계정에 옛 기록 0 | 통과 |

## 3. 명세서와 달라진 점

- #44 지우기의 `posts.reading_log_id` 끊기는 LOCAL-3 마이그레이션 전이라 칸이 있을 때만 한다(`TODO(연결)`, `server/app/routers/reading_logs.py:267-288`). 동작(게시물 남김)은 명세와 같다.
- 수정 화면은 새 주소 없이 기록 화면 안에서 쓰기 화면을 수정 모드로 바꿔 보여 준다(계약 파일 목록 유지). 모양·문구는 명세대로.

## 4. 남은 문제

- Android 미실행: 이 PC에 에뮬레이터(`localone35`)는 있지만, 화면이 로그인 뒤에만 보여 가짜 로그인을 넣은 임시 빌드 없이는 확인할 수 없다. CI `Android 빌드 점검`으로 빌드만 확인(PR 본문 기술 메모).
- 실제 서버 + 실제 로그인으로 화면을 누르는 확인은 미실행(Google 로그인 자동화 불가). 웹 화면은 가짜 응답으로 확인.
- iOS: D 확인 대기(`needs-ios`).
- 통계 한 줄·도서관별 보기·꾹 눌러 자리 바꾸기·프리셋은 READ-2.

---

# READ-2 검증 (전체·도서관별 보기·기초 통계·홈 "내 최근 독서 기록")

- 대상: PR #287 (`42d9eab` P1, `bb25874` P2) · 작성일: 2026-11-23
- 기준: READ-02·VISIT-06(내 최근 독서 기록)·AC-READ (`개발산출물/02_요구사항_정의서.md:49,57,170`), 명세서 `specs/reading-log/세부/READ-2.md` 3절, 계약서 `../team/contracts/reading-log.md` READ-2 P5(발행 `1e4e7a5`)
- **서버 시험**은 격리 로컬 DB(postgres 17, 5435)에 실제 HTTP. **웹 화면**은 Metro 웹 + Edge(Playwright)에서 서버 답을 가짜 데이터로 대신함(로컬 로그인 불가). 둘을 구분해 적는다.

## 1. 수용 기준 전수 점검 (READ-2 범위)

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| READ-02 | AC-READ 본인 기록만(통계) | A 3개·B 5개 | A·B #46 | A 숫자에 B 없음, B는 0 | 서버 시험 통과 | `server/tests/test_reading_stats.py` `test_stats_count_only_own_logs_in_seoul_calendar` | 서버 통과 | 미실행 | 대기 |
| READ-02 | AC-READ 빈 통계 0 | 기록 0 | #46 / 탭 | `0·0·0`, `libraries: []`, "전체 0 · 올해 0 · 이번 달 0" | 서버·앱 시험 통과, 웹 캡처 | `test_stats_are_zero_without_logs`, 앱 `zero stats and empty library view`, 캡처 `r2-empty-390-libs` | 통과(가짜 응답) | 미실행 | 대기 |
| READ-02 | AC-READ 도서관 필터·도서관 없는 기록 보정 안 함 | 도서관 없는 기록 2 + 103 기록 | #46 / "전체 ⇄" | `libraries`에 103만, `total` 3, 도서관 줄에 "흰"(도서관 없음) 없음 | 서버·앱 시험 통과 | `test_library_view_lists_only_libraries_with_logs`, 앱 `library view rows load nine per library with library color` | 통과(가짜 응답) | 미실행 | 대기 |
| READ-02 | 서울 날짜(올해·이번 달) | 서버 오늘 2027-01-01 KST, 01-01 00:30 KST(UTC 12-31) 기록 | #46 | 올해·이번 달 1 | 서버 시험 통과 | `test_stats_count_only_own_logs_in_seoul_calendar` | 서버 통과 | — | — |
| READ-02 | 내 발자취 = 도서관별 보기(별도 탭 없음), R2-O3 순서 | 101(5)·102(2, 최근)·103(1)·104(5) | "전체 ⇄" | 102(날짜) → 101 → 104 → 103 | 서버·앱 시험 통과, 웹 캡처 | `test_library_list_pins_only_the_latest_library_before_count_order`, `test_latest_library_handles_seoul_fallback_and_same_day_ties`, 캡처 `r2-normal-390-libs` | 통과(가짜 응답) | 미실행 | 대기 |
| READ-02 | 이름표 › 한 도서관 책장 | 도서관 2곳 | 101 › → ‹ → 102 › | 머리 "서대문도서관 · 2권", 102 책만 | 앱 시험 통과, 웹 캡처 | `library tag opens that library shelf and late response is dropped`, 캡처 `r2-normal-390-one` | 통과(가짜 응답) | 미실행 | 대기 |
| VISIT-06 | 홈 "내 최근 독서 기록"(로그인·기록 있을 때만) | 기록 7 / 0 / 비로그인 / 실패 | 홈 | 인기 도서 아래 5권 / 칸 없음 | 앱 시험 통과, 웹 캡처 | `recent-reading.test.tsx` 6건, 캡처 `r2-home-390` | 통과(가짜 응답) | 미실행 | 대기 |
| VISIT-06 | 기존 칸 순서·동작 그대로(R2-6) | — | 홈 | 인기 도서 → (내 최근 독서 기록) → 소식, VISIT-1b 시험 그대로 통과 | 앱 시험 통과 | `home keeps existing sections order`, `home-sheet.test.tsx`·`home-news.test.tsx` 통과 | 통과 | 미실행 | 대기 |
| — | 비로그인 #46 | 토큰 없음 | #46 | 401, 기록 그대로 | 서버 시험 통과 | `test_stats_require_auth` | 서버 통과 | — | — |

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김(숫자) | 앱 `stats failure keeps shelf and retries stats only` + 웹 캡처 `r2-statsfail-390-*` | 같음: "숫자를 불러오지 못했어요" + "↻ 새로고침", 책장 그대로 | 읽기만 | 통과 |
| 1 끊김(도서관 한 줄) | 앱 `one library row failure keeps other rows` + 웹 캡처 `r2-rowfail-390-libs` | 같음: "책을 불러오지 못했어요" + "↻ 새로고침", 다른 줄 그대로 | 읽기만 | 통과 |
| 1 끊김(홈 칸) | 앱 `home row hidden when signed out or empty`(실패) | 칸 없음, 인기 도서·소식 그대로 | — | 통과 |
| 2 아무것도 없음 | 앱 `zero stats and empty library view`, 홈 0개 | 같음: "도서관에서 읽은 기록이 아직 없어요." / "기록을 쓸 때 도서관을 고르면 여기 꽂혀요.", 홈 칸 없음 | — | 통과 |
| 3 빠르게 두 번 | 앱 `toggle twice quickly shows last view only`, `filter switch shows last library only`, 홈 연타 `home row opens log detail` | 안내 없음, 마지막 보기만, 이동 1번 | 줄 요청 abort | 통과 |
| 4 비로그인·남의 것 | 앱 `sign out during stats load clears view`, `account switch during stats load never shows the previous account numbers`, 홈 `home row drops late response after account switch` | 탭은 READ-1 로그인 안내, 홈 칸 없음 | 앞 계정 숫자·표지 안 보임 | 통과 |

## 3. 명세서와 달라진 점

- `useReadingLogs` 반환에 `statsFailed`·`moreLoading` 추가(계약 칸 유지) — 숫자 실패 표시용.
- 홈 칸은 `library-visit/deps.ts`에서 `fetchReadingLogs`를 다시 내보내 씀(홈 시험 구조).
- 결정 2(⚙ 순서 메뉴·자리 옮기기)는 별도 계약 승인 대기라 그리지 않음 — 명세서 결정 2 "발행 범위"와 같음.

## 4. 남은 문제

- Android 화면: 미실행 — 화면이 로그인 뒤에만 보여 로컬 확인 불가. CI Android 빌드 점검으로 빌드만 확인.
- 로컬 전체 jest의 `library-visit/__tests__/home-list.test.tsx` "no hardcoded colors" 실패(`home-facade.test.tsx` 색 코드, 이 브랜치 무관·main 동일).
