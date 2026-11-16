# 홈 화면 (library-visit) 검증서 (verify.md)

- 기능: `library-visit` VISIT-1 지도 홈 · 담당: A · 대상 커밋/PR: `508b400` / #93 · 작성일: 2026-11-16
- 기준: `개발산출물/02_요구사항_정의서.md` VISIT-01·VISIT-02(핀 → 방문 페이지 입구)·LIB-02·LIB-04·NFR-01·NFR-05, 명세서 `세부/VISIT-1.md` 예외, 계약서 `../team/contracts/library-visit.md` VISIT-1 P5
- **모든 "통과"는 가짜 응답(계약 C7, `__fakes__/publicApi.ts`)과 가짜 지도로 돌린 자동 시험 결과다.** core APP-0(지도·위치·색)·LIB-0(#10) 머지 전이라 실제 서버·실제 지도 연결 시험은 하지 않았다(`미실행`).
- 웹 열: Expo 웹 dev 서버(`/preview-home`, 커밋하지 않는 임시 경로)에서 화면이 뜨는 것까지 확인. 가짜 지도가 바로 실패해 목록 모드만 실제로 그려진다. Android: 이 PC에 에뮬레이터가 없어 미실행.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-01 | AC-VISIT | 위치 허용 | 홈 열기 | 현재 위치로 주변 조회 1번, 핀 3개 | 통과 | `home-list.test.tsx` starts at current location…, `home-map.test.tsx` map centers on current location | 미실행(실제 지도 없음) | 미실행 | 대기 |
| VISIT-01 | AC-VISIT | 위치 거부 | 홈 열기 | 임시 시작 위치(기본 도서관 있으면 그 좌표) + "위치 허용하기" | 통과 | `home-list.test.tsx` location denied…, default library position… | 목록 모드로 확인(주니어 확인) | 미실행 | 대기 |
| VISIT-01 | AC-VISIT | 지도 끌어 옮김 | "이 지역에서 다시 찾기" / "현재 위치로" | 그 자리로 조회 / 현재 위치로 복귀, 저장 없음 | 통과 | `home-move.test.tsx` drag shows…, back to current… | 미실행(실제 지도 없음) | 미실행 | 대기 |
| VISIT-01 | AC-VISIT | 도서관 찾기 창 | 지역·도서관 결과 누름 | 지도 이동(핀 테두리), 방문 페이지로 안 감 | 통과 | `home-move.test.tsx` find result moves map…, find region result… | 목록 모드에서 지역 결과로 목록 바뀜(주니어 확인) | 미실행 | 대기 |
| VISIT-02 | AC-VISIT | 지도·목록 | 핀·목록 줄 누름 | 미리보기 없이 `/libraries/[libraryId]` | 통과 | `home-map.test.tsx` marker press…, `home-list.test.tsx` list row press… | 미실행(방문 페이지 경로 미머지) | 미실행 | 대기 |
| LIB-02 | AC-LIB, AC-UI | 반경 0곳 | "더 넓게 찾기" | 3km → 5km, 5에서도 0이면 버튼 숨김 | 통과 | `home-list.test.tsx` empty radius… | 미실행 | 미실행 | 대기 |
| LIB-04 | AC-RACE | 다시 찾기 응답 지연 | "현재 위치로" 누름 → 앞 응답 늦게 도착 | 늦은 응답이 화면을 덮지 않음 | 통과 | `home-move.test.tsx` late response does not overwrite newer area | 해당 없음(자동) | 해당 없음 | 대기 |
| NFR-01 | AC-UI | 불러오는 중·실패·빈·비로그인 | 각 상태 | 알약·예외 문구·로그인 요구 없음 | 통과 | `home-list.test.tsx` loading shows small pill, network error…, works signed out | 목록 모드 확인 | 미실행 | 대기 |
| NFR-05 | — | — | 소스 확인 | 좌표·보는 위치를 기기에 저장하지 않음 | 통과(저장 호출 없음) | `useHomeLibraries.ts` `currentRef`(메모리만) | 해당 없음 | 해당 없음 | 대기 |

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| #1 인터넷 끊김·서버 오류 | `network error shows reload and retries`, `find sheet error shows reload` | 같음("지금은 도서관을 불러올 수 없어요." + "↻ 새로고침", 원문 에러 안 보임) | 기기 저장 없음 | 통과 |
| #1-b 지도만 안 뜸 | `map error switches to region list`, `reload in list mode…` | 같음("지도를 불러오지 못했어요") | — | 통과 |
| #2 반경 안 0곳 | `empty radius shows widen and uses 5km` | 같음 | — | 통과 |
| #3 연타·빠른 지역 바꾸기 | `search here double press makes one request`, `late response…` | 문구 없음, 버튼 흐림 | 요청 1번만 | 통과 |
| #4 로그인 안 함 | `works signed out` | 같은 화면 | — | 통과 |
| (추가) 찾기 결과 0건 | `find sheet empty message` | 같음("‘연동’에 맞는 지역·도서관을 찾지 못했어요.") | — | 통과 |
| (추가) 31자 이상 | `query longer than 30 is trimmed` | — | 요청 `q` 30자 | 통과 |

## 3. 명세서와 달라진 점

- 홈 탭 파일 `mobile/app/(tabs)/index.tsx` 미생성(APP-0-P2 머지 전, 계약 C7).
- 지역 표 가짜를 `__fakes__/publicApi.ts`에 추가, P1 시험 `fireEvent` await 처리(단언 그대로).
- 나머지는 세부 명세서 `검토 메모`의 `[구현 중 변경]`·`[Claude가 정함]` 참조.

## 4. 남은 문제

- 미실행: 실제 지도(APP-0-P3) 위 핀·묶음·끌어 옮기기 화면, 색(theme) 적용 모습, Android 전체, 실제 #10 서버 연결.
- 버그 이슈: 없음.
