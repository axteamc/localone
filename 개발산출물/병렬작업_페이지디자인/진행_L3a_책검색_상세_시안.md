# 진행 L3a 책 검색·결과, 책 상세 — 감사 + 시안

상태: **완료** (D 선택 반영 완료: 1 = C + A 오른쪽 계기판 연도, 2 = B)
추천 AI: **시니어**(시안 설계·판단) · 브랜치: `design/mock-book` · PR: #188 · 코드 수정 없음(시안 HTML + 이 파일만)

## 시작 멘트

```
페이지 디자인 병렬 작업 L3a(책 검색·결과, 책 상세 감사 + 시안)를 시작해. 나는 D야. 코드는 고치지 마.

먼저 읽어: 개발산출물/병렬작업_페이지디자인/README.md(규칙), 이 파일, DESIGN.md "원칙 (확정)"(글자와 공간 규칙 7개)·"페이지 적용 레시피"·결정 기록(주 버튼 무광 판, 곡률 위계, 홈 큐브 파사드), 개발산출물/시안/홈_파사드_큐브_시안.html(C2 큐브·유리판 재질 기준), 대상 코드(mobile/app/search.tsx, mobile/src/features/book-search/SearchScreen.tsx·BookDetailScreen.tsx·LibraryAvailabilityCard.tsx 등)와 계약 ../team/contracts/book-search.md의 화면 칸.

선행 조건: 문서 PR(design/page-pass-1)이 main에 머지됐는지. 아니면 시작하지 말고 알려 줘.
git: 최신 main에서 새 브랜치 design/mock-book. gh는 axteamc 레포에서만 Hunseokc로, 끝나면 choise-hun 복구.

시작 전에: 웹 390·1280 스크린샷으로 두 페이지 지금 모습(EXPO_PUBLIC_API_URL=http://localhost:8000). 책 상세는 소장 카드가 S4에서 확정된 부분(무광 면·곡률 9·"실시간 ↗")이라 바꾸지 않는다.

할 일: ① 감사 — 두 페이지가 레시피 표(바탕·머리·카드·제목·표찰·버튼·목록 줄·빈 화면)와 다른 점 목록, 700·600이 남은 곳, 노랑 채움 직접 사용처. ② 중심 요소 — 바꾸면 화면에서 제일 먼저 보이는 것이 달라지는 요소만 후보 3개씩(예상: 결과 목록 줄 모양, 책 상세 머리 구성), 나머지는 기본값(Claude). ③ 시안 HTML 하나(개발산출물/시안/책검색_상세_파사드_시안.html, 템플릿 ../team/templates/시안.html 구조: 명세 패널, 후보 보존 선택 상자, 추천 하나). ④ 브라우저로 열어 보여 주고 고를 것만 질문으로 끝내기(D에게 이유 묻지 않기).
건드리지 말 것: 코드, 공용 문서, 계약서. 계약 화면 칸과 어긋나는 제안은 시안에 "제안"으로만 두고 이 파일 "D 세션에 넘길 것"에 적기.
끝나면: 이 파일 상태·감사 결과·후보·"D 세션에 넘길 것" 맞추고 커밋(push·PR은 내가 말할 때).
```

## 감사 결과

- **선행 조건 확인:** `origin/main` `8b6f151`에 `design/page-pass-1`(PR #186) 머지 확인.
- **웹 390·1280 스크린샷 확인 경로(세션 스크래치 보관, 커밋 제외):**
  - `scratch/audit_l3a/390_search_entry.png`, `390_search_grid.png`, `390_search_list.png`, `390_detail.png`, `390_detail_cards.png`
  - `scratch/audit_l3a/1280_search_entry.png`, `1280_search_grid.png`, `1280_search_list.png`, `1280_detail.png`, `1280_detail_cards.png`
- **레시피 표 대비 차이 목록:**
  1. **바탕 (`panelFrosted`):** `SearchScreen.tsx:331`과 `BookDetailScreen.tsx:317` 모두 `backgroundColor: c.cream`을 쓰고 있어 유리판(`panelFrosted`)과 어긋남.
  2. **머리 띠 (`headerOptions("LABEL")`):** `app/_layout.tsx:23-24`에는 `headerOptions("SEARCH")`·`headerOptions("BOOK")`이 있으나, `app/search.tsx:11`(`options={{ title: "책 검색" }}`)과 `app/books/[isbn13].tsx:9`(`options={{ title: "책" }}`)가 다시 덮어씀.
  3. **입력 칸 (`paper` + 1px `seamHairline` + 곡률 9 `radii.infoCard`):**
     - `SearchScreen.tsx:338-340`: `borderColor: c.surface3`, `borderRadius: theme.radii.control`(9999 완전한 필) 사용.
     - `RegionPicker.tsx:87-88`: `borderColor: c.divider`, `borderRadius: theme.radii.pill`(18) 사용.
  4. **제목·칸 제목 위계 (`type.pageTitle` 24/400, `type.title` 22/400 `inkSoft`, 규칙 1·2):**
     - `SearchEntry.tsx:179`: `최근 본 도서`·`인기 도서` 칸 제목이 `15/500 c.text`.
     - `BookDetailScreen.tsx:323,342`: 책 제목이 `19/500 c.text`, 구역 제목(`가까운 도서관`·`책 소개`)이 `15/500 c.text`.
     - `SavePlanSheet.tsx:125`: 시트 제목이 `17/500 c.text`.
     - 본문(14~15)과 제목의 크기 차이(1.5배 이상)가 없고 모두 `500` 무게로만 구분됨.
  5. **두 목소리 (`type.gauge` 분리, 규칙 4) 및 목록 줄 (`seamHairline`):**
     - `SearchEntry.tsx:134-138,198`: `인기 도서`와 `전국 · 최근 30일 대출`(`basis_label`)이 한 줄에 섞여 있고, 순위 번호(`1~10`)가 `14/500 c.inkStrong`임.
     - `SearchScreen.tsx:90-92,317,364,368,418`: 출판사(한글)와 출간 연도(숫자)가 `창비 · 2022`로 한 줄에 섞여 있고, 줄 눈금이 `c.surface2`임.
     - `BookDetailScreen.tsx:119-121,308-309`: 출판사·연도 한 줄 혼합, 도시 전체 요약·출처 줄(`checkedAtLabel`)에 `type.gauge` 미적용.
  6. **주·보조 버튼 및 무거운 표식 1개 원칙 (규칙 7):**
     - `actionColors().primary`가 아직 `fill1`(노랑)이라 검색 버튼(`SearchScreen.tsx:350`), `빌릴 예정에 저장`(`BookDetailScreen.tsx:327`), `도시 전체 도서관에서 다시 찾기`(`EmptyAvailability.tsx:50`), `위치 허용해서 주변 찾기`(`RegionPicker.tsx:78`)가 노랑 채움으로 보임(L1에서 `actionColors` 교체 예정).
     - **규칙 7 위반:** 책 상세에서 주변 소장 0곳(`EmptyAvailability`)이 뜨면 상단 `빌릴 예정에 저장`과 하단 `도시 전체 도서관에서 다시 찾기`가 둘 다 `ACT.primary`를 써서 한 화면에 무거운 표식이 2개 노출됨.
     - **예외 직접 채움:** `SearchEntry.tsx:203`의 인기 도서 오류 `다시 해 보기` 버튼이 `actionColors` 대신 `backgroundColor: c.inkStrong`을 직접 씀.
     - **보조 버튼 편차:** `SearchScreen.tsx:398`(`viewBtn`), `BookDetailScreen.tsx:299`(`scopeBtn`), `EmptyAvailability.tsx:56`, `StartLoanButton.tsx:116`이 각각 `paper`/`cream`과 `surface3`/`divider`, 곡률 `pill`/`control`/`inner`로 제각각임.
  7. **카드·빈 화면·시트 곡률 (`radii.infoCard` 9):**
     - `LibraryAvailabilityCard.tsx`는 S4 확정(`panelFrosted` + 1px `seamHairline` + 아래 2px `reliefBottomMid` + `radii.infoCard` 9 + 오른쪽 `실시간 ↗` 38 + `주소·전화 ⌄` 접기)이 이미 반영됨(유지). 단, 화면 바탕이 `panelFrosted`로 바뀌면 카드 바탕은 L1 카드 헬퍼에 맞춰 `panelLit`으로 한 단 띄움.
     - 반면 `SearchScreen.tsx:374`(`stateBox`), `SearchEntry.tsx:201`(`stateBox`), `BookDetailScreen.tsx:312,336,347`(`stateBoxInline`, `note`, `stateBox`), `EmptyAvailability.tsx:47`, `RegionPicker.tsx:75`, `StartLoanButton.tsx:132`, `SavePlanSheet.tsx:116`은 옛 `radii.card`(18)와 평면 `paper`/`cream`을 사용 중.
- **굵기 700·600 남은 곳:** `mobile/src/features/book-search/*.tsx`, `mobile/app/search.tsx`, `mobile/app/books/[isbn13].tsx` 전수 검색 결과 **0건** (모두 `"400"` 또는 `"500"`).
- **노랑 채움(`fill1` / `onFill`) 직접 사용처:** 대상 파일 내 **0건** (모두 `actionColors(theme.colors).primary` 경유).

## 중심 요소 후보와 D 결정

시안 파일: [책검색_상세_파사드_시안.html](../시안/책검색_상세_파사드_시안.html) (`check_mockup.py` 통과)

| 요소 | 후보 | 추천 | D 결정 |
| --- | --- | --- | --- |
| 1. 책 검색 결과(목록·표지) 줄 모양 (`#el-search-results`) | **A** 레시피 줄눈 행(유리판 위 평면 + 1px `seamHairline`, 왼쪽 표지·이름·저자/출판사, 오른쪽 끝 계기판 연도) · **B** 무광 정보 카드 행(곡률 9 + 2px 받침) · **C** 큰 표지(52×72) + 아래 계기판 띠 | **A** | **C + (A의 오른쪽 계기판 연도), 점선 제거** (`"1 - C + (A의 오른쪽 계기판 연도)"`, `"1에서 점선만 제거"`) |
| 2. 책 상세 위쪽(표지·제목·2버튼) 구성 (`#el-detail-head`) | **A** 유리판 위 왼쪽 표지 + 오른쪽 22/400 제목·계기판 연도 + 아래 무광 판 주 버튼(`빌릴 예정에 저장`)·평면 보조 버튼(`빌렸어요`) 세로 배치 · **B** 상단 밝은 무광 판(`panelLit`, 곡률 3) 안에 머리 + 나란한 2버튼 가로 배치(제안) · **C** 표지 옆 오른쪽 칸에 제목과 2버튼 압축(제안) | **A** | **B** (`"2 - B"`) |

## 진행 기록

- 2026-11-18: `origin/main`(`8b6f151`, `design/page-pass-1` 머지) 확인. 웹 390·1280에서 `/search`(진입·2열·1열) 및 `/books/9788936434120`(상단·하단 카드) 스크린샷 촬영 및 레시피 대조 감사 완료.
- 2026-11-18: `개발산출물/시안/책검색_상세_파사드_시안.html` 작성(`../team/tools/check_mockup.py` 통과) 및 브라우저 표시.
- 2026-11-18: D 선택(`1 - C + (A의 오른쪽 계기판 연도)`, 점선 제거, `2 - B`)을 시안(`data-chosen="C"`, `data-chosen="B"`, 명세 패널 `확인`)과 이 파일에 반영.

## D 세션에 넘길 것

1. **`DESIGN.md` 결정 기록 추가 행 (2026-11-18 D 결정):**
   - **책 검색 결과 줄 모양(2026-11-18):** 채택 **C + A의 오른쪽 계기판 연도 (점선 없음)** — 1열 목록은 유리판(`panelFrosted`) 위 1px `seamHairline` 줄눈 행에 큰 표지(52×74) + 오른쪽 위 제목(14/500)·저자 + 오른쪽 끝 출간 연도·ISBN(`type.gauge`) + 오른쪽 아래(점선 없이 여백으로) 출판사·`PUB 연도 · →` 계기판 띠를 함께 둔다. 2열 표지는 표지 아래 제목(14/500) + 저자(왼쪽)·연도(오른쪽 `type.gauge`). 차선: 없음. 탈락: A(레시피 줄눈 행만, Claude 추천이었음), B(무광 정보 카드 행). D 말: `"1 - C + (A의 오른쪽 계기판 연도)"`, `"1에서 점선만 제거"`
   - **책 상세 위쪽 머리 구성(2026-11-18):** 채택 **B 상단 밝은 무광 판(`panelLit`, 곡률 3) + 나란한 2버튼** — 책 표지·제목(`type.title` 22/400 `inkSoft`)·저자·출판사·연도(`type.gauge`)와 두 행동 버튼을 상단 밝은 판(`panelLit`, 아래 1px `seamHairline` + `seamHighlight`, 곡률 3)에 한 덩어리로 담고, 두 버튼은 한 줄(좌 무광 판 주 버튼 `빌릴 예정에 저장` · 우 평면 보조 버튼 `빌렸어요`, 비율 약 `1.55fr : 1fr`)로 나란히 둔다. **한 줄로 표기되는 버튼·상태 줄(`빌릴 예정에 저장`, `빌렸어요`, `어제(추정) 기준 · 대출 가능`, `실시간 ↗` 등)은 절대 2줄로 줄바꿈하지 않는다.** 아래 유리판(`panelFrosted`)에는 S4 확정 소장 도서관 카드가 이어진다. 차선: 없음. 탈락: A(유리판 위 세로 2버튼, Claude 추천이었음), C(표지 옆 오른쪽 칸에 2버튼 압축). D 말: `"2 - B"`
2. **레시피 표에 더할 것 / L4 반영 메모:**
   - 한 화면 안에 빈 상태 카드(`EmptyAvailability`, `RegionPicker`)가 함께 뜰 때, 화면 상단에 이미 주 버튼(`빌릴 예정에 저장`)이 있으면 카드 안의 1순위 행동(`도시 전체 도서관에서 다시 찾기`, `위치 허용해서 주변 찾기`)은 보조 버튼(`actionColors().secondary`)으로 그려 한 화면 무거운 표식 1개(규칙 7)를 지킨다.
   - 화면 바탕이 유리판(`panelFrosted`)으로 바뀜에 따라 책 상세 소장 카드(`LibraryAvailabilityCard`)와 상태/안내 카드의 윗면은 `panelLit`(레시피 "바탕이 유리판이면 `panelLit`")을 쓴다.
3. **계약서(`../team/contracts/book-search.md`, `loan-assistant.md`) 화면 칸 개정 필요 사항 (L4 착수 전 D 반영):**
   - **`loan-assistant.md` LOAN-1 M10 ① (정할 것 2 후보 B 채택에 따른 개정):** 책 상세의 `"빌렸어요"` 위치 설명을 `"빌릴 예정에 저장" 아래 보조 버튼` → `상단 밝은 판(panelLit) 안에서 "빌릴 예정에 저장"(왼쪽 주 버튼) 오른쪽에 나란히 놓는 보조 버튼`(또는 `"옆 또는 아래 보조 버튼"`)으로 개정.
   - **`book-search.md` LIB-1 B5 · B11 (정할 것 1·2 채택에 따른 보완):**
     - B11 1열 목록 행: 표지(52×74) + 오른쪽 위 제목·저자 + 오른쪽 끝 계기판 연도(`pub_year`)·ISBN + 오른쪽 아래(점선 없음) 출판사·계기판 라벨(`PUB <연도> · →`), 2열 표지 칸 아래 저자(왼쪽)·계기판 연도(오른쪽).
     - B5 책 상세 머리: 상단 `panelLit`(곡률 3, 아래 1px 줄눈) 판 안에 표지 + 제목(`22/400 inkSoft`)·저자·출판사·계기판 연도 + 나란한 2버튼(`빌릴 예정에 저장` · `빌렸어요`).
   - **공통(L1·레시피 확정분에 따른 기존 계약 문구 동기화):**
     - `book-search.md` LIB-1 B9 대응표: `--r-card 18`(`radii.card`), `border-radius: 12px`(`radii.inner`) → 정보·상태·시트 곡률 `radii.infoCard`(9), 컨트롤 `radii.control`(9999) 위계로 갱신.
     - `book-search.md` LIB-2 A11 ④: `"실시간 ↗"` 버튼 색 설명(`colors.cream 바탕·1px colors.surface3 테두리`)을 L1 보조 버튼(`panelFrosted` + 1px `seamHairline`)과 동기화.
     - `book-search.md` LIB-2 A13: `RegionPicker` 입력창 `radii.pill`(18) → 레시피 입력 칸 `radii.infoCard`(9), 위치 허용 버튼은 상세 화면 내 보조 버튼(`actionColors().secondary`).
     - `book-search.md` LIB-3 N7: `SavePlanSheet` 바탕 `colors.paper`·위 모서리 `radii.card`(18)·`"선택"` 버튼 `colors.inkStrong` 바탕 → `panelLit` 바탕·위 모서리 `radii.infoCard`(9)·보조 버튼으로 동기화.
