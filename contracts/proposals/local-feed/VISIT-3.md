# 도서관 방문 페이지 (`local-feed`) 기술 계약서

> 이 파일은 B의 도서관 방문 페이지(SNS 화면 전체) 계약서다. Step마다 절을 둔다: **LOCAL-1**(게시물 작성·공개·철회) → **VISIT-2**(방문 페이지의 틀) → **LOCAL-2**(방문 페이지 피드·상세·이어 읽기·공감·북마크). 순서는 `기능_배정.md` B절.
> 상태: **M1 전 Step(`LOCAL-1` · `VISIT-2` · `LOCAL-2`) D+B 확정판(2026-11-17).**
> - **용어 확정(2026-11-17 사용자 결정)**: `"광장"` 개념·명칭은 쓰지 않는다. 도서관 진입 화면은 **핀터레스트형 방문 페이지 피드**(+ M2 하단 책장, M1은 피드만) 구조이며, 문서와 화면 문구 모두 `"피드"`(또는 `"방문 페이지 피드"`)로 통일한다.
> - 공통 함수·공공 엔드포인트(#7~#15)·화면 경로·기기 저장 키는 [`core.md`](core.md)가 원본이다.
> - **2026-11-18 페이지 디자인 1차(코드 레포 C-73, 병렬 작업 L1·L3c, D 결정 "글쓰기 사진 자리와 입력 칸·올리기 배치"·"글 상세 행동 줄과 도서 대여 카드", 코드 레포 `DESIGN.md` "페이지 적용 레시피"):** LOCAL-1 F13·F14·F15·F16·F17, VISIT-2 G11·G12·G13·G14, LOCAL-2 H9·H10·H14·C3 문구 2줄·P5 시험 1줄의 **화면 칸**만 바꿨다. 노랑(`fill1`) 채움 버튼·켬 표시 → 무광 판·`inkStrong`, 곡률 12·18 → 9(게시물 이미지 18은 그대로), 글쓰기 `"올리기"`는 아래로, 상세는 본문 → 도서 카드 순서·북마크 아이콘·`"구매 ↗"`. **API·필드·테이블·에러 코드·`image_kind` 전송 규칙은 바뀌지 않는다.** 반영 코드는 L4(`진행_L4_글쓰기_글상세.md`·`진행_L4_방문페이지.md`). 이전 줄은 git 이력(이 파일의 이 커밋 직전)에 있다.

## Pre-flight 5대 관문 (코드 레포 `main` `74d2885` · `libtalk` `6944ce1`)

| 관문 | 확인한 것 | 이 계약서의 처리 |
| :--- | :--- | :--- |
| ① 격리·권한·호환 | 사용자 식별 `server/app/auth.py:175-184`(`get_current_user`), `:186-189`(`get_optional_user`). 05 §3.2 `posts`·`post_reactions`·`post_bookmarks` 핵심 제약, §4 "응답에 `user_id` 대신 닉네임만". 06 §3 `FORBIDDEN`(남의 게시물 철회), `POST_NOT_AVAILABLE` | 작성자는 토큰의 `sub`만. 남의 게시물 철회는 403(공개 리소스), 남의 북마크는 볼 길이 없음. 응답에 `user_id`를 넣지 않는다. 세 테이블 RLS |
| ② 동시성·트랜잭션·외부 I/O | `run_db` `server/app/db.py:16-28`. 사진 저장·EXIF 제거·책 조회는 외부 I/O. 쓰기 첫 SQL `lock_active_user`(`server/app/auth.py:137-146`) | 업로드·`get_book`은 트랜잭션 밖. 게시물 만들기는 `client_request_id` UNIQUE로 연타 한 건. 공감·북마크는 PK + `ON CONFLICT DO NOTHING` |
| ③ 전제 실재성 | 코드 `main` `74d2885`에 `0001_users.py`, `0002_public_reference.py`(`libraries`·`books`), `0003_user_profiles.py`(`user_profiles`), `lock_active_user`·`nickname_of`·`get_optional_user`(`server/app/auth.py`), `ProviderEngine.get_book`(`server/app/services/provider_engine.py`), `theme`·`publicApi`·`visits`·경로 스텁(`mobile/src/`·`mobile/app/`) 머지 완료 | 선행 공통 파트(`SRV-0`·`LIB-0`·`APP-0`)가 모두 `main`에 있으므로 실제 심볼에 바로 연결한다(단독 시험용 C7 대역은 그대로 허용) |
| ④ 담당 파일 충돌 | `server/app/main.py`는 `[auth-D]`·`[lib-D]` 블록. 방문 페이지·글쓰기·상세 경로 파일은 core 스텁(`mobile/app/libraries/[libraryId].tsx`, `mobile/app/posts/new.tsx`, `mobile/app/posts/[postId].tsx`)을 B가 교체(core K15) | B는 `# ── [local-feed-B] ──` 블록 안에서만 라우터를 등록한다. 각 Step은 **Step 하나 = 브랜치 하나 = PR 하나**로 진행한다 |
| ⑤ 승인 게이트 | `LOCAL-1` 기획 PR #78 머지(`3cbc740`), `VISIT-2` 기획 PR #94·계약 PR #102 머지, `LOCAL-2` 상세 구조·버튼·메뉴 D(사용자) 직접 확인 완료(2026-11-17) | 새 서버 라이브러리 `pillow`(`python-multipart`), 앱 `expo-image-picker`·`expo-image-manipulator`는 LOCAL-1 P3에 명시 |

---

## LOCAL-1 게시물 작성·표지·공개·철회

- **담당 역할**: B (서버 파트 포함) · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/LOCAL-1.md` (PR #78 머지 `3cbc740d5f34aa980bdb2ef04836cf99ca96bb67`, 명세 커밋 `8ed2603b3348eed39688fcf7a1da27fdc8a7ac2e`, 최신 `2e8a9bc3e5b148662e15c699b982c1461ca0fd02`), 시안 `specs/local-feed/세부/LOCAL-1_시안.html`, 큰 틀 `specs/local-feed/명세서.md`
- **판**: **D+B 확정판(2026-11-17)** — D 기준선에 세부 명세(`LOCAL-1.md`)의 중심 결정 4개(결정 1~4), 기본값 10개, 예외 #1~#7과 닫힌 PR #101 검토 메모 쟁점 4건(선행 마이그레이션 `0004_posts.py` 연결, `mobile/app.json` 허용, 표지 없는 책의 저장 형태, 상세 연결 전 내리기 확인 경계)을 모두 반영해 확정한 판이다.
- **기준선**: `B2` + M1 `LOCAL-1` D+B 확정판
- **선행 설계**: 05 §3.2 `posts` 행·§7 인덱스 2줄, 06 §2.4 23~25행, 06 §3
- **작성자**: D (시니어)
- **상태**: **계약 확정 — B 구현 착수 가능.**
- **발행 본문 SHA**: `f2fb65a33b5339bd23a91871b08b595eaeb7bc92`


### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| F1 | 게시물은 **올리기를 눌러야 행이 생기고 그때 공개**된다. 초안은 서버·기기에 임시 저장하지 않는다 | 확정 | 05 §3.2, 02 LOCAL-01, 명세 §0 기본값 |
| F2 | 이미지는 `photo`(직접 찍은 사진) / `cover`(책 표지) / `color`(단색) 중 하나. 본문·이미지 위 글자는 없어도 된다(이미지만으로 올릴 수 있다) | 확정 | `기능_배정.md` B절 |
| F3 | 사진은 먼저 `#23`으로 올리고 받은 `image_path`를 `#24`에 넣는다. 서버가 **다시 JPEG로 저장하면서 EXIF(위치 포함)를 모두 지운다**. 긴 변 2048px로 줄이고 품질 85 | 동작 확정(06 #23) · 숫자 기본값(Claude) | NFR-05 |
| F4 | 사진 저장소는 Supabase Storage 버킷 `post-images`, 경로 `<user_id>/<uuid>.jpg`, 공개 읽기 주소를 `image_url`로 준다 | 미확인(임시) Q-53 | 05 §11 Q-53 |
| F5 | 사진 상한 10,000,000바이트, 받는 형식 `image/jpeg`·`image/png`·`image/webp` | 미확인(임시) Q-53 | 06 §3 `PAYLOAD_TOO_LARGE` |
| F6 | 표지(`cover`)는 책이 있어야 하고 그 책의 `cover_url`을 서버가 넣는다(앱이 주소를 보내지 않는다). 표지 주소가 없는 책이면 서버는 `cover` 요청을 422로 거부하고, 앱은 아래 F14 규칙대로 제목·저자 표지(`color` + `fill3`)로 보내거나 사진·단색으로 바꾸게 안내한다 | 확정(F6·F14) | `기능_배정.md` B절, 명세 결정 2·예외 #5 |
| F7 | 단색(`color`)의 값은 **색 토큰 이름**이다: `fill1`·`fill2`·`fill3`·`cream`·`paper`·`inkStrong` 6개 확정. 룩이 바뀌면 같은 이름의 다른 색이 된다 | 확정(세부 명세 §0 기본값 6) | PROJECT §3-14, 명세 §0 |
| F8 | 책은 `isbn13`으로 연결하고 서버가 조회 엔진 `get_book`으로 `books` 행을 찾거나 만든다(트랜잭션 밖) | 확정 | core LIB-0 C2 |
| F9 | 연타·재시도: 앱이 글쓰기 화면을 열 때 `client_request_id`(UUID v4)를 하나 만들어 보낸다. 같은 사용자·같은 값의 두 번째 요청은 **첫 게시물을 그대로 200**으로 돌려준다(행 1개) | 기본값(Claude) | 06 §1 "연타·재시도 … 두 번째 응답도 성공" |
| F10 | 철회는 작성자만. 철회하면 바로 목록·직접 주소에서 안 보인다(`status = 'withdrawn'`, 행은 지우지 않음). 이미 철회한 것을 다시 철회해도 200 | 확정(R10) / 멱등 기본값(Claude) | 06 #25 |
| F11 | 게시물 위치는 도서관 방문 페이지 피드 하나(`library_id` 필수). 사진의 촬영 위치는 쓰지 않는다 | 확정 | 05 §3.2 |
| F12 | 파일럿 동안 게시물을 참여자에게만 보이게 하는 방법은 정하지 않는다(공개 읽기 그대로) | 미확인(임시) Q-54 | 05 §4 |
| F13 | **글쓰기 버튼의 모양·자리(명세 결정 1, C-46 F3 시안 검토 완료)**: 방문 페이지 피드 오른쪽 아래에 떠 있는 둥근 `"+"`(FAB). 크기 앱 64×64(시안 48, 0.75배), **(2026-11-18 개정, 이전: 배경 `theme.colors.fill1`·글자 `onFill(fill1)`·그림자 `shadowFloat`) 무광 판: 배경 `theme.colors.panelLit` + 1px `seamHairline` + 아래 2px `reliefBottomMid` 받침, `"+"` 글자 `inkStrong`, 누르면 받침이 사라지며 1px 내려앉음, 그림자 없음**, 모서리 `theme.radii.control`(`9999`), 오른쪽 16·아래 24. 피드를 내려도 같은 자리에 있다. 누르면 로그인 상태면 `/posts/new?libraryId=<libraryId>`로 이동하고, 비로그인이면 로그인 안내 창(예외 #4, VISIT-2 G13과 동일)을 띄운다. 방문 페이지 화면의 `"+"` 배치·비로그인 시트는 `VISIT-2-P1`(`VisitScreen.tsx`)과 연결되며 `LOCAL-1-P2`는 `/posts/new` 글쓰기 화면을 담당한다 | 확인 — 사용자: "오른쪽 아래 + 버튼이요 · 가장 직관적이고 깔끔해요" | 명세 결정 1, 예외 #4 |
| F14 | **쓰는 순서와 '책 표지' 선택·표지 없는 책 처리(큰 틀 결정 5·6, 명세 결정 2, 예외 #2·#5)**: ① **이미지 고르기**(`photo` 사진 찍기·앨범 / `cover` 책 표지 / `color` 단색 배경) → ② **이미지 위 글자**(`overlay_text`, 선택) → ③ **감상**(`body`, 선택 — 기본은 접어 두고 `"+ 감상 쓰기"`만 보이며 누르면 펼쳐짐, 큰 틀 결정 6) → ④ **책·도서관 확인**(방문 중인 도서관이 자동 지정되어 `"<도서관명> 피드에 올라가요"` 표시, `"책 붙이기"`로 `publicApi.searchBooks`를 통해 책을 고르거나 바꿀 수 있으며 책 없이도 올릴 수 있음). **화면 모양(2026-11-18 개정, D 결정 "글쓰기 사진 자리와 입력 칸·올리기 배치" A, 이전: 첫 화면에 이미지 선택 타일 4개 상시 나열 + 오른쪽 위 `"올리기"`)**: 머리는 루트 `headerOptions("POST")` 유리판 띠 하나에 왼쪽 `"✕"`만 둔다(화면 안 머리 `"✕ · 새 게시물 · 올리기"` 없음). ① 단계는 안쪽 상자 없는 점선 빈 액자 하나(4:5, 곡률 `theme.radii.card` 18)이고, 누르면 첨부 작은 창(`cardSurface(theme, { onPanel: true })` = `panelLit` + 1px `seamHairline` + 곡률 9, 그림자 없음 — 휴대폰은 액자 위, 웹은 액자 옆 작은 모달, 바깥 누르면 닫힘)에 `"사진 찍기"`·`"앨범에서 고르기"`·`"책 표지"`·`"단색 배경"` 4줄(아이콘 + 이름)이 뜬다. 고르면 액자 자리가 4:5 미리보기가 되고 다시 누르면 같은 창으로 바꾼다. 입력 칸은 `paper` + 1px `seamHairline`, 곡률 9, 포커스 1.5px `inkStrong`. 화면 아래 `panelLit` 받침 판(곡률 3, 위 1px `seamHairline`) 위에 주 버튼 `"올리기"`(무광 판 `actionColors().primary`, 높이 48)를 둔다. 아래 `"올리기"`는 이미지를 고르기 전까지 흐리게 비활성화하고 `"이미지를 하나 골라야 올릴 수 있어요"`(예외 #2)를 보인다. 첫 화면에서 `'책 표지'`를 누르면 **누르자마자 책 찾기**로 이어지고 고른 책이 마지막 단계에도 자동 부착된다(결정 2). 고른 책에 `cover_url`이 있으면 `image_kind="cover"`로 보내고, **`cover_url === null`(표지 없는 책)이면 화면에 제목·저자로 만든 표지와 `"표지를 찾지 못해 제목·저자로 만들었어요 · 사진·단색으로 바꾸기"`(예외 #5)를 보여 주며, 그대로 올릴 때는 `image_kind="color"`, `image_color="fill3"`, `isbn13=<고른 책 isbn13>`, `overlay_text`=(사용자 입력 글자가 있으면 그 글자, 없으면 `"<제목>\n<저자>"` 또는 저자 없을 때 `"<제목>"`을 80자 이내로 자른 값)로 `#24`에 보낸다**(F6 422 회피·DB CHECK 준수) | 확인 — 사용자: "A가 마음에 드네요. 심플하기도 하고, 마지막에 다시 찾을 일이 없어서요." / 표지 없는 책 저장 모양 D 확정 | 큰 틀 결정 5·6, 명세 결정 2, 예외 #2·#5, PR #101 검토 메모 |
| F15 | **이미지 위 글자 모양·위치·길이 확정(큰 틀 결정 2, 명세 결정 3)**: 글자 크기는 앱 20px(시안 15px) 굵게, 자동 대비(`onFill` 또는 밝은 글자 + `shadowSoft`). 단색 배경(`color`)은 늘 가운데(`mid`). 사진·표지(`photo`·`cover`)는 **위(높이 10% 지점)·가운데(45% 지점)·아래(아래 끝)** 세 자리 버튼 중 고르며 처음 기본값은 가운데(`mid`)다(결정 3). 위치 칩(2026-11-18 개정, 이전: 켬 `fill1` 채움)은 보조 버튼 판(`actionColors().secondary`)이고 켬은 1px `inkStrong` 테두리 + `inkStrong` 글자(노랑 없음). DB `posts` 테이블(C5)에는 별도 위치 컬럼을 두지 않는다. 최대 길이는 `overlay_text` 앞뒤 공백 제거 후 **80자**, `body` 앞뒤 공백 제거 후 **2,000자**(빈 값은 `null`)로 확정한다 | 확인 — 사용자: "A가 좋아요. 버튼 한번으로 자리를 옮길수 있어서요" / 길이 기본값(Claude) 확정 | 큰 틀 결정 2, 명세 결정 3, §0 기본값 7·8 |
| F16 | **내 게시물을 내리는(철회) 자리와 확인 창(명세 결정 4, 예외 #4·#6)**: 내 게시물(`is_mine === true`) 상세 오른쪽 위 `⋯` 메뉴에 `"게시물 내리기"`를 둔다(남의 게시물 `is_mine === false`의 `⋯` 메뉴에는 `"공유"`만 있고 `"게시물 내리기"` 없음). 누르면 확인 창 `"이 게시물을 내릴까요? 내리면 피드와 링크에서 바로 사라져요."`(`"취소"` / `"내리기"`, 구 문구 `"광장과 링크"`도 호환 허용)를 띄우고, `"내리기"`를 누르면 `#25`를 호출해 철회한 뒤 피드로 돌아가 카드를 감추고 `"내렸어요"`(2초)를 띄운다. `⋯` 작은 창·확인 창·토스트 모양(2026-11-18 개정, 이전: `paper` + 곡률 12·18 + 그림자): `cardSurface(theme, { onPanel: true })`(곡률 9, 그림자 없음), 확인 창의 `"내리기"`만 주 버튼, `"취소"`는 보조 버튼. `LOCAL-2-P4` 상세 화면 연결 전에도 `LOCAL-1-P2` 단독으로 내리기 동선을 검증할 수 있도록 `ComposeScreen.tsx`에서 올린 직후 내 게시물 미리보기 + `PostMoreMenu`(`⋯` → `"게시물 내리기"`)를 함께 제공한다 | 확인 — 사용자: "A가 좋아요. 실수로 누를 일이 없어서요." | 명세 결정 4, 예외 #4·#6, PR #101 검토 메모 |
| F17 | **글쓰기 화면 열림·닫기 확인·올리기 완료(명세 §0 기본값, 예외 #1·#3·#7)**: 글쓰기 화면은 아래에서 올라오는 전체 화면이고 왼쪽 위 `"✕"`로 닫는다. 선택한 이미지나 입력한 글자·감상·책이 있을 때 `"✕"`를 누르면 `"쓰던 글을 버릴까요? 닫으면 쓴 내용이 남지 않아요."`(`"계속 쓰기"` / `"버리기"`, 예외 #7)를 묻는다. `"올리기"`를 누르면 `"올리는 중…"`으로 바뀌어 다시 눌리지 않고(예외 #3), 완료되면 `"올렸어요"`(2초, 2026-11-18 개정: 토스트는 `inkStrong` 채움이 아니라 무광 면 곡률 9)를 보인다. 닫기 확인 창도 무광 면 곡률 9이고 주 버튼은 `"버리기"` 하나. 실패하면 입력 내용을 지우지 않고 위에 `"지금은 올릴 수 없어요. 쓴 내용은 그대로 있어요."` + `"다시 올리기"`(413이면 `"사진이 너무 커요."`)를 띄운다(예외 #1) | 기본값(Claude) · 확인 | 명세 §0 기본값 1~5, 예외 #1·#3·#7 |

**세부 명세(LOCAL-1)에서 정한 것 — D+B 확정판 반영 완료**: 쓰는 순서·화면 모양 = F14, 글자 넣기 모양·자리·길이(80자·2,000자) = F15, 단색 후보 6개 = F7, 글쓰기 버튼 형태·위치 = F13, 표지 없을 때 안내·저장 형태 = F14, 철회 버튼 자리·확인 문구 = F16, 닫기 확인·초안 미저장 = F1·F17.

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
| 요청(#24) | `library_id` | `int` | Y | 방문 페이지 도서관(F11) |
| 요청(#24) | `isbn13` | `str \| null` | N | 책 연결(F8). `cover`면 Y |
| 요청(#24) | `image_kind` | `"photo" \| "cover" \| "color"` | Y | F2 |
| 요청(#24) | `image_path` | `str \| null` | `photo`면 Y | #23이 준 값. **자기 `user_id`로 시작해야 한다** |
| 요청(#24) | `image_color` | `str \| null` | `color`면 Y | F7 토큰 이름(`fill1`·`fill2`·`fill3`·`cream`·`paper`·`inkStrong`) |
| 요청(#24) | `overlay_text` | `str \| null` | N | 앞뒤 공백 제거, 빈 값은 `null`. 최대 80자(F15 확정) |
| 요청(#24) | `body` | `str \| null` | N | 앞뒤 공백 제거, 빈 값은 `null`. 최대 2,000자(F15 확정) |
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
| 화면 문구 | 업로드 서버 오류(#23 503) | — | — | `"사진을 올리지 못했어요. 다시 시도해 주세요."`(서버 기본 메시지) |
| 화면 문구 | 올리기 막힘(예외 #1) | — | — | `"지금은 올릴 수 없어요. 쓴 내용은 그대로 있어요."` + `"다시 올리기"` |
| 화면 문구 | 사진 큼(예외 #1·#23 413) | — | — | `"사진이 너무 커요."`(06 §3) |
| 화면 문구 | 이미지 미선택(예외 #2) | — | — | `"이미지를 하나 골라야 올릴 수 있어요"` (오른쪽 위 `"올리기"` 비활성) |
| 화면 문구 | 올리는 중·완료(예외 #3) | — | — | `"올리는 중…"` → 완료 후 `"올렸어요"`(2초) |
| 화면 문구 | 비로그인 글쓰기 진입(예외 #4) | — | — | `"로그인하면 글을 올릴 수 있어요"` + `"로그인하기"` / `"닫기"` |
| 화면 문구 | 표지 없는 책 안내(예외 #5) | — | — | `"표지를 찾지 못해 제목·저자로 만들었어요 · 사진·단색으로 바꾸기"` |
| 화면 문구 | 철회 확인·완료(결정 4) | — | — | 메뉴 `"게시물 내리기"` → `"이 게시물을 내릴까요? 내리면 피드와 링크에서 바로 사라져요."`(구 문구 `"광장과 링크에서"` 호환 허용) + `"취소"` / `"내리기"` → `"내렸어요"`(2초) |
| 화면 문구 | 철회 뒤 직접 주소(예외 #6) | — | — | `"더 이상 공개되지 않는 게시물이에요."` + `"피드 보기"`(구 문구 `"광장 보기"` 호환 허용) |
| 화면 문구 | 쓰던 글 닫기 확인(예외 #7) | — | — | `"쓰던 글을 버릴까요? 닫으면 쓴 내용이 남지 않아요."` + `"계속 쓰기"` / `"버리기"` |
| 화면 문구 | 감상 접기·도서관 표시 | — | — | `"+ 감상 쓰기"` / `"<도서관명> 피드에 올라가요"`(구 문구 `"광장에 올라가요"` 호환 허용) |

#### C4. 플랫폼 분기 표

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 사진 고르기·찍기 | `pickPostImage(source: "camera" \| "library"): Promise<{ uri: string } \| null>` | `expo-image-picker` 카메라·사진첩 | 같음 | 사진첩만(`<input type=file>`, `expo-image-picker` 웹 동작). 카메라는 `null` + 안내 | `mobile/src/features/local-feed/imagePicker.ts` — **이 계약서가 허용하는 B의 분기 파일 하나**(core에 없는 기능 전용 분기) | 세 플랫폼에서 사진 한 장 올림 |
| 올리기 전 줄이기 | `expo-image-manipulator`로 긴 변 2048·JPEG(서버가 한 번 더 지운다) | 같음 | 같음 | 같음 | 같은 파일 | 큰 사진도 413 없이 올라감 |

#### C5. 테이블

**`posts`** — 역할: 방문 페이지 피드 게시물 · 소유자 컬럼: `user_id`(작성자) · 담당 마이그레이션: LOCAL-1-P1에서 만듦(`0004_posts.py`)

| 컬럼 | 타입 | NULL | 기본값 | 키·제약 | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | 아니오 | `gen_random_uuid()` | PK | |
| `user_id` | `uuid` | 아니오 | 없음 | FK → `users.id` | 작성자 |
| `library_id` | `bigint` | 아니오 | 없음 | FK → `libraries.id` | 방문 페이지 도서관(F11) |
| `book_id` | `bigint` | 예 | 없음 | FK → `books.id`, CHECK `image_kind <> 'cover' OR book_id IS NOT NULL` | F6·F8 |
| `image_kind` | `text` | 아니오 | 없음 | CHECK `IN ('photo','cover','color')` | |
| `image_value` | `text` | 아니오 | 없음 | CHECK 종류와 값이 맞음: `(image_kind='photo' AND image_value ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$') OR (image_kind='cover' AND image_value LIKE 'https://%') OR (image_kind='color' AND image_value IN ('fill1','fill2','fill3','cream','paper','inkStrong'))` | 사진 경로 / 표지 주소 / 색 토큰(05 핵심 제약) |
| `overlay_text` | `text` | 예 | 없음 | CHECK `overlay_text IS NULL OR char_length(overlay_text) BETWEEN 1 AND 80` | 최대 80자 확정(F15) |
| `body` | `text` | 예 | 없음 | CHECK `body IS NULL OR char_length(body) BETWEEN 1 AND 2000` | 최대 2,000자 확정(F15) |
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

#### C6. 검증과 에러 처리 (세부 명세 예외 #1~#7 1:1 연결 완료)

| 예외 # | 명세 예외 | 발생 조건 | HTTP / `code` | 화면 문구·동작 | 기록 무변경 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F-#1 | 예외 #4 | 토큰 없음·깨짐 / 비로그인에서 글쓰기 진입 | `401` / `AUTH_REQUIRED` 등(auth.md C6) | 앱: `"로그인하면 글을 올릴 수 있어요"` + `"로그인하기"`(`/login`) / `"닫기"` | 행 0, 파일 0 |
| F-#2 | 예외 #1 | 사진이 10MB 초과 | `413` / `PAYLOAD_TOO_LARGE` | `"사진이 너무 커요."`(입력 내용 유지) | 파일 0 |
| F-#3 | 예외 #2 | 사진 형식이 아님·읽을 수 없음 / #24 필드 누락·형식(종류별 필수 값, `image_color` 목록 밖, 길이 초과, `image_path`가 남의 경로) / 앱에서 이미지 미선택 | `422` / `VALIDATION_ERROR`, `detail` = 필드 이름 (앱 미선택은 전송 전 차단) | 서버: `"요청 형식이 올바르지 않아요."` / 앱 미선택: `"이미지를 하나 골라야 올릴 수 있어요"` + `"올리기"` 비활성 | 행 0 |
| F-#4 | 예외 #5 | 서버에 `cover`인데 책 표지 주소가 없음 / 앱에서 고른 책에 `cover_url === null` | 서버: `422` / `VALIDATION_ERROR`, `detail="image_kind"` / 앱: F14 제목·저자 표지 변환 | 앱: 제목·저자로 만든 표지 + `"표지를 찾지 못해 제목·저자로 만들었어요 · 사진·단색으로 바꾸기"` 표시 후 올릴 때 `color`(`fill3`)로 전송 | `cover` 직접 전송 시 행 0 |
| F-#5 | — | 없는 `library_id` / 찾을 수 없는 `isbn13` | `404` / `NOT_FOUND`, `detail="library_id"` 또는 `"isbn13"` | `"찾을 수 없어요."` | 행 0 |
| F-#6 | 예외 #1 | 책 조회 제공자 실패·상한 / 네트워크 끊김 | `503` / `PROVIDER_UNAVAILABLE` · `429` / `PROVIDER_LIMIT` · 네트워크(`status 0`) | `"지금은 올릴 수 없어요. 쓴 내용은 그대로 있어요."` + `"다시 올리기"`(쓴 내용 보존) | 행 0 |
| F-#7 | 예외 #1 | 저장소에 못 씀 | `503` / `PROVIDER_UNAVAILABLE` | 서버: `"사진을 올리지 못했어요. 다시 시도해 주세요."` / 앱 글쓰기: 예외 #1 배너 + `"다시 올리기"` | 행 0 |
| F-#8 | 예외 #3 | `"올리기"` 연타 / 같은 `client_request_id` 재전송 | `200`, 첫 게시물 (앱은 진행 중 `"올리는 중…"`으로 중복 클릭 차단) | 성공과 동일하게 `"올렸어요"` | 행 1개 그대로 |
| F-#9 | 예외 #4 | 남의 게시물 철회 | `403` / `FORBIDDEN` (앱은 `is_mine: false`일 때 `"게시물 내리기"` 메뉴 숨김) | `"할 수 없는 요청이에요."` | 상대 행 그대로 |
| F-#10 | 예외 #6 | 없는 게시물 철회 / 내린 게시물을 직접 주소로 열 때 | 철회: `404` / `NOT_FOUND` · 상세 조회(#27): `404` / `POST_NOT_AVAILABLE` | 상세: `"더 이상 공개되지 않는 게시물이에요."` + `"피드 보기"` | — |
| F-#11 | — | 탈퇴 진행 중 쓰기 | `403` / `ACCOUNT_WITHDRAWN`(core S-#2) | | 행 0 |
| F-#12 | 예외 #7 | 쓰던 내용(이미지·글자·감상·책 중 하나 이상)이 있을 때 `"✕"` 누름 | N/A: 기기 내 처리 | `"쓰던 글을 버릴까요? 닫으면 쓴 내용이 남지 않아요."` (`"계속 쓰기"` / `"버리기"`) | `"계속 쓰기"` 시 입력값 그대로 |

- 순서: 인증 → 형식(422) → `lock_active_user` 전 트랜잭션 밖 책 조회(404·429·503) → 트랜잭션: `lock_active_user` → 도서관 존재(404) → 같은 `client_request_id` 있으면 그 행(200) → INSERT(201).

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | `main` 연결 상태 및 시험용 대역 |
| :--- | :--- | :--- |
| D SRV-0-P1·P2 | `lock_active_user`, `nickname_of` | `server/app/auth.py:137-146`, `:168-172`에 **머지 완료** — 그대로 import해 사용 |
| D LIB-0-P1·P2 | `libraries`·`books` 테이블(`0002_public_reference.py`), `ProviderEngine.get_book` | `main`에 **머지 완료** — 시험에서는 `libraries`에 101 한 행 INSERT, 엔진은 `app.state.provider_engine`을 정해진 `BookRecord` 반환 대역으로 주입 가능 |
| D LIB-0-P2 · APP-0-P1 | 글쓰기 안 책 고르기(`publicApi.searchBooks`, `fetchLibrary`) | `mobile/src/lib/publicApi.ts`에 **머지 완료** — `ComposeScreen.tsx`에서 `searchBooks`로 책을 검색해 선택(C의 화면 파일을 수정하지 않음). 오프라인/단독 시험용 가짜 API 주입 허용 |
| D APP-0-P2 | `/posts/new?libraryId=` 경로 | `mobile/app/posts/new.tsx` 스텁을 `LOCAL-1-P2`에서 교체 |
| D 외부 설정(코드 밖) | Supabase Storage 버킷 `post-images`(공개 읽기), 서버 설정 `SUPABASE_SERVICE_ROLE_KEY`(비밀값) | 시험과 키 미설정 환경은 `MemoryPostImageStorage`. 실제 버킷은 운영/스테이징 설정에서 연결 |
| D AUTH-3 | 탈퇴 때 게시물 철회 | AUTH-3 계약서에서 `posts` 행 추가 |

### 구현 계획

#### P1. 확인한 기존 코드 전제 (코드 `main` `74d2885` 기준)

| 참조 대상 | 실제 경로와 줄 | 재사용 |
| :--- | :--- | :--- |
| 사용자·잠금·닉네임 | `server/app/auth.py:137-146`(`lock_active_user`), `:168-172`(`nickname_of`), `:175-184`(`get_current_user`), `:186-189`(`get_optional_user`) | 그대로 import해 사용 |
| 트랜잭션 | `server/app/db.py:16-28` | `run_db` |
| 오류·시각 | `server/app/common.py:11-37` | `ApiError`, `now_kst` |
| 라우터 등록 | `server/app/main.py:48-57`, `:99-109` 모양 | `# ── [local-feed-B] ──` 블록 |
| 선행 마이그레이션 | `server/migrations/versions/0001_users.py`, `0002_public_reference.py`, `0003_user_profiles.py` | `down_revision = "0003_user_profiles"`로 `0004_posts.py` 작성 |
| 앱 공통 | `mobile/src/theme/tokens.ts`, `mobile/src/lib/publicApi.ts`, `mobile/src/auth/AuthProvider.tsx:253` | `theme`, `onFill`, `searchBooks`, `fetchLibrary`, `useAuth`, `apiFetch` |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 항목 |
| :--- | :--- | :--- | :--- |
| `LOCAL-1-P1` 서버: 사진 올리기·게시·철회 | `feat/local-feed-LOCAL-1` | `server/migrations/versions/0004_posts.py`, `server/app/routers/posts.py`, `server/app/services/post_storage.py`, `server/app/settings.py`(`supabase_service_role_key`·`post_image_bucket`만), `server/app/main.py`(`[local-feed-B]` 블록), `server/pyproject.toml`, `server/uv.lock`, `server/tests/test_posts_create.py` | F1~F12, C5, F-#1~#11, P5 `LOCAL-1-P1` 시험 |
| `LOCAL-1-P2` 앱: 글쓰기·올리기·철회 | `feat/local-feed-LOCAL-1` | `mobile/app/posts/new.tsx`, `mobile/src/features/local-feed/ComposeScreen.tsx`, `mobile/src/features/local-feed/imagePicker.ts`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/__tests__/compose.test.tsx`, `mobile/app.json`(선택: `expo-image-picker` 권한 문구 plugin), `mobile/package.json`, `mobile/package-lock.json`, `specs/local-feed/세부/LOCAL-1.md`(8절 구현 진행 상태) | F13~F17, 명세 결정 1~4·예외 #1~#7, P5 `LOCAL-1-P2` 시험 |

##### 파트 머리말 — LOCAL-1-P1 / LOCAL-1-P2 (Step 하나 = 브랜치 `feat/local-feed-LOCAL-1` 하나 = PR 하나)

| 칸 | LOCAL-1-P1 | LOCAL-1-P2 |
| --- | --- | --- |
| 1. 태스크 ID | `LOCAL-1-P1` | `LOCAL-1-P2` |
| 2. 담당 역할 | B | B |
| 3. 기준선 버전 | B2 + M1 LOCAL-1 D+B 확정판 | B2 + M1 LOCAL-1 D+B 확정판 |
| 4. 계약서 커밋 | `f2fb65a33b5339bd23a91871b08b595eaeb7bc92` (LOCAL-1·LOCAL-2 발행 본문 커밋) | `f2fb65a33b5339bd23a91871b08b595eaeb7bc92` (LOCAL-1·LOCAL-2 발행 본문 커밋) |
| 5. 선행 태스크 | `specs/local-feed/세부/LOCAL-1.md` 머지 완료(`3cbc740`) + `SRV-0`·`LIB-0` 머지 완료 | 같은 브랜치·PR 안 `LOCAL-1-P1` 구현·검증·커밋·CI 확인 완료 |
| 6. 수정 허용 파일 | 위 표 8개 | 위 표 8개(`mobile/app.json`은 권한 문구 설정 시에만 수정 허용) + 명세 8절 |
| 7. 금지된 결정 | 새 오류 코드·인기순 컬럼·초안 서버 저장 금지. 사진 원본(EXIF 포함) 저장 금지 | 사진 위치 정보를 앱에서 읽거나 보내기 금지(`exif: false`). 분기는 `imagePicker.ts`에만 |
| 8. 완료 조건 | F1~F12, C5 전 컬럼·제약·RLS, F-#1~#11, P5 `LOCAL-1-P1` 시험 | F13~F17, 명세 결정 1~4·예외 #1~#7 + P5 `LOCAL-1-P2` 시험 + 웹·Android |
| 9. 검증 명령 | 루트 `docker compose up -d --wait db` → `server`에서 `APP_ENV=test python -m uv run alembic upgrade head` → `APP_ENV=test python -m uv run pytest -W error` | `mobile`에서 `npm ci` → `npx tsc --noEmit` → `npx jest --runInBand src/features/local-feed` → `npx expo export --platform web` |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 | 같음 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 서버 | `pillow`(uv가 고르는 최신 안정판) | 사진 다시 저장·EXIF 제거 | — |
| 서버 | `python-multipart`(FastAPI `UploadFile`에 필요, 잠금 파일에 없으면) | 업로드 받기 | — |
| 앱 | `expo-image-picker` (`npx expo install`) | 사진 고르기·찍기 | `mobile/app.json` config plugin 권한 문구: `"게시물에 넣을 사진을 고를 때만 써요."` (또는 런타임 권한 호출) |
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
| LOCAL-1-P2 | `compose disables submit until image chosen` (예외 #2, F14) | 글쓰기 진입 | 이미지 미선택 렌더 | `"올리기"` 비활성, `"이미지를 하나 골라야 올릴 수 있어요"` 표시, `createPost` 0번 | 이미지 없이 올리기 허용 |
| LOCAL-1-P2 | `choosing book cover immediately opens book search and attaches book` (결정 2, F14) | 표지 있는 책 검색 결과 | `"책 표지"` 선택 → 책 고름 | 글자 단계로 진입하고 마지막 단계에 해당 책이 이미 붙어 있음, 올리면 `image_kind="cover"`, `isbn13` 전달 | 마지막에 책 다시 찾음 |
| LOCAL-1-P2 | `book without cover shows generated title-author cover and submits as color fill3` (결정 2, 예외 #5, F14) | `cover_url: null`인 책 선택 | 책 고름 → `"올리기"` | `"표지를 찾지 못해 제목·저자로 만들었어요 · 사진·단색으로 바꾸기"` 표시, `createPost`에 `image_kind="color"`, `image_color="fill3"`, `isbn13`과 제목·저자 `overlay_text` 전달 | 표지 없는 책 422 실패 |
| LOCAL-1-P2 | `photo and cover allow top mid bottom overlay position while color stays mid` (결정 3, 큰 틀 결정 2, F15) | 사진/표지 선택 vs 단색 선택 | 글자 입력 → 위/아래 선택 | 사진·표지는 기본 `mid`에서 `top`/`bot` 전환 가능, 단색(`color`)은 늘 `mid`이고 위치 버튼 없음 | 위치 초기값·단색 분기 누락 |
| LOCAL-1-P2 | `body input is collapsed by default and expands on tap` (큰 틀 결정 6, F14) | 이미지 선택 후 | `"+ 감상 쓰기"` 누름 | 누르기 전 본문 입력칸 숨김, 누르면 펼쳐짐, 입력 없이도 `"올리기"` 가능(`body: null`) | 이미지만 올릴 때 감상 강제 |
| LOCAL-1-P2 | `double tap on submit sends once with same client_request_id` (예외 #3, F9·F17) | 이미지 선택, 응답 지연 | `"올리기"` 두 번 빠르게 | `"올리는 중…"` 표시, `createPost` 1번 호출(재시도 시에도 같은 `client_request_id`), 완료 후 `"올렸어요"` | 연타 중복 생성(`running` 가드 제거 시 실패해야 함) |
| LOCAL-1-P2 | `upload or create failure keeps inputs and retries` (예외 #1, F-#2·#6·#7, F17) | 이미지·글자·감상·책 입력 후 503 / 413 | `"올리기"` → `"다시 올리기"` | 503은 `"지금은 올릴 수 없어요. 쓴 내용은 그대로 있어요."` + 입력값 보존 + `"다시 올리기"`로 재전송 성공, 413은 `"사진이 너무 커요."` | 실패 시 쓴 내용 증발 |
| LOCAL-1-P2 | `closing with unsaved input asks confirmation` (예외 #7, F-#12, F17) | 이미지 또는 글자 입력됨 | `"✕"` → `"계속 쓰기"` / `"버리기"` | 확인 창 표시, `"계속 쓰기"`는 화면·입력 유지, `"버리기"`는 닫힘 | 확인 없이 바로 닫힘 |
| LOCAL-1-P2 | `signed out entry shows login prompt without submitting` (예외 #4, F-#1, F13) | 비로그인 | 글쓰기 진입 | `"로그인하면 글을 올릴 수 있어요"` + `"로그인하기"` / `"닫기"`, `createPost` 0번 | 비로그인 글쓰기 노출 |
| LOCAL-1-P2 | `author more menu withdraws after confirm while other user menu hides withdraw` (결정 4, 예외 #4, F16) | 내 게시물(`is_mine: true`) / 남의 게시물(`is_mine: false`) | `⋯` → `"게시물 내리기"` → `"내리기"` | 내 글만 `"게시물 내리기"` 보임, 확인 창 거쳐 `withdrawPost` 1번 호출 후 카드 사라지고 `"내렸어요"` 표시, 남의 글은 `"게시물 내리기"` 없음 | 남의 글에 내리기 노출·확인창 누락 |

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
| G4 | 도서관 기본값: 기기에 하나(`setDefaultLibrary`). ⋯ 메뉴 항목 `"앱을 켜면 여기부터 열기"` ↔ `"바로 열기 끄기"`, 그리고 `"도서관 홈페이지"`(`#11 homepage`, `openExternalUrl`). 누르면 한 줄 안내 2초. **(2026-11-19 L6 더함)** 그 아래 1px `seamHairline` 구분선, 작은 제목 `"홈을 열면 처음 크게 보일 도서관"`, 항목 `"가장 가까운 곳"`(안 골랐으면 오른쪽 `기본`) / `"최근 방문한 곳"`, 고른 쪽 오른쪽 `✓`(`accessibilityState.selected`). 홈 꾹 누르기 메뉴와 같은 글자(`library-visit/heroText.ts` `HERO_MENU_TEXT`)·같은 기기 키(`localone:home_hero_rule:v1`, `library-visit/heroPref.ts` `getHeroRule`·`setHeroRule`). 고르면 메뉴를 닫고 저장한 뒤 한 줄 안내 `"홈을 열면 가장 가까운 곳을 크게 보여 줘요"` / `"홈을 열면 최근 방문한 곳을 크게 보여 줘요"`, 이미 고른 것을 누르면 닫기만 | 확인 / 항목·문구 기본값(Claude) · 처음 주인공 줄 확인(D L6 "방문 ⋯에 같이 추가") / 구분선·안내 문구 기본값(Claude) | 1.2, library-visit V3 |
| G5 | 세 번째 방문 질문 카드: 제목 `"세 번째 방문이에요"`, 본문 `"앱을 켜면 ○○도서관부터 열까요?"`, 버튼 `"네, 여기부터"`·`"아니요"`. 어느 쪽이든 `markDefaultAsked(libraryId)` | 확인(C-58) / 문구 기본값(Claude) | 1.2 |
| G6 | **앱 시작 분기 `DefaultLibraryGate`**: 홈 탭(A)이 맨 위에 놓는 B의 부품. 기본 도서관이 있으면 → `locate()` → 위치를 못 쓰면 그대로 방문 페이지로(풀지 않음) → 위치가 있으면 `#10` 주변 조회(반경은 core·A와 같은 규칙) → 기본 도서관이 반경 안이면 방문 페이지로 `router.push`, **반경 안에 기본 도서관이 없고 다른 도서관이 하나 이상 있으면** 기본값을 끄고(`setDefaultLibrary(null)`) 홈에 한 줄 `"○○도서관 바로 열기를 풀었어요"`(2.5초). 앱 실행마다 한 번만 판단 | 확인(1.2 플로우) / 판정 기본값(Claude) | 1.2 표 첫 두 행 |
| G7 | 돌아가기: 왼쪽 위 굵은 `"‹"`와 화면 왼쪽 끝에서 밀기로 지도 홈(`router.back()`, 기록이 없으면 `router.replace("/")`) | 확인 | 결정 8 보완 |
| G8 | 방문 페이지에는 **검색창이 없다** | 확인 | 결정 10 |
| G9 | M1은 피드만. 책장·방명록·스탬프·룩은 만들지 않되 아래에 붙을 수 있게 레이아웃을 열어 둔다. 빈 가짜 화면 금지. 피드가 없을 때(LOCAL-2 전 포함)는 빈 피드 안내 | 확정 | `기능_배정.md` B절 |
| G10 | 방문 페이지는 로그인 없이 보인다. 방문 기록·기본값은 기기에만이고 서버에 보내지 않는다 | 확정 | 05 §6 |
| G11 | **머리 배치**: 왼쪽 정렬 두 줄. 맨 위 왼쪽 굵은 `"‹"`(G7). 그 아래 `#11 name`(2026-11-18 개정, 이전: 굵게 앱 26 → `type.pageTitle` 24/400 `inkSoft`, 한 줄). 그 아래 작은 글자 한 줄(2026-11-18 개정, 이전: 앱 16 `textSub` 한 줄 → 계기판 목소리 `type.gauge`, 한글 문장과 섞지 않음) `"<거리> · <오늘 운영시간>"` — 거리는 G1대로 넘겨받은 값이 있을 때만 쓰고 없으면 거리와 `" · "`를 뺀다. 운영시간은 `today.hours_text`, 없으면 `"정보 없음"`(G1). `today.is_closed === true`면 운영시간 자리에 굵은 `"오늘 휴관"`, `null`이면 평소 줄. 같은 줄 오른쪽 끝에 `⋯`(G4 메뉴). 머리 전체 높이 앱 약 115 / 시안 약 86. 크기 단위: 시안 px는 390×844 화면을 0.75배로 그린 값이고 앱 값은 시안 ÷ 0.75(React Native 크기 단위, iOS pt·Android dp 공통) | 확인 — 사용자: "깔끔하고 피드가 많이 보여서요." / 크기·휴관 표시 기본값(Claude) | 명세 결정 1, 예외 #5·#6 |
| G12 | **피드를 올렸을 때 머리**: 피드를 내려 스크롤 위치가 (두 줄 머리 높이 − 한 줄 높이)를 넘으면 거리·운영시간 줄을 접고 `‹ <이름> ⋯` 한 줄(앱 높이 약 52 / 시안 40, 이름 `type.name` 계열 500, **2026-11-18 개정, 이전: 배경 `cream` + 아래 그림자 → 유리판 `panelFrosted` + 아래 1px `seamHairline`, 그림자 없음**)을 맨 위에 붙인다. 맨 위로 돌아오면 두 줄로 펼친다. 한 줄 상태에서도 `‹`(G7)·`⋯`(G4)는 그대로 동작한다. 그림자 색은 D APP-0-P1 보완이 제공하는 `theme.colors.shadowSoft`(임시 `rgba(0,0,0,.15)`)를 쓴다. 사용처는 `‹` 글자 그림자(2026-11-18 개정: 접힌 머리 아래 그림자는 없앰). B는 공통 토큰 파일을 수정하지 않는다 | 확인 — 사용자: "어느 도서관인지 계속 보여서요" (아래 '정할 것'의 기본값과 같음) / 값 기본값(Claude) | 명세 결정 2 |
| G13 | **게시물이 하나도 없을 때**: `#26` 결과 0개(LOCAL-2 머지 전 포함, G9)면 피드 자리 가운데에 세 줄 — `"아직 게시물이 없어요"`(2026-11-18 개정, 이전: 굵게 → `type.title` 22/400 `inkSoft`) / `"이 도서관의 첫 글을 올려 보세요"`(`theme.colors.textSub`) / 글자 링크 `"첫 글 올리기 →"`(500, 레시피 "카드 안 행동"). 링크는 오른쪽 아래 둥근 `"+"`(LOCAL-1 명세 결정 1)와 같은 곳 `/posts/new?libraryId=<libraryId>`(core K15 및 이 계약서 LOCAL-1 C7 경로)로 이동만 한다. 로그인 안 했으면 이동하지 않고 LOCAL-1의 로그인 안내 창(`"로그인하면 글을 올릴 수 있어요"` + `"로그인하기"` / `"닫기"`, LOCAL-1 명세 예외 #4)을 띄운다. 가짜 게시물을 만들지 않는다 | 확인 — 사용자: "첫 글을 올려 보라고 해서요." | 명세 결정 3, 예외 #2·#4 |
| G14 | **전환 세부**: 들어올 때 오른쪽에서 왼쪽으로 밀린다 — `Stack` 기본 push 전환(약 0.3초, 플랫폼 기본 시간을 그대로 쓰고 플랫폼별로 맞추지 않음, C4 분기 없음). 배경은 **(2026-11-18 개정, 이전: `theme.colors.cream`) 유리판 `panelFrosted`** — 단 M2 도서관 룩(4종 팔레트 슬롯)은 이 개정으로 바꾸지 않는다. 방문 멘트 카드(G3) 크기·자리: 화면 아래 가운데, 아래 끝에서 앱 약 112 / 시안 84px 위, **(2026-11-18 개정, 이전: `paper` + `radii.card` + `shadowFloat`) `cardSurface(theme, { onPanel: true })`(`panelLit` + 1px `seamHairline` + 아래 2px `reliefBottomMid`, 곡률 9, 그림자 없음)**, 한 줄 작은 글자(앱 16 / 시안 12px, 500). 세 번째 방문 질문 카드(`AskDefaultCard`)·`⋯` 메뉴(`VisitMenu`)·로그인 안내 시트도 같은 무광 면(시트는 위쪽만 곡률 9) | 기본값(Claude) | 명세 0절, 예외 #7 |

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
| `VISIT-2-P2` 도서관 기본값·앱 시작 분기 | `feat/local-feed-VISIT-2` | `mobile/src/features/local-feed/VisitScreen.tsx`, `mobile/src/features/local-feed/VisitMenu.tsx`, `mobile/src/features/local-feed/AskDefaultCard.tsx`, `mobile/src/features/local-feed/DefaultLibraryGate.tsx`, `mobile/src/features/local-feed/__tests__/default-library.test.tsx`, (2026-11-19 L6 D) `mobile/src/features/local-feed/__tests__/visit-menu-hero.test.tsx` | G4~G6, G-#4·#5 |

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

## LOCAL-2 방문 페이지 피드·상세·도서 연결·이어 읽기·공감·북마크

- **담당 역할**: B (서버 파트 포함) · **대상 브랜치**: `main`
- **기준 명세서**: 큰 틀 `specs/local-feed/명세서.md`, D 결정 시안 `개발산출물/시안/LOCAL-2_D결정_시안.html` (`#el-card-menu` 후보 A · `#el-detail-cta` 후보 A 채택, 2026-11-17 사용자 D 직접 확정)
- **판**: **D+B 확정판(2026-11-17)** — 사용자(D) 제품 결정(`"광장"` 명칭 폐기 → 방문 페이지 핀터레스트형 피드, 핀터레스트 와이어프레임 기준 상세 레이아웃과 대여 우선·구매 배치 `#el-detail-cta` 후보 A, 피드 카드 길게 누르기 컴팩트 메뉴 `#el-card-menu` 후보 A, `'도서 없음(예스24 구매 ↗)'` 버튼 UI만 표시 및 예스24 API 구현·연결 M2 이관)을 전수 반영해 확정했다.
- **기준선**: `B2` + M1 `LOCAL-2` D+B 확정판
- **선행 설계**: 05 §3.2 `post_reactions`·`post_bookmarks`·§7, 06 §2.4 26~30행, `개발산출물/명세/SNS_검색_프로필_상세결정.md` C-46 D1·D2·D6
- **작성자**: D (시니어)
- **상태**: **계약 확정 — `LOCAL-1` · `VISIT-2`에 이어 별도 기획 대기 없이 구현 가능.**
- **발행 본문 SHA**: `f2fb65a33b5339bd23a91871b08b595eaeb7bc92`


### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| H1 | 방문 페이지 피드는 **최신순만**: `published_at DESC, id DESC`. `sort`는 `latest`만 받고 그 밖은 422(인기순은 Q-31이 풀릴 때 연다). `"광장"`이라는 명칭은 쓰지 않는다 | 확정 / 미확인(임시) Q-31 | 06 #26, 2026-11-17 사용자 결정 |
| H2 | 커서: `next_cursor`는 마지막 항목의 `(published_at, id)`를 base64url로 감싼 문자열(앱은 뜻을 읽지 않는다). `limit` 기본 20, 1~50 | 기본값(Claude) · `limit` 미확인(임시) Q-21 | 06 §1, H-ARCH-10 |
| H3 | 공개 상태(`published`)만 목록·상세에 나온다. 철회·숨김 게시물의 상세는 `404 POST_NOT_AVAILABLE`, 없는 id는 `404 NOT_FOUND` | 확정 | 06 #27, R10 |
| H4 | 피드 카드는 이미지만(제목·작성자·공감 수 줄 없음, 이미지 안 `overlay_text`만 표시). 카드에 필요한 필드만 목록에 준다(`FeedPost`), 작성자·공감 수·본문은 상세(`Post`) | 확정(C-48·C-54) | 02 LOCAL-03, 큰 틀 결정 1·3·4 |
| H5 | 공감은 게시물당 하나, `PUT`은 누르기·`DELETE`는 취소, 몇 번 해도 결과 같음. 응답에 최신 `reaction_count` | 확정(R14) | 06 #29 |
| H6 | 북마크도 같은 모양(`PUT`·`DELETE`), 다시 저장하면 `saved_at`을 새 시각으로. 다시 누르면 확인창 없이 즉시 해제한다. 모음 화면은 M1에 없다 | 확정(C-33) / 모음 미확인(임시) Q-56 | 06 #30, 05 §3.2 |
| H7 | 같은 책 이어 읽기 `#28`: 같은 `isbn13`의 공개 게시물(다른 도서관 포함), `exclude`(지금 보는 게시물 id) 빼고 최신순 | 확정 | 06 #28 |
| H8 | 공감 수는 `post_reactions`를 세어 준다(컬럼에 쌓지 않는다) | 기본값(Claude) | 05 §3.2 "LOCAL-2 계약서에서 정한다" |
| H9 | **상세의 대여(우선)·구매 버튼 배치(시안 `#el-detail-cta` 후보 A 확정, 2026-11-17 사용자 결정)**: 이미지 위에는 좌하단/우하단 오버레이 버튼(`[사이트 방문]`, `[이미지 검색]`, 확대 아이콘)을 두지 않고 이미지와 `overlay_text`만 깔끔하게 보여 준다. `post.book !== null`일 때 오른쪽/아래 정보 영역의 `[사이트 방문]` 자리에 ① **1순위 큰 가로 버튼**: 책 제목·저자와 함께 `#14 ?library_id=<방문 중인 도서관>`(없으면 `post.library.id`) 소장·대출 상태를 `"<도서관명> · 어제 기준 대출 가능"`(또는 `"어제 기준 · 대출 중"` / `"소장 없음"` / `"알 수 없음"`)으로 보여 주고, 누르면 `live_check`가 있을 때 `"실시간 확인 ↗"`(`openExternalUrl`) 또는 도서 상세(`/books/[isbn13]`)로 연결한다. ② **2순위 보조 버튼**: 그 바로 아래에 `"구매 ↗"`(2026-11-18 개정, 이전: `"예스24에서 구매 ↗"`. D: "멘트 압축 예스24에서 구매 -> 구매") 버튼 UI를 두되, **예스24 관련 API 구현·외부 연결은 M2로 넘긴다**(M1에서는 버튼만 그렇게 나오게 하고 누르면 `"준비 중이에요"` 안내만 표시, `#15` 호출·외부 이동 없음, `TODO(연결): M2 예스24 구매 연결`). **모양(2026-11-18 개정, 이전: 1순위 `paper` + 곡률 18 큰 버튼, 2순위 투명 + `divider` 테두리)**: 책·대여·구매를 도서 카드 하나(`cardSurface(theme, { onPanel: true })`, 곡률 9)에 담는다 — 책 제목·저자 / 상태 줄(도서관명은 `type.name`, `"어제 기준"`·상태는 `type.gauge`로 나눔, 문구는 그대로) / 오른쪽에 `"실시간 확인 ↗"` 글자 링크와 `"구매 ↗"` 보조 버튼(`actionColors().secondary`). 대여가 구매보다 먼저 보이는 순서는 그대로. 카드 자리는 H14대로 본문 아래 | 확인(사용자 D, 2026-11-17) · 문구·모양 개정 확인(D 2026-11-18) | 02 LOCAL-04, `LOCAL-2_D결정_시안.html` `#el-detail-cta` 후보 A, 코드 레포 `글쓰기_설정_방문_파사드_시안.html` 2 |
| H10 | **피드 카드 길게 누르기(웹 호버 `⋯`) 작은 창 구성(시안 `#el-card-menu` 후보 A 확정, C-46 D1 해소, 2026-11-17 사용자 결정)**: 별도 제목·저자 머리말 줄과 5줄 세로 나열 대신, **상단에 아이콘 3개 한 줄(`♡ 좋아요` · `🔖 북마크` · `↗ 공유`) + 하단에 책 액션 줄**을 두어 창 크기를 줄인다(최대 너비 앱 약 260 / 시안 244px). ① **책이 연결된 카드(`post.book !== null`)**: 하단 첫 줄에 `"📖 <책 제목> 검색"`(`→ /search?q=<title>`), 둘째 줄에 `"👤 <저자>의 다른 책"`(`→ /search?q=<author>`, `author === null`이면 둘째 줄 생략)을 둔다. ② **도서 없음 상태(`post.book === null` 등 C-46 D1)**: 하단 줄 버튼을 **`"🛒 도서 없음 (예스24 구매 ↗)"`**으로만 나오게 하고, **예스24 API 구현 및 연결은 M2로 넘긴다**(M1에서는 버튼 표시만 하고 누르면 `"준비 중이에요"` 안내, API 호출 0번). 작은 창 모양(2026-11-18 개정, 이전: `paper` + 곡률 18 + 그림자, 켬 아이콘 `fill1`): `cardSurface(theme, { onPanel: true })`(곡률 9, 그림자 없음), 켬 아이콘은 `inkStrong` 채움. 문구는 그대로(상세의 `"구매 ↗"` 압축은 H9만) | 확인(사용자 D, 2026-11-17) | C-46 D1·D2, `LOCAL-2_D결정_시안.html` `#el-card-menu` 후보 A |
| H11 | 공유 링크 모양: 웹 주소 `<웹 기준 주소>/posts/<post_id>`. 앱 딥링크 `localone://posts/<post_id>`. 시스템 공유창을 열고 쓸 수 없으면 클립보드에 복사한 뒤 `"링크를 복사했어요"`(2초)를 보인다 | 확정(D2) / 주소 기본값(Claude) | 06 §2.4, C-46 D2 |
| H12 | `PostCard`는 B의 부품이고 A의 홈 하단 창도 그대로 쓴다(props 아래 C2) | 확정(C-61) | `기능_배정.md` A절 |
| H13 | **방문 페이지 2열 메이슨리 피드·빈 피드**: `VisitScreen.tsx`의 피드 자리에 2열 메이슨리(`columnGap` 앱 12, 좌우 패딩 12, 카드 모서리 `theme.radii.card`)를 연결한다. 내리면 `next_cursor`로 다음 쪽을 이어 붙인다(중복 호출 방지). 결과가 0개면 `VISIT-2` G13 빈 피드 안내를 그대로 보인다 | 확정 | 02 LOCAL-03, `VISIT-2` G13 |
| H14 | **핀터레스트형 상세 화면 구조(와이어프레임 대조 확정)**: **(2026-11-18 개정, D 결정 "글 상세 행동 줄과 도서 대여 카드" A + C, 이전: 도서 박스 → 본문 순서, 폭은 창 폭 `useWindowDimensions().width`로 판정)** 앱 칼럼 폭(컨테이너 `onLayout` 실측 — 마우스 웹은 `WebFrame` 480 칼럼 안의 폭)이 `< 768px`이면 **세로 1열 스크롤**(위 이미지+좌상단 `"‹"` → 상단 액션 바 → 작성자·도서관 줄 → **본문 `body` → H9 도서 대여/구매 카드** → H15 하단 이어지는 피드 2열), `>= 768px`이면 와이어프레임처럼 **좌측 큰 이미지 + 우측 상세 정보 2단 배치**(오른쪽 안 순서도 본문 → 도서 카드) 아래에 이어지는 피드 2열이 온다. 1280 마우스 웹은 칼럼이 480이라 늘 1열이다. 바탕은 유리판 `panelFrosted`, 이미지 위 `"‹"`는 흰 원 없이 굵은 `‹` + 은은한 그림자(`shadowSoft`). **상단 액션 바**: 왼쪽 그룹에 `[♡ 공감 + reaction_count]`(`#29`) · `[↑ 공유]` · `[⋯ 더보기]`(내 게시물 `is_mine === true`일 때만 `"게시물 내리기"` → LOCAL-1 F16 확인 창 → `#25`, 남의 글은 `"공유"`만)를 두고, 오른쪽 끝에 **북마크 그림 아이콘 버튼**(2026-11-18 개정, 이전: 노랑 `fill1` 알약 `"저장"`·저장됨 `inkStrong` 채움 알약. `my_bookmark === false`면 윤곽선, `true`면 `inkStrong` 채움, 접근성 이름 `"저장"`/`"저장됨"`, 누르는 자리 44×44, 누르면 확인창 없이 `#30` 토글)을 둔다. `♡`의 켬도 `inkStrong`(이전 `fill1`). 댓글 아이콘·입력창은 M1에 두지 않는다(Q-57). 다른 도서관 글을 열어도 방문 중인 도서관의 테마(룩)를 유지한다 | 확인(사용자 D, 2026-11-17) | 02 LOCAL-04, 개정 명세 §2(C-28), 큰 틀 결정 8·11 |
| H15 | **상세 하단 이어지는 피드 2묶음(큰 틀 결정 7·8)**: 본문 아래 첫 묶음은 **`"같은 책의 다른 글"`**(`post.book !== null`일 때 `#28 ?exclude=<post.id>`, 다른 도서관 포함 2열 메이슨리, `post.book === null`이거나 결과 0개면 묶음 전체 숨김). 두 번째 묶음은 **`"이 도서관의 다른 글"`**(`#26` 최신순 2열, 지금 보는 게시물 제외). 카드를 누르면 해당 게시물 상세로 이동한다 | 확정 | 02 LOCAL-04·05, 큰 틀 결정 7·8 |

**세부 명세(LOCAL-2)에서 정할 것 — D+B 확정판 반영 완료**: 2열 메이슨리 간격·비율 = H13, 상세 펼쳐지는 모양·와이어프레임 배치 = H9·H14, 같은 책 이어 읽기 위치 = H15, 공감·북마크·더보기 버튼 모양 = H14, 빈 피드 화면 = H13(`VISIT-2` G13), 카드 길게 누르기 작은 창·D1 `'도서 없음(예스24 구매 ↗)'` 버튼 표시(API 연결 M2 이관) = H10, 공유·실패 안내 = H11·C3·C6.

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
- 부품(`mobile/src/features/local-feed/PostCard.tsx`): `export function PostCard(props: { post: FeedPost; onPress(postId: string): void; onMenu?(post: FeedPost): void; width: number }): JSX.Element` — A의 홈 하단 창은 `onMenu` 없이 쓴다. [D 2026-11-18] A의 내 정보 화면(`my-collection.md` MY-1)은 `onMenu`와 함께 쓴다.
- 부품(`mobile/src/features/local-feed/PostMenu.tsx`, H10 카드 작은 창): `PostMenuProps { post: FeedPost; signedIn: boolean; authLoading?: boolean; onClose(): void; onChange(postId: string, patch: PostReactionPatch): void; onNotice(text: string): void; onLoginNeeded(): void; failText?(kind: "reaction" | "bookmark", e: unknown): string }` — [D 2026-11-18 추가] 선택 prop `failText`: 공감·북마크 요청 실패 때 `onNotice`로 보낼 문구를 바꾼다. 주지 않으면 지금처럼 `toggleFailText(e)`(서버 문구 또는 `MENU_TEXT.failed`)라 B 화면 동작은 바뀌지 않는다. **이 prop 추가는 A의 `MY-1-P2`가 한다**(`my-collection.md` MY-1 Y-O4·P2 — 이 prop 추가만 허용, 기존 props·문구·동작 변경 금지, `src/features/local-feed` 시험 통과 유지). B가 그 전에 `PostMenu.tsx`를 고치면 A와 충돌하지 않게 이 시그니처를 따른다.
- 예스24 구매 버튼(`#15`): H9·H10에 따라 M1에서는 버튼 UI만 노출하고 API 호출·연결은 M2로 넘긴다(`TODO(연결): M2 예스24 API`).

#### C3. 요청·응답 필드와 화면 문구

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
| `FeedPost` | `book` | `{ isbn13: str; title: str; author: str \| null } \| null` | Y | 카드 메뉴의 책·저자 검색 줄 표시용 |
| `FeedPost` | `published_at` | `str (ISO, +09:00)` | Y | |
| `FeedPost` | `my_reaction` | `bool` | Y | 비로그인 `false` |
| `FeedPost` | `my_bookmark` | `bool` | Y | 비로그인 `false` |
| 응답(#27) | `Post` | LOCAL-1 C3 | Y | |
| 응답(#29) `ReactionState` | `post_id`, `reacted`, `reaction_count` | `str`, `bool`, `int` | Y | |
| 응답(#30) `BookmarkState` | `post_id`, `bookmarked` | `str`, `bool` | Y | |
| 화면 문구 | 카드 길게 누르기 상단 아이콘 3개 | — | — | `"좋아요"`(공감 시 `"좋아요됨"`) · `"북마크"`(저장 시 `"저장됨"`) · `"공유"` (H10) |
| 화면 문구 | 카드 길게 누르기 하단 책 줄 | — | — | 책 있음: `"📖 <책 제목> 검색"` / `"👤 <저자>의 다른 책"` · 도서 없음(D1): `"🛒 도서 없음 (예스24 구매 ↗)"`(M1은 버튼만 표시, 누르면 `"준비 중이에요"`, H10) |
| 화면 문구 | 상세 상단 바 | — | — | 좌측: `♡ <reaction_count>` · 공유 `↑` · 더보기 `⋯`(내 글이면 `"게시물 내리기"`, 남의 글이면 `"공유"`만) / 우측 끝: 북마크 아이콘, 접근성 이름 `"저장"`(`my_bookmark: true`면 `"저장됨"`, 화면에 글자 없음, H14 2026-11-18 개정) |
| 화면 문구 | 상세 대여(1순위)·구매(2순위) | — | — | 1순위: `"<도서관명> · 어제 기준 대출 가능"`(또는 `"어제 기준 · 대출 중"` / `"소장 없음"` / `"알 수 없음"`) + `"실시간 확인 ↗"` / 2순위: `"구매 ↗"`(2026-11-18 개정, 이전 `"예스24에서 구매 ↗"`. M1은 버튼만 표시, 누르면 `"준비 중이에요"`, H9). 도서 카드는 본문 아래(H14). 방문 도서관이 게시물 도서관과 다르면 확인 중·실패 줄은 도서관명 없이 `"확인 중…"`·`"알 수 없음"`(2026-11-17 사후 검토 ①-3) |
| 화면 문구 | 상세 하단 이어 읽기 제목 | — | — | `"같은 책의 다른 글"` / `"이 도서관의 다른 글"` (H15) |
| 화면 문구 | 공유 복사·실패 | — | — | 복사 성공: `"링크를 복사했어요"` / 실패: `"공유하지 못했어요. 다시 시도해 주세요."` |
| 화면 문구 | 철회된 게시물 상세(#27 404 `POST_NOT_AVAILABLE`) | — | — | `"더 이상 공개되지 않는 게시물이에요."` + `"피드 보기"`(구 문구 `"광장 보기"` 호환 허용) |
| 화면 문구 | 비로그인 공감·북마크 | — | — | `"로그인하면 공감·북마크를 남길 수 있어요"`(또는 LOCAL-1 로그인 안내 창) + `"로그인하기"` / `"닫기"`. 로그인 복원 중(`useAuth().status === "loading"`)에는 누름을 무시하고 안내를 띄우지 않는다(2026-11-17 사후 검토 ①-5) |
| 화면 문구 | 피드 다음 묶음 실패(H13) | — | — | `"다음 이야기를 불러오지 못했어요. 다시 내려 보세요."`(2초 안내, 다음 스크롤 끝에서 다시 시도, 2026-11-17 사후 검토 ①-4) |

#### C4. 플랫폼 분기 표

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 카드 메뉴 열기 | `onLongPress` | 길게 누르기 | 같음 | 마우스를 올리면 점 세 개 버튼(`onHoverIn`) — RN `Pressable`의 공통 API | `PostCard.tsx`(분기 코드 없이 두 이벤트를 모두 받음) | 세 플랫폼 메뉴 열림 |
| 공유 | `Share.share({ url })` | 시스템 공유창 | 같음 | `navigator.share` 없으면 `navigator.clipboard.writeText` + `"링크를 복사했어요"` | `mobile/src/features/local-feed/share.ts` — B의 두 번째 분기 파일 | 웹에서 링크 복사 |

#### C5. 테이블

> **마이그레이션 번호 정정(2026-11-17, 코드 레포 PR #141 사후 검토 ②-5·C-65):** 통합(PR #141, `1ee1bab`)에서 빌릴 예정(`0005_loan_plans.py`)이 먼저 `0005`를 잡아 이 파일은 **`0006_post_reactions_bookmarks.py`**(`down_revision = "0005"`)가 됐다. 아래 이름과 P2 표를 `0006`으로 고쳤다. 통합 전 `feat/local-feed-LOCAL-2`에서 `alembic upgrade head`를 돌린 **개발 DB**는 옛 `0005`(반응)가 적용돼 있어 main에서 `upgrade head`가 실패한다 — 그 DB는 지우고 새로 만든 뒤 `upgrade head`한다(사용자 확인: 개발 DB뿐·버려도 됨, 방법은 코드 레포 `05_ERD_및_DB설계서.md` §8). 남겨야 할 데이터가 있으면 지우기 전에 D에게 알린다. 코드·마이그레이션은 고치지 않는다.

**`post_reactions`** — 역할: 공감 · 소유자 컬럼: `user_id` · 담당 마이그레이션: LOCAL-2-P2에서 만듦(`0006_post_reactions_bookmarks.py`)

| 컬럼 | 타입 | NULL | 기본값 | 키·제약 | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `post_id` | `uuid` | 아니오 | 없음 | PK①, FK → `posts.id` `ON DELETE CASCADE` | |
| `user_id` | `uuid` | 아니오 | 없음 | PK②, FK → `users.id` | 누른 사람 |
| `created_at` | `timestamptz` | 아니오 | `now()` | — | |

**`post_bookmarks`** — 역할: 북마크 · 소유자 컬럼: `user_id` · 담당 마이그레이션: 같은 파일(`0006_post_reactions_bookmarks.py`)

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
| H-#3 | 없는 게시물(#27·#29·#30) | `404` / `NOT_FOUND` | 상세: `"찾을 수 없어요."` | 행 무변경 |
| H-#4 | 철회·숨김 게시물(#27·#29·#30) | `404` / `POST_NOT_AVAILABLE` | `"더 이상 공개되지 않는 게시물이에요."` + `"피드 보기"` | 공감·북마크 행 생기지 않음 |
| H-#5 | 공감·북마크 연타 | `200` 같은 결과 (앱은 진행 중 중복 전송 방지) | | 행 0 또는 1 |
| H-#6 | 로그인 없이 #29·#30 | `401` / `AUTH_REQUIRED` | 앱: 비로그인 안내 창(`"로그인하기"` / `"닫기"`), 서버 요청 0번 | 행 0 |
| H-#7 | 탈퇴 경합 중 #29·#30 | `403` / `ACCOUNT_WITHDRAWN` | | 행 0 |
| H-#8 | 선택 인증에 깨진 토큰 | `401`(core S2) | 앱은 갱신 뒤 재시도 | — |
| H-#9 | 상세에서 #14 소장·대출 조회 실패·시간 초과 | `200` 안의 `unknown` 또는 네트워크 오류 | `"알 수 없음"` 표시(대출 불가/미소장으로 단정 금지), 상세 본문·반응·이어 읽기는 그대로 유지 | — |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | `main` 연결 상태 및 M2 경계 |
| :--- | :--- | :--- |
| D SRV-0-P1 | `get_optional_user`, `lock_active_user` | `server/app/auth.py`에 **머지 완료** |
| D LIB-0-P3 | `#14`(`fetchAvailabilityAt`) | `server/app/routers/books.py` 및 `mobile/src/lib/publicApi.ts`에 **머지 완료**. **예스24 구매(`#15`)는 사용자 결정(2026-11-17)에 따라 M1에서 버튼만 표시하고 API 구현·연결은 M2로 넘긴다(`TODO(연결): M2 예스24 구매 연결`)** |
| A VISIT-1b | #26·`PostCard` 사용 | A는 이 계약의 `FeedPost`·`PostCard` 모양에 연결(library-visit VISIT-1b C7) |
| C LIB-1 | `/search?q=` 쿼리 받기 | `mobile/app/search.tsx`에 **머지 완료** (`book-search.md` LIB-1 B1) |

### 구현 계획

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 항목 |
| :--- | :--- | :--- | :--- |
| `LOCAL-2-P1` 서버: 피드·상세·이어 읽기 읽기 | `feat/local-feed-LOCAL-2` | `server/app/routers/feed.py`, `server/app/routers/posts.py`(`post_public`만), `server/app/main.py`(`[local-feed-B]` 블록), `server/tests/test_feed.py` | H1~H4·H7·H8, H-#1~#4·#8, P5 `LOCAL-2-P1` 시험 |
| `LOCAL-2-P2` 서버: 공감·북마크 | `feat/local-feed-LOCAL-2` | `server/migrations/versions/0006_post_reactions_bookmarks.py`(통합 전 `0005`), `server/app/routers/reactions.py`, `server/app/main.py`(`[local-feed-B]` 블록), `server/tests/test_reactions.py` | H5·H6, C5, H-#3~#7, P5 `LOCAL-2-P2` 시험 |
| `LOCAL-2-P3` 앱: 방문 페이지 피드·카드·컴팩트 메뉴 | `feat/local-feed-LOCAL-2` | `mobile/src/features/local-feed/PostCard.tsx`, `mobile/src/features/local-feed/LibraryFeed.tsx`, `mobile/src/features/local-feed/PostMenu.tsx`, `mobile/src/features/local-feed/share.ts`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/VisitScreen.tsx`(피드 자리 연결), `mobile/src/features/local-feed/__tests__/feed.test.tsx` | H1·H4·H10~H13, P5 `LOCAL-2-P3` 시험 |
| `LOCAL-2-P4` 앱: 상세·이어 읽기·공감·북마크·대여/구매 버튼 | `feat/local-feed-LOCAL-2` | `mobile/app/posts/[postId].tsx`, `mobile/src/features/local-feed/PostDetail.tsx`, `mobile/src/features/local-feed/SameBookPosts.tsx`, `mobile/src/features/local-feed/ReactionButton.tsx`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/__tests__/detail.test.tsx` | H3·H5~H7·H9·H14·H15, P5 `LOCAL-2-P4` 시험 |

##### 파트 머리말 (LOCAL-2-P1~P4 공통 칸 — Step 하나 = 브랜치 `feat/local-feed-LOCAL-2` 하나 = PR 하나)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | 위 표의 각 ID (`LOCAL-2-P1` ~ `LOCAL-2-P4`) |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | B2 + M1 LOCAL-2 D+B 확정판 |
| 4. 계약서 커밋 | `f2fb65a33b5339bd23a91871b08b595eaeb7bc92` (LOCAL-1·LOCAL-2 발행 본문 커밋) |
| 5. 선행 태스크 | **이 D+B 확정판 발행(별도 주니어 세부 명세 PR 불필요, 2026-11-17 D 직접 확정)**. `LOCAL-1`·`VISIT-2` 머지 후 최신 `origin/main`에서 `feat/local-feed-LOCAL-2` 브랜치 하나를 만들어 P1 → P2 → P3 → P4 순서로 진행한다 |
| 6. 수정 허용 파일 | 위 표의 그 행 |
| 7. 금지된 결정 | 인기순·모음 화면·댓글(Q-57)·이미지 검색 오버레이 금지. 카드에 작성자·공감 수·제목 줄 넣기 금지(H4). M1에서 예스24 외부 API 실제 호출 금지(버튼만 표시, H9·H10) |
| 8. 완료 조건 | 위 표의 항목 + P5 그 파트 시험 + (앱 파트) 웹·Android |
| 9. 검증 명령 | 서버 파트: LOCAL-1-P1과 같음 / 앱 파트: LOCAL-1-P2와 같음 |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P1·P3·P4

- P1: 코드 `main` `74d2885`의 `server/app/auth.py`(`get_optional_user`, `lock_active_user`), `mobile/src/lib/publicApi.ts`(`fetchAvailabilityAt`), `mobile/src/lib/latest.ts`(`createLatestRunner`), LOCAL-1의 `0004_posts.py`·`post_public`. 새 라이브러리 없음.
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
| LOCAL-2-P3 | `post card renders image only without title author or count` (H4, H13) | 책·글자 있는 `FeedPost` | `PostCard` 렌더 | 이미지와 `overlay_text`만 보임, 책 제목·작성자·공감 수 텍스트 없음 | 카드 밖 제목·작성자 노출 |
| LOCAL-2-P3 | `compact menu with book shows 3 icon buttons and book-author search rows` (H10, `#el-card-menu` A) | `book: {title:"소년이 온다", author:"한강"}` | 카드 길게 누르기(또는 웹 호버 `⋯`) → 제목 검색 / 저자 검색 누름 | 상단 `좋아요`·`북마크`·`공유` 아이콘 3개 한 줄 + 하단 `"소년이 온다"` 검색·`"한강"` 검색 2줄, 누르면 `/search?q=소년이 온다` · `/search?q=한강` 이동 | 6단 과밀 메뉴·쿼리 누락 |
| LOCAL-2-P3 | `compact menu without book shows bookless purchase button UI only without API call` (H10, C-46 D1) | `book: null` (또는 도서 없음 상태) | 메뉴 열기 → `"도서 없음 (예스24 구매 ↗)"` 누름 | 상단 아이콘 3개 + `"도서 없음 (예스24 구매 ↗)"` 버튼 표시, 누르면 `"준비 중이에요"` 안내만 뜨고 외부/구매 API 호출 0번 | M1에서 미구현 예스24 API 호출 |
| LOCAL-2-P3 | `web share copies link to clipboard when navigator.share unavailable` (C4, H11) | `navigator.share = undefined` | 메뉴 `"공유"` 누름 | `clipboard.writeText`에 `/posts/<id>` 주소 전달, `"링크를 복사했어요"` 표시 | 웹 공유 실패 |
| LOCAL-2-P3 | `library feed paginates with cursor once per scroll end` (H1, H2, H13) | `next_cursor` 있는 첫 페이지 | 스크롤 끝 두 번 빠르게 | `fetchLibraryPosts` 다음 커서 호출 1번, 항목 이어 붙음 | 중복 페이지 요청 |
| LOCAL-2-P4 | `detail renders clean image top bar and loan priority over yes24 button` (H9, H14, `#el-detail-cta` A) | 책 연결된 `Post`, `#14` `loanable:"yes"`, `data_date` 어제 | 상세 진입 | 이미지 위 좌/우하단 오버레이 버튼 없음, 상단 바에 `♡`+공감 수·공유·`⋯`·우측 북마크 아이콘(접근성 이름 `"저장"`), 본문이 도서 카드보다 위, 도서 카드에 `"정독도서관"`·`"어제 기준 대출 가능"`(1순위)이 `"구매 ↗"`(2순위 보조 버튼)보다 먼저 표시, `"구매 ↗"` 누르면 API 호출 없이 `"준비 중이에요"` 안내 (2026-11-18 개정) | 대여·구매 순서 역전·실시간 단정 문구 |
| LOCAL-2-P4 | `detail reaction and bookmark toggle idempotently and block rapid double tap` (H5, H6, H-#5) | 로그인 상태, 응답 지연 | `♡` 두 번 빠르게 / `"저장"` 두 번 빠르게 | `setReaction` 1번(`reaction_count` 갱신), `setBookmark` 1번(`"저장됨"` 전환, 다시 누르면 확인창 없이 해제) | 연타 중복 전송·북마크 해제 확인창 |
| LOCAL-2-P4 | `detail signed out reaction or bookmark shows login prompt` (H-#6) | 비로그인 | `♡` 또는 `"저장"` 누름 | 로그인 안내 창 표시, `setReaction`/`setBookmark` 호출 0번 | 비로그인 401 그대로 노출 |
| LOCAL-2-P4 | `detail of withdrawn post shows unavailable message and feed button` (H3, H-#4) | `#27` `404 POST_NOT_AVAILABLE` | 상세 진입 | `"더 이상 공개되지 않는 게시물이에요."` + `"피드 보기"` 표시 | 철회 글 내용 노출 |
| LOCAL-2-P4 | `detail shows same book posts first then library feed and hides same book section when empty` (H7, H15) | `#28` 2개 / 0개, `#26` 3개 | 상세 스크롤 | `#28`이 있으면 `"같은 책의 다른 글"` 2열이 `"이 도서관의 다른 글"` 2열보다 위, 0개거나 `book: null`이면 `"같은 책의 다른 글"` 묶음 숨김, 다른 도서관 글을 열어도 방문 중 도서관 `theme` 유지 | 이어 읽기 순서·빈 묶음 노출 |

## VISIT-3 오늘의 서가(책장)·방명록 카드

- **담당 역할**: B (서버 파트 포함, 책장 데이터 `#31`은 D `core.md` M2-0-P3) · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/VISIT-3.md`, 시안 `specs/local-feed/세부/VISIT-3_시안.html` (세부 기획 때 작성)
- **판**: 1차 D 기준선(M2 밑그림, 2026-11-19)
- **선행 설계**: 02 VISIT-03·VISIT-04·AC-VISIT·AC-MOD, 04 "방명록 글"·R10·R11·R12, `DESIGN.md` "책장(M2): 높이 224, 한 페이지 책 3권(표지 104×150)"·"피드와 책장 사이 블러 띠 72px", 모호점 Q-42·Q-46·Q-47·Q-49
- **작성자**: D (시니어)
- **상태**: **D 기준선 — 검토 전·구현 착수 불가.** 기획(명세서+시안)과 열린 칸 계약 수정본을 함께 제출하고 D 승인·발행 뒤 구현한다.
- **발행 본문 SHA**: 


### Pre-flight 5대 관문 (코드 레포 `main` `761b4a1` · `team` `b4220e9`)

| 관문 | 확인한 것 (`file:line`) | 이 계약서의 처리 (잠금 조건) | 미해결 / 후속 |
| :--- | :--- | :--- | :--- |
| ① 격리·권한·호환 | `server/app/auth.py:180`(`get_current_user`)·`:207`(`get_optional_user`)·`:132`(`lock_active_user`), `server/app/common.py:12-23`(`ApiError`) | 방명록 쓰기·철회는 필수 인증, 작성자는 토큰 `user.id`만. 남의 글·없는 글 철회는 같은 `404 NOT_FOUND`. 피드·책장 읽기는 선택 인증. 새 테이블 RLS 활성·정책 0개 | 없음 |
| ② 동시성·트랜잭션·외부 I/O | `server/app/db.py:16`(`run_db`), `mobile/src/lib/latest.ts:6`(`createLatestRunner`), `server/app/routers/feed.py:36-41`(복합 커서) | 방명록 올리기는 `client_request_id` 멱등(`posts`와 같음). 쓰기 트랜잭션 안 `lock_active_user`. 책장 데이터는 D `#31`이 만들고 외부 조회는 트랜잭션 밖. 앱은 도서관을 바꿀 때 늦은 응답 폐기 | 없음 |
| ③ 전제 실재성 | `server/migrations/versions/0009_library_return_stats.py:16-24`(반납 집계 표, 쓰기 꺼 둠), `0002_public_reference.py:135-187`(`popular_books_cache`), `mobile/src/features/local-feed/VisitScreen.tsx`·`LibraryFeed.tsx`·`PostCard.tsx` | `guestbook_entries`는 **D가 `0012_m2_targets.py`로 먼저 만듦(2026-11-19, core M2-0-P2) → 이 Step은 열린 제약만 더한다**. 책장 ①(반납 집계 쓰기·동의)·③(서가 테마)은 D M2-0-P3·P4 머지 전 C7 가짜 값 | `미구현: M2-0-P3·P4` |
| ④ 담당·공유 파일 | `server/app/main.py:115-127`(`[local-feed-B]` 블록), `server/app/routers/me.py:69`(`withdraw_user_account`, D) | `main.py`는 `[local-feed-B]` 블록만. 탈퇴 때 방명록 철회는 D가 M2-0-P5에서 `me.py`에 더한다(B는 고치지 않음) | M2-0-P5 |
| ⑤ 승인·확장 | 05 §10(M2 테이블 미정), 06 #26(게시물 전용 피드) | 새 테이블 `guestbook_entries` 1개, 새 경로 `#32`~`#34`는 M2 확장으로 확정해 05·06에 반영(2026-11-19 D 확정). `#26`은 바꾸지 않는다(홈 하단 창이 씀) | 없음 |

### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| V3-1 | 방문 페이지 **아래에 고정된 책장("오늘의 서가")**. 높이 224, 한 페이지 책 3권(표지 104×150), 좌우로 넘긴다. 피드와 책장 사이는 얇은 블러 띠 72px(블러 5겹), 블러가 안 되는 기기는 그라데이션 페이드만 | 확정 / 블러 기기 성능 미확인(임시) Q-46 | 02 VISIT-04, `DESIGN.md` 책장·블러 |
| V3-2 | 책장 페이지는 세 종류: ① `recent_reads` **요즘 사람들이 읽은 책**(동의한 이용자의 "반납했어요"를 도서관-책 단위로 쌓은 익명 집계, user id 연결 없음) ② `popular` **인기 도서**(정보나루 도서관별 인기대출도서) ③ `theme` **테마별 추천 도서**(운영자 구성). ①이 비어 있으면 숨기고 다른 페이지를 먼저 보인다. 순서는 시안에서 정한다(V3-O1) | 확정 (2026-11-11 사용자) | 02 VISIT-04, Q-42·Q-43 |
| V3-3 | 책장의 책은 "읽힌·인기" 표시이며 **대출 가능 표시가 아니다**. 책을 누르면 책 상세 `router.push({ pathname: "/books/[isbn13]", params: { isbn13 } })`로 가서 소장·대출 가능 조회(LIB-03)로 이어 확인한다 | 확정 | 02 VISIT-04, `DESIGN.md` "읽힌 책·인기 도서는 대출 가능 표시가 아니다" |
| V3-4 | ①의 "요즘" 기간·표시 최소 건수·동의 방식은 D가 M2-0-P4에서 정한다. 이 Step은 `#31` 응답의 `pages[]`를 그대로 그린다(빈 페이지는 서버가 빼서 준다) | 미확인(임시) Q-49 — 임시: 최근 30일, 도서관-책 합계 3건 이상만 | Q-49 |
| V3-5 | ③ 테마의 범위·개수·노출 기간·입력은 D가 M2-0-P3에서 정한다. 활성 테마가 없거나 책이 없으면 서버가 `theme` 페이지를 빼고 준다 | 미확인(임시) Q-47 — 임시: 도서관별 테마가 있으면 그것, 없으면 전체 공통, 동시에 하나 | Q-47, C-46 E1 |
| V3-6 | **방명록**: 도서관별 짧은 공개 글. 별도 화면이 아니라 **방문 페이지 피드에 카드로 섞여 나온다**. 쓰기는 로그인 필요, 본인 글은 철회(삭제)할 수 있고 신고 대상이다(LOCAL-4). 철회·운영 숨김한 글은 피드·직접 조회 어디에도 나오지 않는다 | 확정 | 02 VISIT-03, 04 R10 |
| V3-7 | 방명록·스탬프·게시물은 대출·위치·실제 방문의 증거가 아니다. 인증 배지를 만들지 않는다 | 확정 | 04 R11 |
| V3-8 | **혼합 피드**: 방문 페이지 피드는 새 경로 `#32 GET /libraries/{library_id}/feed`로 바꾼다. 응답은 `kind`로 구분한 `FeedItem[]`이고 이 Step은 `post`·`guestbook` 두 종류를 낸다(VISIT-4가 `stamp`, CLUB-1이 `club`을 더한다). 정렬은 모든 종류를 합쳐 `published_at DESC, kind ASC, id DESC`, 커서는 그 세 값. `#26`(게시물만)은 그대로 둔다(홈 하단 창 `useHomeFeed`가 씀) | 확정 (2026-11-19 D) | 02 VISIT-03 "피드에 카드로 섞여" |
| V3-9 | 방명록 올리기는 `client_request_id`로 한 번만 저장된다. 같은 값으로 다시 보내면 `200`과 같은 글(새 행 없음) | 확정 | `posts` 멱등 규칙과 같음(LOCAL-1) |
| V3-10 | 방명록 카드의 태그는 "점 + 글자"(투명도 70%), 카드 곡률은 정보 카드 `radii.infoCard` | 확정 (`DESIGN.md` 태그·곡률 위계) | `DESIGN.md` |

##### 열린 칸 (B가 기획·시안 작성 후 `2_계약_보완.md`로 채울 결정 — 아래 빈 칸만 채우고 행 추가 가능)

| # | 열린 칸 | D 추천(참고) | 채택 결정 | 상태 | 근거(명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| V3-O1 | 책장 페이지 순서·처음 보이는 페이지·넘김 표시(점·숫자) | ① → ② → ③, 점 3개 | (2026-11-19 D 결정 변경, 이전: `recent_reads` → `popular` → `theme`) `recent_reads` → `theme` → `popular` 순서. 처음 열 때(도서관을 바꿀 때 포함) 늘 첫 장. 서버가 뺀 장은 건너뛰고 남은 순서 그대로(① 빔 → 첫 장 `theme`, ③ 빔 → ① 다음 `popular`). 넘김 표시는 점(받은 장 수만큼 1~3개, 지금 장만 `inkStrong`, 나머지 `surface3`, 점을 눌러도 그 장으로 넘어감). 장이 1개면 점을 그리지 않음. 책장 머리는 왼쪽 `title`, 오른쪽 `basis_label`(없으면 비움), 한 줄 고정 | 첫 장: 확인(사용자) / 순서: 확인(D 변경 2026-11-19 — 인기 도서는 시리즈 책이 많아 맨 뒤) / 점 모양·머리: 기본값(Claude) | `specs/local-feed/세부/VISIT-3.md` 결정 1, 시안 `#el-shelf-order`, PR #221 D 확정 의견 |
| V3-O2 | 책장 페이지가 하나도 없을 때(①②③ 모두 빔) 책장 자리 | 책장 자리 유지 + 한 줄 안내 | 책장 자리(높이 224·선반)는 그대로 두고 책 자리에 두 줄 안내(C3 "책장 페이지 없음"). 점·머리는 그리지 않음. 버튼 없음 | 기본값(Claude), 예외 화면 사용자 확인("다 괜찮아요") | `specs/local-feed/세부/VISIT-3.md` 예외 #2 |
| V3-O3 | 방명록 쓰는 입구 위치(`+` 버튼을 누르면 게시물/방명록 고르기 · 피드 맨 위 입력 줄 · 그 밖) | `+` 버튼 → 고르기 | 방문 페이지의 기존 `+`(LOCAL-1 결정 1)를 누르면 아래에서 고르기 창: "게시물 올리기"(→ 기존 `/posts/new`) / "방명록 남기기"(→ 쓰는 창). 로그인 확인은 고른 뒤: 비로그인이 "방명록 남기기"를 고르면 방명록 로그인 창, "게시물 올리기"는 기존 글쓰기 로그인 창(`VISIT_TEXT.loginNeeded`). 쓰는 창: 여러 줄 입력 1칸 + 글자 수 `n/140` + "닫기"·"올리기". `+` 자리는 책장(224) 바로 위 오른쪽(책장 위 12) | 입구: 확인(사용자) / `+` 자리·쓰는 창 모양: 기본값(Claude) | `specs/local-feed/세부/VISIT-3.md` 결정 2, 시안 `#el-gb-entry` |
| V3-O4 | 방명록 카드 모양(글자 크기·작성자 표시·날짜 표시·메뉴 자리) | 글 15 + 닉네임·날짜 작게 | 2열 메이슨리의 **한 칸**짜리 글 카드(게시물 카드와 같은 폭, 높이는 글 길이만큼). 바탕은 카드 색 후보 PANTONE 11-0602 · 11-0701 · 12-4302 중 하나(2026-11-19 D 결정, 이전 임시 값 `paper`) — 확정 전 기본은 첫 후보 11-0602, `GuestbookCard.tsx` 안 상수 하나로 고르며 구현 후 D가 화면에서 확인해 확정. 곡률 `radii.infoCard`, 위에 태그 점 + "방명록"(투명도 70%, V3-10), 글 15 전부(자르지 않음), 아래 `author_nickname · 언제` 11 `inkMuted`. "언제"는 1분 안 "방금" · 1시간 안 "n분 전" · 오늘 "n시간 전" · 어제 "어제" · 2~6일 "n일 전" · 그 밖 `YYYY.MM.DD`(KST). `mine=true`일 때만 오른쪽 위 ⋯. 카드 자체를 눌러도 다른 화면으로 가지 않음 | 모양: 확인(사용자) / 바탕 색: 미확인(임시: 11-0602, D 확인 대기) / 크기·날짜 표시: 기본값(Claude) | `specs/local-feed/세부/VISIT-3.md` 결정 3, 시안 `#el-gb-card`, PR #221 D 확정 의견 |
| V3-O5 | 방명록 글 길이 상한(글자 수) | 140 | 140자(앞뒤 공백 뺀 `char_length`). 앱 입력 칸 `maxLength=140`, 서버 `422 detail="body"`, DB CHECK(C5) | 기본값(Claude) | `specs/local-feed/세부/VISIT-3.md` 0절 기본값 |
| V3-O6 | 내 방명록 철회 방법(카드 메뉴 → 확인창 / 되돌리기 안내) | 확인창 | 내 카드 ⋯ → 아래 창 "지우기" → 확인창(C3 문구) → "지우기"를 누르면 `#34` 후 피드에서 그 카드를 뺀다. 되돌리기 없음(LOCAL-1 결정 4와 같은 길) | 기본값(Claude), 예외 화면 사용자 확인 | `specs/local-feed/세부/VISIT-3.md` 0절 기본값·결정 3 유저 플로우 |
| V3-O7 | 책 표지가 없을 때 책장의 책 모양 | 제목 글자 표지(`surface2`) | `cover_url=null`이면 같은 크기(104×150·책 표지 곡률)의 글자 표지: 위 저자, 아래 제목. 바탕 `paper`(D 추천 `surface2`는 책장 바탕 `surface2`와 같아 책이 묻혀서 바꿈) | 기본값(Claude) | `specs/local-feed/세부/VISIT-3.md` 0절 기본값, 검토 메모 |

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1`) | 인증 | 성공 상태 | 날짜 형식 | 목록 페이지·정렬·동률 | 같은 요청 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /libraries/{library_id}/shelf` (#31, **D** M2-0-P3) | 없음 | `200` | `basis_label` 글자 | 페이지 최대 3, 페이지당 책 최대 3(서버가 자름) | N/A (읽기) |
| `GET /libraries/{library_id}/feed?cursor=&limit=` (#32, B) | 선택 (`get_optional_user`) | `200` | `published_at`: ISO 8601 `+09:00` | `limit` 기본 20(1~50), 정렬 V3-8, 커서 base64url `[published_at, kind, id]` | N/A (읽기) |
| `POST /libraries/{library_id}/guestbook` (#33, B) | 필수 | `201` 새 글 / `200` 같은 `client_request_id` 재전송 | 위와 같음 | — | 멱등(V3-9) |
| `POST /guestbook/{entry_id}/withdraw` (#34, B) | 필수(작성자만) | `200` (이미 철회돼도 `200`) | — | — | 멱등 |

앱 함수 (B, `mobile/src/features/local-feed/api.ts`에 더함):

- `fetchShelf(libraryId: number, signal?: AbortSignal): Promise<ShelfResponse>`
- `fetchLibraryFeedItems(libraryId: number, page: { cursor: string | null; limit?: number }, signal?: AbortSignal): Promise<FeedItemPage>`
- `postGuestbook(libraryId: number, body: string, clientRequestId: string): Promise<GuestbookItem>`
- `withdrawGuestbook(entryId: string): Promise<void>`

부품:

- `mobile/src/features/local-feed/Bookshelf.tsx`: `export function Bookshelf(props: { libraryId: number; onOpenBook(isbn13: string): void }): JSX.Element`
- `mobile/src/features/local-feed/FeedItemCard.tsx`: `export function FeedItemCard(props: { item: FeedItem; width: number; onOpenPost(postId: string): void; onMenu?(item: FeedItem): void }): JSX.Element` — `kind`로 나눠 `post`는 기존 `PostCard`를 그대로, `guestbook`은 `GuestbookCard`를 그린다. 모르는 `kind`는 그리지 않는다(뒤 Step이 종류를 더해도 깨지지 않게)
- `mobile/src/features/local-feed/GuestbookCard.tsx`, `GuestbookComposer.tsx`: props는 세부 기획에서 정한다(열린 칸 V3-O3·V3-O4)
  - (세부 기획 결과) `GuestbookCard.tsx`: `export function GuestbookCard(props: { entry: GuestbookItem; width: number; onMenu?(entry: GuestbookItem): void }): JSX.Element` — ⋯는 `entry.mine && onMenu`일 때만. `FeedItemCard`가 `kind="guestbook"`일 때 `onMenu`를 넘긴다
  - (세부 기획 결과) `GuestbookComposer.tsx`: `export function ComposeChooser(props: { visible: boolean; onPost(): void; onGuestbook(): void; onClose(): void }): JSX.Element`(`+`를 누르면 뜨는 고르기 창) · `export function GuestbookComposer(props: { libraryId: number; libraryName: string; visible: boolean; onClose(): void; onPosted(item: GuestbookItem): void }): JSX.Element`(쓰는 창, `client_request_id`는 창을 열 때 한 번 만들고 성공·닫기 때 버림) · `export const GUESTBOOK_TEXT`(C3 방명록 문구)

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 응답(#31) | `pages[]` | `ShelfPage[]` | Y | N | 0~3개. 빈 페이지는 서버가 뺀다(V3-2·V3-4·V3-5) |
| `ShelfPage` | `kind` | `"recent_reads" \| "popular" \| "theme"` | Y | N | V3-2 |
| `ShelfPage` | `title` | `str` | Y | N | 페이지 제목. `theme`은 운영자가 쓴 테마 이름 |
| `ShelfPage` | `basis_label` | `str` | Y | Y | 예 `"최근 30일 · 이 도서관"`. 없으면 `null` |
| `ShelfPage` | `books[]` | core `Book` (`isbn13`, `title`, `author`, `cover_url`) | Y | N | 1~3권 |
| 요청(#32) | `cursor` | `str` | N | Y | 깨지면 `422 VALIDATION_ERROR`, `detail="cursor"` |
| 요청(#32) | `limit` | `int` | N | N | 1~50, 밖이면 `422`, `detail="limit"` |
| 응답(#32) `FeedItemPage` | `items[]` | `FeedItem[]` | Y | N | V3-8 |
| 응답(#32) | `next_cursor` | `str` | Y | Y | 다음 쪽 없으면 `null` |
| `FeedItem` | `kind` | `"post" \| "guestbook"` (VISIT-4 `"stamp"`, CLUB-1 `"club"` 추가 예정) | Y | N | |
| `FeedItem` (`kind="post"`) | `post` | `FeedPost` (LOCAL-2 C3 그대로) | Y | N | |
| `FeedItem` (`kind="guestbook"`) | `guestbook` | `GuestbookItem` | Y | N | |
| `GuestbookItem` | `id` | `str (UUID)` | Y | N | |
| `GuestbookItem` | `library_id` | `int` | Y | N | |
| `GuestbookItem` | `body` | `str` | Y | N | 1~V3-O5자(앞뒤 공백 뺀 길이) |
| `GuestbookItem` | `author_nickname` | `str` | Y | N | `nickname_of` |
| `GuestbookItem` | `published_at` | `str` | Y | N | ISO 8601 `+09:00` |
| `GuestbookItem` | `mine` | `bool` | Y | N | 비로그인은 항상 `false`. 응답에 `user_id` 없음 |
| 요청(#33) | `body` | `str` | Y | N | 길이 밖이면 `422`, `detail="body"` |
| 요청(#33) | `client_request_id` | `str (UUID)` | Y | N | 깨지면 `422`, `detail="client_request_id"` |
| 응답(#33) | (본문) | `GuestbookItem` | Y | N | |
| 화면 문구 | 책장 ① 제목 | — | — | — | `"요즘 사람들이 읽은 책"` |
| 화면 문구 | 책장 ② 제목 | — | — | — | `"인기 도서"` |
| 화면 문구 | 책장 페이지 없음 (`V3-O2`) | — | — | — | `"아직 이 도서관 책장이 비어 있어요"` / `"빌린 책을 반납하면 여기에 쌓여요"` |
| 화면 문구 | 방명록 입구 버튼·입력 안내 (`V3-O3`) | — | — | — | 고르기 창: 제목 `"무엇을 올릴까요?"`, `"게시물 올리기"`(작게 `"사진·표지와 글"`), `"방명록 남기기"`(작게 `"짧은 한마디 (140자까지)"`), `"닫기"`. 쓰는 창: 제목 `"방명록 남기기"`, 안내 `"{도서관 이름}에 짧은 한마디를 남겨요. 모두가 볼 수 있어요."`, 입력 칸 안내 `"예) 2층 창가 자리 오늘 햇살 좋아요"`, 글자 수 `"{n}/140"`, `"닫기"`·`"올리기"`, 빈 글 `"한 글자 이상 써 주세요"`, 성공 한 줄 안내 `"방명록을 남겼어요"`. 카드 태그 `"방명록"` |
| 화면 문구 | 방명록 철회 확인·완료 (`V3-O6`) | — | — | — | 메뉴 창: 제목 `"내 방명록"`, `"지우기"`(작게 `"피드에서 내려요"`), `"닫기"`. 확인창: `"이 방명록을 지울까요?"` / `"지우면 피드에서 사라지고 되돌릴 수 없어요."`, `"취소"`·`"지우기"`. 완료 한 줄 안내 `"방명록을 지웠어요"`. 실패 한 줄 안내 `"방명록을 지우지 못했어요. 다시 해 주세요"`(카드 그대로) |
| 화면 문구 | 비로그인으로 방명록 쓰기 | — | — | — | `"로그인하면 방명록을 남길 수 있어요"` / `"책장과 피드는 로그인 없이도 볼 수 있어요."`, `"로그인하기"`(→ `/login`)·`"닫기"`. 게시물 쪽은 기존 `VISIT_TEXT.loginNeeded` 그대로 |
| 화면 문구 | 책장·피드 불러오기 실패 | — | — | — | 책장: 책장 자리에 `"책장을 불러오지 못했어요"` + 글자 링크 `"다시 해 보기"`(누르면 `#31`만 다시). 피드: 기존 `VISIT_TEXT.feedFailed`·`feedRetry`·`moreFailed` 그대로. 방명록 올리기 실패: 쓰는 창을 닫지 않고 입력한 글 유지 + 입력 칸 아래 `"방명록을 올리지 못했어요. 다시 해 주세요"`. `422 body`: 입력 칸 아래 `"140자까지 쓸 수 있어요"` |

#### C4. 플랫폼 분기 표

| 분기 지점 | 공통 처리 | iOS | Android | 웹 | 모아 둘 곳 | 확인 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 피드-책장 사이 블러 띠 | 블러가 되면 5겹 블러, 안 되면 그라데이션 페이드만 | 세부 기획에서 실기기 확인(Q-46) | 같음 | CSS `backdrop-filter`가 없으면 페이드 | `Bookshelf.tsx` 한 곳 | 저사양 Android 스크롤 끊김 없음 |
| 책장 좌우 넘김 | RN `ScrollView horizontal pagingEnabled` | 같음 | 같음 | 같음(마우스 끌기·화살표 키) | 분기 없음 | 세 플랫폼 넘김 |

#### C5. 테이블

```sql
-- 0012_m2_targets.py (D 선행 생성, core M2-0-P2). B는 NNNN_guestbook_constraints.py에서 열린 제약만 ALTER
CREATE TABLE guestbook_entries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id),          -- ON DELETE NO ACTION (05 R12)
  library_id        bigint      NOT NULL REFERENCES libraries(id),
  body              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'published'
                    CHECK (status IN ('published','withdrawn','hidden')),
  client_request_id uuid        NOT NULL,
  published_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guestbook_user_client_request_key UNIQUE (user_id, client_request_id)
);
CREATE INDEX ix_guestbook_library_published
  ON guestbook_entries (library_id, published_at DESC, id DESC) WHERE status = 'published';
ALTER TABLE guestbook_entries ENABLE ROW LEVEL SECURITY;  -- 정책 0개
```

| 열린 제약 | 컬럼 | 값 (B 채움) |
| :--- | :--- | :--- |
| 길이 CHECK `guestbook_body_len_check` | `body` (`char_length(btrim(body))` 1 이상) | `CHECK (char_length(btrim(body)) BETWEEN 1 AND 140)` — V3-O5. 서버는 `strip()`한 글을 저장하므로 저장값 길이 = 검사 길이 |

- 탈퇴(AUTH-3): 그 사용자의 `published` 방명록을 `withdrawn`으로 바꾼다. D가 M2-0-P5에서 `me.py` `withdraw_user_account`에 더한다.
- 운영 숨김(`hidden`)은 LOCAL-4·M2-0-P2가 쓴다. 이 Step은 `hidden`을 읽기에서 빼기만 한다.

#### C6. 검증과 에러 처리

| 명세서 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 끊김 | 책장·피드·쓰기 중 네트워크·서버 오류 | `ApiCallError` | 책장 실패: 책장 자리에 실패 문구 + "다시 해 보기"(C3). 피드 실패: 기존 VISIT-2 피드 실패 화면. 올리기 실패: 쓰는 창 입력 칸 아래 실패 문구. 철회 실패: 한 줄 안내, 카드 유지 | 다른 칸(책장 실패는 책장만, 피드 실패는 피드만) | 쓰기 실패 때 입력한 글 유지 |
| 빈 결과 | 피드 0개 / 책장 페이지 0개 | `200` `items: []` / `pages: []` | 빈 피드는 기존 VISIT-2 빈 화면, 책장은 V3-O2 | 머리·책장 | — |
| 연타 | 방명록 올리기 두 번 / 철회 두 번 | `200` 같은 글 / `200` | 글 하나만 보임 | — | 행 하나 |
| 비로그인 | 방명록 쓰기·철회 | 앱은 부르지 않음. 직접 호출은 `401 AUTH_REQUIRED` | 로그인 안내 | 피드·책장 | 행 없음 |
| 타인·없는 글 | 남의 글·없는 `entry_id` 철회 | `404 NOT_FOUND` (같은 응답) | 앱은 `mine=false` 카드에 ⋯를 그리지 않아 부르지 않음. 이미 사라진 글이면 철회 실패 한 줄 안내 후 첫 묶음 다시 받기 | 피드·책장 | 남의 행 무변경 |
| 입력 오류 | 길이 밖 `body`, 깨진 `client_request_id`·`cursor`·`limit` | `422 VALIDATION_ERROR` / 필드명 | 입력 칸 아래 안내 | 입력한 글 | 행 없음 |
| 도서관 없음 | 없는 `library_id` | `404 NOT_FOUND` | 방문 페이지 기존 처리 | — | — |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D `core` M2-0-P3 | `#31` 책장 | `TODO(연결): D` — `{"pages":[{"kind":"popular","title":"인기 도서","basis_label":"최근 한 달 · 정독도서관","books":[{"isbn13":"9788936434120","title":"소년이 온다","author":"한강","cover_url":null},{"isbn13":"9788954682152","title":"작별하지 않는다","author":"한강","cover_url":null},{"isbn13":"9791190090018","title":"아몬드","author":"손원평","cover_url":null}]}]}` |
| D `core` M2-0-P4 | 반납 집계 쓰기(①의 원천) | ①은 가짜 값에 넣지 않는다(동의 전에는 빈 것이 정상) |
| D `core` M2-0-P5 | 탈퇴 때 방명록 철회 | N/A: D 작업 |
| B LOCAL-4 | 방명록 신고 메뉴 | 이 Step은 메뉴 자리만 두지 않는다. LOCAL-4가 더한다 |
| C `book-search` | `/books/[isbn13]` | 있음 |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦 |
| :--- | :--- | :--- | :--- |
| 게시물 피드 커서 | `server/app/routers/feed.py:36-41,94-122` | `encode_cursor`, `decode_cursor`, `select_page`, `library_feed` | 있음 — 혼합 커서는 새로 만든다 |
| 방문 페이지 | `mobile/src/features/local-feed/VisitScreen.tsx`, `LibraryFeed.tsx` | `LibraryFeed` | 있음 |
| 게시물 카드 | `mobile/src/features/local-feed/PostCard.tsx` | `PostCard(props: { post; onPress; onMenu?; width })` | 있음 |
| 책장 데이터 | — | `#31` | 앞으로 만듦(D M2-0-P3) |
| 방명록 표 | — | `guestbook_entries` | 앞으로 만듦(이 Step) |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 명세서 항목 |
| :--- | :--- | :--- | :--- |
| `VISIT-3-P1` 방명록·혼합 피드 서버 | `feat/local-feed-VISIT-3` (Step 하나 = 브랜치 하나, 파트는 커밋) | `server/migrations/versions/NNNN_guestbook_constraints.py`(**표는 D가 먼저 만듦(`0012_m2_targets.py`, core M2-0-P2, 2026-11-19 D 결정) — B 마이그레이션은 아래 열린 제약 ALTER만**), `server/app/routers/guestbook.py`, `server/app/routers/feed.py`(`#32` 추가만, 기존 경로 무변경), `server/app/main.py`(`[local-feed-B]` 블록), `server/tests/test_guestbook.py`, `server/tests/test_feed_items.py` | V3-6·V3-8·V3-9, C6 전부(서버) |
| `VISIT-3-P2` 책장 | 같은 브랜치 | `mobile/src/features/local-feed/Bookshelf.tsx`, `mobile/src/features/local-feed/VisitScreen.tsx`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/__fakes__/shelf.ts`, `mobile/src/features/local-feed/__tests__/bookshelf.test.tsx` | V3-1~V3-5, V3-O1·V3-O2·V3-O7 |
| `VISIT-3-P3` 방명록 카드·쓰기 | 같은 브랜치 | `mobile/src/features/local-feed/FeedItemCard.tsx`, `mobile/src/features/local-feed/GuestbookCard.tsx`, `mobile/src/features/local-feed/GuestbookComposer.tsx`, `mobile/src/features/local-feed/LibraryFeed.tsx`, `mobile/src/features/local-feed/api.ts`, `mobile/src/features/local-feed/__tests__/guestbook.test.tsx` | V3-6~V3-10, V3-O3~V3-O6 |
| `VISIT-3-P3` 추가 파일 (2026-11-19 D 승인) | 같은 브랜치 | `mobile/src/features/local-feed/VisitScreen.tsx` — `+` → 고르기 창(`ComposeChooser`)·방명록 로그인 창·쓰는 창 띄우기, 피드 첫 묶음·다음 쪽 불러오기를 `#26`에서 `#32` `fetchLibraryFeedItems`로 바꾸기(기존 `feedRunner` 자리). `LibraryFeed.tsx`는 받은 목록만 그린다 | V3-O3, V3-8, C6 끊김·빈 결과 |

##### 파트 머리말 — VISIT-3-P1 · P2 · P3 (공통)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `VISIT-3-P1` / `VISIT-3-P2` / `VISIT-3-P3` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | M2 D 기준선 |
| 4. 계약서 커밋 | N/A: 검토 전 수정본(D 발행 뒤 발행 본문 SHA를 적는다) |
| 5. 선행 태스크 | LOCAL-2 머지(있음). D `M2-0-P3`(#31) 머지 전이면 C7 가짜 값. P3는 P1 뒤 |
| 6. 수정 허용 파일 | 위 표의 파트별 파일 |
| 7. 금지된 결정 | `#26` 응답 변경 금지. 책장 문구에 "대출 가능"·"실시간" 금지(V3-3). 블러 라이브러리 추가는 P3 승인 전 금지 |
| 8. 완료 조건 | 파트 표의 명세 항목 + P5 해당 시험 + 웹·Android |
| 9. 검증 명령 | 서버: `server`에서 `uv run alembic upgrade head` → `uv run pytest`. 앱: `mobile`에서 `npx tsc --noEmit` → `npx jest --runInBand src/features/local-feed` → `npx expo export --platform web` |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 앱 | 없음(블러가 꼭 필요하면 세부 기획에서 `expo-blur` 제안 → D 승인) | 블러 띠 | — |

#### P4. 핵심 흐름 골격

```python
# guestbook.py — 방명록 올리기 (멱등·잠금·필수 인증)
async def create_guestbook(library_id: int, body: GuestbookIn, user: CurrentUser = Depends(get_current_user)):
    text = body.body.strip()
    # 열린 칸 V3-O5: 길이 상한 검사를 이 자리에 둔다 → 밖이면 ApiError(422, "VALIDATION_ERROR", ..., "body")
    def tx(c):
        lock_active_user(c, user.id)
        ensure_library_exists(c, library_id)                 # 없으면 404 NOT_FOUND
        row = select_by_client_request(c, user.id, body.client_request_id)
        if row: return row, False                            # 같은 요청 → 200, 새 행 없음 (V3-9)
        return insert_entry(c, user.id, library_id, text, body.client_request_id), True
    row, created = await run_db(engine, tx)
    return JSONResponse(guestbook_item(row, viewer=user), status_code=201 if created else 200)

async def withdraw_guestbook(entry_id: UUID, user: CurrentUser = Depends(get_current_user)):
    def tx(c):
        lock_active_user(c, user.id)
        n = c.execute(UPDATE_WITHDRAW, {"id": entry_id, "uid": user.id})   # WHERE user_id = :uid AND status IN ('published','withdrawn')
        if n.rowcount == 0: raise ApiError(404, "NOT_FOUND", "찾을 수 없어요")  # 남의 글·없는 글 같은 응답
    await run_db(engine, tx)
    return {"ok": True}

# feed.py — #32 혼합 피드: post·guestbook을 각각 limit+1개 읽어 합치고 (published_at, kind, id)로 자른다
async def library_feed_items(library_id: int, cursor: str | None = None, limit: int = 20,
                             viewer: CurrentUser | None = Depends(get_optional_user)):
    after = decode_items_cursor(cursor)                  # 깨지면 422 detail="cursor"; [published_at, kind, id]
    def tx(c):
        ensure_library_exists(c, library_id)             # 없으면 404 NOT_FOUND
        posts = select_posts_page(c, library_id, after, limit + 1)       # status='published'만, 기존 공개 조건 그대로
        gbs = select_guestbook_page(c, library_id, after, limit + 1)     # status='published'만 (withdrawn·hidden 제외)
        return posts, gbs
    posts, gbs = await run_db(engine, tx)
    merged = [("post", p) for p in posts] + [("guestbook", g) for g in gbs]
    merged.sort(key=lambda kv: (-ts(kv[1].published_at), kv[0], desc_id(kv[1].id)))  # published_at DESC, kind ASC, id DESC
    page, more = merged[:limit], len(merged) > limit
    next_cursor = encode_items_cursor(page[-1]) if more else None
    return {"items": [feed_item(kind, row, viewer) for kind, row in page], "next_cursor": next_cursor}
# 각 select_*_page의 "커서 뒤" 조건은 (published_at, kind, id) 튜플 비교를 종류별로 풀어 쓴다:
#   같은 published_at이면 kind가 커서 kind보다 크거나(뒤 종류), 같은 kind에서 id가 작을 때만 뒤로 본다
```

```ts
// LibraryFeed.tsx — 도서관이 바뀌면 앞 요청 폐기
// (2026-11-19 D 승인 정정) 불러오기 위치는 VisitScreen.tsx(기존 feedRunner 자리)다. LibraryFeed.tsx는 받은 목록만 그린다. 아래 규칙은 그대로.
const runner = useMemo(() => createLatestRunner(), []);
async function loadFirst(libraryId: number) {
  const r = await runner.run((s) => fetchLibraryFeedItems(libraryId, { cursor: null }, s));
  if (r.status === "stale") return;
  // 열린 칸: 실패·빈 화면 처리(C6 끊김·빈 결과)를 세부 명세대로 채운다
  // (세부 명세 결과) 실패 → 피드 자리만 VISIT-2 실패 화면, 책장·머리 유지 / items 0개 → VISIT-2 빈 피드 화면
  if (r.status === "error") return setFeed({ kind: "error" });
  if (r.value.items.length === 0) return setFeed({ kind: "empty" });
  setFeed({ kind: "items", items: r.value.items, nextCursor: r.value.next_cursor });
}
```

```ts
// GuestbookComposer.tsx — 올리기 (V3-9 멱등, 실패 때 글 유지)
const requestId = useRef<string | null>(null);
useEffect(() => { if (visible) requestId.current = newUuid(); }, [visible]);   // 창을 열 때 한 번
async function submit() {
  const text = body.trim();
  if (text.length === 0) return setWarn(GUESTBOOK_TEXT.empty);
  if (sending.current) return;                        // 연타: 진행 중이면 무시
  sending.current = true;
  try {
    const item = await postGuestbook(libraryId, text, requestId.current!);  // 재시도도 같은 id → 200 같은 글
    requestId.current = null;
    onPosted(item);                                    // LibraryFeed가 맨 앞에 넣고 같은 id가 있으면 하나만 둔다
  } catch (e) {
    setWarn(isValidation(e, "body") ? GUESTBOOK_TEXT.tooLong : GUESTBOOK_TEXT.postFailed);  // 글은 그대로
  } finally {
    sending.current = false;
  }
}
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-3-P1 | `guestbook create is idempotent by client request id` | 로그인 | 같은 `client_request_id`로 두 번 | `201` 뒤 `200`, 같은 `id`, 행 1개 | 연타 중복 |
| VISIT-3-P1 | `guestbook write requires auth` | 비로그인 | `#33`·`#34` | `401 AUTH_REQUIRED`, 행 0 | 익명 쓰기 |
| VISIT-3-P1 | `withdraw of other or missing entry is same 404` | 사용자 A 글, B 토큰 / 없는 id | `#34` | 둘 다 `404 NOT_FOUND`, A 글 `published` 그대로 | 남의 글 철회·존재 노출 |
| VISIT-3-P1 | `withdrawn and hidden entries never appear in feed items` | `withdrawn`·`hidden` 글 | `#32` | 두 글 없음 | R10 |
| VISIT-3-P1 | `feed items merge kinds by time without duplicates across pages` | 게시물·방명록 같은 시각 섞어 25개 | `limit=10`으로 끝까지 | 전체 25개, 중복·누락 0, 순서 V3-8 | 혼합 커서 동률 |
| VISIT-3-P1 | `guestbook response has no user id` | 로그인 | `#32`·`#33` | JSON에 `user_id` 키 없음, `mine` 본인만 `true` | 식별자 노출 |
| VISIT-3-P2 | `shelf hides missing pages and never says loanable` | `#31` 가짜 값(`popular`만) | 렌더 | 페이지 1개, 화면에 `"대출 가능"`·`"실시간"` 없음 | V3-2·V3-3 |
| VISIT-3-P2 | `shelf book opens book detail` | — | 책 누름 | `router.push({pathname:"/books/[isbn13]",params:{isbn13:"9788936434120"}})` 1번 | V3-3 |
| VISIT-3-P2 | `shelf failure only affects shelf` | `#31` 503 | 렌더 | 책장 자리만 실패 문구, 피드 정상 | C6 끊김 |
| VISIT-3-P3 | `feed item card ignores unknown kinds` | `kind:"club"` 항목 | 렌더 | 오류 없이 그 항목만 안 그림 | 뒤 Step 호환 |
| VISIT-3-P3 | `library switch drops late feed response` | deferred 2개 | 101 → 102 | 화면은 102 항목 | AC-RACE |
| VISIT-3-P3 | `signed out guestbook write shows login prompt` | 비로그인 | 입구 누름 | 로그인 안내, `postGuestbook` 0번 | C6 비로그인 |
| VISIT-3-P1 | `guestbook body blank or over 140 is 422 body` | 로그인 | `#33` body `"   "` / 141자 / 정확히 140자 | 앞 둘 `422 VALIDATION_ERROR` `detail="body"`·행 0, 140자는 `201` | V3-O5 길이 검사·C5 CHECK 누락 |
| VISIT-3-P1 | `withdraw twice stays withdrawn and leaves feed` | 내 글 1개 | `#34` 두 번 → `#32` | 둘 다 `200`, 행 `withdrawn` 1개, 피드에 없음 | 철회 멱등·R10 |
| VISIT-3-P2 | `shelf shows recent reads then theme then popular` | `#31` 가짜 값 세 장(순서를 섞어 줌) | 렌더 → 점 2번째·3번째 누름 | 첫 장 제목 `"요즘 사람들이 읽은 책"`, 다음 테마 제목, 그다음 `"인기 도서"`, 점 3개 | V3-O1 순서(서버 순서 그대로 그리면 실패) |
| VISIT-3-P2 | `shelf without recent reads starts at theme` | `#31` `popular`·`theme` 두 장(이 순서로 줌) | 렌더 → 점 2번째 누름 | 첫 장 테마 제목, 다음 `"인기 도서"`, 점 2개 | V3-O1·V3-2 빈 장 건너뛰기 |
| VISIT-3-P2 | `empty shelf keeps shelf area with message` | `#31` `pages: []` | 렌더 | 책장 자리 있음, `"아직 이 도서관 책장이 비어 있어요"`, 점 없음, 피드 정상 | V3-O2(책장을 숨기면 실패) |
| VISIT-3-P2 | `shelf retry reloads only shelf` | `#31` 첫 호출 503, 두 번째 성공 | `"다시 해 보기"` 누름 | `fetchShelf` 2번, 피드 불러오기 1번 그대로, 책 3권 보임 | C6 끊김(전체 새로고침이면 실패) |
| VISIT-3-P3 | `plus opens chooser and guestbook option opens composer` | 로그인 | `+` → `"방명록 남기기"` | 고르기 창 두 항목, 쓰는 창 열림, `/posts/new` 이동 0번 / `"게시물 올리기"`는 `/posts/new` 1번 | V3-O3 |
| VISIT-3-P3 | `guestbook double submit creates one card` | 로그인, `postGuestbook` deferred | `"올리기"` 두 번 빠르게 → 응답 | `postGuestbook` 1번, 피드 맨 앞 내 카드 1개 | C6 연타(진행 중 가드 빠지면 2번) |
| VISIT-3-P3 | `guestbook failure keeps text and retries with same request id` | `postGuestbook` 첫 호출 실패 | `"올리기"` → 실패 → `"올리기"` | 입력 칸 글 그대로, 실패 문구, 두 호출의 `clientRequestId` 같음 | C6 끊김·V3-9(재시도마다 새 id면 실패) |
| VISIT-3-P3 | `only my guestbook card has menu and withdraw asks first` | `mine` true 1개·false 1개 | 내 ⋯ → `"지우기"` → 확인창 `"취소"` → 다시 `"지우기"` | ⋯ 1개뿐, 취소 때 `withdrawGuestbook` 0번, 확인 뒤 1번·카드 사라짐·`"방명록을 지웠어요"` | V3-O6·C6 타인 |
| VISIT-3-P3 | `guestbook card shows full body and relative time` | 140자 글, `published_at` 3시간 전·어제·8일 전 | 렌더 | 글 140자 전부, `"3시간 전"`·`"어제"`·`YYYY.MM.DD` | V3-O4(글 자르기·날짜 형식) |

## VISIT-4 방문 스탬프("다녀왔어요")·도서관 룩

- **담당 역할**: B (방문 페이지 쪽 전부). 룩 배정·운영자 재배정과 `#11` 응답의 `look` 필드는 D `core.md` M2-0-P3 · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/VISIT-4.md`, 시안 `specs/local-feed/세부/VISIT-4_시안.html` (세부 기획 때 작성)
- **판**: 1차 D 기준선(M2 밑그림, 2026-11-19)
- **선행 설계**: 02 VISIT-05·VISIT-07·AC-STAMP·AC-UI, 04 "방문 스탬프"(사용자×도서관×날짜, 자기 선언, 본인)·R11, C-46 D3(방문 기록 카드 북마크), `DESIGN.md` 규칙 7(방문 페이지의 무거운 표식은 스탬프 버튼)·룩 4종 토큰, `mobile/src/theme/tokens.ts:10`(`LookPreset`), 모호점 Q-45
- **작성자**: D (시니어)
- **상태**: **D 기준선 — 검토 전·구현 착수 불가.**
- **발행 본문 SHA**: 


### Pre-flight 5대 관문 (코드 레포 `main` `761b4a1` · `team` `b4220e9`)

| 관문 | 확인한 것 (`file:line`) | 이 계약서의 처리 (잠금 조건) | 미해결 / 후속 |
| :--- | :--- | :--- | :--- |
| ① 격리·권한·호환 | `server/app/auth.py:132,180,207` | 스탬프 찍기·공개 바꾸기·내 오늘 스탬프 조회는 필수 인증, 본인 것만. 비공개 스탬프는 본인 외 어디에도 안 나온다. 피드의 공개 스탬프 카드는 닉네임만(Q-45 ②) | Q-45 ② |
| ② 동시성·트랜잭션·외부 I/O | `server/app/db.py:16`, `server/app/common.py:35`(`today_kst`) | 날짜는 서버 `today_kst()`. 사용자×도서관×날짜 UNIQUE로 연타·재시도해도 한 행(`ON CONFLICT DO UPDATE`는 공개 여부만) | 없음 |
| ③ 전제 실재성 | `mobile/src/theme/index.ts:81`(`getTheme(look)`), `tokens.ts:10,31,169,176` | 룩 토큰 4종은 있음. `libraries.look` 컬럼·배정은 **없음 → D M2-0-P3**. `visit_stamps`는 **없음 → 이 Step** | `미구현: M2-0-P3` |
| ④ 담당·공유 파일 | `mobile/src/features/local-feed/VisitScreen.tsx`, `PostDetail.tsx`, `server/app/main.py:115-127` | B는 방문 페이지·그 피드에서 연 상세에만 룩을 입힌다. 홈(`library-visit`)·검색·대출 화면은 기본 룩 그대로 | 없음 |
| ⑤ 승인·확장 | 05 §10, 06 #11, C-46 D3 | 새 테이블 `visit_stamps`·`stamp_bookmarks`, 경로 `#35`·`#36`·`#69`, `FeedItem` `kind="stamp"` 추가(2026-11-19 D 확정). 내 정보 북마크 탭(`/me/bookmarks` `item_kind="stamp"`) 합치기는 A MY-3에서 연결 | 없음 |

### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| V4-1 | 그날 그 도서관에 처음 들어오면 **피드 섹션 오른쪽 위에 "다녀왔어요" 스탬프 버튼**이 뜬다. 방문 페이지에서 시선을 끄는 무거운 표식은 이 버튼 하나(완전한 필 `9999px`) | 확정 | 02 VISIT-05, `DESIGN.md` 규칙 7·컨트롤 곡률 |
| V4-2 | 스탬프는 **누르면 찍힌다**(자기 선언). 들어온 것만으로는 찍히지 않는다 | 미확인(임시: 추천안) Q-45 ① | 04 "자기 선언" |
| V4-3 | 누르면 그 자리에서 **공개 여부를 바로 정한다**(`private` / `public`). 공개로 정하면 그 도서관 피드에 `kind="stamp"` 카드로 섞여 나온다. 나중에 공개 여부를 바꿀 수 있다 | 확정 / 바꾸는 자리는 열린 칸 | 02 VISIT-05 |
| V4-4 | 공개 스탬프 카드에 보이는 이름은 닉네임 | 미확인(임시: 추천안) Q-45 ② | Q-45 |
| V4-5 | 스탬프는 사용자×도서관×서울 날짜 하나. 같은 날 다시 눌러도 한 개, 공개 여부만 바뀐다 | 확정 | 04 "사용자×도서관×날짜" |
| V4-6 | 스탬프는 위치·대출·실제 방문의 증거가 아니다. "인증"·"확인됨" 같은 말과 배지를 쓰지 않는다 | 확정 | 04 R11 |
| V4-7 | 기기의 방문 횟수(`localone:visits:v1`, C-56 방문 멘트용)와 스탬프는 **별개 값**이다. 스탬프가 방문 멘트·도서관 기본값 질문에 영향을 주지 않는다 | 확정 | 05 §6, VISIT_LOCAL_D결정 "방문의 뜻" |
| V4-8 | **도서관 룩**: 도서관마다 프리셋 4종(`modern`·`warm`·`toffee`·`oxford`) 중 하나가 정해져 **방문 페이지와 그 피드에서 연 게시물 상세**가 그 룩(`getTheme(look)`)으로 보인다. 이어 읽기에서 다른 도서관 게시물을 열어도 **방문 중인 도서관의 룩을 유지**한다. 홈·검색·대출·내 정보는 룩과 무관(기본 룩) | 확정 | 02 VISIT-07 |
| V4-9 | 룩 배정 규칙(운영자는 `modern`만 지정, 나머지는 세 팔레트 자동, 주변 5km 중복 최소, 한 번 정하면 안 바뀜, 운영자 재배정)은 **D가 서버에서** 하고 B는 `#11` 응답의 `look`을 그대로 쓴다. `look`이 없거나 모르는 값이면 `warm` | 확정 / 모르는 값 처리 기본값(Claude) | 02 VISIT-07, `기능_배정.md` D "(M2) 도서관 룩 배정" |
| V4-10 | 룩별 색 대비 검수(본문 4.5:1)는 룩 토큰을 쓰는 모든 방문 페이지 글자에 적용한다 | 확정 | 계획 §2 VISIT-4 선행 "룩별 색 대비 검수" |
| V4-11 | **방문 기록 카드 북마크(C-46 D3)**: 피드의 공개 스탬프 카드(`kind="stamp"`)도 북마크 저장·해제(`#69 PUT/DELETE /stamps/{stamp_id}/bookmark`, 멱등, 재저장 시 `saved_at = now()`)할 수 있다. 비공개로 바뀌면 북마크 목록에서 숨기되 `stamp_bookmarks` 행은 유지해 다시 공개되면 원래 `saved_at` 순서로 복원한다(C-46 D4·D5). 내 정보 북마크 탭(`/me/bookmarks` `item_kind="stamp"`) 합치기는 A가 MY-3에서 연결한다 | 확정 (C-46 D3~D5, 2026-11-19 D) | C-46 D3~D5, MY-1 Y6 |

##### 열린 칸 (B가 기획·시안 작성 후 채울 결정 — 빈 칸만 채우고 행 추가 가능)

| # | 열린 칸 | D 추천(참고) | 채택 결정 | 상태 | 근거(명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| V4-O1 | 스탬프를 누른 뒤 공개 여부 고르는 모양(작은 창 두 버튼 / 토글) | 작은 창 `"나만 보기"`·`"피드에 남기기"` | | | |
| V4-O2 | 이미 찍은 날 버튼 모양·공개 여부 바꾸는 자리 | 찍힌 모양 유지 + 다시 누르면 같은 작은 창 | | | |
| V4-O3 | 공개 스탬프 카드 모양(도장 그림·날짜·닉네임·북마크 버튼 배치) | 도장 + `"<닉네임> · 다녀왔어요"` + 날짜 + 오른쪽 북마크 아이콘 | | | |
| V4-O4 | 비로그인으로 버튼을 눌렀을 때 | 로그인 안내 | | | |
| V4-O5 | 룩이 바뀌는 범위 세부(머리·피드 바탕·카드 곡률·책장 선반색) | 룩 토큰 전부 | | | |

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1`) | 인증 | 성공 상태 | 날짜 형식 | 목록 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /libraries/{library_id}/stamps/today` (#35, B) | 필수 | `200` | `stamped_on`: `YYYY-MM-DD`(서울) | — | N/A (읽기) |
| `PUT /libraries/{library_id}/stamps/today` (#36, B) | 필수 | `200` (처음 찍어도 `200`) | 위와 같음 | — | 멱등(V4-5): 행 하나, 마지막 `visibility` |
| `PUT /stamps/{stamp_id}/bookmark` · `DELETE /stamps/{stamp_id}/bookmark` (#69, B) | 필수 | `200` `{ "bookmarked": bool }` | — | — | 멱등(V4-11): 재저장 시 `saved_at = now()`, 없는·비공개 스탬프는 `PUT` `404 NOT_FOUND`, `DELETE`는 행 없어도 `200` |
| `GET /libraries/{library_id}/feed` (#32, VISIT-3) | 선택 | `200` | — | `kind="stamp"`를 더한다. 정렬 시각은 `created_at` | — |
| `GET /libraries/{library_id}` (#11, **D** M2-0-P3) | 없음 | `200` | — | `look` 필드 추가 | — |

앱 함수 (`mobile/src/features/local-feed/api.ts`):

- `fetchTodayStamp(libraryId: number, signal?: AbortSignal): Promise<TodayStamp>`
- `putTodayStamp(libraryId: number, visibility: "private" | "public"): Promise<TodayStamp>`
- `setStampBookmark(stampId: string, bookmarked: boolean): Promise<{ bookmarked: boolean }>`

부품·함수:

- `mobile/src/features/local-feed/StampButton.tsx`: `export function StampButton(props: { libraryId: number }): JSX.Element`
- `mobile/src/features/local-feed/StampCard.tsx`: `export function StampCard(props: { stamp: StampItem; width: number; onToggleBookmark?(stampId: string, next: boolean): void }): JSX.Element`
- `mobile/src/features/local-feed/useLibraryLook.ts`: `export function useLibraryLook(libraryId: number): Theme` — `#11` `look` → `getTheme(look)`. 방문 페이지가 연 상세에는 **방문 중인 도서관 id**를 넘긴다(V4-8)

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 응답(#35·#36) `TodayStamp` | `stamped` | `bool` | Y | N | 오늘 찍었는지 |
| `TodayStamp` | `stamp` | `MyStamp` | Y | Y | 안 찍었으면 `null` |
| `MyStamp` | `id` | `str (UUID)` | Y | N | |
| `MyStamp` | `stamped_on` | `str` | Y | N | 서울 날짜 |
| `MyStamp` | `visibility` | `"private" \| "public"` | Y | N | |
| 요청(#36) | `visibility` | `"private" \| "public"` | Y | N | 다른 값이면 `422`, `detail="visibility"` |
| `FeedItem` (`kind="stamp"`) | `stamp` | `StampItem` | Y | N | 공개 스탬프만 |
| `StampItem` | `id` | `str (UUID)` | Y | N | |
| `StampItem` | `library_id` | `int` | Y | N | |
| `StampItem` | `stamped_on` | `str` | Y | N | |
| `StampItem` | `author_nickname` | `str` | Y | N | V4-4 |
| `StampItem` | `published_at` | `str` | Y | N | 정렬용(`created_at`) |
| `StampItem` | `mine` | `bool` | Y | N | 응답에 `user_id` 없음 |
| `StampItem` | `my_bookmark` | `bool` | Y | N | 비로그인은 `false` (V4-11) |
| 응답(#69) | `bookmarked` | `bool` | Y | N | `PUT`: `true`, `DELETE`: `false` |
| 응답(#11) | `look` | `"modern" \| "warm" \| "toffee" \| "oxford"` | Y | Y | D M2-0-P3. `null`이면 `warm` |
| 화면 문구 | 스탬프 버튼 | — | — | — | `"다녀왔어요"` |
| 화면 문구 | 공개 여부 고르기 (`V4-O1`) | — | — | — | |
| 화면 문구 | 공개 스탬프 카드 (`V4-O3`) | — | — | — | |
| 화면 문구 | 비로그인 안내 (`V4-O4`) | — | — | — | |
| 화면 문구 | 찍기 실패 | — | — | — | |

#### C4. 플랫폼 분기 표

`N/A: 스탬프 버튼·카드·룩 토큰은 세 플랫폼 같은 View 코드다. 분기 없음.`

#### C5. 테이블

```sql
-- NNNN_visit_stamps.py
CREATE TABLE visit_stamps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id),
  library_id  bigint      NOT NULL REFERENCES libraries(id),
  stamped_on  date        NOT NULL,                       -- 서버 today_kst()만, 본문 값 받지 않음
  visibility  text        NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_stamps_user_library_day_key UNIQUE (user_id, library_id, stamped_on)
);
CREATE INDEX ix_visit_stamps_library_public
  ON visit_stamps (library_id, created_at DESC, id DESC) WHERE visibility = 'public';
ALTER TABLE visit_stamps ENABLE ROW LEVEL SECURITY;

CREATE TABLE stamp_bookmarks (
  user_id   uuid        NOT NULL REFERENCES users(id),
  stamp_id  uuid        NOT NULL REFERENCES visit_stamps(id) ON DELETE CASCADE,
  saved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stamp_id)
);
CREATE INDEX ix_stamp_bookmarks_user_saved
  ON stamp_bookmarks (user_id, saved_at DESC, stamp_id DESC);
ALTER TABLE stamp_bookmarks ENABLE ROW LEVEL SECURITY;
```

- `libraries.look`·운영자 재배정 기록은 D M2-0-P3이 만든다(이 Step은 읽기만).
- 탈퇴: 그 사용자의 스탬프 북마크(`stamp_bookmarks`)와 스탬프(`visit_stamps`)를 지운다(04 R12). D M2-0-P5.
- 방문 기록 카드 북마크(C-46 D3~D5, 2026-11-19 D 확정): `stamp_bookmarks` 표와 `#69`를 이 Step에서 만들고, 내 정보 북마크 탭(`/me/bookmarks` `item_kind="stamp"`) 합치기는 A MY-3에서 연결한다.

#### C6. 검증과 에러 처리

| 명세서 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 끊김 | 찍기·조회 실패 | `ApiCallError` | 버튼만 | 피드·책장 | 행 없음 또는 그대로 |
| 빈 결과 | 오늘 안 찍음 | `200` `stamped:false` | 버튼 기본 모양 | — | — |
| 연타 | 버튼 두 번·공개 두 번 바꿈 | `200` | 마지막 선택 | — | 행 하나(V4-5) |
| 비로그인 | 버튼 누름 | 앱은 부르지 않음. 직접 호출 `401 AUTH_REQUIRED` | V4-O4 | 전부 | 행 없음 |
| 입력 오류 | `visibility` 다른 값 | `422 VALIDATION_ERROR` / `visibility` | — | — | 행 그대로 |
| 도서관 없음 | 없는 `library_id` | `404 NOT_FOUND` | — | — | — |
| 비공개·없는 스탬프 북마크 | `#69` `PUT`에 없는 `stamp_id` 또는 `visibility='private'` | `404 NOT_FOUND` | 안내 | 카드 | 행 없음 |
| 날짜 경계 | 자정 직후 다시 들어옴 | `#35` `stamped:false` | 새 버튼 | 어제 스탬프 그대로 | 날짜별 행 |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D `core` M2-0-P3 | `#11` `look` | `TODO(연결): D` — `look` 없으면 `warm`(V4-9). 시험용 `{"id":101,"name":"정독도서관","look":"oxford"}` |
| B VISIT-3 | `#32` 혼합 피드·`FeedItemCard` | VISIT-3 머지 뒤 시작(선행) |
| A `my-collection` MY-3 | 내 스탬프 읽기(도서관 방문 모음 `#40`) + 내 정보 북마크 탭(`/me/bookmarks` `item_kind="stamp"`) 합치기 | N/A: MY-3이 `visit_stamps`·`stamp_bookmarks`와 `StampCard`를 읽는다(이 Step은 제공만) |
| D `core` M2-0-P5 | 탈퇴 때 스탬프 삭제 | N/A: D 작업 |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦 |
| :--- | :--- | :--- | :--- |
| 룩 토큰 | `mobile/src/theme/index.ts:81`, `tokens.ts:10,31,169` | `getTheme(look: LookPreset): Theme` | 있음 |
| 방문 페이지·상세 | `mobile/src/features/local-feed/VisitScreen.tsx`, `PostDetail.tsx` | — | 있음 |
| 서울 오늘 | `server/app/common.py:35` | `today_kst()` | 있음 |
| 혼합 피드 | `#32` | — | 앞으로 만듦(VISIT-3) |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 명세서 항목 |
| :--- | :--- | :--- | :--- |
| `VISIT-4-P1` 스탬프 서버 | `feat/local-feed-VISIT-4` | `server/migrations/versions/NNNN_visit_stamps.py`, `server/app/routers/stamps.py`, `server/app/routers/feed.py`(`#32`에 `stamp` 더하기만), `server/app/main.py`(`[local-feed-B]`), `server/tests/test_stamps.py` | V4-2~V4-7·V4-11, C6 |
| `VISIT-4-P2` 스탬프 버튼·카드 | 같은 브랜치 | `mobile/src/features/local-feed/StampButton.tsx`, `StampCard.tsx`, `FeedItemCard.tsx`, `VisitScreen.tsx`, `api.ts`, `__tests__/stamp.test.tsx` | V4-1·V4-3·V4-4·V4-11, V4-O1~V4-O4 |
| `VISIT-4-P3` 도서관 룩 | 같은 브랜치 | `mobile/src/features/local-feed/useLibraryLook.ts`, `VisitScreen.tsx`, `PostDetail.tsx`, `Bookshelf.tsx`, `__tests__/library-look.test.tsx` | V4-8~V4-10, V4-O5 |

##### 파트 머리말 — VISIT-4-P1 · P2 · P3 (공통)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `VISIT-4-P1` / `VISIT-4-P2` / `VISIT-4-P3` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | M2 D 기준선 |
| 4. 계약서 커밋 | |
| 5. 선행 태스크 | VISIT-3 머지. P3는 D `M2-0-P3` 머지 전이면 C7 가짜 값 |
| 6. 수정 허용 파일 | 위 표의 파트별 파일 |
| 7. 금지된 결정 | 홈·검색·대출·내 정보에 룩 적용 금지(V4-8). "인증" 문구·배지 금지(V4-6). 기기 방문 기록 쓰기 변경 금지(V4-7) |
| 8. 완료 조건 | 파트 표 항목 + P5 해당 시험 + 웹·Android, 룩 4종 대비 4.5:1 |
| 9. 검증 명령 | VISIT-3과 같음 |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 서버·앱 | 없음 | — | — |

#### P4. 핵심 흐름 골격

```python
# stamps.py — #36 오늘 스탬프 찍기·공개 바꾸기 (멱등)
async def put_today_stamp(library_id: int, body: StampIn, user: CurrentUser = Depends(get_current_user)):
    def tx(c):
        lock_active_user(c, user.id)
        ensure_library_exists(c, library_id)                 # 404 NOT_FOUND
        day = today_kst()                                    # 본문 날짜 받지 않음
        return c.execute(UPSERT_STAMP, {"uid": user.id, "lib": library_id, "day": day, "vis": body.visibility}).one()
        # INSERT ... ON CONFLICT (user_id, library_id, stamped_on) DO UPDATE SET visibility = EXCLUDED.visibility, updated_at = now()
    row = await run_db(engine, tx)
    return {"stamped": True, "stamp": my_stamp(row)}

# stamps.py — #69 공개 스탬프 북마크 저장·해제 (멱등, 재저장 시 saved_at = now())
async def put_stamp_bookmark(stamp_id: UUID, user: CurrentUser = Depends(get_current_user)):
    def tx(c):
        lock_active_user(c, user.id)
        ensure_public_stamp_exists(c, stamp_id)              # 없거나 visibility != 'public'이면 404 NOT_FOUND
        c.execute(UPSERT_STAMP_BOOKMARK, {"uid": user.id, "sid": stamp_id})
        # INSERT INTO stamp_bookmarks (user_id, stamp_id) VALUES (:uid, :sid)
        # ON CONFLICT (user_id, stamp_id) DO UPDATE SET saved_at = now()
    await run_db(engine, tx)
    return {"bookmarked": True}
```

```ts
// useLibraryLook.ts
export function useLibraryLook(libraryId: number): Theme {
  // #11 look → 알 수 없거나 null이면 "warm" (V4-9). 늦은 응답은 createLatestRunner로 버린다
  // 열린 칸 V4-O5: 룩이 바뀌는 범위를 세부 명세대로 채운다
}
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| VISIT-4-P1 | `stamp is one per user library seoul day` | 로그인 | `#36` 세 번(공개·비공개·공개) | `200` 세 번, 행 1개, 마지막 `public` | V4-5 |
| VISIT-4-P1 | `stamp date comes from server seoul today` | 시계 고정 23:59/00:01 KST | 찍기 | 날짜가 서울 기준, 본문 날짜 무시 | 날짜 경계 |
| VISIT-4-P1 | `private stamp never appears to others` | A 비공개 스탬프 | B·비로그인 `#32` | 스탬프 카드 없음 | 비공개 노출 |
| VISIT-4-P1 | `stamp endpoints require auth` | 비로그인 | `#35`·`#36` | `401`, 행 0 | 익명 쓰기 |
| VISIT-4-P1 | `stamp response has no user id` | — | `#32`·`#35` | `user_id` 키 없음 | 식별자 노출 |
| VISIT-4-P1 | `stamp bookmark requires public stamp and updates saved_at on resave` | 공개·비공개 스탬프 | `#69` `PUT` 두 번 / 비공개에 `PUT` / `DELETE` 두 번 | 공개 `PUT` 행 1개·두 번째에 `saved_at` 커짐, 비공개 `404`, `DELETE` 행 0·둘 다 `200` | V4-11·C-46 D3·D4 |
| VISIT-4-P2 | `stamp button press sets visibility once` | 로그인, 응답 지연 | 두 번 빠르게 | `putTodayStamp` 1번 | 연타 |
| VISIT-4-P2 | `stamp card bookmark toggle blocks rapid double tap` | 로그인, 응답 지연 | 카드 북마크 두 번 빠르게 | `setStampBookmark` 1번 | 연타 |
| VISIT-4-P2 | `stamp does not touch device visit record` | 기기 방문 기록 있음 | 찍기 | `localone:visits:v1` 무변경 | V4-7 |
| VISIT-4-P3 | `unknown or null look falls back to warm` | `look: null` / `"neon"` | 렌더 | `getTheme("warm")` 값 | V4-9 |
| VISIT-4-P3 | `continue reading keeps visiting library look` | 방문 101(oxford), 102 글 상세 | 이어 읽기로 102 글 열기 | 상세는 oxford 토큰 | V4-8 |
| VISIT-4-P3 | `all looks keep body text contrast` | 4룩 | 대비 계산 | 본문 4.5:1 이상 | V4-10 |

## LOCAL-3 독서 기록 템플릿 게시

- **담당 역할**: B (게시물 작성 화면 쪽). 독서 기록 원본·"게시물로 올리기" 버튼은 A `reading-log.md` READ-1 · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/LOCAL-3.md`, 시안 `specs/local-feed/세부/LOCAL-3_시안.html` (세부 기획 때 작성)
- **판**: 1차 D 기준선(M2 밑그림, 2026-11-19)
- **선행 설계**: 02 LOCAL-07·AC-PUBLISH, 04 R8("기록에서 올릴 때 공개용 필드만 옮긴다")·"독서 기록 0..1 : 0..1 게시물"(철회·숨김 후에도 기록 원본은 남음), 계획 §4 "템플릿·서체 확장(종류 추가)" 대기
- **작성자**: D (시니어)
- **상태**: **D 기준선 — 검토 전·구현 착수 불가.** 선행: READ-1 계약 발행
- **발행 본문 SHA**: 


### Pre-flight 5대 관문 (코드 레포 `main` `761b4a1` · `team` `b4220e9`)

| 관문 | 확인한 것 (`file:line`) | 이 계약서의 처리 (잠금 조건) | 미해결 / 후속 |
| :--- | :--- | :--- | :--- |
| ① 격리·권한·호환 | `server/app/auth.py:180`, A READ-1 C2(`#42`) | 기록을 불러오는 것은 본인만(`#42`가 남의 기록에 `404`). `POST /posts`에 `reading_log_id`를 보내면 서버가 그 기록의 주인이 토큰 사용자인지 확인, 아니면 `404 NOT_FOUND` | 없음 |
| ② 동시성·트랜잭션·외부 I/O | `server/migrations/versions/0004_posts.py:20-55`(`client_request_id` UNIQUE) | 기존 `#24` 멱등 규칙 그대로. 한 기록에 공개 게시물 하나(부분 UNIQUE) | 없음 |
| ③ 전제 실재성 | `0004_posts.py:37`(`image_kind IN ('photo','cover','color')`) | `reading_logs`는 **없음 → READ-1**. `posts.template`·`posts.reading_log_id`는 **없음 → 이 Step** | `미구현: READ-1` |
| ④ 담당·공유 파일 | `mobile/app/posts/new.tsx`, `mobile/src/features/local-feed/ComposeScreen.tsx`, `PostCard.tsx` | 작성 화면은 B. A는 기록 화면에서 `router.push({ pathname: "/posts/new", params: { fromLog: logId } })`만 한다 | 없음 |
| ⑤ 승인·확장 | 계획 §4(폰트·표지 사용 조건) | 템플릿 2종(`minimal`, `ink`)만. 외부 서체 사용 조건 확인 전까지는 서체 파일 추가 없이 기본 서체 기울임(`italic`)만 쓴다(2026-11-19 D 확정) | 서체 사용 조건(계획 §4) |

### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| L3-1 | 내 독서 기록을 **템플릿으로 꾸며 게시물로 올린다.** 템플릿은 `minimal`(미니멀)·`ink`(잉크 손글씨) 두 가지. `ink`는 외부 서체 사용 조건(계획 §4) 확인 전까지 서체 파일을 넣지 않고 기울임(`italic`) + 색 토큰으로 표현한다 | 확정 (2026-11-19 D) | 02 LOCAL-07 "미니멀, 잉크 손글씨 등", 계획 §4 |
| L3-2 | 기록에서 올릴 때 **공개용 필드만 옮긴다**: 책·좋았던 문장(또는 감상 일부)·도서관. 독서일·대출 연결·나머지 감상은 옮기지 않는다. 무엇을 옮길지 고르는 것은 사용자가 한다 | 확정(R8) / 고르는 칸 열린 칸 | 04 R8 |
| L3-3 | 템플릿 게시물은 `image_kind = "template"`, `image_value` = 템플릿 키. **이미지 파일을 만들지 않고** 앱이 템플릿 키 + `overlay_text`·`body`·`book`으로 카드를 그린다(사진 업로드·새 캡처 라이브러리 없음) | 확정 (2026-11-19 D) | 계획 §4 |
| L3-4 | 게시물은 기록과 독립이다. 게시물을 철회·숨김해도 **기록 원본은 남는다.** 기록을 지우면 게시물의 `reading_log_id`만 `NULL`이 되고 게시물은 그대로 | 확정(앞 문장) / 기록 삭제 처리 기본값(Claude) | 04 관계 표 |
| L3-5 | 한 기록에서 공개 게시물은 하나. 이미 공개된 게시물이 있으면 작성 화면 대신 그 게시물로 간다 | 확정(0..1 : 0..1) / 이동 기본값(Claude) | 04 관계 표 |
| L3-6 | 올리기 전에는 서버에 공개되지 않는다(초안은 기기). 올리기를 눌러야 공개된다 | 확정 | 02 LOCAL-01, 04 R8 |

##### 열린 칸 (B가 기획·시안 작성 후 채울 결정)

| # | 열린 칸 | D 추천(참고) | 채택 결정 | 상태 | 근거(명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L3-O1 | 템플릿 고르는 순서·미리보기 모양 | 기록 불러온 뒤 위에 미리보기, 아래 두 템플릿 썸네일 | | | |
| L3-O2 | 옮길 필드를 고르는 방법(체크 / 문장 직접 고치기) | 문장은 고칠 수 있게, 나머지는 체크 | | | |
| L3-O3 | 템플릿 두 가지의 색·글자 배치(토큰으로) | `minimal`: `paper` 바탕 + `type.title` / `ink`: `cream` 바탕 + 기울임 | | | |
| L3-O4 | 피드 카드에서 템플릿 게시물 높이·글자 크기 | 정사각 1:1 | | | |
| L3-O5 | 이미 올린 기록에서 다시 올리기를 눌렀을 때 안내 | `"이미 올린 기록이에요"` + 그 게시물로 | | | |

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1`) | 인증 | 성공 상태 | 날짜 형식 | 목록 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /posts` (#24, 기존 — 필드 추가) | 필수 | `201` / 같은 `client_request_id` `200` | — | — | 기존 멱등 |
| `GET /me/reading-logs/{log_id}` (#42, **A** READ-1) | 필수 | `200` | — | — | N/A |

- 앱: `mobile/src/features/local-feed/templates.ts` — `export type TemplateKey = "minimal" | "ink"; export function TemplateCard(props: { template: TemplateKey; overlayText: string | null; book: { title: string; author: string | null } | null; width: number }): JSX.Element`
- `PostCard`는 `image_kind === "template"`이면 `TemplateCard`로 그린다(나머지 종류는 그대로)
- `ComposeScreen`은 `params.fromLog`가 있으면 `#42`로 기록을 받아 템플릿 단계부터 연다

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 요청(#24) | `image_kind` | `"photo" \| "cover" \| "color" \| "template"` | Y | N | `"template"` 추가(L3-3) |
| 요청(#24) | `image_value` | `str` | Y | N | `template`이면 `"minimal"` 또는 `"ink"`, 다른 값이면 `422`, `detail="image_value"` |
| 요청(#24) | `reading_log_id` | `str (UUID)` | N | Y | 내 기록이 아니면 `404 NOT_FOUND`, 이미 공개 게시물이 있으면 `409 ALREADY_PUBLISHED` |
| 응답 `FeedPost`·`Post` | `image_kind` | 위와 같음 | Y | N | |
| 응답 `Post` | `from_reading_log` | `bool` | Y | N | 상세에 "독서 기록에서" 표시용. 기록 id는 주지 않는다 |
| 화면 문구 | 템플릿 이름 | — | — | — | `"미니멀"`, `"잉크 손글씨"` |
| 화면 문구 | 이미 올린 기록 (`L3-O5`) | — | — | — | |
| 화면 문구 | 기록 불러오기 실패 | — | — | — | |

#### C4. 플랫폼 분기 표

`N/A: 템플릿 카드는 View + Text로 그린다. 세 플랫폼 같은 코드.`

#### C5. 테이블

```sql
-- NNNN_posts_template_reading_log.py (READ-1의 reading_logs 마이그레이션 뒤)
ALTER TABLE posts DROP CONSTRAINT posts_image_kind_check;
ALTER TABLE posts ADD CONSTRAINT posts_image_kind_check CHECK (image_kind IN ('photo','cover','color','template'));
ALTER TABLE posts ADD COLUMN reading_log_id uuid NULL REFERENCES reading_logs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX ux_posts_reading_log_published ON posts (reading_log_id)
  WHERE reading_log_id IS NOT NULL AND status = 'published';
```

- `posts_image_value_check`(LOCAL-1)는 `template`일 때 `image_value IN ('minimal','ink')`를 더한다. 기존 세 종류 조건은 바꾸지 않는다.
- `ON DELETE SET NULL`은 05 R12의 `NO ACTION` 원칙의 예외로 확정됐다(2026-11-19 D 확정 — 기록 삭제가 게시물을 막지 않게, L3-4).

#### C6. 검증과 에러 처리

| 명세서 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 끊김 | 기록 불러오기·올리기 실패 | `ApiCallError` | | 고른 템플릿·고친 문장 | 게시물 없음 |
| 빈 결과 | 기록에 옮길 문장이 없음 | — (`N/A: 기기 내 처리`) | | | — |
| 연타 | 올리기 두 번 | `200` 같은 게시물 | 하나만 | — | 행 하나 |
| 비로그인 | 작성 화면 진입 | 기존 LOCAL-1 처리 | — | — | — |
| 타인 기록 | 남의 `reading_log_id` | `404 NOT_FOUND` | | | 게시물 없음 |
| 이미 공개됨 | 같은 기록 두 번째 게시물 | `409 ALREADY_PUBLISHED` | L3-O5 | | 게시물 하나 |
| 입력 오류 | 모르는 템플릿 키 | `422` / `image_value` | | | 없음 |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| A READ-1 | `#42` 기록 하나, `reading_logs` 표, 기록 화면의 "게시물로 올리기" 버튼 | `TODO(연결): A` — `{"id":"3f1c2b9e-0d4a-4c1e-9b7a-2a6f5e8d1c40","book":{"isbn13":"9788936434120","title":"소년이 온다","author":"한강","cover_url":null},"library":{"id":101,"name":"정독도서관"},"read_on":"2026-11-15","note":"오래 남는 책","quote":"마음에 남은 문장","loan_id":null,"published_post_id":null,"created_at":"2026-11-15T21:00:00+09:00","updated_at":"2026-11-15T21:00:00+09:00"}` |
| A MY-1 | 내 게시물 탭이 템플릿 게시물을 `PostCard`로 그림 | N/A: `PostCard`가 처리 |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦 |
| :--- | :--- | :--- | :--- |
| 게시물 표 | `server/migrations/versions/0004_posts.py:20-55` | `posts`, `posts_image_kind_check` | 있음 |
| 게시물 올리기 | `server/app/routers/posts.py` | `#24` | 있음 |
| 작성 화면 | `mobile/src/features/local-feed/ComposeScreen.tsx`, `mobile/app/posts/new.tsx` | — | 있음 |
| 독서 기록 | — | `reading_logs`, `#42` | 앞으로 만듦(READ-1) |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 명세서 항목 |
| :--- | :--- | :--- | :--- |
| `LOCAL-3-P1` 서버 | `feat/local-feed-LOCAL-3` | `server/migrations/versions/NNNN_posts_template_reading_log.py`, `server/app/routers/posts.py`, `server/app/routers/feed.py`(`from_reading_log`만), `server/tests/test_posts_template.py` | L3-3~L3-5, C6 |
| `LOCAL-3-P2` 앱 | 같은 브랜치 | `mobile/src/features/local-feed/templates.ts`, `ComposeScreen.tsx`, `PostCard.tsx`, `PostDetail.tsx`, `api.ts`, `__tests__/template-post.test.tsx` | L3-1·L3-2·L3-6, L3-O1~L3-O5 |

##### 파트 머리말 — LOCAL-3-P1 · P2 (공통)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `LOCAL-3-P1` / `LOCAL-3-P2` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | M2 D 기준선 |
| 4. 계약서 커밋 | |
| 5. 선행 태스크 | A `READ-1-P1`(`reading_logs`) 머지. 앱은 그 전이면 C7 가짜 값 |
| 6. 수정 허용 파일 | 위 표 |
| 7. 금지된 결정 | 서체 파일·캡처 라이브러리 추가 금지. 기록의 독서일·대출 연결을 게시물에 옮기지 않음(L3-2) |
| 8. 완료 조건 | 파트 표 항목 + P5 + 웹·Android |
| 9. 검증 명령 | VISIT-3과 같음 |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 앱 | 없음 | 템플릿은 View로 그림 | — |

#### P4. 핵심 흐름 골격

```python
# posts.py — #24에 기록 연결 확인을 더한다 (기존 멱등·잠금·EXIF 순서 그대로)
def check_reading_log(c, user_id, log_id):
    if log_id is None: return
    owner = c.execute(SELECT_LOG_OWNER, {"id": log_id}).scalar()
    if owner != user_id: raise ApiError(404, "NOT_FOUND", "찾을 수 없어요")    # 남의 기록·없는 기록 같은 응답
    if c.execute(SELECT_PUBLISHED_FROM_LOG, {"id": log_id}).first():
        raise ApiError(409, "ALREADY_PUBLISHED", "이미 올린 기록이에요")
# 트랜잭션 안: lock_active_user → (같은 client_request_id면 기존 행 200) → check_reading_log → insert
```

```ts
// ComposeScreen.tsx — fromLog가 있으면 기록을 불러와 템플릿 단계부터
// 열린 칸 L3-O1·L3-O2: 순서·옮길 필드 고르기를 세부 명세대로 채운다
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LOCAL-3-P1 | `template post with other users reading log is 404` | A 기록, B 토큰 | `#24` `reading_log_id`=A 기록 | `404 NOT_FOUND`, 게시물 0 | 남의 기록 공개 |
| LOCAL-3-P1 | `one published post per reading log` | 기록에서 올린 공개 게시물 | 같은 기록 다시 | `409 ALREADY_PUBLISHED`. 첫 글 철회 뒤 다시 올리면 `201` | 0..1 관계 |
| LOCAL-3-P1 | `deleting reading log keeps post` | 기록 → 게시물 | 기록 삭제(`#44`) | 게시물 `published` 그대로, `reading_log_id` `NULL` | L3-4 |
| LOCAL-3-P1 | `unknown template key is 422` | — | `image_value:"neon"` | `422`, `detail="image_value"` | 입력 검증 |
| LOCAL-3-P1 | `post response never exposes reading log id` | — | `#26`·`#27` | `reading_log_id` 키 없음, `from_reading_log` 불리언만 | 비공개 기록 식별자 노출 |
| LOCAL-3-P2 | `template post renders without image upload` | 템플릿 게시 | 올리기 | 업로드 `#23` 호출 0번, `#24` `image_kind:"template"` | L3-3 |
| LOCAL-3-P2 | `private fields are not copied by default` | 기록에 `read_on`·`loan_id` | 작성 화면 열기 | 요청 본문에 독서일·대출 정보 없음 | R8 |

## LOCAL-4 신고·운영자 숨김

- **담당 역할**: B (이용자의 **신고하기** 흐름: 게시물·방명록·모임·모임 댓글 메뉴의 "신고"와 신고 접수). **운영 화면·숨김 처리·운영 기록은 D** `core.md` M2-0-P2 · **대상 브랜치**: `main`
- **기준 명세서**: `specs/local-feed/세부/LOCAL-4.md`, 시안 `specs/local-feed/세부/LOCAL-4_시안.html` (세부 기획 때 작성)
- **판**: 1차 D 기준선(M2 밑그림, 2026-11-19)
- **선행 설계**: 02 LOCAL-08·AC-MOD, 04 "신고"(신고자 비공개, 운영자만 처리, 대상은 게시물·방명록 글·모임 글)·R10, 계획 §3 M2 "신고 처리를 검수한 뒤 공개 커뮤니티를 연다", `기능_배정.md` 계획 §2 LOCAL "운영자 기능 D"
- **작성자**: D (시니어)
- **상태**: **D 기준선 — 검토 전·구현 착수 불가.**
- **발행 본문 SHA**: 


### Pre-flight 5대 관문 (코드 레포 `main` `761b4a1` · `team` `b4220e9`)

| 관문 | 확인한 것 (`file:line`) | 이 계약서의 처리 (잠금 조건) | 미해결 / 후속 |
| :--- | :--- | :--- | :--- |
| ① 격리·권한·호환 | `server/app/auth.py:180`, `0004_posts.py:44`(`status` `hidden` 이미 있음) | 신고는 필수 인증. 신고자는 운영자 외 누구에게도 보이지 않는다(작성자에게도). 응답에 신고 수·신고자 없음. 숨김·복구는 D 운영 경로만 | 없음 |
| ② 동시성·트랜잭션·외부 I/O | `server/app/db.py:16` | 같은 사람이 같은 대상을 두 번 신고해도 한 건(UNIQUE). 쓰기 트랜잭션 안 `lock_active_user` | 없음 |
| ③ 전제 실재성 | `posts.status`(있음), `guestbook_entries`(VISIT-3), `clubs`·`club_comments`(CLUB-1) | `reports`는 **D가 `0012_m2_targets.py`로 먼저 만듦(2026-11-19, core M2-0-P2) → 이 Step은 열린 제약만**. 운영 처리 표 `moderation_actions`·`operators`는 D M2-0-P2 | `미구현: M2-0-P2, CLUB-1` |
| ④ 담당·공유 파일 | `mobile/src/features/local-feed/PostMenu.tsx`(B), CLUB 메뉴(B) | B는 자기 화면 메뉴에 "신고"를 더한다. 신고 시트는 `ReportSheet` 하나를 함께 쓴다 | 없음 |
| ⑤ 승인·확장 | 05 §10, 04 "신고" | 새 표 `reports`, 경로 `#37` 확정해 05·06 반영(2026-11-19 D 확정) | 없음 |

### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| L4-1 | 신고 대상은 **게시물·방명록 글·모임(글)·모임 댓글** 네 가지(`post`·`guestbook`·`club`·`club_comment`) | 확정(앞 셋) / 모임 댓글 포함 기본값(Claude) | 02 LOCAL-08, 04 "신고" |
| L4-2 | 신고자는 비공개다. 작성자·다른 이용자에게 누가·몇 명이 신고했는지 보이지 않는다 | 확정 | 04 "신고자 비공개" |
| L4-3 | 신고만으로 글이 숨겨지지 않는다. **운영자가 숨긴다**(D 운영 화면). 숨긴 글은 `status = 'hidden'`으로 목록·직접 주소 어디에도 안 나온다 | 확정 | 02 LOCAL-08, 04 R10 |
| L4-4 | 운영 처리 사유·행위는 기록한다. 타인의 비공개 데이터(독서 기록·대출·스탬프 비공개·북마크)는 운영 화면에 나오지 않는다 | 확정 | 02 LOCAL-08 |
| L4-5 | 같은 사람이 같은 대상을 다시 신고하면 새 건을 만들지 않고 `200` + 같은 신고(사유는 처음 것) | 기본값(Claude) | 연타·재시도 |
| L4-6 | 내 글은 신고 메뉴가 없다 | 기본값(Claude) | — |
| L4-7 | 숨김 처리 결과는 작성자에게 알림함으로 알린다(운영 처리 안내) | 확정(알림함 대상) / 문구 열린 칸 | 04 R19 |
| L4-8 | 모임 댓글의 "만든 사람 요청 → 관리자 승인" 흐름(C-46 B1~B6)은 CLUB이 맡는다. 이 Step의 신고는 그와 별개인 이용자 신고다 | 확정(구분) | C-46 B, 04 "모임 댓글 운영 요청" |

##### 열린 칸 (B가 기획·시안 작성 후 채울 결정)

| # | 열린 칸 | D 추천(참고) | 채택 결정 | 상태 | 근거(명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L4-O1 | 신고 사유 목록(코드·문구·개수) | `spam` 광고·도배 / `abuse` 욕설·괴롭힘 / `privacy` 개인정보 / `other` 기타(글 입력) | | | |
| L4-O2 | 신고 입구(카드 메뉴 / 상세 `⋯`) | 둘 다 | | | |
| L4-O3 | 신고한 뒤 화면(그 글을 내 화면에서 바로 가릴지) | 내 화면에서만 흐리게 + `"신고했어요"` | | | |
| L4-O4 | "기타" 사유 글 길이 상한 | 200 | | | |
| L4-O5 | 숨김 안내 알림 문구(알림함) | `"운영 정책에 따라 글이 숨겨졌어요"` | | | |

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1`) | 인증 | 성공 상태 | 날짜 형식 | 목록 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /reports` (#37, B) | 필수 | `201` 새 신고 / `200` 이미 신고함 | — | — | 멱등(L4-5) |
| 운영 화면 경로 `/ops/*` (**D** M2-0-P2) | 운영자 | — | — | — | — |

- 앱: `mobile/src/features/local-feed/api.ts` `reportTarget(target: { kind: ReportKind; id: string }, reason: ReportReason, text: string | null): Promise<void>`; `type ReportKind = "post" | "guestbook" | "club" | "club_comment"`
- 부품: `mobile/src/features/local-feed/ReportSheet.tsx` `export function ReportSheet(props: { target: { kind: ReportKind; id: string }; onClose(): void; onDone(): void }): JSX.Element` — CLUB 화면도 이 부품을 쓴다

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 요청(#37) | `target_kind` | `ReportKind` | Y | N | 다른 값 `422`, `detail="target_kind"` |
| 요청(#37) | `target_id` | `str (UUID)` | Y | N | 없거나 이미 숨김·철회면 `404 NOT_FOUND` |
| 요청(#37) | `reason` | `str` (L4-O1의 코드) | Y | N | 목록 밖 `422`, `detail="reason"` |
| 요청(#37) | `text` | `str` | N | Y | `reason="other"`일 때만. 길이 L4-O4 |
| 응답(#37) | `ok` | `bool` | Y | N | 신고 id·처리 상태는 주지 않는다 |
| 화면 문구 | 메뉴 항목 | — | — | — | `"신고하기"` |
| 화면 문구 | 사유 목록 (`L4-O1`) | — | — | — | |
| 화면 문구 | 신고 완료 (`L4-O3`) | — | — | — | |
| 화면 문구 | 신고 실패 | — | — | — | |

#### C4. 플랫폼 분기 표

`N/A: 신고 시트는 공통 View 코드. 분기 없음.`

#### C5. 테이블

```sql
-- 0012_m2_targets.py (D 선행 생성, core M2-0-P2). B는 NNNN_reports_constraints.py에서 열린 제약만 ALTER
CREATE TABLE reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid        NOT NULL REFERENCES users(id),
  target_kind  text        NOT NULL CHECK (target_kind IN ('post','guestbook','club','club_comment')),
  target_id    uuid        NOT NULL,                      -- 대상 표가 종류마다 달라 FK 없음, 서버가 존재 확인
  reason       text        NOT NULL,
  text         text        NULL,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_once_per_target UNIQUE (reporter_id, target_kind, target_id)
);
CREATE INDEX ix_reports_open ON reports (created_at) WHERE status = 'open';
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
```

| 열린 제약 | 컬럼 | 값 (B 채움) |
| :--- | :--- | :--- |
| `reports_reason_check` | `reason` 코드 목록 | |
| `reports_text_len_check` | `text` 길이 | |

- `status` 변경과 숨김(`posts`·`guestbook_entries`·`clubs`·`club_comments`의 `hidden`)·운영 기록은 D M2-0-P2만 쓴다.
- 탈퇴: 신고자 행은 `reporter_id`를 남긴 채 둔다(운영 기록). 보관 기간은 Q-23(출시 관문).

#### C6. 검증과 에러 처리

| 명세서 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 끊김 | 신고 실패 | `ApiCallError` | 시트 안 실패 문구 | 고른 사유 | 행 없음 또는 그대로 |
| 빈 결과 | N/A: 목록 없음 | — | — | — | — |
| 연타 | 두 번 신고 | `200` | 완료 같음 | — | 행 하나 |
| 비로그인 | 신고 누름 | 앱은 부르지 않음. 직접 호출 `401` | 로그인 안내 | 전부 | 행 없음 |
| 대상 없음 | 없는·숨김·철회 대상 | `404 NOT_FOUND` | | | 행 없음 |
| 내 글 | 내 글 신고(직접 호출) | `422 VALIDATION_ERROR` / `target_id` | N/A: 메뉴 없음(L4-6) | | 행 없음 |
| 입력 오류 | 모르는 종류·사유, 긴 글 | `422` / 필드명 | | | 행 없음 |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D `core` M2-0-P2 | 운영 화면·숨김·`reports.status` 처리·작성자 알림 | N/A: D 작업. 이 Step 시험은 `reports` 행만 확인 |
| B VISIT-3 | `guestbook_entries` | VISIT-3 머지 뒤 방명록 신고를 켠다 |
| B CLUB-1 | `clubs`·`club_comments`와 그 메뉴 | CLUB-1 머지 전에는 `club`·`club_comment` 메뉴를 그리지 않는다(서버는 존재 확인에서 `404`) |
| D `core` M2-0-P1 | 알림함 쓰기 | N/A: D 운영 처리가 쓴다 |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦 |
| :--- | :--- | :--- | :--- |
| 게시물 상태 | `server/migrations/versions/0004_posts.py:44` | `status IN ('published','withdrawn','hidden')` | 있음 |
| 카드 메뉴 | `mobile/src/features/local-feed/PostMenu.tsx` | `PostMenuProps` | 있음 |
| 운영 처리 | — | `/ops/*` | 앞으로 만듦(D M2-0-P2) |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 명세서 항목 |
| :--- | :--- | :--- | :--- |
| `LOCAL-4-P1` 신고 서버 | `feat/local-feed-LOCAL-4` | `server/migrations/versions/NNNN_reports_constraints.py`(**표는 D가 먼저 만듦(`0012_m2_targets.py`, core M2-0-P2, 2026-11-19 D 결정) — B 마이그레이션은 아래 열린 제약 ALTER만**), `server/app/routers/reports.py`, `server/app/main.py`(`[local-feed-B]`), `server/tests/test_reports.py` | L4-1·L4-2·L4-5·L4-6, C6 |
| `LOCAL-4-P2` 신고 시트·메뉴 | 같은 브랜치 | `mobile/src/features/local-feed/ReportSheet.tsx`, `PostMenu.tsx`(항목 하나 추가, 기존 props 무변경), `GuestbookCard.tsx`, `PostDetail.tsx`, `api.ts`, `__tests__/report.test.tsx` | L4-O1~L4-O4 |

##### 파트 머리말 — LOCAL-4-P1 · P2 (공통)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `LOCAL-4-P1` / `LOCAL-4-P2` |
| 2. 담당 역할 | B |
| 3. 기준선 버전 | M2 D 기준선 |
| 4. 계약서 커밋 | |
| 5. 선행 태스크 | VISIT-3 머지. CLUB-1 전이면 모임 신고 메뉴 없음 |
| 6. 수정 허용 파일 | 위 표 |
| 7. 금지된 결정 | 신고 수 자동 숨김 금지(L4-3). 신고자·신고 수 노출 금지(L4-2). `PostMenu` 기존 props·문구 변경 금지 |
| 8. 완료 조건 | 파트 표 항목 + P5 + 웹·Android |
| 9. 검증 명령 | VISIT-3과 같음 |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 서버·앱 | 없음 | — | — |

#### P4. 핵심 흐름 골격

```python
# reports.py — #37
async def create_report(body: ReportIn, user: CurrentUser = Depends(get_current_user)):
    # 열린 칸 L4-O1·L4-O4: reason 코드 목록·text 길이 검사를 여기에 둔다 → 422
    def tx(c):
        lock_active_user(c, user.id)
        author = select_visible_author(c, body.target_kind, body.target_id)   # published만. 없으면 404 NOT_FOUND
        if author == user.id: raise ApiError(422, "VALIDATION_ERROR", "내 글은 신고할 수 없어요", "target_id")
        inserted = c.execute(INSERT_REPORT_ON_CONFLICT_DO_NOTHING, {...}).rowcount
        return inserted == 1
    created = await run_db(engine, tx)
    return JSONResponse({"ok": True}, status_code=201 if created else 200)
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LOCAL-4-P1 | `report is once per reporter and target` | B가 A 글 신고 | 두 번 | `201` 뒤 `200`, 행 1 | L4-5 |
| LOCAL-4-P1 | `report never hides target by itself` | 신고 10건 | `#26`·`#27` | 글 그대로 보임 | L4-3 |
| LOCAL-4-P1 | `report response and target views expose no reporter` | 신고 있음 | `#37`·`#27` | 신고자·신고 수 키 없음 | L4-2 |
| LOCAL-4-P1 | `report on hidden or missing target is 404` | 숨김 글 / 없는 id | `#37` | `404`, 행 0 | 대상 확인 |
| LOCAL-4-P1 | `report requires auth` | 비로그인 | `#37` | `401`, 행 0 | 익명 신고 |
| LOCAL-4-P2 | `own post has no report menu` | 내 글 | 메뉴 열기 | `"신고하기"` 없음 | L4-6 |
| LOCAL-4-P2 | `report sheet sends once` | 응답 지연 | 보내기 두 번 | `reportTarget` 1번 | 연타 |
