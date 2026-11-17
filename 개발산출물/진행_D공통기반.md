# D 공통 기반 진행

상태: APP-0-P1 머지 완료(PR [#96](https://github.com/axteamc/localone/pull/96), `00f71a3`). **APP-0-P2 로컬 검증·게시 완료, PR [#109](https://github.com/axteamc/localone/pull/109) (`needs-ios`).** CI·iOS 확인 및 머지 대기. 사람 역할 D / AI 구현·자체 검증 담당. 2026-11-17 Windows.

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
| 2 | APP-0-P2 | 로컬 검증·게시 완료 (PR [#109](https://github.com/axteamc/localone/pull/109)) / CI·iOS D 확인 대기 |
| 3 | APP-0-P3 | 미착수; 카카오 JS 키 필요 |
| 4 | LIB-0-P1 → P2 → P3 | 미착수 |
| 5 | SRV-0-P1 → P2 | 미착수 |

제품 순서 원본은 `계획/상용_서비스_계획.md` §2다.

## 검증과 다음 행동

- APP-0-P2 구현 코드 `bb0fcbb77d606aa27ce35af1951660e92e448ed6` (`Owner: D`). 허용 12파일 집합 일치, `#RRGGBB` 0건, UTF-8/LF 확인.
- `mobile` 검증: `npm ci` exit 0 (1,094 packages) → `npx tsc --noEmit` exit 0 → `npx jest --runInBand` exit 0 (7 suites / 45 tests passed) → `npx expo export --platform web` exit 0 (870 modules, `Exported: dist`).
- 실제 가드 제거 변이 3곳(독서 기록 탭 삽입, `distanceM` 검증 제거, `(tabs)` `headerShown: true`) 실패(exit 1) 확인 및 원복 후 전체 Jest 재통과.
- 실행 증거·제한 원본은 [결과](결과/APP-0-P2_하단탭_경로스텁.md).

## 다음 세션 시작 지시

- 권장 Effort: **중간** (PR #109 iOS/실기기 확인 후 머지 또는 `APP-0-P1 보완` / `APP-0-P3` / `LIB-0-P1` 중 선택 진행).

```text
GEMINI.md(또는 AGENTS.md), AI간_협업_구조.md, 개발산출물/진행_D공통기반.md를 읽고 이어서 한다.
1) 먼저 git status와 origin/main 상태를 확인하고, PR #109(feat/core-APP-0-part2)의 CI·iOS 확인·머지 여부를 D에게 확인한다.
2) 다음 작업(APP-0-P1 VISIT-2 선행 보완 4파일 / 카카오 JS 키 확인 후 APP-0-P3 / LIB-0-P1) 중 D가 지시한 파트를 최신 origin/main에서 착수한다.
```

## 재개 인계 (§7)

```text
작업 ID / 목표: APP-0-P2 구현·로컬 검증·PR #109 게시 완료, CI·iOS 확인 및 머지 판단 대기
사람 역할 / 기능 / AI 담당 역할: D / core / 구현·자체 검증 완료(독립 리뷰 아님)
현재 단계 / 브랜치 / HEAD / PR: 리뷰 대기 / feat/core-APP-0-part2 / 코드 bb0fcbb + 별도 docs 커밋 / #109 (needs-ios)
기존 미커밋 변경과 보존할 파일: 공유 worktree(docs/sync-artifacts-20261117) 미커밋 변경 및 ../team 보류 묶음 보존
읽을 원문·승인 명세·계약: AGENTS.md/GEMINI.md → 필수 규칙, B2, core APP-0 C1~C7·P1~P5, 이 결과 §2~4
수정 허용 파일 / 금지 범위: P2 12파일 + 진행/결과/목록/인수인계 기록. P3·LIB-0·SRV-0·직접 머지 금지
완료 기준 / 현재 충족: P2 구현·로컬 검증·PR 게시 충족. iOS·실기기·웹 인터랙션·머지 미확인
실행 명령·위치·결과: 결과 §3, mobile npm ci / tsc / Jest 45 / expo export web exit 0
정적 검토 / 실행 검증 / 미검증: 결과 §2~4. 웹 조작·Android/iOS 실기기·운영 미실행
명세와 달라진 점 / 결정 대기: team core.md(908eae4) C2에 맞춰 libraries/[libraryId] 선택 distanceM 검증 포함
다음 담당자가 할 첫 행동: PR #109 CI 및 iOS 확인 후 D 머지 판단, 이후 후속 파트 착수
허용된 Git 단계 / 외부 알림 여부 / 승인 근거: commit/push/PR·CI 확인까지 사용자 지시. 머지·외부 알림 미수행
```
