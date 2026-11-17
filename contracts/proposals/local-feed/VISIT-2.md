# 도서관 방문 페이지 (`local-feed`) 기술 계약서

> 이 파일은 B의 도서관 방문 페이지(SNS 화면 전체) 계약서다. Step마다 절을 둔다: **LOCAL-1**(게시물 작성·공개·철회) → **VISIT-2**(방문 페이지의 틀) → **LOCAL-2**(광장 피드·상세·이어 읽기·공감·북마크). 순서는 `기능_배정.md` B절.
> 상태: **1차 계약서 — D 기준선(2026-11-16).** 세 세부 명세서는 아직 없다(LOCAL-1은 Draft PR #78에서 기획 중). D가 정한 API 경로·필드·오류 코드·테이블·담당 파일·가짜 값·파트를 먼저 고정하고, **화면·동작 선택지는 열어 둔다**(각 절 C1 아래 "세부 명세에서 정할 것"). 세부 명세가 머지되면 D가 그 절을 **D+B 판**으로 보완한다(정해진 칸은 그대로, 열린 칸만 채움).
> 공통 함수·공공 엔드포인트(#7~#15)·화면 경로·기기 저장 키는 [`core.md`](core.md)가 원본이다.

## Pre-flight 5대 관문 (코드 레포 `main` `3b51c69` · `libtalk` `6944ce1`)

| 관문 | 확인한 것 | 이 계약서의 처리 |
| :--- | :--- | :--- |
| ① 격리·권한·호환 | 사용자 식별 `server/app/auth.py:140-148`. 05 §3.2 `posts`·`post_reactions`·`post_bookmarks` 핵심 제약, §4 "응답에 `user_id` 대신 닉네임만". 06 §3 `FORBIDDEN`(남의 게시물 철회), `POST_NOT_AVAILABLE` | 작성자는 토큰의 `sub`만. 남의 게시물 철회는 403(공개 리소스), 남의 북마크는 볼 길이 없음. 응답에 `user_id`를 넣지 않는다. 세 테이블 RLS |
| ② 동시성·트랜잭션·외부 I/O | `run_db` `server/app/db.py:16-28`. 사진 저장·EXIF 제거·책 조회는 외부 I/O. 쓰기 첫 SQL `lock_active_user`(core SRV-0 S1) | 업로드·`get_book`은 트랜잭션 밖. 게시물 만들기는 `client_request_id` UNIQUE로 연타 한 건. 공감·북마크는 PK + `ON CONFLICT DO NOTHING` |
| ③ 전제 실재성 | `libtalk` `0002_m1_core.py`의 `posts`(:458-528)·`post_reactions`(:530-553)·`post_bookmarks`(:554-576) 정의. localone에는 아직 없음. `nickname_of`·`get_optional_user`·`lock_active_user`는 core SRV-0에서 만듦(아직 없음) | 없는 것은 C7 가짜 값 |
| ④ 담당 파일 충돌 | 열린 PR #78(`specs/local-feed/` 문서만). 코드 PR 0건. `server/app/main.py`는 `[auth-D]`·`[lib-D]` 블록 | B는 `# ── [local-feed-B] ──` 블록 안에서만 라우터를 등록한다. 방문 페이지·글쓰기·상세 경로 파일은 core 스텁을 B가 교체(core K15) |
| ⑤ 승인 게이트 | 경로·인증은 06 #23~#30 그대로. 새 오류 코드 없음. 사진 저장소·용량은 Q-53 `미확인(임시)`, 파일럿 공개 범위 Q-54 | 새 서버 라이브러리 1개(`pillow`), 앱 2개(`expo-image-picker`·`expo-image-manipulator`)는 P3에 적고 PR 본문 `네이티브 의존성`에도 적는다 |

---

## LOCAL-1 게시물 작성·표지·공개·철회

- **담당 역할**: B (서버 파트 포함) · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/LOCAL-1.md` (아직 없음 — 머지 뒤 SHA 기입), 큰 틀 `specs/local-feed/명세서.md`
- **기준선**: `B1` + 이 판(B2 준비)
- **선행 설계**: 05 §3.2 `posts` 행·§7 인덱스 2줄, 06 §2.4 23~25행, 06 §3
- **작성자**: D (시니어)


### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| F1 | 게시물은 **올리기를 눌러야 행이 생기고 그때 공개**된다. 초안은 서버에 저장하지 않는다(기기에만, B가 원하면) | 확정 | 05 §3.2, 02 LOCAL-01 |
| F2 | 이미지는 `photo`(직접 찍은 사진) / `cover`(책 표지) / `color`(단색) 중 하나. 본문·이미지 위 글자는 없어도 된다(이미지만으로 올릴 수 있다) | 확정 | `기능_배정.md` B절 |
| F3 | 사진은 먼저 `#23`으로 올리고 받은 `image_path`를 `#24`에 넣는다. 서버가 **다시 JPEG로 저장하면서 EXIF(위치 포함)를 모두 지운다**. 긴 변 2048px로 줄이고 품질 85 | 동작 확정(06 #23) · 숫자 기본값(Claude) | NFR-05 |
| F4 | 사진 저장소는 Supabase Storage 버킷 `post-images`, 경로 `<user_id>/<uuid>.jpg`, 공개 읽기 주소를 `image_url`로 준다 | 미확인(임시) Q-53 | 05 §11 Q-53 |
| F5 | 사진 상한 10,000,000바이트, 받는 형식 `image/jpeg`·`image/png`·`image/webp` | 미확인(임시) Q-53 | 06 §3 `PAYLOAD_TOO_LARGE` |
| F6 | 표지(`cover`)는 책이 있어야 하고 그 책의 `cover_url`을 서버가 넣는다(앱이 주소를 보내지 않는다). 표지 주소가 없는 책이면 422 — 앱은 그때 제목·저자 표지를 만들 수 있게 사진·단색으로 안내한다 | 기본값(Claude) | `기능_배정.md` B절 "표지가 없으면 … 대신" |
| F7 | 단색(`color`)의 값은 **색 토큰 이름**이다: `fill1`·`fill2`·`fill3`·`cream`·`paper`·`inkStrong`. 룩이 바뀌면 같은 이름의 다른 색이 된다 | 기본값(Claude) · 허용 목록은 세부 명세가 바꿀 수 있음(마이그레이션 전) | PROJECT §3-14 |
| F8 | 책은 `isbn13`으로 연결하고 서버가 조회 엔진 `get_book`으로 `books` 행을 찾거나 만든다(트랜잭션 밖) | 확정 | core LIB-0 C2 |
| F9 | 연타·재시도: 앱이 글쓰기 화면을 열 때 `client_request_id`(UUID v4)를 하나 만들어 보낸다. 같은 사용자·같은 값의 두 번째 요청은 **첫 게시물을 그대로 200**으로 돌려준다(행 1개) | 기본값(Claude) | 06 §1 "연타·재시도 … 두 번째 응답도 성공" |
| F10 | 철회는 작성자만. 철회하면 바로 목록·직접 주소에서 안 보인다(`status = 'withdrawn'`, 행은 지우지 않음). 이미 철회한 것을 다시 철회해도 200 | 확정(R10) / 멱등 기본값(Claude) | 06 #25 |
| F11 | 게시물 위치는 도서관 광장 하나(`library_id` 필수). 사진의 촬영 위치는 쓰지 않는다 | 확정 | 05 §3.2 |
| F12 | 파일럿 동안 게시물을 참여자에게만 보이게 하는 방법은 정하지 않는다(공개 읽기 그대로) | 미확인(임시) Q-54 | 05 §4 |

**세부 명세(LOCAL-1)에서 정할 것 — D가 정하지 않음**: 쓰는 순서와 화면 모양(큰 틀 결정 5 "사진부터"·6 "감상 칸 접어 두기" 안에서), 글자 넣기 모양, 이미지 위 글자·본문의 최대 길이(아래 C5의 임시 80자·2,000자를 바꿀 수 있다), 단색 후보(F7 목록 안에서), 글쓰기 버튼의 형태·위치(C-46 F3 시안 필수), 표지가 없을 때의 안내 문구, 철회 버튼 자리와 확인 문구, 초안을 기기에 남길지.

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 | 인증 | 성공 | 날짜 형식 | 목록 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /api/v1/uploads/post-images` (#23) | 필수 | `201` | — | N/A | 같은 파일을 두 번 올리면 파일 2개(행 없음, 고아 파일 정리는 M2) — 앱은 올리는 중 버튼을 막는다 |
| `POST /api/v1/posts` (#24) | 필수 | `201`(새로 만듦) / `200`(같은 `client_request_id`) | `published_at` ISO `+09:00` | N/A | F9: 행 1개 |
| `POST /api/v1/posts/{post_id}/withdraw` (#25) | 필수(작성자만) | `200` | — | N/A | 두 번째도 `200`, 상태 그대로 |

서버 함수(`server/app/routers/posts.py`, B):

- `async def upload_post_image(request: Request, image: UploadFile, user: CurrentUser = Depends(get_current_user)) -> dict`
- `async def create_post(request: Request, body: PostCreate, user: CurrentUser = Depends(get_current_user)) -> JSONResponse`
- `async def withdraw_post(request: Request, post_id: UUID, user: CurrentUser = Depends(get_current_user)) -> dict`
- 저장소 어댑터(`server/app/services/post_storage.py`, B): `class PostImageStorage(Protocol): def put(self, path: str, data: bytes, content_type: str) -> None; def public_url(self, path: str) -> str` · `build_post_storage(settings: Settings) -> PostImageStorage` · 시험용 `MemoryPostImageStorage`
- `def post_public(row, *, viewer: CurrentUser | None, nickname: str, reaction_count: int, my_reaction: bool, my_bookmark: bool) -> dict` — #24·#27 응답 모양을 한 곳에서 만든다(LOCAL-2가 다시 쓴다)

앱 함수(`mobile/src/features/local-feed/api.ts`, B): `uploadPostImage(fileUri: string, signal?): Promise<UploadedImage>` · `createPost(input: PostCreateInput, signal?): Promise<Post>` · `withdrawPost(postId: string, signal?): Promise<{ id: string; status: "withdrawn" }>`

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| 요청(#23) | `image` | `multipart file` | Y | F5 형식·상한 |
| 응답(#23) | `image_path` | `str` | Y | `<user_id>/<uuid>.jpg` |
| 응답(#23) | `image_url` | `str` | Y | 미리보기용 공개 주소 |
| 응답(#23) | `width`, `height` | `int` | Y | 다시 저장한 크기 |
| 응답(#23) | `bytes` | `int` | Y | 다시 저장한 크기(바이트) |
| 요청(#24) | `client_request_id` | `str (UUID)` | Y | F9 |
| 요청(#24) | `library_id` | `int` | Y | 광장 |
| 요청(#24) | `isbn13` | `str \| null` | N | 책 연결(F8). `cover`면 Y |
| 요청(#24) | `image_kind` | `"photo" \| "cover" \| "color"` | Y | F2 |
| 요청(#24) | `image_path` | `str \| null` | `photo`면 Y | #23이 준 값. **자기 `user_id`로 시작해야 한다** |
| 요청(#24) | `image_color` | `str \| null` | `color`면 Y | F7 토큰 이름 |
| 요청(#24) | `overlay_text` | `str \| null` | N | 앞뒤 공백 제거, 빈 값은 `null`. 최대 80자(임시) |
| 요청(#24) | `body` | `str \| null` | N | 앞뒤 공백 제거, 빈 값은 `null`. 최대 2,000자(임시) |
| 요청(#24) | (그 밖) `user_id` 등 | — | — | 무시(본문의 사용자 id를 읽지 않는다) |
| 응답(#24·#27) `Post` | `id` | `str (UUID)` | Y | |
| `Post` | `library` | `{ id: int; name: str }` | Y | |
| `Post` | `book` | `{ isbn13: str; title: str; author: str \| null; cover_url: str \| null } \| null` | Y | |
| `Post` | `image_kind` | 위와 같음 | Y | |
| `Post` | `image_url` | `str \| null` | Y | `photo`: 저장소 공개 주소, `cover`: 책 표지 주소, `color`: `null` |
| `Post` | `image_color` | `str \| null` | Y | `color`일 때만 토큰 이름 |
| `Post` | `overlay_text` | `str \| null` | Y | |
| `Post` | `body` | `str \| null` | Y | |
| `Post` | `author` | `{ nickname: str }` | Y | `user_profiles.nickname`(core SRV-0 `nickname_of`). **`user_id` 없음** |
| `Post` | `is_mine` | `bool` | Y | 보는 사람이 작성자인지(비로그인 `false`). 철회 버튼에 쓴다 |
| `Post` | `reaction_count` | `int` | Y | 공감 수 |
| `Post` | `my_reaction` | `bool` | Y | 비로그인 `false` |
| `Post` | `my_bookmark` | `bool` | Y | 비로그인 `false` |
| `Post` | `published_at` | `str (ISO, +09:00)` | Y | |
| 응답(#25) | `id`, `status` | `str`, `"withdrawn"` | Y | |
| 화면 문구 | 업로드 실패 | — | — | `"사진을 올리지 못했어요. 다시 시도해 주세요."`(기본값, 세부가 바꿀 수 있음) |
| 화면 문구 | 사진 큼 | — | — | `"사진이 너무 커요."`(06 §3) |
| 화면 문구 | 철회 뒤 직접 주소 | — | — | `"더 이상 공개되지 않는 게시물이에요."`(06 §3) |

#### C4. 플랫폼 분기 표

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 사진 고르기·찍기 | `pickPostImage(source: "camera" \| "library"): Promise<{ uri: string } \| null>` | `expo-image-picker` 카메라·사진첩 | 같음 | 사진첩만(`<input type=file>`, `expo-image-picker` 웹 동작). 카메라는 `null` + 안내 | `mobile/src/features/local-feed/imagePicker.ts` — **이 계약서가 허용하는 B의 분기 파일 하나**(core에 없는 기능 전용 분기) | 세 플랫폼에서 사진 한 장 올림 |
| 올리기 전 줄이기 | `expo-image-manipulator`로 긴 변 2048·JPEG(서버가 한 번 더 지운다) | 같음 | 같음 | 같음 | 같은 파일 | 큰 사진도 413 없이 올라감 |

#### C5. 테이블

**`posts`** — 역할: 광장 게시물 · 소유자 컬럼: `user_id`(작성자) · 담당 마이그레이션: LOCAL-1-P1에서 만듦(`NNNN_posts.py`)

| 컬럼 | 타입 | NULL | 기본값 | 키·제약 | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | 아니오 | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | 아니오 | 없음 | FK → `users.id` | 작성자 |
| `library_id` | `bigint` | 아니오 | 없음 | FK → `libraries.id` | 광장(F11) |
| `book_id` | `bigint` | 예 | 없음 | FK → `books.id`, CHECK `image_kind <> 'cover' OR book_id IS NOT NULL` | F6·F8 |
| `image_kind` | `text` | 아니오 | 없음 | CHECK `IN ('photo','cover','color')` | |
| `image_value` | `text` | 아니오 | 없음 | CHECK 종류와 값이 맞음: `(image_kind='photo' AND image_value ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$') OR (image_kind='cover' AND image_value LIKE 'https://%') OR (image_kind='color' AND image_value IN ('fill1','fill2','fill3','cream','paper','inkStrong'))` | 사진 경로 / 표지 주소 / 색 토큰(05 핵심 제약) |
| `overlay_text` | `text` | 예 | 없음 | CHECK `overlay_text IS NULL OR char_length(overlay_text) BETWEEN 1 AND 80` | 임시 80자 |
| `body` | `text` | 예 | 없음 | CHECK `body IS NULL OR char_length(body) BETWEEN 1 AND 2000` | 임시 2,000자 |
| `status` | `text` | 아니오 | `'published'` | CHECK `IN ('published','withdrawn','hidden')` | `hidden`은 M2(쓰는 코드 없음) |
| `client_request_id` | `uuid` | 아니오 | 없음 | UNIQUE (`user_id`, `client_request_id`) | F9 |
| `published_at` | `timestamptz` | 아니오 | `now()` | — | |
| `updated_at` | `timestamptz` | 아니오 | `now()` | — | 철회 때 바뀜 |

- 인덱스(05 §7): `ix_posts_library_published ON posts (library_id, published_at DESC, id DESC) WHERE status = 'published'`, `ix_posts_book_published ON posts (book_id, published_at DESC, id DESC) WHERE status = 'published'`.
- 인기순 컬럼·인덱스는 넣지 않는다(05 §3.2, Q-31).

| 삭제 동작 | 값 |
| :--- | :--- |
| 이 테이블의 행을 지울 때 | 지우지 않는다. 철회는 `status = 'withdrawn'` |
| 부모가 지워질 때 | `users`·`libraries`·`books` 모두 `NO ACTION`. 탈퇴 때 게시물 철회는 AUTH-3 계약서(06 #6 "게시물 철회") |
| 허용하지 않는 값 | 종류·값 불일치, 표지인데 책 없음, 길이 초과, 같은 `client_request_id` → C6 #3·#4·#5 |
| 행 수준 보안(RLS) | `ALTER TABLE posts ENABLE ROW LEVEL SECURITY`, 정책 없음 + `test_posts_rls_enabled` |

#### C6. 검증과 에러 처리 (세부 명세 예외 번호는 명세 머지 뒤 이 표에 연결한다)

| 예외 # | 발생 조건 | HTTP / `code` | 화면 문구·동작 | 기록 무변경 보장 |
| :--- | :--- | :--- | :--- | :--- |
| F-#1 | 토큰 없음·깨짐 | `401` / `AUTH_REQUIRED` 등(auth.md C6) | 로그인으로 | 행 0, 파일 0 |
| F-#2 | 사진이 10MB 초과 | `413` / `PAYLOAD_TOO_LARGE` | `"사진이 너무 커요."` | 파일 0 |
| F-#3 | 사진 형식이 아님·읽을 수 없음 / #24 필드 누락·형식(종류별 필수 값, `image_color` 목록 밖, 길이 초과, `image_path`가 남의 경로) | `422` / `VALIDATION_ERROR`, `detail` = 필드 이름 | `"요청 형식이 올바르지 않아요."`(화면은 필드별 문구) | 행 0 |
| F-#4 | `cover`인데 책 표지 주소가 없음 | `422` / `VALIDATION_ERROR`, `detail="image_kind"` | 사진·단색으로 바꾸라는 안내(문구는 세부) | 행 0 |
| F-#5 | 없는 `library_id` / 찾을 수 없는 `isbn13` | `404` / `NOT_FOUND`, `detail="library_id"` 또는 `"isbn13"` | `"찾을 수 없어요."` | 행 0 |
| F-#6 | 책 조회 제공자 실패·상한 | `503` / `PROVIDER_UNAVAILABLE` · `429` / `PROVIDER_LIMIT` | 다시 시도 | 행 0 |
| F-#7 | 저장소에 못 씀 | `503` / `PROVIDER_UNAVAILABLE` | `"사진을 올리지 못했어요. 다시 시도해 주세요."` | 행 0 |
| F-#8 | 같은 `client_request_id` 재전송 | `200`, 첫 게시물 | 성공처럼 | 행 1개 그대로 |
| F-#9 | 남의 게시물 철회 | `403` / `FORBIDDEN` | `"할 수 없는 요청이에요."` | 상대 행 그대로 |
| F-#10 | 없는 게시물 철회 | `404` / `NOT_FOUND` | `"찾을 수 없어요."` | — |
| F-#11 | 탈퇴 진행 중 쓰기 | `403` / `ACCOUNT_WITHDRAWN`(core S-#2) | | 행 0 |

- 순서: 인증 → 형식(422) → `lock_active_user` 전 트랜잭션 밖 책 조회(404·429·503) → 트랜잭션: `lock_active_user` → 도서관 존재(404) → 같은 `client_request_id` 있으면 그 행(200) → INSERT(201).

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D SRV-0-P1·P2 | `lock_active_user`, `nickname_of` | core SRV-0 C7 |
| D LIB-0-P1·P2 | `libraries` 테이블, `ProviderEngine.get_book` | 시험에서 `libraries`에 101 한 행 INSERT, 엔진은 `app.state.provider_engine`을 가짜(정해진 `BookRecord` 반환)로 바꿈 |
| D LIB-0-P2 | 책 고르기 화면용 #7·#8 | core LIB-0 C7 |
| D APP-0-P2 | `/posts/new?libraryId=` 경로 | core 스텁을 LOCAL-1-P2에서 교체 |
| D 외부 설정(코드 밖) | Supabase Storage 버킷 `post-images`(공개 읽기), 서버 설정 `SUPABASE_SERVICE_ROLE_KEY`(비밀값) | 시험은 `MemoryPostImageStorage`. 실제 버킷은 D가 LOCAL-1-P1 머지 전에 만든다 |
| D AUTH-3 | 탈퇴 때 게시물 철회 | AUTH-3 계약서에서 `posts` 행 추가 |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 재사용 |
| :--- | :--- | :--- |
| 사용자 | `server/app/auth.py:140-148` | `get_current_user`, `CurrentUser` |
| 트랜잭션 | `server/app/db.py:16-28` | `run_db` |
| 오류·시각 | `server/app/common.py:11-37` | `ApiError`, `now_kst` |
| 라우터 등록 | `server/app/main.py:50-58` 모양 | `# ── [local-feed-B] ──` 블록 |
| 테이블 원본 | `libtalk` `server/migrations/versions/0002_m1_core.py` `posts` 정의 | 발췌 + `client_request_id`·CHECK 2개(종류↔값, 표지↔책)·길이 CHECK 추가 |
| 앱 | `core.md` APP-0 C2 | `publicApi.searchBooks`(책 고르기), `theme`, `apiFetch` |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 항목 |
| :--- | :--- | :--- | :--- |
| `LOCAL-1-P1` 서버: 사진 올리기·게시·철회 | `feat/local-feed-LOCAL-1-part1` | `server/migrations/versions/NNNN_posts.py`, `server/app/routers/posts.py`, `server/app/services/post_storage.py`, `server/app/settings.py`(`supabase_service_role_key`·`post_image_bucket`만), `server/app/main.py`(`[local-feed-B]` 블록), `server/pyproject.toml`, `server/uv.lock`, `server/tests/test_posts_create.py` | F1~F12, C5, F-#1~#11 |
| `LOCAL-1-P2` 앱: 글쓰기·올리기·철회 | `feat/local-feed-LOCAL-1-part2` | `mobile/app/posts/new.tsx`, `mobile/src/features/local-feed/ComposeScreen.tsx`, `mobile/src/features/local-feed/imagePicker.ts`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/__tests__/compose.test.tsx`, `mobile/package.json`, `mobile/package-lock.json` | 세부 명세 결정·예외 전부(명세 머지 뒤 번호 기입) |

##### 파트 머리말 — LOCAL-1-P1

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `LOCAL-1-P1` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | B2 준비 |
| 4. 계약서 커밋 | `82fb574fb59d4a73beabcbf4b77fa200998a5852` (본문 커밋) |
| 5. 선행 태스크 | **`specs/local-feed/세부/LOCAL-1.md` 머지**(착수 관문). `SRV-0-P1`·`LIB-0-P1` 미머지면 C7 가짜 값 |
| 6. 수정 허용 파일 | 위 표 8개 |
| 7. 금지된 결정 | 새 오류 코드·인기순 컬럼·초안 서버 저장 금지. 사진 원본(EXIF 포함) 저장 금지 |
| 8. 완료 조건 | F1~F12, C5 전 컬럼·제약·RLS, F-#1~#11, P5 `LOCAL-1-P1` 시험 |
| 9. 검증 명령 | 루트 `docker compose up -d --wait db` → `server`에서 `APP_ENV=test python -m uv run alembic upgrade head` → `APP_ENV=test python -m uv run pytest -W error` |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

##### 파트 머리말 — LOCAL-1-P2

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `LOCAL-1-P2` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | B2 준비 |
| 4. 계약서 커밋 | `82fb574fb59d4a73beabcbf4b77fa200998a5852` (본문 커밋) |
| 5. 선행 태스크 | `LOCAL-1-P1` 머지(전이면 C3 모양 가짜 API), `APP-0-P1`·`APP-0-P2` |
| 6. 수정 허용 파일 | 위 표 7개 |
| 7. 금지된 결정 | 사진 위치 정보를 앱에서 읽거나 보내기 금지. 분기는 `imagePicker.ts`에만 |
| 8. 완료 조건 | 세부 명세 결정·예외 + P5 `LOCAL-1-P2` 시험 + 웹·Android |
| 9. 검증 명령 | `mobile`에서 `npm ci` → `npx tsc --noEmit` → `npx jest --runInBand src/features/local-feed` → `npx expo export --platform web` |
| 10. 보고 형식 | 위와 같음 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 서버 | `pillow`(uv가 고르는 최신 안정판) | 사진 다시 저장·EXIF 제거 | — |
| 서버 | `python-multipart`(FastAPI `UploadFile`에 필요, 잠금 파일에 없으면) | 업로드 받기 | — |
| 앱 | `expo-image-picker` (`npx expo install`) | 사진 고르기·찍기 | config plugin 권한 문구: `"게시물에 넣을 사진을 고를 때만 써요."` |
| 앱 | `expo-image-manipulator` (`npx expo install`) | 올리기 전 줄이기 | 없음 |

#### P4. 핵심 흐름 골격

```python
# posts.py — #23: 외부 I/O(디코딩·EXIF 제거·저장)는 트랜잭션 밖, DB 행 없음
async def upload_post_image(request, image: UploadFile, user=Depends(get_current_user)):
    data = await image.read(POST_IMAGE_MAX_BYTES + 1)
    if len(data) > POST_IMAGE_MAX_BYTES:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", "사진이 너무 커요.")
    if image.content_type not in ALLOWED_TYPES:
        raise ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, "image")
    jpeg, w, h = await asyncio.to_thread(reencode_without_exif, data)   # 디코딩 실패 → 422 image
    path = f"{user.id}/{uuid4()}.jpg"
    try:
        await asyncio.to_thread(request.app.state.post_storage.put, path, jpeg, "image/jpeg")
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "사진을 올리지 못했어요. 다시 시도해 주세요.") from exc
    return JSONResponse(status_code=201, content={"image_path": path, "image_url": storage.public_url(path), "width": w, "height": h, "bytes": len(jpeg)})

# #24: 책 조회(밖) → 트랜잭션(잠금 → 도서관 → 멱등 → INSERT)
async def create_post(request, body: PostCreate, user=Depends(get_current_user)):
    validate_kind_fields(body, user.id)                   # 422 (종류별 필수, 남의 image_path)
    book = await request.app.state.provider_engine.get_book(body.isbn13) if body.isbn13 else None  # 404/429/503
    if body.image_kind == "cover" and (book is None or book.cover_url is None):
        raise ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, "image_kind")
    def tx(c):
        lock_active_user(c, user.id)
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": body.library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        row = c.execute(INSERT_POST_ON_CONFLICT_DO_NOTHING_RETURNING, params(body, user.id, book)).first()
        if row is not None:
            return row, True
        return c.execute(SELECT_BY_CLIENT_REQUEST_ID, {"uid": user.id, "rid": body.client_request_id}).one(), False
    row, created = await run_db(request.app.state.engine, tx)
    return JSONResponse(status_code=201 if created else 200, content=await build_post_public(request, row, user))
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LOCAL-1-P1 | `test_upload_strips_exif_and_reencodes` | GPS EXIF가 있는 JPEG | #23 | `201`, 저장된 바이트에 EXIF 없음, 경로가 `<user>/…jpg` | 위치 유출(NFR-05) |
| LOCAL-1-P1 | `test_upload_too_large_is_413_and_nothing_saved` | 10MB+1 | #23 | `413`, 저장소 파일 0 | 상한 누락 |
| LOCAL-1-P1 | `test_upload_rejects_non_image` | 텍스트 파일 | #23 | `422 detail=image`, 파일 0 | |
| LOCAL-1-P1 | `test_create_photo_post_then_read_fields` | 업로드 경로 | #24 | `201`, C3 `Post` 필드 전수, `author.nickname`, 응답에 `user_id` 없음 | 작성자 id 노출 |
| LOCAL-1-P1 | `test_create_color_and_image_only_post` | 본문 없음 | #24 `color` | `201`, `body is None` | 이미지만 게시 불가 |
| LOCAL-1-P1 | `test_create_cover_uses_book_cover` | 표지 있는 책 | #24 `cover` | `image_url` = 책 `cover_url` | 앱이 보낸 주소 사용 |
| LOCAL-1-P1 | `test_cover_without_book_cover_is_422` | 표지 없는 책 | #24 | `422 detail=image_kind`, 행 0 | F-#4 |
| LOCAL-1-P1 | `test_same_client_request_id_returns_same_post` | — | 같은 본문 두 번(동시 포함) | `201` 뒤 `200`, 같은 `id`, 행 1 | 연타 중복 |
| LOCAL-1-P1 | `test_image_path_of_other_user_is_422` | B의 경로 | A가 #24 | `422 detail=image_path`, 행 0 | 남의 사진 도용 |
| LOCAL-1-P1 | `test_unknown_library_is_404_no_row` | — | `library_id=999999` | `404 detail=library_id`, 행 0 | |
| LOCAL-1-P1 | `test_kind_value_check_constraint` | — | 직접 INSERT(종류·값 불일치) | `IntegrityError` | 05 핵심 제약 |
| LOCAL-1-P1 | `test_withdraw_by_author_hides_and_is_idempotent` | A의 게시물 | A가 #25 두 번 | 둘 다 `200`, `status=withdrawn` | |
| LOCAL-1-P1 | `test_withdraw_by_other_is_403_unchanged` | A의 게시물 | B가 #25 | `403 FORBIDDEN`, `published` 그대로 | 남의 게시물 철회 |
| LOCAL-1-P1 | `test_withdraw_unknown_is_404` | — | 없는 id | `404` | |
| LOCAL-1-P1 | `test_create_while_withdrawing_is_403_no_row` | 탈퇴 경합(core 시험 모양) | #24 | `403 ACCOUNT_WITHDRAWN`, 행 0 | `lock_active_user` 누락 |
| LOCAL-1-P1 | `test_body_user_id_is_ignored` | 본문에 B의 id | A가 #24 | 행의 `user_id` = A | 격리 |
| LOCAL-1-P1 | `test_posts_rls_enabled` | — | `pg_class`·`pg_policies` | RLS, 정책 0 | |
| LOCAL-1-P2 | (세부 명세 머지 뒤 D+B 판에서 행을 채운다. 최소: 올리기 연타 1건, 업로드 실패 뒤 다시 올리기, 철회 뒤 화면에서 사라짐, 비로그인 진입 시 로그인 안내) | | | | |

---

## VISIT-2 도서관 방문 페이지의 틀

- **담당 역할**: B · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/VISIT-2.md` 내용 커밋 `1b01e4614b9ae76a859b6deb0beafeef31b51d32`, PR #94 head `584bfc1b69a9ebe3ea79dd60ee0778c1f8a51001`. 기획 PR 머지는 별도 착수 관문이다.
- **채택한 B 제안**: 기준 명세서 `specs/local-feed/세부/VISIT-2.md`와 시안 `specs/local-feed/세부/VISIT-2_시안.html`은 코드 레포 기획 PR #94의 명세 커밋 `1b01e4614b9ae76a859b6deb0beafeef31b51d32`이다. 이 절에서 세부 명세로 채운 것은 C1 G11~G14, C3 추가 행, C6 V-#1~#6과 예외 연결, P1·P3 전제 줄, P4 골격 2, P5 추가 행이다. 이 제안의 열린 결정은 D가 채택했고 아래 직접 보완한 약속을 함께 적용한다. 최초 제안의 미승인 상태는 이 확정판으로 대체한다.
- **기준선**: B2의 M1 VISIT-2 보완, **D+B 확정판(2026-11-17)**. 근거: PR #102 `98b5f9a`와 사용자의 D 직접 보완·완성 지시. LOCAL-1·LOCAL-2의 승인 상태는 이 절로 바꾸지 않는다.
- **선행 설계**: 05 §6(도서관 기본값·방문 횟수는 기기), 06 #11·#26, `개발산출물/명세/VISIT_LOCAL_D결정.md` 1.1(결정 3·7·8 보완, 결정 10)·1.2·1.2-1
- **작성자**: B 제안 + D 직접 검토·보완.
- **상태**: 계약 내용 확정. 구현은 기획 #94 승인·main 반영, 계약 team main 발행·본문 SHA 확인 뒤 시작한다. 아래 공통 보완 전에는 C7 가짜 값으로 UI를 진행할 수 있으나 실제 연결·Step 완료는 보완 구현/검증 뒤에만 인정한다.
- **발행 본문 SHA**: b0a1523899fe33e798af39227db273b8dfdde02a



### 계약

#### C1. 결정 (모두 D가 이미 정한 것 — `VISIT_LOCAL_D결정.md`)

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| G1 | 방문 페이지는 `/libraries/[libraryId]`(core K15). 머리는 `#11`의 `name`·거리·`today`(운영시간을 못 받으면 `"정보 없음"`). 거리는 지도 홈이 넘긴 값이 없으면 보이지 않는다(방문 페이지가 위치를 다시 묻지 않는다) | 확정 / 거리 처리 기본값(Claude) | `기능_배정.md` B절 머리 |
| G2 | 들어올 때 **`recordVisit(libraryId)`를 한 번** 부른다(core APP-0). 핀 누름·기본값으로 바로 열림 모두 방문이다. 같은 서울 날짜 두 번째는 세지 않는다 | 확정(1.2-1) | |
| G3 | 방문 멘트 카드: 아래 가운데 작은 한 줄, 버튼 없음, 전환 끝나고 0.3초 떠올라 2.5초 뒤 사라짐, 누를 수 없고 터치를 막지 않음. 문구는 위에서부터 처음 맞는 것 하나: ① 첫 방문 `"처음으로 ○○도서관에 방문했어요!"` ② 누적 세 번째 방문 + 아직 안 물음 + 지금 기본값 아님 → 멘트 대신 G5 질문 카드 ③ 연속 3·7·14·30일째, 그 뒤 100의 배수 일째: `"3일 연속으로 방문했어요!"` / `"일주일 동안 매일 방문했어요!"` / `"2주 동안 매일 방문했어요!"` / `"한 달 동안 매일 방문했어요!"` / `"N일 연속으로 방문했어요!"` ④ 30일 이상 만에: `"오랜만이에요! N일 만에 방문했어요"` ⑤ 그 밖: 카드 없음. 세지 않은 방문(`counted: false`)에는 카드 없음 | 확인 / 3·14·30·100일·오랜만 문구와 시간 기본값(Claude) | 1.2-1 |
| G4 | 도서관 기본값: 기기에 하나(`setDefaultLibrary`). ⋯ 메뉴 항목 `"앱을 켜면 여기부터 열기"` ↔ `"바로 열기 끄기"`, 그리고 `"도서관 홈페이지"`(`#11 homepage`, `openExternalUrl`). 누르면 한 줄 안내 2초 | 확인 / 항목·문구 기본값(Claude) | 1.2 |
| G5 | 세 번째 방문 질문 카드: 제목 `"세 번째 방문이에요"`, 본문 `"앱을 켜면 ○○도서관부터 열까요?"`, 버튼 `"네, 여기부터"`·`"아니요"`. 어느 쪽이든 `markDefaultAsked(libraryId)` | 확인(C-58) / 문구 기본값(Claude) | 1.2 |
| G6 | **앱 시작 분기 `DefaultLibraryGate`**: 홈 탭(A)이 맨 위에 놓는 B의 부품. 기본 도서관이 있으면 → `locate()` → 위치를 못 쓰면 그대로 방문 페이지로(풀지 않음) → 위치가 있으면 `#10` 주변 조회(반경은 core·A와 같은 규칙) → 기본 도서관이 반경 안이면 방문 페이지로 `router.push`, **반경 안에 기본 도서관이 없고 다른 도서관이 하나 이상 있으면** 기본값을 끄고(`setDefaultLibrary(null)`) 홈에 한 줄 `"○○도서관 바로 열기를 풀었어요"`(2.5초). 앱 실행마다 한 번만 판단 | 확인(1.2 플로우) / 판정 기본값(Claude) | 1.2 표 첫 두 행 |
| G7 | 돌아가기: 왼쪽 위 굵은 `"‹"`와 화면 왼쪽 끝에서 밀기로 지도 홈(`router.back()`, 기록이 없으면 `router.replace("/")`) | 확인 | 결정 8 보완 |
| G8 | 방문 페이지에는 **검색창이 없다** | 확인 | 결정 10 |
| G9 | M1은 피드만. 책장·방명록·스탬프·룩은 만들지 않되 아래에 붙을 수 있게 레이아웃을 열어 둔다. 빈 가짜 화면 금지. 피드가 없을 때(LOCAL-2 전 포함)는 빈 피드 안내 | 확정 | `기능_배정.md` B절 |
| G10 | 방문 페이지는 로그인 없이 보인다. 방문 기록·기본값은 기기에만이고 서버에 보내지 않는다 | 확정 | 05 §6 |
| G11 | **머리 배치**: 왼쪽 정렬 두 줄. 맨 위 왼쪽 굵은 `"‹"`(G7). 그 아래 `#11 name`(굵게, 앱 26 / 시안 20px). 그 아래 작은 글자 한 줄(앱 16 / 시안 12px, `theme.colors.textSub`) `"<거리> · <오늘 운영시간>"` — 거리는 G1대로 넘겨받은 값이 있을 때만 쓰고 없으면 거리와 `" · "`를 뺀다. 운영시간은 `today.hours_text`, 없으면 `"정보 없음"`(G1). `today.is_closed === true`면 운영시간 자리에 굵은 `"오늘 휴관"`, `null`이면 평소 줄. 같은 줄 오른쪽 끝에 `⋯`(G4 메뉴). 머리 전체 높이 앱 약 115 / 시안 약 86. 크기 단위: 시안 px는 390×844 화면을 0.75배로 그린 값이고 앱 값은 시안 ÷ 0.75(React Native 크기 단위, iOS pt·Android dp 공통) | 확인 — 사용자: "깔끔하고 피드가 많이 보여서요." / 크기·휴관 표시 기본값(Claude) | 명세 결정 1, 예외 #5·#6 |
| G12 | **피드를 올렸을 때 머리**: 피드를 내려 스크롤 위치가 (두 줄 머리 높이 − 한 줄 높이)를 넘으면 거리·운영시간 줄을 접고 `‹ <이름> ⋯` 한 줄(앱 높이 약 52 / 시안 40, 이름 앱 20 / 시안 15px 굵게, 배경 `theme.colors.cream`, 아래 은은한 그림자)을 맨 위에 붙인다. 맨 위로 돌아오면 두 줄로 펼친다. 한 줄 상태에서도 `‹`(G7)·`⋯`(G4)는 그대로 동작한다. 그림자 색은 D APP-0-P1 보완이 제공하는 `theme.colors.shadowSoft`(임시 `rgba(0,0,0,.15)`)를 쓴다. 사용처는 접힌 머리 아래·`‹` 글자 그림자. B는 공통 토큰 파일을 수정하지 않는다 | 확인 — 사용자: "어느 도서관인지 계속 보여서요" (아래 '정할 것'의 기본값과 같음) / 값 기본값(Claude) | 명세 결정 2 |
| G13 | **게시물이 하나도 없을 때**: `#26` 결과 0개(LOCAL-2 머지 전 포함, G9)면 피드 자리 가운데에 세 줄 — `"아직 게시물이 없어요"`(굵게) / `"이 도서관의 첫 글을 올려 보세요"`(`theme.colors.textSub`) / 굵은 글자 링크 `"첫 글 올리기 →"`(글자 앱 18 / 시안 14px). 링크는 오른쪽 아래 둥근 `"+"`(LOCAL-1 명세 결정 1)와 같은 곳 `/posts/new?libraryId=<libraryId>`(core K15 및 이 계약서 LOCAL-1 C7 경로)로 이동만 한다. 로그인 안 했으면 이동하지 않고 LOCAL-1의 로그인 안내 창(`"로그인하면 글을 올릴 수 있어요"` + `"로그인하기"` / `"닫기"`, LOCAL-1 명세 예외 #4)을 띄운다. 가짜 게시물을 만들지 않는다 | 확인 — 사용자: "첫 글을 올려 보라고 해서요." | 명세 결정 3, 예외 #2·#4 |
| G14 | **전환 세부**: 들어올 때 오른쪽에서 왼쪽으로 밀린다 — `Stack` 기본 push 전환(약 0.3초, 플랫폼 기본 시간을 그대로 쓰고 플랫폼별로 맞추지 않음, C4 분기 없음). 배경은 `theme.colors.cream`. 방문 멘트 카드(G3) 크기·자리: 화면 아래 가운데, 아래 끝에서 앱 약 112 / 시안 84px 위, 배경 `theme.colors.paper`, 모서리 `theme.radii.card`, 한 줄 굵은 작은 글자(앱 16 / 시안 12px), 그림자는 D APP-0-P1 보완의 `theme.colors.shadowFloat`(임시 `rgba(0,0,0,.18)`)를 쓴다 | 기본값(Claude) | 명세 0절, 예외 #7 |

**기준선에서 열어 두었던 항목 — 아래 G11~G14로 결정 완료**: 머리 배치(이름·거리·오늘 운영시간·‹·⋯), 피드를 올렸을 때 머리 모양(기본값: 접혀서 `"‹ 이름"` 한 줄), 게시물이 하나도 없을 때 화면, 전환 세부(밀리는 방향·시간, 멘트 카드 크기). 브랜치 `spec/library-visit-VISIT-2`(닫힌 PR #72)의 머리 배치 후보 3개는 참고용.

**세부 명세(VISIT-2)에서 정한 것 — D+B 확정판**: 머리 배치 = G11, 피드를 올렸을 때 머리 = G12(위 기본값 채택), 게시물이 하나도 없을 때 화면 = G13, 전환 세부 = G14. 명세 확인 목록 1~3은 `확인`, G14와 크기 값은 `기본값(Claude)`.

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 | 인증 | 부르는 때 | 앱 함수 | 연타 |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/libraries/{library_id}` (#11, D) | 없음 | 들어올 때 | `fetchLibrary` | 러너 |
| `GET /api/v1/libraries?lat=&lng=&radius_km=` (#10, D) | 없음 | `DefaultLibraryGate`가 앱 시작 때 한 번 | `fetchLibrariesNearby` | 한 번만 |
| `GET /api/v1/libraries/{library_id}/posts` (#26, B LOCAL-2) | 선택 | 피드 | `fetchLibraryPosts` | 러너 |

B가 만드는 앱 부품(다른 기능이 쓰는 것):

- `mobile/src/features/local-feed/DefaultLibraryGate.tsx`: `export function DefaultLibraryGate(): JSX.Element | null` — props 없음. 홈 탭(A)이 화면 맨 위에 놓는다. 이동하지 않을 때는 `null` 또는 G6의 한 줄 안내만 그린다.
- `mobile/src/features/local-feed/visitMent.ts`: `pickVisitMent(result: VisitResult, libraryName: string, isDefault: boolean, today: string): { kind: "ment"; text: string } | { kind: "ask" } | null` — G3 규칙 한 곳.
- (D 확정판) 세부 결정 G11~G14로 경로·함수·인증·연타 처리는 바뀌지 않는다. G13의 글쓰기 이동은 서버를 부르지 않고 LOCAL-1 경로로 이동만 한다(N/A: 새 엔드포인트 없음).

#### C3. 쓰는 필드와 화면 문구

| 구분 | 필드/키 | 어디에 |
| :--- | :--- | :--- |
| #11 | `name`, `today.hours_text`, `today.is_closed`, `homepage` | 머리, ⋯ 메뉴 홈페이지 |
| 경로 값 | `libraryId` | `/libraries/[libraryId]`. 양의 안전한 정수 문자열이 아니면 `"찾을 수 없어요."` + 홈으로, #11·recordVisit 호출 0번 |
| 경로 값 | `distanceM?: string` | core K15. 0 이상의 안전한 정수 문자열 한 값만 허용. 배열·음수·소수·NaN·범위 초과·미전달은 거리 생략. 1,000m 미만은 `320m`, 이상은 소수 한 자리 `1.3km`. 거리 때문에 위치를 다시 묻지 않는다 |
| 기기 | `localone:visits:v1`, `localone:default_library:v1` | core C3. `visits.ts` 함수로만 |
| 화면 문구 | G3·G4·G5·G6 안의 글자 전부 | 그대로 |
| 화면 문구 | 운영시간 없음 | `"정보 없음"` |
| 화면 문구 | #11 실패 | `"도서관 정보를 불러오지 못했어요."` + `"↻ 새로고침"`(기본값, 세부가 바꿀 수 있음) |
| 화면 문구 | #11 실패(세부 결정) | 위 기본값 그대로 채택(명세 예외 #1) |
| 화면 문구 | 쉬는 날 | `"오늘 휴관"`(굵게, `today.is_closed === true`일 때만, G11·명세 예외 #5) |
| 화면 문구 | 빈 피드 | `"아직 게시물이 없어요"` / `"이 도서관의 첫 글을 올려 보세요"` / `"첫 글 올리기 →"`(G13·명세 결정 3) |
| 화면 문구 | 글쓰기 진입 비로그인 | LOCAL-1 로그인 안내 창 문구 그대로: `"로그인하면 글을 올릴 수 있어요"` / `"로그인하기"` / `"닫기"`(G13·명세 예외 #4) |
| 화면 문구 | 피드 불러오는 중 | `"이야기를 불러오는 중…"` 작은 알약 — 말줄임표는 실제 화면 문구다(명세 예외 #1). `#26` 연결은 LOCAL-2 |
| 화면 문구 | 피드 실패 | `"지금은 이 도서관 이야기를 불러올 수 없어요."` + `"새로고침"`(명세 예외 #1). `#26` 연결은 LOCAL-2 |

#### C4. 플랫폼 분기 표

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 화면 왼쪽 끝 밀어 돌아가기 | expo-router `Stack`의 `gestureEnabled: true` | 기본 제스처 | 기본 뒤로 + `gestureEnabled` | 브라우저 뒤로·`‹` | `mobile/app/libraries/[libraryId].tsx` 화면 옵션(분기 코드 없음) | 세 플랫폼에서 지도로 돌아감 |

- (D 확정판) 세부 결정 G11~G14로 추가 분기 없음: 접히는 머리·빈 피드·멘트 카드 자리는 공통 코드이고, 전환은 위 `Stack` 기본 전환을 쓴다.

#### C5. 테이블

해당 없음: 방문 기록·기본값은 기기(core C3).

- (D 확정판) 세부 결정으로도 스키마 변경 없음. 새 마이그레이션을 설계하지 않는다.

#### C6. 검증과 에러 처리

| 예외 # | 발생 조건 | 동작 | 기록 무변경 보장 |
| :--- | :--- | :--- | :--- |
| G-#1 | `#11` `404 NOT_FOUND`(없는 도서관) | `"찾을 수 없어요."` + 홈으로 버튼, `recordVisit` 부르지 않음 | 방문 기록 무변경 |
| G-#2 | `#11` 실패·끊김 | C3 실패 문구. 방문은 센다(들어온 것은 사실) | — |
| G-#3 | 같은 날 다시 들어옴 | 카드 없음 | `count` 그대로 |
| G-#4 | 기본 도서관이 서버에서 사라짐(#11 404) | `DefaultLibraryGate`가 기본값을 끄고 홈에 그대로 | 기본값 삭제 |
| G-#5 | 앱 시작 때 위치를 못 씀 | 풀지 않고 방문 페이지로 | 기본값 그대로 |
| G-#6 | 방문 기록 저장 실패 | core APP-0의 `recordVisit`은 `counted:false`를 반환한다. 화면은 계속, 멘트·질문 카드 없음. 실패를 성공한 방문으로 표시하지 않는다 | 영속 기록에 증가 성공을 가정하지 않음. 재진입 시 재시도 가능 |
| V-#1 | `#26` 실패·끊김(`ApiCallError`, 끊김은 `status 0`·`code "NETWORK"`, 서버 오류는 LOCAL-2 C6) | 피드 자리만 `"지금은 이 도서관 이야기를 불러올 수 없어요."` + `"새로고침"`(누르면 피드만 다시 부름). 불러오는 동안은 `"이야기를 불러오는 중…"` 작은 알약. 머리·`‹`·`⋯`·`"+"`는 그대로. LOCAL-2 머지 전에는 `#26`을 부르지 않으므로 LOCAL-2 연결 때 쓰는 행 | — |
| V-#2 | 게시물 0개(`#26` `200` 빈 목록, LOCAL-2 머지 전 포함) | G13 안내. 머리·`"+"`는 그대로 | 가짜 게시물 없음 |
| V-#3 | `‹` 두 번 빠르게, `‹`와 화면 왼쪽 끝 밀기가 겹침, ⋯ `"앱을 켜면 여기부터 열기"` 두 번(N/A: 기기 내 처리) | 지도 홈으로 한 번만 돌아간다. 기본값은 한 번만 바뀐다(저장이 진행 중이면 두 번째 누름 무시) | 기본값 하나(G4) |
| V-#4 | 로그인 안 함(N/A: 공개 읽기 — #10·#11 인증 없음, #26 선택 인증). 방문 페이지에는 남의 개인 리소스가 없다(N/A: 타인 404) | 방문 페이지 전체가 보인다. `"+"`·`"첫 글 올리기 →"`를 누를 때만 LOCAL-1 로그인 안내 창, 이동 0번 | 서버 기록 없음(G10) |
| V-#5 | 오늘 쉬는 날(`#11` `200`, `today.is_closed === true`) | 운영시간 자리에 굵은 `"오늘 휴관"`. `is_closed === null`이면 평소 줄(`hours_text` 또는 `"정보 없음"`) | — |
| V-#6 | 거리를 넘겨받지 못함(앱 시작 때 기본 도서관으로 바로 열림, 지도 홈이 거리를 넘기지 않음 — N/A: 기기 내 처리) | 거리와 `" · "` 없이 운영시간만 | — |

- (D 확정판) 명세 예외 연결: 예외 #1(도서관 정보) = G-#2 — `404` 밖의 모든 `ApiCallError`(끊김 `status 0`·`"NETWORK"` 포함), 예외 #1(피드) = V-#1, 예외 #1-1 = G-#1(`404 NOT_FOUND`, 경로 값이 숫자가 아님은 C3 경로 값 행), 예외 #2 = V-#2, 예외 #3 = V-#3·G-#3, 예외 #4 = V-#4, 예외 #5 = V-#5, 예외 #6 = V-#6, 예외 #7(처음 방문) = G3 ①(오류 아님). G-#4~#6은 명세 예외 표 밖의 기준선 행으로 그대로 둔다.

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D APP-0-P1 및 VISIT-2 선행 보완 | `visits.ts`, `locate`, `openExternalUrl`, `publicApi`, `theme.colors.shadowSoft`·`shadowFloat` | core C7. 방문 저장 실패는 `counted:false`인 가짜 결과, 그림자는 토큰 키를 참조하고 임의 색 하드코딩 금지. 실제 코드에는 아직 저장 실패 감지·그림자 키가 없으므로 D 보완 연결 후 통합 시험 |
| A VISIT-1 | 핀/목록 이동의 선택 `distanceM` | A가 미연결이면 거리 생략(G1). 임의로 현재 위치를 조회하지 않음 |
| B LOCAL-1-P2 | `/posts/new`, 로그인 안내 창 | 로그인 상태는 현재 `useAuth`로 판단. 비로그인은 방문 화면에서 LOCAL-1 문구를 그린다. 로그인 시 core 스텁으로 이동만 하며 글쓰기 제공·동작 완료는 LOCAL-1 연결 후 |
| D APP-0-P2 | `/libraries/[libraryId]` 스텁 | 이 파트에서 교체 |
| D LIB-0-P1 | #10·#11 | core LIB-0 C7 |
| A VISIT-1 | 홈 탭에 `DefaultLibraryGate` 놓기 | A가 이 부품 머지 뒤 한 줄 연결(library-visit V17) |
| B LOCAL-2 | 피드 | 머지 전에는 빈 피드 안내 |

- G13 로그인 안내 창의 문구·동작은 LOCAL-1 명세 예외 #4와 동일하게 유지한다. VISIT-2 기존 `VisitScreen.tsx` 안에서 처리하고 다른 Step 파일을 수정하지 않는다. `"로그인하기"`는 객체 경로 `{ pathname: "/login" }`, `"닫기"`는 창만 닫으며 자동 게시하지 않는다.

### 구현 계획

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 항목 |
| :--- | :--- | :--- | :--- |
| `VISIT-2-P1` 방문 페이지 틀·방문 멘트 | `feat/local-feed-VISIT-2` | `mobile/app/libraries/[libraryId].tsx`, `mobile/src/features/local-feed/VisitScreen.tsx`, `mobile/src/features/local-feed/VisitHeader.tsx`, `mobile/src/features/local-feed/visitMent.ts`, `mobile/src/features/local-feed/__tests__/visit.test.tsx` | G1~G3·G7~G10, G-#1~#3·#6 |
| `VISIT-2-P2` 도서관 기본값·앱 시작 분기 | `feat/local-feed-VISIT-2` | `mobile/src/features/local-feed/VisitScreen.tsx`, `mobile/src/features/local-feed/VisitMenu.tsx`, `mobile/src/features/local-feed/AskDefaultCard.tsx`, `mobile/src/features/local-feed/DefaultLibraryGate.tsx`, `mobile/src/features/local-feed/__tests__/default-library.test.tsx` | G4~G6, G-#4·#5 |

##### 파트 머리말 — VISIT-2-P1 / VISIT-2-P2 (두 파트 공통 칸, 다른 칸만 따로)

| 칸 | VISIT-2-P1 | VISIT-2-P2 |
| --- | --- | --- |
| 1. 태스크 ID | `VISIT-2-P1` | `VISIT-2-P2` |
| 2. 담당 역할 | B | B |
| 3. 기준선 버전 | B2 + M1 VISIT-2 D+B 확정판 | B2 + M1 VISIT-2 D+B 확정판 |
| 4. 계약서 커밋 | `b0a1523899fe33e798af39227db273b8dfdde02a` (VISIT-2 발행 본문 커밋) | `b0a1523899fe33e798af39227db273b8dfdde02a` (VISIT-2 발행 본문 커밋) |
| 5. 선행 태스크 | **#94의 고정 명세 승인·main 반영 + 이 계약 승인·team main 발행·본문 SHA 확인**, `APP-0-P1`·`APP-0-P2` 및 APP-0-P1 보완(전이면 C7, 실제 연결·완료는 제공 후) | 같은 PR 안 `VISIT-2-P1` 구현·검증·커밋·CI 확인 완료(별도 머지 없음) |
| 6. 수정 허용 파일 | 위 표 5개 | 위 표 5개 |
| 7. 금지된 결정 | 검색창 금지(G8). 방문 횟수 숫자 보이기 금지. 서버에 방문 보내기 금지 | 기본값 둘 이상 금지. 홈 화면 파일 수정 금지(A 파일) |
| 8. 완료 조건 | G1~G3·G7~G10 + P5 시험 + 웹·Android | G4~G6 + P5 시험 + 웹·Android |
| 9. 검증 명령 | `mobile`에서 `npm ci` → `npx tsc --noEmit` → `npx jest --runInBand src/features/local-feed` → `npx expo export --platform web` | 같음 |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 | 같음 |

- (D 확정판) G11~G14는 `VISIT-2-P1`의 기존 허용 파일(`VisitScreen.tsx`·`VisitHeader.tsx`) 안에서 만든다. 파일·파트 추가 없음. `VISIT-2-P1` 완료 확인에 G11~G14·V-#1~#6을, `VISIT-2-P2` 완료 확인에 V-#3(⋯ 연타)을 더한다. 4칸은 이 절의 실제 발행 본문 SHA다. 두 파트는 한 브랜치·한 PR에서 진행한다. 공통 보완은 D가 core의 한정 파일로 제공한다.

#### P1·P3·P4

- P1: `core.md` APP-0 C2(`visits.ts`·`locate`·`publicApi`·`theme`), `VISIT_LOCAL_D결정.md` 1.2·1.2-1 표. 새 라이브러리 없음.
- P1(D 확정판, 코드 `main` `ff248ea66f7915d7e6d39a58ccfa0b0f2d6245ac`에서 확인): `mobile/src/lib/visits.ts:8` `VisitResult`, `:50` `recordVisit(libraryId: number, now = new Date()): Promise<VisitResult>`, `:77` `markDefaultAsked(libraryId: number): Promise<void>`, `:84` `getDefaultLibrary(): Promise<number | null>`, `:89` `setDefaultLibrary(libraryId: number | null): Promise<void>` / `mobile/src/lib/platform.ts:26` `locate(signal: AbortSignal): Promise<LocateResult>`, `:78` `openExternalUrl(url: string): Promise<boolean>` / `mobile/src/lib/latest.ts:6` `createLatestRunner()` / `mobile/src/lib/publicApi.ts:9` `Today`(`is_closed: boolean | null`, `hours_text: string | null`), `:74` `fetchLibrariesNearby(lat, lng, radiusKm?, signal?)`, `:81` `fetchLibrary(libraryId: number, signal?): Promise<LibraryDetail>` / `mobile/src/theme/tokens.ts:91-93` `ThemeColors`(`cream`·`paper`·`text`·`textSub` 포함), `:95-108` `Radii`(`card`). 이 revision에는 그림자 토큰이 없고 저장 실패도 호출자가 판별할 수 없다. D APP-0-P1 보완 계약이 `counted:false` 실패 반환과 그림자 키를 제공한다(아직 구현되지 않음). 앞으로 만들 것: `/libraries/[libraryId]` 스텁(D APP-0-P2, 현재 `mobile/app`에는 `_layout.tsx`·`index.tsx`·`login.tsx`만), `/posts/new`·로그인 안내 창(B LOCAL-1-P2), `fetchLibraryPosts`(B LOCAL-2).
- P3(D 확정판): 새 라이브러리 없음. 접히는 머리는 스크롤 위치 값(`onScroll`)으로 그린다.
- P4 골격(`visitMent.ts`):

```ts
export function pickVisitMent(r: VisitResult, name: string, isDefault: boolean, today: string) {
  if (!r.counted) return null;                                         // 같은 날 재방문 또는 저장 실패 (G-#3·#6)
  if (r.isFirst) return { kind: "ment", text: `처음으로 ${name}에 방문했어요!` };
  if (r.record.count === 3 && !r.record.defaultAsked && !isDefault) return { kind: "ask" };   // 누적 우선 (C-58)
  const s = r.record.streakDays;
  const streakText = s === 3 ? "3일 연속으로 방문했어요!" : s === 7 ? "일주일 동안 매일 방문했어요!"
    : s === 14 ? "2주 동안 매일 방문했어요!" : s === 30 ? "한 달 동안 매일 방문했어요!"
    : s >= 100 && s % 100 === 0 ? `${s}일 연속으로 방문했어요!` : null;
  if (streakText) return { kind: "ment", text: streakText };
  const gap = r.previousVisitedOn ? daysBetween(r.previousVisitedOn, today) : 0;
  if (gap >= 30) return { kind: "ment", text: `오랜만이에요! ${gap}일 만에 방문했어요` };
  return null;
}
```

- P4 골격 2(D 확정판, `VisitScreen.tsx` — 접히는 머리 G12와 피드 자리 G13·V-#1~#4):

```ts
const FOLD_AT = HEADER_TWO_LINES - HEADER_ONE_LINE;                  // 앱 115 - 52 (G11·G12)
const libRunner = createLatestRunner(), feedRunner = createLatestRunner();   // 도서관을 바꿔 들어오면 늦은 응답 버림 (AC-RACE)
let folded = false, backing = false;
function onScroll(y: number) {
  const next = folded ? y > 0 : y > FOLD_AT;             // 접힌 뒤에는 맨 위에서만 펼침
  if (next !== folded) folded = next;                                 // 값이 바뀔 때만 다시 그림
}
// 러너는 화면 생명주기 동안 유지하고 libraryId 변경·unmount 때 cancel(); ok만 반영, stale은 무변경.
// #11 404 확인 뒤에는 recordVisit 금지, 그 밖의 결과는 진입당 한 번.
// feed.kind: LOCAL-2 머지 전에는 #26을 부르지 않고 "empty"   // TODO(연결): B LOCAL-2 fetchLibraryPosts
function renderFeed(feed) {
  switch (feed.kind) {
    case "loading": return Pill("이야기를 불러오는 중…");
    case "error":   return Center("지금은 이 도서관 이야기를 불러올 수 없어요.", Retry("새로고침", reloadFeedOnly)); // V-#1
    case "empty":   return EmptyGuide("아직 게시물이 없어요", "이 도서관의 첫 글을 올려 보세요", Link("첫 글 올리기 →", openCompose)); // V-#2
    case "items":   return Feed(feed.items);                         // LOCAL-2
  }
}
function openCompose() {                                              // 링크와 "+"가 같은 동작 (G13)
  if (!signedIn) return showLoginSheet();                            // LOCAL-1 로그인 안내 창, 이동 0번 (V-#4)
  router.push({ pathname: "/posts/new", params: { libraryId: String(libraryId) } });
}
function backOnce() {                                                // ‹ 연타·밀기 겹침 (V-#3)
  if (backing) return;
  backing = true;
  router.canGoBack() ? router.back() : router.replace("/");            // G7
}
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-2-P1 | `visit records once and shows first ment` | 기록 없음 | 101 방문 페이지 | `recordVisit(101)` 1번, `"처음으로 정독도서관에 방문했어요!"` | 첫 방문 |
| VISIT-2-P1 | `pickVisitMent table` (매개변수화) | G3 모든 행 + 4·5일 연속 | 함수 | 표의 글자 / `null` | 주기 사이 문구 |
| VISIT-2-P1 | `third visit asks instead of streak ment` | count 3, streak 3 | 함수 | `{kind:"ask"}` | 우선순위 |
| VISIT-2-P1 | `same day revisit shows no card` | `counted:false` | 함수 | `null` | |
| VISIT-2-P1 | `unknown library shows not found and does not record` | #11 404 | 진입 | 문구, `recordVisit` 0번 | 없는 도서관 기록 |
| VISIT-2-P1 | `no search bar on visit page` | — | 렌더 | 검색 입력칸 없음 | G8 |
| VISIT-2-P1 | `back goes to home` | — | `‹` | `router.back()` | |
| VISIT-2-P2 | `menu toggles default library` | — | ⋯ → 켜기 → 끄기 | `setDefaultLibrary(101)` → `(null)`, 글자 바뀜 | |
| VISIT-2-P2 | `ask card yes sets default and marks asked` | 질문 카드 | "네, 여기부터" | `setDefaultLibrary(101)`, `markDefaultAsked(101)` | 다시 물음 |
| VISIT-2-P2 | `gate opens default library when inside radius` | 기본 101, 주변에 101 | 홈 시작 | `router.push` 101 | |
| VISIT-2-P2 | `gate releases when another library is near and default is not` | 기본 101, 주변 102만 | 홈 시작 | `setDefaultLibrary(null)`, `"정독도서관 바로 열기를 풀었어요"` | 판정 |
| VISIT-2-P2 | `gate keeps default when location unavailable` | `locate` denied | 홈 시작 | 방문 페이지로, 기본값 그대로 | G-#5 |
| VISIT-2-P2 | `gate decides only once per launch` | — | 홈 다시 렌더 | `fetchLibrariesNearby` 1번 | 반복 이동 |
| VISIT-2-P1 | `header shows name then distance and hours with menu on the same row` (결정 1, G11) | #11 가짜 101, 거리 320m를 넘겨받음 | 진입 | 이름 줄 아래 `"320m · <hours_text>"` 줄, 같은 줄에 ⋯ | 머리 배치(정보 줄과 ⋯를 한 줄에 둠) |
| VISIT-2-P1 | `header hides distance when not passed` (예외 #6, V-#6, G1) | 거리 없음 | 진입 | 거리 글자와 `" · "` 없음, 운영시간만 | 거리 없음 처리 |
| VISIT-2-P1 | `header shows info missing when hours unknown` (G1) | `today.hours_text = null`, `is_closed = null` | 진입 | `"정보 없음"` | 운영시간 없음 문구 |
| VISIT-2-P1 | `header shows closed today only when is_closed is true` (예외 #5, V-#5) | `is_closed = true` / `null` | 진입 | `true`면 `"오늘 휴관"`, `null`이면 평소 줄 | `is_closed === true`만 휴관 |
| VISIT-2-P1 | `header folds to one line when feed scrolls and unfolds at top` (결정 2, G12) | 진입 | 스크롤 y > FOLD_AT → y = 0 | 한 줄 `‹ 이름 ⋯`(운영시간 글자 없음) → 두 줄로 돌아옴, 한 줄 상태에서 `‹`는 `router.back` 1번 | `folded` 판정·접힌 뒤 돌아가기 |
| VISIT-2-P1 | `empty feed shows guide and first post link` (결정 3, 예외 #2, V-#2, G13) | 로그인, 피드 0개 | 진입 → `"첫 글 올리기 →"` | 안내 3줄, 게시물 카드 0개, `router.push({pathname:"/posts/new", params:{libraryId:"101"}})` 1번 | 가짜 게시물 금지·링크 대상 |
| VISIT-2-P1 | `first post link and plus ask login when signed out` (예외 #4, V-#4) | 로그아웃 | 링크·`"+"` 각각 누름 | 로그인 안내 창 문구, `router.push` 0번 | 로그인 판정 |
| VISIT-2-P1 | `visit page renders signed out` (예외 #4, V-#4, G10) | 로그아웃 | 진입 | 머리·빈 피드 안내 보임, 로그인 안내 창은 누르기 전엔 없음 | 공개 읽기 |
| VISIT-2-P1 | `library info failure shows retry and keeps visit counted` (예외 #1, G-#2) | #11 `ApiCallError` `status 0` | 진입 → `"↻ 새로고침"` | 실패 문구, `recordVisit(101)` 1번, 새로고침에 `fetchLibrary` 다시 1번 | 실패 시 방문 처리 |
| VISIT-2-P1 | `feed loading, failure and empty are distinct` (예외 #1, V-#1·V-#2) | 피드 대기 / 실패 / 0개 (가짜 피드 값) | 진입, 실패에서 `"새로고침"` | 세 상태 문구가 서로 다르고 빈 안내는 0개일 때만, 새로고침은 피드만 다시(`fetchLibrary` 추가 0번) | 상태 구분 |
| VISIT-2-P1 | `back pressed twice returns home once` (예외 #3, V-#3, G7) | 진입 | `‹` 두 번 빠르게 | `router.back` 1번 | `backing` 가드 |
| VISIT-2-P1 | `late library response does not overwrite newer library` (AC-RACE) | 101 응답 지연, 102로 바꿔 들어옴 | 101 응답이 늦게 도착 | 머리는 102 이름 | 러너 |
| VISIT-2-P1 | `ment card shows once at bottom and hides` (G3, G14, 예외 #7) | 첫 방문, 가짜 타이머 | 진입 → 타이머 진행 | 카드 1개(아래 가운데 자리), 2.5초 뒤 0개 — 실제 시간 기다리기 대신 가짜 타이머 | 한 번만 표시 |
| VISIT-2-P2 | `menu default toggle pressed twice changes once` (예외 #3, V-#3) | 저장 지연 | ⋯ `"앱을 켜면 여기부터 열기"` 두 번 | `setDefaultLibrary(101)` 1번 | 연타 가드 |


| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| --- | --- | --- | --- | --- | --- |
| VISIT-2-P1 | `storage failure hides ment and ask without blocking page` (G-#6) | D 보완 API 가짜 `counted:false`, 첫 방문·누적 세 번째 각각 | 진입 | 머리/피드 유지, 멘트·질문 0개, 성공 방문 표시 없음 | 저장 실패를 성공으로 오인 |
| VISIT-2-P1 | `bad route id never fetches or records` | abc·0·-1·소수·배열·안전 정수 초과 | 진입 | 찾을 수 없음, fetchLibrary/recordVisit 0번 | 경로 검증 누락 |
| VISIT-2-P1 | `distance route parsing and formatting` | 0·320·1300·미전달·배열·음수·소수·NaN·안전 정수 초과 | 머리 렌더 | 0m·320m·1.3km, 잘못된 값은 구분점까지 숨김, locate 0번 | 거리 계약 불일치 |
| VISIT-2-P1 | `late error and unmount cannot update current header` (AC-RACE) | 101 성공/실패 지연, 102 선택 또는 unmount | 앞 요청 완료 | 102 유지, 앞 요청 오류 표시/멘트 없음, runner cancel 호출 | 오류 경합/화면 이탈 |
| VISIT-2-P1 | `back gesture overlapping press navigates once` (V-#3) | Stack 전환 중 | edge gesture와 ‹ 겹침 | 한 번만 pop, 홈 이탈 없음 | 버튼 가드만 있고 제스처 누락 |
| VISIT-2-P2 | `missing default and failed nearby lookup keep home usable` | 기본 101, #11 404 / #10 실패 / #10 빈 목록 | 앱 시작 | 404는 기본값 해제·홈 유지, #10 실패·0개는 기본값 보존 후 101 진입, 재조회·이동 루프 없음 | 미정 분기/데이터 삭제 |
| VISIT-2-P2 | `ask no marks asked without changing default` | 세 번째 방문 | 아니요 | markDefaultAsked(101) 1번, setDefaultLibrary 0번, 카드 닫힘 | 거절 뒤 반복 질문 |
| VISIT-2-P1 | `integration uses real visit adapter failure signal` (G-#6) | D 보완 연결 후 실제 visits + deviceStorage.setItem reject | 첫/세 번째 방문 | 화면 유지·카드 0개, counted:false | 가짜 반환만 검증하고 실제 불일치 생존 |

- P5 추가 행은 앞으로 구현할 시험 설계이고 실행하지 않았다. 공개 읽기(#10·#11)와 기기 동작이라 401/404(타인)/422/DB 시험은 N/A: 서버 쓰기 없음. #10·#11 서버 시험은 D LIB-0 소유, #26 서버 시험은 B LOCAL-2 소유.

---

### D 직접 확정한 연결·실패 규칙 (2026-11-17)

- 쟁점 1: VISIT-2는 LOCAL-2 이전 #26을 호출하지 않는다. LOCAL-2 연결 뒤 loading/error/empty를 구분하고 기존 머리를 유지한다.
- 쟁점 2: 거리 전달은 core K15의 선택 `distanceM`으로 확정했다. A V5가 #10의 `distance_m`을 숫자 문자열로 전달하고 없는 값은 생략한다. 기본 도서관 직접 진입은 거리 생략이다.
- 쟁점 3: 그림자 두 키는 D APP-0-P1 보완에서 제공한다. 수치의 `기본값(Claude)` 표기는 유지한다.
- 쟁점 4: C7에 LOCAL-1 의존과 미제공 시 동작을 명시했다. 새 공통 부품 export/남의 파일 편집을 허용하지 않는다.
- 쟁점 5: Step 하나=브랜치 하나=PR 하나다. P2 선행은 같은 PR 안 P1의 검증·커밋·CI 확인이다.
- 쟁점 6: C-58·C-61 및 상세 결정 1.2·1.2-1이 옛 A 명세보다 우선한다. 누적 질문·연속 멘트·정보 줄 오른쪽 ⋯를 유지한다.
- G6의 #10 실패/빈 목록은 기본값 해제 근거가 아니므로 보존하고 기본 도서관으로 간다. #11 404일 때만 사라진 기본값을 해제한다. 이름이 없을 때 멘트는 이름을 지어내지 않고 생략한다.
- 방문 기록은 #11 404를 배제한 뒤 한 번 처리한다. 재조회·리렌더에서 다시 세지 않는다. recordVisit 성공 여부와 API 성공 여부를 혼동하지 않는다.
- 화면 이탈/도서관 변경은 러너 cancel과 카드 타이머 해제를 수행한다. 기본값 처리 중 중복 입력을 막고 finally에서 해제한다. 제스처 중복 복귀는 Stack 전환 상태도 확인한다.

## LOCAL-2 광장 피드·상세·도서 연결·이어 읽기·공감·북마크

- **담당 역할**: B (서버 파트 포함) · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/LOCAL-2.md` (아직 없음)
- **기준선**: `B1` + 이 판(B2 준비)
- **선행 설계**: 05 §3.2 `post_reactions`·`post_bookmarks`·§7, 06 §2.4 26~30행
- **작성자**: D (시니어)


### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| H1 | 광장 피드는 **최신순만**: `published_at DESC, id DESC`. `sort`는 `latest`만 받고 그 밖은 422(인기순은 Q-31이 풀릴 때 연다) | 확정 / 미확인(임시) Q-31 | 06 #26 |
| H2 | 커서: `next_cursor`는 마지막 항목의 `(published_at, id)`를 base64url로 감싼 문자열(앱은 뜻을 읽지 않는다). `limit` 기본 20, 1~50 | 기본값(Claude) · `limit` 미확인(임시) Q-21 | 06 §1, H-ARCH-10 |
| H3 | 공개 상태(`published`)만 목록·상세에 나온다. 철회·숨김 게시물의 상세는 `404 POST_NOT_AVAILABLE`, 없는 id는 `404 NOT_FOUND` | 확정 | 06 #27, R10 |
| H4 | 피드 카드는 이미지만(제목·작성자 줄 없음). 카드에 필요한 필드만 목록에 준다(`FeedPost`), 작성자·공감 수·본문은 상세(`Post`) | 확정(C-48·C-54) | 02 LOCAL-03 |
| H5 | 공감은 게시물당 하나, `PUT`은 누르기·`DELETE`는 취소, 몇 번 해도 결과 같음. 응답에 최신 `reaction_count` | 확정(R14) | 06 #29 |
| H6 | 북마크도 같은 모양(`PUT`·`DELETE`), 다시 저장하면 `saved_at`을 새 시각으로. 모음 화면은 M1에 없다 | 미확인(임시) Q-56 | 06 #30, 05 §3.2 |
| H7 | 같은 책 이어 읽기 `#28`: 같은 `isbn13`의 공개 게시물(다른 도서관 포함), `exclude`(지금 보는 게시물 id) 빼고 최신순 | 확정 | 06 #28 |
| H8 | 공감 수는 `post_reactions`를 세어 준다(컬럼에 쌓지 않는다) | 기본값(Claude) | 05 §3.2 "LOCAL-2 계약서에서 정한다" |
| H9 | 상세의 대여 경로는 `#14 ?library_id=<방문 중인 도서관>`(없으면 게시물의 도서관), 구매는 `#15`. 대여가 구매보다 먼저 보인다 | 확정 | `기능_배정.md` B절 |
| H10 | 피드 카드 메뉴(길게 누르기, 웹은 호버 점 세 개): 책 제목 검색(`/search?q=` — C 화면이 쿼리를 받을 수 있게 LIB-1 계약에서 맞춤) / 저자로 검색 / 공유(시스템 공유창, 안 되면 링크 복사) / 좋아요 / 북마크. 책 제목 검색 자리를 '도서 없음(구매 링크)'로 바꾸는 뜻은 미결(C-46 D1) | 확정 / D1 미결 | `기능_배정.md` B절 |
| H11 | 공유 링크 모양: 웹 주소 `<웹 기준 주소>/posts/<post_id>`. 앱 딥링크 `localone://posts/<post_id>` | 기본값(Claude) | 06 §2.4 "LOCAL-2 계약서에서 정한다" |
| H12 | `PostCard`는 B의 부품이고 A의 홈 하단 창도 그대로 쓴다(props 아래 C2) | 확정(C-61) | `기능_배정.md` A절 |

**세부 명세(LOCAL-2)에서 정할 것 — D가 정하지 않음**: 2열 메이슨리의 간격·카드 비율, 상세가 펼쳐지는 모양(큰 틀 결정 8 안에서), 같은 책 이어 읽기 위치(큰 틀 결정 7 안에서), 공감·북마크 버튼 모양, 빈 광장 화면, 메뉴 문구, 공유 실패 안내.

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 | 인증 | 성공 | 날짜 형식 | 목록 페이지·정렬 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/libraries/{library_id}/posts?sort=latest&cursor=&limit=` (#26) | 선택 | `200` | `published_at` ISO `+09:00` | H1·H2 | 읽기만 |
| `GET /api/v1/posts/{post_id}` (#27) | 선택 | `200` | 같음 | N/A | 읽기만 |
| `GET /api/v1/books/{isbn13}/posts?exclude=&cursor=&limit=` (#28) | 선택 | `200` | 같음 | H1·H2 | 읽기만 |
| `PUT /api/v1/posts/{post_id}/reaction` (#29) | 필수 | `200` | — | N/A | 행 1개, 같은 응답 |
| `DELETE /api/v1/posts/{post_id}/reaction` (#29) | 필수 | `200` | — | N/A | 행 0개, 같은 응답 |
| `PUT /api/v1/posts/{post_id}/bookmark` (#30) | 필수 | `200` | — | N/A | 행 1개(`saved_at` 갱신) |
| `DELETE /api/v1/posts/{post_id}/bookmark` (#30) | 필수 | `200` | — | N/A | 행 0개 |

- 서버: `server/app/routers/feed.py`(B, #26~#28), `server/app/routers/reactions.py`(B, #29·#30). `post_public`(LOCAL-1)을 다시 쓴다.
- 앱(`mobile/src/features/local-feed/api.ts`): `fetchLibraryPosts(libraryId: number, page: { cursor: string | null; limit?: number }, signal?): Promise<FeedPage>` · `fetchBookPosts(isbn13: string, page: { cursor: string | null; exclude?: string; limit?: number }, signal?): Promise<FeedPage>` · `fetchPost(postId: string, signal?): Promise<Post>` · `setReaction(postId: string, on: boolean): Promise<ReactionState>` · `setBookmark(postId: string, on: boolean): Promise<BookmarkState>`
- 부품(`mobile/src/features/local-feed/PostCard.tsx`): `export function PostCard(props: { post: FeedPost; onPress(postId: string): void; onMenu?(post: FeedPost): void; width: number }): JSX.Element` — A가 `onMenu` 없이 쓴다.

#### C3. 요청·응답 필드

| 구분 | 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| 요청(#26·#28) | `sort` | `"latest"` | N | 기본 `latest` (#26만) |
| 요청(#26·#28) | `cursor` | `str` | N | H2. 깨진 값은 422 `detail="cursor"` |
| 요청(#26·#28) | `limit` | `int` | N | 기본 20, 1~50 |
| 요청(#28) | `exclude` | `str (UUID)` | N | 뺄 게시물 |
| 응답(#26·#28) `FeedPage` | `items` | `FeedPost[]` | Y | |
| `FeedPage` | `next_cursor` | `str \| null` | Y | |
| `FeedPost` | `id` | `str (UUID)` | Y | |
| `FeedPost` | `library_id` | `int` | Y | |
| `FeedPost` | `library_name` | `str` | Y | #28에서 다른 도서관 표시용(#26도 같은 모양) |
| `FeedPost` | `image_kind` | `"photo" \| "cover" \| "color"` | Y | |
| `FeedPost` | `image_url` | `str \| null` | Y | `Post`와 같은 규칙 |
| `FeedPost` | `image_color` | `str \| null` | Y | 토큰 이름 |
| `FeedPost` | `overlay_text` | `str \| null` | Y | 이미지 위 글자 |
| `FeedPost` | `book` | `{ isbn13: str; title: str; author: str \| null } \| null` | Y | 카드 메뉴 위에 보이는 제목·저자 |
| `FeedPost` | `published_at` | `str (ISO, +09:00)` | Y | |
| `FeedPost` | `my_reaction` | `bool` | Y | 비로그인 `false` |
| `FeedPost` | `my_bookmark` | `bool` | Y | 비로그인 `false` |
| 응답(#27) | `Post` | LOCAL-1 C3 | Y | |
| 응답(#29) `ReactionState` | `post_id`, `reacted`, `reaction_count` | `str`, `bool`, `int` | Y | |
| 응답(#30) `BookmarkState` | `post_id`, `bookmarked` | `str`, `bool` | Y | |

#### C4. 플랫폼 분기 표

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 카드 메뉴 열기 | `onLongPress` | 길게 누르기 | 같음 | 마우스를 올리면 점 세 개 버튼(`onHoverIn`) — RN `Pressable`의 공통 API | `PostCard.tsx`(분기 코드 없이 두 이벤트를 모두 받음) | 세 플랫폼 메뉴 열림 |
| 공유 | `Share.share({ url })` | 시스템 공유창 | 같음 | `navigator.share` 없으면 `navigator.clipboard.writeText` + `"링크를 복사했어요"` | `mobile/src/features/local-feed/share.ts` — B의 두 번째 분기 파일 | 웹에서 링크 복사 |

#### C5. 테이블

**`post_reactions`** — 역할: 공감 · 소유자 컬럼: `user_id` · 담당 마이그레이션: LOCAL-2-P2에서 만듦(`NNNN_post_reactions_bookmarks.py`)

| 컬럼 | 타입 | NULL | 기본값 | 키·제약 | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `post_id` | `uuid` | 아니오 | 없음 | PK①, FK → `posts.id` `ON DELETE CASCADE` | |
| `user_id` | `uuid` | 아니오 | 없음 | PK②, FK → `users.id` | 누른 사람 |
| `created_at` | `timestamptz` | 아니오 | `now()` | — | |

**`post_bookmarks`** — 역할: 북마크 · 소유자 컬럼: `user_id` · 담당 마이그레이션: 같은 파일

| 컬럼 | 타입 | NULL | 기본값 | 키·제약 | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `user_id` | `uuid` | 아니오 | 없음 | PK①, FK → `users.id` | |
| `post_id` | `uuid` | 아니오 | 없음 | PK②, FK → `posts.id` `ON DELETE CASCADE` | |
| `saved_at` | `timestamptz` | 아니오 | `now()` | — | 다시 저장하면 새 시각 |

| 삭제 동작 | 값 |
| :--- | :--- |
| 행을 지울 때 | 취소·해제는 실제로 지운다(`DELETE`) |
| 부모가 지워질 때 | `posts`는 지우지 않으므로 CASCADE가 실제로 돌 일은 없다(`libtalk`과 같게 둠). `users`는 `NO ACTION`(AUTH-3) |
| 허용하지 않는 값 | 같은 (게시물, 사람) 두 번 → PK, `ON CONFLICT DO NOTHING`(북마크는 `DO UPDATE SET saved_at = now()`) |
| 행 수준 보안(RLS) | 두 테이블 `ENABLE ROW LEVEL SECURITY`, 정책 없음 + `test_reactions_bookmarks_rls_enabled` |

#### C6. 검증과 에러 처리

| 예외 # | 발생 조건 | HTTP / `code` | 동작 | 기록 무변경 보장 |
| :--- | :--- | :--- | :--- | :--- |
| H-#1 | `sort`가 `latest` 아님, 깨진 `cursor`, `limit` 범위 밖, 잘못된 UUID·ISBN | `422` / `VALIDATION_ERROR` + 필드 | | — |
| H-#2 | 없는 도서관(#26) | `404` / `NOT_FOUND` | | — |
| H-#3 | 없는 게시물(#27·#29·#30) | `404` / `NOT_FOUND` | | 행 무변경 |
| H-#4 | 철회·숨김 게시물(#27·#29·#30) | `404` / `POST_NOT_AVAILABLE` | `"더 이상 공개되지 않는 게시물이에요."` | 공감·북마크 행 생기지 않음 |
| H-#5 | 공감·북마크 연타 | `200` 같은 결과 | | 행 0 또는 1 |
| H-#6 | 로그인 없이 #29·#30 | `401` / `AUTH_REQUIRED` | 로그인 안내 | 행 0 |
| H-#7 | 탈퇴 경합 중 #29·#30 | `403` / `ACCOUNT_WITHDRAWN` | | 행 0 |
| H-#8 | 선택 인증에 깨진 토큰 | `401`(core S2) | 앱은 갱신 뒤 재시도 | — |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D SRV-0-P1 | `get_optional_user`, `lock_active_user` | core SRV-0 C7 |
| D LIB-0-P3 | #14·#15 | core LIB-0 C7 |
| A VISIT-1b | #26·`PostCard` 사용 | A는 이 계약의 `FeedPost` 모양 가짜로 진행(library-visit VISIT-1b C7) |
| C LIB-1 | `/search?q=` 쿼리 받기 | `book-search.md` LIB-1 C2에 고정 |

### 구현 계획

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 항목 |
| :--- | :--- | :--- | :--- |
| `LOCAL-2-P1` 서버: 피드·상세·이어 읽기 읽기 | `feat/local-feed-LOCAL-2-part1` | `server/app/routers/feed.py`, `server/app/routers/posts.py`(`post_public`만), `server/app/main.py`(`[local-feed-B]` 블록), `server/tests/test_feed.py` | H1~H4·H7·H8, H-#1~#4·#8 |
| `LOCAL-2-P2` 서버: 공감·북마크 | `feat/local-feed-LOCAL-2-part2` | `server/migrations/versions/NNNN_post_reactions_bookmarks.py`, `server/app/routers/reactions.py`, `server/app/main.py`(`[local-feed-B]` 블록), `server/tests/test_reactions.py` | H5·H6, C5, H-#3~#7 |
| `LOCAL-2-P3` 앱: 광장 피드·카드·메뉴 | `feat/local-feed-LOCAL-2-part3` | `mobile/src/features/local-feed/PostCard.tsx`, `mobile/src/features/local-feed/LibraryFeed.tsx`, `mobile/src/features/local-feed/PostMenu.tsx`, `mobile/src/features/local-feed/share.ts`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/VisitScreen.tsx`(피드 자리 연결), `mobile/src/features/local-feed/__tests__/feed.test.tsx` | H1·H4·H10~H12 + 세부 명세 |
| `LOCAL-2-P4` 앱: 상세·이어 읽기·공감·대여/구매 | `feat/local-feed-LOCAL-2-part4` | `mobile/app/posts/[postId].tsx`, `mobile/src/features/local-feed/PostDetail.tsx`, `mobile/src/features/local-feed/SameBookPosts.tsx`, `mobile/src/features/local-feed/ReactionButton.tsx`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/__tests__/detail.test.tsx` | H3·H5~H7·H9 + 세부 명세 |

##### 파트 머리말 (LOCAL-2-P1~P4 공통 칸)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | 위 표의 각 ID |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | B2 준비 |
| 4. 계약서 커밋 | `82fb574fb59d4a73beabcbf4b77fa200998a5852` (본문 커밋) |
| 5. 선행 태스크 | **`specs/local-feed/세부/LOCAL-2.md` 머지**. P1 ← `LOCAL-1-P1`, P2 ← P1, P3 ← P1·`VISIT-2-P1`, P4 ← P2·P3. 각 파트는 최신 `origin/main`에서 |
| 6. 수정 허용 파일 | 위 표의 그 행 |
| 7. 금지된 결정 | 인기순·모음 화면·댓글(Q-57) 금지. 카드에 작성자·공감 수 넣기 금지(H4) |
| 8. 완료 조건 | 위 표의 항목 + P5 그 파트 시험 + (앱 파트) 웹·Android |
| 9. 검증 명령 | 서버 파트: LOCAL-1-P1과 같음 / 앱 파트: LOCAL-1-P2와 같음 |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P1·P3·P4

- P1: `libtalk` `0002_m1_core.py`의 `post_reactions`·`post_bookmarks` 정의, LOCAL-1의 `post_public`. 새 라이브러리 없음.
- P4 골격(#26 커서):

```python
async def library_feed(request, library_id: int, sort: str = "latest", cursor: str | None = None, limit: int = 20,
                       viewer: CurrentUser | None = Depends(get_optional_user)):
    if sort != "latest":
        raise ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, "sort")      # H1 (Q-31 전)
    after = decode_cursor(cursor)                                            # 깨지면 422 cursor
    def tx(c):
        if not c.execute(text("SELECT 1 FROM libraries WHERE id=:id"), {"id": library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND)
        rows = c.execute(text("""
            SELECT p.*, l.name AS library_name, b.isbn13, b.title, b.author, b.cover_url
            FROM posts p JOIN libraries l ON l.id = p.library_id LEFT JOIN books b ON b.id = p.book_id
            WHERE p.library_id = :lib AND p.status = 'published'
              AND (:after_at IS NULL OR (p.published_at, p.id) < (:after_at, :after_id))
            ORDER BY p.published_at DESC, p.id DESC LIMIT :n"""), {..., "n": limit + 1}).all()
        mine = my_flags(c, viewer, [r.id for r in rows[:limit]])            # 비로그인이면 전부 False
        return rows, mine
    rows, mine = await run_db(request.app.state.engine, tx)
    page = rows[:limit]
    return {"items": [feed_post(r, mine) for r in page],
            "next_cursor": encode_cursor(page[-1]) if len(rows) > limit else None}
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LOCAL-2-P1 | `test_feed_latest_only_published` | 공개 3·철회 1 | #26 | 3개 최신순, 철회 없음 | R10 |
| LOCAL-2-P1 | `test_feed_cursor_no_dup_no_gap_on_ties` | 같은 `published_at` 5개 | `limit=2`로 끝까지 | 5개 정확히 한 번씩 | H-ARCH-10 |
| LOCAL-2-P1 | `test_feed_popular_sort_is_422` | — | `sort=popular` | `422 detail=sort` | Q-31 전 개방 |
| LOCAL-2-P1 | `test_feed_item_has_no_author_or_count` | — | #26 | 항목에 `author`·`reaction_count`·`user_id` 키 없음 | H4·격리 |
| LOCAL-2-P1 | `test_feed_my_flags_signed_in_and_out` | A가 공감 | A / 비로그인 | `my_reaction` true / false | 선택 인증 |
| LOCAL-2-P1 | `test_detail_withdrawn_is_post_not_available` | 철회 게시물 | #27 | `404 POST_NOT_AVAILABLE` | 직접 주소 노출 |
| LOCAL-2-P1 | `test_detail_unknown_is_not_found` | — | #27 | `404 NOT_FOUND` | |
| LOCAL-2-P1 | `test_same_book_posts_cross_library_exclude` | 같은 책 두 도서관 3개 | #28 `exclude` | 2개, 뺀 것 없음 | H7 |
| LOCAL-2-P1 | `test_bad_token_on_optional_endpoint_is_401` | 깨진 토큰 | #26 | `401` | core S2 |
| LOCAL-2-P2 | `test_reaction_put_twice_one_row` | — | `PUT` 두 번(동시 포함) | 행 1, `reaction_count 1` | R14 |
| LOCAL-2-P2 | `test_reaction_delete_twice_zero_rows` | 공감 1 | `DELETE` 두 번 | 행 0, 둘 다 `200` | |
| LOCAL-2-P2 | `test_reaction_on_withdrawn_is_404_no_row` | 철회 | `PUT` | `404 POST_NOT_AVAILABLE`, 행 0 | |
| LOCAL-2-P2 | `test_bookmark_resave_updates_saved_at` | 저장됨 | `PUT` 다시 | 행 1, `saved_at` 커짐 | H6 |
| LOCAL-2-P2 | `test_reaction_requires_login` | — | 토큰 없이 | `401`, 행 0 | |
| LOCAL-2-P2 | `test_reaction_while_withdrawing_is_403` | 탈퇴 경합 | `PUT` | `403`, 행 0 | `lock_active_user` |
| LOCAL-2-P2 | `test_reactions_bookmarks_rls_enabled` | — | 카탈로그 | RLS, 정책 0 | |
| LOCAL-2-P3·P4 | (세부 명세 머지 뒤 D+B 판에서 채운다. 최소: 카드에 이미지만, 메뉴 다섯 항목, 웹 링크 복사, 공감 연타 1건, 철회된 상세 문구, 대여가 구매보다 위, 다른 도서관 게시물을 열어도 방문 중 도서관 느낌 유지) | | | | |
