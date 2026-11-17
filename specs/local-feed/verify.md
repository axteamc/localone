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
