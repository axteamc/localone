# 디자인 규칙 및 조형 시스템 통합본 (동네한권 — 홈 시안 C 중심 전면 재설계)

> **문서 성격**: 기존 레포지토리의 [`DESIGN.md`](../../DESIGN.md) 및 [개발산출물/디자인_기준.md](../디자인_기준.md)(C-48·C-55·C-60 기준)를 원본으로 보존하면서, 이번에 확정된 **홈 화면 시안 C(마쓰야 긴자 프로스티드 도트 그리드 + 수평 스케일 룰러 + 3D 컬러 스파인 블록)**에서 도출된 **파생 컬러 산식·4종 룩 컬러코드 전수표(`toffee` 포인트 분리 및 `oxford` 모던 배경 통일 반영)·85:10:5 배정 법칙·형태감 대비 규칙**을 융합하고, **홈 UI를 제1 조형 기준점으로 삼아 앱 전 화면의 디자인 큰 틀을 재설계**한 통합 기준서다.
> **적용 대상**: `DESIGN.md`, `개발산출물/디자인_기준.md`, `mobile/src/theme/tokens.ts`, `mobile/src/theme/index.ts`, 전 기능 시안(`specs/<기능>/세부/*_시안.html`).

---

## 0. 기존 디자인 문서 참조 여부 및 신규 융합·개정 내역 요약

이번 `VISIT-1_시안.html`(시안 C)의 **`warm`·`modern`·`toffee`·`oxford` 색감·배정·형태감**이 기존 문서와 어떻게 연결되고 무엇이 새로 설계·개정되었는지 정리한 표다.

| 구분 | 출처 | 상세 내용 |
| :--- | :--- | :--- |
| **1. 기존 문서에서 그대로 참조한 것** | `DESIGN.md` §색·§형태<br>`개발산출물/디자인_기준.md` §2·§3<br>`mobile/src/theme/tokens.ts` | - `modern`과 `warm`의 **9개 기본 베이스 컬러 HEX 코드**(`bg`, `surface2`, `surface3`, `fill1~3`, `cream`, `paper`, `inkStrong`)<br>- 웜 온도 보정 규칙(`warm -20%`, `toffee -30%`) 및 본문 글자색(`#1D1D1F`)<br>- 기본 형태 곡률(`ARCH_RADII`의 아치 `23px/6px`·카드 `18px` vs `SQUARE_RADII`의 직각 `3px`·`6px`) |
| **2. 이번 시안 C에서 새로 설계·개정해 융합한 것** | **신규 조형 시스템 + 사용자 피드백 반영 (본 문서로 확정)** | - **① 파사드·릴리프 7대 파생 컬러 산식(`mix`) 및 HEX 코드**: 무광 유리의 깊이감·`1px` 줄눈·금속 리벳·6겹 입체 두께면을 만들기 위해 베이스 토큰 간 선형 RGB 혼합(`mix(A, B, w)`)으로 산출한 파생 토큰 신설<br>- **② `toffee` 포인트 컬러(`fill2`·`fill3`) 겹침 해소**: 기존 `toffee`의 `fill2`(`#D2BE9E`)와 `fill3`(`#AEA18B`)가 모두 저채도 베이지라 `surface2`·`surface3`와 겹쳐 보이던 문제를 해결하기 위해, `fill2`를 **캐러멜 앰버(`#C88A56`)**, `fill3`를 **올리브 세이지 스톤(`#7E8C7D`)**으로 분리하여 `fill1`(에스프레소 브라운 `#6E5140`)과 뚜렷한 3색 조화를 이루도록 개정<br>- **③ `oxford` 배경·백색 계열을 `modern`과 동일하게 통일**: 기존 `oxford`의 푸른빛 배경(`#E3E5E8`·`#F2F3F5`)이 네이비(`#35557F`·`#002147`) 스파인의 대비를 흐리던 문제를 해결하기 위해, `oxford`의 **배경·표면·백색 5개 토큰(`bg`, `surface2`, `surface3`, `cream`, `paper`)을 `modern`(`#CDCDCB` ~ `#E6E6E4`)과 100% 동일하게 통일**하고 `fill3`도 한 단계 정제된 스틸 블루(`#7A93AC`)로 조정<br>- **④ 85 : 10 : 5 색감 배정 비율 + 외곽 직육면체(`3px`) & 내부 아치/직각 슬릿 대비 규칙** |

---

## 1. 조형 원칙 (확정 — 홈 UI 중심 재설계)

1. **앱의 첫인상과 공간의 출발점은 '홈 파사드(시안 C)'다.**
   - 기존에는 방문 페이지 하단 책장(M2)의 가구 도어 블록이 디자인의 출발점이었으나, 이제는 **홈 화면의 프로스티드 유리 파사드 + 정밀 스케일 룰러 + 3D 컬러 스파인 블록**이 앱 전체의 제1 조형 언어다.
2. **배경은 '포용력 있는 무광 건축 벽면'이고, 도서관과 책은 '돌출된 입체 매스(Volume)'다.**
   - 마쓰야 긴자 파사드(하라 켄야)의 철학인 **"배경 · 포용력 · 현재성"**을 따른다. 배경(`bg`·`panelFrosted`)은 콘크리트·회반죽·무광 스틸처럼 차분하게 물러나고(`1px` 음각 줄눈과 `4px` 리벳 도트로만 질서 유지), 사용자가 상호작용하는 도서관·게시물·도서 카드는 두께감 있는 입체 블록으로 떠오른다.
3. **Arne Vodder의 색면과 아치는 '스파인(책등) 기둥과 간접조명 슬릿'으로 응축한다.**
   - 나무 질감·나무색은 쓰지 않는다. 색 블록(`fill1~fill3`)은 카드 전체를 덮는 배경지가 아니라 **블록의 좌측 두께면(Spine, `12~16px`)과 매립형 아치/직각 슬릿**에 집중 배치한다.
4. **강조는 색의 남발이 아니라 '두께(Relief 단차)·명도·굵기'로 한다.**
   - 선택된 블록은 채도를 높이는 대신 입체 부양 높이(`translate(-2px, -3px)`)와 `--ink-strong` 두께면으로 강조한다.
5. **모든 색과 곡률은 하드코딩하지 않고 토큰으로만 참조한다.**
   - 파생 색(프로스티드 면, 줄눈, 리벳, 3D 측면 두께, 보조 글자)은 모두 기본 9색 토큰으로부터 고정 산식(`mix` / `darken`)으로 자동 계산되므로, M2에서 도서관마다 룩(`warm`·`modern`·`toffee`·`oxford`)을 바꿔 끼우면 파사드와 입체 블록 전체의 조명이 한 번에 바뀐다.

---

## 2. 색 토큰 및 파생 컬러코드 전수표 (4종 룩 확정)

### 2.1 기본 베이스 컬러 9종 (`toffee` 포인트 분리 · `oxford` 모던 배경 통일 반영)

| 토큰 키 (`tokens.ts`) | CSS 변수 (`시안.html`) | 역할 | `modern` (직각·오렌지) | `warm` (M1 기본·버터) | `toffee` (아치·토피 개정) | `oxford` (아치·네이비 개정) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `bg` | `--bg` | 기본 콘크리트·스톤 바탕 | `#CDCDCB` | `#E1E1DE` | `#E4E2DB` | **`#CDCDCB`** *(모던 동일)* |
| `surface2` | `--surface2` | 선반·시트·1단 두께면 | `#BDBDBA` | `#D0CEC8` | `#D5CFC4` | **`#BDBDBA`** *(모던 동일)* |
| `surface3` | `--surface3` | 진한 선반·2단 두께면 | `#A8A8A5` | `#BFBCB5` | `#C2BBAD` | **`#A8A8A5`** *(모던 동일)* |
| `fill1` | `--fill1` | **대표 스파인 색 1 (최단거리)** | `#FB5102` | `#E9C970` | `#6E5140` *(에스프레소)* | `#35557F` *(옥스퍼드 블루)* |
| `fill2` | `--fill2` | **보조 스파인 색 2 (차순위 1)** | `#F2F2EF` | `#EDC9A9` | **`#C88A56`** *(캐러멜 앰버)* | `#D2B48C` *(웜 탄/황동)* |
| `fill3` | `--fill3` | **보조 스파인 색 3 (차순위 2)** | `#9AA0B4` | `#B3BFB5` | **`#7E8C7D`** *(올리브 세이지)* | **`#7A93AC`** *(스틸 블루)* |
| `cream` | `--cream` | 방문 공간 바탕·룰러 면 | `#E9E9E6` | `#EFEFE7` | `#EEEFED` | **`#E9E9E6`** *(모던 동일)* |
| `paper` | `--paper` | 블록 상단면·카드(순백 아님) | `#E6E6E4` | `#EFF1F1` | `#EEEFED` | **`#E6E6E4`** *(모던 동일)* |
| `inkStrong` | `--ink-strong` | 중앙 `+` 기점·주 버튼·선택 테두리 | `#1C1E2A` | `#2E333F` | `#332A27` | `#002147` *(딥 옥스퍼드)* |

#### 개정 포인트 해설 (2026-11-17 사용자 결정)
- **`toffee` 포인트 컬러 3원색 분리**: 기존 `fill2`(`#D2BE9E`)·`fill3`(`#AEA18B`)가 배경(`#D5CFC4`·`#C2BBAD`)과 명도·색상이 겹쳐 스파인 구분이 모호했던 점을 개선해, **`fill1` 에스프레소 브라운(`#6E5140`) + `fill2` 캐러멜 앰버(`#C88A56`) + `fill3` 올리브 세이지(`#7E8C7D`)**로 온도·색상차를 명확히 벌렸다.
- **`oxford` 배경·백색의 `modern` 통일**: 기존 푸른 회색 배경(`#E3E5E8`) 대신 `modern`의 정제된 무채색 콘크리트·백색(`#CDCDCB`, `#BDBDBA`, `#A8A8A5`, `#E9E9E6`, `#E6E6E4`)을 그대로 바탕에 깔아, `oxford`의 **네이비(`#35557F`·`#002147`)와 웜 탄(`#D2B48C`) 스파인**이 차가운 스톤 파사드 위에서 선명하게 부각되도록 통일했다.

---

### 2.2 파사드·질감·3D 릴리프 파생 컬러 산식 및 계산된 HEX 코드표

시안 C의 유리 파사드 질감과 3D 직육면체 두께감을 모든 플랫폼(React Native 및 웹 CSS)에서 오차 없이 재현하기 위한 **선형 RGB 혼합 산식(`mix(colorA, colorB, weightA)`)**과 4종 룩별 확정 HEX 코드다.

$$\text{mix}(A, B, w) = \text{round}\big(\text{RGB}(A) \times w + \text{RGB}(B) \times (1 - w)\big)$$

| 파생 토큰 키 (`tokens.ts`) | CSS 변수 (`시안.html`) | 파생 산식 (`mix` / `darken`) | 용도 (시안 C 조형 요소) | `modern` HEX | `warm` (M1 기본) HEX | `toffee` HEX | `oxford` HEX |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `panelFrosted` | `--panel-frosted` | `mix(paper, bg, 0.58)` | 파사드 반투명 무광 유리 모듈 기본 면 | `#DCDCDA` | `#E9EAE9` | `#EAEAE5` | **`#DCDCDA`** |
| `panelLit` | `--panel-lit` | `mix(paper, cream, 0.84)` | 중앙 기점 주변 간접조명 확산 면 | `#E6E6E4` | `#EFF1EF` | `#EEEFED` | **`#E6E6E4`** |
| `seamHairline` | `--seam-hairline` | `mix(inkStrong, bg, 0.14)` | 파사드 4×4 모듈 `1px` 음각 줄눈 및 블록 외곽선 | `#B4B5B4` | `#C8C9C8` | `#CBC8C0` | **`#B0B5B9`** |
| `rivetBase` | `--rivet-base` | `mix(inkStrong, surface3, 0.34)` | 파사드 모듈 모서리 `4px` 금속 리벳 도트 본체 | `#78797B` | `#8E8D8D` | `#928A80` | **`#6F7A85`** |
| `rivetShine` | `--rivet-shine` | `mix(paper, bg, 0.90)` | 금속 리벳 도트 좌상단 반사광 하이라이트 | `#E4E4E2` | `#EEEFEE` | `#EDEDEB` | **`#E4E4E2`** |
| `reliefBottomMid` | `--relief-bottom-mid` | `mix(inkStrong, surface2, 0.15)` | 3D 돌출 블록 하단 5번째 중간 두께 단차면 | `#A5A5A4` | `#B8B7B3` | `#BDB6AC` | **`#A1A6A9`** |
| `reliefSideDark` | `--relief-side-dark` | `mix(inkStrong, surface3, 0.26)` | 3D 돌출 블록 우측·최하단 6번째 마감 두께면 | `#848485` | `#999896` | `#9D958A` | **`#7C858D`** |
| `textSub` | `--sub` | `darken(bg, 0.50)` | 보조 글자(기존 규칙 유지) | `#676766` | `#71716F` | `#72716E` | **`#676766`** |
| `divider` | `--divider` | `darken(bg, 0.13)` | 목록 일반 구분선(기존 규칙 유지) | `#B2B2B1` | `#C4C4C1` | `#C6C5BF` | **`#B2B2B1`** |

#### 공통 의미·조명 토큰 (룩 무관 고정)
| 토큰 키 | 값 | 용도 |
| :--- | :--- | :--- |
| `text` | `#1D1D1F` | 본문 및 도서관 이름 주 글자색 |
| `inkMuted` | `#6B6B66` | 방위각 코드(`NW 315°`), 검색창 안내 문구, 스케일 룰러 숫자 |
| `pinClosed` | `#78736C` | 오늘 휴관인 도서관의 좌측 스파인 채움색 및 `"오늘 휴관"` 강조 텍스트 |
| `loanAvailable` | `#5B8A5B` | 어제 기준 대출 가능 상태 스파인/배지 (`LIB-2`) |
| `loanOut` | `#B27A3D` | 어제 기준 대출 중 상태 스파인/배지 (`LIB-2`) |
| `loanUnknown` | `#9A9A98` | 알 수 없음 상태 스파인/배지 (`LIB-2`) |
| `seamHighlight` | `rgba(255, 255, 255, 0.68)` | 파사드 줄눈 및 3D 블록 상단 모서리 `1px` 빛 반사 하이라이트 |
| `shadowAmbient` | `rgba(28, 30, 36, 0.14)` | 파사드 기본 부양 그림자 |
| `shadowCast` | `rgba(28, 30, 36, 0.22)` | 3D 돌출 블록의 주 방향성 낙하 그림자 (`offset 14px 20px, blur 28px`) |
| `shadowDeep` | `rgba(20, 22, 28, 0.30)` | 선택/호버된 3D 블록의 깊은 낙하 그림자 |

---

## 3. 색감 배정 방식 및 형태감 규칙

### 3.1 공간 색감 배정 비율: **85 : 10 : 5 법칙**

1. **85% — 무광 건축 배경과 블록 상단면 (`panelFrosted`, `bg`, `paper`, `cream`)**
   - 화면 면적의 85%는 채도가 절제된 콘크리트·프로스티드 유리·스톤 뉴트럴이 차지한다.
   - `warm`·`toffee`는 따뜻한 간접조명이 스민 회반죽 벽면이 되고, `modern`·`oxford`는 정교하고 중립적인 무광 스톤/스틸 패널(`#DCDCDA` ~ `#E6E6E4`)이 된다.
2. **10% — 구조적 기점·줄눈·릴리프 두께 (`inkStrong`, `seamHairline`, `surface2~3`, `reliefSideDark`)**
   - 정중앙의 `+` 기점 매스(`inkStrong`)와 수평 스케일 룰러 트랙, 그리고 블록 우·하단의 6겹 입체 단차면이 화면의 중량감과 건축적 뼈대를 잡는다.
   - **검정/진한색(`inkStrong`) 채움 면적 제한 규칙**: 한 화면에서 `inkStrong`으로 꽉 채운 매스는 **오직 중앙 `+` 기점(홈)과 하단 주 행동 필 버튼 1개**뿐이다.
3. **5% — 고밀도 컬러 스파인 기둥 (`fill1`, `fill2`, `fill3`, 휴관 `pinClosed`)**
   - 룩의 정체성을 결정하는 대표색(`fill1~3`)은 블록 좌측 가장자리의 **`16px` 수직 스파인(책등) 기둥**에만 고밀도로 집약한다.

### 3.2 사분면별 스파인 컬러 배정 알고리즘 (홈 화면)

1. **휴관 최우선 규칙**: `lib.today.is_closed === true`인 도서관은 방위나 순위와 무관하게 무조건 `pinClosed`(`#78736C`) 스파인을 배정하고 하단 밴드에 굵은 `"오늘 휴관"`을 표기한다.
2. **최단거리 대표 도서관 (`fill1` 배정)**: 현재 영업 중인 주변 도서관 중 **나와 가장 가까운 1순위 도서관**의 스파인에 해당 룩의 대표색인 **`fill1`**(`warm` `#E9C970` / `modern` `#FB5102` / `toffee` `#6E5140` / `oxford` `#35557F`)을 배정한다.
3. **차순위 방위 도서관 (`fill2` → `fill3` 순환 배정)**: 나머지 방위 블록에는 거리순으로 **`fill2`**, **`fill3`**를 번갈아 배정하여 인접한 블록끼리 같은 스파인 색이 겹치지 않게 한다.

### 3.3 형태감 규칙: **외곽 마이크로 베벨(`3px`) 직육면체 + 내부 아치/직각 슬릿 대비**

| 형태 요소 | 토큰 이름 | `modern` (직각 계열) | `warm` · `toffee` · `oxford` (아치 계열) | 조형적 의도 |
| :--- | :--- | :--- | :--- | :--- |
| **3D 돌출 블록 외곽 곡률** | `radii.block` (신설) | **`3px`** | **`3px`** | 모든 룩에서 블록 외곽은 날 선 직육면체 매스감을 유지해 건축 모형(사진 2)의 긴장감을 지킴 |
| **스파인 내부 간접조명 슬릿** | `radii.libraryIconTop` / `Bottom` | **`3px` / `3px`** (직각 슬릿) | **`23px` / `6px`** (아치 슬릿) | 아치 계열 3룩에서는 직각 블록 안쪽에 부드러운 아치 창이 파여 대조미를 주고, `modern`에서는 내·외부 모두 직각으로 떨어져 모더니즘 조형 완성 |
| **일반 시트·모달·피드 카드** | `radii.card` | `6px` | `18px` | 바텀시트, 도서관 찾기 반쪽 창, 피드 이미지 카드 |
| **모임 카드 (M2)** | `radii.clubCardTop` / `Bottom` | `6px` / `6px` | `70px` / `18px` | 방문 페이지 내 소모임 카드 |
| **책 표지** | `radii.bookCover` | `[2, 4, 4, 2]` | `[5, 9, 9, 5]` | 책등(좌측)은 좁게, 책배(우측)는 둥글게 |
| **주 행동 컨트롤 버튼** | `radii.control` | `9999px` | `9999px` | `"위치 허용하기"`, `"현재 위치로"`, `"카카오맵 길찾기 ↗"`는 완전한 필(Pill) |

---

## 4. 홈 UI(시안 C)를 중심으로 한 앱 전체 화면 디자인 큰 틀 재설계

| 화면 (Step / 담당) | 기존 디자인 (단절된 지점) | **홈 시안 C 중심 재설계 (통일된 조형 언어)** |
| :--- | :--- | :--- |
| **① 홈 상단 검색바 & 도서관 찾기 창**<br>(`VISIT-1` / A) | 일반 둥근 검색 알약(`999px`) | 파사드 상단 줄눈에 맞물리는 **건축 프레임 바(`border-radius: 6px`, `1px solid seamHairline`)** + 우측 `"도서관 찾기"` 마이크로 베벨 태그(`fill1`). 클릭 시 내려오는 반쪽 창도 파사드 줄눈과 정합 |
| **② 홈 하단 창 (동네 서가·소식)**<br>(`VISIT-1b` / A) | 단순 흰색 바텀시트 | 파사드 하단 받침대(Plinth)처럼 올라오는 시트(`paper` 바탕 + 상단 `1px seamHairline` + `38×4px surface3` 핸들). 시트를 올리면 인기 도서(책 표지 곡률 `[5,9,9,5]`)와 2열 피드가 펼쳐짐 |
| **③ 도서관 방문 페이지 헤더**<br>(`VISIT-2` / B) | 텍스트만 있는 2줄 헤더 | 홈에서 누른 도서관 블록의 **좌측 컬러 스파인(`fill1~3` + 아치 슬릿)이 방문 페이지 헤더의 도서관 이름 좌측 수직 배지(`6×36pt`)로 그대로 이어짐**. 스크롤 시 `"‹ 이름 ⋯"` 한 줄로 접힐 때도 하단에 `1px seamHairline` 유지 |
| **④ 책 검색 상세 & 소장 도서관 카드**<br>(`LIB-1` · `LIB-2` / C) | 일반 둥근 목록 카드 | 소장 도서관 카드를 홈 블록과 동일한 **좌측 상태 스파인 블록(`loanAvailable` 초록 / `loanOut` 황토 / `loanUnknown` 회색 스파인 + `paper` 본체)**으로 디자인. `[위치·가는 길 보기]`를 누르면 카드 아래에 **매립형 쇼윈도 프레임으로 감싼 `KakaoMap`**과 `"카카오맵 길찾기 ↗"` 필 버튼 노출 |
| **⑤ 로그인 화면 로고 조형**<br>(`AUTH-1` / D, C-60 채택안) | C-60에서 "주요 컬러 기반 책 모양 로고"로 방향만 정해지고 구체 조형 미정 | 홈 시안 C의 **3D 컬러 스파인 블록 3개(`fill2` · `fill3` · `fill1`, 높이와 두께가 다른 직육면체 3개가 나란히 선 형태)**를 그대로 로그인 화면 상단 브랜드 심벌로 사용하여 홈 화면과 완벽한 통일감 부여 |
| **⑥ 대출·반납 타이머 카드**<br>(`LOAN-1~3` / C) | 일반 리스트 아이템 | 빌린 책 카드를 **3D 스파인 블록**으로 표현하고, 카드 하단에 홈 화면의 **스케일 룰러 트랙(`RulerTrack`)을 변주한 `14일 D-Day 눈금 게이지(D-14 ─── D-3 ─── D-Day)`**를 배치 |

---

## 5. `mobile/src/theme/` 즉시 교체용 코드 명세

### 5.1 `mobile/src/theme/tokens.ts` (`LOOK_BASE_COLORS` 및 `DERIVE` 개정본)

```ts
export const LOOK_BASE_COLORS: Record<LookPreset, BaseColors> = {
  modern: {
    bg: "#CDCDCB",
    surface2: "#BDBDBA",
    surface3: "#A8A8A5",
    fill1: "#FB5102",
    fill2: "#F2F2EF",
    fill3: "#9AA0B4",
    cream: "#E9E9E6",
    paper: "#E6E6E4",
    inkStrong: "#1C1E2A",
  },
  warm: {
    bg: "#E1E1DE",
    surface2: "#D0CEC8",
    surface3: "#BFBCB5",
    fill1: "#E9C970",
    fill2: "#EDC9A9",
    fill3: "#B3BFB5",
    cream: "#EFEFE7",
    paper: "#EFF1F1",
    inkStrong: "#2E333F",
  },
  toffee: {
    bg: "#E4E2DB",
    surface2: "#D5CFC4",
    surface3: "#C2BBAD",
    fill1: "#6E5140",
    fill2: "#C88A56", // 개정: 캐러멜 앰버 (surface2와 겹침 해소)
    fill3: "#7E8C7D", // 개정: 올리브 세이지 스톤 (surface3와 겹침 해소)
    cream: "#EEEFED",
    paper: "#EEEFED",
    inkStrong: "#332A27",
  },
  oxford: {
    bg: "#CDCDCB",       // 개정: modern과 동일 무채색 배경
    surface2: "#BDBDBA", // 개정: modern과 동일
    surface3: "#A8A8A5", // 개정: modern과 동일
    fill1: "#35557F",
    fill2: "#D2B48C",
    fill3: "#7A93AC",    // 개정: 정제된 스틸 블루
    cream: "#E9E9E6",    // 개정: modern과 동일
    paper: "#E6E6E4",    // 개정: modern과 동일
    inkStrong: "#002147",
  },
};

export const DERIVE = {
  textSubDarken: 0.5,
  dividerDarken: 0.13,
  panelFrostedPaperWeight: 0.58,
  panelLitPaperWeight: 0.84,
  seamInkWeight: 0.14,
  rivetInkWeight: 0.34,
  rivetShinePaperWeight: 0.9,
  reliefMidInkWeight: 0.15,
  reliefDarkInkWeight: 0.26,
} as const;
```

### 5.2 `mobile/src/theme/index.ts` (`mix()` 및 `getTheme()` 확장)

```ts
export function mix(hexA: string, hexB: string, weightA: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  return toHex([
    r1 * w + r2 * (1 - w),
    g1 * w + g2 * (1 - w),
    b1 * w + b2 * (1 - w),
  ]);
}
```
