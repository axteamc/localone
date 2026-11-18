# 진행 L3b 대출·반납, 내 정보 — 감사 + 시안

상태: **완료** (D 선택 반영 완료: 1 = A 압축·1줄 고정, 2 = A)
추천 AI: **시니어** · 브랜치: `design/mock-loans-me` · PR: #190 · 코드 수정 없음(시안 HTML + 이 파일만)

## 시작 멘트

```
페이지 디자인 병렬 작업 L3b(대출·반납, 내 정보 감사 + 시안)를 시작해. 나는 D야. 코드는 고치지 마.

먼저 읽어: 개발산출물/병렬작업_페이지디자인/README.md(규칙), 이 파일, DESIGN.md "원칙 (확정)"(글자와 공간 규칙 7개)·"페이지 적용 레시피"·결정 기록(주 버튼 무광 판, 곡률 위계, 홈 큐브 파사드), 개발산출물/시안/홈_파사드_큐브_시안.html(기준 재질), 대상 코드(mobile/app/(tabs)/loans.tsx, mobile/src/features/loan-assistant/, mobile/app/(tabs)/me.tsx, mobile/src/features/my-collection/)와 계약 ../team/contracts/loan-assistant.md·my-collection.md의 화면 칸.

선행 조건: 문서 PR(design/page-pass-1)이 main에 머지됐는지. 아니면 시작하지 말고 알려 줘.
git: 최신 main에서 새 브랜치 design/mock-loans-me. gh는 axteamc 레포에서만 Hunseokc로, 끝나면 choise-hun 복구.

시작 전에: 웹 390·1280 스크린샷으로 두 페이지 지금 모습(EXPO_PUBLIC_API_URL=http://localhost:8000). 내 정보의 바탕은 이미 공통 유리판(커밋 0015041), MY-1은 글자 500 반영 완료(PR #177). 로그인 안 한 상태·빈 목록·반납일 임박 등 상태별로 본다.

할 일: ① 감사 — 두 페이지가 레시피 표와 다른 점 목록, 700·600이 남은 곳, 노랑 채움 직접 사용처. ② 중심 요소 — 후보 3개씩(예상: 반납일 표시를 계기판 목소리로 어디까지, 내 정보 칸 제목·목록 구성), 나머지는 기본값(Claude). ③ 시안 HTML 하나(개발산출물/시안/대출_내정보_파사드_시안.html, 템플릿 ../team/templates/시안.html 구조). ④ 브라우저로 열어 보여 주고 고를 것만 질문으로 끝내기(D에게 이유 묻지 않기).
건드리지 말 것: 코드, 공용 문서, 계약서. 계약과 어긋나는 제안은 시안에 "제안"으로만 두고 이 파일 "D 세션에 넘길 것"에 적기.
끝나면: 이 파일 상태·감사 결과·후보·"D 세션에 넘길 것" 맞추고 커밋(push·PR은 내가 말할 때).
```

## 감사 결과

- **선행 조건 확인:** `origin/main` `8b6f151`에 `design/page-pass-1`(PR #186) 머지 확인(이어 `6bf8e77`에 L1 `design/theme-base` PR #187도 머지됨).
- **웹 390·1280 상태별 스크린샷 확인 경로(세션 스크래치 보관, 커밋 제외):**
  - `scratch/audit_l3b/390_loans_signed_out.png`, `390_loans_empty.png`, `390_loans_populated.png`, `390_loans_returned.png`, `390_loans_due_sheet.png`
  - `scratch/audit_l3b/390_me_signed_out.png`, `390_me_empty.png`, `390_me_populated.png`
  - `scratch/audit_l3b/1280_loans_signed_out.png`, `1280_loans_empty.png`, `1280_loans_populated.png`, `1280_loans_returned.png`, `1280_loans_due_sheet.png`
  - `scratch/audit_l3b/1280_me_signed_out.png`, `1280_me_empty.png`, `1280_me_populated.png`
- **레시피 표 대비 차이 목록:**
  1. **바탕 (`panelFrosted`):**
     - `mobile/app/(tabs)/loans.tsx:50`과 `mobile/src/features/my-collection/MyCollectionScreen.tsx:257`은 `panelFrosted` 반영 완료(커밋 `0015041`).
     - **불일치 (`ProfileHeader` · `CollectionTabs`):** `ProfileHeader.tsx:69`와 `CollectionTabs.tsx:40`이 `backgroundColor: C.bg`(`#E1E1DE`)를 쓰고 있어, 위쪽 `MY` 머리 띠(`panelFrosted`)와 아래 피드(`panelFrosted`) 사이가 어두운 띠로 갈라져 보임.
  2. **머리 띠 · 아래 탭 (`headerOptions("LOANS")` · `headerOptions("MY")`):**
     - `mobile/app/(tabs)/_layout.tsx:39,44`에 유리판 머리 띠·영어 표찰(`LOANS`·`MY`)과 아래 탭 줄눈·2px `inkStrong` 눈금 반영 완료.
  3. **카드(정보·목록) 및 시트·확인창 재질·곡률 (`cardSurface(theme, { onPanel: true })`, 곡률 9 `radii.infoCard`):**
     - `LoansSection.tsx:472,476,513`: 대출 카드(`card`), 빈 목록·권한 거부·오류 상자(`box`), 반납 확인 창(`dialog`)이 모두 평면 `c.paper` + 옛 곡률 18(`radii.card`) 사용(1px 줄눈·2px 받침 없음).
     - `LoanPlansSection.tsx:218,225-226`: 빌릴 예정 카드(`card`)와 빈 목록·오류·배너 상자(`box`)가 평면 `c.paper` + 곡률 18(`radii.card`) 사용.
     - `StartLoanButton.tsx:132-133`: 책 상세 내 대출 기록 안내 상자(`note`)가 `c.paper` + 곡률 18(`radii.card`).
     - `DueDateSheet.tsx:190-192`: 기한 수정 하단 시트(`sheet`)가 `c.paper` + 위 모서리 곡률 18(`radii.card`) 사용.
     - (유지 대상) 내 정보의 게시물 카드(`PostCard.tsx:76`)와 스켈레톤(`MyCollectionScreen.tsx:279`)은 게시물 이미지 카드이므로 레시피("18은 게시물·모임 카드만")에 따라 `radii.card`(18) 유지.
  4. **제목·칸 제목·글자 크기·무게 위계 (`type.pageTitle` 24/400, `type.title` 22/400 `inkSoft`, 규칙 1·2):**
     - `loans.tsx:53`(`대출·반납`, 24/400), `LoansSection.tsx:459`(`내 대출`, 22/400), `LoanPlansSection.tsx:216`(`빌릴 예정`, 22/400)은 반영 완료.
     - **불일치:**
       - `ProfileHeader.tsx:77` 닉네임(`17/500 C.text`): 화면 상단 주인공 이름이 `17/500`이라 본문(14)과 1.5배 크기 차이가 나지 않음(`type.title` 22/400 `inkSoft` 대상).
       - `MyCollectionScreen.tsx:260` 비로그인 제목(`17/500 C.text`), `:304` 빈 탭 제목(`15/500 C.text`)이 레시피 빈 화면 기준(`22/400 inkSoft`)과 다름.
       - `LoansSection.tsx:514` 반납 확인 창 제목(`17/500`), `DueDateSheet.tsx:199` 기한 수정 시트 제목(`17/500`)도 500 무게 사용.
  5. **두 목소리 (`type.gauge` 계기판 목소리 vs 한글 사람 목소리, 규칙 4):**
     - `LoansSection.tsx:29-31,481`: `"대출 2026-11-04 · 예정 2026-11-18 (추정)"`과 `"대출 2026-10-28 · 반납 2026-11-10"`이 한글 단어와 날짜 숫자를 `13px c.textSub` 한 줄에 섞어 써서 390 폭에서 두 줄(`16`, `18 (추정)`)로 어중간하게 줄바꿈됨.
     - `dday.ts:7-24` & `LoansSection.tsx:340-342,368-370`: D-day 표시(`연체 2일`·`오늘 반납`·`D-2`·`D-8`)와 `반납 완료`가 계기판 목소리(`type.gauge`)가 아니라 색 채움 알약(`13/500`)으로 되어 있음.
     - `DueDateSheet.tsx:9,200`: `"대출일 2026-11-02부터 고를 수 있어요."`가 한 줄 일반 텍스트로 섞여 있음.
  6. **주·보조 버튼 및 무거운 표식 1개 원칙 (규칙 5·7):**
     - **진한 채움(`inkStrong`) 직접 사용처 5곳:**
       1. `LoansSection.tsx:468`: `"빌린 책"` / `"지난 대출"` 선택 탭(`tabOn`)이 `backgroundColor: c.inkStrong` 채움 알약.
       2. `dday.ts:19`: `"오늘 반납"`(`urgent`) 알약이 `colors.inkStrong` 채움(선택 탭과 함께 화면에 검은 덩어리가 여러 개 노출됨).
       3. `DueDateSheet.tsx:221`: 시트 하단 `"저장"` 버튼이 무광 판(`ACT.primary`) 대신 `backgroundColor: c.inkStrong`, `borderRadius: theme.radii.inner`(12)를 직접 씀.
       4. `MyCollectionScreen.tsx:262-269`: 비로그인 `"로그인"`과 빈 탭 `"가까운 도서관 둘러보기"`(`fillButton`)가 `backgroundColor: C.inkStrong` 채움을 직접 씀(`/loans` 비로그인은 `ACT.primary` 무광 판이라 두 탭이 서로 다름).
       5. `MyCollectionScreen.tsx:288,328`: 흐린 카드 `"취소함"` 배지(`dimTag`)와 하단 토스트(`notice`)가 `C.inkStrong` 채움.
     - **보조 버튼·칩 편차:** `LoansSection.tsx:487,498`(`기한 수정`·`반납했어요`·`더 보기`), `LoanPlansSection.tsx:233,242`(`빼기`·`더 보기`), `DueDateSheet.tsx:203`(가감 칩), `ProfileHeader.tsx:79,93`(`프로필 수정`·`↻ 새로고침`), `MyCollectionScreen.tsx:308`(`↻ 새로고침`)이 `ACT.secondary`(`panelFrosted` + 1px `seamHairline`) 대신 투명 바탕 + `borderColor: c.divider`를 따로 정의해 씀.
  7. **입력 칸 (`DueDateSheet.tsx:211-218`) 및 빈 화면 (`MyCollectionScreen.tsx:294-305`):**
     - `DueDateSheet.tsx:211-218`: 날짜 입력 칸이 `c.cream` 바탕 + 테두리 없음 + `radii.pill`(18) → 레시피 `paper` 바탕 + 1px `seamHairline` + 곡률 9(`radii.infoCard`).
     - `MyCollectionScreen.tsx:294-305`: 빈 탭에 56×56 `surface2` 회색 원(`emptyIcon`)이 있어 레시피 "빈 화면 — 그림·색 덩어리 없음"과 어긋남.
- **굵기 700·600 남은 곳:** `mobile/app/(tabs)/loans.tsx`, `mobile/src/features/loan-assistant/*.ts(x)`, `mobile/src/features/book-search/LoanPlansSection.tsx`, `mobile/app/(tabs)/me.tsx`, `mobile/src/features/my-collection/*.ts(x)` 전수 검색 결과 **0건** (모두 `"400"` 또는 `"500"`).
- **노랑 채움(`fill1` / `onFill`) 직접 사용처:**
  1. `mobile/src/features/loan-assistant/dday.ts:21`: D-day 임박(`soon`, `1 <= dDay <= 3`) 알약 배경에 `colors.fill1` 직접 사용 (`return { bg: colors.fill1, fg: colors.text }`).
  2. `mobile/src/features/local-feed/PostMenu.tsx:218` (내 정보 화면에서 호출하는 카드 메뉴): 켜진 아이콘 색(`iconOn`)에 `C.fill1` 직접 사용. (단색 게시물 카드 배경 `image_color: "fill1"`은 창 안 콘텐츠라 정상).

## 중심 요소 후보와 D 결정

시안 파일: [대출_내정보_파사드_시안.html](../시안/대출_내정보_파사드_시안.html) (`check_mockup.py` 통과)

| 요소 | 후보 | 추천 | D 결정 |
| --- | --- | --- | --- |
| 1. 대출·반납(`/loans`) 반납일·D-day 계기판 표시와 카드 구성 (`#el-loans-dday`) | **A** 전면 계기판 숫자판(`+02D`·`D-DAY`·`D-02`·`D-08`) + 6px 상태 점(색 채움 알약 없음) + 바로 밑 `수정` + 계기판 날짜 줄 + 아래 줄눈 `반납->` · **B** 연체·당일만 작은 직사각 상태 칩(곡률 9) 유지, `D-2`(노랑 제거)·`D-8`은 무채색 계기판 테두리 표찰 + 평면 보조 버튼 · **C** 기존 4단계 색 알약(`fill1`·`inkStrong` 포함) 유지 + 무광 카드(곡률 9)·계기판 날짜 줄만 적용 | **A** | **A (압축·1줄 고정)** (`"1 - A (내용만 정리 압축하자)"`, `"MOBILE REMINDERS ONLY · 알림은 휴대폰 앱에서만 와요 -> 알림은 앱에서만 와요"`, `"기한 수정 -> 수정 (+o 연체 2일 여기 밑에 "수정"만 넣고 글자 크기 맞추고 두께만 지금처럼 해서 시안 보여줘)"`, `"반납했어요 -> 반납->"`, `"기존에 한 줄 처리되던 버튼, 섹션은 어떻게 하든 한 줄로 표기되도록 한다. 첨부파일처럼 2줄로 보이기 금지"`) |
| 2. 내 정보(`/me`) 위쪽 프로필·3탭 머리 구성과 게시물 모음 목록 표현 (`#el-me-layout`) | **A** 유리판 일체형(`ProfileHeader`·`CollectionTabs` 배경을 `panelFrosted`로 통일 + 22/400 닉네임·계기판 표찰 + 순수 이미지 `PostCard` 2열) · **B** 상단 밝은 무광 판(`panelLit`) 도크 안에 프로필+3탭 묶기 + 3탭 영문·한글 2단 표찰(`POSTS`·`LIKES`·`SAVED`) + 세로 줄눈 · **C** 유리판 머리 + 2열 `PostCard` 아래마다 계기판 출처 줄(`도서관 · 수집 날짜`) 덧붙이기 | **A** | **A** (`"2 - A"`) |

## 진행 기록

- 2026-11-18: `origin/main`에 `design/page-pass-1`(#186) 및 `design/theme-base`(#187) 머지 확인.
- 2026-11-18: 웹 390·1280에서 `/loans`(비로그인·빈 목록·4단계 D-day 및 빌릴 예정·지난 대출·기한 수정 시트)와 `/me`(비로그인·빈 탭·2열 게시물 목록) 스크린샷 16장 촬영 및 레시피 전수 감사 완료.
- 2026-11-18: `개발산출물/시안/대출_내정보_파사드_시안.html` 작성(`../team/tools/check_mockup.py` 통과), 브라우저로 열기 및 `design/mock-loans-me` 브랜치 커밋·push·PR #190 생성.
- 2026-11-18: D 선택(`1 - A 압축·1줄 고정`, `2 - A`) 반영: 상단 안내 `"알림은 앱에서만 와요"`, 오른쪽 D-day 칸의 `● 연체 2일`(상태 줄) 바로 밑에 같은 크기·두께(500)로 `"수정"` 배치, 하단 줄눈 행동 `"반납->"`, 모든 버튼·섹션·날짜 줄 1줄 고정(`white-space: nowrap` / `numberOfLines={1}`) 적용 후 커밋·push.

## D 세션에 넘길 것

1. **`DESIGN.md` 결정 기록 추가 행 (2026-11-18 D 결정):**
   - **대출·반납 D-day 표시와 카드 구성(2026-11-18):** 채택 **A 압축·1줄 고정 (전면 계기판 숫자판 + 상태 점 밑 `수정` + 아래 줄눈 `반납->`)** — 노랑(`fill1`)·남색(`inkStrong`) 배경 채움 알약을 모두 빼고, 무광 카드(`panelLit` + 1px `seamHairline` + 아래 2px `reliefBottomMid`, 곡률 9 `radii.infoCard`)의 오른쪽 세로 줄눈 칸에 계기판 숫자(`+02D`·`D-DAY`·`D-02`·`D-08`) + 6px 상태 점과 한글 상태(`● 연체 N일`·`● 오늘 반납`·`● 임박`·`● 여유`) + **바로 그 밑에 같은 글자 크기·두께(500, `inkStrong`)로 `"수정"` 버튼**을 둔다. 대출·예정 날짜는 `type.gauge`로 1줄에 표기하고, 카드 아래 1px 줄눈에는 왼쪽 상태 표찰·오른쪽 **`"반납->"`**(빌릴 예정 카드는 `"빼기"` · `"빌렸어요->"`)만 둔다. 웹 상단 알림 안내는 **`"알림은 앱에서만 와요"`** 한 줄로 줄인다. 차선: 없음. 탈락: B(연체·당일만 칩), C(기존 4단계 색 알약). D 말: `"1 - A (내용만 정리 압축하자)"`, `"MOBILE REMINDERS ONLY · 알림은 휴대폰 앱에서만 와요 -> 알림은 앱에서만 와요"`, `"기한 수정 -> 수정 (+o 연체 2일 여기 밑에 "수정"만 넣고 글자 크기 맞추고 두께만 지금처럼 해서 시안 보여줘)"`, `"반납했어요 -> 반납->"`, `"기존에 한 줄 처리되던 버튼, 섹션은 어떻게 하든 한 줄로 표기되도록 한다. 첨부파일처럼 2줄로 보이기 금지"`
   - **내 정보 프로필·3탭 머리 구성과 수집 목록 표현(2026-11-18):** 채택 **A 유리판 일체형 (`panelFrosted` 통일 + 22/400 이름·계기판 + 순수 이미지 2열)** — `ProfileHeader`·`CollectionTabs` 배경을 `C.bg`에서 `panelFrosted`로 통일하고, 닉네임은 `type.title`(22/400 `inkSoft`) + 위 `MEMBER · PROFILE`(`type.gauge`), 아바타(64)는 무광 판 원, `"프로필 수정"`·`⚙`는 평면 보조 버튼(`actionColors().secondary`), 3탭 바는 1px `seamHairline` + 2px `inkStrong` 밑줄, 아래는 `PostCard`(곡률 18) 2열 메이슨리로 둔다. 차선: 없음. 탈락: B(상단 밝은 무광 판 도크 + 2단 탭), C(카드 아래 도서관·날짜 캡션 줄). D 말: `"2 - A"`
2. **레시피 표에 더할 것 / L4 반영 메모 (중요 원칙):**
   - **[중요] 버튼·섹션 머리·날짜·상태 줄 1줄 고정 규칙:** 기존에 한 줄로 처리되던 모든 버튼(`빌린 책`, `지난 대출`, `수정`, `반납->`, `프로필 수정` 등), 섹션 머리(`ACTIVE LOANS · 04`, `내 대출`, `빌릴 예정`), 날짜 줄(`2026.11.04 — 11.18 · 추정`)은 좁은 화면(390px 및 스크롤바 포함 폭)에서도 **절대 2줄로 줄바꿈되지 않도록** `numberOfLines={1}`·`flexShrink: 0`을 강제한다.
   - **비로그인·빈 화면 통일:** 비로그인 화면(`/loans`, `/me`)은 화면의 유일한 주 행동이 `"로그인"`이므로 `22~24/400 inkSoft` 제목 + 계기판(`SIGN IN REQUIRED`) + 무광 판 주 버튼(`actionColors().primary`)으로 통일하고, 로그인 후 빈 탭·빈 구역(`empty-posts/reactions/bookmarks`, 빈 빌릴 예정)은 레시피 "빈 화면(그림·색 덩어리 없음)"에 맞춰 56px 회색 원(`emptyIcon`)과 `inkStrong` 채움 버튼을 제거하고 `22/400 inkSoft` + 계기판 + 평면 보조 버튼(`actionColors().secondary`)으로 맞춘다.
   - **세그먼트 탭(`빌린 책` / `지난 대출`):** 선택 탭에 `inkStrong` 채움 알약을 쓰지 않고, 유리판 틀(`panelFrosted` + 1px `seamHairline`, 곡률 9) 안에 선택 탭만 밝은 무광 판(`panelLit` + 1px 줄눈 + 1px 받침)으로 표시해 화면 내 무거운 표식 1개(규칙 7)를 지킨다.
   - **취소 흐림 배지(`취소함`) 및 하단 되돌리기 바(`notice`):** `inkStrong` 채움 대신 무광 판(`panelLit` + 1px `seamHairline` + 2px 받침, 곡률 9)을 쓴다.
3. **계약서(`../team/contracts/loan-assistant.md`, `book-search.md`, `my-collection.md`) 화면 칸 개정 사항 (L4 착수 전 D 반영):**
   - **`loan-assistant.md` LOAN-1 M8·M9, LOAN-2 E6~E8, LOAN-3 T9·T11 (정할 것 1 후보 A 채택 반영):**
     - **M8·M9 대출 카드 및 D-day 표시:** 카드는 `cardSurface(theme, { onPanel: true })`(`panelLit` + 1px `seamHairline` + 2px `reliefBottomMid`, 곡률 9 `radii.infoCard`). 오른쪽 세로 줄눈 칸에 계기판 숫자(`+02D`·`D-DAY`·`D-02`·`D-08`) + 6px 상태 점(`loanOut`·`inkStrong`·`fill1`·`surface3`)과 한글 상태(`연체 N일`·`오늘 반납`·`임박`·`여유`)를 두고(배경 채움 알약 제거), **바로 그 밑에 같은 글자 크기·두께(500)의 `"수정"` 버튼**(기존 `"기한 수정"`에서 압축)을 둔다. 카드 아래 줄눈 오른쪽 행동 문구는 **`"반납->"`**(기존 `"반납했어요"`에서 압축, 반납 확인 창 내부 확인 버튼은 `"반납했어요"` 유지)로 개정.
     - **T9 웹 알림 안내 문구:** `"알림은 휴대폰 앱에서만 와요"` → **`"알림은 앱에서만 와요"`**(1줄 고정).
     - **E6 `DueDateSheet`:** `panelLit` 시트(위 곡률 9 `radii.infoCard`), 입력 칸 `paper` + 1px `seamHairline` + 곡률 9, `"저장"` 무광 판 주 버튼(`actionColors().primary`, `radii.control`).
     - **E7 `"빌린 책"`/`"지난 대출"` 세그먼트 탭:** 곡률 9 유리판 세그먼트(선택 탭 `panelLit`, 1줄 고정).
     - **E8 반납 확인 창 및 T11 권한 거부 배너:** `panelLit` 무광 카드(`radii.infoCard` 9).
   - **`book-search.md` LIB-3 N10 (`LoanPlansSection`):**
     - 빌릴 예정 카드·빈 상자 `cardSurface(theme, { onPanel: true })`(곡률 9 `radii.infoCard`), 카드 아래 줄눈 행동은 왼쪽 `"빼기"` · 오른쪽 `"빌렸어요->"`(1줄 고정).
   - **`my-collection.md` MY-1 Y-O1 · Y-O2 · Y-O3 · Y-O4 (정할 것 2 후보 A 채택 반영):**
     - **Y-O1 `ProfileHeader`:** 배경 `C.bg` → `panelFrosted`, 닉네임 `17/500` → `type.title`(22/400 `inkSoft`) + 위 `MEMBER · PROFILE`(`type.gauge`), 아바타(64) 무광 판 원, `"프로필 수정"`·`⚙`는 평면 보조 버튼(`actionColors().secondary`, 1줄 고정).
     - **Y-O2 `CollectionTabs`:** 배경 `C.bg`·테두리 `divider` → `panelFrosted` + 1px `seamHairline` + 선택 탭 아래 2px `inkStrong` 밑줄(1줄 고정).
     - **Y-O3 빈 상태(`empty-*`) 및 비로그인:** 빈 탭의 원형 아이콘(56, `surface2`) 제거 + 안내 제목 `type.title`(22/400 `inkSoft`) + `"가까운 도서관 둘러보기"` 버튼을 평면 보조 버튼(`actionColors().secondary`)으로, 비로그인 `"로그인"` 버튼을 무광 판 주 버튼(`actionColors().primary`)으로 개정.
     - **Y-O4 흐린 카드 `"취소함"` 태그 및 하단 되돌리기 안내 바:** `inkStrong` 채움 → 무광 판(`panelLit` + 1px `seamHairline` + 2px 받침, 곡률 9).
