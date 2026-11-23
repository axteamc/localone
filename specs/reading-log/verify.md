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
