# Step 3 결과: A(`VISIT-1`·`VISIT-1b`) D+A 계약서 및 B·C 1차 계약서(D 기준선) 발행

- **작성일:** 2026-11-16 (win)
- **담당:** D (시니어)
- **관련 진행 파일:** [진행_선계약_기반이식.md](../진행_선계약_기반이식.md)
- **대상 revision:** 코드 레포 `main` `3b51c69` · `../libtalk` `6944ce1` · team 로컬 커밋 `82fb574`(본문) → `457f92d`(머리말 SHA), **push 전**
- **문서 전용 작업:** 소스·테스트·마이그레이션은 고치지 않았다. 빌드·테스트는 실행하지 않았다.

## 1. 착수 전 리뷰 — Step 2 판정

[STEP2_libtalk_기반이식_판정.md](STEP2_libtalk_기반이식_판정.md)를 실제 파일과 대조해 설계를 뒤집는 결함은 없고 사실·근거 오기 7건(R1~R7)을 찾았다. 본문은 그대로 두고 그 문서 **§3 리뷰 정정**에 적었다. 사용자(D)는 "정정 후 Step 3 진행"을 골랐다.

| # | 정정 요지 | 등급 |
| :--- | :--- | :--- |
| R1 | `get_optional_user`는 libtalk에 없음 → 새로 짤 것 | S2 |
| R2 | `policy.ts`의 `STORAGE_KEYS`·`DEFAULT_START_COORDS`는 새 값, 시작 좌표는 Q-17 미확인(임시) | S2 |
| R3 | 라우터 소유가 H-GIT-05(C)와 엇갈림 → D 결정으로 정리 | S2 |
| R4 | 정책 수치의 "02 §9" 근거가 localone에 없음 → 05 §11 행 먼저(H-DOC-04) | S2 |
| R5 | 최근 본 도서 20(02) ↔ 10(05 §6) 기준 충돌 → 02를 따름 | S3 |
| R6 | `signOut`·`registerSignOutCleanup` 미구현(AUTH-2)인데 현재형 | S3 |
| R7 | RLS 줄 번호 `0001_users.py:32` → `:41` | S3 |

## 2. 같은 차례의 D 결정 (사용자 답, 2026-11-16)

| 질문 | 고른 것 | 반영 |
| :--- | :--- | :--- |
| #7~#15 라우터 소유 | 엔진+라우터 모두 D | `core.md` LIB-0 K1, 06 §2.2 아래 줄 |
| 도서관 이름 검색(VISIT-1 결정 1) | 06 #10에 `?q=` 추가 | 06 #10 행 개정(정식 경로: 06 먼저 → [C-63](../스펙_변경_이력.md)) |
| 하단 탭 | D가 틀, M1은 홈·대출·반납·내 정보 3개, 독서 기록 탭은 M2 | `core.md` APP-0 K13, team `기능_배정.md` A절 |

## 3. 발행한 계약서 (team `contracts/`, 본문 `82fb574`)

| 파일 | 판 | Step 절 | 파트(태스크) | 착수 관문 |
| :--- | :--- | :--- | :--- | :--- |
| `core.md` (새) | D | SRV-0, LIB-0, APP-0 | `SRV-0-P1`·`P2`, `LIB-0-P1`·`P2`·`P3`, `APP-0-P1`·`P2`·`P3` (8) | 바로(D). `LIB-0-P1`은 05 §11 정책 수치 행을 먼저 더함, `APP-0-P3`은 카카오 JS 키 발급 뒤 |
| `library-visit.md` (새) | **D+A 확정** | VISIT-1, VISIT-1b | `VISIT-1-P1`·`P2`·`P3`, `VISIT-1b-P1`·`P2` (5) | SHA 기입됨 → **team push 뒤 바로 착수 가능**(D 공통 기반 미머지 부분은 C7 가짜 값) |
| `local-feed.md` (새) | D 기준선 | LOCAL-1, VISIT-2, LOCAL-2 | `LOCAL-1-P1`·`P2`, `VISIT-2-P1`·`P2`, `LOCAL-2-P1`~`P4` (8) | 각 세부 명세 머지 |
| `book-search.md` (새) | D 기준선 | LIB-1, LIB-2, LIB-3 | `LIB-1-P1`·`P2`, `LIB-2-P1`·`P2`, `LIB-3-P1`·`P2` (6) | 각 세부 명세 머지 |
| `loan-assistant.md` (새) | D 기준선 | LOAN-1, LOAN-2, LOAN-3 | `LOAN-1-P1`·`P2`, `LOAN-2-P1`·`P2`, `LOAN-3-P1` (5) | 큰 틀 + 각 세부 명세 머지 |

- 모든 계약서 머리에 **Pre-flight 5대 관문**(`file:line`)을 두었다. 필드·오류 코드·테이블 컬럼·테스트 표는 줄임 없이 적었다(표 안 `…` 4곳을 전체 값으로 바꿈, 남은 `...`는 의사코드 안).
- B·C 1차 판은 각 절 C1 아래 **"세부 명세에서 정할 것 — D가 정하지 않음"**에 주니어가 고를 화면·동작을 남겼다. 세부 명세가 머지되면 그 절만 D+B·D+C 판으로 보완한다(정해진 칸은 그대로).
- 05 테이블·핵심 제약은 바꾸지 않았다. 계약서가 05보다 구체화한 것: `posts.client_request_id`(연타 한 건), `posts` CHECK(종류↔값·표지↔책·길이 임시 80/2,000자), `popular_books_cache` 대리 키 `id` + 부분 UNIQUE 2개, `loan_plans`에서 `memo` 제외, `loans.due_on_assumed`·`created_at`·`updated_at`.

## 4. 계약서끼리 맞춘 연결 (주니어가 서로 기다리지 않게)

| 연결 | 정한 곳 | 쓰는 곳 |
| :--- | :--- | :--- |
| 화면 경로(`/libraries/[libraryId]`·`/posts/[postId]`·`/posts/new`·`/search?q=`·`/books/[isbn13]`·`(tabs)`) + D 스텁 | `core.md` APP-0 K15·C2 | A·B·C 전부 |
| 기기 저장 키 `recent_books:<user_id>`·`recent_books:guest`·`localone:visits:v1`·`localone:default_library:v1` | `core.md` APP-0 C3 | C(최근 본 도서), B(방문 기록·기본값 쓰기), A(단골 읽기) |
| `FeedPost`·`PostCard`·`fetchLibraryPosts` | `local-feed.md` LOCAL-2 C2·C3 | A VISIT-1b-P2 |
| `DefaultLibraryGate`(앱 시작 분기) | `local-feed.md` VISIT-2 G6 | A 홈 탭(V17) |
| `lock_active_user`·`get_optional_user`·`nickname_of` | `core.md` SRV-0 | B·C 서버 파트 |
| 공개 API 앱 함수 `publicApi.*`·`createLatestRunner` | `core.md` APP-0 C2 | A·B·C 화면 |

## 5. 검증 (문서 전용)

| 확인 | 명령·방법 | 결과 |
| :--- | :--- | :--- |
| 머리말 SHA 칸 | `grep -c 82fb574fb59d4a73beabcbf4b77fa200998a5852 contracts/*.md` | core 8·library-visit 5·book-search 3·loan-assistant 3·local-feed 4 줄, `(team 커밋 뒤 기입)` 0줄 |
| 표 안 줄임표 | `grep -n "\.\.\.\|…"` | 표 안 값 줄임 0(의사코드·문구 "찾는 중…"만 남음) |
| 인용 줄 번호 | libtalk `0002_m1_core.py` 테이블 위치를 grep으로 다시 확인해 `posts :458-528`, `post_reactions :530-553`, `post_bookmarks :554-576`, `loan_plans :284-342`, `loans :345-427`, `library_return_stats :429-454`로 고침 | 정적 대조만 |
| 실행 검증 | — | **미실행**(코드 변경 없음). 계약서 골격 의사코드는 실행 코드가 아님 |

## 6. 남은 것 / 다음 Step으로 넘기는 것

- **team push와 주니어 알림은 Step 4**(진행 파일 Step 4 절차 3). push 전이라 팀원 훅은 아직 계약서를 못 본다. push하면 A의 Claude가 `[📄 계약서가 바뀌었다]`로 VISIT-1-P1을 시작할 수 있다.
- H-GIT-05(하네스 규칙)의 "LIB 라우터 = C" 문구와 계획 §2에 `LIB-0`·`APP-0`·`SRV-0` 태스크 이름 더하기 — Step 4.
- 05 §11에 정책 수치 `기본값(Claude)` 행(네이버 17,500 등) — `LIB-0-P1` 착수 때(H-DOC-04).
- 05 §6 최근 본 도서 "10개" 줄 — LIB-1 세부 명세 머지 때.
- 06 §5 "계약서 필드 표 옮기기"는 구현 뒤.
- 기준선 B2 선언(`개발산출물/기준선.md`) — team push 뒤 두 레포 커밋을 적어 선언.
- 미확인(임시)로 진행하는 값: Q-17 시작 위치(`dtlRegion` 코드도 APP-0-P1에서 확인), Q-19 알림 시각 09:00, Q-21 `limit`·중복 대출, Q-30 데포르메 지도, Q-31 인기순(닫음), Q-41 네이버 상한, Q-42 인기 도서 API, Q-49 반납 집계(쓰지 않음), Q-51 ④ 반경 밖 도서관(안 보임), Q-53 사진 저장소·10MB, Q-54 파일럿 공개 범위, Q-55 닉네임, Q-56 북마크.
- D 확인을 기다리는 `기본값(Claude)` 중 화면에 바로 보이는 것: LOAN-3 T3(잠금 화면에 책 제목을 넣지 않음), VISIT-1b W2(인기 도서 기준 도서관 순서), 하단 탭 이름 문구.
- 카카오 개발자 앱 JavaScript 키·도메인 등록, Supabase Storage 버킷 `post-images`, 정보나루·네이버 키 발급 — D 외부 설정(각 계약서 C7).

## 7. 원문 대비 (CLAUDE.md "원문에 없는데 넣은 것 / 뺀·바꾼 것")

- 원문에 없는데 넣은 것: 없음(제품 요구사항 추가 없음). 기술 약속만 더함 — 도서관 이름 검색 경로(VISIT-1 결정 1을 받치는 것), 연타 방지 키, 기기 저장 키 이름.
- 원문·이전 결정에서 바꾼 것: 하단 탭 "네 개를 이 순서로"(D 결정, 원문 아님) → M1은 세 개만 보이고 독서 기록 탭은 M2(사용자 D 결정 2026-11-16). 00 §2(중심/보조)와 충돌 없음 — 독서 기록은 이미 M2.
