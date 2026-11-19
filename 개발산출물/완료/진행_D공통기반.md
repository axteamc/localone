# D 공통 기반 진행

상태: **완료 (M1 D 공통 기반 8파트 전부 `main` 머지 완료, 2026-11-17).**
- APP-0-P1(+ VISIT-2 선행 보완): 머지 완료(PR [#96](https://github.com/axteamc/localone/pull/96) `00f71a3`, PR [#110](https://github.com/axteamc/localone/pull/110) `dfa7f23`).
- APP-0-P2: 머지 완료(PR [#109](https://github.com/axteamc/localone/pull/109) `4393e3f`; `main` CI [`43998844366`](https://github.com/axteamc/localone/actions/runs/43998844366) iOS 빌드 점검 `success`, 실기기 `needs-ios` 미확인).
- APP-0-P3: 머지 완료(PR [#114](https://github.com/axteamc/localone/pull/114) `8c02cde`, 2026-11-17; 실기기 `needs-ios` 미확인).
- LIB-0-P1·P2·P3: 전부 머지 완료(P1 PR [#111](https://github.com/axteamc/localone/pull/111) `4c197f2`, P2 PR [#119](https://github.com/axteamc/localone/pull/119) `408f648`, P3 PR [#121](https://github.com/axteamc/localone/pull/121) `bba1665`).
- SRV-0-P1·P2: 전부 머지 완료(P1 PR [#118](https://github.com/axteamc/localone/pull/118) `8ed2eb3`, P2 PR [#120](https://github.com/axteamc/localone/pull/120) `4370285`).

사람 역할 D / AI 구현·자체 검증 담당. 후속 M2 공통 기반은 [진행_M2공통기반](../진행_M2공통기반.md)에서 이어 간다.

## 입력과 경계

- B2: [기준선 §0](../기준선.md), team `3361a5f` / `908eae4`, `../../team/contracts/core.md` APP-0·LIB-0·SRV-0 C1~C7·P1~P5(APP-0/LIB-0 본문 SHA `492425ddf3d5985a336c368d5c320d82fd044bc1`).
- PR #110(`dfa7f23`) 머지 반영 `origin/main` `dfa7f23`에서 격리 worktree(`../libproject-app0-p3`)로 `feat/core-APP-0-part3` 생성 후 최신 `origin/main` `5305ac1`(PR #111·#93·#95 반영) merge.
- APP-0-P3 허용: `mobile/src/lib/map/KakaoMap.tsx`, `mobile/src/lib/map/KakaoMap.web.tsx`, `mobile/src/lib/map/kakaoHtml.ts`, `mobile/src/lib/map/__tests__/KakaoMap.test.tsx`, `mobile/.env.example`, `mobile/package.json`, `mobile/package-lock.json` (7파일), 이 진행·결과·목록 기록.
- 보존: 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`(`docs/sync-artifacts-20261117`), `../libproject-core-LIB-0-part1`(`feat/core-LIB-0-part1`) 및 `../team` 보류 묶음.
- Git: `Hunseokc`로 commit/push/PR·CI 확인, 종료 시 `choise-hun` 복구. 직접 머지 금지.

## 순서

| 순서 | 파트 | 상태 |
| --- | --- | --- |
| 1 | APP-0-P1 (+ VISIT-2 선행 보완) | 머지 완료 (PR #96 `00f71a3`, PR #110 `dfa7f23`, `main` CI [`43999999413`](https://github.com/axteamc/localone/actions/runs/43999999413) `success`) |
| 2 | APP-0-P2 | 머지 완료 (PR #109 `4393e3f`; `main` CI [`43998844366`](https://github.com/axteamc/localone/actions/runs/43998844366) iOS 빌드 점검 `success`, 실기기 `needs-ios` 확인 대기) |
| 3 | APP-0-P3 | **머지 완료** (PR [#114](https://github.com/axteamc/localone/pull/114) `8c02cde`, 2026-11-17; 실기기 `needs-ios` 미확인) |
| 4 | LIB-0-P1 → P2 → P3 | **전부 머지 완료** — P1 (PR [#111](https://github.com/axteamc/localone/pull/111) `4c197f2`) · P2 (PR [#119](https://github.com/axteamc/localone/pull/119) `408f648`) · P3 (PR [#121](https://github.com/axteamc/localone/pull/121) `bba1665`) |
| 5 | SRV-0-P1 → P2 | **전부 머지 완료** — P1 (PR [#118](https://github.com/axteamc/localone/pull/118) `8ed2eb3`) · P2 (PR [#120](https://github.com/axteamc/localone/pull/120) `4370285`) |

제품 순서 원본은 `계획/상용_서비스_계획.md` §2다.

## 검증과 다음 행동 (APP-0-P3)

- APP-0-P3 코드 `46218f31593f808ef85f22d5bf3947a88864252a` (`Owner: D`). 허용 7파일 집합 일치, `#RRGGBB` 0건, UTF-8/LF 확인.
- `mobile` 검증: `npm install --ignore-scripts` & `npx expo install --check react-native-webview`(`14.0.1`) exit 0 → `npx tsc --noEmit` exit 0 → `npx jest --runInBand` exit 0 (**8 suites / 60 tests passed**) → `npx expo export --platform web` exit 0 (867 modules, 14 web bundles, `Exported: dist`).
- 실제 가드 제거 변이 4곳(`KakaoMap.tsx` `!appKey` 조기 반환·5초 타이머, `KakaoMap.web.tsx` `reportError` 중복 가드, `kakaoHtml.ts` `<` 이스케이프) 실패(exit 1) 확인 및 원복 후 전체 Jest 재통과(8 suites / 60 tests).
- 실행 증거·제한 원본은 [결과](../결과/APP-0-P3_카카오지도어댑터.md).

## LIB-0-P1~P3 · SRV-0-P1~P2 완료 기록

- **LIB-0-P1:** core LIB-0 P2 표의 P1 14파일. 전용 worktree `../libproject-core-LIB-0-part1`, 브랜치 `feat/core-LIB-0-part1`. 구현 `4da20f7`, PR #111 머지 `4c197f2`. 검증: 격리 PostgreSQL17 55434, Alembic -1/base 왕복, `pytest -W error` 148 passed, 가드 변이 5개 실패·원복. 앱 tsc·Jest 48·web export 통과. 상세는 [결과](../결과/LIB-0-P1_도서관조회_공공기반.md).
- **LIB-0-P2·P3:** 도서 검색·인기 추천(`#7`~`#9`, PR [#119](https://github.com/axteamc/localone/pull/119) `408f648`) 및 소장·대출 가능·구매 링크(`#12`~`#15`, PR [#121](https://github.com/axteamc/localone/pull/121) `bba1665`). 최종 서버 `pytest -W error` 253 passed, 모바일 tsc·Jest 146·web export 통과, 가드 변이 7건 실패·원복. 상세는 [결과](../결과/LIB-0-P2_P3_발췌이식_2026-11-17.md).
- **SRV-0-P1·P2:** 쓰기 잠금(`lock_active_user`)·선택 인증·422 필드(PR [#118](https://github.com/axteamc/localone/pull/118) `8ed2eb3`) 및 작성자 표시 이름 `user_profiles`(PR [#120](https://github.com/axteamc/localone/pull/120) `4370285`). 서버 `pytest -W error` P1 161 / P2 175 passed, 가드 변이 6건 실패·원복. 상세는 [결과](../결과/SRV-0-P1_P2_발췌이식_2026-11-17.md).

## 완료 (2026-11-17)

- M1 D 공통 기반(APP-0-P1~P3, LIB-0-P1~P3, SRV-0-P1~P2) 전부 `main` 머지 완료. `개발산출물/완료/`로 이동(2026-11-19).
- 후속 M2 공통 기반은 [진행_M2공통기반](../진행_M2공통기반.md)에서 진행한다.
