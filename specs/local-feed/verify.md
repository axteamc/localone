# local-feed 검증서 (verify.md)

- 기능: `local-feed` · 담당: B · 작성일: 2026-11-17
- 기준: 02 LOCAL-01·LOCAL-02·NFR-05, AC-PUBLISH·AC-COVER, `specs/local-feed/세부/<STEP>.md` 예외, `team/contracts/local-feed.md` P5
- 실행하지 않은 항목은 `미실행`으로 적는다. 가짜 응답 화면 테스트(jest)와 실제 서버 연결 테스트(pytest + 격리 DB)를 구분한다.

## LOCAL-1 (PR #126)

### 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 | 증거 | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LOCAL-01 | AC-PUBLISH 작성만으로 공개 안 됨 | 글쓰기 화면 | 이미지 고르고 올리기 전 | 서버 호출·행 없음 | createPost 0회 | `compose.test.tsx` "compose disables submit…" | 통과(jest) | 미확인 | 대기 |
| LOCAL-01 | AC-PUBLISH 사진·표지·단색 + 글자 | 격리 DB | #24 photo/cover/color | 201, Post 필드 전수 | 201 | `test_posts_create.py::test_create_photo_post_then_read_fields`, `…cover_uses_book_cover`, `…color_and_image_only_post` | 통과(서버) | — | — |
| LOCAL-01 | AC-PUBLISH 이미지만 올리기 | 본문·글자 없음 | #24 | 201, body null | 201 | `test_create_color_and_image_only_post`, jest "body input is collapsed…" | 통과 | 미확인 | 대기 |
| LOCAL-01 | AC-PUBLISH 철회 | 작성자 / 남 | #25 | 작성자 200·멱등, 남 403 무변경 | 일치 | `test_withdraw_*` | 통과(서버) | — | — |
| LOCAL-01 | AC-PUBLISH 철회 후 직접 URL·피드 차단 | 철회된 행 | #26·#27 | 안 보임 | `status=withdrawn` 저장까지 확인. 읽기 차단은 #26·#27(LOCAL-2)에서 검증 | `test_withdraw_by_author_hides_and_is_idempotent` | 미실행(LOCAL-2) | — | — |
| NFR-05 | AC-PUBLISH EXIF 위치 제거 | GPS EXIF JPEG | #23 | 저장본에 EXIF 없음 | 없음 | `test_upload_strips_exif_and_reencodes` | 통과(서버) | — | — |
| LOCAL-02 | AC-COVER 표지 있음 | cover_url 있는 책 | 책 표지 → 올리기 | cover로 전송, 서버가 책 표지 주소 사용 | 일치 | jest "choosing book cover…", `test_create_cover_uses_book_cover` | 통과 | 미확인 | 대기 |
| LOCAL-02 | AC-COVER 표지 없음 | cover_url null | 책 표지 → 올리기 | 제목·저자 표지 + 안내, color fill3 전송 | 일치 | jest "book without cover…", `test_book_without_cover_as_color_fill3_with_title_overlay`, `test_cover_without_book_cover_is_422` | 통과 | 미확인 | 대기 |
| LOCAL-02 | AC-COVER 제공자 오류 | 책 조회 실패 | #24 | 빈 성공 아님, 503/404 | 503·404 | `test_unknown_isbn_is_404_no_row` | 통과(서버) | — | — |

### 2. 명세서 예외 상황 점검

| 예외 # | 확인한 방법 | 문구 일치 | 기록 무변경 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 막힘 | jest "upload or create failure keeps inputs and retries", "413 shows photo too large"; 서버 413·503 | 예(`TEXT.failed`·`tooLarge`) | 서버: 파일 0·행 0 단언 | 통과 |
| 2 이미지 없음 | jest "compose disables submit…" | 예 | createPost 0회 | 통과 |
| 3 연타 | jest "double tap…"; 서버 `test_same_client_request_id_returns_same_post`(동시 4건) | 예(`올리는 중…`·`올렸어요`) | 행 1개 | 통과 |
| 4 비로그인·남의 글 | jest "signed out entry…", "author more menu…"; 서버 401·403 | 예 | 행 0·상태 그대로 | 통과 |
| 5 표지 없음 | 위 AC-COVER | 예 | `cover` 직접 전송 시 행 0 | 통과 |
| 6 내린 글 링크 | 상세(#27)는 LOCAL-2 | — | — | 미실행(LOCAL-2) |
| 7 쓰던 글 닫기 | jest "closing with unsaved input asks confirmation" | 예 | 계속 쓰기 시 입력 유지 | 통과 |

### 3. 명세서와 달라진 점

- 올린 직후 피드 대신 글쓰기 화면의 내 게시물 미리보기 + "피드 보기"(피드는 VISIT-2·LOCAL-2) — 계약 F16

### 4. 남은 문제

- `mobile/src/__tests__/routes.test.tsx`(D 담당)가 `/posts/new` 스텁 단언으로 실패 → 이슈 #129
- Android: 이 PC에 에뮬레이터·adb가 없어 미확인. 웹: `expo export --platform web` 성공, 시험용 화면을 브라우저로 띄워 보여 줌(가짜 로그인·가짜 응답). 실제 로그인·Supabase 저장소 연결은 키가 없어 미실행

## VISIT-2 (PR #132)

### 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 | 증거 | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-02 | 방문 페이지 머리 | #11 정독도서관, 거리 320 | 진입 | 이름 / "320m · 운영시간" + ⋯ | 일치 | `visit.test.tsx` "header shows name…" · 로컬 서버로 화면 띄움 | 통과 | 미확인 | 대기 |
| VISIT-02 | 방문 기록 하루 한 번·멘트 | 기록 없음 | 진입 | recordVisit 1번, 첫 방문 멘트 2.5초 | 일치 | "visit records once…", "ment card shows once…", "pickVisitMent table" | 통과(jest) · 화면에서 첫 방문 멘트 확인 | 미확인 | 대기 |
| VISIT-03 | 도서관 기본값 켜고 끄기 | — | ⋯ → 켜기 → 끄기 | 기기에 하나 | 일치 | `default-library.test.tsx` "menu toggles…", "…pressed twice changes once" | 통과(jest) | 미확인 | 대기 |
| VISIT-03 | 앱 시작 분기 | 기본 101 | 반경 안 / 다른 도서관만 / 위치 없음 / 사라짐 | 열기 / 풀기+안내 / 열기 / 끄기 | 일치 | "gate opens…", "gate releases…", "gate keeps default when location unavailable", "gate clears default when library vanished" | 통과(jest) | 미확인 | 대기 |
| — | AC-RACE | 101 지연, 102로 바꿈 | 101 늦게 도착 | 102 유지, 101 기록 없음 | 일치 | "late library response…", "late error and unmount…" | 통과(jest) | — | — |

### 2. 명세서 예외 상황 점검

| 예외 # | 확인한 방법 | 문구 일치 | 기록 무변경 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김(도서관 정보·피드) | "library info failure…", "feed loading, failure and empty are distinct" | 예 | 방문은 셈(G-#2), 새로고침은 다시 세지 않음 | 통과 |
| 1-1 없는 도서관 | "unknown library…", "bad route id…" | 예 | recordVisit 0번 | 통과 |
| 2 게시물 0개 | "empty feed shows guide…" · 화면 확인 | 예 | 가짜 게시물 없음 | 통과 |
| 3 연타 | "back pressed twice…", "back gesture overlapping press…", "menu default toggle pressed twice…" | — | 기본값 한 번만 | 통과 |
| 4 로그인 안 함 | "first post link and plus ask login…", "visit page renders signed out" · 화면 확인 | 예 | 이동 0번 | 통과 |
| 5 쉬는 날 | "header shows closed today…" | 예 | — | 통과 |
| 6 거리 없음 | "header hides distance…", "distance route parsing…" | 예 | — | 통과 |
| 7 처음 방문 | "visit records once…" · 화면 확인 | 예 | — | 통과 |

### 3. 명세서와 달라진 점

- 없음(⋯ 안내 문구·주변 조회 실패 처리 등 정해지지 않은 세부는 명세 검토 메모 `[Claude가 정함]`)

### 4. 남은 문제

- `routes.test.tsx`(D) `/libraries/[libraryId]` 스텁 단언 → #129에 수정안 댓글
- 홈 탭에 `DefaultLibraryGate`를 놓는 것은 A(library-visit V17) — 놓기 전에는 앱 시작 분기가 화면에서 동작하지 않음
- Android: 이 PC에 에뮬레이터·adb가 없어 미확인. 세 번째 방문 카드·앱 시작 분기는 화면에서 직접 보지 못함(날짜·위치가 필요), 자동 시험으로만 확인

## LOCAL-2 (PR #136)

- 기준: 02 LOCAL-03·04·05, 세부 명세 `specs/local-feed/세부/LOCAL-2.md` 예외 1~10, 계약 LOCAL-2 P5. 서버는 로컬 DB(5434) 실제 연결 시험, 앱은 가짜 응답 시험 + 로컬 서버(8001)·웹(8081) 화면 확인.

### 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 | 증거 | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LOCAL-03 | AC-FEED 최신순·공개만 | 공개 3·철회·숨김·다른 도서관 | #26 | 3개 최신순 | 일치 | `test_feed.py` `test_feed_latest_only_published` | 통과(서버) | — | — |
| LOCAL-03 | AC-FEED 커서 | 같은 시각 5개 | limit=2로 끝까지 | 5개 한 번씩 | 일치 | `test_feed_cursor_no_dup_no_gap_on_ties` | 통과(서버) | — | — |
| LOCAL-03 | AC-UI 2열·이미지만 | 데모 게시물 7개 | 방문 페이지 진입 | 2열 메이슨리, 제목·작성자·공감 수 없음 | 일치 | `feed.test.tsx` "post card renders image only…", `test_feed_item_has_no_author_or_count` · 화면 확인 | 통과 | 미확인 | 대기 |
| LOCAL-03 | AC-FEED 내리면 이어짐 | next_cursor 있음 | 스크롤 끝 두 번 | 다음 묶음 1번, 겹침 없음 | 일치 | "library feed paginates with cursor once per scroll end" | 통과(jest) | 미확인 | 대기 |
| LOCAL-03 | 길게 누르기 메뉴 | 책 있음/없음 | 길게 누르기·웹 호버 ⋯ | 아이콘 3개 + 책/저자 검색 또는 도서 없음 | 일치 | "compact menu with book…", "…without book…", "web hover shows dots…" · 화면 확인 | 통과 | 미확인 | 대기 |
| LOCAL-03 | 인기순 | — | sort=popular | 422(Q-31 전) | 일치 | `test_feed_popular_sort_is_422` | 통과(서버) | — | — |
| LOCAL-04 | 상세 구조 | 책 연결 글 | 상세 진입 | 이미지(‹만) → 액션 바(♡ 수·공유·⋯·저장) → 작성자 → 대여/구매 → 본문 | 일치 | `detail.test.tsx` "detail renders clean image top bar…" · 화면 확인 | 통과 | 미확인 | 대기 |
| LOCAL-04 | 대여 우선 | #14 어제 대출 가능 | 상세 | 대여 버튼이 구매 버튼보다 위, 구매는 "준비 중이에요" | 일치 | 같은 시험, "loan button opens live check…" | 통과 | 미확인 | 대기 |
| LOCAL-04 | 공감·북마크 | 로그인 | 두 번 빠르게 | 요청 1번, 다시 누르면 확인 없이 해제 | 일치 | "detail reaction and bookmark toggle…", `test_reaction_put_twice_one_row`, `test_bookmark_resave_updates_saved_at` | 통과 | 미확인 | 대기 |
| LOCAL-04 | 공유 | 웹, navigator.share 없음 | 공유 | 클립보드 + "링크를 복사했어요" | 일치 | "web share copies link…" | 통과(jest) | 미확인 | 대기 |
| LOCAL-05 | 같은 책 이어 읽기 | 같은 책 두 도서관 | 상세 아래 | "같은 책의 다른 글"이 "이 도서관의 다른 글"보다 위, 0개면 숨김 | 일치 | "detail shows same book posts first…", `test_same_book_posts_cross_library_exclude` | 통과 | 미확인 | 대기 |

### 2. 명세서 예외 상황 점검

| 예외 # | 확인한 방법 | 문구 일치 | 기록 무변경 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 피드 못 불러옴 | `visit.test.tsx` "feed loading, failure and empty are distinct" | 예 | — | 통과 |
| 2 게시물 0개 | `feed.test.tsx` "empty feed keeps VISIT-2 empty guide" | 예 | 가짜 게시물 없음 | 통과 |
| 3 없는 글 | `test_detail_unknown_is_not_found`, "unknown post shows not found" | 예 | — | 통과 |
| 4 내려진 글 | `test_detail_withdrawn_is_post_not_available`, "detail of withdrawn post shows unavailable…" | 예 | 본문 노출 없음 | 통과 |
| 5 연타 | `test_reaction_put_twice_one_row`(동시 4회), 앱 연타 시험 2종 | — | 행 1 | 통과 |
| 6 로그인 없이 | `test_reaction_requires_login`, "signed out … login prompt" 2종 | 예 | 행 0, 요청 0번 | 통과 |
| 7 탈퇴 중 | `test_reaction_while_withdrawing_is_403` | — | 행 0 | 통과 |
| 8 소장 조회 실패 | "availability failure shows unknown…" | 예 | — | 통과 |
| 9 공유 실패 | "web share failure shows retry message" | 예 | — | 통과 |
| 10 예스24 | "compact menu without book…", "detail renders clean image…" | 예 | 외부 호출 0번 | 통과 |

### 3. 명세서와 달라진 점

- 상세 경로에 `?libraryId=`(방문 중인 도서관) 추가, 상세에서 내린 글을 피드가 바로 감춤 — 세부 명세 검토 메모 `[구현 중 변경]`
- 02 LOCAL-03의 인기순 전환·LOCAL-04의 "도서 없음 구현 안 함"과 계약 H1(최신순만, Q-31)·H10(버튼 UI만, 2026-11-17 사용자 결정)이 다름 — 계약(D+B 확정판, 사용자 결정이 더 최근)을 따름

### 4. 남은 문제

- `routes.test.tsx`(D) `/posts/[postId]` 스텁 단언 → #129에 수정안 댓글
- Android: 이 PC에 에뮬레이터·adb가 없어 미확인
- 예스24 구매(M2), 인기순(Q-31), 북마크 모음(Q-56), 댓글(Q-57)

## VISIT-3 (PR #231)

- 기능: `local-feed` VISIT-3 오늘의 서가(책장)·방명록 카드 · 담당: B · 작성일: 2026-11-19
- 기준: 02 VISIT-03·VISIT-04, AC-VISIT·AC-MOD·AC-RACE, 세부 명세 `세부/VISIT-3.md` 예외 #1~#4, 계약 수정본 VISIT-3 P5
- 자동 시험은 서버(격리 로컬 DB `localone_v3`)와 앱(가짜 응답)으로 나눴다. "화면"은 Expo 웹 개발 서버를 실제로 띄워 주니어 브라우저로 연 것이다(P2: 운영 API 읽기 전용 중계, P3: 로컬 서버 + 연습용 데이터). Claude 쪽 화면 캡처 수단이 없어 픽셀 단위 겹침 점검은 하지 못했다.

### 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-04 | AC-VISIT | `#31` 세 장(순서 섞음) | 방문 페이지 열기·점 누르기 | 첫 장 요즘 읽은 책 → 테마 → 인기, 장마다 3권 | 시험 통과 | `bookshelf.test.tsx` `shelf shows recent reads then theme then popular` | 통과(시험) / 화면: 운영 #31(인기 도서 1장) 열어 보여 줌 | 미실행(에뮬레이터 없음) | 대기 |
| VISIT-04 | AC-VISIT | ① 빔 | 렌더 | 테마가 첫 장 | 시험 통과 | `shelf without recent reads starts at theme` | 통과(시험) | 미실행 | 대기 |
| VISIT-04 | AC-VISIT | `#31` 가짜 | 책 누름 ×2 | `/books/[isbn13]` 1번, "대출 가능"·"실시간" 없음 | 시험 통과 | `shelf book opens book detail`·`shelf hides missing pages…` | 통과(시험) | 미실행 | 대기 |
| VISIT-03 | AC-VISIT | 게시물·방명록 섞인 #32 | 방문 페이지 피드 | 방명록이 같은 한 칸 카드로 섞임 | 시험 통과, 로컬 서버 화면에서 섞여 보임 | `guestbook.test.tsx` `visit feed loads #32…`, `server/tests/test_feed_items.py` | 통과 | 미실행 | 대기 |
| VISIT-03 | AC-VISIT | 로그인 | `+` → 방명록 남기기 → 올리기 | 피드 맨 앞 내 카드 1개 | 시험 통과 | `guestbook double submit creates one card` | 통과(시험) / 실제 로그인 쓰기는 미실행(로컬에서 로그인 수단 없음) | 미실행 | 대기 |
| VISIT-03 | AC-VISIT | 내 글 | ⋯ → 지우기 → 확인 | 피드에서 사라짐, 서버 `withdrawn` | 시험 통과 | `only my guestbook card has menu…`, `test_withdraw_twice_stays_withdrawn_and_leaves_feed` | 통과(시험) | 미실행 | 대기 |
| VISIT-03 | AC-MOD | 숨김(`hidden`) 글 | #32 조회·#34 철회 | 피드에 없음, 철회 404·그대로 | 시험 통과 | `test_withdrawn_and_hidden_entries_never_appear_in_feed_items`, `test_withdraw_of_hidden_entry_is_404_and_stays_hidden` | 해당 없음(서버) | — | — |
| VISIT-03 | AC-VISIT | 비로그인 | #32 조회 | `mine` 모두 false, `user_id` 없음 | 시험 통과 | `test_guestbook_response_has_no_user_id` | 해당 없음(서버) | — | — |
| LIB-04 | AC-RACE | 101 피드·책장 늦게 | 102로 바꿈 | 102 화면이 101 결과로 덮이지 않음 | 시험 통과 | `library switch drops late feed response`, `library switch drops late shelf response…` | 통과(시험) | 미실행 | 대기 |

### 2. 명세서 예외 상황 점검

| 명세서 예외 # | 확인한 방법 | 화면 문구가 명세서와 같은가 | 기록이 안 바뀌었나(막는 동작) | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김 | 책장 503 → 책장 자리만 실패·다시 해 보기(#31만 다시) / 올리기 끊김 → 글 유지·같은 id 재시도 / 지우기 끊김 → 카드 유지 | 같음("책장을 불러오지 못했어요"·"다시 해 보기"·"방명록을 올리지 못했어요. 다시 해 주세요"·"방명록을 지우지 못했어요. 다시 해 주세요") | 재시도는 같은 `client_request_id`(서버 멱등) | 통과(`shelf failure only affects shelf`, `shelf retry reloads only shelf`, `guestbook failure keeps text…`, `withdraw failure keeps card…`) |
| 2 없음 | 책장 `pages: []` / 피드 0개 | 같음("아직 이 도서관 책장이 비어 있어요"·"빌린 책을 반납하면 여기에 쌓여요", 빈 피드는 VISIT-2 그대로) | — | 통과(`empty shelf keeps shelf area with message`, `visit.test.tsx` 빈 피드) |
| 3 연타 | 올리기 2번(응답 전) / 책 2번 / 지우기 2번(응답 전) / 같은 id 두 번 서버 | — | 행 1개(`test_guestbook_create_is_idempotent_by_client_request_id`), 앱 호출 1번 | 통과 |
| 4 로그인·남의 것 | 비로그인 방명록 고르기 / 남의 카드 ⋯ / 남의 글 철회 직접 호출 | 같음("로그인하면 방명록을 남길 수 있어요") | 비로그인 401·행 0, 남의 글 404·`published` 그대로 | 통과(`signed out guestbook write shows login prompt`, `test_guestbook_write_requires_auth`, `test_withdraw_of_other_or_missing_entry_is_same_404`) |

### 3. 명세서와 달라진 점

- 없음(명세 결정 1은 2026-11-19 D 변경으로 명세서 자체를 고친 뒤 구현). 기본값 처리: 피드-책장 띠는 블러 없이 페이드만(블러 라이브러리 미승인), 쓰는 창은 화면 위쪽.

### 4. 남은 문제

- to:D #230 방명록 카드 색 PANTONE 공식 sRGB 대조(지금은 서드파티 값, 첫 후보 11-0602)
- 미실행: Android 실기기·에뮬레이터 화면(이 PC에 없음), 실제 로그인 상태의 방명록 올리기·지우기 화면(로컬 로그인 수단 없음 — 자동 시험으로만 확인), 블러 성능 Q-46

## VISIT-4 (PR #293)

- 대상 커밋: `7005005` · 작성일: 2026-11-24 · 기준: 02 VISIT-05·VISIT-07·LOCAL-03(방문 기록 카드 북마크), AC-STAMP·AC-UI·AC-VISIT, `specs/local-feed/세부/VISIT-4.md` 예외 #1~#4, `team/contracts/local-feed.md` VISIT-4 P5
- 서버: `pytest` 격리 DB(`localone_v4`) 760개 통과. 앱: `jest` 848개 중 847 통과(실패 1은 이 브랜치와 무관한 #295), `tsc` 통과. 웹 화면은 연습 DB(`localone_demo4`, 도서관 101 oxford·102 modern) + `expo start --web`으로 직접 열어 봄(비로그인 화면). 로그인 흐름은 jest(가짜 응답)로만 확인.
- Android: 에뮬레이터·기기를 이 PC에서 못 띄워 **미실행** — CI `Android 빌드 점검`으로 빌드만 확인. iOS: D 확인 대기.

### 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 | 증거 | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-05 | AC-STAMP 하루 한 번 | 로그인, 같은 도서관 | #36 세 번(공개·비공개·공개) | 행 1개, 마지막 공개 | 일치 | `test_stamps.py::test_stamp_is_one_per_user_library_seoul_day` | 통과(서버) | — | — |
| VISIT-05 | AC-STAMP 날짜는 서울 기준 | 시계 23:59/00:01 KST | 찍기 | 서버 서울 날짜 | 일치 | `test_stamp_date_comes_from_server_seoul_today`, `test_delayed_visibility_change_after_midnight_returns_409_without_creating_row` | 통과(서버) | — | — |
| VISIT-05 | AC-STAMP 다른 도서관 | 101·102 | 각각 찍기 | 도서관마다 따로 | 일치 | `test_today_stamp_ignores_yesterday_and_other_users` | 통과(서버) | — | — |
| VISIT-05 | AC-STAMP 인증 문구 없음 | 스탬프 카드 | 렌더 | "인증"·"확인됨" 없음 | 없음 | `stamp.test.tsx` "stamp card is one cell with seal nickname time and no menu" | 통과(jest) | 미실행 | 대기 |
| VISIT-05 | AC-STAMP 본인만(비공개는 남에게 안 보임) | A 비공개 | B·비로그인 #32 | 카드 없음 | 없음 | `test_private_stamp_never_appears_to_others` | 통과(서버) | — | — |
| VISIT-05 | 누르면 바로 나만 보기 → "피드에도 남기기"로 공개 | 로그인 | 버튼 → 안내 글자 버튼 | private 후 public, 카드 1개 | 일치 | jest "stamp press saves private at once and toast switches to public" | 통과(jest) | 미실행 | 대기 |
| VISIT-05 | 남긴 날 "오늘 다녀감" + ⋯ 바꾸기 | #35 stamped | ⋯ → 바꾸기 두 번 | 표시·카드 따라 바뀜, 비공개면 즉시 숨김 | 일치 | jest "stamped today shows label and menu flips visibility", "visibility change refreshes sorted feed…" | 통과(jest) | 미실행 | 대기 |
| LOCAL-03 | 방문 기록 카드 북마크 | 공개 스탬프 | #69 PUT/DELETE, 카드 연타 | 멱등, 1번만 호출 | 일치 | `test_stamp_bookmark_requires_public_stamp_and_updates_saved_at_on_resave`, jest "stamp card bookmark toggle blocks rapid double tap" | 통과 | 미실행 | 대기 |
| VISIT-07 | AC-VISIT 도서관마다 룩 | 101 oxford / 102 modern | 방문 페이지 열기 | 바탕·카드·곡률·책장·버튼이 그 룩 | 일치(웹 직접 봄 + jest) | jest "visit page uses look tokens for cards radii and shelf" | 통과 | 미실행 | 대기 |
| VISIT-07 | 이어 읽기에서 방문 중 도서관 룩 유지 | 방문 101, 102 글 | 상세 열기 | 상세 oxford | 일치 | jest "continue reading keeps visiting library look" | 통과(jest) | 미실행 | 대기 |
| VISIT-07 | 홈과 무관 | 방문 뒤 | 홈 카드·글쓰기 | 기본 룩 | 일치 | jest "home and compose keep default look" | 통과(jest) | 미실행 | 대기 |
| VISIT-07 | 룩 없음·모르는 값 | `look` null/"neon"/조회 실패 | 렌더 | warm | 일치 | jest "unknown or null look falls back to warm" | 통과(jest) | 미실행 | 대기 |
| VISIT-07 | 룩별 대비 | 4룩 | 대비 계산 | 본문 4.5:1 이상 | 본문(`text`·`inkStrong`·`inkSoft`) 통과. `inkMuted` 작은 글자는 4룩 모두 미달(검토 메모) | jest "all looks keep body text contrast" | 통과(본문) | — | — |
| — | AC-RACE | 도서관 X 룩 조회 지연 | Y로 이동 후 X 응답 | Y 룩 유지 | 일치 | jest "library switch drops late look response", "old scope cannot change current stamp or feed" | 통과(jest) | 미실행 | 대기 |
| NFR-01 | AC-UI 비로그인·실패 상태 | 비로그인 / 503 | 누르기 | 로그인 안내 창 / 버튼 그대로 + 안내 | 일치 | jest "signed out stamp shows login sheet without request", "stamp failure keeps button and shows retry notice" | 통과(jest) + 웹 비로그인 화면 직접 봄 | 미실행 | 대기 |

### 2. 명세서 예외 상황 점검

| 예외 # | 확인한 방법 | 문구 일치 | 기록 무변경 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| 1 끊김 | jest "stamp failure keeps button and shows retry notice", "visibility change failure keeps label…" | 예(`남기지 못했어요. 다시 눌러 주세요`) | 피드 카드 없음 | 통과 |
| 2 아무것도 없음 | jest "empty feed still shows stamp button" | 예 | — | 통과 |
| 3 연타 | jest "stamp button press sets visibility once", "rapid double tap on toast public keeps one public card"; 서버 UPSERT | 예 | 행 1개·카드 1개 | 통과 |
| 4 비로그인·남의 것 | jest "signed out stamp shows login sheet without request"; 서버 `test_stamp_endpoints_require_auth`; 남의 카드 메뉴 0개 | 예(`로그인하면 다녀왔어요를 남길 수 있어요`) | 요청 0번·행 0 | 통과 |

### 3. 명세서와 달라진 점

- 없음(결정 1·2는 D 결정으로 B 반영 — 명세서에 이미 기록)

### 4. 남은 문제

- #295 (to:D) `home-list.test.tsx` 색 코드 시험 실패 — main `033e415` 탓, 이 브랜치 무관
- Android 실제 기기 확인 미실행(이 PC에서 에뮬레이터 못 띄움) — CI 빌드 점검만
- 허용 파일 밖이라 기본 룩 그대로인 조각(`AskDefaultCard`·`DefaultLibraryGate`·경로 `contentStyle`), `inkMuted` 대비 미달 — 명세 검토 메모
