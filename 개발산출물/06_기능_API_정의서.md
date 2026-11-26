# 06. 기능·API 정의서

> 상태: **M1 엔드포인트 목록(기준선 B0~B2) + M2 선행 설계 확장(2026-11-19 D 확정, [C-75](스펙_변경_이력.md))**. 담당: D.
> **이 문서가 M1·M2 엔드포인트의 존재(경로·메서드)·인증·목적과 공통 오류 코드의 원본이다.** 기능별 계약서(`../team/contracts/<기능>.md` §3·§4 / C2·C3·C6)는 요청·응답 필드, 기능별 오류, 함수 시그니처, 시험을 구체화한다. 계약서가 이 문서와 달라져야 하면 **이 문서를 먼저 고치고**([스펙 변경 이력](스펙_변경_이력.md) 한 행) 계약서를 맞춘다.
> 입력: [02 요구사항](02_요구사항_정의서.md), [유저 플로우](부록/유저_플로우.md), [05 DB 설계서](05_ERD_및_DB설계서.md), [모호점 해소 기록](모호점_해소_기록.md), `../team/contracts/*.md` M1 발행판 및 M2 D 기준선([M2 선계약 밑그림](결과/M2_선계약_밑그림.md)).

상태 낱말(`확정` / `기본값(Claude)` / `미확인(임시)` + Q-번호)은 [05 §0](05_ERD_및_DB설계서.md)과 같다. **주니어(A·B·C) 영역 엔드포인트는 경로·메서드·인증·목적까지만 적는다.** 필드·개수·정렬 세부·화면 동작은 세부 명세서와 계약서의 몫이다.

## 1. 공통 규칙

| 항목 | 값 | 상태 |
| --- | --- | --- |
| 경로 접두어 | `/api/v1` | `확정`(`PROJECT.md` §3) |
| 인증 | `Authorization: Bearer <Supabase access JWT>`. 서버는 JWKS 공개키로 검증하고 자체 토큰을 만들지 않는다 | `확정`(Q-52) |
| 인증 칸의 뜻 | **필수**: `get_current_user`(없으면 401) / **선택**: 토큰이 있으면 내 상태(공감·북마크 여부)를 더하고 없어도 200 / **없음**: 토큰을 보지 않는다 | `기본값(Claude)` |
| 사용자 확정 | 본문·쿼리의 사용자 id는 읽지 않는다. 내 것은 경로에 `/me/`를 쓴다 | `확정`(02 §3) |
| 오류 응답 | `{"error": {"code", "message", "detail"}}` | `확정`(`server/app/common.py`) |
| 날짜·시각 | 날짜는 `YYYY-MM-DD`(서울), 시각은 ISO 8601 초 단위 `+09:00` | `확정`(NFR-03, AUTH-1 §3.1) |
| 목록 넘기기 | 피드·내 목록은 커서(`?cursor=&limit=`), 응답에 `next_cursor`(없으면 `null`). 도서 검색만 제공자에 맞춰 `?start=`(20건씩 "더 보기") | 검색 20건 `확정`(2026-11-13) · 커서 방식 `기본값(Claude)` · `limit` 값 `미확인(임시)` Q-21 |
| 연타·재시도 | 만들기·누르기는 같은 요청을 다시 보내도 한 건이다. 방법은 엔드포인트마다 DB 제약(05 §3.2)으로 흡수하고 두 번째 응답도 성공으로 준다 | `확정`(02 §6) · 방법 `기본값(Claude)` |
| 타인 것·없는 것 | 개인 리소스는 둘 다 `404 NOT_FOUND`로 같다 | `확정`(USR-02) |
| 외부 조회 실패 | **오류가 아니라 200 안의 상태값 `unknown`**이다(소장·대출). 목록 전체를 못 받은 경우만 503 | `확정`(AC-UNKNOWN) |
| 좌표 | 주변 조회는 `lat`·`lng`를 쿼리로 받고 저장·로그하지 않는다 | `확정`(NFR-05) |
| OpenAPI | 꺼져 있다(`openapi_url=None`). 11/19 뒤 검토 | `미확인(임시)`([기준선 §5](기준선.md) 예외 1) |

## 2. 엔드포인트 목록 (M1 — 표 30행)

담당의 괄호는 계약서를 쓰는 Step이다. 조회 엔진(D)의 엔드포인트는 C·A·B의 화면이 부른다.

### 2.1 기반·계정 (D)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 1 | `GET /api/v1/ready` | 없음 | 서버·DB 준비 상태 | — | `확정`(구현됨) |
| 2 | `POST /api/v1/auth/session` | 필수(토큰 검증만, `users` 행 없어도 됨) | 로그인 직후 `users` 행을 만든다(있으면 그대로) | AUTH-01 | `확정`(AUTH-1 계약서 초안) |
| 3 | `GET /api/v1/me` | 필수 | 내 계정(`user_id`·`status`·`created_at`) | AUTH-01 | `확정`(AUTH-1 계약서 초안) |
| 4 | `GET /api/v1/me/settings` | 필수 | 내 주변 반경·반납 집계 동의 읽기 | LIB-02, LOAN-03 | `기본값(Claude)` · 동의 칸 `미확인(임시)` Q-49 |
| 5 | `PATCH /api/v1/me/settings` | 필수 | 위 설정 바꾸기 | LIB-02, LOAN-03 | 같음 |
| 6 | `DELETE /api/v1/me` | 필수 | 탈퇴(한 트랜잭션): 계정 `withdrawn`(맨 앞) → 내 공개 게시물 철회 → 내 빌릴 예정·좋아요·북마크 삭제 → 닉네임 `탈퇴한 이웃`. 응답 `user_id`·`status`·`withdrawn_at`. 두 번째부터 `403 ACCOUNT_WITHDRAWN`. `users` 행은 남김(같은 계정 재로그인 차단) | AUTH-03 | 엔드포인트·응답 `확정`(AUTH-3 계약서 C2·C3) · 처리 범위 `기본값(Claude)`(AUTH-3 C5) · 보관·백업 기간은 `미확인(임시)` Q-23(출시 관문) |

- **로그아웃(AUTH-02)은 서버 엔드포인트가 없다**(`기본값(Claude)`, AUTH-2 G1·G2): 앱이 진행 중 요청을 끊고 상태를 비운 뒤 Supabase `signOut({ scope: "local" })`(이 기기만)을 부르고, 기능이 등록한 정화(`registerSignOutCleanup`: 기기 예약 알림·캐시)를 돌린다. 철회된 세션 거부는 `get_current_user`가 `users` 조회와 같은 트랜잭션에서 Supabase `auth.sessions`에 토큰의 `session_id`·`sub` 행이 있는지 보고, 없으면 `401 AUTH_INVALID`(`확정`, AUTH-2 G3). 설정 `AUTH_SESSION_CHECK`는 production 기본 켜짐·끄면 시작 거부, local·test 기본 꺼짐(로컬 docker DB에는 `auth` 스키마가 없음). 엔드포인트가 필요해지면 이 표에 더한다.
- 내 프로필·수집 모음 조회(`MY-1`)와 프로필 수정(`#38`·`#39`, `MY-2`)은 §2.7에 둔다.

### 2.2 조회 엔진 — 도서·도서관·소장 (D가 만들고 C·A·B가 쓴다)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 7 | `GET /api/v1/books/search?q=&start=` | 없음 | 도서 검색(카카오 책 검색, C-66), 20건씩. 책마다 서지·표지 주소·소개·출판 연도(C-64) | LIB-01 | `확정` · 응답 필드·한도 `미확인(임시)` Q-41 |
| 8 | `GET /api/v1/books/{isbn13}` | 없음 | 도서 상세(서지·표지 주소·소개·출판 연도, C-64) | LIB-01, LOCAL-02 | `확정` · 표지 조건 Q-41 |
| 9 | `GET /api/v1/books/recommendations?library_id=&source=` | 없음 | 검색 진입·홈 하단 창 추천. `library_id`가 있으면 해당 도서관 인기 도서(없으면 전국 폴백, 현행 유지). `library_id`가 없고 `source=auto`(기본, Y-4 A안 확정)이면 YES24 스테디셀러 캐시(`basis_label`에 출처 포함) → 실패·미설정 시 정보나루 전국 인기대출로 자동 폴백. `source`: `auto`\|`yes24_steady`\|`yes24_bestseller`\|`library_loan` | LIB-01(C-46 E1~E3) | `확정` (2026-11-24 D, [C-81](스펙_변경_이력.md)) |
| 10 | `GET /api/v1/libraries?lat=&lng=&radius_km=` 또는 `?dtl_region=` 또는 `?q=` | 없음 | 주변(반경 3 또는 5km, 거리순) 또는 시군구의 도서관 목록, 또는 도서관 이름 일부로 찾기(`q`, 지도 홈 "도서관 찾기" 창). 지도 핀·"내 주변 도서관"·위치 거부 때 목록이 같은 엔드포인트를 쓴다. 세 방식은 함께 쓰지 않는다 | LIB-02, VISIT-01 | `확정`(2026-11-13: 직선거리, 핀과 목록에 같은 반경) · `q` 추가 `확정`(2026-11-16 D, [C-63](스펙_변경_이력.md)) · 지도에 반경 밖 도서관을 보일지 `미확인(임시)` Q-51(계약 `core.md` K7에서 반경 안만으로 임시) |
| 11 | `GET /api/v1/libraries/{library_id}` | 없음 | 도서관 하나(방문 페이지 헤더: 이름·오늘 운영시간·휴관 원문과 계산 결과; M2 `M2-0-P3`에서 도서관 룩 `look` 필드 추가) | VISIT-02·07, LIB-02 | `확정`(Q-22, 2026-11-19 D) |
| 12 | `GET /api/v1/books/{isbn13}/availability?scope=nearby&lat=&lng=&radius_km=` | 없음 | 주변 도서관별 소장·대출 가능(세 갈래)·출처·조회 시각·데이터 기준일·"실시간 확인" 주소 | LIB-03·04·06·07 | `확정` · 기준일 필드 `미확인(임시)` Q-18 · 주소 규칙 `미확인(임시)` Q-48 |
| 13 | `GET /api/v1/books/{isbn13}/availability?scope=city&dtl_region=` | 없음 | "현재 도시 내 모든 도서관" 재검색. 응답한 곳만 보여 주고 나머지는 `unknown` | LIB-07 | `확정`(도시 = 시군구, 2026-11-13) · 호출량은 실측 `미확인(임시)` Q-18 |
| 14 | `GET /api/v1/books/{isbn13}/availability?library_id=` | 없음 | 도서관 하나의 소장·대출 가능(게시물 상세의 대여 경로, 방문 중인 도서관 우선) | LIB-03, LOCAL-04 | `확정` |
| 15 | `GET /api/v1/books/{isbn13}/purchase-link` | 없음 | 예스24 상품 직링크(`kind="product"`, `book_purchase_links` 캐시 또는 `itemDetail` 실측 조회) → 미보유·비판매·오류·한도 초과 시 기존 검색 주소(`kind="search"`) 폴백(항상 200) | LOCAL-04 | `확정` (2026-11-24 D, Q-41 ② 해소, [C-81](스펙_변경_이력.md)) |

- 12~14는 경로가 같고 `scope`·`library_id`로 나뉜다(하나의 핸들러). 늦은 응답 폐기(LIB-04, AC-RACE)는 서버가 아니라 앱이 요청 세대로 처리한다(`기본값(Claude)`).
- 호출 상한(정보나루 일 21,000건)을 넘으면 새로 부르지 않고 캐시에 있는 것만 주며 나머지는 `unknown`으로 표시한다. 전부 막혔을 때만 `429 PROVIDER_LIMIT`(`기본값(Claude)`).
- 지역 이름으로 보는 위치를 옮기는 검색(`library-visit` 결정 13)은 서버 엔드포인트를 두지 않고 앱에 넣은 시군구 코드 표에서 찾는다(`기본값(Claude)`, 정보나루 지역 코드는 고정 목록). 도서관 **이름**으로 찾는 것은 앱 표로 할 수 없어 10번의 `q`를 쓴다(2026-11-16 D, C-63, VISIT-1 결정 1).
- 10~15번의 라우터와 조회 엔진은 모두 D가 만든다(2026-11-16 D 결정, 계약 `../team/contracts/core.md` LIB-0). C는 화면과 16~22번을 맡는다.

### 2.3 빌릴 예정·반납 비서 (C)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 16 | `GET /api/v1/me/loan-plans` | 필수 | 내 빌릴 예정 목록. `include_unassigned=true`일 때만 도서관 미지정 예정 포함(`library: null`, C-84) | LIB-05 | `확정` |
| 17 | `POST /api/v1/me/loan-plans` | 필수 | 책 + 도서관으로 예정 저장(같은 조합은 한 건). `library_id` 생략·`null`이면 도서관 미지정 예정(같은 책 한 건, C-84) | LIB-05, AC-PLAN | `확정` |
| 70 | `POST /api/v1/me/loan-plans/availability` | 필수 | 빌릴 예정 여러 권(예정 ID, 생략 시 활성 전체, 서로 다른 ISBN 20권까지)의 주변 소장 일괄 조회. `libSrchByBook` 소장 1차 + 상위 후보 `bookExist`, 요청당 40건·동시 8건 공유. 항상 `200` + `complete`·`unknown_pairs`, 소장 권수 → 대출 가능 권수 → 거리 → ID로 최대 3곳(표시는 거리순). 초과 `422 detail="plan_ids"`, 남의 예정 `404`. 주변 도서관 0곳이면 `books[].status = not_held`, `fallback_counts`는 `holding`·`loanable` 중 하나라도 `unknown`인 쌍(C-85) | LIB-05, AC-PLAN | `확정` (2026-11-24 D, C-84·C-85, `book-search.md` LIB-3b·`core.md` K24) |
| 71 | `GET`·`PATCH /api/v1/me/settings` | 필수 | 내 설정. 지금은 `{"club_notices": bool}` 하나(모임 안내 받기, 기본 true). `PATCH` 본문은 그 칸만(그 밖·빈 본문 422). 끄면 새 모임 안내(`club_*`)가 알림함에 쌓이지 않고, 다시 켜면 그다음 안내부터. 반납 알림·처음 크게 보일 도서관은 기기 설정이라 여기 없음 | 02 §3 계정/설정(제안 채택 2026-11-25) | `확정` (2026-11-25 사용자, C-90, `core.md` K25) |
| 72 | `PATCH /api/v1/posts/{post_id}` | 필수 | 내 게시물의 본문·이미지 위 글자만 고친다(책·이미지는 그대로). 보낸 칸만, 빈 글자·null은 비움, 길이 80·2000. 남의 글 403, 없으면 404 `NOT_FOUND`, 철회·숨김 404 `POST_NOT_AVAILABLE`. 응답은 #27 상세 | LOCAL-04 | `확정` (2026-11-25 사용자, C-91, `local-feed.md` H9a) |
| 73 | `POST /api/v1/places/search` | 공개 | 대략 위치용 장소 키워드 검색. 요청·필수 응답 필드·좌표와 지역 표기·0건·422/429/503은 team `contracts/core.md` P8 대략 위치 계약. | VISIT / LIB | 로컬 구현 · 공급자 실연동 미검증 |
| 18 | `DELETE /api/v1/me/loan-plans/{plan_id}` | 필수 | 예정 해제(상태를 `released`로) | LIB-05 | `확정` · 행을 지울지 상태만 바꿀지는 `기본값(Claude)`(상태) |
| 19 | `GET /api/v1/me/loans?status=` | 필수 | 내 대출(대출 중·지난 대출). D-day·연체는 서버가 계산해 준다. 앱은 이 목록으로 기기 알림을 맞춘다 | LOAN-01·05, AC-NOTIFY | `확정` |
| 20 | `POST /api/v1/me/loans` | 필수 | "빌렸어요": 대출일 = 서버 서울 오늘, 예정일 = +14일(추정). 예정에서 왔으면 연결 | LOAN-01, AC-LOAN·AC-DATE | `확정` · 같은 책 중복 기준 `미확인(임시)` Q-21 |
| 21 | `PATCH /api/v1/me/loans/{loan_id}` | 필수 | 반납 예정일 고치기(대출일 이전 불가) | LOAN-02 | `확정` |
| 22 | `POST /api/v1/me/loans/{loan_id}/return` | 필수 | "반납했어요". 동의했고 도서관이 있으면 반납 집계 +1(`loans.py` 안 D 블록 `M2-0-P4`, `RETURN_STATS_WRITE_ENABLED = False` 기본 잠금) | LOAN-03, AC-RETURN | `확정` (2026-11-19 D) · 집계 켜는 시점은 `미확인(임시)` Q-49 |

기기 예약 알림(LOAN-04·05)은 서버 엔드포인트가 없다(앱이 19의 목록으로 예약한다). 알림 시각은 `미확인(임시)` Q-19.

### 2.4 지역 SNS (B)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 23 | `POST /api/v1/uploads/post-images` | 필수 | 직접 찍은 사진 올리기. 서버가 EXIF 위치를 지우고 저장 경로를 돌려준다 | LOCAL-01, NFR-05 | 동작 `확정` · 저장소·용량·형식 `미확인(임시)` Q-53 |
| 24 | `POST /api/v1/posts` | 필수 | 올리기(이때 공개된다). 이미지 종류 사진/표지/단색 + M2(`LOCAL-3`) `template`(`minimal`·`ink`) 및 `reading_log_id`, 본문 없이도 됨 | LOCAL-01·02·07, AC-PUBLISH | `확정` (2026-11-19 D, C-75) |
| 25 | `POST /api/v1/posts/{post_id}/withdraw` | 필수(작성자만) | 철회. 바로 목록·직접 주소에서 안 보인다 | LOCAL-01, R10 | `확정` |
| 26 | `GET /api/v1/libraries/{library_id}/posts?sort=latest&cursor=&expand=` | 선택 | 기본은 그 도서관의 공개 게시물. 홈 첫 조회에서 선택 `expand=region`으로 부족분을 같은 구 → 시·도 순으로 보충(M1 방문 페이지 및 홈 하단 창 `VISIT-1b` `useHomeFeed`가 사용; M2 방문 페이지 혼합 피드는 `#32`로 분리) | LOCAL-03, VISIT-02·06 | 범위별 최신순·홈 보충(2026-11-23 D) `확정`(2026-11-19 D) · `sort=popular`는 `미확인(임시)` Q-31 · 파일럿 공개 범위 `미확인(임시)` Q-54 |
| 27 | `GET /api/v1/posts/{post_id}` | 선택 | 게시물 상세(본문·작성자 닉네임/공개 프로필 id/사진·공감 수·내 공감·내 북마크·책·`posts.origin`을 반영한 `from_reading_log`) | LOCAL-04·07, MY-4 | `확정` · 철회·숨김은 `404 POST_NOT_AVAILABLE` |
| 28 | `GET /api/v1/books/{isbn13}/posts?exclude=&cursor=` | 선택 | 같은 책의 다른 공개 게시물(다른 도서관 포함) | LOCAL-05 | `확정` |
| 29 | `PUT /api/v1/posts/{post_id}/reaction` · `DELETE …/reaction` | 필수 | 공감 누르기·취소(몇 번 눌러도 결과 같음) | LOCAL-06, R14 | `확정` |
| 30 | `PUT /api/v1/posts/{post_id}/bookmark` · `DELETE …/bookmark` | 필수 | 게시물 북마크 저장·해제 | LOCAL-03, C-46 D4 | `확정` (`0006`) |

- 12~14는 한 경로이고 29·30은 각각 메서드가 둘(`PUT`·`DELETE`)이다. 메서드·경로 쌍으로 세면 M1 기본은 30개다.
- 내 프로필과 내 게시물·좋아요·북마크 3탭 조회(`MY-1`)는 C-46 F2 확정으로 §2.7에 추가됐다. 철회는 상세 화면에서 한다.
- 상세가 "펼쳐지고 주변에 피드가 이어지는" 것은 26·28을 다시 부르는 것으로 하고 전용 엔드포인트를 두지 않는다(`기본값(Claude)`).
- 공유 링크(C-46 D2)의 주소 모양은 `/posts/{post_id}`(`local-feed.md` LOCAL-2 H11)로 확정됐다.

### 2.5 도서관 방문 (A)

2026-11-16([C-61](스펙_변경_이력.md)): 방문 페이지는 B의 화면이다. A(홈 화면)는 M1에 자기 서버 엔드포인트가 없고 파사드 홈은 10번, 홈 하단 창(VISIT-1b)은 9번·26번(M2 `READ-2`에서 `#41` 내 최근 독서 기록 추가)을 쓴다. 방문 페이지(B)의 머리는 11번, 피드는 M1에서 26번·M2(`VISIT-3`~)에서 `#32`를 쓴다. 도서관 기본값·보는 위치는 서버에 보내지 않는다(05 §6).

### 2.6 방문 페이지 M2 — 책장 · 혼합 피드 · 방명록 · 스탬프 · 신고 (B `local-feed` / D `core`)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 31 | `GET /api/v1/libraries/{library_id}/shelf` | 없음 | 방문 페이지 하단 "오늘의 서가"(책장, 2026-11-25 C-92 3장 체제): ① 인기 도서(`popular`, YES24 베스트셀러 `basis_label` "YES24 베스트셀러") ② 테마(`theme`, 소장 조건·전용 우선) ③ 최근 대출 도서(`recent_reads`, 정보나루 도서관별 최근 30일 대출, 만화·시리즈 제외, `basis_label` "{도서관명} · 최근 30일 대출"), 빈 페이지 제외, 페이지당 최대 4권. 앱 반납 집계는 읽지 않음 | VISIT-04 | `확정` (2026-11-25 사용자, C-92, core SRV-0 C2 `#31`·M2-0 Z8) |
| 32 | `GET /api/v1/libraries/{library_id}/feed?cursor=&limit=` | 선택 | 방문 페이지 혼합 피드(B `VISIT-3` `post`·`guestbook` → `VISIT-4` `stamp` → `CLUB-1` `club`), 정렬 `(published_at DESC, kind ASC, id DESC)` 복합 커서. `#26`은 홈 하단 창용으로 그대로 유지 | VISIT-03·05, LOCAL-03, CLUB-01 | `확정` (2026-11-19 D, C-75) |
| 33 | ~~`POST /api/v1/libraries/{library_id}/guestbook`~~ | 필수 | **폐기(2026-11-25 C-92 후속, 사용자 "제거")** — 방명록은 스탬프 한마디(#36 `body`)로 합쳤다. 이미 있는 방명록은 피드에 보이고 #34로 지운다 | VISIT-03 | `폐기` (2026-11-25 사용자) |
| 34 | `POST /api/v1/guestbook/{entry_id}/withdraw` | 필수(작성자만) | 내 방명록 글 철회(멱등, 남의 글·없는 글은 같은 `404 NOT_FOUND`, B `VISIT-3`) | VISIT-03, R10 | `확정` (2026-11-19 D) |
| 35 | `GET /api/v1/libraries/{library_id}/stamps/today` | 필수 | 오늘(서울 날짜) 내 방문 스탬프 조회(B `VISIT-4`) | VISIT-05 | `확정` (2026-11-19 D) |
| 36 | `PUT /api/v1/libraries/{library_id}/stamps/today` | 필수 | 오늘 방문 스탬프("다녀왔어요") 찍기·공개 여부(`private`/`public`) 바꾸기(멱등, 날짜는 서버 `today_kst()`, B `VISIT-4`). **C-92**: 선택 `body`(한마디 1~140자, 키 없으면 그대로·null/빈 글자는 비움, 141자 이상 422 `body`) — 스탬프=방명록 통합, 응답 `MyStamp.body`·피드 `StampItem.body` | VISIT-05, R11 | `확정` · 입장 조건·표시 이름 `미확인(임시)` Q-45 |
| 37 | `POST /api/v1/reports` | 필수 | 게시물·방명록·모임·모임 댓글·공개 스탬프·사용자(`user`, 대상은 공개 `profile_id`) 신고. 중복 신고는 멱등이며 본인이나 내 글 신고는 `422` | LOCAL-08, AC-MOD, MY-4 | `확정` (LOCAL-4, MY-4 C-97) |
| 69 | `PUT /api/v1/stamps/{stamp_id}/bookmark` · `DELETE …/bookmark` | 필수 | 공개 방문 스탬프 카드 북마크 저장·해제(멱등, 재저장 시 `saved_at` 갱신, 비공개·없는 스탬프 `PUT`은 `404`, B `VISIT-4`) | C-46 D3~D5 | `확정` (2026-11-19 D, C-75) |

### 2.7 내 정보 모음 (`my-collection`, A)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| MY-1a | `GET /api/v1/me/profile` | 필수 | 내 프로필(`user_id`·`nickname`·`bio`·`avatar_url`·`updated_at`, 팔로워 수·이메일 미포함) | C-46 F1, USR-02 | `확정` (구현됨, MY-1) |
| MY-1b | `GET /api/v1/me/posts?cursor=&limit=` | 필수 | 내가 올린 공개 게시물 목록(`published_at DESC, id DESC`) | C-46 F2, USR-02 | `확정` (구현됨, MY-1) |
| MY-1c | `GET /api/v1/me/reactions?cursor=&limit=` | 필수 | 내가 좋아요한 공개 게시물 목록(`created_at DESC, id DESC`, 철회·숨김 글은 숨기고 재공개 시 복원) | C-46 F2·D5, USR-02 | `확정` (구현됨, MY-1) |
| MY-1d | `GET /api/v1/me/bookmarks?cursor=&limit=` | 필수 | 내가 북마크한 공개 항목 목록(`saved_at DESC`, MY-1은 `item_kind="post"`, `MY-3`에서 `stamp_bookmarks` `item_kind="stamp"` 통합) | C-46 F2·D3~D5, R16 | `확정` (구현됨 MY-1, 스탬프 통합은 MY-3 2026-11-19 D) |
| 38 | `PATCH /api/v1/me/profile` | 필수 | 내 프로필 부분 수정(닉네임·한 줄 소개·`avatar_path`, 보낸 칸만 갱신, A `MY-2`) | C-46 F1 | `확정` (2026-11-19 D) |
| 39 | `POST /api/v1/uploads/avatar` | 필수 | 내 프로필 사진 올리기(서버가 EXIF 위치 제거 후 `avatars/<user_id>/<uuid>.jpg` 반환, `post_storage.py` 재사용, A `MY-2`) | C-46 F1, NFR-05 | `확정` (2026-11-19 D) |
| 40 | `GET /api/v1/me/visited-libraries?cursor=&limit=` | 필수 | 내 도서관 방문 모음(스탬프 1개 이상 또는 공개 방명록 1개 이상 남긴 도서관, `last_on DESC, library_id ASC`, A `MY-3`) | 00 제안 표, VISIT-03·05, USR-02 | `확정` (2026-11-19 D, C-75) |
| 74 | `GET /api/v1/users/{profile_id}` | 선택 | 활성 사용자의 공개 닉네임·소개·사진·탭별 공개 글 수·본인 여부. 없는 계정과 탈퇴 계정은 `404 NOT_FOUND` | MY-4, C-97 | `확정` (`my-collection.md` MY-4 C2·C3·C6) |
| 75 | `GET /api/v1/users/{profile_id}/posts?origin=&cursor=&limit=` | 선택 | 작성자의 공개 글 목록을 `origin=post\|reading_log`로 구분. `published_at DESC, id DESC` 커서 | MY-4, C-97 | `확정` (`my-collection.md` MY-4 C2·C3·C6) |

### 2.8 독서 기록 (`reading-log`, A)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 41 | `GET /api/v1/me/reading-logs?library_id=&cursor=&limit=` | 필수 | 내 비공개 독서 기록 목록(전체 또는 도서관별 "내 발자취", 홈 하단 창 "내 최근 독서 기록" 겸용, A `READ-1`·`READ-2`) | READ-01·02, VISIT-06, Q-44 | `확정` (2026-11-19 D) |
| 42 | `GET /api/v1/me/reading-logs/{log_id}` | 필수 | 내 비공개 독서 기록 단건(타인·없는 기록은 같은 `404 NOT_FOUND`, B `LOCAL-3` 작성 화면에서도 호출, A `READ-1`) | READ-01, LOCAL-07 | `확정` (2026-11-19 D) |
| 43 | `POST /api/v1/me/reading-logs` | 필수 | 비공개 독서 기록 쓰기(`client_request_id` 멱등, 도서관 자동 보정 금지, 미래 날짜 불가, A `READ-1`) | READ-01, R8 | `확정` (2026-11-19 D) |
| 44 | `DELETE /api/v1/me/reading-logs/{log_id}` | 필수 | 내 독서 기록 삭제(연결된 공개 게시물은 유지되고 `posts.reading_log_id`만 `NULL`, A `READ-1`) | READ-01, 04 관계 표 | `확정` (2026-11-19 D, C-75) |
| 45 | `PATCH /api/v1/me/reading-logs/{log_id}` | 필수 | 내 독서 기록 부분 수정(책 `isbn13`은 변경 불가, A `READ-1`) | READ-01 | `확정` (2026-11-19 D) |
| 46 | `GET /api/v1/me/reading-logs/stats` | 필수 | 내 독서 기록 기초 통계(전체·올해·이번 달·기록 있는 도서관별 수·최근 읽은 날짜, 0건은 모두 `0`, A `READ-2`) | READ-02 | `확정` (2026-11-19 D) |

### 2.9 알림함 · 운영 화면 · 반납 집계 설정 (`core` M2-0, D)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 47 | `GET /api/v1/me/inbox/unread` | 필수 | 읽지 않은 알림 유무 `{ "has_unread": bool }`(내 정보 머리 `InboxBell` 점 표시용, D `M2-0-P1` / A `MY-2`) | C-47 G1, R19 | `확정` (2026-11-19 D, C-75) |
| 48 | `GET /api/v1/me/inbox?cursor=&limit=` | 필수 | 내 알림함 목록(모임 확정·변경·취소·종료·다음 모임·운영 처리 안내; 읽을 때 지난 종료 안내 1회 생성, D `M2-0-P1` / B `CLUB-2`) | C-46 C5, C-47 G1, R19 | `확정` (2026-11-19 D, C-75) |
| 49 | `POST /api/v1/me/inbox/read` | 필수 | 내 알림 읽음 처리(`{ "ids": [...] }` 또는 `{ "all": true }`, 멱등, D `M2-0-P1` / B `CLUB-2`) | C-47 G1, R19 | `확정` (2026-11-19 D) |
| OPS-1 | `GET /api/v1/ops/reports?status=open` · `POST /api/v1/ops/reports/{id}/resolve` | 필수(운영자만, 비운영자 `404`) | 신고 목록 조회와 처리. 사용자 신고는 계정 상태·닉네임을 표시하고 기각만 할 수 있다 | LOCAL-08, AC-MOD, MY-4 | `확정` (C-75, C-97) |
| OPS-2 | `POST /api/v1/ops/targets/{kind}/{id}/hide` · `POST …/restore` | 필수(운영자만, 비운영자 `404`) | 게시물·방명록·모임·댓글·공개 스탬프(`stamp`, C-92 후속) 운영 숨김 및 복구(사유 필수, `moderation_actions` 기록, 숨김 시 작성자 알림함 안내, D `M2-0-P2`) | LOCAL-08, R10·R19 | `확정` (2026-11-19 D) |
| OPS-3 | `POST /api/v1/ops/club-comment-requests/{id}/decide` | 필수(운영자만, 비운영자 `404`) | 모임 댓글 운영 요청 처리(삭제만 / 삭제와 참가 제한 / 기각, D `M2-0-P2`) | C-46 B1·B2·B6 | `확정` (2026-11-19 D) |
| OPS-4 | `POST /api/v1/ops/restrictions` · `POST /api/v1/ops/restrictions/{id}/lift` | 필수(운영자만, 비운영자 `404`) | 참가·댓글 제한 생성 및 해제(사유 필수, 운영자만 해제 가능, D `M2-0-P2`) | C-46 B1~B5, R18 | `확정` (2026-11-19 D) |
| OPS-5 | `PUT /api/v1/ops/libraries/{id}/look` | 필수(운영자만, 비운영자 `404`) | 도서관 룩(`modern` 등) 운영자 지정·재배정(D `M2-0-P3`) | VISIT-07 | `확정` (2026-11-19 D) |
| OPS-6 | `POST /api/v1/ops/shelf-themes` · `PUT /api/v1/ops/shelf-themes/{id}` | 필수(운영자만, 비운영자 `404`) | 서가 테마 등록·수정(공통 최대 20권, 전용 최대 3권, 같은 범위·우선순위의 기간 겹침 시 `409 THEME_OVERLAP`, D `M2-0-P3` 후속) | LIB-01(C-46 E1), VISIT-04 | `확정` (2026-11-23 D, 적용 전) |
| SET-R | `PUT /api/v1/me/settings/return-stats` | 필수 | 반납 집계 동의 설정(`{ "consent": bool }`, D `M2-0-P4`) | LOAN-03, VISIT-04 | `확정` · 동의 세부 `미확인(임시)` Q-49 |

### 2.10 작은 모임 (`book-club`, B)

| # | 메서드·경로 | 인증 | 목적 | 요구사항 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 50 | `POST /api/v1/libraries/{library_id}/clubs` | 필수 | 도서관 회차별 모임 만들기(일정·장소 미정 가능, `client_request_id` 멱등, B `CLUB-1`) | CLUB-01, C-46 A1 | `확정` (2026-11-19 D) |
| 51 | `GET /api/v1/clubs/{club_id}` | 선택 | 모임 상세(정보·상태·참가자 닉네임 명단·내 참가 상태, `user_id` 미노출, B `CLUB-1`) | CLUB-01 | `확정` (2026-11-19 D) |
| 52 | `PATCH /api/v1/clubs/{club_id}` | 필수(만든 사람만) | 모임 정보·일정·장소 수정(시작 후 `starts_at` 변경 시 `409 CLUB_STARTED`, 확정·변경 시 참가자 알림함 안내, B `CLUB-1`) | CLUB-01, C-46 A1·A3·A4 | `확정` (2026-11-19 D) |
| 53 | `POST /api/v1/clubs/{club_id}/close` | 필수(만든 사람만) | 모임 조기 모집 마감(멱등, B `CLUB-1`) | C-46 A5 | `확정` (2026-11-19 D) |
| 54 | `POST /api/v1/clubs/{club_id}/cancel` | 필수(만든 사람만) | 종료 전 모임 취소(사유 필수, 참가자 알림함 안내, 취소 기록 유지, B `CLUB-1`) | C-46 A6, R17 | `확정` (2026-11-19 D) |
| 55 | `PUT /api/v1/clubs/{club_id}/participation` | 필수 | 승인 없는 즉시 참가(`FOR UPDATE` 정원 경합 차단, 마감·정원 초과 시 `409`, 제한 중 `403`, 멱등, B `CLUB-1`) | CLUB-01, C-41, C-46 A5·B2 | `확정` (2026-11-19 D) |
| 56 | `DELETE /api/v1/clubs/{club_id}/participation` | 필수 | 참가 취소(미정이면 언제든, 확정 후에는 시작 전까지만, 시작 후 `409 CLUB_STARTED`, 멱등, B `CLUB-1`) | C-42, C-46 A2 | `확정` (2026-11-19 D) |
| 57 | `GET /api/v1/clubs/{club_id}/comments?cursor=&limit=` | 선택 | 모임 댓글 목록(`created_at ASC, id ASC`, B `CLUB-1`) | CLUB-01, C-43 | `확정` (2026-11-19 D) |
| 58 | `POST /api/v1/clubs/{club_id}/comments` | 필수 | 모임 댓글 쓰기(참가 여부 무관, 제한 중 `403`, `client_request_id` 멱등, B `CLUB-1`) | CLUB-01, C-43, C-46 B4 | `확정` (2026-11-19 D) |
| 59 | `DELETE /api/v1/club-comments/{comment_id}` | 필수(작성자만) | 내 모임 댓글 삭제(B `CLUB-1`) | CLUB-01 | `확정` (2026-11-19 D) |
| 60 | `GET /api/v1/clubs/{club_id}/record` | 필수(참가자·만든 사람) | 종료된 모임 기록 및 내 비공개 후기 조회(종료 전 `409 CLUB_NOT_ENDED`, B `CLUB-2`) | CLUB-02, C-46 C1 | `확정` (2026-11-19 D) |
| 61 | `PUT /api/v1/clubs/{club_id}/review` | 필수(참가자·만든 사람) | 내 비공개 모임 후기 쓰기·수정(멱등, B `CLUB-2`) | CLUB-02, C-46 C1 | `확정` (2026-11-19 D) |
| 62 | `POST /api/v1/clubs/{club_id}/review/share` | 필수(참가자·만든 사람) | 내 후기를 공개 게시물 한 건으로 올리기(`client_request_id` 멱등, 이후 원본·게시물 각각 수정, B `CLUB-2`) | C-46 C1·C6 | `확정` (2026-11-19 D) |
| 63 | `POST /api/v1/clubs/{club_id}/next` | 필수(참가자·만든 사람) | 다음 회차 모임 만들기(이름·소개·책·도서관 복사, 이전 참가자 중 취소·제한 제외하고 `club_next` 알림, 자동 참가 없음, B `CLUB-2`) | CLUB-02, C-40, C-46 C2~C4 | `확정` (2026-11-19 D) |
| 64 | `GET /api/v1/clubs/{club_id}/next` | 선택 | 이미 만들어진 다음 회차 모임 목록(`created_at ASC`, B `CLUB-2`) | C-46 C3 | `확정` (2026-11-19 D) |
| 65 | `PUT /api/v1/clubs/{club_id}/attendance` | 필수(만든 사람만) | 만든 사람의 출석 확인(출석 체크만으로 패널티 자동 부과 금지, B `CLUB-2`) · #60의 명단 버전 불일치 시 `409 CLUB_ATTENDANCE_ROSTER_CHANGED`, 출석·제한 무변경(CLUB-2 계약 C6) | C-46 A7, R17 | 골격 `확정` · 출석·판정 세부 `미확인(임시)`(C-46 §8-1·3) |
| 66 | `POST /api/v1/club-comments/{comment_id}/moderation-request` | 필수(만든 사람만) | 모임 댓글 운영 처리 요청(댓글당 1회 멱등, 승인 전 댓글 그대로 표시, B `CLUB-2`) | C-46 B1·B6 | `확정` (2026-11-19 D) |
| 67 | `POST /api/v1/me/restrictions/{restriction_id}/review-request` | 필수(본인) | 내 참가 제한에 대한 운영자 재검토 요청(선택 글 500자, 운영자만 열람, 멱등, B `CLUB-2`) | C-46 B5 | `확정` (2026-11-19 D) |
| 68 | `GET /api/v1/me/restrictions` | 필수(본인) | 내 참가·댓글 제한 내역 조회(사유·만료 시각 포함, B `CLUB-2`) | C-46 B2·B5, R18 | `확정` (2026-11-19 D) |

## 3. 공통 오류 코드

기능별 오류(예: 날짜 역전)는 계약서 §4에서 이 표의 코드를 쓰고, 표에 없는 코드가 필요하면 이 표에 먼저 더한다.

| 코드 | HTTP | 언제 | 화면 문구(기본) | DB | 상태 |
| --- | --- | --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | `Authorization` 헤더 없음·형식 다름 | "로그인이 필요해요." | 무변경 | `확정`(AUTH-1 초안) |
| `AUTH_INVALID` | 401 | 서명·발급자·대상·역할·형식 불일치 | "로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요." | 무변경 | `확정`(AUTH-1 초안) |
| `AUTH_EXPIRED` | 401 | 토큰 만료 | 문구 없이 갱신 뒤 한 번 재시도 | 무변경 | `확정`(AUTH-1 초안) |
| `AUTH_NOT_REGISTERED` | 401 | 토큰은 맞지만 `users` 행 없음 | 문구 없이 `POST /auth/session` 뒤 한 번 재시도 | 무변경 | `확정`(AUTH-1 초안) |
| `ACCOUNT_WITHDRAWN` | 403 | 탈퇴한 계정 | "탈퇴한 계정이에요." | 무변경 | `기본값(Claude)`(AUTH-3이 다시 봄) |
| `AUTH_UNAVAILABLE` | 503 | JWKS를 받지 못함 | "로그인 확인이 잠시 안 돼요. 잠시 뒤 다시 시도해 주세요." | 무변경 | `확정`(AUTH-1 초안) |
| `FORBIDDEN` | 403 | 로그인은 했지만 할 수 없는 일(남의 게시물 철회 등 **공개** 리소스) | "할 수 없는 요청이에요." | 무변경 | `기본값(Claude)` |
| `NOT_HOST` | 403 | 모임 만든 사람이 아닌데 수정·마감·취소·출석 확인·댓글 운영 요청 호출 | "모임을 만든 사람만 할 수 있어요." | 무변경 | `확정` (`book-club.md` CLUB-1·2, 2026-11-19 D) |
| `PARTICIPATION_RESTRICTED` | 403 | 모임 참가·댓글 제한 기간 중 참가 또는 댓글 작성(`detail`에 만료 시각 또는 빈 문자열) | "지금은 참가와 댓글이 제한돼 있어요." | 무변경 | `확정` (`book-club.md` CLUB-1·2, 2026-11-19 D) |
| `NOT_FOUND` | 404 | 없는 경로, 없는 것, **타인 소유의 개인 리소스**(둘을 구분하지 않음), 비운영자의 `/ops/*` 호출 | "찾을 수 없어요." | 무변경 | `확정`(구현됨, USR-02, M2-0 Z4) |
| `POST_NOT_AVAILABLE` | 404 | 철회·운영 숨김·삭제된 게시물 | "더 이상 공개되지 않는 게시물이에요." | 무변경 | `기본값(Claude)`(02 §6) |
| `METHOD_NOT_ALLOWED` | 405 | 허용되지 않는 메서드 | "허용되지 않는 요청 방식이에요." | 무변경 | `확정`(구현됨) |
| `CONFLICT` | 409 | 지금 상태에서 할 수 없는 변경(이미 반납한 대출의 예정일 수정 등) | "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요." | 무변경 | `기본값(Claude)`(02 §6 "충돌 안내 후 재조회") |
| `ALREADY_PUBLISHED` | 409 | 같은 독서 기록에서 이미 공개된 게시물이 있는데 다시 올림 | "이미 올린 기록이에요." | 무변경 | `확정` (`local-feed.md` LOCAL-3, 2026-11-19 D) |
| `CLUB_FULL` | 409 | 정원이 다 찬 모임에 참가 | "정원이 다 찼어요." | 무변경 | `확정` (`book-club.md` CLUB-1, 2026-11-19 D) |
| `CLUB_CLOSED` | 409 | 마감·취소·종료된 모임 참가, 또는 취소된 모임의 다음 모임·출석 | "모집이 마감된 모임이에요." | 무변경 | `확정` (`book-club.md` CLUB-1·2, 2026-11-19 D) |
| `CLUB_STARTED` | 409 | 확정된 모임의 시작 시각이 지난 뒤 참가 취소 또는 시작 시각 변경 | "이미 시작된 모임이에요." | 무변경 | `확정` (`book-club.md` CLUB-1, 2026-11-19 D) |
| `CLUB_NOT_ENDED` | 409 | 아직 종료되지 않은 모임의 기록·후기·다음 모임 생성 | "모임이 끝난 뒤에 쓸 수 있어요." | 무변경 | `확정` (`book-club.md` CLUB-2, 2026-11-19 D) |
| `THEME_OVERLAP` | 409 | 같은 범위(공통 또는 같은 도서관)·같은 우선순위에서 서가 테마 노출 기간이 겹침 | "같은 기간에 이미 활성 테마가 있어요." | 무변경 | `확정` (`core.md` M2-0-P3, 2026-11-19 D) |
| `VALIDATION_ERROR` | 422 | 필수값 누락·형식 오류·날짜 역전·잘못된 ISBN. `detail`에 필드 이름 | "요청 형식이 올바르지 않아요."(화면은 필드별 문구로 바꿔 보인다) | 무변경 | `확정`(구현됨) |
| `PAYLOAD_TOO_LARGE` | 413 | 사진이 용량 상한을 넘음 | "사진이 너무 커요." | 무변경 | `미확인(임시)` Q-53(상한 값) |
| `PROVIDER_LIMIT` | 429 | 외부 호출 상한에 걸려 줄 것이 하나도 없음 | "지금은 조회가 많아요. 잠시 뒤 다시 시도해 주세요." | 무변경 | `기본값(Claude)` |
| `PROVIDER_UNAVAILABLE` | 503 | 목록 자체를 못 받음(도서 검색·도서관 목록). 소장·대출의 일부 실패는 오류가 아니라 `unknown` | "정보를 가져오지 못했어요. 다시 시도해 주세요." | 무변경 | `기본값(Claude)`(AC-UNKNOWN) |
| `DB_TIMEOUT` · `DB_UNAVAILABLE` | 503 | DB 응답 지연·연결 실패 | "데이터베이스에 연결하지 못했어요." | 무변경(트랜잭션 롤백) | `확정`(구현됨) |
| `INTERNAL_ERROR` | 500 | 예상하지 못한 오류 | "문제가 생겼어요." | 무변경(롤백) | `확정`(구현됨) |

- 연타·재시도로 같은 것을 다시 만들려는 요청은 **오류가 아니라 성공**으로 답한다(§1).
- 화면 문구의 `기본값(Claude)`은 세부 명세서가 화면에 맞게 다시 정할 수 있다. 코드와 HTTP 상태는 바꾸지 않는다.

## 4. 화면 ↔ 엔드포인트 (M1·M2 여정)

| 여정(유저 플로우) | 화면 | 엔드포인트 | 담당 |
| --- | --- | --- | --- |
| §2 방문 (M1) | 파사드 홈 → 큐브 → 방문 페이지 · 홈 하단 창 | 10 + (9 · 26) → 11 + 26 | A(파사드 홈·하단 창 화면), B(방문 페이지 화면·26), D(9·10·11) |
| §2 방문 (M2 확장) | 방문 페이지(혼합 피드 · 오늘의 서가 · 방명록 · 스탬프 · 스탬프 북마크 · 도서관 룩 · 신고) | 11(`look`) + 31 + 32 + 33·34 + 35·36·69 + 37 | B(방문 페이지 M2 화면·32~37·69), D(11 `look`·31) |
| §3 책 확인 | 검색 진입 → 결과 → 상세 → 소장 조회 → 도시 재검색 | 9 → 7 → 8 → 12 → 13 | C(화면), D |
| §3 빌릴 예정 | 소장 조회 결과 → 담기 → 내 예정 | 17 → 16, 18 | C |
| §4 반납 비서 | 빌렸어요 → D-day → 예정일 수정 → 반납했어요 | 20 → 19 → 21 → 22(+ SET-R) | C(화면·19~22), D(22 집계 블록·SET-R) |
| §5 게시물 | 글쓰기 → 올리기(사진·표지·단색·템플릿) → 철회 | (23 / 42) → 24 → 25 | B |
| §1 순환 | 피드 → 상세 → 대여(소장 조회)·구매·이어 읽기·공감·북마크 | 26/32 → 27 → 14 · 15 · 28 · 29 · 30 | B(화면), D(14·15) |
| §6 독서 기록 (M2) | 독서 기록 탭(전체·도서관별·통계) → 쓰기·상세 → 템플릿 게시 · 홈 최근 기록 | 41 · 46 → 43 · 42 · 45 · 44 → 24 | A(독서 기록·홈 최근 기록), B(24 템플릿 작성) |
| §7 계정 · 내 정보 | 로그인 → 내 정보(프로필·3탭·프로필 수정·방문 모음·알림 아이콘) → 로그아웃 → 탈퇴 | 2 → MY-1a~d · 38 · 39 · 40 · 47 → (서버 없음) → 6 | D(2·6·47), A(내 정보 화면·MY-1a~d·38~40) |
| §8 작은 모임 · 알림함 (M2) | 방문 피드 모임 카드 → 모임 상세(참가·댓글·일정·취소) → 종료 기록·후기·다음 모임·출석·운영 요청 → 알림함 `/inbox` | 32 → 50~59 → 60~68 → 48 · 49 | B(모임·알림함 화면·50~68), D(47~49 서버) |
| §9 운영 화면 (M2) | 앱 안 `/ops` (신고 처리·숨김/복구·댓글 운영 요청 결정·제한 생성/해제·룩 지정·서가 테마) | OPS-1~OPS-6 | D |

## 5. 아직 쓰지 않은 것

- 요청·응답 필드 표와 실제 호출 예시: 계약서가 정하고 구현 뒤 여기에 옮긴다.
- 플랫폼 분기 표 취합(계약서 §3.3): 지금은 AUTH-1 초안의 5행뿐이라 계약서를 가리킨다.
- OpenAPI: 꺼져 있다(§1).

## 6. 미확인 모음 (이 문서에서 임시로 둔 것)

Q-18(기준일·호출량), Q-19(알림 시각), Q-21(`limit`·중복 대출), Q-23(탈퇴 처리 범위), Q-31(인기순), Q-41(네이버·예스24 조건), Q-42(인기 도서 API), Q-48(실시간 확인 주소), Q-49(반납 집계), Q-51(지도에 보일 도서관 범위), Q-53(사진 저장소), Q-54(파일럿 공개 범위), Q-55(닉네임), Q-56(북마크). 내용은 [모호점 해소 기록](모호점_해소_기록.md)과 [05 §11](05_ERD_및_DB설계서.md).
