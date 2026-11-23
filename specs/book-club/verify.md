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
