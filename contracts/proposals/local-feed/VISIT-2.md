# VISIT-2 도서관 방문 페이지의 틀 — 계약 제안

> 위치: `contracts/proposals/local-feed/VISIT-2.md`. 1차 계약 기준선(local-feed VISIT-2 절)의 **열린 칸만** 세부 명세 결정으로 채운 제안이다. 잠긴 칸(경로·함수·기기 키·문구 G1~G10·파트·허용 파일·선행)은 기준선 그대로 옮겼다.

## 0. 머리 정보

| 칸 | 값 |
| :--- | :--- |
| 기능 / Step | `local-feed` / `VISIT-2` |
| 담당 역할 | B |
| 상태 | `검토 전·구현 착수 불가` |
| 작성 | 1차 계약 기준선 + B 담당 수정 제안 |
| 기획 PR | `#94` (명세 커밋 `20b5d04b2c043c5aadb502d0b140f46edd963f9c`) |
| 세부 명세 / 시안 | `specs/local-feed/세부/VISIT-2.md` / `specs/local-feed/세부/VISIT-2_시안.html` (커밋 `20b5d04b2c043c5aadb502d0b140f46edd963f9c`) |
| 05 / 06 / 02 근거 | `개발산출물/05_ERD_및_DB설계서.md` §6(기기 저장) · `06_기능_API_정의서.md` #10·#11·#26 · `02_요구사항_정의서.md` VISIT-02, AC-VISIT, AC-RACE (코드 `main` 커밋 `ff248ea66f7915d7e6d39a58ccfa0b0f2d6245ac`) |
| 1차 계약 기준선 | 발행 계약 `local-feed` `VISIT-2` 절 (본문 revision `82fb574fb59d4a73beabcbf4b77fa200998a5852`) |
| 발행 후 본문 커밋 | `N/A: 검토 전` |

## 1. 열린 칸 변경표

| # | 위치 | 변경 전(기준선) | 변경 후 | 열린 칸 근거(기준선 문구) | 명세 결정/예외 ID | 검증 방법 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | C1 G11(새 행) | 머리 배치 미정 | 왼쪽 정렬 두 줄: 왼쪽 위 `‹` / 그 아래 이름(크게, 굵게) / 그 아래 작은 글자 `"<거리> · <오늘 운영시간>"` + 같은 줄 오른쪽 `⋯` | "머리 배치(이름·거리·오늘 운영시간·‹·⋯)" | 결정 1 | P5 `header shows name then distance and hours with menu on the same row` |
| 2 | C1 G12(새 행) | "피드를 올렸을 때 머리 모양(기본값: 접혀서 `"‹ 이름"` 한 줄)" | 기본값 그대로 채택: 피드를 내리면 거리·운영시간 줄이 접히고 `‹ 이름 ⋯` 한 줄이 맨 위에 붙음, 맨 위로 오면 두 줄로 펼침 | 같은 문구 | 결정 2 | P5 `header folds to one line when feed scrolls and unfolds at top` |
| 3 | C1 G13(새 행) | "게시물이 하나도 없을 때 화면" 미정 | 피드 자리 가운데 `"아직 게시물이 없어요"` / `"이 도서관의 첫 글을 올려 보세요"` + 굵은 글자 링크 `"첫 글 올리기 →"`. 누르면 `/posts/new?libraryId=<id>`(LOCAL-1), 로그인 안 했으면 LOCAL-1의 로그인 안내 창. 가짜 게시물 없음 | "게시물이 하나도 없을 때 화면" | 결정 3, 예외 #2·#4 | P5 `empty feed shows guide and first post link`, `first post link asks login when signed out` |
| 4 | C1 G14(새 행) | "전환 세부(밀리는 방향·시간, 멘트 카드 크기)" 미정 | 오른쪽에서 왼쪽으로 0.3초 밀림(플랫폼 기본 Stack 전환), 배경 `cream`. 멘트 카드: 화면 아래 가운데, 글자 크기는 본문 작은 글자, 둥근 카드(`radii.card`), 배경 `paper` | 같은 문구 | 0절 기본값(Claude) | P5 `ment card shows once at bottom and hides`(G3 테스트에 표시 위치 단언 추가) |
| 5 | C3 | `#11` 실패: `"도서관 정보를 불러오지 못했어요."` + `"↻ 새로고침"`(기본값, 세부가 바꿀 수 있음) | 바꾸지 않음(그대로 채택) | "(기본값, 세부가 바꿀 수 있음)" | 예외 #1 | P5 `library info failure shows retry and keeps visit counted` |
| 6 | C3 | 없음 | 피드 불러오는 중 `"이야기를 불러오는 중…"`(작은 알약) / 피드 실패 `"지금은 이 도서관 이야기를 불러올 수 없어요."` + `"새로고침"` | G9 "피드가 없을 때(LOCAL-2 전 포함)는 빈 피드 안내" — 피드 자리 상태 문구 | 예외 #1 | P5 `feed loading and failure are distinct from empty` (피드 응답 자체는 LOCAL-2 #26 — 7절 쟁점 1) |
| 7 | C6 | G-#1~G-#6 | 명세 예외 번호 연결 열 추가(행 내용은 그대로) + 예외 #2·#3·#4·#5·#6 행 추가 | 기준선 C6 머리 "세부 명세 예외 번호는 명세 머지 뒤 이 표에 연결" 관례(LOCAL-1 C6) | 예외 #1~#7 | 3절 추적표 |
| 8 | P5 | 13행 | 13행 그대로 + 열린 칸 검증 7행 추가 | 열린 칸 변경을 검증 | 1~6 | 해당 행 |

## 2. 사전 점검 (Pre-flight)

| 관문 | 적용 조건 | 확인한 revision·file:line | 보존할 조건 | 미해결 |
| :--- | :--- | :--- | :--- | :--- |
| 격리·권한·호환 | 공개 읽기(#10·#11 인증 없음, #26 선택 인증)와 기기 저장만 씀. 개인 서버 리소스 없음 | 06 #10·#11·#26(`main` `ff248ea`), 기준선 G10 | 방문 기록·기본값은 기기에만, 서버에 보내지 않음(G10). 글쓰기 진입의 로그인 판정은 LOCAL-1 그대로 | 없음 |
| 동시성·트랜잭션·외부 I/O | #11·#26 조회는 같은 화면에서 도서관을 바꿔 들어올 때 늦은 응답이 덮지 않아야 함(AC-RACE). 앱 시작 분기는 한 번만 | `mobile/src/lib/latest.ts:6` `createLatestRunner`, 기준선 C2 "러너"·"한 번만" | #11·#26은 `createLatestRunner`로, `DefaultLibraryGate`는 실행당 한 번(기준선 P5 `gate decides only once per launch`). 서버 트랜잭션 없음 | 없음 |
| 전제 실재성 | 기기 기록·위치·외부 링크·도서관 조회 함수 | `mobile/src/lib/visits.ts:8` `VisitResult`, `:50` `recordVisit(libraryId, now?)`, `:77` `markDefaultAsked`, `:84` `getDefaultLibrary`, `:89` `setDefaultLibrary(libraryId | null)` / `mobile/src/lib/platform.ts:26` `locate(signal)`, `:78` `openExternalUrl(url)` / `mobile/src/lib/publicApi.ts` `fetchLibrary`, `fetchLibrariesNearby` — 모두 있음(APP-0-P1 머지 `00f71a3`). `mobile/app/libraries/[libraryId].tsx` 없음(`mobile/app`에 `_layout.tsx`·`index.tsx`·`login.tsx`·`posts/`만) | 경로 스텁은 미구현: D APP-0-P2, 이 Step P1이 교체(기준선 C7). #10·#11 서버는 미구현: D LIB-0-P1, core LIB-0 C7 가짜 값 | #26 서버·`fetchLibraryPosts`는 미구현: B LOCAL-2 |
| 담당·공유 파일 | 기준선 P2 두 파트 파일 전수 | 기준선 P2 표(본문 `82fb574`) | 파일·파트 추가 없음. 빈 피드·접히는 머리는 `VisitScreen.tsx`·`VisitHeader.tsx` 안. 홈 파일(A)은 손대지 않음 | 없음 |
| 승인·확장 | 새 API·필드·오류·라이브러리·플랫폼 분기 | 기준선 C2~C4 | 추가 없음. 왼쪽 끝 밀기는 `Stack` 옵션(C4) 그대로 | 없음 |

## 3. 추적표 (결정·예외·AC → 계약)

| 원본 ID | C1 | C3 문구 | C6 행 | P5 테스트 |
| :--- | :--- | :--- | :--- | :--- |
| 결정 1 머리 배치 | G1, G11 | `"정보 없음"` | N/A: 화면 배치 | `header shows name then distance and hours with menu on the same row`, `header hides distance when not passed` |
| 결정 2 접히는 머리 | G12 | N/A: 문구 없음 | N/A: 화면 동작 | `header folds to one line when feed scrolls and unfolds at top` |
| 결정 3 빈 피드 | G9, G13 | `"아직 게시물이 없어요"`, `"이 도서관의 첫 글을 올려 보세요"`, `"첫 글 올리기 →"` | 예외 #2 | `empty feed shows guide and first post link`, `first post link asks login when signed out` |
| 0절 전환·멘트 카드(기본값) | G2, G3, G14 | G3 문구 전부 | 예외 #3 | `visit records once and shows first ment`, `pickVisitMent table`, `third visit asks instead of streak ment`, `ment card shows once at bottom and hides` |
| 0절 ⋯ 메뉴·세 번째 방문 카드(정해짐) | G4, G5 | G4·G5 문구 전부 | N/A: 기기 내 처리 | `menu toggles default library`, `ask card yes sets default and marks asked` |
| 0절 돌아가기·검색창 없음(정해짐) | G7, G8 | N/A | N/A | `back goes to home`, `no search bar on visit page` |
| 예외 #1 끊김 | — | C3 #11 실패 문구, 피드 상태 문구 | 예외 #1 (G-#2) | `library info failure shows retry and keeps visit counted`, `feed loading and failure are distinct from empty` |
| 예외 #1-1 없는 도서관 | G1 | `"찾을 수 없어요."` | 예외 #1-1 (G-#1) | `unknown library shows not found and does not record` |
| 예외 #2 게시물 0개 | G13 | 결정 3 문구 | 예외 #2 | `empty feed shows guide and first post link` |
| 예외 #3 연타(`‹`·⋯) | G7, G4 | N/A | 예외 #3 | `back pressed twice returns home once`, `menu toggles default library` |
| 예외 #4 로그인 안 함 | G10, G13 | LOCAL-1 `"로그인하면 글을 올릴 수 있어요"` | 예외 #4 | `visit page renders signed out`, `first post link asks login when signed out` |
| 예외 #5 오늘 쉬는 날 | G1 | `"오늘 휴관"` | 예외 #5 | `header shows closed today` |
| 예외 #6 거리 없음 | G1 | N/A | 예외 #6 | `header hides distance when not passed` |
| 예외 #7 처음 방문 | G3 | `"처음으로 ○○도서관에 방문했어요!"` | 예외 #3 연결 | `visit records once and shows first ment` |
| AC-RACE | C2 러너 | N/A | N/A | `late library response does not overwrite newer library` |

## 4. 계약

### C1. 결정

G1~G10은 기준선 그대로(본문 `82fb574` VISIT-2 C1). 아래는 열린 칸을 채운 행이다.

| # | 결정 | 상태 | 근거 |
| --- | --- | --- | --- |
| G1 | (기준선 그대로) `/libraries/[libraryId]`. 머리는 `#11`의 `name`·거리·`today`, 운영시간을 못 받으면 `"정보 없음"`, 거리는 넘겨받은 값이 없으면 보이지 않음 | 확정 / 거리 처리 기본값(Claude) | 기준선 |
| G2~G10 | (기준선 그대로) 방문 기록 한 번, 멘트 카드 문구 표, 기본값 ⋯ 메뉴, 세 번째 방문 카드, 앱 시작 분기, 돌아가기, 검색창 없음, 피드만, 로그인 없이 보임 | 기준선 상태 그대로 | 기준선 |
| G11 | 머리는 왼쪽 정렬 두 줄: 왼쪽 위 `‹`, 그 아래 이름(20pt 굵게, 앱 26), 그 아래 작은 글자(12pt, `textSub`) `"<거리> · <오늘 운영시간>"`와 같은 줄 오른쪽 끝 `⋯`. 쉬는 날은 운영시간 자리에 굵은 `"오늘 휴관"`(`today.is_closed === true`일 때만, 모르면 평소 줄) | 확인 — 사용자: "깔끔하고 피드가 많이 보여서요." / 크기 기본값(Claude) | 명세 결정 1 |
| G12 | 피드를 내리면 거리·운영시간 줄이 접히고 `‹ <이름> ⋯` 한 줄(높이 약 52, 아래 은은한 그림자)이 맨 위에 붙는다. 맨 위로 돌아오면 두 줄로 펼친다. 한 줄 상태에서도 `‹`·⋯가 그대로 동작한다 | 확인 — 사용자: "어느 도서관인지 계속 보여서요" | 명세 결정 2 |
| G13 | 게시물이 하나도 없으면(`#26` 결과 0개, LOCAL-2 머지 전 포함) 피드 자리 가운데에 `"아직 게시물이 없어요"`(굵게) / `"이 도서관의 첫 글을 올려 보세요"`(`textSub`) / 굵은 글자 링크 `"첫 글 올리기 →"`. 링크와 오른쪽 아래 `"+"`는 같은 곳(`/posts/new?libraryId=<id>`)으로 가고, 로그인 안 했으면 LOCAL-1의 로그인 안내 창을 띄운다. 가짜 게시물 없음 | 확인 — 사용자: "첫 글을 올려 보라고 해서요." | 명세 결정 3 |
| G14 | 들어오는 전환은 오른쪽에서 왼쪽으로 0.3초(플랫폼 기본 `Stack` 전환), 배경 `cream`. 멘트 카드는 화면 아래 가운데(하단에서 84pt 위), 배경 `paper`, 모서리 `radii.card`, 한 줄 굵은 작은 글자 | 기본값(Claude) | 명세 0절 |

### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1` 접두어) | 인증 필요 | 성공 상태 | 날짜 형식 | 목록이면 페이지·정렬·동률 | 같은 요청을 연타·재시도하면 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /libraries/{library_id}` (#11, D) | 없음 | `200` | `today.date` `YYYY-MM-DD`(core LIB-0) | N/A: 하나 | 러너: 마지막 요청 결과만 그림 |
| `GET /libraries?lat=&lng=&radius_km=` (#10, D) | 없음 | `200` | N/A: 날짜 없음 | core LIB-0 그대로 | `DefaultLibraryGate` 실행당 한 번 |
| `GET /libraries/{library_id}/posts` (#26, B LOCAL-2) | 선택 | `200` | LOCAL-2 C3 | LOCAL-2 C2(최신순) | 러너 |
| 기기: `recordVisit`·`setDefaultLibrary`·`markDefaultAsked` | N/A: 기기 내 처리 | N/A | 서울 날짜(core APP-0) | N/A | `recordVisit`은 들어올 때 한 번(G2) |

앱 부품(기준선 그대로): `DefaultLibraryGate(): JSX.Element | null`, `pickVisitMent(result: VisitResult, libraryName: string, isDefault: boolean, today: string)`.

### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 (명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| #11 | `name` | `string` | Y | 아니오 | 머리 이름(G11) |
| #11 | `today.hours_text` | `string` | Y | 예 | 머리 운영시간. `null`이면 `"정보 없음"`(G1) |
| #11 | `today.is_closed` | `boolean` | Y | 예 | `true`면 `"오늘 휴관"`, `null`이면 평소 줄(예외 #5) |
| #11 | `homepage` | `string` | Y | 예 | ⋯ 메뉴 `"도서관 홈페이지"`, `null`이면 항목 숨김(G4) |
| 경로 값 | `libraryId` | `string`(숫자) | Y | 아니오 | 숫자가 아니면 `"찾을 수 없어요."` + 홈으로(예외 #1-1) |
| 경로 값 | `distanceM` | `string`(숫자) | N | 예 | 지도 홈이 넘긴 거리. 없으면 거리 숨김(예외 #6, G1 기본값) |
| 기기 | `localone:visits:v1`, `localone:default_library:v1` | core C3 | — | — | `visits.ts` 함수로만 |
| 화면 문구 | G3·G4·G5·G6 글자 전부 | — | — | — | 기준선 그대로 |
| 화면 문구 | 운영시간 없음 | — | — | — | `"정보 없음"`(G1) |
| 화면 문구 | 쉬는 날 | — | — | — | `"오늘 휴관"`(예외 #5) |
| 화면 문구 | #11 실패 | — | — | — | `"도서관 정보를 불러오지 못했어요."` + `"↻ 새로고침"`(예외 #1) |
| 화면 문구 | 피드 불러오는 중 | — | — | — | `"이야기를 불러오는 중…"` — 말줄임표는 실제 화면 문구(명세 예외 #1) |
| 화면 문구 | 피드 실패 | — | — | — | `"지금은 이 도서관 이야기를 불러올 수 없어요."` + `"새로고침"`(예외 #1) |
| 화면 문구 | 빈 피드 | — | — | — | `"아직 게시물이 없어요"` / `"이 도서관의 첫 글을 올려 보세요"` / `"첫 글 올리기 →"`(G13) |
| 화면 문구 | 로그인 안 함 | — | — | — | LOCAL-1 `"로그인하면 글을 올릴 수 있어요"` / `"구경은 로그인 없이도 할 수 있어요."` / `"로그인하기"` / `"닫기"`(예외 #4) |

`distanceM`은 기준선 G1 "지도 홈이 넘긴 값"의 전달 방식이다. 이름·모양은 7절 쟁점 2(넘겨주는 값은 계약서에서 정함, `기능_배정.md` 맨 위).

### C4. 플랫폼 분기

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 화면 왼쪽 끝 밀어 돌아가기 | expo-router `Stack`의 `gestureEnabled: true` | 기본 제스처 | 기본 뒤로 + `gestureEnabled` | 브라우저 뒤로·`‹` | `mobile/app/libraries/[libraryId].tsx` 화면 옵션(분기 코드 없음) | 세 플랫폼에서 지도로 돌아감 |

(기준선 그대로. 접히는 머리·빈 피드는 분기 없음)

### C5. 테이블

N/A: 방문 기록·기본값은 기기(core C3), 이 Step은 스키마를 바꾸지 않는다(기준선 C5).

### C6. 검증과 에러 처리

| 명세 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 예외 #1-1 (G-#1) | `#11` 404 / 경로 값이 숫자가 아님 | `404` / `NOT_FOUND` · 경로는 N/A: 기기 내 처리 | 화면 전체 `"찾을 수 없어요."` + 홈으로 | 없음 | `recordVisit` 부르지 않음, 방문 기록 무변경 |
| 예외 #1 (G-#2) | `#11` 실패·끊김 | `0`(끊김)·`5xx` / `NETWORK`·`PROVIDER_UNAVAILABLE` | 머리 자리 `"도서관 정보를 불러오지 못했어요."` + `"↻ 새로고침"` | `‹`, 피드 자리 | 방문은 센다(기준선) |
| 예외 #1 (피드) | `#26` 실패·끊김 | LOCAL-2 C6 | 피드 자리 `"지금은 이 도서관 이야기를 불러올 수 없어요."` + `"새로고침"`, 불러오는 동안 `"이야기를 불러오는 중…"` | 머리(이름·운영시간·⋯), `"+"` | — |
| 예외 #2 | 게시물 0개 | `200`, 빈 목록 | 피드 자리 G13 안내 | 머리, `"+"` | 가짜 게시물 없음 |
| 예외 #3 (G-#3) | 같은 날 다시 들어옴 | N/A: 기기 내 처리 | 카드 없음 | 화면 전체 | `count` 그대로 |
| 예외 #3 (연타) | `‹` 두 번 빠르게 / ⋯ "여기부터 열기" 두 번 | N/A: 기기 내 처리 | 지도 홈으로 한 번만 / 설정 한 번만 바뀜 | — | 기본값 하나 |
| 예외 #4 | 로그인 안 함 | N/A: 공개 읽기 | `"+"`·`"첫 글 올리기 →"`를 누를 때만 로그인 안내 창 | 방문 페이지 전체 | 서버 기록 없음 |
| 예외 #5 | 오늘 쉬는 날 | `200`, `today.is_closed=true` | 운영시간 자리 `"오늘 휴관"` | 피드 | — |
| 예외 #6 | 거리를 넘겨받지 못함 | N/A: 기기 내 처리 | 거리 숨김, `"<오늘 운영시간>"`만 | 나머지 | — |
| G-#4 | 기본 도서관이 서버에서 사라짐 | `404` | `DefaultLibraryGate`가 기본값을 끄고 홈 그대로 | 홈 | 기본값 삭제(기준선) |
| G-#5 | 앱 시작 때 위치를 못 씀 | N/A: 기기 내 처리 | 풀지 않고 방문 페이지로 | — | 기본값 그대로(기준선) |
| G-#6 | 기기 저장 실패 | N/A: 기기 내 처리 | 카드 없음 | 화면 계속 | —(기준선) |

### C7. 다른 기능과 닿는 곳

| 의존 대상 역할·기능 | 필요한 함수/데이터 | 상대 머지 전 가짜 값 모양 |
| :--- | :--- | :--- |
| D APP-0-P1 | `visits.ts`, `locate`, `openExternalUrl`, `publicApi`, `theme` | 머지됨(`00f71a3`) — 가짜 값 불필요 |
| D APP-0-P2 | `/libraries/[libraryId]` 스텁 | 이 Step P1이 교체(기준선) |
| D LIB-0-P1 | #10·#11 | core LIB-0 C7(고정 도서관 101·102·103) |
| A VISIT-1 | 홈 탭에 `DefaultLibraryGate` 놓기, 핀 → 이 경로 이동 시 거리 넘기기 | A가 이 부품 머지 뒤 한 줄 연결(기준선). 거리 전달은 7절 쟁점 2 |
| B LOCAL-1 | `/posts/new?libraryId=`, 로그인 안내 창(`LoginSheet`) | 머지된 명세 `#78`, 구현 PR `#101`(진행 중) — 머지 전에는 `"+"`·링크가 그 경로로만 이동 |
| B LOCAL-2 | #26 피드 | 머지 전에는 빈 피드 안내(G9·G13) |

## 5. 구현 계획

### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦(제공 Step) |
| :--- | :--- | :--- | :--- |
| 방문 기록 | `mobile/src/lib/visits.ts:8`·`:50` | `VisitResult`, `recordVisit(libraryId: number, now = new Date()): Promise<VisitResult>` | 있음 |
| 기본값 | `mobile/src/lib/visits.ts:77`·`:84`·`:89` | `markDefaultAsked(libraryId)`, `getDefaultLibrary(): Promise<number | null>`, `setDefaultLibrary(libraryId | null)` | 있음 |
| 위치·외부 링크 | `mobile/src/lib/platform.ts:26`·`:78` | `locate(signal: AbortSignal): Promise<LocateResult>`, `openExternalUrl(url): Promise<boolean>` | 있음 |
| 최신 응답 | `mobile/src/lib/latest.ts:6` | `createLatestRunner()` | 있음 |
| 도서관 조회 | `mobile/src/lib/publicApi.ts` | `fetchLibrary(libraryId, signal?)`, `fetchLibrariesNearby(lat, lng, radiusKm?, signal?)` | 앱 함수 있음 / 서버는 D LIB-0-P1 |
| 테마 | `mobile/src/theme/index.ts` | `theme.colors`(`cream`·`paper`·`text`·`textSub`·`inkStrong`), `theme.radii.card`·`control` | 있음 |
| 글쓰기 경로·로그인 창 | `mobile/app/posts/new.tsx`, `mobile/src/features/local-feed/ComposeScreen.tsx` `LoginSheet` | — | B LOCAL-1(PR `#101`) |
| 피드 | — | `fetchLibraryPosts` | B LOCAL-2 |

### P2. 파트 분할과 담당 파일

기준선 그대로(본문 `82fb574`). 열린 칸(G11~G14)은 아래 파트의 기존 허용 파일 안에서 만든다.

| 파트 | 브랜치 | 수정/생성 허용 파일 | 완료 시 확인할 명세 항목 |
| :--- | :--- | :--- | :--- |
| `VISIT-2-P1` 방문 페이지 틀·방문 멘트 | 세부 브랜치 `feat/local-feed-VISIT-2`(파트는 커밋) | `mobile/app/libraries/[libraryId].tsx`, `mobile/src/features/local-feed/VisitScreen.tsx`, `mobile/src/features/local-feed/VisitHeader.tsx`, `mobile/src/features/local-feed/visitMent.ts`, `mobile/src/features/local-feed/__tests__/visit.test.tsx` | G1~G3·G7~G14, 결정 1~3, 예외 #1·#1-1·#2·#3·#4·#5·#6·#7 |
| `VISIT-2-P2` 도서관 기본값·앱 시작 분기 | 같은 브랜치 | `mobile/src/features/local-feed/VisitScreen.tsx`, `mobile/src/features/local-feed/VisitMenu.tsx`, `mobile/src/features/local-feed/AskDefaultCard.tsx`, `mobile/src/features/local-feed/DefaultLibraryGate.tsx`, `mobile/src/features/local-feed/__tests__/default-library.test.tsx` | G4~G6, G-#4·#5, 예외 #3(⋯ 연타) |

#### 파트 머리말 — VISIT-2-P1

| 칸 | 값 |
| :--- | :--- |
| 1. 태스크 ID | `VISIT-2-P1` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | B2 준비 |
| 4. 계약서 커밋 | `N/A: 검토 전` (발행 뒤 기록) |
| 5. 선행 태스크 | `specs/local-feed/세부/VISIT-2.md` 머지 + 이 제안 발행, `APP-0-P1`(머지됨)·`APP-0-P2`(전이면 core C7) |
| 6. 수정 허용 파일 | 위 표 5개 |
| 7. 금지된 결정 | 검색창 금지(G8). 방문 횟수 숫자 보이기 금지. 서버에 방문 보내기 금지. 가짜 게시물 금지 |
| 8. 완료 조건 | G1~G3·G7~G14 + P5 `VISIT-2-P1` 시험 + 웹·Android |
| 9. 검증 명령 | `mobile`에서 `npm ci` → `npx tsc --noEmit` → `npx jest --runInBand src/features/local-feed` → `npx expo export --platform web` |
| 10. 보고 형식 | `3_구현.md` 3단계 PR 본문 양식 |

#### 파트 머리말 — VISIT-2-P2

| 칸 | 값 |
| :--- | :--- |
| 1. 태스크 ID | `VISIT-2-P2` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | B2 준비 |
| 4. 계약서 커밋 | `N/A: 검토 전` (발행 뒤 기록) |
| 5. 선행 태스크 | `VISIT-2-P1` 커밋(같은 브랜치) |
| 6. 수정 허용 파일 | 위 표 5개 |
| 7. 금지된 결정 | 기본값 둘 이상 금지. 홈 화면 파일 수정 금지(A 파일) |
| 8. 완료 조건 | G4~G6 + P5 `VISIT-2-P2` 시험 + 웹·Android |
| 9. 검증 명령 | P1과 같음 |
| 10. 보고 형식 | P1과 같음 |

### P3. 새 라이브러리

| 쪽 | 패키지·허용 버전 | 용도 | 설정·플랫폼 대체 동작 |
| --- | --- | --- | --- |
| 앱 | 없음 | N/A: 접히는 머리는 `ScrollView`의 `onScroll` 값으로 그린다 | N/A |

### P4. 핵심 흐름 골격

`pickVisitMent`는 기준선 골격 그대로. 새로 필요한 흐름은 접히는 머리와 빈 피드 하나다.

```text
// VisitScreen.tsx — 머리 접힘(G12)과 피드 자리 상태(G13·예외 #1)
FOLD_AT = 머리 두 줄 높이 - 한 줄 높이
state: folded = false, library = runner(fetchLibrary(id)), feed = runner(fetchLibraryPosts(id))   // TODO(연결): B LOCAL-2, 전에는 feed = { kind: "empty" }
onScroll(y):
  next = y > FOLD_AT
  if next != folded: folded = next                       // 값이 바뀔 때만 다시 그림
render:
  VisitHeader(name, distanceM?, today, folded, onBack = backOnce, onMore)
  switch feed.kind:
    "loading" -> 작은 알약 "이야기를 불러오는 중…"
    "error"   -> 가운데 카드 "지금은 이 도서관 이야기를 불러올 수 없어요." + "새로고침"(feed 다시)
    "empty"   -> 가운데 안내 3줄, "첫 글 올리기 →" = openCompose
    "items"   -> 2열 피드(LOCAL-2)
  FAB "+" = openCompose
openCompose():
  if not signedIn: LoginSheet(LOCAL-1)
  else router.push(`/posts/new?libraryId=${id}`)
backOnce = once(() => router.canGoBack() ? router.back() : router.replace("/"))   // 예외 #3
// 도서관을 바꿔 들어오면 runner가 이전 응답을 버린다(AC-RACE)
```

### P5. 테스트 설계 (구현 단계에서 작성·실행)

기준선 13행은 그대로 둔다(`visit records once and shows first ment`, `pickVisitMent table`, `third visit asks instead of streak ment`, `same day revisit shows no card`, `unknown library shows not found and does not record`, `no search bar on visit page`, `back goes to home`, `menu toggles default library`, `ask card yes sets default and marks asked`, `gate opens default library when inside radius`, `gate releases when another library is near and default is not`, `gate keeps default when location unavailable`, `gate decides only once per launch`). 추가 행:

| 파트 | 테스트 이름 | 원본 ID | Given | When | Then | 빠지면 실패하는 가드 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-2-P1 | `header shows name then distance and hours with menu on the same row` | 결정 1, G11 | #11 가짜 101, `distanceM=320` | 진입 | 이름 줄 아래 `"320m · 09:00–18:00"` 줄, 같은 줄에 ⋯ | 머리 배치(정보 줄과 ⋯를 한 줄에 둠) |
| VISIT-2-P1 | `header hides distance when not passed` | 예외 #6, G1 | `distanceM` 없음 | 진입 | 거리 글자 없음, 운영시간만 | 거리 없음 처리 |
| VISIT-2-P1 | `header shows closed today` | 예외 #5 | `today.is_closed=true` | 진입 | `"오늘 휴관"`, `null`이면 평소 줄 | `is_closed === true`만 휴관 |
| VISIT-2-P1 | `header folds to one line when feed scrolls and unfolds at top` | 결정 2, G12 | 진입 | 스크롤 y > FOLD_AT → y=0 | 한 줄 `‹ 이름 ⋯`(운영시간 없음) → 두 줄 | `folded` 판정 |
| VISIT-2-P1 | `empty feed shows guide and first post link` | 결정 3, 예외 #2, G13 | 피드 0개 | 진입 → 링크 누름 | 안내 3줄, 게시물 카드 0, `router.push("/posts/new?libraryId=101")` | 가짜 게시물 금지·링크 대상 |
| VISIT-2-P1 | `first post link asks login when signed out` | 예외 #4 | 로그아웃 | 링크·`"+"` 누름 | 로그인 안내 창, 이동 0번 | 로그인 판정 |
| VISIT-2-P1 | `visit page renders signed out` | 예외 #4, G10 | 로그아웃 | 진입 | 머리·빈 피드 보임, 로그인 창은 누르기 전엔 없음 | 공개 읽기 |
| VISIT-2-P1 | `library info failure shows retry and keeps visit counted` | 예외 #1 | #11 실패 | 진입 → `"↻ 새로고침"` | 실패 문구, `recordVisit` 1번, 새로고침에 #11 다시 1번 | 실패 시 방문 처리 |
| VISIT-2-P1 | `feed loading and failure are distinct from empty` | 예외 #1 | 피드 대기 / 실패 / 0개 | 진입 | 세 상태 문구가 서로 다르고 빈 안내는 0개일 때만 | 상태 구분 |
| VISIT-2-P1 | `back pressed twice returns home once` | 예외 #3, G7 | 진입 | `‹` 두 번 빠르게 | `router.back` 1번 | `once` 가드 |
| VISIT-2-P1 | `late library response does not overwrite newer library` | AC-RACE | 101 응답 지연, 102로 바꿔 들어옴 | 101 늦게 도착 | 머리는 102 | 러너 |
| VISIT-2-P1 | `ment card shows once at bottom and hides` | G3, G14 | 첫 방문 | 진입 | 카드 1개(아래 가운데), 사라진 뒤 0개 — 정해진 시간 기다리기 대신 가짜 타이머로 진행 | 한 번만 표시 |

- 공개 읽기(#10·#11)와 기기 동작이라 401/422/DB 테스트는 N/A: 서버 쓰기 없음. #10·#11 서버 시험은 D LIB-0 소유.

## 6. 검수 결과

| 항목 | 결과 |
| :--- | :--- |
| 문서 정적 대조 | 기준선 VISIT-2 절(본문 `82fb574`)과 대조: G1~G10·C2 경로·C4·C5·C7·P2 파일·머리말 잠금 칸 바꾸지 않음. 열린 칸 4개 + C3 기본값 1개(그대로 채택) + 피드 상태 문구만 채움. 명세 결정 1~3·예외 #1~#7 모두 3절에 행 있음 |
| 제품 테스트·변이 검사 | 미실행(구현 단계) |
| 인코딩(UTF-8, BOM 없음)·줄바꿈(LF) | 확인 |

## 7. D 판단 쟁점

| 분류 | 내용 | 근거 | 영향 | 추천안 |
| :--- | :--- | :--- | :--- | :--- |
| `[계약 보완 필요]` 1 | 피드 상태 문구(불러오는 중·실패)는 피드 응답(#26)이 LOCAL-2 몫이라 VISIT-2는 화면 자리만 둔다 | 기준선 C7 "B LOCAL-2 피드 — 머지 전에는 빈 피드 안내" | LOCAL-2 전에는 피드가 늘 "빈" 상태로 보임 | VISIT-2는 `feed.kind` 4상태 자리를 만들고, LOCAL-2가 #26 연결 때 같은 문구를 씀 |
| `[계약 보완 필요]` 2 | 지도 홈(A)이 넘기는 거리의 이름·모양 | 기준선 G1 "거리는 지도 홈이 넘긴 값", `기능_배정.md` 맨 위 "넘겨주는 값은 D가 계약서에서 정한다" | 정하지 않으면 거리가 늘 안 보임 | 경로 값 `distanceM`(미터, 정수 문자열), A의 핀 이동이 `router.push("/libraries/101?distanceM=320")`으로 넘김 |
| `[기준 충돌]` 3 | 세 번째 방문 질문 카드·연속 멘트, ⋯ 자리 | `specs/library-visit/명세서.md` 결정 14·15(A 사용자) ↔ `개발산출물/명세/VISIT_LOCAL_D결정.md` 1.2·1.2-1(C-56·C-58)·`기능_배정.md` B절 | 기준선 G3·G4·G5가 이미 D 결정 쪽 | 기준선 그대로(상세 결정이 이김), 계약 변경 없음 |
