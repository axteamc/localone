# [동네한권 (localone)] 홈 화면 방향 기반 조형 UI 전환(시안 C 확정) 및 지도 역할 분리(LIB-2 이관) 명세·코드 수정 총정리

> **작성 기준일**: 2026-11-17 **분석 대상 레포지토리 커밋**: `axteamc/localone` (`74d28857f951d619ca75571d390b15321b35aca3`) **확정 디자인 방향**: **시안 C — 마쓰야 긴자 프로스티드 도트 그리드 파사드 + 수평 스케일 룰러 축 + 3D 컬러 스파인 돌출 블록** (단독 시안 파일 [`VISIT-1_시안.html`](../../specs/library-visit/세부/VISIT-1_시안.html) 동봉) **문서 목적**: VS Code 시니어 아키텍트(Claude)가 세부 명세 개정 및 기술 계약서(`contracts/library-visit.md`, `contracts/book-search.md`, `contracts/core.md`) 보완을 즉시 수행할 수 있도록 확정된 **시안 C의 형태·질감 구현 명세**, 4대 쟁점 해결 규칙, 관련 파일/줄 번호, DTO/스키마 대조 및 수정 대상을 전수 정리한 문서입니다.

## 1. 타당성 및 아키텍처 전환 총평

### 1.1 구현 가능성 판정: **즉시 가능 (홈 화면 복잡도 대폭 감소 + 조형적 완성도·크로스플랫폼 안정성 극대화)**

| 평가 축 | AS-IS (현행 데포르메 지도 + 핀 홈) | TO-BE (시안 C: 파사드 그리드·3D 스파인 블록 홈 + 책 검색 내 지도) | 판정 및 기술적 근거 |
| ----- | ----- | ----- | ----- |
| **데이터·좌표 확보** | `/api/v1/libraries` 응답의 `latitude`·`longitude`로 카카오맵 마커 생성 | 동일 응답(`latitude`·`longitude`·`distance_m`)과 기준 좌표(`center`)로 방위각(`atan2`)·상대 거리 즉시 계산 | **백엔드 홈 API(`#10`) 수정 0줄** (`server/app/routers/libraries.py:107-153` 그대로 사용) |
| **크로스플랫폼 일관성** | 네이티브는 `react-native-webview` HTML 주입, 웹은 `dapi.kakao.com` 스크립트 동적 로드로 이원화 (`KakaoMap.tsx` vs `KakaoMap.web.tsx`) | React Native 표준 `View`·`Pressable`·`react-native-svg` 단일 코드로 iOS·Android·Web 100% 동일 렌더링 | `PROJECT.md` "한 벌의 공통 코드" 원칙에 완벽 부합하며 WebView 브리지 지연·키 누락 오류 원천 차단 |
| **미관 및 브랜드 톤앤매너** | 일반 도로망 타일(`MapTypeId.ROADMAP`) 위에 원형 핀이 올라가 `DESIGN.md`의 콘크리트·웜그레이·색면 조형미가 반감됨 (`Q-30` 데포르메 미해결) | **마쓰야 긴자(하라 켄야) 프로스티드 유리 격자·금속 리벳 도트 + 수평 스케일 룰러 + 3D 컬러 스파인 블록**이 화면 전체의 조형 언어로 직결 | 앱의 핵심 정체성인 '공간을 방문하는 감성'과 색감·여백·입체 물성을 첫 화면에서 극대화 |
| **기존 구현 자산 활용** | `APP-0-P3`(`KakaoMap`)를 홈(`VISIT-1`)에서만 사용 | `KakaoMap` 어댑터는 삭제하지 않고 `LIB-2`(책 상세 소장 도서관 거리·경로 확인)로 이관하여 100% 재활용 | 기구현된 `mobile/src/lib/map/*` 코드 매몰 비용 0% |

## 2. [시안 C 확정] 형태·질감(Materiality & Relief) 상세 구현 명세

단순한 평면 카드 UI로 전락하지 않고 첨부 레퍼런스(**① 마쓰야 긴자 외벽 파사드 `+F`**, **② 하라 켄야의 입체 블록 모형 & 정밀 눈금 자**)의 **형태와 질감**을 그대로 살리기 위해 `VISIT-1_시안.html` 및 앱 구현에서 반드시 지켜야 할 4가지 조형 레이어 명세입니다.

### 2.1 시안 C의 4대 조형·질감 레이어 (`VISIT-1_시안.html` 동일 적용 완료)

1. **Layer 1 — 프로스티드 스톤/유리 모듈 파사드 & 4점 금속 리벳 도트 (`FacadeBoard`)**

   * **배경 질감**: 단조로운 단색 대신 `radial-gradient`(중앙 간접조명 확산)와 미세 스톤 노이즈 질감(`feTurbulence` / 미세 그레인 레이어)을 결합해 매트한 회반죽·무광 유리의 깊이를 만듭니다.

   * **격자 줄눈(`1px`)과 하이라이트**: 화면을 4열 × 4행 모듈 베이에 `1px` 음각 줄눈(`--seam-hairline`)과 `1px` 상·좌측 빛 반사 하이라이트(`inset 1px 1px 0 --seam-highlight`)로 분할합니다.

   * **금속 포인트 리벳(Point-Fastener Dots)**: 마쓰야 긴자 외벽 사진처럼 각 유리 베이의 네 모서리(`top/bottom/left/right: 6px`)에 지름 `4px`의 금속 리벳 도트를 찍어, 도서관이 없는 빈 방향조차 허전하지 않고 건축 외벽의 일부로 느껴지게 합니다.

2. **Layer 2 — 수평 스케일 룰러 축 (`RulerTrack`) & 중앙 `+` 기점 매스 (`OriginPlinth`)**

   * **정밀 눈금 자 트랙**: 하라 켄야 북 디자인 레퍼런스 하단 사진의 눈금 자를 모티브로, 화면 정중앙 수평축에 음각 베벨 처리된 `36px` 높이의 스케일 룰러 트랙(`W 1.5km ── 0.5km ── + ── 0.5km ── E 1.5km`)과 미세 눈금(`6px` 보조 눈금 + `30px` 주 눈금)을 배치합니다.

   * **중앙 `+` 기점 매스**: 수평 룰러와 수직 방위축이 교차하는 정중앙에 `--ink-strong`(`#2E333F`) 색상의 직육면체 기준석(`78×62pt`, 우·하단 입체 두께면 포함)을 두고, 그 위에 마쓰야 긴자의 `+F`를 연상시키는 날카로운 직교 `+` 크로스헤어와 기준 위치명(`현위치 · 북촌 3KM`)을 각인합니다.

3. **Layer 3 — 3D 돌출 직육면체 블록 + Arne Vodder 컬러 스파인 (`ReliefBlock`)**

   * **다단 릴리프 두께면과 방향성 그림자**: 평면 카드가 아니라 파사드 위로 돌출된 직육면체 매스로 보이도록, 모서리 곡률은 직각에 가까운 마이크로 베벨(`3px`)로 조이고 우·하단에 `--surface2` → `--surface3` → `--relief-side-dark`로 이어지는 6겹의 입체 두께면(Extruded Side/Bottom Planes)과 깊은 방향성 낙하 그림자(`14px 20px 28px`)를 부여합니다.

   * **좌측 컬러 스파인(Spine) 기둥 + 아치 간접조명 슬릿**: 블록 좌측 가장자리에 `16px` 폭의 컬러 스파인 기둥(`--fill1` 버터 옐로, `--fill2` 피치, `--fill3` 세이지, 휴관 시 `--pin-closed`)을 세우고, 스파인 상단에 `DESIGN.md`의 도서관 아이콘 아치 곡률(`23px 23px 6px 6px`)을 음각 슬릿으로 파내어 "도서관 건축물과 책등(Book Spine)"의 중의적 조형미를 완성합니다.

   * **모서리 랩핑 타이포그래피**: 상단에 고정폭 방위각 코드(`NW 315°`, `NE 042°`), 중앙에 굵은 도서관 이름과 동 이름(`area_label`), 하단 구분선(`1px`) 아래에 거리(`420m`)와 운영시간(`09:00~22:00` 또는 `오늘 휴관`)을 배치합니다.

4. **Layer 4 — 동일 방위 밀집 시 이중 적층 슬래브 (`.stacked::after`)**

   * 같은 사분면 방향에 도서관이 2곳 이상 몰려 있을 때는 사진 2의 겹쳐진 블록 모형처럼 블록 우하단 뒤쪽에 **두 번째 블록 슬래브가 `8~10px` 어긋나게 깔린 적층 구조**를 보여주고, 블록 우상단에 `+N곳 전환 ↻` 캡슐 배지를 제공합니다.

## 3. 구현 전 필수 검토 4가지에 대한 상세 해결 명세

### 3.1 [검토 1] 방위·거리 계산 수식 및 도심 밀집(한 방향에 여러 도서관) 처리 규칙

1. **방위각(Bearing) 계산 (`mobile/src/features/library-visit/direction.ts`)**

   * 기준 위치 $P_1(\text{lat}_1, \text{lng}_1)$(`home.center`)와 도서관 위치 $P_2(\text{lat}_2, \text{lng}_2)$(`lib.latitude, lib.longitude`)로부터 진북($0^\circ$) 기준 시계방향 방위각 $\theta \in [0^\circ, 360^\circ)$를 산출합니다:

     $$\Delta\lambda = \text{rad}(\text{lng}_2 - \text{lng}_1), \quad y = \sin(\Delta\lambda)\cos(\phi_2), \quad x = \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta\lambda)$$

     $$\theta = (\text{deg}(\text{atan2}(y, x)) + 360) \bmod 360$$

   * **4방위 슬롯(Quadrant) 분할**:

     * `NE` (북동, 우상단): $0^\circ \le \theta < 90^\circ$

     * `SE` (남동, 우하단): $90^\circ \le \theta < 180^\circ$

     * `SW` (남서, 좌하단): $180^\circ \le \theta < 270^\circ$

     * `NW` (북서, 좌상단): $270^\circ \le \theta < 360^\circ$

   * **방위 코드 포맷**: 8방위 영문 약어(`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`)와 3자리 각도 숫자를 결합해 `"NW 315°"`, `"NE 042°"` 형태로 표시합니다.

2. **한 방향에 도서관이 여러 개 몰릴 때 (도심 밀집 문제) 해결 규칙**

   * 사분면 슬롯 내부 도서관 배열을 `distance_m` 오름차순(동률 시 `id` 오름차순)으로 정렬합니다.

   * **대표 노출 + `+N곳 전환` 인터랙션**:

     * 기본 상태에서는 각 사분면 슬롯에서 가장 가까운 1순위 도서관(`items[0]`)이 돌출 블록으로 표시됩니다.

     * `items.length > 1`이면 블록 뒤에 적층 슬래브 레이어가 붙고 우상단에 `+${items.length - 1}곳 전환 ↻` 배지가 표시됩니다.

     * **블록 본문 터치**: 현재 표시 중인 도서관의 방문 페이지(`/libraries/[libraryId]?distanceM=...`)로 즉시 이동합니다(`V5` 유지).

     * **`+N곳 전환` 배지 터치 (`stopPropagation`)**: 페이지 이동 없이 해당 방위 슬롯의 도서관 인덱스를 `(idx + 1) % items.length`로 순환시켜 같은 방위의 2·3순위 도서관을 즉시 확인하고 입장할 수 있게 합니다.

### 3.2 [검토 2] 도서관 개수별(0~2곳) 배치 및 위치 거부 시 기준 좌표 규칙

1. **도서관 개수별 적응형 배치 (`quad` / `dual` / `single` / `empty`)**

   * **3곳 이상 (`quad`)**: 중앙 `+` 기점과 수평 스케일 룰러를 기준으로 `NW`·`NE`·`SW`·`SE` 사분면에 돌출 블록을 배치합니다. 특정 사분면에 도서관이 없으면 억지로 가짜 카드를 채우지 않고 **프로스티드 유리 모듈과 리벳 도트 여백**을 그대로 노출해 마쓰야 긴자 파사드의 여백미를 살립니다.

   * **2곳 (`dual`)**: 두 도서관의 경도(`longitude`)를 비교해 상대적 서쪽 도서관을 좌측(`W`), 동쪽 도서관을 우측(`E`)에 세로형 3D 스파인 블록으로 배치합니다.

   * **1곳 (`single`)**: 중앙 기점 상단에 와이드 3D 스파인 블록 1개를 배치합니다.

   * **0곳 (`empty`)**: 기존 `HomeScreen.tsx:138-146` 예외 #2 그대로 `"가까운 곳에서 도서관을 찾지 못했어요."` + `"더 넓게 찾기"`(5km 확장) 버튼을 표시합니다.

2. **위치 권한 거부 / 위치 미획득 시(`origin === "start"`) 기준 좌표 규칙**

   * 기존 `mobile/src/features/library-visit/useHomeLibraries.ts:136-155` 로직을 **수정 없이 100% 재사용**합니다.

   * 위치 거부 시 기본 도서관(`getDefaultLibrary()`)이 있으면 그 좌표를, 없으면 `DEFAULT_START`(`서울 중구`, `37.5665, 126.9780`)를 중앙 `+` 기점(`서울 중구 · 임시 시작점`)으로 삼아 주변 도서관 블록을 렌더링하고, 하단 중앙에 `"위치 허용하기"` 버튼을 표시합니다.

### 3.3 [검토 3] 책 검색(`LIB-2`) 쪽 "거리와 경로 확인"의 실제 구현 범위 및 DTO 누락 발견

1. **인앱 `KakaoMap` 미니맵(위치·거리) + 외부 지도 앱 길찾기 연동**

   * 이미 구현 완료된 `KakaoMap`(`mobile/src/lib/map/KakaoMap.tsx`, `KakaoMap.web.tsx`, PR #114 `APP-0-P3`)을 폐기하지 않고 `BookDetailScreen.tsx`(137줄 `LIB-2 도서관 목록 자리`)의 소장 도서관 카드에 연결합니다.

   * 사용자가 소장 도서관의 `[위치·가는 길]`을 누르면 인앱 `KakaoMap`(`cluster={false}`)에 도서관 핀과 직선거리(`distance_m`)를 띄우고, 하단 **`[카카오맵 길찾기 ↗]`** 버튼으로 `openExternalUrl("https://map.kakao.com/link/to/...")`(`mobile/src/lib/platform.ts:78`)을 호출해 외부 길찾기로 연결합니다.

2. **[중요 발견] 백엔드·프론트 DTO 대조 결과: `#12~#14 availability` 응답에 도서관 좌표(`latitude`, `longitude`) 누락**

   * 현재 `server/app/routers/books.py:121`의 `_availability_item()`은 `summary`에서 `("id", "name", "address", "area_label", "distance_m", "today")` 6개 키만 추출하여 **`latitude`와 `longitude`가 빠져 있습니다.**

   * 마찬가지로 `mobile/src/lib/publicApi.ts:31`의 `AvailabilityItem["library"]` 타입에도 `"latitude" | "longitude"`가 빠져 있습니다.

   * **해결**: `server/app/routers/books.py:121` 튜플과 `mobile/src/lib/publicApi.ts:31` `Pick<LibrarySummary, ...>`에 각각 `"latitude"`, `"longitude"`를 추가(총 2줄 수정)하면 추가 API 호출 없이 `LIB-2`에서 즉시 지도를 띄울 수 있습니다.

### 3.4 [검토 4] 기존 확정 명세·구현 코드와의 충돌 및 정리 포인트

* **실제 레포지토리 진행 상태 (`74d2885` 기준)**:

  * `specs/library-visit/세부/VISIT-1.md`는 이미 승인(PR #51 머지)되었고, `VISIT-1-P1·P2·P3` 코드(`mobile/src/features/library-visit/*`) 및 테스트 35개가 구현되어 있습니다.

  * `specs/book-search/세부/LIB-2.md`는 현재 **기획 대기(미작성)** 상태(`specs/book-search/명세서.md:148`)입니다.

* **시안 파일 교체 경로**:

  * 함께 생성된 단독 시안 파일 `VISIT-1_시안.html`을 레포지토리의 `specs/library-visit/세부/VISIT-1_시안.html` 경로에 그대로 덮어쓰거나 배치하면 팀의 시안 규칙(`:root` 토큰 사용, 후보 A·B·C 보존 및 `data-chosen="C"`, 인터랙티브 상태 전환, 명세 테이블 포함)을 즉시 충족합니다.

## 4. 코드베이스 전수 조사: 수정 대상 파일 및 라인별 변경 명세

### 4.1 기획·명세·시안 문서 수정 대상

| 구분 | 파일 경로 | 관련 절 / 줄 번호 | 현재 내용 (AS-IS) | 수정 필요 사항 (TO-BE) |
| ----- | ----- | ----- | ----- | ----- |
| **세부 시안 HTML** | `specs/library-visit/세부/VISIT-1_시안.html` | 파일 전체 (`1~620줄`) | 데포르메 도로 지도 + 원형 핀·클러스터 동그라미 시안 | 이번에 생성된 `VISIT-1_시안.html`(시안 C 채택본)으로 교체 |
| **기획 원본** | `개발산출물/00_기획_원본.md` | §3 `O-5` (`41줄`), §5 (`126줄`) | `O-5: 홈은 지도, 미니멀한 데포르메, 정적 역할(거리 표기 수준)` | `O-5` 상태를 `변형`으로 갱신: 홈은 내 위치(`+`) 기준 파사드 그리드 & 3D 스파인 블록 UI(시안 C)로 방문 진입을 제공하고, 실제 지도는 책 검색(`LIB-2`)의 소장 도서관 위치·경로 확인으로 이동 |
| **요구사항** | `개발산출물/02_요구사항_정의서.md` | `LIB-02` (`38줄`), `VISIT-01` (`44줄`), §1 (`84, 88, 95줄`) | `VISIT-01`: 데포르메 미니멀 지도 + 도서관 핀과 거리 표시, 끌어 옮기기 / `LIB-02`: 도서관 위치·거리 정보 제공 | `VISIT-01`: 현재 위치(`+`) 중심 방향 기반 3D 스파인 블록 UI로 도서관 이름·방위·거리·휴관 표시, `"도서관 찾기"`로 보는 위치 변경 / `LIB-02`: 소장 도서관 선택 시 지도(`KakaoMap`)로 실제 위치·거리 표시 및 외부 지도 길찾기 연결 명시 (`Q-30` 해소) |
| **디자인 기준** | `DESIGN.md` / `개발산출물/디자인_기준.md` | `DESIGN.md` §형태 (`48-56줄`), §결정 기록 (`81-91줄`) | 도서관 아이콘 곡률, 지도 핀 기준 서술 | 시안 C의 파사드 줄눈(`divider`), 4점 리벳 도트, 수평 스케일 룰러 트랙, 3D 돌출 블록 및 좌측 `16px` 컬러 스파인(`fill1~fill3`, `pinClosed`) + 아치 슬릿(`libraryIconTop: 23, libraryIconBottom: 6`) 규칙 추가 |
| **D 결정 기록** | `개발산출물/명세/VISIT_LOCAL_D결정.md` | §1.1 결정 6·9·12·13 (`19-29줄`) | 결정 6(지도 바탕 큰 길·지하철역), 결정 9(핀 아래 가운데 이름·거리), 결정 13 보완(지도 끌어 옮기기) | 결정 6(홈은 시안 C 파사드·3D 블록으로 대체, 지도는 `LIB-2`에 적용), 결정 9(3D 스파인 블록 내 방위·이름·거리·휴관 표시), 결정 13 보완(끌어 옮기기 제거, `"도서관 찾기"` + `"현재 위치로"` 유지) |
| **A 명세서** | `specs/library-visit/명세서.md` `specs/library-visit/세부/VISIT-1.md` | `VISIT-1.md` §0~§3 (`16-102줄`) | 중심 요소 3번 "숫자 동그라미로 묶기", 지도 끌어 옮기기(`V10`), 지도 실패 시 목록(`V8`) | 시안 C(파사드 도트 그리드 + 룰러 축 + 3D 컬러 스파인 블록) 배치, 동일 방위 다중 도서관 `+N곳 전환` 적층 슬래브, `"도서관 찾기"` 창을 통한 위치 이동으로 개정 |
| **C 명세서** | `specs/book-search/명세서.md` `specs/book-search/세부/LIB-2.md` (신규) | `명세서.md` §3 (`34-36줄`), §5 `LIB-2` (`148줄`) | `LIB-2`: 도서관 위치·거리·소장·대출 가능 조회(기획 대기) | `LIB-2` 세부 명세 작성 시 도서관 카드에 **인앱 지도(`KakaoMap`) 위치·거리 확인 및 외부 길찾기(`openExternalUrl`) 연결** 포함 |

### 4.2 모바일 앱 — A 담당 (`library-visit`: 홈 화면 시안 C 구현)

| 파일 경로 | 현재 역할 및 줄 번호 | 수정 구분 | 세부 수정 사항 및 추출 내역 |
| ----- | ----- | ----- | ----- |
| `mobile/src/features/library-visit/direction.ts` | (신규 파일) | **신규 생성** | - `computeBearingDeg(from: LatLng, to: LatLng): number` (`atan2` 기반 $0^\circ\sim360^\circ$ 방위각 산출)<br>- `computeDistanceMeters(from: LatLng, to: LatLng): number` (`distance_m`이 `null`일 때 Haversine 직선거리 보정)<br>- `formatCompassCode(deg: number): string` (`"NW 315°"` 형식)<br>- `groupLibrariesForFacade(center: LatLng, libs: LibrarySummary[])`: 좌표 있는 도서관 필터링 후 개수(`0` / `1` / `2` / `3+`)에 따라 `empty` / `single` / `dual` / `quad` 슬롯 배열(거리순 정렬 + 차순위 적층 배열) 반환 |
| `mobile/src/features/library-visit/LibraryMap.tsx` | `1~78줄`: `toMarkers()` 및 `<KakaoMap>` 래퍼 | **전면 개편** | - `<KakaoMap>` 호출 제거 후 **시안 C 레이아웃** 구현:<br>1) `FacadeGrid`: 4×4 `1px` 줄눈(`theme.colors.divider`) + 모서리 `4px` 리벳 도트<br>2) `ScaleRulerTrack` + `OriginPlinth`: 중앙 수평 눈금 자 트랙 및 `+` 크로스헤어 기점(`theme.colors.inkStrong`)<br>3) `ReliefLibraryBlock`: 좌측 `16pt` 컬러 스파인(`fill1~fill3`, 휴관 시 `pinClosed`) + 아치 슬릿(`libraryIconTop: 23, libraryIconBottom: 6`) + 우·하단 다단 입체 보더/그림자(`surface2`·`surface3`·`shadowFloat`)<br>4) 동일 방위 2곳 이상일 때 하단 적층 슬래브 및 우상단 `+N곳 전환` 버튼(`stopPropagation`으로 슬롯 인덱스 순환)<br>5) 블록 본문 터치 시 `onLibraryPress(lib.id)` 호출 |
| `mobile/src/features/library-visit/HomeScreen.tsx` | `1~281줄`: 홈 전체 레이아웃, 검색바, 지도/목록 분기, 드래그 재검색, 찾기 시트 | **부분 수정** | - **유지**: 상단 검색바(`152-169줄`), 에러/빈 결과 카드(`126-147줄`, `"더 넓게 찾기"` `home.widen`), 로딩 알약(`216-220줄`), 하단 `"위치 허용하기"`(`223-228줄`) 및 `"현재 위치로"`(`229-235줄`), `FindLibrarySheet`(`239줄`)<br>- **제거/단순화**: 지도 드래그 상태(`dragCenter`, `hereBusy`, `onRegionChange`, `searchHere`, `59-97줄` 및 `200-213줄` `"이 지역에서 다시 찾기"` 버튼) 제거 |
| `mobile/src/features/library-visit/useHomeLibraries.ts` | `1~271줄`: 위치 확인, 주변/지역 조회, `showRegion`, `focusLibrary` | **경량 정리** | - `start()`, `backToCurrent()`, `widen()`, `showRegion()`, `focusLibrary()`, `allowLocation()`, `averageCenter()`는 **현재 로직 그대로 100% 재사용** |
| `mobile/src/features/library-visit/deps.ts` | `4줄`: `export { KakaoMap ... } from "../../lib/map/KakaoMap"` | **1줄 수정** | - 홈에서 `KakaoMap` 직접 의존 제거 (`LatLng` 타입만 유지) |
| `mobile/src/features/library-visit/__tests__/*.test.tsx` | 홈 화면 통합 테스트 35개 | **단언 갱신** | - `mockLastMapProps` 대신 시안 C 방위 블록 렌더링, `+N곳 전환` 순환, 블록 터치 시 `/libraries/[libraryId]?distanceM=...` 이동 단언으로 갱신 |

### 4.3 모바일 앱 & 백엔드 — C 담당 (`book-search` LIB-2) 및 D 담당 (`core` / `server`)

| 파일 경로 | 현재 역할 및 줄 번호 | 수정 구분 | 세부 수정 사항 및 추출 내역 |
| ----- | ----- | ----- | ----- |
| `server/app/routers/books.py` | `117~132줄`: `_availability_item()` | **1줄 보완 (권장)** | - `121줄`: `summary`에서 추출하는 키 튜플 `("id", "name", "address", "area_label", "distance_m", "today")`에 `"latitude", "longitude"`를 추가하여 `#12~#14 GET /api/v1/books/{isbn13}/availability` 응답만으로 소장 도서관 지도 핀을 찍을 수 있게 보완<br>- `server/tests/test_books.py`의 availability 응답 필드 단언에 `latitude`, `longitude` 반영 |
| `mobile/src/lib/publicApi.ts` | `30~35줄`: `AvailabilityItem` 타입 정의 | **1줄 보완 (권장)** | - `31줄`: `library: Pick<LibrarySummary, "id" | "name" | "address" | "area_label" | "distance_m" | "today" | "latitude" | "longitude">`로 좌표 필드 추가 |
| `mobile/src/lib/map/KakaoMap.tsx`<br>`KakaoMap.web.tsx`<br>`kakaoHtml.ts` | `APP-0-P3` 공통 카카오맵 어댑터 | **그대로 재사용** | - `LIB-2`에서 소장 도서관 위치를 보여줄 때 `cluster={false}`로 호출하여 그대로 재사용 |
| `mobile/src/features/book-search/BookDetailScreen.tsx` | `137줄`: `{/* 가까운 도서관 목록은 LIB-2에서 이 자리에 넣는다(B5 ③). */}` | **LIB-2 구현 시 연결** | - 소장 도서관 카드에 **`"위치·가는 길 보기"`** 액션을 추가해 인앱 `<KakaoMap cluster={false} ... />`와 `"카카오맵 길찾기 ↗"`(`openExternalUrl`) 연결 |

---

## 5. [추가 융합] `DESIGN.md` · `디자인_기준.md` · `theme/tokens.ts` 전면 재설계 연동 요약

별도 생성된 [`DESIGN_개정통합본_홈중심_조형시스템.md`](DESIGN_개정통합본_홈중심_조형시스템.md) 문서에 아래 항목을 전수 정리하여 기존 디자인 문서와 완전히 융합했습니다:

1. **4종 룩(`modern`·`warm`·`toffee`·`oxford`) 베이스 팔레트 보정 반영**:
   - **`toffee` 포인트 컬러 분리**: 기존 `fill2`(`#D2BE9E`)·`fill3`(`#AEA18B`)가 `surface2`·`surface3`와 겹치던 문제를 해결하기 위해 `fill2: #C88A56`(캐러멜 앰버), `fill3: #7E8C7D`(올리브 세이지 스톤)로 개정하여 `fill1: #6E5140`(에스프레소 브라운)과 3색 대비 확보.
   - **`oxford` 배경·백색 계열을 `modern`과 동일하게 통일**: `bg: #CDCDCB`, `surface2: #BDBDBA`, `surface3: #A8A8A5`, `cream: #E9E9E6`, `paper: #E6E6E4`로 통일하고 `fill3: #7A93AC`로 정제하여 네이비(`#35557F`·`#002147`)와 웜 탄(`#D2B48C`) 스파인의 선명도 극대화.
2. **신규 7대 조형·질감 파생 토큰 산식(`mix(A, B, w)`) 및 4종 룩 전수 HEX 표**:
   - `panelFrosted` (`warm: #E9EAE9`, `modern: #DCDCDA`, `toffee: #EAEAE5`, `oxford: #DCDCDA`)
   - `panelLit` (`warm: #EFF1EF`, `modern: #E6E6E4`, `toffee: #EEEFED`, `oxford: #E6E6E4`)
   - `seamHairline` (`warm: #C8C9C8`, `modern: #B4B5B4`, `toffee: #CBC8C0`, `oxford: #B0B5B9`)
   - `rivetBase` (`warm: #8E8D8D`, `modern: #78797B`, `toffee: #928A80`, `oxford: #6F7A85`)
   - `rivetShine` (`warm: #EEEFEE`, `modern: #E4E4E2`, `toffee: #EDEDEB`, `oxford: #E4E4E2`)
   - `reliefBottomMid` (`warm: #B8B7B3`, `modern: #A5A5A4`, `toffee: #BDB6AC`, `oxford: #A1A6A9`)
   - `reliefSideDark` (`warm: #999896`, `modern: #848485`, `toffee: #9D958A`, `oxford: #7C858D`)
3. **85 : 10 : 5 공간 색감 배정 법칙 및 외곽 직육면체(`radii.block = 3`) + 내부 아치/직각 슬릿 대비 규칙**
4. **홈 UI(시안 C)를 제1 조형 기준점으로 삼은 전 화면(방문 페이지 헤더 스파인 연동, 책 검색 `LIB-2` 상태 스파인 블록 + 매립형 `KakaoMap`, `AUTH-1` 3D 스파인 블록 심벌, `LOAN` 룰러 트랙 D-Day 게이지) 디자인 재설계 매핑**
