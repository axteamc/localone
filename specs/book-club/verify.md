# 작은 모임 (`book-club`) 검증서 (verify.md)

- 기능: `book-club` CLUB-1 · 담당: C · 대상 PR: #252 · 작성일: 2026-11-23
- 기준: 02 CLUB-01·AC-CLUB, 명세서 `specs/book-club/세부/CLUB-1.md` §3 예외, 계약서 `contracts/book-club.md` CLUB-1 P5(발행 본문 `3a52e16`)
- 실행하지 않은 항목은 `미실행`으로 적고 통과로 쓰지 않는다. "서버 시험"은 컨테이너 Postgres 17 위 pytest, "로컬 서버"는 같은 코드를 `APP_ENV=local` 컨테이너(포트 8010)로 띄워 실제 HTTP로 부른 것, "화면 시험"은 가짜 응답 jest다.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| CLUB-01 | 만들기(이름 필수, 미정 가능) | 로그인 | #50 이름만 / 일정·책·정원 함께 | `201`, 미정이면 `starts_at:null` | 서버 시험 통과 | `server/tests/test_clubs.py:117,130` | 화면 시험 통과(만들기 화면 접힘·미정 스위치) | 미실행(로그인 화면에 못 감, `android-emulator-setup`) | 대기 |
| CLUB-01 | 승인 없는 즉시 참가·멱등 | 열린 모임 | #55 두 번 | `200` 두 번, 행 1 | 서버 시험 통과 | `test_club_participation.py:20` | 화면 시험 통과(`join button sends once`) | 미실행 | 대기 |
| CLUB-01 | 정원 경합 | 정원 1, 두 사람 동시 | #55 | 한 명만 | 서버 시험 통과(`FOR UPDATE` 빼면 실패 확인) | `test_club_participation.py:28` | — | — | — |
| CLUB-01 | 참가 취소 규칙(미정 언제든, 확정 뒤 시작 전, 바뀐 시작 시각 기준) | 미정/확정/시작 뒤 | #56 | `200`/`200`/`409 CLUB_STARTED` | 서버 시험 통과 | `test_club_participation.py:53,77` | 화면 시험 통과(`started club keeps…`) | 미실행 | 대기 |
| CLUB-01 | 확정·변경·취소 안내 | 참가 2명 | #52·#54 | 참가자에게만 알림함 안내 | 서버 시험 통과(실제 `add_inbox_items`) | `test_clubs.py:259,278` | — | — | — |
| CLUB-01 | 피드에 모임 카드 | 모임 2개 | #32 | `kind="club"` 섞여 나옴 | 로컬 서버: 정독도서관 피드에 모임 2개 / 서버 시험 통과 | `test_clubs.py:346,361`, 로컬 서버 `GET /libraries/101/feed` | 통과(방문 페이지에서 카드 확인, 날짜 제일 크게) | 미실행 | 대기 |
| CLUB-01 | 비로그인 보기 가능·쓰기 막힘 | 비로그인 | #51 / #55 | `200` / `401` | 로컬 서버: `200` / `401` | 로컬 서버 실행 결과 | 통과(모임 화면 "로그인하고 참가하기") | 미실행 | 대기 |
| AC-CLUB | 명단에 `user_id` 없음 | 참가 1 | #51 | 닉네임·`is_me`만 | 로컬 서버: `[{nickname, is_me}]` | `test_clubs.py:202` | — | — | — |

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김 | 화면 시험 `join failure shows retry…`, `create failure keeps input…`, `comment failure keeps text` | 같음(`CLUB_TEXT.joinFailed` 등) | 명단에 "나" 없음·입력 유지 | 통과 |
| 2 빈 결과 | 화면 시험 `empty participants and comments…` | 같음 | — | 통과 |
| 3 연타 | 화면 시험 `join button sends once`, 서버 시험 멱등 | 같음("참가하는 중…") | 행 1 | 통과 |
| 4 비로그인·남의 것 | 화면 시험 `signed out sees login prompt…`, 서버 `club writes require auth`·`only host…`·`comment delete is author only` | 같음 | 행 0·무변경 | 통과 |
| 5 정원 참·마감 | 화면 시험 `full closed canceled…`, 서버 `full canceled and ended…`·`auto close…` | 같음 | 행 0 | 통과 |
| 6 취소된 모임 | 화면 시험(취소 이유 표시), 서버 `cancel requires reason…`, 카드 `undecided and closed cards…`("취소됨") | 같음 | 기록 남음 | 통과 |

## 3. 명세서와 달라진 점

- 마이그레이션 번호 `NNNN` → `0018`(main에 `0016`·`0017` 있음). 동작 차이 없음.

## 4. 남은 문제

- `+` 고르기 창의 "모임 만들기" 줄과 혼합 피드 `club` 열쇠·높이는 B 파일이라 `to:B` #253으로 요청. `VisitScreen.tsx`의 `openClub`은 `TODO(연결): B`.
- B 서버 시험 `test_feed_items_bad_params_are_422[params2-cursor]`이 "모르는 kind" 예시로 `club`을 써서 CLUB-1에서 실패 → `to:B` #250. 이 때문에 CI `서버 시험`이 실패 상태.
- Android 확인 미실행: 로그인한 화면에 에뮬레이터로 갈 수 없음(구글 로그인). 비로그인 모임 화면·피드 카드는 같은 공통 코드.

---

# CLUB-2 검증

- 기능: `book-club` CLUB-2 · 담당: C · 대상 PR: #284 · 작성일: 2026-11-24
- 기준: 02 CLUB-02·AC-CLUB·AC-MOD, 명세서 `specs/book-club/세부/CLUB-2.md` §3 예외, 계약서 `contracts/book-club.md` CLUB-2 P5(발행 본문 `68a6c60`)
- "서버 시험"은 컨테이너 Postgres 17 위 pytest(전체 724 passed), "화면 시험"은 가짜 응답 jest(book-club 4개 파일 65개 통과), "웹 미리보기"는 같은 화면 파일을 커밋하지 않은 사본으로 로그인·서버 대신 예시 기록을 넣어 Expo 웹에 띄워 헤드리스 Chrome으로 찍은 것이다. 이 PC는 로그인을 할 수 없어 실제 서버와 이어진 로그인 화면은 `미실행`.

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| CLUB-02 | 종료 안내 한 번(만든 사람·참가자) | 끝난 모임, 참가 2 | 알림함 두 번 읽기 | 세 사람 각 1개 | 서버 시험 통과 | `server/tests/test_club_records.py:100,111` | 웹 미리보기: 알림함 "모임이 끝났어요" 줄 | 미실행(로그인 화면에 못 감) | 대기 |
| CLUB-02 | 기록·후기 나만 보기, 공유는 따로 고침 | 후기 저장·공유 | #60·#61·#62 | 남 `404`·비로그인 `401`, 게시물 본문 그대로 | 서버 시험 통과 | `test_club_records.py:141,193,214` | 화면 시험 통과, 웹 미리보기: 기록 → 후기 → 다음 모임 순서 | 미실행 | 대기 |
| CLUB-02 | 다음 모임 복사·새 시각·자동 참가 없음 | 끝난 모임 | #63 | 이름·책·도서관 복사, 장소 이전 값, 참가 0 | 서버 시험 통과 | `test_club_records.py:230,248,268` | 화면 시험 통과(`share and next buttons send once`) | 미실행 | 대기 |
| CLUB-02 | 다음 모임 제안은 만든 사람만 | 만든 사람 / 참가자 | 기록 화면 | 제안 카드 / 별도 버튼 | 화면 시험 통과 | `mobile/src/features/book-club/__tests__/club-record.test.tsx:160,168` | 웹 미리보기: 만든 사람 "다음 모임 만들어 볼까요?" | 미실행 | 대기 |
| AC-CLUB | 출석: 불참자만, 즉시 제한, 시각만으로 불참 없음 | 끝난 모임 참가 3 | #65 | 1명 `no_show`·제한 1, 나머지 `attended` | 서버 시험 통과 | `server/tests/test_club_restrictions.py:65,82,125` | 화면 시험 통과(확인창 전 0번) | 미실행 | 대기 |
| AC-CLUB | 180일 누적 3·7·30일·영구, 해제·취소 제외 | 불참 이력 | #65 | 단계별 `ends_at` | 서버 시험 통과 | `test_club_restrictions.py:98,111` | — | — | — |
| AC-MOD | 제한 중 모든 모임 참가·댓글 막힘, 해제 뒤 됨 | 활성 제한 | #55·#58 | `403 PARTICIPATION_RESTRICTED` / `200` | 서버 시험 통과 | `test_club_restrictions.py:137,149,155,166` | 화면 시험 통과(버튼 자리·댓글 칸 문구) | 미실행 | 대기 |
| AC-MOD | 댓글 처리 요청 한 번, 승인 전 댓글 그대로 | 만든 사람 | #66 두 번 | 행 1, 댓글 보임 | 서버 시험 통과 | `test_club_restrictions.py:188,199` | 화면 시험 통과 | 미실행 | 대기 |
| AC-MOD | 재검토 요청 본인만 한 번, 내 제한 목록 | 제한 3건 | #67·#68 | `201`→`200`, 남 `404` | 서버 시험 통과 | `test_club_restrictions.py:215` | 화면 시험 통과(`restriction notice … once`) | 미실행 | 대기 |
| CLUB-02 | 알림함 최신순·열면 모두 읽음·90일·누르면 모임 화면 | 새 2 + 지난 2 | `/inbox` | 점 2개, `#49` 1번 | 화면 시험 통과 | `mobile/src/features/book-club/__tests__/inbox.test.tsx:77,103,110,121` | 웹 미리보기: 새 안내 2줄에만 점 | 미실행 | 대기 |
| CLUB-02 | 기기 알림 권한 없이 알림함 | 권한 거부 | `/inbox` | 목록 보임 | 화면 시험 통과 | `inbox.test.tsx:133` | — | 미실행 | 대기 |

## 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김 | 화면 시험 `review save failure keeps text and retries`, 알림함 `empty failure and signed out states` | 같음("후기를 저장하지 못했어요. 다시 해 주세요.") | 쓰던 후기 유지 | 통과 |
| 2 빈 결과 | 화면 시험 `record screen order…`(다음 모임 없음 문구), 알림함 빈 상태 | 같음 | — | 통과 |
| 3 연타 | 화면 시험 `share and next buttons send once`, 서버 시험 멱등(`test_club_records.py:193,248`) | 같음("올리는 중…") | 게시물·모임 행 1 | 통과 |
| 4 남의 것 | 화면 시험 `outsider record state`, 서버 `test_club_records.py:129,141` | 같음 | 후기 행 0 | 통과 |
| 5 비로그인 | 화면 시험 `signed out record shows login first`(부르지 않음, `returnTo`) | 같음 | — | 통과 |
| 6 기록 못 불러옴 | 화면 시험 `record load failure and retry` | 같음 | — | 통과 |

## 3. 명세서와 달라진 점

- 마이그레이션 번호 `NNNN` → `0021_club_records`. 동작 차이 없음.
- "내 참가 제한"은 따로 경로 없이 알림함 맨 위에 보인다(P4 파일 목록에 경로 없음).
- 댓글 운영 제한 문구의 "n일"은 `Restriction`에 시작 시각이 없어 빼고 만료 시각만 보인다(`[계약 보완 필요]`).

## 4. 남은 문제

- 내 정보 알림 아이콘(`mobile/src/features/my-collection/InboxBell.tsx:18-19`)은 A 파일이라 이 PR 머지 뒤 켜야 한다.
- Android·실제 로그인 화면 확인 미실행: 이 PC에서 로그인할 수 없음. 화면은 공통 코드.
- 앱 전체 jest의 `library-visit` "no hardcoded colors" 1개 실패는 main에서도 같음(내 파일 아님, CI는 jest를 돌리지 않음).
