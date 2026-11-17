# D 공통 기반 진행

상태: APP-0-P1(+ VISIT-2 선행 보완) 머지 완료(PR [#96](https://github.com/axteamc/localone/pull/96) `00f71a3`, PR [#110](https://github.com/axteamc/localone/pull/110) `dfa7f23`). APP-0-P2 머지 완료(PR [#109](https://github.com/axteamc/localone/pull/109) `4393e3f`; `main` CI [`43998844366`](https://github.com/axteamc/localone/actions/runs/43998844366) iOS 빌드 점검 `success`, 실기기 `needs-ios` 미확인). **APP-0-P3 로컬 구현·검증 완료, PR 게시 및 CI 대기.** 사람 역할 D / AI 구현·자체 검증 담당. 2026-11-17 Windows.

## 입력과 경계

- B2: [기준선 §0](기준선.md), team `3361a5f` / `908eae4`, `../team/contracts/core.md` APP-0 C1~C7·P1~P5(본문 SHA `492425ddf3d5985a336c368d5c320d82fd044bc1`).
- PR #110(`dfa7f23`) 머지 반영 `origin/main` `dfa7f234785e8f6788e27fce49f60d070499ebf2`에서 격리 worktree(`../libproject-app0-p3`)로 `feat/core-APP-0-part3` 생성.
- APP-0-P3 허용: `mobile/src/lib/map/KakaoMap.tsx`, `mobile/src/lib/map/KakaoMap.web.tsx`, `mobile/src/lib/map/kakaoHtml.ts`, `mobile/src/lib/map/__tests__/KakaoMap.test.tsx`, `mobile/.env.example`, `mobile/package.json`, `mobile/package-lock.json` (7파일), 이 진행·결과·목록 기록.
- 보존: 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`(`docs/sync-artifacts-20261117`), `../libproject-core-LIB-0-part1`(`feat/core-LIB-0-part1`) 및 `../team` 보류 묶음.
- Git: `Hunseokc`로 commit/push/PR·CI 확인, 종료 시 `choise-hun` 복구. 직접 머지 금지.

## 순서

| 순서 | 파트 | 상태 |
| --- | --- | --- |
| 1 | APP-0-P1 (+ VISIT-2 선행 보완) | 머지 완료 (PR #96 `00f71a3`, PR #110 `dfa7f23`, `main` CI [`43999999413`](https://github.com/axteamc/localone/actions/runs/43999999413) `success`) |
| 2 | APP-0-P2 | 머지 완료 (PR #109 `4393e3f`; `main` CI [`43998844366`](https://github.com/axteamc/localone/actions/runs/43998844366) iOS 빌드 점검 `success`, 실기기 `needs-ios` 확인 대기) |
| 3 | APP-0-P3 | **구현·로컬 검증·변이 4건 완료, PR 게시/CI 대기** (`EXPO_PUBLIC_KAKAO_JS_KEY` · 도메인 등록 확인) |
| 4 | LIB-0-P1 → P2 → P3 | 별도 worktree `../libproject-core-LIB-0-part1` (PR #111 OPEN 진행 중) |
| 5 | SRV-0-P1 → P2 | 미착수 |

제품 순서 원본은 `계획/상용_서비스_계획.md` §2다.

## 검증과 다음 행동

- APP-0-P3 코드 `46218f31593f808ef85f22d5bf3947a88864252a` (`Owner: D`). 허용 7파일 집합 일치, `#RRGGBB` 0건, UTF-8/LF 확인.
- `mobile` 검증: `npm install --ignore-scripts` & `npx expo install --check react-native-webview`(`14.0.1`) exit 0 → `npx tsc --noEmit` exit 0 → `npx jest --runInBand` exit 0 (**8 suites / 60 tests passed**) → `npx expo export --platform web` exit 0 (867 modules, 14 web bundles, `Exported: dist`).
- 실제 가드 제거 변이 4곳(`KakaoMap.tsx` `!appKey` 조기 반환·5초 타이머, `KakaoMap.web.tsx` `reportError` 중복 가드, `kakaoHtml.ts` `<` 이스케이프) 실패(exit 1) 확인 및 원복 후 전체 Jest 재통과(8 suites / 60 tests).
- 실행 증거·제한 원본은 [결과](결과/APP-0-P3_카카오지도어댑터.md).

## 다음 세션 시작 지시

- 권장 Effort: **높음** (APP-0-P3 PR 머지 여부 확인 + `SRV-0-P1` 쓰기 잠금·선택 인증·422 필드 구현, 또는 PR #111 `LIB-0-P1` 검토·후속 `LIB-0-P2` 진행).

```text
GEMINI.md(또는 AGENTS.md), AI간_협업_구조.md, 개발산출물/진행_D공통기반.md를 읽고 이어서 한다.
1) 먼저 git status, origin/main, APP-0-P3 PR 머지 여부(및 main iOS 빌드 점검)와 PR #111(LIB-0-P1) 상태를 확인한다.
2) 다음 작업(SRV-0-P1 또는 LIB-0-P2) 중 D가 지시한 파트를 진행한다.
```

## 재개 인계 (§7)

```text
작업 ID / 목표: APP-0-P3 카카오 지도 어댑터 구현·검증·PR 게시, D 머지 판단 및 후속 파트 대기
사람 역할 / 기능 / AI 담당 역할: D / core / 구현·자체 검증 완료(독립 리뷰 아님)
현재 단계 / 브랜치 / HEAD / PR: 검토 대기 / feat/core-APP-0-part3 / 코드 46218f3 + 별도 docs 커밋 / 게시 후 번호 갱신
기존 미커밋 변경과 보존할 파일: 공유 worktree(docs/sync-artifacts-20261117), ../libproject-core-LIB-0-part1 및 ../team 보류 묶음 보존
읽을 원문·승인 명세·계약: GEMINI.md/AGENTS.md → 필수 규칙, B2, core APP-0 C1~C7·P1~P5, 이 결과 §2~4
수정 허용 파일 / 금지 범위: 허용 7파일 + 진행/결과/목록 기록. mobile/app/·서버/DB·직접 머지 금지
완료 기준 / 현재 충족: 허용 7파일 구현·tsc/Jest 60/web export·변이 4건 충족. 실제 지도 화면/Android/iOS·머지 미확인
실행 명령·위치·결과: 결과 §3, mobile npm install --ignore-scripts / tsc / Jest 60 / expo export web exit 0
정적 검토 / 실행 검증 / 미검증: 결과 §2~4. 웹 실지도·Android/iOS 실기기·운영 미실행
명세와 달라진 점 / 결정 대기: 없음
다음 담당자가 할 첫 행동: APP-0-P3 PR CI·iOS 라벨 확인 후 D 머지 판단, SRV-0-P1 또는 LIB-0-P2 진행
허용된 Git 단계 / 외부 알림 여부 / 승인 근거: commit/push/PR·CI 확인. 직접 머지·외부 알림 미수행
```
