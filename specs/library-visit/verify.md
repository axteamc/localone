# 홈 화면 (library-visit) 검증서 (verify.md)

- 기능: `library-visit` VISIT-1 지도 홈 · 담당: A · 대상 커밋/PR: `508b400` / #93 · 작성일: 2026-11-16 · Android 열 갱신: 2026-11-17
- 기준: `개발산출물/02_요구사항_정의서.md` VISIT-01·VISIT-02(핀 → 방문 페이지 입구)·LIB-02·LIB-04·NFR-01·NFR-05, 명세서 `세부/VISIT-1.md` 예외, 계약서 `../team/contracts/library-visit.md` VISIT-1 P5
- **모든 "통과"는 가짜 응답(계약 C7, `__fakes__/publicApi.ts`)과 가짜 지도로 돌린 자동 시험 결과다.** core APP-0(지도·위치·색)·LIB-0(#10) 머지 전이라 실제 서버·실제 지도 연결 시험은 하지 않았다(`미실행`).
- 웹 열: Expo 웹 dev 서버(`/preview-home`, 커밋하지 않는 임시 경로)에서 화면이 뜨는 것까지 확인. 가짜 지도가 바로 실패해 목록 모드만 실제로 그려진다.
- **Android 열 (2026-11-17, main `ebcb70b`, PR #122 머지 뒤):** Claude가 Android 에뮬레이터(Pixel 7 · Android 15 · x86_64, Expo Go SDK 58)에서 실제 홈 탭 `/`(하단 탭 포함)을 열고 `adb` 터치·끌기·화면 캡처로 확인했다. 두 가지 설정으로 돌렸다.
  - **가짜 응답 + 회색 지도:** 커밋하지 않는 임시 변경으로 `deps.ts`를 C7 가짜(`__fakes__/publicApi.ts`)로 바꾸고, 카카오 지도 대신 핀만 놓는 회색 판을 끼웠다. 핀·끌어 옮기기·하단 창을 보는 용도다. 실제 카카오 지도 모습은 아니다.
  - **실제 연결(키·서버 없음):** 임시 변경 없이 그대로 열었다. 이 PC에 `EXPO_PUBLIC_KAKAO_JS_KEY`와 동네한권 서버가 없어서, 지도 실패 → 목록 모드, 서버 실패 → 예외 #1 화면이 실제로 나오는지만 확인했다.
  - 한글 입력은 `adb`로 넣을 수 없어 찾기 창 검색은 영문 글자로만 확인했다.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-01 | AC-VISIT | 위치 허용 | 홈 열기 | 현재 위치로 주변 조회 1번, 핀 3개 | 통과 | `home-list.test.tsx` starts at current location…, `home-map.test.tsx` map centers on current location | 미실행(실제 지도 없음) | 통과(가짜·회색 지도: 핀 3개 정독·종로·남산, 휴관 종로는 회색) | 대기 |
| VISIT-01 | AC-VISIT | 위치 거부 | 홈 열기 | 임시 시작 위치(기본 도서관 있으면 그 좌표) + "위치 허용하기" | 통과 | `home-list.test.tsx` location denied…, default library position… | 목록 모드로 확인(주니어 확인) | 통과(실제 연결: 위치 권한 창에서 거부 → 화면 아래 "위치 허용하기") | 대기 |
| VISIT-01 | AC-VISIT | 지도 끌어 옮김 | "이 지역에서 다시 찾기" / "현재 위치로" | 그 자리로 조회 / 현재 위치로 복귀, 저장 없음 | 통과 | `home-move.test.tsx` drag shows…, back to current… | 미실행(실제 지도 없음) | 일부 통과(회색 지도를 끌면 위 "이 지역에서 다시 찾기"·창 위 "현재 위치로"가 뜨고, "현재 위치로"를 누르면 처음 핀 자리로 돌아오며 두 버튼이 사라짐). "이 지역에서 다시 찾기" 누름은 미실행 | 대기 |
| VISIT-01 | AC-VISIT | 도서관 찾기 창 | 지역·도서관 결과 누름 | 지도 이동(핀 테두리), 방문 페이지로 안 감 | 통과 | `home-move.test.tsx` find result moves map…, find region result… | 목록 모드에서 지역 결과로 목록 바뀜(주니어 확인) | 일부 통과(창이 맨 위 검색창 자리를 덮고 키보드가 바로 올라옴, 빈 칸 안내 "지역이나 도서관 이름을 적어 주세요", 결과 0건 문구 확인). 결과 누름은 한글 입력이 안 돼 미실행 | 대기 |
| VISIT-02 | AC-VISIT | 지도·목록 | 핀·목록 줄 누름 | 미리보기 없이 `/libraries/[libraryId]` | 통과 | `home-map.test.tsx` marker press…, `home-list.test.tsx` list row press… | 미실행(방문 페이지 경로 미머지) | 핀 통과(정독 핀 → 방문 페이지 자리 `libraryId: 101 · distanceM: 420`, 미리보기 없음). 목록 줄 누름은 미실행 | 대기 |
| LIB-02 | AC-LIB, AC-UI | 반경 0곳 | "더 넓게 찾기" | 3km → 5km, 5에서도 0이면 버튼 숨김 | 통과 | `home-list.test.tsx` empty radius… | 미실행 | 미실행(가짜 응답에 0곳 경우 없음) | 대기 |
| LIB-04 | AC-RACE | 다시 찾기 응답 지연 | "현재 위치로" 누름 → 앞 응답 늦게 도착 | 늦은 응답이 화면을 덮지 않음 | 통과 | `home-move.test.tsx` late response does not overwrite newer area | 해당 없음(자동) | 해당 없음 | 대기 |
| NFR-01 | AC-UI | 불러오는 중·실패·빈·비로그인 | 각 상태 | 알약·예외 문구·로그인 요구 없음 | 통과 | `home-list.test.tsx` loading shows small pill, network error…, works signed out, list mode loading pill sits below map failed row(`:146`) | 목록 모드 확인 | 통과(실제 연결: 서버 없음 → "지금은 도서관을 불러올 수 없어요." + "↻ 새로고침", 원문 에러 없음. 지도 키 없음 → "지도를 불러오지 못했어요" 줄 + 목록. 비로그인. **알약이 맨 위 줄과 겹치던 것을 고친 뒤 다시 확인**, 4절) | 대기 |
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

- 미실행: 실제 카카오 지도(키 없음) 위 핀·묶음·끌어 옮기기 화면, 실제 #10 서버 연결. Android에서 "이 지역에서 다시 찾기" 누름·찾기 결과 누름·목록 줄 누름·"더 넓게 찾기".
- **Android에서 찾아 고친 것:** 목록 모드에서 "도서관을 찾는 중…" 알약이 맨 위 "지도를 불러오지 못했어요 · 새로고침" 줄과 겹쳤다. 알약을 그 줄 아래로 내렸다(`HomeScreen.tsx:236`, 시험 `home-list.test.tsx:146`, 고친 줄을 되돌리면 이 시험이 실패하는 것 확인).
- **남의 파일 문제(이슈 못 엶):** 하단 탭 세 개의 글자 위 아이콘이 Android에서 네모 안 X(없는 글자)로 보인다. `mobile/app/(tabs)/_layout.tsx`(APP-0-P2, D 담당)에 `tabBarIcon`이 없다. 팀 규칙대로 `bug`·`to:D` 이슈를 열려 했으나 이 세션의 권한 확인에서 막혀 PR 본문에 적었다.

---

# VISIT-1b 홈 하단 창 검증

- 기능: `library-visit` VISIT-1b 홈 하단 창 · 담당: A · 대상 커밋/PR: `ebcb70b`(#122 머지) · 작성일: 2026-11-17
- 기준: `개발산출물/02_요구사항_정의서.md` VISIT-06(C-61)·LIB-04·NFR-01, AC-VISIT·AC-RACE, 명세서 `세부/VISIT-1b.md` 예외, 계약서 `../team/contracts/library-visit.md` VISIT-1b P5
- **자동 시험의 "통과"는 모두 가짜 응답으로 돌린 결과다.** #9·#11·방문 기록은 계약 C7 가짜(`__fakes__/publicApi.ts`), #26·`PostCard`는 B LOCAL-2 머지 전 가짜(`__fakes__/localFeedApi.ts`·`__fakes__/PostCard.tsx`)를 썼다. 실제 서버·실제 지도와의 연결 시험은 `미실행`이다.
- 웹 열: Expo 웹 dev 서버에서 Claude가 headless Edge로 확인했다(PR #122 때).
  - 이 PC에는 카카오 키·서버 설정이 없다. 그래서 커밋하지 않는 임시 경로에서 API를 C7 가짜로, 지도 SDK를 회색 판으로 바꾸고 하단 탭이 붙은 실제 홈 탭(`/`)을 열었다. 그때 가짜 인기 도서는 10권으로 늘려 봤다.
  - 390×844와 1280×800 두 크기, 마우스·터치 끌기를 봤다.
- Android 열 (2026-11-17): VISIT-1 절 머리말의 "가짜 응답 + 회색 지도" 설정이다.
  - 하단 창은 지도 모드에서만 뜬다(명세 검토 메모 `[Claude가 정함]`). 그래서 실제 연결(키 없음 → 목록 모드)에서는 창이 나오지 않는다.
  - C7 가짜 인기 도서는 2권이다. 첫 권은 `example.invalid` 표지 주소, 둘째 권은 표지 없음이다.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-06 | AC-VISIT | 홈 열기 | 창 보기·끌기 | 평소 반반, 올리면 검색창 바로 아래, 내리면 제목 한 줄(56px) | 통과 | `home-sheet.test.tsx:81` sheet starts half… | 통과(390×844: 반쯤 → 올림 → 내림, 마우스·터치) | 통과(1080×2400: 검색창 아래~탭 위를 지도·창이 반반. 손잡이를 위로 끌면 검색창 바로 아래, 아래로 끌면 "이 동네 인기 도서" 제목 한 줄만) | 대기 |
| VISIT-06 | AC-VISIT | 방문 기록 101·102 | 창 열기 | 인기 기준 = 단골 첫째(101), `basis_label` 보임, 최대 10권 | 통과 | `home-sheet.test.tsx:122`, `:155` | 통과(10권 한 줄, 기준 글자) | 통과(기준 글자 "정독도서관 · 최근 30일 대출", 2권 한 줄). 10권 상한은 가짜 응답이 2권이라 자동 시험으로만 | 대기 |
| VISIT-06 | AC-VISIT | 표지 주소는 있는데 그림을 못 받음 | 창 열기 | C3 제목 글자 표지(빈칸 아님) | 통과 | `home-sheet.test.tsx:166` broken cover url… | 미실행 | **처음엔 실패(빈칸) → 고친 뒤 통과**(첫 권 "소년이 온다"가 제목 글자 표지로 나옴, 4절) | 대기 |
| VISIT-06 | AC-VISIT | 방문 기록 없음 / 주변도 없음 | 창 열기 | 가까운 첫째 / 전국 | 통과 | `home-sheet.test.tsx:131` | 해당 없음(자동) | 해당 없음 | 대기 |
| VISIT-06 | AC-VISIT | 방문 기록 2곳 | 창 열기 | 알약 정독·종로 순, 정독 켜짐, 게시물 2열 | 통과 | `home-news.test.tsx:101` | 통과(가까운 도서관 경우로 알약·2열 확인) | 통과("자주 가는 도서관 소식", 알약 정독(켜짐)·종로 순, 게시물 카드가 2열 중 왼쪽 칸에 놓임 — 가짜 게시물 1개) | 대기 |
| VISIT-06 | AC-VISIT | 방문 기록 없음, 위치 있음 / 위치 못 씀 | 창 열기 | "가까운 도서관 소식" + 거리 / 동 이름 + "지금 보는 지역 기준" | 통과 | `home-news.test.tsx:115`, `:127` | 통과(위치 못 씀 경우: 화동·사직동, "지금 보는 지역 기준") | 미실행(가짜 방문 기록이 2곳 고정) | 대기 |
| VISIT-06 | AC-VISIT | — | 책·게시물 누름(두 번 빠르게) | `/books/[isbn13]`·`/posts/[postId]` 한 번 | 통과 | `home-sheet.test.tsx:179`, `home-news.test.tsx:150` | 통과(책 → `/books/9788900000000`, 게시물 → `/posts/p-101-4`) | 통과(책 2권 → "책" 화면 `불편한 편의점`·`소년이 온다`, 게시물 → `postId: 7c9e6679-…`). 두 번 빠르게 누름은 자동 시험으로만 | 대기 |
| VISIT-06 | AC-VISIT | `next_cursor:"c1"` | 끝까지 내림 | `fetchLibraryPosts(101,{cursor:"c1"})`, 이어 붙임 | 통과 | `home-news.test.tsx:203` | 미실행(가짜 응답에 다음 쪽 없음) | 미실행(가짜 응답에 다음 쪽 없음) | 대기 |
| VISIT-06 | AC-VISIT | 로그인 안 함 / 함 | 창 열기 | 같은 알약·게시물, 개인 데이터는 기기 방문 기록만 | 통과 | `home-news.test.tsx:227` | 비로그인으로 확인 | 비로그인으로 확인 | 대기 |
| VISIT-06 | — | — | 화면 확인 | "내 최근 독서 기록" 칸 없음 | 통과 | `home-sheet.test.tsx:214` | 통과 | 통과 | 대기 |
| LIB-04 | AC-RACE | 101 게시물 응답 지연 | 102 알약 누름 → 101 응답 늦게 | 화면은 102 게시물 | 통과 | `home-news.test.tsx:137` | 해당 없음(자동) | 해당 없음 | 대기 |
| NFR-01 | AC-UI | 인기·소식 각각 실패 | 각 칸 | 그 칸만 실패 문구 + 새로고침, 다른 칸 정상, 원문 에러 안 보임 | 통과 | `home-sheet.test.tsx:188`, `home-news.test.tsx:215` | 미실행 | 미실행 | 대기 |
| (C4) | — | 올림, 목록 스크롤함 | 아래로 끌기 / 휠 | 창이 내려가지 않음, 목록만 스크롤 | 통과 | `home-news.test.tsx:245` | 통과(휠 500px: 목록만 움직이고 창 그대로) | 미실행(가짜 내용이 짧아 창 안 목록이 스크롤되지 않음) | 대기 |

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| #1 끊김·서버 오류 | `popular failure only affects popular section`, `news failure only affects news section` | 같음("인기 도서를 불러오지 못했어요." / "소식을 불러오지 못했어요." + "↻ 새로고침") | 기기 저장 없음 | 통과(Android 미실행: 실제 연결에서는 목록 모드라 창이 안 뜸) |
| #1-b #9 503·429 | `popular failure …`(503 PROVIDER_UNAVAILABLE) | 같음 | — | 통과 |
| #2 방문 기록 0 | `no visits falls back to nearby with distance` | 같음("가까운 도서관 소식" + "자주 가는 곳이 생기면 바뀌어요") | — | 통과 |
| #2-b 단골 게시물 0 | `frequent library without posts` + Android에서 종로 알약 누름 | 같음("종로도서관에는 아직 게시물이 없어요."), 알약 그대로, 가짜 게시물 없음 | — | 통과(Android 화면 확인) |
| #2-c 가까운 곳 모두 0 | `nearby libraries all without posts`, `nearby opens first library that has posts`(앞에서부터 게시물 있는 곳을 켬, 가드 제거 시 2개 실패 확인) | 같음("가까운 도서관에도 아직 게시물이 없어요."), 알약 3개 그대로·켜진 알약 없음 | — | 통과 |
| #2-d 인기 도서 0권 | `popular empty message` | 같음("이 동네 인기 도서를 아직 모으지 못했어요.") | — | 통과 |
| #3 알약 연타·두 번 누름 | `pill rapid switch …`, `book press …`, `post press …` | 문구 없음 | 상세 한 번 | 통과 |
| #4 로그인 안 함 | `same view signed out` + Android 비로그인 | 같은 화면 | — | 통과 |
| #5 위치 못 씀 | `location unavailable uses area label` | 같음("지금 보는 지역 기준", 캡션 "화동") | 좌표 저장 없음 | 통과 |
| (추가) 단골 도서관 없어짐 | `missing frequent library pill is dropped` | 그 알약만 빠짐 | 방문 기록 그대로 | 통과 |
| (추가) 표지 그림 못 받음 | `broken cover url falls back to title cover`(되돌리면 실패 확인) + Android | C3 제목 글자 표지 | — | 통과(고친 뒤) |

## 3. 명세서와 달라진 점

- 창 평소 높이: 계약 W3 "화면의 50%" → "검색창 아래~하단 탭 위를 지도와 창이 반반"(결정 2 원문 "지도와 창이 반반"). 사용자가 두 화면을 비교해 고름. Android에서도 반반으로 나옴.
- 웹 마우스 끌기를 위해 창이 누름에서 끌기를 받고(`onStartShouldSetPanResponder`), 글자 선택을 끔.
- `useHomeSheet`에 선택 인자 2개(`areaHeight?`, `isListAtTop?`).
- 계약 파일 목록 밖 수정: `deps.ts`·`__fakes__/publicApi.ts`(#9·방문 기록 가짜), 지도 홈 시험 3개(`HomeSheet` 가짜 한 줄).
- (이 검증 PR) 표지 그림을 못 받으면 제목 글자 표지로 바꿈 — `PopularBooksRow.tsx:85-106`. 세부 명세서 `검토 메모` `[구현 중 변경]`.
- 나머지는 세부 명세서 `검토 메모`의 `[구현 중 변경]`·`[Claude가 정함]`·`[계약 보완 필요]` 참조.

## 4. 남은 문제

- **미실행**
  - 실제 서버(#9·#11·#26)·실제 카카오 지도 위 창
  - Android: 위치 못 씀·방문 기록 없음 경우, 칸별 실패 문구, 창을 올린 채 목록 스크롤(C4), 이어 받기
  - 웹·Android에서 이어 받기(가짜 응답에 다음 쪽 없음)
- **Android에서 찾아 고친 것:** 인기 도서 표지 주소가 깨졌을 때 표지 자리가 빈칸(순위 숫자만)으로 보였다. C3 제목 글자 표지로 바꿨다.
- **연결 예정:** B LOCAL-2 `fetchLibraryPosts`·`PostCard`·게시물 상세, C 책 상세 머지 뒤 import 바꾸는 연결 PR
- **넓은 웹 창의 카드 크기:** 카드가 아주 커짐. 카드 비율은 B가 정하므로 연결 때 함께 정함
- **버그 이슈:** 하단 탭 아이콘 깨짐(D 파일)은 VISIT-1 절 4번에 적음. 이슈는 권한 확인에서 막혀 열지 못함
