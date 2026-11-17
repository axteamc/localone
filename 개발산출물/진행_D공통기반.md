# D 공통 기반 진행

상태: **LIB-0-P1 구현·로컬 검증·PR [#111](https://github.com/axteamc/localone/pull/111) 게시, 리뷰 대기.** APP-0-P1 #96 및 P2 #109는 main 반영 확인(P2 merge `4393e3f`). 사람 역할 D / AI 구현·자체 검수. 2026-11-17 Windows. APP-0 이전 증거는 아래에 보존한다.

## 입력과 경계

- B2: [기준선 §0](기준선.md), team `3361a5f` / `908eae4`(VISIT-2 보완 포함), `.team_docs/contracts/core.md` APP-0 C1~C7·P1~P5.
- PR #96(`00f71a3`)·PR #102(`71a9e67`) 머지 반영된 `origin/main` `71a9e6780907279dd8d63a63af3c5b0e5daf9242`에서 격리 worktree(`../libproject-app0-p2`)로 `feat/core-APP-0-part2` 생성.
- APP-0-P2 허용: core APP-0 P2 표의 12파일(`_layout.tsx`, `(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/loans.tsx`, `(tabs)/me.tsx`, `libraries/[libraryId].tsx`, `posts/[postId].tsx`, `posts/new.tsx`, `search.tsx`, `books/[isbn13].tsx`, `index.tsx` 삭제, `src/__tests__/routes.test.tsx`), 이 진행·결과·인수인계 기록과 목록 등록.
- 보존: 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`(`docs/sync-artifacts-20261117`)의 미커밋 작업과 `../team` 보류 묶음.
- Git: `Hunseokc`로 commit/push/PR·CI 확인, 종료 시 `choise-hun` 복구. 직접 머지 금지.

## 순서

| 순서 | 파트 | 상태 |
| --- | --- | --- |
| 1 | APP-0-P1 | 머지 완료 (PR #96, `00f71a3`; 단 M1 VISIT-2 선행 보완 4파일 별도 대기) |
| 2 | APP-0-P2 | main 반영 확인(PR #109, `4393e3f`). 플랫폼 증거는 해당 결과 문서 참조 |
| 3 | APP-0-P3 | 미착수; 카카오 JS 키 필요 |
| 4 | LIB-0-P1 → P2 → P3 | P1 구현·검증·PR #111 게시. P2·P3 미착수 |
| 5 | SRV-0-P1 → P2 | 미착수 |

제품 순서 원본은 `계획/상용_서비스_계획.md` §2다.

## 검증과 다음 행동

- APP-0-P2 구현 코드 `bb0fcbb77d606aa27ce35af1951660e92e448ed6` (`Owner: D`). 허용 12파일 집합 일치, `#RRGGBB` 0건, UTF-8/LF 확인.
- `mobile` 검증: `npm ci` exit 0 (1,094 packages) → `npx tsc --noEmit` exit 0 → `npx jest --runInBand` exit 0 (7 suites / 45 tests passed) → `npx expo export --platform web` exit 0 (870 modules, `Exported: dist`).
- 실제 가드 제거 변이 3곳(독서 기록 탭 삽입, `distanceM` 검증 제거, `(tabs)` `headerShown: true`) 실패(exit 1) 확인 및 원복 후 전체 Jest 재통과.
- 실행 증거·제한 원본은 [결과](결과/APP-0-P2_하단탭_경로스텁.md).

## LIB-0-P1 현재 기록

- 이번 허용 범위: core LIB-0 P2 표의 P1 14파일 및 진행·결과·목록·인수인계 기록. 계약 Pre-flight·C1~C7·P1~P5를 전수 대조. 상세는 [결과](결과/LIB-0-P1_도서관조회_공공기반.md).
- 전용 worktree `../libproject-core-LIB-0-part1`, 브랜치 `feat/core-LIB-0-part1`. 구현 `4da20f7`, 최신 main `ad56767` merge `6a1506c`. 기존 메인 작업 폴더 미커밋 변경을 보존했다.
- 검증: 격리 PostgreSQL17 55434, Alembic -1/base 왕복, `pytest -W error` 148 passed, 가드 변이 5개 실패·원복. 앱 tsc·Jest 45·web export 통과.
- GitHub CLI로 PR #111 생성. 연결 도구 PR 쓰기 권한 403으로 CLI fallback, 활성 gh 계정 전환 없음. 커밋·push·PR까지 허용, 직접 머지·배포·알림은 하지 않는다.
- APP-0 기존 입력·검증 기록은 위에 보존했다. 이전 작업의 다음 범위/금지 목록을 이번 LIB-0 승인 범위로 오해하지 않는다.

## 재개 인계 (§7)

```text
작업 ID / 목표: LIB-0-P1 리뷰 및 별도 머지 판단. P2·P3 자동 착수 금지
사람 역할 / 기능 / AI 담당 역할: D / core / 구현·자체 검수 완료(독립 리뷰 아님)
현재 단계 / 브랜치 / HEAD / PR: 리뷰 대기 / feat/core-LIB-0-part1 / 구현 4da20f7, main merge 6a1506c + 별도 docs 커밋(재개 시 실제 HEAD 확인) / #111
기존 미커밋 변경과 보존할 파일: 기존 libproject 공유 폴더의 tracked 3·untracked 2파일, 다른 세션 및 team 변경 보존. 새 worktree에서만 진행
읽을 원문·승인 명세·계약: AGENTS.md → 필수 규칙, B2, core LIB-0 Pre-flight·C1~C7·P1~P5, 이번 결과
수정 허용 파일 / 금지 범위: P1 담당 파일·필요한 기록만. P2·P3·SRV-0·M2·team 변경·머지·배포 금지
완료 기준 / 현재 충족: P1 코드·로컬 검증·자체 검수·PR 게시. 독립 리뷰·실제 제공자·운영은 미검증
실행 명령·위치·결과: 결과 §3. server pytest -W error 148, Alembic -1/base 왕복; mobile tsc/Jest45/export 통과
정적 검토 / 실행 검증 / 미검증: 결과 §2~4. 실제 Uvicorn 접근 로그·동시 예약 확인, 화면/실기기/운영 미검증
명세와 달라진 점 / 결정 대기: 계약 필드·경로 변경 없음. 괄호 주소 정규화 및 422 detail 공통 등록은 결과 §4
다음 담당자가 할 첫 행동: 전용 worktree에서 branch/HEAD/status/diff 및 PR #111 최신 head·CI를 확인하고 독립 리뷰
허용된 Git 단계 / 외부 알림 여부 / 승인 근거: 사용자 2026-11-17 요청으로 commit/push/PR. 머지·배포·외부 알림 미수행
```
