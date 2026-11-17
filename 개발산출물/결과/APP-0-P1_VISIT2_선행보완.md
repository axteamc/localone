# APP-0-P1 VISIT-2 선행 보완 결과

2026-11-17 Windows / 사람 D / AI 구현·자체 검증 담당.
상태: **로컬 구현·검증·코드 커밋 완료(PR 게시 진행 중).**

## 1. 기준과 범위

- 기준 `origin/main`: `ad5676704009047934fb0c66cc14a695e5510781` (PR #109 `4393e3f` · PR #94 `ad56767` 머지 반영).
- 계약: `../team/contracts/core.md` `APP-0-P1 보완 — M1 VISIT-2 선행 제공 (D 확정, 2026-11-17)` (본문 커밋 SHA `b0a1523899fe33e798af39227db273b8dfdde02a`, team `908eae4`).
- 격리 worktree: `../libproject-app0-p1-visit2`, 브랜치: `feat/core-APP-0-part1-visit2`.
- 코드 커밋: **`739d54a0aff132ec90b7fc82c25bef187cb719d5`**, `Owner: D`.
- 허용 4파일 집합 일치: `mobile/src/lib/visits.ts`, `mobile/src/lib/__tests__/lib.test.ts`, `mobile/src/theme/tokens.ts`, `mobile/src/theme/__tests__/theme.test.ts`.
- 금지 준수: 새 public 함수·`VisitResult` 필드·저장 키/형식·서버 스키마·B 화면 변경 없음. 운영 기록은 별도 `docs(core)` 커밋으로 분리.

## 2. 구현과 계약 추적

| 계약 | 구현 근거 | 시험 근거 |
| --- | --- | --- |
| 저장 실패 시 `counted:false`, `isFirst:false`, 기존/후보 `record` 반환, 예외 비전파 | `mobile/src/lib/visits.ts` `write()` → `Promise<boolean>` (`L27-L36`), `recordVisit()` `!saved` 분기 (`L68-L76`), `setDefaultLibrary()` `Promise<void>` 유지 (`L101-L108`) | `mobile/src/lib/__tests__/lib.test.ts`: `storage failure does not block the visit screen`, `failed first visit is not counted`, `failed later visit returns prior record and queue recovers` |
| 직렬화 큐 실패 후 복구 | `mobile/src/lib/visits.ts` `serial()` (`L48-L52`) + `write()` catch 반환 | `failed later visit returns prior record and queue recovers` (`Promise.all` 첫 쓰기 reject 뒤 두 번째 쓰기 `count: 3` 성공) |
| 그림자 토큰 2종(`shadowSoft`, `shadowFloat`) 전 룩 제공 | `mobile/src/theme/tokens.ts` `SEMANTIC_COLORS` (`L87-L91`: `shadowSoft: "rgba(0,0,0,.15)"`, `shadowFloat: "rgba(0,0,0,.18)"`) | `mobile/src/theme/__tests__/theme.test.ts`: `theme warm tokens match 디자인_기준`, `all themes expose visit shadow tokens` (warm·toffee·oxford·modern 4룩 전수 검증) |

## 3. 실제 검증

대상: 코드 커밋 `739d54a0aff132ec90b7fc82c25bef187cb719d5`와 동일한 worktree 소스. 명령 작업 위치는 `C:\seokhunchoi_Ax_Fullstack\libproject-app0-p1-visit2\mobile` (정적 검사는 worktree 루트).

| 명령/검사 | 실제 결과 |
| --- | --- |
| `npm ci` | exit 0, 1,094 packages 설치 (`22 moderate severity vulnerabilities` 출력, 패키지 추가/변경 없음) |
| `npx tsc --noEmit` | exit 0 |
| `npx jest --runInBand src/lib/__tests__/lib.test.ts src/theme/__tests__/theme.test.ts` | exit 0, **2 suites / 31 tests passed** (6.037s) |
| `npx jest --runInBand` | exit 0, **7 suites / 48 tests passed** (초기 3.453s / 변이 원복 후 1.861s) |
| `npx expo export --platform web` | exit 0, 870 modules, 14 web bundles, `Exported: dist` |
| 허용 4파일 UTF-8(BOM 없음)·LF 검사 | 4파일 모두 `bom=False`, `crlf=False` |

### 실제 가드 제거 변이 (자체 점검)

각 변이는 프로덕션 파일 한 곳만 변경 → 표적 Jest(`lib.test.ts` + `theme.test.ts`) 실행 → 의도한 단언 실패(`exit 1`) 확인 → `finally`로 원본 바이트 복원 후 전체 Jest(`7 suites / 48 tests`) 재통과 확인. 같은 세션 자체 점검이며 독립 검증 관문으로 세지 않는다.

| 제거/변형한 가드 | 실패 단언 |
| --- | --- |
| `visits.ts` `write()` catch 반환값을 `true`로 변조 | `storage failure does not block the visit screen`, `failed first visit is not counted`, `failed later visit returns prior record and queue recovers` 실패 (`exit 1`) |
| `visits.ts` `recordVisit()`의 `if (!saved)` 분기 무력화(`false && !saved`) | `storage failure does not block the visit screen`, `failed first visit is not counted`, `failed later visit returns prior record and queue recovers` 실패 (`exit 1`) |
| `tokens.ts` `SEMANTIC_COLORS.shadowFloat` 값 변조(`rgba(0,0,0,.99)`) | `theme warm tokens match 디자인_기준`, `all themes expose visit shadow tokens` 실패 (`exit 1`) |

## 4. 미검증과 인계

- 통합·화면 연결: D 공통 보완 범위만 구현·단위 검증. B `VISIT-2` 화면 연결(`VisitScreen`·`VisitHeader`·`integration uses real visit adapter failure signal`)은 `VISIT-2-P1` 범위.
- 플랫폼: 웹 번들 export 통과. 웹 브라우저 내 실제 렌더/상호작용, Android 에뮬레이터/실기기, iOS 실기기/빌드는 미실행(Windows 환경).
- 운영·배포: 미실행.
- 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`(`docs/sync-artifacts-20261117`)와 `../libproject-core-LIB-0-part1`(`feat/core-LIB-0-part1`), `../team` 보류 묶음은 손대지 않고 보존.
