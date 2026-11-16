# Step 2 결과: `../libtalk` 기반 작업 조사 및 이식 판정 (`STEP2_libtalk_기반이식_판정.md`)

- **작성일:** 2026-11-16
- **담당:** D (시니어)
- **관련 진행 파일:** [진행_선계약_기반이식.md](../진행_선계약_기반이식.md)
- **대조 원본:**
  - `../libtalk`: `계획/AI_작업_기록.md`, `계획/하네스_엔지니어링_규칙.md`, `개발산출물/05_ERD_및_DB설계서.md`, `개발산출물/06_기능_API_정의서.md`, `server/app/**`, `server/migrations/**`, `server/tests/**`, `mobile/src/**`, `mobile/app/**`
  - `libproject`(`localone`): `개발산출물/05_ERD_및_DB설계서.md`, `개발산출물/06_기능_API_정의서.md`, `../team/기능_배정.md`, `계획/하네스_엔지니어링_규칙.md`

---

## 0. 설계 Pre-flight 5대 관문 선행 확인 (`file:line` 증거)

1. **① 격리·권한·호환:**
   - 검증된 JWT(`sub`) 기반 소유권 경계: `server/app/auth.py:92-120` (`verify_access_token`), `:140-148` (`get_current_user`)
   - 타인/미존재 리소스 동일 `404 NOT_FOUND` 은닉: `개발산출물/05_ERD_및_DB설계서.md:194`, `개발산출물/06_기능_API_정의서.md:21,111`
   - 전 테이블 RLS 활성화(`relrowsecurity=true`, 정책 0개, `H-ARCH-01`): `server/migrations/versions/0001_users.py:32`, `../libtalk/server/migrations/versions/0002_m1_core.py:577-578`
   - 공통 에러 포맷(`{"error": {"code", "message", "detail"}}`, `detail`은 쉼표 구분 필드명 문자열, `DEF-016`): `server/app/common.py:18-23`, `../libtalk/server/app/main.py:108-113`
2. **② 동시성·트랜잭션·외부 I/O 경계:**
   - 프론트 요청 순번/세대 카운터(`generationRef`/`AbortController`) 및 로그아웃 정화(`registerSignOutCleanup`, `AC-RACE`): `mobile/src/auth/AuthProvider.tsx:57`, `../libtalk/mobile/src/auth/AuthProvider.tsx:25-41`
   - 백엔드 `run_db` 트랜잭션 밖 외부 I/O(`H-ARCH-03`): `server/app/db.py:16-28`, `../libtalk/server/app/services/provider_engine.py:663-675` (`_guarded_call`: 상한 예약 짧은 트랜잭션 → 트랜잭션 밖 `asyncio.to_thread` 호출 → 결과 저장 트랜잭션)
   - 개인 데이터 쓰기 첫 SQL `lock_active_user`(`SELECT status FROM users WHERE id = :id FOR SHARE`, `DEF-014`, `H-ARCH-11`): `../libtalk/server/app/auth.py:132-144`
   - 부분 갱신 SQL 내 `COALESCE` 단일 upsert(`DEF-013`, `H-ARCH-11`): `../libtalk/server/app/routers/me.py:67-119` (`upsert_user_settings`)
3. **③ 참조 심볼·설정·토큰의 실재:**
   - 기존 마이그레이션: `server/migrations/versions/0001_users.py:1-36` (`users` 테이블)
   - 공통 테마 토큰(`DEF-019`): `../libtalk/mobile/src/theme/tokens.ts:1-130`, `../libtalk/mobile/src/theme/index.ts:1-91`
   - 정책 상수: `../libtalk/server/app/policy.py:1-36`, `../libtalk/mobile/src/lib/policy.ts:1-4`
   - 기기 저장소 어댑터 및 키(`DEF-022`): `../libtalk/mobile/src/lib/platform.ts:1-15` (`deviceStorage`), `05_ERD_및_DB설계서.md:223-226`
4. **④ 담당 파일·다른 작업 충돌:**
   - 열린 PR 확인: PR #78 (B `spec/local-feed-LOCAL-1` Draft), PR #79 (C `spec/book-search-LIB-1b` Draft). 코드(`server/`, `mobile/`) 수정 PR은 0건.
   - 소유 경계(`H-GIT-05`, `../team/기능_배정.md:8-16`): D = `INIT`·`SET`·`AUTH`·`RELEASE`·`LIB-0` 조회 엔진(`provider_engine.py`·`policy.*`·공통 헬퍼·공통 테마·시드), A = `VISIT`(홈 지도 + 홈 하단 창), B = `VISIT-2`(방문 페이지 틀) + `LOCAL`, C = `LIB-1~3` + `LOAN`.
5. **⑤ 명세·계약·사용자 승인 게이트:**
   - 이번 Step 2는 `../libtalk` 조사·판정 및 계약서 반영 목록 확정 문서 작업이며, 소스/테스트 수정 없이 결과 문서(`STEP2_libtalk_기반이식_판정.md`)를 작성한다(Tool Lock 준수).

---

## 1. D 담당 기반 작업별 `../libtalk` 대조 및 이식 판정 총괄표

> 판정 구분:
> - **그대로 가져올 것 (Direct Port)**: `localone`의 `05`·`06`·`기능_배정.md` 및 `H-GIT-05`/`H-GIT-06` 소유 경계와 100% 일치해 파일/함수를 수정 없이 그대로 이식할 수 있는 항목.
> - **수정 후 가져올 것 (Port with Modification)**: `../libtalk`에 구현되어 있으나 M2 테이블/컬럼(`0003`: `look_preset`, `shelf_themes`, `bio`/`avatar_url` 등) 참조나 주니어 미생성 테이블 참조(`H-GIT-06`)를 제거·분리해 가져와야 하는 항목.
> - **새로 짤 것 (Write New)**: `../libtalk`에 없거나 `localone`의 새 결정(C-61 `VISIT-1`·`VISIT-1b` 기기 저장소/홈 하단 창 연동 등)에 맞춰 새로 정의해야 하는 항목.

### 1.1 `AUTH-2`(세션 갱신·로그아웃·내 설정) & `AUTH-3`(회원 탈퇴·데이터 처리) 및 공통 인증/에러 가드

| 구분 / 세부 항목 | `../libtalk` 원본 위치 (`file:line`) | `localone` 기준 (`05`·`06`·하네스) | 이식 판정 | 차이점 및 이식 시 수정·분리 방법 |
| :--- | :--- | :--- | :---: | :--- |
| **`RequestValidationError` `detail` 필드명 직렬화 (`DEF-016`)** | `../libtalk/server/app/main.py:108-113` | `06` §3 `VALIDATION_ERROR` (`detail`에 쉼표 구분 필드명) | **그대로 가져올 것** | 현재 `localone` `server/app/main.py:89-91`은 `detail`이 비어 있음. `fields = sorted({str(e["loc"][-1]) for e in exc.errors() if e.get("loc")})`를 그대로 이식. |
| **쓰기 트랜잭션 첫 SQL 계정 잠금 `lock_active_user` (`DEF-014`, `H-ARCH-11`)** | `../libtalk/server/app/auth.py:132-144` | `계획/하네스_엔지니어링_규칙.md` §3.4 `H-ARCH-11` | **그대로 가져올 것** | `SELECT status FROM users WHERE id = :id FOR SHARE` (없으면 401 `AUTH_NOT_REGISTERED`, `active` 아니면 403 `ACCOUNT_WITHDRAWN`). 모든 개인 데이터 쓰기 엔드포인트(D·B·C)가 공통 호출. |
| **철회된 세션 검증 `session_is_alive` 및 `auth_session_check` (`DEF-008`, `H-ARCH-12`)** | `../libtalk/server/app/settings.py:27-29,48-49`<br>`../libtalk/server/app/auth.py:176-213`<br>`../libtalk/server/tests/test_auth_revoked_session.py:1-145` | `06` §2.1 로그아웃(`session_id` 확인), `H-ARCH-12` | **그대로 가져올 것** | `Settings.auth_session_check: bool = False` (production은 `True` 필수). `get_current_user`에서 `users` 조회와 같은 트랜잭션으로 `auth.sessions` 존재 확인(없으면 401 `AUTH_INVALID`). |
| **`POST /api/v1/auth/session`의 `user_profiles` 자동 생성 (`Q-55`)** | `../libtalk/server/app/auth.py:154-174,224-225` (`default_nickname_for_user`, `ensure_user_profile_if_absent`) | `05` §3.1 `user_profiles`, §9 (`LOCAL-1` 전 반영) | **그대로 가져올 것** | `to_regclass('public.user_profiles') IS NOT NULL` 가드가 이미 들어 있어 `user_profiles` 마이그레이션 전후 모두 안전하게 동작하며, `이웃-${sub 앞 4자리}`로 멱등 생성함. |
| **내 설정 조회·변경 (`GET/PATCH /api/v1/me/settings`, `06` #4·#5, `DEF-013`)** | `../libtalk/server/app/routers/me.py:28-120,197-239`<br>`../libtalk/mobile/src/auth/apiFetch.ts:118-146` | `05` §3.1 `user_settings`, `06` #4·#5 (`nearby_radius_km: 3\|5`, `return_stats_consent`) | **그대로 가져올 것** | 행 없을 때 DB 무쓰기 기본값 반환(`{3, False, None, None}`), PATCH 시 `lock_active_user` + 단일 SQL `COALESCE` upsert(`DEF-013`), 재동의 시 최초 동의 시각 유지(`DEF-015`). |
| **모바일 로그아웃 정화 레지스트리 및 탈퇴 호출 (`AuthProvider.tsx`)** | `../libtalk/mobile/src/auth/AuthProvider.tsx:21-50,264-298`<br>`../libtalk/mobile/src/auth/apiFetch.ts:148-150` | `02` AUTH-02·03, `H-ARCH-11`, Step 공통 완료 조건 ⑤ | **그대로 가져올 것** | `registerSignOutCleanup(fn)`, `signOut()`, `withdrawAccount()`, `requestAccountWithdrawal()` 시그니처와 구현을 그대로 이식. |
| **회원 탈퇴 (`DELETE /api/v1/me`, `06` #6) — D 소유 테이블 정리 + 점진적 확장** | `../libtalk/server/app/routers/me.py:122-195,241-248`<br>`../libtalk/server/tests/test_me.py`, `test_me_concurrency.py` | `05` §3.1·§5 R12, `06` #6, `H-GIT-06`, `H-ARCH-08` | **수정 후 가져올 것** | **[핵심 편차]**: `../libtalk`의 `withdraw_user_account`는 M1+M2 12개 테이블을 무조건 `UPDATE`/`DELETE`하고 `user_profiles`의 M2 컬럼(`bio = NULL, avatar_url = NULL`)을 건드림.<br>**[수정 방법]**:<br>1) `user_profiles` 익명화 SQL에서 M1에 없는 `bio = NULL, avatar_url = NULL`을 제거하고 `SET nickname = :nickname, updated_at = :now`만 수행.<br>2) 아직 머지되지 않은 주니어 테이블(`posts`, `loans`, `loan_plans`, `post_bookmarks`, `post_reactions`) 및 M2 테이블은 `H-GIT-06`에 따라 D 단독 커밋에서 직접 참조하지 않거나 `to_regclass('public.<table>') IS NOT NULL` 존재 확인 후 정리하도록 분리하고, 주니어 Step 머지 시 `test_me.py` 단언을 추가. |

---

### 1.2 `LIB` 공통 기반 (공공 데이터 조회 엔진 `LIB-0`, `06` #7~#15)

| 구분 / 세부 항목 | `../libtalk` 원본 위치 (`file:line`) | `localone` 기준 (`05`·`06`·`기능_배정.md`) | 이식 판정 | 차이점 및 이식 시 수정·분리 방법 |
| :--- | :--- | :--- | :---: | :--- |
| **정책 상수 모듈 (`server/app/policy.py`, `mobile/src/lib/policy.ts`)** | `../libtalk/server/app/policy.py:1-36`<br>`../libtalk/mobile/src/lib/policy.ts:1-4` | `계획/하네스_엔지니어링_규칙.md` §2.2-7 ⑥ (`H-DOC-04`) | **그대로 가져올 것** | 정보나루 일 상한 `21_000`, 네이버 일 상한 `17_500`, 타임아웃 `5.0`초, 동시 호출 `8`, 요청당 최대 호출 `40`, 검색 페이지 `20`건, 인기 도서 `20`권/30일/도서관 3일 TTL, 반경 `(3, 5)`km, 최근 본 도서 `20`권 상수 그대로 이식. |
| **조회 엔진 코어 (`server/app/services/provider_engine.py`)** | `../libtalk/server/app/services/provider_engine.py:1-1150`<br>`../libtalk/server/tests/provider_fakes.py`, `test_lib_engine.py` | `05` §3.1 (`libraries`, `books`, `availability_observations`, `popular_books_cache`, `provider_daily_usage`), `06` §2.2 #7~#15, `H-ARCH-03·06·07` | **그대로 가져올 것** | ISBN-10→13 변환·검증, `https_cover`, `NaverBookClient`, `Data4LibraryClient`, `reserve_provider_call`(원자적 일일 상한), `distance_km`·`libraries_nearby`(직선거리 3km/5km), `libraries_in_region`(5자리 `dtl_region_code`), `live_check_link`(`isbn_search` / `homepage`), `ProviderEngine`(`search_books`, `get_book`, `popular_books`, `availability` 세마포어 8·상한 40·`yes/no/unknown`·`data_date_assumed`), `sync_libraries` 모두 M1 컬럼만 사용하며 M2 의존성이 전혀 없음. |
| **도서관 목록·단건 조회 라우터 및 좌표 로그 마스킹 (`06` #10·#11)** | `../libtalk/server/app/routers/libraries.py:1-215`<br>`../libtalk/server/app/routers/library_privacy.py:1-19`<br>`../libtalk/server/tests/test_libraries.py` | `06` #10 (`GET /api/v1/libraries`), #11 (`GET /api/v1/libraries/{library_id}`), `NFR-05` | **그대로 가져올 것** | 주변(`lat`·`lng`·`radius_km`), 시군구(`dtl_region`), 시군구 옵션(`region_options=true`), 도서관 상세(`today.is_closed`, `today.hours_text`, `today.holiday_unchecked`), `LibraryQueryFilter`(Uvicorn 접근 로그에서 좌표 쿼리 제거) 모두 `06`과 일치하며 A(`VISIT-1`·`VISIT-1b`)·B(`VISIT-2`)·C(`LIB-2`)가 즉시 공통 사용해야 하므로 D 기반에서 함께 제공. |
| **도서 검색·상세·추천·소장·구매링크 라우터 (`06` #7~#9, #12~#15)** | `../libtalk/server/app/routers/books.py:1-252`<br>`../libtalk/server/tests/test_books.py` | `06` #7~#9, #12~#15, `05` §6 ("M1에는 서가 테마 표가 없다") | **수정 후 가져올 것** | **[핵심 편차]**: `../libtalk/server/app/routers/books.py:89-125,138-151`의 `_active_theme`은 M2 테이블인 `shelf_themes`·`shelf_theme_books`(`0003`)를 직접 `SELECT`함. `localone` M1에는 `shelf_themes` 테이블이 없으므로(`05` §6: "서가 테마: M1에는 표가 없다. 검색 추천은 '활성 테마 없음 → 인기 도서'로만 동작한다") 그대로 호출하면 `UndefinedTable` 오류가 남.<br>**[수정 방법]**:<br>1) M1에서는 `_active_theme` 호출 전에 `to_regclass('public.shelf_themes') IS NOT NULL`을 확인하거나 M1에서는 항상 `popular_books(library)`로 동작하게 보정.<br>2) 소유 경계: `books.py`의 엔진 연결 골격은 D가 제공하거나 C의 `book-search` 계약서(`LIB-1`·`LIB-2`)에 이식 골격으로 명문화하고, A의 `VISIT-1b`(홈 하단 창 인기 도서 `#9`)가 바로 쓸 수 있도록 D 기반에서 `#9`·`#10`·`#11`을 선제 오픈. |

---

### 1.3 공통 DB 마이그레이션 (`0002` 등), 시드(`seed.py`) 및 모바일 공통 기반 (`theme`, `deviceStorage`)

| 구분 / 세부 항목 | `../libtalk` 원본 위치 (`file:line`) | `localone` 기준 (`05` §8, `H-GIT-04`) | 이식 판정 | 차이점 및 이식 시 수정·분리 방법 |
| :--- | :--- | :--- | :---: | :--- |
| **DB 마이그레이션 분할 (`0002`~)** | `../libtalk/server/migrations/versions/0002_m1_core.py:1-583`<br>(`0003_m2_extensions.py`는 M2 전용) | `05` §2·§3·§8 (Step별 머지 순번), `H-GIT-04` (마이그레이션 발췌 재작성) | **수정 후 가져올 것** | **[핵심 편차]**: `../libtalk`은 `0002_m1_core.py` 한 파일에 D·B·C의 M1 13개 테이블을 모두 묶고 `0003`에 M2 14개 테이블+M1 확장 컬럼을 묶었음.<br>**[수정 방법 (`H-GIT-04`)]**:<br>1) `0003_m2_extensions.py`는 M1에서 절대 가져오지 않음.<br>2) **D 기반 마이그레이션(`0002_d_core_tables.py`)**: D 소유 7개 테이블(`user_profiles`, `user_settings`, `libraries`, `books`, `availability_observations`, `popular_books_cache`, `provider_daily_usage`) + 전 테이블 `ENABLE ROW LEVEL SECURITY`만 발췌해 생성.<br>3) **B·C 소유 테이블 마이그레이션**: 각 계약서(`local-feed.md`, `book-search.md`, `loan-assistant.md`)의 파트에서 `0002_m1_core.py`의 해당 테이블 정의(`posts`, `post_reactions`, `post_bookmarks` / `loan_plans` / `loans`, `library_return_stats`)를 그대로 발췌해 머지 순번(`0003_...`, `0004_...`)으로 생성하도록 계약서 §3.4에 DDL 골격을 고정. |
| **초기 참조 시드 (`server/app/seed.py`)** | `../libtalk/server/app/seed.py:1-344` | `05` §3.1 (`libraries`에 `look_preset` 없음, `shelf_themes` 없음) | **수정 후 가져올 것** | **[핵심 편차]**: `../libtalk/server/app/seed.py:27-28,152,157`은 `libraries` INSERT에 M2 컬럼(`look_preset`, `look_is_manual`)을 넣고, `:289-335`에서 M2 테이블(`shelf_themes`, `shelf_theme_books`)에 INSERT함.<br>**[수정 방법]**:<br>`SEED_LIBRARIES` 및 `INSERT INTO libraries`에서 `look_preset`, `look_is_manual`을 제거하고, `shelf_themes`·`shelf_theme_books` 시드 블록을 제거한 M1 전용 `seed_reference_data`(도서관 4곳, 도서 6권, 3갈래 소장 관측 4건, 전국·정독도서관 인기 도서 캐시)로 수정해 이식. |
| **모바일 공통 디자인 토큰 (`mobile/src/theme/*`, `DEF-019`)** | `../libtalk/mobile/src/theme/tokens.ts:1-130`<br>`../libtalk/mobile/src/theme/index.ts:1-91`<br>`../libtalk/mobile/src/theme/__tests__/theme.test.ts` | `PROJECT.md` §3.14, `개발산출물/디자인_기준.md` §1~§3, `DEF-019` | **수정 후 가져올 것** | `LOOK_BASE_COLORS`(4룩×9색), `LOOK_RADII`, `getTheme()`, `theme`(기본 `warm`), `darken()`, `contrastRatio()`, `onFill()`은 그대로 가져오되, A의 `VISIT-1` 명세(`specs/library-visit/세부/VISIT-1.md:178-181`)에서 필요한 의미별 임시 토큰(`pinClosed: "#78736C"`, `inkMuted: "#6B6B66"`)을 `tokens.ts` / `ThemeColors`에 추가하여 A·B·C가 하드코딩 없이 참조하게 함. |
| **모바일 기기 저장소 어댑터 (`mobile/src/lib/platform.ts`)** | `../libtalk/mobile/src/lib/platform.ts:1-15` | `PROJECT.md` §3.11 (플랫폼 분기 한 곳 집중), `05` §6 | **수정 후 가져올 것** | `deviceStorage.getItem(key)` / `setItem(key)`에 삭제(`removeItem(key)`)를 추가해 A(`도서관 기본값`, `방문 횟수/일자 기록`)와 C(`최근 본 도서 20권`)가 `Platform.OS` 분기 없이 공통 사용하도록 제공. |
| **모바일 전경 위치 조회 및 외부 링크 열기 어댑터** | `../libtalk/mobile/src/features/book-search/location.platform.ts:1-30` | `PROJECT.md` §3.11, `NFR-05`, `DEF-017` | **수정 후 가져올 것** | `locate(signal)`(`expo-location` 전경 1회 조회 + 타임아웃/Abort)과 `openExternalUrl(url)`(`Linking.openURL`, `http/https` 검증, `apiFetch` 미사용)을 특정 기능 폴더(`book-search`)가 아니라 공통 `mobile/src/lib/platform.ts`로 승격해 A(`VISIT-1` 지도 현재 위치)와 C(`LIB-2` 내 주변 검색 및 실시간 확인 링크)가 함께 쓰도록 제공. |
| **카카오맵 어댑터 및 시군구 코드/검색 사전 (`VISIT-1` 기반)** | (`../libtalk`은 아직 `VISIT-1` 미구현) | `06` §2.2 ("앱에 넣은 시군구 코드 표에서 찾는다"), `기능_배정.md` A절 (카카오맵 WebView+JS SDK / Web JS SDK) | **새로 짤 것** | `../libtalk`에는 `VISIT-1`이 아직 대기 상태임. 따라서:<br>1) 시군구 코드·이름 고정 사전(`mobile/src/lib/regions.ts`)과<br>2) 카카오맵 플랫폼 어댑터 인터페이스(`MapAdapterProps`, 웹 JS SDK / 네이티브 WebView 브리지, 실패 시 `onMapError`로 목록 대체 전환) 및<br>3) 기기 방문 기록/도서관 기본값 스토리지 키 규격은 Step 3 `library-visit.md` 계약서에서 새로 확정. |

---

## 2. Step 3 계약서 작성에 바로 반영할 서버/앱 공통 시그니처·테이블·헬퍼 확정 목록

Step 3에서 발행할 3개 기능 계약서(`library-visit.md`, `book-search.md`, `local-feed.md` 및 `loan-assistant.md`)가 공통으로 참조할 D 제공 기반 명세다.

### 2.1 서버 공통 헬퍼·인증·설정·조회 엔진 시그니처 (`server/app/`)

| 모듈 경로 | 심볼 / 시그니처 | 역할 및 계약 보장 |
| :--- | :--- | :--- |
| `server/app/common.py` | `KST = ZoneInfo("Asia/Seoul")`<br>`now_kst(now: datetime \| None = None) -> datetime`<br>`today_kst(now: datetime \| None = None) -> date`<br>`ApiError(status_code: int, code: str, message: str, detail: str = "")` | 모든 날짜(`YYYY-MM-DD`)와 타임스탬프(`+09:00` 초 단위), 공통 에러 응답(`{"error": {"code", "message", "detail"}}`) 생성. |
| `server/app/db.py` | `async def run_db(engine: Engine, fn: Callable[[Connection], T]) -> T` | 워커 스레드 단일 트랜잭션(`with engine.begin() as conn:`). `OperationalError`/`InterfaceError`/`TimeoutError`만 `503 DB_UNAVAILABLE`로 변환, `ApiError`/`IntegrityError`는 롤백 후 그대로 전파(`H-ARCH-02`). |
| `server/app/auth.py` | `CurrentUser(id: UUID, session_id: str \| None)`<br>`async def verify_access_token(request: Request) -> CurrentUser`<br>`async def get_current_user(request: Request) -> CurrentUser`<br>`async def get_optional_user(request: Request) -> CurrentUser \| None`<br>`def lock_active_user(conn: Connection, user_id: UUID) -> None` | - 필수 인증: `Depends(get_current_user)` (미등록 401 `AUTH_NOT_REGISTERED`, 탈퇴 403 `ACCOUNT_WITHDRAWN`, 철회 세션 401 `AUTH_INVALID`).<br>- 선택 인증(`06` #26·#27·#28 피드/상세): `Authorization` 헤더가 없으면 `None`, 있으면 검증해 `CurrentUser` 반환.<br>- 개인 데이터 쓰기 첫 SQL: `lock_active_user(conn, user.id)` 필수 호출(`H-ARCH-11`). |
| `server/app/policy.py` | `DATA4LIBRARY_DAILY_LIMIT = 21_000`<br>`NAVER_DAILY_LIMIT = 17_500`<br>`PROVIDER_TIMEOUT_SECONDS = 5.0`<br>`AVAILABILITY_MAX_CONCURRENCY = 8`<br>`AVAILABILITY_MAX_CALLS_PER_REQUEST = 40`<br>`SEARCH_PAGE_SIZE = 20`, `SEARCH_MAX_START = 1000`, `SEARCH_QUERY_MAX_CHARS = 100`<br>`POPULAR_SIZE = 20`, `POPULAR_PERIOD_DAYS = 30`, `POPULAR_LIBRARY_TTL = timedelta(days=3)`<br>`NEARBY_RADII_KM = (3, 5)`, `NEARBY_DEFAULT_RADIUS_KM = 3`<br>`YES24_SEARCH_URL_TEMPLATE = "https://www.yes24.com/Product/Search?domain=BOOK&query={isbn13}"` | 모든 외부 연동·페이지 크기·반경 정책 상수 단일 관리(`H-DOC-04`). |
| `server/app/services/provider_engine.py` | `isbn13_is_valid(value: str) -> bool`<br>`normalize_isbn(raw: str \| None) -> str \| None`<br>`https_cover(url: Any) -> str \| None`<br>`get_library(conn: Connection, library_id: int) -> LibraryRow \| None`<br>`libraries_nearby(conn: Connection, lat: float, lng: float, radius_km: float) -> list[tuple[LibraryRow, float]]`<br>`libraries_in_region(conn: Connection, dtl_region_code: str) -> list[LibraryRow]`<br>`live_check_link(library: LibraryRow, isbn13: str) -> tuple[str \| None, str \| None]`<br>`ProviderEngine.search_books(query: str, start: int) -> SearchResult`<br>`ProviderEngine.get_book(isbn13: str) -> BookRecord`<br>`ProviderEngine.popular_books(library: LibraryRow \| None) -> PopularResult`<br>`ProviderEngine.availability(isbn13: str, libraries: Sequence[LibraryRow]) -> list[AvailabilityItem]` | 도서·도서관·소장·인기도서 공통 조회 엔진. 라우터에서 `httpx`/`requests`/`urllib` 직접 호출 금지(`H-ARCH-07`). |
| `server/app/routers/libraries.py` | `GET /api/v1/libraries` (`?lat=&lng=&radius_km=3\|5` \| `?dtl_region=5자리` \| `?region_options=true`)<br>`GET /api/v1/libraries/{library_id}` (`today: {date, is_closed, hours_text, holiday_unchecked}` 포함) | A(`VISIT-1` 지도·목록, `VISIT-1b` 가까운 도서관), B(`VISIT-2` 방문 페이지 헤더), C(`LIB-2` 도서관 탐색) 공통 사용. |
| `server/app/routers/books.py` | `GET /api/v1/books/search?q=&start=` (#7)<br>`GET /api/v1/books/{isbn13}` (#8)<br>`GET /api/v1/books/recommendations?library_id=&kind=auto\|popular` (#9)<br>`GET /api/v1/books/{isbn13}/availability` (#12~#14)<br>`GET /api/v1/books/{isbn13}/purchase-link` (#15) | A(`VISIT-1b` 인기 도서 #9), B(`LOCAL-1` 책 표지 연결 #7·#8, `LOCAL-2` 상세 대여/구매 #14·#15), C(`LIB-1` #7~#9, `LIB-2` #12~#14) 공통 사용. |

### 2.2 모바일 공통 어댑터·토큰·상태 시그니처 (`mobile/src/`)

| 모듈 경로 | 심볼 / 시그니처 | 역할 및 계약 보장 |
| :--- | :--- | :--- |
| `mobile/src/auth/AuthProvider.tsx` | `useAuth(): { status, userId, signInWithGoogle, signInWithApple, signOut, withdrawAccount }`<br>`registerSignOutCleanup(fn: () => void \| Promise<void>): () => void` | 로그인 상태·사용자 ID 조회 및 로그아웃/탈퇴 시 화면·메모리·알림 정화 콜백 등록. |
| `mobile/src/auth/apiFetch.ts` | `apiFetch(path: string, init?: RequestInit): Promise<Response>`<br>`fetchMySettings(): Promise<MySettings>`<br>`patchMySettings(patch): Promise<MySettings>` | `EXPO_PUBLIC_API_URL` 내부 경로만 호출 허용(`DEF-017`), `401 AUTH_EXPIRED`/`AUTH_NOT_REGISTERED` 1회 자동 복구 후 재전송. |
| `mobile/src/theme/index.ts` & `tokens.ts` | `theme: Theme` (`getTheme("warm")`)<br>`getTheme(look?: LookPreset): Theme`<br>`onFill(fillHex: string): string`<br>추가 의미 토큰: `pinClosed: "#78736C"`, `inkMuted: "#6B6B66"` | 모든 화면의 색상·곡률 단일 출처(`DEF-019`). 기능 화면 내 `#RRGGBB` 하드코딩 금지. |
| `mobile/src/lib/platform.ts` | `deviceStorage: { getItem(key), setItem(key, value), removeItem(key) }`<br>`locate(signal: AbortSignal): Promise<{ lat: number; lng: number }>`<br>`openExternalUrl(url: string): Promise<void>` | `Platform.OS` 분기 및 네이티브 권한/링킹 한 곳 집중(`PROJECT.md` §3.11). |
| `mobile/src/lib/policy.ts` | `RECENT_BOOK_LIMIT = 20`<br>`BOOK_REQUEST_TIMEOUT_MS = 10_000`<br>`DEFAULT_START_COORDS = { lat: 37.5663, lng: 126.9779, dtlRegion: "11110", label: "서울 종로구" }`<br>`STORAGE_KEYS = { defaultLibrary: "localone:default_library:v1", visitHistory: "localone:visit_history:v1", recentBooks: (uid: string \| null) => uid ? "recent_books:" + uid : "recent_books:guest" }` | 기기 저장소 키(`DEF-022` 방지)와 임시 시작 위치(`Q-17`), 타임아웃 상수 단일 관리. |

### 2.3 DB 테이블 소유 및 마이그레이션 순번 원칙 (`05` §2·§8 & `H-GIT-04`)

| 구분 | 포함 테이블 | 소유 및 마이그레이션 파일 방침 |
| :--- | :--- | :--- |
| **기반 1 (`0001`, 머지 완료)** | `users` | `server/migrations/versions/0001_users.py` (`main` 기 머지) |
| **기반 2 (D 공통 테이블)** | `user_profiles`, `user_settings`, `libraries`, `books`, `availability_observations`, `popular_books_cache`, `provider_daily_usage` (7개) | `0002_d_core_tables.py` (D가 `../libtalk` `0002_m1_core.py`에서 D 소유 7개 테이블만 발췌해 생성 + M1 전용 `seed.py` 이식) |
| **B 소유 테이블 (`local-feed.md`)** | `posts` (`LOCAL-1`), `post_reactions`·`post_bookmarks` (`LOCAL-2`) (3개) | B의 `LOCAL-1`·`LOCAL-2` 서버 파트에서 머지 순번으로 생성(계약서 §3.4에 `0002_m1_core.py`의 정확한 컬럼·제약·인덱스·RLS DDL 명시) |
| **C 소유 테이블 (`book-search.md`, `loan-assistant.md`)** | `loan_plans` (`LIB-3`), `loans`·`library_return_stats` (`LOAN-1`·`LOAN-2`) (3개) | C의 `LIB-3`·`LOAN-1` 서버 파트에서 머지 순번으로 생성(계약서 §3.4에 `0002_m1_core.py`의 정확한 컬럼·제약·부분 UNIQUE·RLS DDL 명시) |
| **A 소유 테이블 (`library-visit.md`)** | 없음 (서버 테이블 0개) | `libraries`(#10·#11), `books/recommendations`(#9), `libraries/{id}/posts`(#26) 읽기 및 기기 저장소(`defaultLibrary`, `visitHistory`)만 사용 |

---

## 3. 리뷰 정정 (2026-11-16, Step 3 착수 전 D 리뷰)

Step 3 착수 전에 이 문서의 인용을 `libproject` `main` `3b51c69`·`libtalk` `6944ce1` 실제 파일과 다시 대조했다. 설계를 뒤집는 결함은 없고, 아래 7건은 사실·근거 오기다. 위 본문은 고치지 않고 이 절이 우선한다. D 결정(2026-11-16, 사용자 답)은 **R3·결정 2~4**에 적었다.

| # | 위치(이 문서) | 적힌 것 | 실제 (`file:line`) | 정정 | 등급 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | §2.1 `server/app/auth.py` 행 | `get_optional_user(request) -> CurrentUser \| None`을 이식 대상으로 적음 | `../libtalk/server/app/auth.py`에 정의 없음(`lock_active_user`:132, `ensure_user_profile_if_absent`:158, `session_is_alive`:176만 있음) | **새로 짤 것.** 계약 `core.md` SRV-0-P1에서 정의 | S2 |
| R2 | §2.2 `mobile/src/lib/policy.ts` 행 | `DEFAULT_START_COORDS`·`STORAGE_KEYS`를 기존 심볼처럼 적음 | `../libtalk/mobile/src/lib/policy.ts:1-4`에는 `RECENT_BOOK_LIMIT`·`BOOK_REQUEST_TIMEOUT_MS`만 있음. 최근 본 도서 키는 `../libtalk/mobile/src/features/book-search/recentBooks.ts:5` | **새로 짤 것.** 시작 좌표(종로구)는 Q-17 `대기`(`개발산출물/모호점_해소_기록.md:69`)라 `미확인(임시)` | S2 |
| R3 | §1.2 도서관 라우터 행, §2.3 | `libraries.py`를 "D 기반에서 함께 제공"으로 적어 H-GIT-05(라우터 = C)·`libtalk` `59e4464`(`Owner: C`)와 엇갈림 | `06_기능_API_정의서.md:43` "조회 엔진 … D가 만들고 C·A·B가 쓴다" | **D 결정(2026-11-16): #7~#15 엔진·라우터 모두 D.** `core.md` LIB-0-P1~P3. H-GIT-05의 C 소유 문구는 Step 4에서 하네스 규칙과 함께 고친다 | S2 |
| R4 | §2.1 `policy.py` 행 | 수치 근거를 "02 §9"로 적음 | localone 02에는 §9 표가 없다(02 목차 `## 0`~`## 8`). 05는 네이버 앱 상한을 `미확인(임시)` Q-41로 둠(`05_ERD_및_DB설계서.md` §3.1 `provider_daily_usage` 아래 줄) | 정보나루 21,000만 `확정`, 나머지(네이버 17,500·동시 8·요청당 40·응답 2MB·검색어 100자·추천 20권)는 `기본값(Claude)`. LIB-0-P1이 05 §11에 행을 먼저 더하고 구현(H-DOC-04) | S2 |
| R5 | §2.2 `RECENT_BOOK_LIMIT = 20` | 단일 값으로 적음 | 02 LIB-01·`기능_배정.md` C절 "계정별 20권" ↔ 05 §6 "기기(최대 10개) `미확인(임시)`" | `[기준 충돌]`로 기록하고 위쪽(02)을 따라 20. 05 §6 한 줄은 LIB-1 세부 명세 승인 때 맞춘다 | S3 |
| R6 | §2.2 `AuthProvider.tsx` 행 | `useAuth()`에 `signOut`·`withdrawAccount`, `registerSignOutCleanup`이 있는 것처럼 현재형 | localone `mobile/src/auth/AuthProvider.tsx:253` `useAuth`에 없음, `registerSignOutCleanup` 정의 없음(AUTH-2 미구현) | **미구현(AUTH-2).** 계약서에서는 `TODO(연결): D(AUTH-2)`로만 쓴다(H-DOC-03) | S3 |
| R7 | §0 ① RLS 근거 | `server/migrations/versions/0001_users.py:32` | 실제 `:41` (`op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")`) | 줄 번호 정정 | S3 |

- 같은 리뷰에서 정한 D 결정(사용자 답, 2026-11-16): ② #7~#15는 엔진·라우터 모두 D(R3) ③ 도서관 이름 검색은 06 #10에 `?q=`를 더한다(06 먼저 고침, [C-63](../스펙_변경_이력.md)) ④ 하단 탭 틀은 D가 만들고 M1은 홈·대출·반납·내 정보 3개, 독서 기록 탭은 READ(M2) 착수 때 2번째 자리에 끼운다.
- 이 정정을 반영한 계약은 [STEP3_선행계약서_발행.md](STEP3_선행계약서_발행.md)에 있다.
