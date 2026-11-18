# 진행 L3c 글쓰기·글 상세, 설정, 방문 페이지 — 감사 + 시안

상태: **완료** (D 선택 반영 완료: 1 = A 단일 빈 액자 + 첨부 작은 창, 2 = A + C 본문 위·도서 카드 아래·`구매`·북마크 아이콘)
추천 AI: **시니어** · 브랜치: `design/mock-compose-settings-visit` · PR: (번호) · 코드 수정 없음(시안 HTML + 이 파일만)

## 시작 멘트

```
페이지 디자인 병렬 작업 L3c(글쓰기·글 상세, 설정, 방문 페이지 감사 + 시안)를 시작해. 나는 D야. 코드는 고치지 마.

먼저 읽어: 개발산출물/병렬작업_페이지디자인/README.md(규칙), 이 파일, DESIGN.md "원칙 (확정)"(글자와 공간 규칙 7개)·"페이지 적용 레시피"·결정 기록(주 버튼 무광 판, 곡률 위계, 홈 큐브 파사드), 개발산출물/시안/홈_파사드_큐브_시안.html(기준 재질), 개발산출물/시안/방문_페이지_시안.html(방문 페이지 기존 시안, 도서관 룩은 M2라 바꾸지 않음), 대상 코드(mobile/app/posts/new.tsx, mobile/app/posts/[postId].tsx, mobile/src/features/local-feed/, mobile/app/settings.tsx, mobile/app/libraries/[libraryId].tsx)와 계약 ../team/contracts/local-feed.md·library-visit.md·auth.md의 화면 칸.

선행 조건: 문서 PR(design/page-pass-1)이 main에 머지됐는지. 아니면 시작하지 말고 알려 줘.
git: 최신 main에서 새 브랜치 design/mock-compose-settings-visit. gh는 axteamc 레포에서만 Hunseokc로, 끝나면 choise-hun 복구.

시작 전에: 웹 390·1280 스크린샷으로 지금 모습(EXPO_PUBLIC_API_URL=http://localhost:8000). 이 PC 로컬 DB는 시험 데이터라 visit·compose·detail은 웹 검사에서 데이터 없음으로 실패한다(디자인과 무관) — 시안은 가짜 데이터로 그린다.

할 일: ① 감사 — 네 화면이 레시피 표와 다른 점 목록, 700·600이 남은 곳, 노랑 채움 직접 사용처(ComposeScreen·PostMenu·VisitScreen·ReactionButton). ② 중심 요소 — 후보 3개씩(예상: 글쓰기 입력 칸·사진 자리, 방문 페이지는 레시피만이라 거의 없음), 나머지는 기본값(Claude). 설정은 레시피만 예상. ③ 시안 HTML 하나(개발산출물/시안/글쓰기_설정_방문_파사드_시안.html). ④ 브라우저로 열어 보여 주고 고를 것만 질문으로 끝내기(D에게 이유 묻지 않기).
건드리지 말 것: 코드, 공용 문서, 계약서, 방문 페이지 도서관 룩(M2).
끝나면: 이 파일 상태·감사 결과·후보·"D 세션에 넘길 것" 맞추고 커밋(push·PR은 내가 말할 때).
```

## 감사 결과

- **선행 조건 확인:** `origin/main` `8b6f151`에 `design/page-pass-1`(PR #186) 머지 확인(현재 `main` `587149c`, L1 `design/theme-base` #187 및 L2 `design/home-cube` #191 포함).
- **웹 390·1280 스크린샷 확인 경로(세션 스크래치 보관, 커밋 제외):**
  - 실서버(`EXPO_PUBLIC_API_URL=http://localhost:8000`) 캡처: `scratch/audit_l3c/390_visit_real.png`, `390_visit_empty.png`, `390_detail_real.png`, `390_compose_signed_out.png`, `390_settings_signed_out.png`, `1280_visit_real.png`, `1280_visit_empty.png`, `1280_detail_real.png`, `1280_compose_signed_out.png`, `1280_settings_signed_out.png`
  - 로그인·데이터 모의 캡처: `scratch/audit_l3c/390_compose_signed_in.png`, `390_compose_preview.png`, `390_detail_rich.png`, `390_settings_signed_in.png`, `390_settings_confirm.png`, `1280_compose_signed_in.png`, `1280_compose_preview.png`, `1280_detail_rich.png`, `1280_settings_signed_in.png`, `1280_settings_confirm.png`
- **레시피 표 대비 차이 목록:**
  1. **글쓰기 (`/posts/new`, `ComposeScreen.tsx`):**
     - 바탕(`ComposeScreen.tsx:725`): `C.bg` 사용(유리판 `panelFrosted` 아님).
     - 이중 머리: `app/_layout.tsx:25`의 `headerOptions("POST")` 아래 `ComposeScreen.tsx:546`이 자체 `header`(`✕` · `새 게시물` · `올리기`, `C.divider` 경계)를 한 번 더 그림.
     - 제목·단계 위계: `headerTitle`(`:738` `16/500`), `step`(`:759` `13/500`), `dialogTitle`(`:825` `16/500`)만 있고 `24/400 inkSoft` 화면 제목 및 계기판 목소리(`type.gauge`) 없음.
     - 곡률 위계·테두리: 이미지 선택 버튼 `choice`(`:761`)이 `C.paper` + `radii.card`(18) · 테두리 없음, `input`(`:791`)이 `radii.inner`(12) · `seamHairline` 테두리 및 `inkStrong` 1.5px 포커스 없음, 오류 배너(`:752`)·메뉴(`:839`)가 `radii.inner`(12), 확인창(`:824`)·시트(`:853`)가 `radii.card`(18) + 그림자. (참고: 게시물 미리보기 `image` `:773`의 `radii.card` 18은 피드 카드 정체성이라 유지 대상).
     - 링크·토스트: `link`(`:810`)가 `textDecorationLine: "underline"` 사용(레시피: 500 + `"→"`/`"↗"`), `toast`(`:870`)가 `C.inkStrong` 채움.
     - 4:5 미리보기 선택 후 입력 칸(`2. 글자`·`3. 감상`·`4. 책·도서관`)이 아래로 크게 밀림.
  2. **글 상세 (`/posts/[postId]`, `posts/[postId].tsx`, `PostDetail.tsx`, `ReactionButton.tsx`, `PostMenu.tsx`, `SameBookPosts.tsx`):**
     - 바탕(`posts/[postId].tsx:22`, `PostDetail.tsx:355`): `C.cream` 사용(`panelFrosted` 아님).
     - 뒤로가기(`PostDetail.tsx:362-376`): 이미지 위 `backOnImage`가 `44×44` 흰 원(`C.paper`, `radii.control`, 그림자) — `DESIGN.md` 확정 형태("알약 없이 굵은 `‹` 하나 + 은은한 그림자")와 다름.
     - **1280px `WebFrame` 레이아웃 버그(`PostDetail.tsx:90-91`):** `WebFrame`이 데스크톱 웹을 `480px` 칼럼으로 감싸는데 `useWindowDimensions().width >= 768`로 판정해 `1280px` 화면의 480px 칼럼 안이 2열(`wideRow`)로 좁게 쪼개져 글자·도서 카드가 심하게 줄바꿈됨(`1280_detail_rich.png`).
     - 저장·공감 버튼(`ReactionButton.tsx:108,114,118-120`): 기본 `저장` 버튼이 노랑(`C.fill1`) 직접 채움, 저장됨 상태(`saveOn`)가 진한 `C.inkStrong` 채움, 켜진 하트(`heartOn`)가 `C.fill1`.
     - 도서 대여·구매 박스(`PostDetail.tsx:399-413`): `loanButton`이 `C.paper` + `radii.card`(18) (1px `seamHairline`·2px `reliefBottomMid`·곡률 9 없음), `loanStatus`가 도서관명·기준일·상태를 `15px` 한 줄에 섞음(`type.gauge` 미적용), `buyButton`이 투명 바탕 + `C.divider` 테두리(`ACT.secondary` 아님).
     - 이어 읽기·메뉴·토스트: `SameBookPosts.tsx:66` 섹션 제목 `18/500 C.text`(`type.title` `22/400 inkSoft` 아님), `smallMenu`(`PostDetail.tsx:387`)·`toast`(`:423`)·`PostMenu`(`PostMenu.tsx:207,225`)가 `C.paper` + `radii.inner`/`card`(12/18) + 그림자.
  3. **설정 (`/settings`, `app/settings.tsx`):**
     - 바탕(`settings.tsx:143`): `theme.colors.bg` 사용(`panelFrosted` 아님). `24/400 inkSoft` 화면 제목·계기판 표찰 없음.
     - **형태 버그(`settings.tsx:166`):** `confirm` 탈퇴 확인 카드에 `borderRadius: theme.radii.control`(9999)이 들어가 둥근 타원 알약 모양이 됨(`390_settings_confirm.png`), 바탕도 `cream` + `surface3` 테두리.
     - **규칙 7 위반(`settings.tsx:73,109`):** 탈퇴 확인 카드를 펼치면 위 `로그아웃`(`ACT.primary`)과 아래 `탈퇴하기`(`ACT.primary`) 두 개의 주 버튼이 동시에 노출됨.
     - 비로그인 안내(`settings.tsx:146-148`): `16/500 C.text` (`22/400 inkSoft` + 계기판 `SIGN IN REQUIRED` 아님).
  4. **방문 페이지 (`/libraries/[libraryId]`, `libraries/[libraryId].tsx`, `VisitScreen.tsx`, `VisitHeader.tsx`, `VisitMenu.tsx`, `AskDefaultCard.tsx`, `PostCard.tsx`):**
     - 바탕(`libraries/[libraryId].tsx:16`, `VisitScreen.tsx:444`): `C.cream` 사용(M1 `panelFrosted`; **M2 도서관 룩 슬롯·시안은 건드리지 않음**).
     - 머리(`VisitHeader.tsx:98-100,113,121`): `name` `24/500 C.text`(규칙 1: `24/400 inkSoft`), `info` 거리·운영시간이 한 줄 `16px C.textSub` 혼합(`type.gauge` 분리 대상), 접힌 머리 `VisitHeaderFolded`가 `C.cream` + `shadowSoft` + `20/500`(유리판 `panelFrosted` + 1px `seamHairline` 대상).
     - `+` FAB(`VisitScreen.tsx:466-482`): `backgroundColor: C.fill1`, `color: onFill(C.fill1)` 노랑 직접 채움.
     - 빈 피드(`VisitScreen.tsx:460-462`)·불러오기 알약(`:454`)·멘트(`:487`)·시트(`:507`)·`VisitMenu`(`VisitMenu.tsx:99`)·`AskDefaultCard`(`AskDefaultCard.tsx:59`): `18/500` 빈 화면 제목, `C.paper` + `radii.card`(18)/`radii.inner`(12) + 그림자 → `panelLit` + 1px `seamHairline` + 2px `reliefBottomMid` + `radii.infoCard`(9). (`PostCard.tsx:76`의 피드 카드 곡률 18은 유지).
- **굵기 700·600 남은 곳:** `mobile/app/posts/*`, `mobile/app/settings.tsx`, `mobile/app/libraries/*`, `mobile/src/features/local-feed/*.ts(x)` 전수 검색 결과 **0건** (모두 `"400"` 또는 `"500"`, `VisitScreen.tsx:57`의 `600`은 `END_REACHED_PX` 숫자 상수). 단, 제목(`VisitHeader`, `SameBookPosts`, `settings`, `ComposeScreen`)에 `"500"`이 남아 있어 레시피에 따라 `400`으로 낮출 대상 있음.
- **노랑 채움(`fill1` / `onFill`) 직접 사용처 (제거 대상 4파일):**
  1. `mobile/src/features/local-feed/ComposeScreen.tsx:807` — 글자 위치 선택 칩 `pillOn: { backgroundColor: C.fill1 }` (`:117` `PostImage` 단색 카드 배경과 `:875` `onFill(C.inkStrong)` 제외).
  2. `mobile/src/features/local-feed/PostMenu.tsx:218` — 켜진 아이콘 색 `iconOn: { color: C.fill1 }`.
  3. `mobile/src/features/local-feed/VisitScreen.tsx:473,482` — 글쓰기 `+` FAB `backgroundColor: C.fill1`, `color: onFill(C.fill1)`.
  4. `mobile/src/features/local-feed/ReactionButton.tsx:108,114,119` — 켜진 하트 `heartOn: { color: C.fill1 }`, 저장 버튼 `save: { backgroundColor: C.fill1 }`, `saveText: { color: onFill(C.fill1) }`.
  - 참고: `AskDefaultCard.tsx:5`의 `onFill`은 미사용 import(실제 버튼은 `ACT.primary`), `PostCard.tsx:28`은 단색 게시물 카드 배경(창 안 콘텐츠)이라 유지.

## 중심 요소 후보와 D 결정

시안 파일: [글쓰기_설정_방문_파사드_시안.html](../시안/글쓰기_설정_방문_파사드_시안.html) (`check_mockup.py` 통과)

| 요소 | 후보 | 추천 | D 결정 |
| --- | --- | --- | --- |
| 1. 글쓰기(`/posts/new`) 사진 자리와 입력 칸·올리기 배치 (`#el-compose-layout`) | **A** 단일 점선 빈 액자(곡률 18, 내부 타일 박스 없음) → 누르면 주변에 첨부파일 스타일 작은 창(웹: 주변 작은 모달, 4개 아이콘+이름 줄) + 레시피 입력 칸(곡률 9) + 하단 `panelLit` 받침 판 주 버튼 `올리기` (`제안`) · **B** 왼쪽 작은 액자(82×102) + 오른쪽 2×2 선택 타일 + 한눈에 보는 입력 칸 + 계약 F14 그대로 오른쪽 위 `올리기` · **C** 2단계 분리(1단계 큰 사진·글자 → `"다음 →"` → 2단계 요약·감상·책·`올리기`, `제안`) | **A** | **A (단일 빈 액자 + 첨부 작은 창)** (`"1 - A"`, `"큰 빈 액자 프레임에 클릭 시 첨부파일 같은 작은 창이 뜨는 형태로 보여줘. 웹은 모달창이 작게 주변에서 뜨게(A 지금 방식은 박스가 너무 과하게 많은 느낌이야)"`) |
| 2. 글 상세(`/posts/[postId]`) 행동 줄(`저장`·`♡`)과 도서 대여 카드 (`#el-detail-info`) | **A** 이미지 위 알약 없는 `‹` + `♡` 켬 `inkStrong` + 무광 판 주 버튼 `저장` + 도서 대여 카드 위·본문 아래 · **B** 상단 가벼운 무채색 아이콘 4개(`♡`·`🔖`·`↑`·`⋯`) + 책 카드 `실시간 확인 ↗`를 주 버튼으로 강조 · **C** 상단 `POST` 유리판 머리 띠 + 아래 `panelLit` 정보 판(본문 위 · 도서 대여 카드 아래, `제안`) | **A** | **A + C (본문 위 · 도서 카드 아래 · `구매` · 북마크 아이콘)** (`"2 - A + C"`, `"본문이 위로 가고 도서 대여 카드가 아래로 가는 배치 구조만 차용하고 나머지는 A"`, `"멘트 압축 예스24에서 구매 -> 구매"`, `"저장 버튼 북마크 그림으로 변경 (저장 상태면 잉크색 or 붉은색 으로 채우기)"`) |
| (레시피 기본값) 설정(`/settings`) · 방문 페이지(`/libraries/[libraryId]`) · 공용 `PostMenu`·`BookFinder` | 레시피 표 + `actionColors` + `cardSurface` 그대로 적용(방문 페이지 M2 도서관 룩 유지) | 기본값(Claude) | — |

## 진행 기록

- 2026-11-18: `main`(`587149c`, `design/page-pass-1` #186 머지 및 L1·L2 머지) 확인 후 브랜치 `design/mock-compose-settings-visit` 생성.
- 2026-11-18: 웹 390×844 · 1280×800 스크린샷(`EXPO_PUBLIC_API_URL=http://localhost:8000` 실화면 및 로그인/데이터 모의 화면 20장) 촬영 및 네 화면 레시피 대조 감사 완료.
- 2026-11-18: `개발산출물/시안/글쓰기_설정_방문_파사드_시안.html` 작성(`../team/tools/check_mockup.py` 통과), 섹션별 렌더 캡처 확인 후 브라우저에서 열기.
- 2026-11-18: D 선택(`1 - A` 단일 빈 액자 + 첨부 작은 창, `2 - A + C` 본문 위·도서 카드 아래·`구매`·북마크 아이콘)을 시안(`data-chosen="A"`, 명세 패널 `확인`)과 이 파일에 반영.

## D 세션에 넘길 것

1. **`DESIGN.md` 결정 기록 추가 행 (2026-11-18 D 결정):**
   - **글쓰기 사진 자리와 입력 칸·올리기 배치(2026-11-18):** 채택 **A 단일 빈 액자 + 첨부 작은 창 + 하단 무광 판 `올리기`** — `POST` 유리판 머리 띠에 `✕`만 두고 이중 헤더를 없앤다. 선택 전에는 내부 타일 박스 없이 단일 점선 빈 액자(곡률 18)만 두고, 누르면 첨부파일 스타일 작은 창(`panelLit` + 1px `seamHairline` + 곡률 9, 웹은 주변 작은 모달)이 떠 4개 항목(`사진 찍기`·`앨범에서 고르기`·`책 표지`·`단색 배경`)을 고르게 한다. 선택 후 4:5 미리보기 + 입력 칸(`paper` + 1px `seamHairline`, 곡률 9, 포커스 1.5px `inkStrong`) + 위치 칩(노랑 제거) + 하단 `panelLit` 받침 판(곡률 3) 위 무광 판 주 버튼 `올리기`. 차선: 없음. 탈락: B(작은 액자 + 2×2 타일 + 오른쪽 위 `올리기`), C(2단계 분리). D 말: `"1 - A"`, `"큰 빈 액자 프레임에 클릭 시 첨부파일 같은 작은 창이 뜨는 형태로 보여줘. 웹은 모달창이 작게 주변에서 뜨게(A 지금 방식은 박스가 너무 과하게 많은 느낌이야)"`
   - **글 상세 행동 줄과 도서 대여 카드 배치(2026-11-18):** 채택 **A + C (본문 위 · 도서 카드 아래 · `구매` · 북마크 아이콘)** — A를 기본으로(유리판 `panelFrosted` 바탕, 이미지 위 알약 없는 `‹`, `♡` 켬 `inkStrong`, 곡률 9 도서 카드 `cardSurface`) 두되, C의 배치 구조를 차용해 작성자/도서관 줄 바로 아래에 **본문(`body`)을 먼저 두고 도서 대여 카드를 그 아래**로 내린다. 상단 오른쪽 `"저장"` 버튼은 **북마크 그림 아이콘**(미저장 윤곽선, 저장 시 `inkStrong` 채움 — 노랑 제거)으로 바꾸고, 도서 카드 안 구매 버튼 문구는 **`"예스24에서 구매 ↗"` → `"구매 ↗"`**로 압축한다. 차선: 없음. 탈락: A 원안(도서 카드 위·`저장` 알약), B(도서 카드 주 버튼), C 원안(상단 `POST` 머리 띠 + `panelLit` 통합 판). D 말: `"2 - A + C"`, `"본문이 위로 가고 도서 대여 카드가 아래로 가는 배치 구조만 차용하고 나머지는 A"`, `"멘트 압축 예스24에서 구매 -> 구매"`, `"저장 버튼 북마크 그림으로 변경 (저장 상태면 잉크색 or 붉은색 으로 채우기)"`
2. **레시피 표에 더할 것 / L4 반영 메모:**
   - **[중요] `PostDetail.tsx` 1280px `WebFrame` 폭 버그:** `PostDetail.tsx:90-91`이 `useWindowDimensions().width >= 768`을 쓰기 때문에 데스크톱 웹(`1280px`)의 `480px` `WebFrame` 칼럼 안이 2열로 쪼개짐(`1280_detail_real.png`, `1280_detail_rich.png`). L4에서 컨테이너 실측(`onLayout`) 또는 `Math.min(width, APP_MAX_WIDTH)` 기준으로 고쳐 480 칼럼 안에서 1열을 유지해야 함.
   - **설정(`/settings`) 확인창 주 버튼 1개 & 곡률 버그 수정:** `settings.tsx:166`의 `confirm` 곡률 `radii.control`(9999) 타원 버그를 `cardSurface(theme, { onPanel: true })`(곡률 9)로 고치고, 탈퇴 확인 창을 열면 위 `로그아웃`은 `ACT.secondary`로 낮춰 `탈퇴하기` 하나만 주 버튼(`ACT.primary`)으로 유지(규칙 7).
   - **방문 페이지(`VisitScreen.tsx`) `+` FAB:** 노랑 `C.fill1` 채움을 제거하고 무광 판 원형 FAB(`panelLit` + 1px `seamHairline` + 2px `reliefBottomMid` + `+` `inkStrong`, 누르면 1px 내려앉음)로 교체. M2 도서관 룩(4종 팔레트 슬롯)은 바꾸지 않음.
   - **글쓰기(`ComposeScreen.tsx`) 이중 헤더 정리:** `_layout.tsx:25`의 `POST` 유리판 머리 띠와 내부 `header`가 겹치지 않게 정리하고, `radii.inner`(12)를 레시피 위계(`3 / 9 / 18 / 필`)로 통일.
3. **계약서(`../team/contracts/local-feed.md`, `auth.md`) 화면 칸 개정 필요 사항 (L4 착수 전 D 반영):**
   - **`local-feed.md` LOCAL-1 F14 (정할 것 1 A 채택 반영):** 이미지 선택 타일 4개 상시 나열 대신 단일 빈 액자 클릭 시 첨부 작은 창(웹: 주변 작은 팝오버 모달)에서 4항목 선택, `"오른쪽 위 '올리기'"` → 하단 `panelLit` 받침 판 무광 판 주 버튼 `"올리기"`로 개정.
   - **`local-feed.md` LOCAL-2 H9·H14·C3 (정할 것 2 A+C 채택 반영):**
     - H14 상세 세로 배치 순서: 작성자·도서관 줄 → **본문(`body`) → H9 도서 대여/구매 카드** → 이어 읽기 2묶음으로 개정.
     - H14 상단 액션 바 오른쪽 끝: `"저장"`/`"저장됨"` 글자 알약 버튼 → **북마크 그림 아이콘 버튼**(미저장 윤곽선, 저장 시 `inkStrong` 채움, 접근성 이름 `"저장"`/`"저장됨"`)으로 개정.
     - H9·C3 구매 버튼 문구: `"예스24에서 구매 ↗"` → **`"구매 ↗"`**(누르면 `"준비 중이에요"` 유지)로 개정.
   - **공통 L1·레시피 동기화 사항:**
     - `local-feed.md` LOCAL-1 F13: 방문 페이지 `+` FAB 배경 `theme.colors.fill1` → 무광 판(`panelLit` + 1px `seamHairline` + 2px `reliefBottomMid`).
     - `local-feed.md` LOCAL-1 F15·F16·F17 / LOCAL-2 H9·H10·H14: 위치 선택 칩·하트/북마크 켜짐·`저장` 버튼의 `fill1`/`inkStrong` 채움 제거, 입력 칸·대여 카드·구매 버튼·메뉴·확인창 곡률 `radii.infoCard`(9) + 무광 판(`cardSurface`/`actionColors`) 동기화, `backOnImage` 흰 원 알약 제거.
     - `local-feed.md` VISIT-2 G11·G12·G13·G14: `VisitHeader` 이름 `24/400 inkSoft` + 거리/시간 `type.gauge`, 접힌 머리 `C.cream` → `panelFrosted` + 1px `seamHairline`, 빈 피드 `22/400 inkSoft`, 멘트/질문 카드 `radii.infoCard`(9) + `panelLit`.
     - `auth.md` AUTH-2·AUTH-3 C3 (`/settings`): 확인 칸 곡률 `radii.infoCard`(9) `cardSurface`, 확인 중 `로그아웃` 보조 강등(규칙 7).
