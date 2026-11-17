# D 공통 기반 진행

상태: APP-0-P1 머지 완료(PR [#96](https://github.com/axteamc/localone/pull/96), `00f71a3`). APP-0-P2 머지 완료(PR [#109](https://github.com/axteamc/localone/pull/109), `4393e3f`; `main` push CI `43998844366` iOS 빌드 점검 진행 중, 실기기 `needs-ios` 미확인). **APP-0-P1 VISIT-2 선행 보완 4파일 로컬 구현·검증·게시 완료, PR [#110](https://github.com/axteamc/localone/pull/110).** 사람 역할 D / AI 구현·자체 검증 담당. 2026-11-17 Windows.

## 입력과 경계

- B2: [기준선 §0](기준선.md), team `3361a5f` / `908eae4`(VISIT-2 보완 포함), `.team_docs/contracts/core.md` APP-0 C1~C7·P1~P5·`APP-0-P1 보완(VISIT-2 선행)`(본문 SHA `b0a1523899fe33e798af39227db273b8dfdde02a`).
- PR #96(`00f71a3`)·PR #102(`71a9e67`)·PR #109(`4393e3f`)·PR #94(`ad56767`) 머지 반영된 `origin/main` `ad5676704009047934fb0c66cc14a695e5510781`에서 격리 worktree(`../libproject-app0-p1-visit2`)로 `feat/core-APP-0-part1-visit2` 생성.
- APP-0-P1 VISIT-2 선행 보완 허용: `mobile/src/lib/visits.ts`, `mobile/src/lib/__tests__/lib.test.ts`, `mobile/src/theme/tokens.ts`, `mobile/src/theme/__tests__/theme.test.ts` (4파일), 이 진행·결과·인수인계 기록과 목록 등록.
- 보존: 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`(`docs/sync-artifacts-20261117`), `../libproject-core-LIB-0-part1`(`feat/core-LIB-0-part1`) 및 `../team` 보류 묶음.
- Git: `Hunseokc`로 commit/push/PR·CI 확인, 종료 시 `choise-hun` 복구. 직접 머지 금지.

## 순서

| 순서 | 파트 | 상태 |
| --- | --- | --- |
| 1 | APP-0-P1 (+ VISIT-2 선행 보완) | 본편 머지 완료(PR #96, `00f71a3`) / **VISIT-2 선행 보완 PR [#110](https://github.com/axteamc/localone/pull/110) 게시·CI 대기** |
| 2 | APP-0-P2 | 머지 완료 (PR [#109](https://github.com/axteamc/localone/pull/109), `4393e3f`; `main` iOS 빌드 진행 중, 실기기 `needs-ios` 확인 대기) |
| 3 | APP-0-P3 | 미착수; `EXPO_PUBLIC_KAKAO_JS_KEY` 키 없음 확인(발급·도메인 확인 필요) |
| 4 | LIB-0-P1 → P2 → P3 | 별도 worktree `../libproject-core-LIB-0-part1`에 P1 미커밋 작업물 존재 |
| 5 | SRV-0-P1 → P2 | 미착수 |

제품 순서 원본은 `계획/상용_서비스_계획.md` §2다.

## 검증과 다음 행동

- APP-0-P1 VISIT-2 선행 보완 코드 `739d54a0aff132ec90b7fc82c25bef187cb719d5` (`Owner: D`). 허용 4파일 집합 일치, UTF-8/LF 확인.
- `mobile` 검증: `npm ci` exit 0 (1,094 packages) → `npx tsc --noEmit` exit 0 → `npx jest --runInBand src/lib/__tests__/lib.test.ts src/theme/__tests__/theme.test.ts` exit 0 (2 suites / 31 tests) → `npx jest --runInBand` exit 0 (7 suites / 48 tests passed) → `npx expo export --platform web` exit 0 (870 modules, `Exported: dist`).
- 실제 가드 제거 변이 3곳(`write()` catch 반환값, `recordVisit()` `!saved` 분기, `shadowFloat` 토큰 값) 실패(exit 1) 확인 및 원복 후 전체 Jest 재통과(7 suites / 48 tests).
- 실행 증거·제한 원본은 [결과](결과/APP-0-P1_VISIT2_선행보완.md).

## 다음 세션 시작 지시

- 권장 Effort: **중간** (이 보완 PR 머지 + PR #109 `main` iOS CI 결과/실기기 목록 반영, 이후 `카카오 JS 키 확인 후 APP-0-P3` 또는 `LIB-0-P1` 진행).

```text
GEMINI.md(또는 AGENTS.md), AI간_협업_구조.md, 개발산출물/진행_D공통기반.md를 읽고 이어서 한다.
1) 먼저 git status, origin/main, PR #109 main CI(43998844366) iOS 빌드 점검 결과 및 APP-0-P1 VISIT-2 선행 보완 PR 머지 여부를 확인한다.
2) 다음 작업(카카오 JS 키 확인 후 APP-0-P3 / 기존 ../libproject-core-LIB-0-part1 이어서 LIB-0-P1 / SRV-0-P1) 중 D가 지시한 파트를 진행한다.
```

## 재개 인계 (§7)

```text
작업 ID / 목표: APP-0-P1 VISIT-2 선행 보완 4파일 구현·검증·PR 게시, D 머지 및 후속 파트 선택 대기
사람 역할 / 기능 / AI 담당 역할: D / core / 구현·자체 검증 완료(독립 리뷰 아님)
현재 단계 / 브랜치 / HEAD / PR: 리뷰 대기 / feat/core-APP-0-part1-visit2 / 코드 739d54a + 별도 docs 커밋 / #110
기존 미커밋 변경과 보존할 파일: 공유 worktree(docs/sync-artifacts-20261117), ../libproject-core-LIB-0-part1 및 ../team 보류 묶음 보존
읽을 원문·승인 명세·계약: GEMINI.md/AGENTS.md → 필수 규칙, B2, core APP-0 C1~C7·P1~P5·APP-0-P1 보완, 이 결과 §2~4
수정 허용 파일 / 금지 범위: 보완 4파일 + 진행/결과/목록/인수인계 기록. P3·LIB-0·SRV-0·직접 머지 금지
완료 기준 / 현재 충족: 보완 4파일 구현·로컬 검증·변이 3건 충족. 웹 실사용·Android/iOS·머지 미확인
실행 명령·위치·결과: 결과 §3, mobile npm ci / tsc / Jest 48 / expo export web exit 0
정적 검토 / 실행 검증 / 미검증: 결과 §2~4. 웹 조작·Android/iOS 실기기·운영 미실행
명세와 달라진 점 / 결정 대기: 없음. APP-0-P3는 mobile/.env에 EXPO_PUBLIC_KAKAO_JS_KEY 미설정 상태
다음 담당자가 할 첫 행동: 보완 PR CI 확인 후 D 머지 판단, PR #109 iOS job 결과 확인, 다음 파트 선택
허용된 Git 단계 / 외부 알림 여부 / 승인 근거: commit/push/PR·CI 확인. 직접 머지·외부 알림 미수행
```
