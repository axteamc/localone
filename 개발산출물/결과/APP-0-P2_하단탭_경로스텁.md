# APP-0-P2 하단 탭과 화면 경로 스텁 결과

2026-11-17 Windows / 사람 D / AI 구현·자체 검증 담당.
상태: **로컬 검증·코드 게시 완료, PR [#109](https://github.com/axteamc/localone/pull/109) (`needs-ios`). CI 확인 대기 중, 머지하지 않음.**

## 1. 기준과 범위

- PR #96 `feat/core-APP-0-part1`의 MERGED(`00f71a308c07d6051bb4ea7f3e4b44390398606e`, 2026-11-16T08:15:07Z) 및 최신 `origin/main` `71a9e6780907279dd8d63a63af3c5b0e5daf9242` 확인 후 격리 worktree(`../libproject-app0-p2`)에서 `feat/core-APP-0-part2` 브랜치 생성.
- 기준: [B2 §0](../기준선.md), `.team_docs/contracts/core.md` APP-0 C1(K13·K15)·C2·C4·P1·P2·P5 (및 `../team/contracts/core.md` `908eae4` C2 `distanceM` 선택 파라미터).
- 코드 커밋: **`bb0fcbb77d606aa27ce35af1951660e92e448ed6`**, `Owner: D`.
- 구현·삭제·테스트 파일은 core APP-0-P2 허용 12개와 집합 일치 검사 통과(592 insertions, 93 deletions). 운영 기록은 별도 `docs(core)` 커밋으로 분리.
- 스텁에 기능·가짜 데이터·`독서 기록` 탭 미포함(K13·K15 준수). 신규 의존성·네이티브 설정·서버/DB 변경 없음.

## 2. 구현과 계약 추적

| 계약 | 구현 근거 | 시험 근거 (`mobile/src/__tests__/routes.test.tsx`) |
| --- | --- | --- |
| K13 하단 탭 3개·순서 | `mobile/app/(tabs)/_layout.tsx` (`index` "홈" → `loans` "대출·반납" → `me` "내 정보", `theme` 토큰) | `tabs show home loans me in order` (순서·문구 3개 및 `독서 기록` 미존재 단언) |
| 루트 레이아웃·스모크 제거 | `mobile/app/_layout.tsx` (`AuthProvider` + `Stack`, `(tabs)` `headerShown: false`), `mobile/app/index.tsx` 삭제 | `root layout wraps stack in AuthProvider and hides tabs header` |
| K15 탭 스텁 3개 | `mobile/app/(tabs)/index.tsx` (`// TODO(연결): A`), `loans.tsx` (`// TODO(연결): C`), `me.tsx` (`// TODO(연결): D(AUTH-2)`, 로그인 상태 줄 + `/login` 이동) | `stub routes render params` (문구·인증 상태 분기·`/login` 이동) |
| K15 도서관 방문 스텁 | `mobile/app/libraries/[libraryId].tsx` (`// TODO(연결): B`, `libraryId` + 선택 `distanceM` 0 이상 안전한 정수 단일 문자열만 표시) | `stub routes render params` (`101`, `distanceM: 420`, 음수/실수/문자/배열 생략) |
| K15 게시물/글쓰기 스텁 | `mobile/app/posts/[postId].tsx` (`postId`), `mobile/app/posts/new.tsx` (`libraryId`, 선택 `isbn13`), 모두 `// TODO(연결): B` | `stub routes render params` |
| K15 책 검색/상세 스텁 | `mobile/app/search.tsx` (`q`, `libraryId`), `mobile/app/books/[isbn13].tsx` (`isbn13`), 모두 `// TODO(연결): C` | `stub routes render params` |

- `mobile/app/` 내 신규/수정 파일 전체 `#RRGGBB` 하드코딩 0건(`theme`·`onFill` 사용).
- UTF-8(BOM 없음)·LF 확인 완료.

## 3. 실제 검증

대상: 코드 커밋 `bb0fcbb77d606aa27ce35af1951660e92e448ed6`와 동일한 worktree 소스. 명령 작업 위치는 `C:\seokhunchoi_Ax_Fullstack\libproject-app0-p2\mobile`(Git 검사는 worktree 루트).

| 명령/검사 | 실제 결과 |
| --- | --- |
| `npm ci` | exit 0, 1,094 packages 설치 (`22 moderate severity vulnerabilities` 출력, 범위 밖 패키지 변경 없음) |
| `npx tsc --noEmit` | exit 0 |
| `npx jest --runInBand` | exit 0, **7 suites / 45 tests passed**, 5.619s(초기) / 1.666s(변이 원복 후 재실행) |
| `npx expo export --platform web` | exit 0, 870 modules, 14 web bundles(`_layout`, `(tabs)/_layout`, `index`, `loans`, `me`, `libraries/[libraryId]`, `posts/[postId]`, `posts/new`, `search`, `books/[isbn13]`, `login` 등), `Exported: dist` |
| 계약 파일 목록 집합 비교 | 허용 12 = 변경 12 (`Compare-Object` 차이 없음) |
| `#RRGGBB`·UTF-8 BOM·CRLF 검사 | 신규/수정 11파일(삭제 1 제외) 모두 BOM=False, CRLF=False, `#RRGGBB` 0건 |

### 실제 가드 제거 변이 (자체 점검)

각 변이는 프로덕션 파일을 한 번에 하나씩 변경 → `npx jest --runInBand src/__tests__/routes.test.tsx` 실행 → 실제 단언 실패(exit 1) 확인 → `finally`로 원본 바이트 복원했다. 원복 후 전체 `npx jest --runInBand` 7 suites / 45 tests 재통과. 같은 세션 자체 점검이며 독립 검증 관문으로 세지 않는다.

| 제거/변형한 가드 | 실패 단언 |
| --- | --- |
| `(tabs)/_layout.tsx`에 `독서 기록` 탭 삽입 | `tabs show home loans me in order`: 탭 순서/개수 단언 실패(exit 1) |
| `libraries/[libraryId].tsx`의 `distanceM` 음수·비정수·배열 검증 제거 | `stub routes render params`: 잘못된 `distanceM` 생략 단언 실패(exit 1) |
| `_layout.tsx` `(tabs)` `headerShown: false`를 `true`로 변경 | `root layout wraps stack in AuthProvider and hides tabs header`: options 단언 실패(exit 1) |

## 4. 미검증과 인계

- 화면 연결: 스텁 수준(`"준비 중이에요"` + 수신 파라미터). 실제 화면 교체·기능 연결은 각 담당 Step(A `VISIT-1-P1`, B `LOCAL-1-P2`/`VISIT-2-P1`/`LOCAL-2-P4`, C `LIB-1-P1`/`LIB-1-P2`/`LIB-3-P2`, D `AUTH-2`) 범위.
- 통합·서버: N/A(서버/DB/네트워크 호출 변경 없음).
- 플랫폼: 웹은 번들 export 통과, 브라우저 내 실제 탭 클릭·라우팅 전환은 미실행. Android 에뮬레이터/실기기 및 iOS 실기기/빌드 미실행(Windows 환경, PR `needs-ios`, D의 iOS·시각 확인 필요).
- 운영·배포: 미실행.
- 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`의 `docs/sync-artifacts-20261117` 미커밋 작업과 `../team` 보류 변경은 손대지 않고 보존.
