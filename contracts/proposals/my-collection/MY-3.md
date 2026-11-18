# MY-3 내 정보 "도서관 방문 모음" — 계약 제안 (D 초안)

> 복사 위치 규칙: `contracts/proposals/<기능>/<STEP>.md` (`contracts/제안_양식.md`).
> **이 문서는 D가 L6(페이지 디자인 후순위 3번)에서 먼저 써 둔 초안이다.** 구현 기준이 아니며, VISIT-4(방문 스탬프) 계약이 발행되고 Q-45 ①②가 정해진 뒤 다시 검토한다. 그 전에는 구현을 지시하지 않는다.
> `05_ERD_및_DB설계서.md` §260은 "방명록·방문 스탬프 테이블은 M2 이후에 정하고 미리 넣지 않는다"고 정했으므로 05·06·02는 고치지 않는다. 이 초안이 필요로 하는 원천 데이터는 C7에 "VISIT-3·VISIT-4가 제공"으로만 적는다.

## 0. 머리 정보

| 칸 | 값 |
| :--- | :--- |
| 기능 / Step | `my-collection` / `MY-3` (`MY-2`는 프로필 수정으로 이미 잡혀 있음 — team `contracts/my-collection.md` Y5·Y-O1) |
| 담당 역할 | 미정 (D 초안. 세부 기획 때 배정) |
| 상태 | `D 초안 · 검토 전·구현 착수 불가` (선행: VISIT-3·VISIT-4 계약 발행, Q-45 ①②) |
| 작성 | D, 2026-11-19 (L6 결정: "계약 초안까지 지금") |
| 기획 PR | `N/A: 세부 명세 전` |
| 세부 명세 / 시안 | `N/A: 세부 명세 전` (화면 시안은 MY-3 세부 기획 때 `specs/my-collection/세부/MY-3_시안.html`) |
| 05 / 06 / 02 근거 | 05 §260(M2 테이블 미정) · 04 "방문 스탬프"(사용자×도서관×날짜, 자기 선언, 본인)·"방명록 글"(공개) · 02 VISIT-03·VISIT-05·USR-02·AC-ISOLATION·AC-STAMP (코드 `main` `f201a3b`) |
| 원문 | `00_기획_원본.md` 제안 표 "도서관마다 고유 색(넓은 팔레트)과 내 정보 도서관 방문 모음" (D 2026-11-18), `DESIGN.md` 제안 "내 정보 도서관 방문 모음 + 그 화면 전용 큐브 팔레트" |
| 1차 계약 기준선 | `N/A: 새 Step — team 계약에 MY-3 절 없음` |
| 발행 후 본문 커밋 | `N/A: 검토 전` |

## 1. 열린 칸 변경표

`N/A: 기준선이 없는 새 Step이다.` 발행 때 D가 team `contracts/my-collection.md`에 `MY-3` 절을 새로 만든다.

## 2. 사전 점검 (Pre-flight)

| 관문 | 적용 조건 | 확인한 revision·file:line | 보존할 조건 | 미해결 |
| :--- | :--- | :--- | :--- | :--- |
| 격리·권한·호환 | 본인 방문 기록만 모은다 | team `contracts/my-collection.md` Y2(`/me/*` 필수 인증·본인만), 02 USR-02·AC-ISOLATION | 필수 인증, 요청에 `user_id`를 받지 않음, 남의 모음은 볼 길이 없음. 응답에 `user_id` 없음 | 없음 |
| 동시성·트랜잭션·외부 I/O | 읽기만 | `server/app/db.py`(`run_db`) | 읽기 전용, 외부 I/O 없음. 앱은 `createLatestRunner`로 늦은 응답 버림(MY-1 Y7과 같게) | 없음 |
| 전제 실재성 | 원천 테이블 | 방명록·방문 스탬프 테이블 **없음**(05 §260, 코드 검색 0건 2026-11-19) | 없는 것은 C7 가짜 값 | `미구현: VISIT-3·VISIT-4` |
| 담당·공유 파일 | 내 정보 화면 | `mobile/src/features/my-collection/MyCollectionScreen.tsx`(MY-1) | MY-1 3탭(내 게시물·좋아요·북마크)은 바꾸지 않음. 방문 모음의 자리는 세부 기획에서 정함(M-O1) | M-O1 |
| 승인·확장 | 새 경로 1개 | 06 M1 동결 | 새 `GET /me/visited-libraries` 1개는 M2 확장으로 발행 때 06에 더함 | D 승인 |

## 3. 추적표 (결정·예외·AC → 계약)

| 원본 ID | C1 | C3 문구 | C6 행 | P5 테스트 |
| :--- | :--- | :--- | :--- | :--- |
| 원문 제안(D 2026-11-18) | M1·M2 | 화면 제목 `"도서관 방문 모음"` | N/A: 동작 정의 | `visited libraries list only stamp or guestbook libraries` |
| D 말 "색은 그 페이지의 미관·감성용, D가 직접 넣음, 중복 있어도 됨" | M4 | — | N/A | `collection palette is stable per library and independent of home fill` |
| D 말 "현재 색 규칙은 표시용 규칙 … 무관" | M4 | — | N/A | 같은 테스트 |
| Q-44(내 발자취 = 독서 기록 도서관별 보기) | M3 | — | N/A | N/A: 다른 화면, 겹침 없음을 문서로만 확인 |
| 02 USR-02 · AC-ISOLATION | M5 | — | 예외 #1 | `visited libraries require auth and never take user_id` |
| 02 VISIT-05 · Q-45 ① | M2 | — | N/A | VISIT-4 결정 뒤 |

## 4. 계약

### C1. 결정

| # | 결정 | 상태 | 근거 |
| --- | --- | --- | --- |
| M1 | 내 정보에 **"도서관 방문 모음"**을 둔다. 내가 **방문 스탬프를 찍었거나 방명록 글을 남긴 도서관**을 큐브(홈과 같은 C2 등각 큐브, 윗면 = 색 + 줄인 이름 `shortName.ts` `coreLibraryName`)로 모아 보여 준다 | 확인 (D 아이디어 2026-11-18, L6 2026-11-19 "계약 초안까지 지금") | 00 제안 표, DESIGN 제안 |
| M2 | 모음에 들어가는 기준 = 스탬프 1개 이상 **또는** 철회·숨김되지 않은 방명록 글 1개 이상. 방문 페이지에 들어온 것만(기기 `visits`, C-56 방문 멘트용)으로는 들어가지 않는다 | 미확인(임시: 추천안) — Q-45 ①(입장만으로 찍히는지)에 따라 스탬프 쪽 뜻이 바뀜 | 05 §227 "방문 횟수는 M2 스탬프와 별개 값" |
| M3 | Q-44 "내 발자취"(독서 기록의 도서관별 보기, 내가 그 도서관에서 남긴 **독서 기록**)와 **겹치지 않는다**. 방문 모음은 기록 내용이 아니라 "다녀간 도서관"만 모은다. 큐브를 누르면 그 도서관의 방문 페이지(`/library/<id>`)로 간다 | 기본값(Claude) — 누른 뒤 이동처는 세부 기획에서 바꿀 수 있음 | 02 READ-02, Q-44 |
| M4 | **색**: 이 화면 전용 팔레트(D가 직접 넣는 색 목록, 중복 허용). 도서관마다 `library_id`로 늘 같은 색(목록 길이로 나눈 나머지). 홈 큐브 색 규칙(거리순 `fill1~3`)·VISIT-07 도서관 룩은 **바꾸지 않고 섞지 않는다**. 팔레트는 앱 상수라 서버 필드 없음 | 확인(분리·중복 허용, D 2026-11-18) / 배정 방식(나머지) 기본값(Claude) | DESIGN 제안 |
| M5 | 본인만 본다. 남의 모음·다른 사람이 몇 곳 모았는지는 어디에도 보이지 않는다 | 확인 | MY-1 Y2, 02 USR-02 |
| M6 | 정렬: 마지막으로 다녀간 날(스탬프 날짜·방명록 글 날짜 중 늦은 것) 최신 순, 같으면 `library_id` 오름차순 | 기본값(Claude) | — |

#### 세부 기획에서 정할 것 (열린 칸)

| # | 열린 칸 | 추천(임시) |
| --- | --- | --- |
| M-O1 | 내 정보 안의 자리: MY-1 3탭 옆 4번째 탭 / 프로필 아래 가로 띠 / 별도 화면 | 프로필 아래 가로 띠(큐브 3~4개 + "모두 보기") — 3탭을 그대로 둠 |
| M-O2 | 큐브 옆면에 무엇을 적나(스탬프 수·처음 다녀간 날·방명록 수) | 오른쪽 면 `STAMP n`, 왼쪽 면 처음 날짜 |
| M-O3 | 빈 상태 문구 | `"도서관에 다녀왔어요를 누르면 여기에 모여요"` |
| M-O4 | 팔레트 색 목록(개수·값) | D가 직접 넣음 |

### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1` 접두어) | 인증 필요 | 성공 상태 | 날짜 형식 | 목록이면 페이지·정렬·동률 | 같은 요청을 연타·재시도하면 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /me/visited-libraries?cursor=&limit=` | 필수 (`get_current_user`) | `200` | `first_on`·`last_on`: `YYYY-MM-DD`(서울 날짜) | `limit` 기본 30(1~60), 정렬 `last_on DESC, library_id ASC`, 커서 `(last_on, library_id)` base64url | N/A (읽기만) |

- 앱 함수: `mobile/src/features/my-collection/api.ts` `fetchVisitedLibraries(cursor?: string | null): Promise<VisitedLibrariesPage>`
- 순수 함수: `mobile/src/features/my-collection/visitPalette.ts` `collectionTone(libraryId: number, palette: readonly string[]): string`

### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 (명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 요청 | `cursor` | `str` | N | Y | base64url JSON `[last_on, library_id]`. 깨지면 `422 VALIDATION_ERROR`, `detail="cursor"` |
| 요청 | `limit` | `int` | N | N | 1~60, 밖이면 `422`, `detail="limit"` |
| 응답 | `items[].library` | `{id, name, address, area_label}` | Y | N | `LibrarySummary`의 일부(이름 줄이기에 주소·`area_label`이 필요, `shortName.ts` `cubeNames`) |
| 응답 | `items[].stamp_days` | `int` | Y | N | 스탬프 찍은 날 수(0 이상). Q-45 ① 결정 뒤 뜻 확정 |
| 응답 | `items[].guestbook_count` | `int` | Y | N | 철회·숨김 아닌 내 방명록 글 수 |
| 응답 | `items[].first_on` | `str` | Y | N | 처음 다녀간 서울 날짜 |
| 응답 | `items[].last_on` | `str` | Y | N | 마지막 다녀간 서울 날짜(M6 정렬 기준) |
| 응답 | `next_cursor` | `str` | Y | Y | 다음 쪽 없으면 `null` |
| 화면 문구 | 제목 | — | — | — | `"도서관 방문 모음"` (M1) |

- 응답에 `user_id`·다른 사람 정보 없음(M5).

### C4. 플랫폼 분기

`N/A: 홈 큐브(FacadeHome)와 같은 View + transform 그리기라 세 플랫폼 같은 코드.`

### C5. 테이블

`N/A: 새 테이블 없음.` 방명록 글·방문 스탬프 테이블은 VISIT-3·VISIT-4가 만든다(05 §260). 이 Step은 그 두 테이블을 읽기만 한다. 탈퇴 처리(team `contracts/auth.md` W8)도 그 Step에서 더한다.

### C6. 검증과 에러 처리

| 명세 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 예외 #1 | 비로그인 | 앱은 호출하지 않음(MY-1 Y7). 서버 직접 호출은 `401 AUTH_REQUIRED` | 모음 자리에 로그인 안내 | 내 정보 나머지 | 없음 |
| 예외 #2 | 깨진 `cursor`·범위 밖 `limit` | `422 VALIDATION_ERROR` / `cursor`·`limit` | 없음(앱은 서버가 준 커서만 씀) | 전부 | 없음 |
| 예외 #3 | 네트워크·서버 오류 | — | 모음 자리만 `"불러오지 못했어요"` + `↻ 다시 시도` | 3탭·프로필 | 없음 |
| 예외 #4 | 모은 도서관 0곳 | `200`, `items: []` | 빈 상태 문구(M-O3) | 전부 | 없음 |

### C7. 다른 기능과 닿는 곳

| 의존 대상 역할·기능 | 필요한 함수/데이터 | 상대 머지 전 가짜 값 모양 |
| :--- | :--- | :--- |
| VISIT-4 방문 스탬프(M2) | 사용자×도서관×서울 날짜 스탬프 행 | `TODO(연결): D` — `{"items":[{"library":{"id":101,"name":"정독도서관","address":"서울특별시 종로구 북촌로5길 48 (화동)","area_label":"화동"},"stamp_days":3,"guestbook_count":0,"first_on":"2026-11-02","last_on":"2026-11-18"},{"library":{"id":103,"name":"남산도서관","address":"서울특별시 용산구 소월로 109","area_label":null},"stamp_days":0,"guestbook_count":1,"first_on":"2026-11-10","last_on":"2026-11-10"}],"next_cursor":null}` |
| VISIT-3 방명록(M2) | 내 방명록 글(철회·숨김 제외) 도서관별 수·날짜 | 위와 같은 가짜 값 |
| library-visit | `shortName.ts` `coreLibraryName`·`cubeNames` (L6에서 만듦) | 있음 |

## 5. 구현 계획

### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦(제공 Step) |
| :--- | :--- | :--- | :--- |
| 이름 줄이기 | `mobile/src/features/library-visit/shortName.ts` | `cubeNames(libs)` | 있음(L6) |
| 큐브 그리기 | `mobile/src/features/library-visit/FacadeHome.tsx` | `IsoCube`(파일 안 함수, 내보내지 않음) | 있음 — 함께 쓰려면 MY-3에서 꺼내는 리팩터 필요(D 판단 쟁점) |
| 방문 스탬프·방명록 테이블 | — | — | 앞으로 만듦(VISIT-4·VISIT-3) |

### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일 | 완료 시 확인할 명세 항목 |
| :--- | :--- | :--- | :--- |
| P2-1 서버 | `feat/my-3-server` | `server/app/routers/me.py`(경로 1개), `server/tests/test_me_visited_libraries.py` | M2·M5·M6, 예외 #1·#2·#4 |
| P2-2 앱 | `feat/my-3-app` | `mobile/src/features/my-collection/api.ts`·`visitPalette.ts`·`VisitedLibraries.tsx`·`__tests__/visited-libraries.test.tsx`, `MyCollectionScreen.tsx`(자리 하나) | M1·M3·M4, 예외 #3·#4 |

### P5. 테스트 설계 (실행 전)

| 테스트 이름 | 확인하는 것 |
| :--- | :--- |
| `visited libraries list only stamp or guestbook libraries` | 스탬프·방명록 없는 도서관(기기 방문만)은 안 나옴(M2) |
| `visited libraries sort by last day then id` | M6 정렬·커서 동률 |
| `visited libraries require auth and never take user_id` | 401, 쿼리 `user_id` 무시(M5) |
| `withdrawn guestbook does not count` | 철회·숨김 글 제외 |
| `collection palette is stable per library and independent of home fill` | 같은 id 같은 색, 홈 `fill1~3` 값을 쓰지 않음(M4) |
| `collection cubes use short names` | 윗면은 `cubeNames` 결과, 접근성 이름은 원래 이름 |

## D 판단 쟁점

- `[계약 보완 필요]` VISIT-4 계약에서 스탬프 테이블을 정할 때 이 Step이 읽을 컬럼(사용자·도서관·서울 날짜)을 함께 고정해야 한다.
- `[계약 보완 필요]` `IsoCube`를 홈과 함께 쓰려면 `library-visit`에서 내보내는 컴포넌트로 꺼내야 한다(A 담당 파일). MY-3 착수 전에 D가 범위를 정한다.
- Q-45 ①(입장만으로 스탬프가 찍히는지)이 "입장만으로"로 정해지면 M2의 스탬프 기준은 사실상 "방문 페이지에 들어온 날"이 되어, 기기 `visits`와 뜻이 가까워진다. 그때 M2를 다시 묻는다.
