# 내 정보 모음 (`my-collection`) 기술 계약서

> 이 파일은 A의 내 정보 모음(`my-collection`, 하단 `"내 정보"` 탭 `/me`, 실제 파일 `mobile/app/(tabs)/me.tsx` — 요청서 표기 `my.tsx`의 현행 구현 경로) 계약서다. Step은 **MY-1**(상단 프로필 + 3탭: 내 게시물 / 좋아요 / 북마크 조회)부터 시작한다.
> 상태: **1차 계약서 — D 기준선(2026-11-17, 검토 전·구현 착수 불가).** 큰 틀·세부 명세(`specs/my-collection/명세서.md`) 및 시안 작성 전 단계다. D가 정한 경로·인증·DTO 스키마·오류 코드·테이블 전제·담당 파일·가짜 값·파트를 먼저 고정(**잠금 칸**)하고, 화면 배치·문구·빈 상태·상호작용 세부(**열린 칸**)를 명시한다. A의 AI는 `../team/prompts/2_계약_보완.md`에 따라 기획(명세서 + 시안)과 함께 열린 칸을 채운 계약 수정본 PR을 제출하고, D가 양쪽을 함께 검토·승인한 뒤 발행한다.
> 공통 함수·인증·하단 탭 틀은 [`core.md`](core.md) · [`auth.md`](auth.md), 피드 카드(`PostCard`)와 `FeedPost`·`posts`·`post_reactions`·`post_bookmarks` 원본은 [`local-feed.md`](local-feed.md)다.

## Pre-flight 5대 관문 (코드 레포 `origin/main` `cb25785` · `team` `af21532`)

| 관문 | 확인한 것 (`file:line`) | 이 계약서의 처리 (잠금 조건) | 미해결 / 후속 |
| :--- | :--- | :--- | :--- |
| ① 격리·권한·호환 | `server/app/auth.py:132-146`(`lock_active_user`), `:163-173`(`nickname_of`), `:176-184`(`get_current_user`), `server/app/common.py:11-23`(`ApiError`·`error_response`), `server/app/main.py:89-92`(422 쉼표 `detail`), `server/migrations/versions/0001_users.py:41`·`0003_user_profiles.py:13-24`(`user_profiles` RLS 활성·정책 0개) | 4개 엔드포인트 모두 필수 인증(`Depends(get_current_user)`). 요청 쿼리·경로의 `user_id` 미수신·무시, 모든 SQL에 `user_id = :uid` 본인 소유만 조회. 좋아요·북마크 비공개, 팔로워 수/목록·타인 프로필 노출 금지(C-46 F1·F2). `user_profiles` RLS 유지·정책 0개 | `05`·`06`은 M1 동결이라 본 기능이 M2/C-46 확장으로 4개 `/me/*` 경로와 `user_profiles` 2컬럼(`bio`, `avatar_url`)을 선행 고정 |
| ② 동시성·트랜잭션·외부 I/O | `server/app/db.py:16-28`(`run_db`), `mobile/src/lib/latest.ts:6-25`(`createLatestRunner`), `mobile/src/auth/apiFetch.ts:72-116`(`apiFetch`), `mobile/src/auth/AuthProvider.tsx:253-259`(`useAuth`) | MY-1 서버 4개 `GET`은 읽기 전용(`run_db` 내 읽기, 외부 I/O 없음). 목록은 `(정렬 시각 DESC, post_id DESC)` 복합 커서로 동률 중복·누락 차단(`H-ARCH-10`). 앱은 프로필용·탭 목록용 `createLatestRunner` 2개로 탭 전환·새로고침·`userId` 변경 경합 폐기(`AC-RACE`) | `registerSignOutCleanup`은 `AUTH-2` 미구현(`TODO(연결): D(AUTH-2)`). 프로필 편집 쓰기(`lock_active_user`·EXIF)는 후속 Step(`MY-2`) |
| ③ 전제 실재성 | `origin/main` `cb25785` 확인: `server/app/auth.py:163-227`, `0003_user_profiles.py:13-24`(`user_id`, `nickname`, `updated_at`만 있음), `mobile/app/(tabs)/_layout.tsx:18-21`(`index`·`loans`·`me`), `mobile/app/(tabs)/me.tsx:1-69`(스텁), `mobile/src/__tests__/routes.test.tsx:23-27,149-163`, `mobile/src/theme/tokens.ts:31-143`, `mobile/src/features/library-visit/__fakes__/PostCard.tsx:9-46` | **`mobile/app/(tabs)/my.tsx`는 존재하지 않으며 현행 실제 파일은 `mobile/app/(tabs)/me.tsx`**(`/me`, `"내 정보"`). `MY-1-P2`는 `me.tsx`를 교체한다. `posts`·`post_reactions`·`post_bookmarks`·`PostCard`는 B `LOCAL-1`(#126 OPEN)·`LOCAL-2` 머지 전 C7 가짜 값/가짜 카드 + `TODO(연결): B` | `user_profiles`의 `bio`·`avatar_url`은 `MY-1-P1` 마이그레이션으로 추가 |
| ④ 담당·공유 파일 충돌 | `mobile/app/(tabs)/_layout.tsx:18-21`(D 소유, 3탭 고정), `mobile/app/(tabs)/me.tsx:1`(기존 `TODO(연결): D(AUTH-2)` 스텁), `mobile/src/__tests__/routes.test.tsx:149-163`(`MeTabScreen` 스텁 단언), `server/app/main.py:50-58,99-111` | `_layout.tsx` 수정 금지(탭 이름 `"me"`/`"내 정보"` 유지). `me.tsx`는 `MY-1-P2`에서 A가 교체. `routes.test.tsx`는 `HomeScreen`과 동일하게 `MyCollectionScreen` mock으로 정합 유지. `main.py`는 `# ── [my-collection-A] ──` 블록만 사용. Step 1개 = 브랜치 `feat/my-collection-MY-1` = PR 1개 | `AUTH-2` 로그아웃·설정 진입 자리는 C7 및 열린 칸(Y-O1)에서 조율 |
| ⑤ 승인·확장 게이트 | 근거: `../team/기능_배정.md` A(F4), `개발산출물/명세/SNS_검색_프로필_상세결정.md` C-46 F1·F2·F4·D3·D4·D5·§8-5, GitHub Issue #130 | C-46 §8-5 팔로우 대상·효과 미결이므로 `MY-1`에는 팔로우 테이블·API·타인 프로필을 열지 않음. C-46 D3 방문 기록 카드 북마크는 `VISIT-4` 전까지 `item_kind: "post"`만 수용(`TODO(연결): VISIT-4`). 새 라이브러리 없음 | 기획(명세서+시안)과 열린 칸 계약 수정본 동시 PR 제출 후 D 승인·발행 필요 |

---

## MY-1 내 정보 모음 (상단 프로필 · 3탭: 내 게시물 / 좋아요 / 북마크)

- **담당 역할**: A (서버 파트 포함) · **대상 브랜치**: `main`
- **기준 명세서**: 미작성 — A가 `spec/my-collection` 브랜치에서 `specs/my-collection/명세서.md` 및 시안(`specs/my-collection/시안.html` 또는 `specs/my-collection/세부/MY-1.md`·`MY-1_시안.html`) 작성 예정 (Issue #130)
- **판**: **1차 계약서 — D 기준선(2026-11-17, 검토 전·구현 착수 불가)**
- **기준선**: `B2` 이후 M2/C-46 확장 — D 1차 기준선
- **선행 설계**: `../team/기능_배정.md` A절(M2 배정안, F4), `개발산출물/명세/SNS_검색_프로필_상세결정.md` C-46(F1·F2·F4·D3·D4·D5), `local-feed.md` LOCAL-1/LOCAL-2 C3·C5, `05 §3.1 user_profiles`, `06 §3` 공통 오류 코드
- **작성자**: D (시니어)
- **상태**: **D 기준선 발행 — A 기획 PR + 열린 칸 계약 수정본 PR 동시 제출 대기(구현 착수 불가).**
- **발행 본문 SHA**: `발행 뒤 기입`


### 계약

#### C1. 결정

##### 잠금 결정 (D 기준선 고정 — A는 변경 불가)

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| Y1 | **화면 골격과 3탭 순서 · 기본 탭**: 하단 `"내 정보"` 탭(`/me`, 실제 파일 `mobile/app/(tabs)/me.tsx`)은 **상단 프로필 영역 + 하단 3탭(`내 게시물` / `좋아요` / `북마크`)**으로 구성한다. 최초 진입 시 기본 선택 탭은 **`내 게시물`**이다 | 확정 (C-46 F2) | `SNS_검색_프로필_상세결정.md` F2, `기능_배정.md` A절 |
| Y2 | **소유권 격리 · 비공개 원칙**: 4개 엔드포인트(`GET /api/v1/me/profile`, `/me/posts`, `/me/reactions`, `/me/bookmarks`)는 모두 **필수 인증(`get_current_user`)**이며 토큰의 `user.id` 본인 데이터만 조회한다. 요청에 타인 `user_id`를 받지 않으며 보내도 무시한다. **좋아요·북마크 탭은 본인만 조회하는 비공개 수집 탭**이며 타인의 모음·팔로워 수·팔로워 목록을 노출하지 않는다 | 확정 (C-46 F1·F2) | `PROJECT.md` §3-4, `SNS_검색_프로필_상세결정.md` F1·F2·§4, `05 §4` |
| Y3 | **탭별 필터 · 정렬 · 재공개 복원 · 커서 규격**: ① `내 게시물`: `p.user_id = :uid AND p.status = 'published'`만 **`p.published_at DESC, p.id DESC`**(철회·숨김 제외). ② `좋아요`: `post_reactions`와 `posts` 조인 중 **`p.status = 'published'`**인 글만 **`pr.created_at DESC, p.id DESC`**(최근 좋아요순). ③ `북마크`: `post_bookmarks`와 `posts` 조인 중 **`p.status = 'published'`**인 글만 **`pb.saved_at DESC, p.id DESC`**(최근 저장순, 해제 후 재저장 시 `saved_at` 갱신으로 맨 앞). 철회·운영 숨김된 게시물은 목록에서 자리표시 없이 숨기되 연결 행(`post_reactions`·`post_bookmarks`)은 유지해 재공개 시 원래 시각 순서로 복원한다(C-46 D5). 커서는 `(정렬 시각 ISO, post_id UUID)` base64url JSON, `limit` 기본 20(1~50) | 확정 (C-46 D4·D5) / 커서·limit 기본값(Claude) | `SNS_검색_프로필_상세결정.md` D4·D5, `local-feed.md` H2·H6, `H-ARCH-10` |
| Y4 | **B의 `PostCard` 재사용 및 `TODO(연결)` 규칙**: 3탭 모두 피드 목록은 2열 메이슨리(`columnGap` 12, 좌우 패딩 12)에 **B의 `PostCard`(`mobile/src/features/local-feed/PostCard.tsx`, props `{ post: FeedPost; onPress(postId); onMenu?(post); width }`)를 그대로 재사용**한다(카드를 새로 디자인하지 않음). 카드를 누르면 `/posts/[postId]`(게시물 상세)로 이동한다. B의 `LOCAL-2`(`PostCard.tsx`, `#26~#30`) 및 서버 `MY-1-P1` 머지 전에는 C7 가짜 카드·가짜 데이터 + `// TODO(연결): B LOCAL-2` / `// TODO(연결): A MY-1-P1`을 달고 구현한다 | 확정 (C-61, H4·H12) | `local-feed.md` H4·H12·C2, `CLAUDE.md` 10절, Issue #130 |
| Y5 | **상단 프로필 정보와 팔로우 경계**: 상단 프로필은 `avatar_url`(없으면 기본 아바타), `nickname`(`user_profiles.nickname`), `bio`(한 줄 소개, `null` 가능), `"프로필 수정"` 버튼 자리를 둔다. **`팔로워 수`·`팔로워/팔로잉 목록`은 만들지 않는다**(C-46 F1). 팔로우 버튼의 대상·효과(글 모아 보기·알림)는 C-46 §8-5 미결이므로 **`MY-1`에서는 본인 `/me` 상단에 팔로우 버튼을 두지 않고** 팔로우 테이블·API는 후속 Step(`MY-2` 또는 타인 프로필)으로 분리한다 | 확정 (C-46 F1) / `MY-1` 범위 분리 기본값(Claude) | `SNS_검색_프로필_상세결정.md` F1·§8-5, `02 §3` |
| Y6 | **D3 방문 기록 카드 북마크 연계 경계**: C-46 D3("방문 기록 카드도 북마크 대상에 포함")을 수용할 수 있도록 C3 `MyCollectionPost`에 `item_kind: "post"` 필드를 고정한다. 단 `VISIT-4`가 아직 없으므로 `MY-1`에서는 `posts`만 조회하고 방문 기록 가짜 테이블·더미 카드를 만들지 않는다(`TODO(연결): VISIT-4 D3`) | 확정 (C-46 D3) / 경계 기본값(Claude) | `SNS_검색_프로필_상세결정.md` D3, `05 §3.2` |
| Y7 | **비로그인 처리 · 계정 전환 · 로그아웃 정화**: 비로그인(`status === "signedOut"`)에서는 `/me/profile`, `/me/posts`, `/me/reactions`, `/me/bookmarks`를 **호출하지 않고** 로그인 안내만 보인다. `userId`가 바뀌거나 로그아웃되면 진행 중인 `createLatestRunner` 요청을 모두 취소하고 이전 계정의 프로필·3탭 목록 상태를 즉시 비운다(`registerSignOutCleanup`은 `AUTH-2` 머지 전 `TODO(연결): D(AUTH-2)`) | 확정 (NFR-01, AUTH-02) | `SNS_검색_프로필_개정.md` §3, `core.md` APP-0 C2 |
| Y8 | **색·곡률 토큰 및 공통 코드 원칙**: 모든 색·곡률은 `mobile/src/theme/tokens.ts`의 `theme.colors.*`·`theme.radii.*`만 사용한다(화면 파일 내 `#RRGGBB`·`rgb(`·숫자 곡률 하드코딩 금지). 기능 코드에 `Platform.OS`·`*.ios.tsx`·`*.android.tsx`·`*.web.tsx`를 두지 않는다 | 확정 (`PROJECT.md` §3-11·14) | `mobile/src/theme/tokens.ts`, `DEF-019` |

##### 열린 칸 (A가 기획·시안 작성 후 `2_계약_보완.md`로 채울 결정 — 아래 빈 칸만 채우고 행 추가 가능)

| # | 열린 항목 (A 결정 대상) | 결정 내용 (A 채움) | 상태 (A 채움) | 근거 (A 채움) |
| :--- | :--- | :--- | :--- | :--- |
| Y-O1 | **상단 프로필 배치·요소 상세**: 아바타 크기/모양, 닉네임·한 줄 소개(`bio === null`일 때 숨김 또는 안내 문구), `"프로필 수정"` 버튼 위치·눌렀을 때(`MY-2` 전 `"준비 중이에요"` 안내 등), 기존 `me.tsx`의 로그인/로그아웃·설정 자리와의 배치 | **왼쪽 사진 + 옆에 이름(시안 `#el-1` 후보 A 채택)**: 머리줄 왼쪽 `"내 정보"` 제목, 오른쪽 설정 `⚙` 버튼(30×30, 누르면 설정·로그아웃 자리 — `AUTH-2` 전 `TODO(연결): D(AUTH-2)`, 연결 전에는 눌러도 아무 화면도 열지 않는다). 그 아래 프로필 행: 원형 아바타 64(`avatar_url === null`이면 `theme.colors.surface3` 원 + 사람 아이콘) 왼쪽, 오른쪽 세로로 `nickname`(17, 굵게) → `bio`(13, `theme.colors.textSub`) → `"프로필 수정"` 테두리 버튼(`theme.radii.control`). `bio === null`이면 소개 줄을 숨긴다(안내 문구 없음). `"프로필 수정"`을 누르면 `MY-2` 전까지 화면 아래 짧은 안내 `"프로필 수정은 곧 열려요"` 2초(화면 이동 없음, API 호출 없음). 아래로 내리면 프로필 행은 위로 스크롤되어 사라지고 3탭 바가 맨 위에 붙는다(Y-O2) | 확인 (사용자 A, 2026-11-18) / `bio` 숨김·수정 안내·`⚙` 자리 기본값(Claude) | `specs/my-collection/세부/MY-1.md` 결정 1, 시안 `specs/my-collection/세부/MY-1_시안.html` `#el-1` |
| Y-O2 | **3탭 전환 바 모양 · 스크롤 · 탭 재조회 정책**: 탭 바 스타일(밑줄/알약 등), 탭 전환 시 이미 불러온 탭 캐시 유지 vs 전환마다 재조회 여부(단, 늦은 응답은 `createLatestRunner` 필수) | **글자 + 밑줄형 탭 바**: 3칸 균등, 글자 14, 선택 탭은 굵게 + 아래 2 두께 `theme.colors.inkStrong` 밑줄, 바 아래 1 두께 `theme.colors.divider`. 탭 바는 프로필 아래에 있다가 내리면 화면 맨 위에 붙는다(sticky). **캐시**: 한 번 불러온 탭의 목록(`items`·`next_cursor`)은 같은 계정·같은 화면 수명 동안 기억해 다시 눌렀을 때 그대로 보이고 재조회하지 않는다. 화면을 아래로 당기면(당겨서 새로고침) 지금 탭과 프로필을 처음부터 다시 불러온다. 게시물 상세에서 돌아와 화면이 다시 보이면 지금 탭만 조용히 다시 불러온다(받기 전까지 기존 카드 유지). 모든 조회는 `listRunner`/`profileRunner`를 거쳐 늦은 응답을 버린다(M-#6) | 기본값(Claude) — 중심 아님(플로우·첫눈 불변), 세부 명세 검토 메모 `[Claude가 정함]` | `specs/my-collection/세부/MY-1.md` 0절 기본값, 시안 명세 패널 "탭 바 모양"·"탭 오갈 때" |
| Y-O3 | **각 탭 빈 상태(0건) 화면 구성**: ① `내 게시물` 0건 안내 문구·일러스트/아이콘·이동 버튼 ② `좋아요` 0건 안내 문구·이동 버튼 ③ `북마크` 0건 안내 문구·이동 버튼 (가짜 게시물 생성 금지) | **탭별 안내 + `"가까운 도서관 둘러보기"` 버튼(시안 `#el-3` 후보 A 채택, 화살표 없음)**: 프로필·탭 바는 그대로 두고 카드 자리 가운데에 원형 아이콘(56, `theme.colors.surface2`) → 굵은 안내 한 줄 → 보조 한 줄(`theme.colors.textSub`) → 채움 버튼(`theme.colors.inkStrong` 바탕, 글자색 `onFill(theme.colors.inkStrong)`, `theme.radii.control`). 아이콘·문구는 C3 열린 문구 행. 버튼은 세 탭 모두 `router.navigate("/")`(홈 탭)로 간다. 가짜 게시물·추천 게시물을 채우지 않는다 | 확인 (사용자 A, 2026-11-18) | `specs/my-collection/세부/MY-1.md` 결정 3·예외 #2, 시안 `#el-3` |
| Y-O4 | **3탭 카드 메뉴(`onMenu`) 및 좋아요·북마크 해제 반영**: 목록에서 `PostCard` 길게 누르기/웹 호버 메뉴 연결 시, 좋아요 탭에서 좋아요 취소하거나 북마크 탭에서 북마크 해제한 뒤 목록 즉시 제거 여부 (API는 B `#29`·`#30`만 사용) | **흐리게 남고 "되돌리기", 4초 뒤 함께 빠짐(시안 `#el-2` 합친 안 D 채택)**: 카드 길게 누르기/웹 호버 `⋯`는 `PostCard`의 `onMenu`로 B의 카드 작은 창(`local-feed.md` H10: `♡ 좋아요`·`🔖 북마크`·`↗ 공유` + 책 줄)을 그대로 연다. ① `좋아요` 탭에서 켜진 `♡`를 누르면 `DELETE /posts/{id}/reaction`(#29)을 즉시 보내고, 성공하면 그 카드를 자리에 그대로 두되 흐리게(불투명도 0.45) + 좌상단 `"취소함"` 표시로 바꾸고 화면 아래에 `"좋아요를 취소했어요"` + `"되돌리기"` 안내를 4초 보인다. ② 4초 안에 `"되돌리기"`를 누르면 `PUT /posts/{id}/reaction`을 보내고 성공 시 카드를 원래 모습으로 되돌린다(같은 자리 유지). ③ 4초가 지나면 안내와 흐린 카드를 함께 목록에서 지운다. ④ 흐린 카드는 한 번에 하나만 둔다: 4초 안에 다른 카드를 또 취소하면 앞서 흐려 둔 카드는 즉시 지우고 새 카드만 흐리게 + 안내를 새로 4초. ⑤ `북마크` 탭의 `🔖` 해제도 같은 동작(`DELETE/PUT /posts/{id}/bookmark` #30, 안내 `"북마크를 해제했어요"`). ⑥ `내 게시물` 탭 카드의 `♡`·`🔖`는 상태만 바꾸고 목록에서 빼지 않는다. 같은 카드에 진행 중인 요청이 있으면 다음 누름을 무시한다(C6 열린 행) | 확인 (사용자 A, 2026-11-18) / 4초·불투명도 값·`내 게시물` 탭 처리 기본값(Claude) | `specs/my-collection/세부/MY-1.md` 결정 2·예외 #3·#5, 시안 `#el-2` |
| Y-O5 | **로딩 · 오류 · 다음 페이지(`next_cursor`) 불러오기 방식**: 상단 프로필/탭별 로딩 스켈레톤·문구, 실패 시 오류 문구 + `"다시 시도"`(부분 실패 시 나머지 영역 유지), `next_cursor !== null`일 때 끝까지 스크롤 vs `"더 보기"` 버튼 | **로딩**: 처음 불러오는 동안 프로필 자리(원 + 회색 줄 2개)와 카드 자리(2열 회색 상자 4개, `theme.colors.surface2`, `theme.radii.card`)에 빈 모양(스켈레톤)을 보이고, 받으면 바로 바꾼다(문구 없음). **실패(부분 실패 유지)**: 실패한 영역만 C3 실패 문구 + `"↻ 새로고침"` 테두리 버튼(아이콘 글자 왼쪽, 홈 `VISIT-1`·`VISIT-1b`와 같은 표현). 프로필 실패 → 프로필 자리 한 줄, 탭·카드 유지. 탭 목록 실패 → 카드 자리, 프로필·탭 바 유지. 누르면 실패 영역만 다시 부른다. **다음 페이지**: `next_cursor !== null`이면 끝까지 내렸을 때 자동으로 이어 불러온다(버튼 없음, 중복 호출 방지). 이어 불러오는 중에는 맨 아래 `"불러오는 중…"`, 실패하면 맨 아래 `"더 불러오지 못했어요"` + `"↻ 새로고침"`(보이던 카드 유지)이며, 맨 아래에서 한 번 더 끝까지 내려도 같은 재시도를 한다. `next_cursor === null`이면 맨 아래 `"모두 봤어요"` | 확인 (사용자 A, 2026-11-18: 실패 화면·아이콘 왼쪽·한 번 더 내려 재시도) / 스켈레톤·자동 이어 불러오기 기본값(Claude) | `specs/my-collection/세부/MY-1.md` 예외 #1·#6, 시안 `#except` ①②③⑧ |

#### C2. 엔드포인트 / 주요 함수 (잠금)

| 메서드·경로 (`/api/v1` 접두어) | 인증 필요 | 성공 상태 | 날짜 형식 | 목록이면 페이지·정렬 | 같은 요청을 연타·재시도하면 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/me/profile` | 필수 (`get_current_user`) | `200` | `updated_at`: ISO 8601 `+09:00` (서울) | N/A (단건 본인 프로필) | N/A (읽기만, 몇 번 해도 같음) |
| `GET /api/v1/me/posts?cursor=&limit=` | 필수 (`get_current_user`) | `200` | `published_at`·`collected_at`: ISO 8601 `+09:00` (서울) | `limit` 기본 20(1~50), 정렬 `p.published_at DESC, p.id DESC`, 커서 `(published_at, id)` base64url | N/A (읽기만, 몇 번 해도 같음) |
| `GET /api/v1/me/reactions?cursor=&limit=` | 필수 (`get_current_user`) | `200` | `published_at`·`collected_at`: ISO 8601 `+09:00` (서울) | `limit` 기본 20(1~50), 정렬 `pr.created_at DESC, p.id DESC`, 커서 `(created_at, post_id)` base64url | N/A (읽기만, 몇 번 해도 같음) |
| `GET /api/v1/me/bookmarks?cursor=&limit=` | 필수 (`get_current_user`) | `200` | `published_at`·`collected_at`: ISO 8601 `+09:00` (서울) | `limit` 기본 20(1~50), 정렬 `pb.saved_at DESC, p.id DESC`, 커서 `(saved_at, post_id)` base64url | N/A (읽기만, 몇 번 해도 같음) |

- 서버 함수(`server/app/routers/my_collection.py`, A):
  - `async def get_my_profile(request: Request, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]`
  - `async def list_my_posts(request: Request, cursor: str | None = None, limit: int = 20, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]`
  - `async def list_my_reactions(request: Request, cursor: str | None = None, limit: int = 20, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]`
  - `async def list_my_bookmarks(request: Request, cursor: str | None = None, limit: int = 20, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]`
- 앱 함수(`mobile/src/features/my-collection/api.ts`, A):
  - `fetchMyProfile(signal?: AbortSignal): Promise<MyProfile>`
  - `fetchMyPosts(page?: { cursor?: string | null; limit?: number }, signal?: AbortSignal): Promise<MyCollectionPage>`
  - `fetchMyReactions(page?: { cursor?: string | null; limit?: number }, signal?: AbortSignal): Promise<MyCollectionPage>`
  - `fetchMyBookmarks(page?: { cursor?: string | null; limit?: number }, signal?: AbortSignal): Promise<MyCollectionPage>`

#### C3. 요청·응답 필드와 화면 문구

##### DTO 스키마 (잠금 — 필드 추가·삭제·이름 변경 불가)

| 구분 | 필드/키 | 타입 | 필수 | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| 요청 (`/me/posts`·`/reactions`·`/bookmarks`) | `cursor` | `str \| null` | N | base64url JSON `[ts_iso, post_id_uuid]`. 깨진 값·형식 불일치는 `422 VALIDATION_ERROR`, `detail="cursor"` |
| 요청 (`/me/posts`·`/reactions`·`/bookmarks`) | `limit` | `int` | N | 기본 `20`, 허용 `1 <= limit <= 50`. 범위 밖은 `422 VALIDATION_ERROR`, `detail="limit"` |
| 요청 (공통) | `user_id` 등 쿼리/본문 | — | — | **무시**(토큰 `sub`만 사용, Y2) |
| 응답 (`GET /me/profile`) `MyProfile` | `user_id` | `str (UUID)` | Y | 본인 식별자 (`user.id`) |
| `MyProfile` | `nickname` | `str` | Y | `user_profiles.nickname` (행 없으면 `"이웃"`, `nickname_of` 규칙) |
| `MyProfile` | `bio` | `str \| null` | Y | 한 줄 소개 (`user_profiles.bio`, 없으면 `null`) |
| `MyProfile` | `avatar_url` | `str \| null` | Y | 프로필 사진 `https://` 주소 (`user_profiles.avatar_url`, 없으면 `null`) |
| `MyProfile` | `updated_at` | `str (ISO, +09:00)` | Y | `user_profiles.updated_at` (행 없으면 `users.created_at`) |
| 응답 (목록 3개) `MyCollectionPage` | `items` | `MyCollectionPost[]` | Y | 목록 배열 (없으면 `[]`) |
| `MyCollectionPage` | `next_cursor` | `str \| null` | Y | 다음 페이지 커서 (끝이면 `null`) |
| `MyCollectionPost` (`FeedPost` 호환) | `id` | `str (UUID)` | Y | `posts.id` |
| `MyCollectionPost` | `library_id` | `int` | Y | `posts.library_id` |
| `MyCollectionPost` | `library_name` | `str` | Y | `libraries.name` |
| `MyCollectionPost` | `image_kind` | `"photo" \| "cover" \| "color"` | Y | `posts.image_kind` |
| `MyCollectionPost` | `image_url` | `str \| null` | Y | `photo`: 저장소 공개 주소, `cover`: 책 표지 주소, `color`: `null` (`local-feed.md` C3 동일) |
| `MyCollectionPost` | `image_color` | `str \| null` | Y | `color`일 때만 색 토큰 이름 |
| `MyCollectionPost` | `overlay_text` | `str \| null` | Y | 이미지 위 글자 |
| `MyCollectionPost` | `book` | `{ isbn13: str; title: str; author: str \| null } \| null` | Y | 카드 메뉴 책·저자 검색 줄용 |
| `MyCollectionPost` | `published_at` | `str (ISO, +09:00)` | Y | `posts.published_at` |
| `MyCollectionPost` | `my_reaction` | `bool` | Y | 본인의 공감 여부 (`/me/reactions`는 항상 `true`) |
| `MyCollectionPost` | `my_bookmark` | `bool` | Y | 본인의 북마크 여부 (`/me/bookmarks`는 항상 `true`) |
| `MyCollectionPost` | `item_kind` | `"post"` | Y | `MY-1`에서는 `"post"` 고정 (C-46 D3 방문 기록 카드 확장 대비, Y6) |
| `MyCollectionPost` | `collected_at` | `str (ISO, +09:00)` | Y | `/me/posts`: `published_at`, `/me/reactions`: `post_reactions.created_at`, `/me/bookmarks`: `post_bookmarks.saved_at` |

##### 잠금 화면 문구

| 구분 | 대상 | 타입 | 필수 | 고정 문구 |
| :--- | :--- | :--- | :--- | :--- |
| 화면 문구 | 하단 탭 이름 | — | — | `"내 정보"` (`core.md` K13, `_layout.tsx:20`) |
| 화면 문구 | 3탭 라벨 순서 | — | — | `"내 게시물"` · `"좋아요"` · `"북마크"` (Y1, C-46 F2) |
| 화면 문구 | 비로그인 로그인 버튼 | — | — | `"로그인"` (`→ /login`, 기존 `routes.test.tsx:153` 호환) |

##### 열린 화면 문구 (A가 명세·시안 작성 후 빈 칸 채움)

| 구분 | 대상 (명세서/열린 칸 ID) | 타입 | 필수 | 설명·고정 문구 (A 채움) |
| :--- | :--- | :--- | :--- | :--- |
| 화면 문구 | 비로그인 안내 문구 (`Y-O1`) | — | — | 굵게 `"로그인하면 내 정보를 볼 수 있어요"` + 보조 `"내가 올린 게시물과 좋아요·북마크한 게시물을 모아 봐요"` + 잠금 `"로그인"` 버튼. 프로필·탭 바·카드는 그리지 않는다 (예외 #4, 시안 `#except` ⑦) |
| 화면 문구 | 상단 프로필 수정 버튼 및 미구현 안내 (`Y-O1`) | — | — | 버튼 `"프로필 수정"`. 누르면 아래 안내 `"프로필 수정은 곧 열려요"` 2초 (`MY-2` 전, 결정 1) |
| 화면 문구 | 한 줄 소개(`bio`) 미설정 시 표시 (`Y-O1`) | — | — | N/A: 문구 없음 — `bio === null`이면 소개 줄 자체를 숨긴다 (결정 1, 사용자 "자기소개 없을 때 칸 절약되는 거 나쁘지 않은 거 같아") |
| 화면 문구 | `내 게시물` 탭 빈 상태 문구·버튼 (`Y-O3`) | — | — | 아이콘 `✎` · `"아직 올린 게시물이 없어요"` · `"도서관 방문 페이지에서 첫 글을 올려 보세요"` · 버튼 `"가까운 도서관 둘러보기"` (결정 3) |
| 화면 문구 | `좋아요` 탭 빈 상태 문구·버튼 (`Y-O3`) | — | — | 아이콘 `♡` · `"아직 좋아요한 게시물이 없어요"` · `"마음에 드는 게시물에 ♡를 누르면 여기 모여요"` · 버튼 `"가까운 도서관 둘러보기"` (결정 3) |
| 화면 문구 | `북마크` 탭 빈 상태 문구·버튼 (`Y-O3`) | — | — | 아이콘 `🔖` · `"아직 북마크한 게시물이 없어요"` · `"다시 보고 싶은 게시물을 북마크하면 여기 모여요"` · 버튼 `"가까운 도서관 둘러보기"` (결정 3) |
| 화면 문구 | 상단 프로필 / 각 탭 조회 실패 문구·재시도 (`Y-O5`) | — | — | 프로필 `"내 정보를 불러오지 못했어요"`, 탭 목록 `"게시물을 불러오지 못했어요"`, 버튼 `"↻ 새로고침"` (예외 #1). 잠금 M-#7·P5의 `"다시 시도"`와 다름 — PR 검토 메모 `[기준 충돌]` |
| 화면 문구 | 좋아요 취소·북마크 해제 안내와 되돌리기 (`Y-O4`) | — | — | `"좋아요를 취소했어요"` / `"북마크를 해제했어요"` + `"되돌리기"`(4초), 흐린 카드 표시 `"취소함"` (결정 2) |
| 화면 문구 | 좋아요 취소·북마크 해제·되돌리기 실패 (`Y-O4`) | — | — | `"좋아요를 취소하지 못했어요. 다시 해 주세요"` / `"북마크를 해제하지 못했어요. 다시 해 주세요"` / `"되돌리지 못했어요"` 2초 (예외 #5) |
| 화면 문구 | 다음 페이지 불러오는 중 / 목록 끝 문구 (`Y-O5`) | — | — | 불러오는 중 `"불러오는 중…"`(말줄임표는 실제 화면 문자열), 실패 `"더 불러오지 못했어요"` + `"↻ 새로고침"`, 끝 `"모두 봤어요"` (예외 #1) |

#### C4. 플랫폼 분기 표 (잠금)

해당 없음: iOS·Android·웹 공통 React Native 코드로 작성한다. `PostCard` 길게 누르기/웹 호버와 공유 분기는 B `local-feed`(`PostCard.tsx`, `share.ts`)가 담당하며 `my-collection` 코드에 `Platform.OS`·`*.ios.tsx`·`*.android.tsx`·`*.web.tsx`를 두지 않는다(Y8).

#### C5. 테이블 (잠금)

**1) `user_profiles` 확장** — 역할: 내 정보 상단 표시 프로필(`nickname`, `bio`, `avatar_url`) · 소유자 컬럼: `user_id` · 담당 마이그레이션: `0003_user_profiles.py`는 이미 push되었으므로 `MY-1-P1`에서 새 순번 파일(`NNNN_user_profiles_bio_avatar.py`, 머지 시 `head` 이후)로 `ALTER TABLE` 추가(`H-GIT-04`)

| 컬럼 | 타입 | NULL | 기본값 | 키·제약 (PK/FK/UNIQUE/CHECK) | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `user_id` | `uuid` | 아니오 | 없음 | PK, FK → `users.id` | 기존(`0003_user_profiles.py:16`) |
| `nickname` | `text` | 아니오 | 없음 | CHECK `char_length(btrim(nickname)) BETWEEN 1 AND 40` | 기존(`0003_user_profiles.py:18,21`) |
| `bio` | `text` | 예 | 없음 (`NULL`) | CHECK `bio IS NULL OR char_length(btrim(bio)) BETWEEN 1 AND 160` | **신규(`MY-1-P1`)**: 한 줄 소개 (최대 160자) |
| `avatar_url` | `text` | 예 | 없음 (`NULL`) | CHECK `avatar_url IS NULL OR avatar_url LIKE 'https://%'` | **신규(`MY-1-P1`)**: 프로필 사진 `https://` 주소 |
| `updated_at` | `timestamptz` | 아니오 | `now()` | — | 기존(`0003_user_profiles.py:19`) |

| 삭제 동작 | 값 |
| :--- | :--- |
| 이 테이블의 행을 지울 때 | 지우지 않는다. 탈퇴 때 익명화는 `AUTH-3` 계약서(`core.md` SRV-0 C5) |
| 부모(`users`)가 지워질 때 | `NO ACTION` (`0003_user_profiles.py` 그대로) |
| 허용하지 않는 값 | 공백만 있는 `bio`·161자 이상 `bio` · `https://`가 아닌 `avatar_url` → CHECK 거부 (`test_user_profiles_bio_avatar_checks`) |
| 행 수준 보안(RLS) | `0003_user_profiles.py:24`의 `ENABLE ROW LEVEL SECURITY` 유지, 정책 없음 + `test_user_profiles_rls_enabled` |

**2) 조회 대상 기존/B 소유 테이블 (A가 수정·생성하지 않음 — 잠금)**

- `posts` (`local-feed.md` LOCAL-1 C5 `0004_posts.py`): `WHERE p.user_id = :uid AND p.status = 'published'`, 정렬 `p.published_at DESC, p.id DESC`
- `post_reactions` (`local-feed.md` LOCAL-2 C5 `0005_post_reactions_bookmarks.py`): `WHERE pr.user_id = :uid AND p.status = 'published'`, 정렬 `pr.created_at DESC, p.id DESC`
- `post_bookmarks` (`local-feed.md` LOCAL-2 C5 `0005_post_reactions_bookmarks.py`): `WHERE pb.user_id = :uid AND p.status = 'published'`, 정렬 `pb.saved_at DESC, p.id DESC`
- `users` (`0001_users.py`), `libraries`·`books` (`0002_public_reference.py`)
- 팔로우 테이블은 C-46 §8-5 미결에 따라 `MY-1`에서 만들지 않는다(Y5).

#### C6. 검증과 에러 처리

##### 잠금 오류 처리 (`M-#1` ~ `M-#7`)

| 예외 # | 발생 조건 | HTTP 상태 / 에러 `code` | 화면 문구·동작 | 기록 무변경 보장 |
| :--- | :--- | :--- | :--- | :--- |
| `M-#1` | 토큰 없음·깨짐·만료·미등록 / 비로그인 상태에서 `/me` 진입 | `401` / `AUTH_REQUIRED` · `AUTH_INVALID` · `AUTH_EXPIRED` · `AUTH_NOT_REGISTERED` | 앱: 비로그인 상태는 API 요청 0번, 로그인 안내 + `"로그인"`(`→ /login`) 표시 | DB·기기 무변경 |
| `M-#2` | 탈퇴한 계정 (`users.status = 'withdrawn'`) | `403` / `ACCOUNT_WITHDRAWN` | `"탈퇴한 계정이에요."` | 무변경 |
| `M-#3` | 잘못된 `cursor`(깨진 base64url·JSON·잘못된 ISO/UUID 타입) 또는 `limit` 범위 밖(`< 1`·`> 50`) | `422` / `VALIDATION_ERROR`, `detail="cursor"` 또는 `"limit"` | 서버: `"요청 형식이 올바르지 않아요."` | 무변경 |
| `M-#4` | 쿼리/헤더로 타인의 `user_id`를 전달 (`?user_id=<other>`) | 무시하고 `200` (본인 데이터만 반환) | 본인 프로필·본인 3탭 목록만 표시 (타인 데이터 노출 0건) | 타인 데이터 접근 0 |
| `M-#5` | 내가 쓴 글 또는 좋아요·북마크한 글이 `withdrawn`·`hidden` 상태임 | `200` (목록에서 제외) | 자리표시 카드 없이 숨김. 연결 행(`post_reactions`·`post_bookmarks`)은 유지되어 재공개 시 원래 순서로 복원 | 연결 행 무변경 |
| `M-#6` | 탭 빠르게 전환(`내 게시물` ↔ `좋아요` ↔ `북마크`)·새로고침 연타·계정 전환 중 늦은 응답 | 늦은 `200` 또는 늦은 오류 | `createLatestRunner`가 이전 요청 취소·`stale` 폐기(`AC-RACE`), 현재 선택 탭·계정 화면 무변경 | — |
| `M-#7` | 네트워크 끊김(`status 0`)·서버 `503 DB_UNAVAILABLE` | `503` / `DB_UNAVAILABLE` 또는 `NETWORK` | 실패한 영역(상단 프로필 또는 활성 탭 목록)만 오류 안내 + `"다시 시도"`, 정상 영역 유지 | 기기 상태 무변경 |

##### 열린 예외/동작 행 (A가 명세서 예외 표 작성 후 빈 칸 채움)

| 명세서 예외 # (A 채움) | 발생 조건 | HTTP / `code` | 화면 변화·유지 영역 (A 채움) | 기록 무변경 보장 (A 채움) |
| :--- | :--- | :--- | :--- | :--- |
| 예외 #2 (결정 3) | 각 탭 조회 결과가 `items: []` (0건) | `200` (`items: []`) | 프로필·탭 바 유지, 카드 자리만 탭별 빈 안내 + `"가까운 도서관 둘러보기"`(→ 홈 탭). 다른 탭 캐시는 그대로 | 조회만 함. DB·기기 무변경, 가짜 게시물 0 |
| 결정 1 | `"프로필 수정"` 버튼 누름 (`MY-1` 범위) | N/A: 기기 내 처리 | 화면 이동 없이 아래 `"프로필 수정은 곧 열려요"` 2초. 연타해도 안내는 하나만 | API 호출 0, DB·기기 무변경 |
| 결정 2 | 카드 메뉴에서 좋아요 취소 또는 북마크 해제 후 수집 탭 반영 | B `#29`·`#30` (`200`) | `DELETE` 성공 → 카드 자리 유지 + 흐림 + `"취소함"`, 아래 안내 + `"되돌리기"` 4초 → 4초 뒤 카드·안내 함께 제거. 4초 안에 다른 카드 취소 시 앞 흐린 카드 즉시 제거. `"되돌리기"` → `PUT` 성공 시 같은 자리 원래 모습(다음 재조회 때는 B 계약대로 새 시각 기준 맨 앞) | 서버 행은 B #29·#30 결과만 반영(`DELETE` 행 0개, `PUT` 행 1개). 다른 카드·다른 탭 목록 무변경 |
| 예외 #3 | 같은 카드의 `♡`/`🔖` 또는 `"되돌리기"`를 빠르게 두 번 누름 | N/A: 기기 내 처리 (진행 중 요청 1개만) | 첫 누름만 보내고 응답 전 같은 카드 누름은 무시. 흐린 카드·안내 하나만 | 요청 1회, 행 수는 B 멱등 규칙 그대로 |
| 예외 #5 | 좋아요 취소·북마크 해제 `DELETE` 실패(네트워크·`5xx`·B `H-#3`·`H-#4`) | B `#29`·`#30` 오류 / `NETWORK` | 카드를 흐리게 하지 않고 원래대로, 아래 `"좋아요를 취소하지 못했어요. 다시 해 주세요"`(북마크: `"북마크를 해제하지 못했어요. 다시 해 주세요"`) 2초. `"되돌리기"`의 `PUT` 실패는 `"되돌리지 못했어요"` 2초 후 카드 제거(서버 상태와 맞춤) | 실패 요청은 서버 행 무변경, 기기 목록은 서버 상태와 같게 |
| 예외 #1 | 다음 페이지 조회 실패 | `503 DB_UNAVAILABLE` / `NETWORK` | 보이던 카드 유지, 맨 아래 `"더 불러오지 못했어요"` + `"↻ 새로고침"`. 버튼 또는 맨 아래에서 한 번 더 내리면 같은 `next_cursor`로 재시도 | 기기 목록·커서 무변경 |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | `main` 연결 상태 및 `TODO(연결)` 가짜 값 규칙 |
| :--- | :--- | :--- |
| D `AUTH-1` · `SRV-0` | `get_current_user`, `nickname_of`, `useAuth`, `apiFetch` | `origin/main` `cb25785`에 **머지 완료** — 그대로 import해 사용 |
| D `APP-0` | `theme`, `onFill`, `createLatestRunner`, `mobile/app/(tabs)/me.tsx` 스텁 | `origin/main` `cb25785`에 **머지 완료** — `MY-1-P2`가 `(tabs)/me.tsx` 스텁을 교체 |
| D `AUTH-2` | `registerSignOutCleanup`, 설정·로그아웃 연결 | 미구현 — 부르지 않고 `// TODO(연결): D(AUTH-2) registerSignOutCleanup` 주석 + `useAuth().userId` 변화로 상태 초기화 |
| B `LOCAL-1` · `LOCAL-2` (서버) | `posts`, `post_reactions`, `post_bookmarks` 테이블(`0004`·`0005`) | PR #126 OPEN / LOCAL-2 미머지 — `MY-1-P1` 라우터 SQL은 계약 C5 스키마 그대로 작성. B 테이블 머지 전 단독 테스트는 계약 C5 스키마와 동일한 시험용 테이블로 검증하고 B 머지 후 통합 확인 (`TODO(연결): B LOCAL-1/LOCAL-2`) |
| B `LOCAL-2-P3` · `P4` (앱) | `PostCard` (`mobile/src/features/local-feed/PostCard.tsx`), `PostMenu` / `api.ts`, `/posts/[postId]` | 미머지 — 머지 전 `mobile/src/features/my-collection/__fakes__/PostCard.tsx` (`library-visit/__fakes__/PostCard.tsx`와 동일한 props `{ post: FeedPost; onPress; onMenu?; width }`) + `// TODO(연결): B LOCAL-2-P3 PostCard` 사용. 상세 경로 `/posts/[postId]`는 core 스텁으로 연결 |
| A `MY-1-P1` → `MY-1-P2` (앱 단독 선행 시) | `GET /api/v1/me/profile` · `/me/posts` · `/me/reactions` · `/me/bookmarks` 가짜 응답 | `MyProfile` 가짜: `{"user_id":"00000000-0000-4000-8000-00000000000a","nickname":"이웃-0000","bio":"동네 도서관 산책을 좋아해요","avatar_url":null,"updated_at":"2026-11-17T09:00:00+09:00"}` / `MyCollectionPage` 가짜: `{"items":[{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","library_id":101,"library_name":"정독도서관","image_kind":"color","image_url":null,"image_color":"fill2","overlay_text":"마음에 남은 문장","book":{"isbn13":"9788936434120","title":"소년이 온다","author":"한강"},"published_at":"2026-11-15T19:20:00+09:00","my_reaction":true,"my_bookmark":false,"item_kind":"post","collected_at":"2026-11-16T10:00:00+09:00"}],"next_cursor":null}` + `// TODO(연결): A MY-1-P1` |
| A `VISIT-4` (M2 후속) | 방문 기록 카드 북마크 통합(C-46 D3) | 미구현 — `item_kind: "post"`만 지원하고 `TODO(연결): VISIT-4 D3` |

---

### 구현 계획

#### P1. 확인한 기존 코드 전제 (`origin/main` `cb25785` 기준)

| 참조 대상 | 실제 경로와 줄 (`file:line`) | 재사용할 심볼·시그니처·역할 |
| :--- | :--- | :--- |
| 사용자 검증·닉네임 | `server/app/auth.py:163-173`(`nickname_of`), `:176-184`(`get_current_user`) | 그대로 import해 사용 |
| 트랜잭션·오류·시각 | `server/app/db.py:16-28`(`run_db`), `server/app/common.py:11-37`(`ApiError`, `error_response`, `now_kst`) | 그대로 import해 사용 |
| 라우터 등록·422 | `server/app/main.py:50-58,89-111` | `# ── [my-collection-A] ──` 블록으로 라우터 등록 |
| 선행 마이그레이션 | `server/migrations/versions/0003_user_profiles.py:13-24` | `user_profiles` 테이블과 RLS 유지, 새 순번 파일로 `bio`·`avatar_url` 추가 |
| 하단 탭·내 정보 스텁 | `mobile/app/(tabs)/_layout.tsx:18-21`, `mobile/app/(tabs)/me.tsx:1-69`, `mobile/src/__tests__/routes.test.tsx:23-27,149-163` | `_layout.tsx`는 `"me"`(`"내 정보"`) 유지. `me.tsx` 교체 및 `routes.test.tsx` `HomeScreen` 방식 mock 정합 |
| 앱 인증·통신·러너·토큰 | `mobile/src/auth/AuthProvider.tsx:253-259`(`useAuth`), `mobile/src/auth/apiFetch.ts:72-116`(`apiFetch`), `mobile/src/lib/latest.ts:6-25`(`createLatestRunner`), `mobile/src/theme/tokens.ts:31-143`(`theme`, `onFill`) | 그대로 import해 사용 |
| 가짜 카드 패턴 | `mobile/src/features/library-visit/__fakes__/PostCard.tsx:9-46` | B `PostCard` 머지 전 동일 props 구조 참고 |

#### P2. Step 및 파트 분할 표 (잠금 칸과 열린 칸 명시)

> Step 하나 = 브랜치 `feat/my-collection-MY-1` 하나 = PR 하나. `MY-1-P1` 검증·커밋·CI 확인 후 같은 브랜치에 `MY-1-P2`를 이어서 커밋한다.

##### 잠금 칸 vs 열린 칸 구분 표

| 구분 | 대상 절 · 항목 | 상태 | 안내 |
| :--- | :--- | :--- | :--- |
| **잠금 칸** (D 기준선 고정) | Pre-flight, C1 `Y1~Y8`, C2 엔드포인트·함수 시그니처, C3 `MyProfile`·`MyCollectionPage`·`MyCollectionPost` DTO 및 잠금 문구, C4, C5 `user_profiles` 확장·B 테이블 참조, C6 `M-#1~M-#7`, C7 의존/가짜 값, P1, P2 브랜치·허용 파일 목록·10칸 머리말 구조, P3, P4 골격, P5 기본 18개 테스트 | **잠금** | A는 이 칸의 이름·필드·오류 코드·파일 목록·파트 경계를 바꾸지 않는다 |
| **열린 칸** (A 채움 대상) | C1 `Y-O1~Y-O5`, C3 열린 화면 문구 8행, C6 열린 예외/동작 3행, P2 아래 "A 보완 확인 항목", P5 `MY-1-P2` 명세·시안 기반 추가 테스트 행 | **열린 칸** | A의 AI가 기획(명세서+시안) 완료 후 `2_계약_보완.md` 규칙에 맞춰 빈 칸 채움 및 행 추가로 보완해 계약 수정본 PR 제출 |

##### 파트 분할과 담당 파일 (허용 파일 목록 잠금)

| 파트 | 브랜치 | 수정/생성 허용 파일(전수, 잠금) | 완료 시 확인할 항목 (잠금 + 열린 칸) |
| :--- | :--- | :--- | :--- |
| `MY-1-P1` 서버: 내 프로필 및 3탭 모음 조회 API | `feat/my-collection-MY-1` | `server/migrations/versions/NNNN_user_profiles_bio_avatar.py`, `server/app/routers/my_collection.py`, `server/app/main.py`(`# ── [my-collection-A] ──` 블록만), `server/tests/test_my_collection.py` | 잠금: `Y1~Y3·Y5·Y6, C2~C3, C5, M-#1~#5, P5 MY-1-P1 시험` |
| `MY-1-P2` 앱: 내 정보 화면 (상단 프로필 + 3탭 2열 피드) | `feat/my-collection-MY-1` (같은 PR) | `mobile/app/(tabs)/me.tsx`, `mobile/src/features/my-collection/MyCollectionScreen.tsx`, `mobile/src/features/my-collection/ProfileHeader.tsx`, `mobile/src/features/my-collection/CollectionTabs.tsx`, `mobile/src/features/my-collection/api.ts`, `mobile/src/features/my-collection/useMyCollection.ts`, `mobile/src/features/my-collection/__fakes__/PostCard.tsx`, `mobile/src/features/my-collection/__fakes__/myCollectionApi.ts`, `mobile/src/features/my-collection/__tests__/my-collection.test.tsx`, `mobile/src/__tests__/routes.test.tsx`, `specs/my-collection/명세서.md`(또는 `specs/my-collection/세부/MY-1.md` 구현 진행 상태) | 잠금: `Y1·Y4·Y5·Y7·Y8, M-#1·#6·#7, P5 MY-1-P2 시험` + A 보완(열린 칸 채움) |

| 열린 칸 (A 보완): `MY-1-P2` 완료 시 추가 확인할 명세서 결정·예외 ID (A 채움) | |
| :--- | :--- |
| `MY-1-P2` 명세서 결정·예외 ID | `specs/my-collection/세부/MY-1.md` 결정 1(Y-O1)·결정 2(Y-O4)·결정 3(Y-O3), 예외 #1~#6(Y-O5·C6 열린 행), 기본값(Claude) Y-O2 탭 바·캐시·당겨서 새로고침·상세 복귀 재조회. 추가 P5 `MY-1-P2` 열린 테스트 8행 |

##### 파트 머리말 — MY-1-P1 / MY-1-P2 (Step 하나 = 브랜치 `feat/my-collection-MY-1` 하나 = PR 하나)

| 칸 | `MY-1-P1` | `MY-1-P2` |
| :--- | :--- | :--- |
| 1. 태스크 ID | `MY-1-P1` | `MY-1-P2` |
| 2. 담당 역할 | A | A |
| 3. 기준선 버전 | B2 이후 M2/C-46 확장 (`MY-1` D 기준선 — 발행 전 착수 불가) | 같음 |
| 4. 계약서 커밋 | `발행 뒤 기입` (기획 + 계약 수정본 승인·발행 후 SHA 기입, 비어 있으면 착수 금지) | 같음 |
| 5. 선행 태스크 | 기획 명세서·시안 PR + 계약 수정본 PR 모두 D 승인·발행 완료. (`posts`·`post_reactions`·`post_bookmarks`가 `main`에 아직 없으면 C7 시험용 테이블/시드로 검증 후 B 머지 시 통합) | 같은 브랜치·PR 안 `MY-1-P1` 구현·검증·커밋·CI 확인 완료 (B `PostCard` 미머지 시 C7 가짜 카드 + `TODO(연결): B`) |
| 6. 수정 허용 파일 | 위 표 `MY-1-P1` 4개 경로만 | 위 표 `MY-1-P2` 11개 경로만 (`_layout.tsx`·B 파일 수정 금지) |
| 7. 금지된 결정 | 타인 `user_id` 쿼리 허용 금지. 팔로워 수/목록·타인 프로필·이메일 노출 금지. 팔로우 테이블·프로필 수정 `PATCH` API 임의 추가 금지 | `mobile/app/(tabs)/my.tsx` 신규 탭 파일 생성 금지(`me.tsx` 교체). `PostCard` 재디자인·색/곡률 하드코딩·`Platform.OS` 금지. 비로그인 시 `/me/*` 호출 금지 |
| 8. 완료 조건 | `Y1~Y3·Y5·Y6`, `C2~C3`, `C5`, `M-#1~#5`, `P5 MY-1-P1` 시험 통과 | `Y1·Y4·Y5·Y7·Y8`, `Y-O1~O5`, `M-#1·#6·#7`, `P5 MY-1-P2` 시험 통과 + 웹·Android 확인 |
| 9. 검증 명령 | 루트 `docker compose up -d --wait db` → `server`에서 `APP_ENV=test python -m uv run alembic upgrade head` → `APP_ENV=test python -m uv run pytest -W error` | `mobile`에서 `npm ci` → `npx tsc --noEmit` → `npx jest --runInBand src/features/my-collection src/__tests__/routes.test.tsx` → `npx expo export --platform web` |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 | 같음 |

#### P3. 새 라이브러리 (잠금)

| 쪽 | 패키지·허용 버전 | 용도 | 설정·플랫폼 대체 동작 |
| :--- | :--- | :--- | :--- |
| 서버 | 없음 | — | N/A |
| 앱 | 없음 | — | N/A |

#### P4. 핵심 흐름 골격 (의사코드 20~40줄)

```python
# server/app/routers/my_collection.py — 본인 격리 + 상태 필터 + 동률 안전 복합 커서(H-ARCH-10)
def decode_cursor(cursor: str | None) -> tuple[datetime, UUID] | None:
    if cursor is None:
        return None
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor + "=="))
        ts = datetime.fromisoformat(raw[0])
        if ts.tzinfo is None:
            raise ValueError("tz required")
        return ts, UUID(raw[1])
    except Exception as exc:
        raise ApiError(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않아요.", "cursor") from exc

@router.get("/api/v1/me/profile")
async def get_my_profile(request: Request, user: CurrentUser = Depends(get_current_user)):
    def tx(c: Connection):
        row = c.execute(text("""
            SELECT u.id AS user_id, u.created_at, p.nickname, p.bio, p.avatar_url, p.updated_at
            FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE u.id = :uid"""), {"uid": user.id}).one()
        return {
            "user_id": str(row.user_id),
            "nickname": row.nickname or "이웃",
            "bio": row.bio,
            "avatar_url": row.avatar_url,
            "updated_at": now_kst(row.updated_at or row.created_at).isoformat(timespec="seconds"),
        }
    return await run_db(request.app.state.engine, tx)

# /me/posts · /me/reactions · /me/bookmarks 공통 패턴 (예: /me/bookmarks)
# WHERE pb.user_id = :uid AND p.status = 'published'
#   AND (:after_ts IS NULL OR (pb.saved_at, p.id) < (:after_ts, :after_id))
# ORDER BY pb.saved_at DESC, p.id DESC LIMIT :limit_plus_one
```

```ts
// mobile/src/features/my-collection/useMyCollection.ts — 이중 러너 + 비로그인/계정전환 정화
const profileRunner = useMemo(() => createLatestRunner(), []);
const listRunner = useMemo(() => createLatestRunner(), []);

useEffect(() => {
  profileRunner.cancel();
  listRunner.cancel();
  if (authStatus !== "signedIn" || !userId) {
    resetAllState();                               // 비로그인/계정 전환 시 이전 목록·프로필 즉시 비움(Y7)
    return;
  }
  void loadProfile();
  void loadTab("posts", null);                     // 최초 기본 탭은 항상 "내 게시물"(Y1)
  return () => { profileRunner.cancel(); listRunner.cancel(); };
}, [authStatus, userId]);

async function selectTab(tab: CollectionTab) {
  setActiveTab(tab);
  await loadTab(tab, null);                        // listRunner가 이전 탭 늦은 응답 폐기(M-#6)
}
```

#### P5. 필수 테스트 (단언 왜곡 금지 · 잡아야 할 버그)

##### 잠금 기본 테스트 (`MY-1-P1` · `MY-1-P2`)

| 파트 | 테스트 이름 | 준비 (Given) | 실행 (When) | 기대 단언 (Then) | 잡아야 할 버그 (가드를 빼면 실패할 것) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MY-1-P1` | `test_me_profile_returns_own_profile_without_follower_or_email` | A 프로필(`nickname`, `bio`, `avatar_url`) | A로 `GET /api/v1/me/profile` | `200`, C3 `MyProfile` 5필드 전수, `follower_count`·`email` 키 없음 | 비허용 필드 노출 (Y5) |
| `MY-1-P1` | `test_me_profile_fallback_when_profile_row_absent` | `users`만 있고 `user_profiles` 없음 | `GET /api/v1/me/profile` | `200`, `nickname == "이웃"`, `bio is None`, `avatar_url is None` | 행 미생성 시 500 |
| `MY-1-P1` | `test_me_posts_returns_only_own_published_posts` | A 공개 2·철회 1, B 공개 1 | A로 `GET /api/v1/me/posts` | `200`, A 공개 2개만 최신순, B·철회 없음, `item_kind == "post"` | 소유자·`status='published'` 조건 누락 (Y2·Y3) |
| `MY-1-P1` | `test_me_reactions_and_bookmarks_isolate_owner_and_order` | A·B 각각 공감/북마크(북마크 재저장 포함) | A로 `/me/reactions`·`/me/bookmarks` | A 항목만 각각 `created_at`·`saved_at` 내림차순, 재저장 항목 맨 앞 | 타인 모음 노출·게시물 작성일 정렬 오기 (Y2·Y3) |
| `MY-1-P1` | `test_me_collections_hide_withdrawn_and_restore_on_republish` | A가 북마크한 글이 `withdrawn` → 다시 `published` | `/me/bookmarks` 두 번 | 첫 조회에 제외(행은 유지), 재공개 뒤 원래 `saved_at` 순서로 복원 | 철회 시 연결 행 삭제 또는 숨김 글 노출 (C-46 D5) |
| `MY-1-P1` | `test_me_collections_ignore_other_user_id_query_param` | A·B 데이터 | A가 `?user_id=<B_id>` | `200`, A 데이터만 반환, B 데이터 0건 | 쿼리 `user_id` 신뢰 (M-#4) |
| `MY-1-P1` | `test_me_collections_cursor_no_dup_no_gap_on_ties` | 같은 `saved_at` 북마크 5건 | `limit=2`로 끝까지 순회 | 5건 정확히 1번씩, 마지막 `next_cursor is None` | 동률 시 `id` 타이브레이커 누락 (`H-ARCH-10`) |
| `MY-1-P1` | `test_me_collections_invalid_cursor_and_limit_are_422` | — | `cursor=bad!`, `limit=0`, `limit=51` | `422 VALIDATION_ERROR`, `detail="cursor"` / `"limit"` | 커서 파싱 500 노출 (M-#3) |
| `MY-1-P1` | `test_me_endpoints_require_auth_and_block_withdrawn` | 토큰 없음 / 탈퇴 계정 | 4개 `/me/*` 호출 | `401 AUTH_REQUIRED` / `403 ACCOUNT_WITHDRAWN` | 인증·계정 상태 검사 누락 (M-#1·M-#2) |
| `MY-1-P1` | `test_user_profiles_bio_avatar_checks_and_rls` | — | 공백 `bio`, 161자 `bio`, `http://` `avatar_url` INSERT + 카탈로그 조회 | `IntegrityError` 3건, `relrowsecurity = true`, 정책 0 | CHECK·RLS 누락 (`H-ARCH-01`) |
| `MY-1-P2` | `signed out renders login prompt without calling me endpoints` | `useAuth` `signedOut` | `/me` 화면 렌더 → `"로그인"` 누름 | `fetchMyProfile`·`fetchMyPosts` 등 호출 0번, `router.push("/login")` | 비로그인 시 API 호출 (Y7) |
| `MY-1-P2` | `initial load selects my posts tab first and renders 3 tabs in order` | `signedIn` A | 화면 렌더 | 탭 3개 순서(`"내 게시물"`·`"좋아요"`·`"북마크"`), `"내 게시물"` 활성 + `fetchMyPosts` 호출 | 기본 탭 오기 (Y1) |
| `MY-1-P2` | `tab switch drops late response from previous tab` | `좋아요` deferred, `북마크` 즉시 완료 | `좋아요` → `북마크` → `좋아요` 뒤늦게 resolve | 화면은 `북마크` 결과 유지, `좋아요` 데이터 덮어쓰기 없음 | `createLatestRunner` 누락 (`AC-RACE`, M-#6) |
| `MY-1-P2` | `account change or sign out clears previous user profile and lists` | A 로그인 데이터 표시 | `userId` B로 변경 또는 `signedOut` 전환 | 이전 A 닉네임·목록 즉시 비움, 진행 중 요청 취소 | 계정 전환 시 타인/이전 목록 잔존 (Y7) |
| `MY-1-P2` | `post card press navigates to post detail without rendering follow counts` | 3탭 게시물 카드 1건 | 카드 누름 + 화면 텍스트 검사 | `router.push({ pathname: "/posts/[postId]", params: { postId } })`, `"팔로워"`·`"팔로잉"` 텍스트 없음 | 상세 경로 오기·금지 지표 노출 (Y4·Y5) |
| `MY-1-P2` | `section errors are isolated and retry refetches failed section only` | 프로필 503 / 탭 목록 200 (및 반대) | `"다시 시도"` 누름 | 정상 영역은 유지, 실패 영역만 오류 안내·재조회 | 전체 화면 먹통 (M-#7) |
| `MY-1-P2` | `no hard-coded colors radii or platform branches in my-collection` | — | `src/features/my-collection/*.ts(x)` 검사 | `#[0-9A-Fa-f]{3,8}`·`rgb(`·`Platform.OS` 0건 | 토큰·플랫폼 규칙 위반 (Y8) |

##### 열린 테스트 자리 (A가 `Y-O1~O5` 채운 뒤 명세서 결정·예외 ID를 연결해 행 추가)

| 파트 | 테스트 이름 (A 채움) | 준비 (Given) | 실행 (When) | 기대 단언 (Then) | 잡아야 할 버그 (가드를 빼면 실패할 것) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MY-1-P2` | `profile header hides bio when null and edit button shows coming soon notice` | `bio: null` 프로필 | 렌더 → `"프로필 수정"` 두 번 누름 | 소개 줄 없음, `"프로필 수정은 곧 열려요"` 1개, `/me/*` 추가 호출 0, `router.push` 0 | `bio` 빈 줄·안내 중복·수정 화면 이동 (결정 1) |
| `MY-1-P2` | `empty tab shows tab specific notice and button navigates home` | 3탭 각각 `items: []` | 탭마다 렌더 → `"가까운 도서관 둘러보기"` 누름 | 탭별 C3 빈 문구, 가짜 카드 0, `router.navigate("/")` | 빈 탭 문구 오기·가짜 게시물 (결정 3·예외 #2) |
| `MY-1-P2` | `unlike dims card with undo then removes it after 4 seconds` | `좋아요` 탭 카드 2개, #29 `DELETE` 200, fake timers | 카드 `onMenu` → `♡` 누름 → 3.9초 / 4초 진행 | 3.9초: 카드 남음 + `"취소함"` + `"좋아요를 취소했어요"`; 4초: 카드·안내 제거, 나머지 1개 유지 | 즉시 제거·타이머 누락·다른 카드 제거 (결정 2) |
| `MY-1-P2` | `undo within 4 seconds restores card in place via reaction put` | 위와 같음, #29 `PUT` 200 | `♡` 취소 → 2초 뒤 `"되돌리기"` | `PUT` 1회, 카드 같은 자리·흐림 해제, 4초 지나도 유지 | 되돌리기 미전송·자리 이동 (결정 2) |
| `MY-1-P2` | `second cancel within 4 seconds removes previously dimmed card immediately` | `좋아요` 탭 카드 3개 | 카드1 취소 → 1초 뒤 카드2 취소 | 카드1 즉시 제거, 카드2만 흐림, 안내 1개 | 흐린 카드 누적 (결정 2) |
| `MY-1-P2` | `bookmark tab unbookmark follows same dim and undo flow` | `북마크` 탭, #30 `DELETE`/`PUT` | `🔖` 해제 → `"되돌리기"` | `"북마크를 해제했어요"`, `DELETE`·`PUT` 각 1회, 카드 복원 | 북마크 탭 분기 누락 (결정 2) |
| `MY-1-P2` | `double press on same card sends one request and failed delete keeps card` | #29 `DELETE` deferred 후 reject | 같은 카드 `♡` 2번 → reject | `DELETE` 1회, 카드 흐려지지 않음, `"좋아요를 취소하지 못했어요. 다시 해 주세요"` | 진행 중 가드 누락·실패 시 카드 사라짐 (예외 #3·#5) |
| `MY-1-P2` | `next page failure keeps cards and retries same cursor` | 1쪽 `next_cursor: "c1"`, 2쪽 첫 호출 503 후 200 | 끝까지 스크롤 → 실패 → `"↻ 새로고침"` / 한 번 더 끝 도달 | 1쪽 카드 유지, `"더 불러오지 못했어요"`, 재시도 `cursor === "c1"`, 성공 후 이어 붙임·중복 0, 끝이면 `"모두 봤어요"` | 실패 시 목록 비움·커서 전진·중복 요청 (예외 #1) |
