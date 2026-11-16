# D 공통 기반 진행

상태: APP-0-P1 로컬 검증·게시 완료, Draft PR [#96](https://github.com/axteamc/localone/pull/96). CI는 사용자 D 확인 대기, 머지 전. 사람 역할 D / AI 구현·자체 검증 담당. 2026-11-16 Windows.

## 입력과 경계

- B2: [기준선 §0](기준선.md), team `3361a5f`, core APP-0 본문 `492425ddf3d5985a336c368d5c320d82fd044bc1`.
- PR #92 머지 `4b73789bfa2074c71a5331922a00d545f3013b76` 확인 후 main fast-forward pull, 같은 origin/main에서 `feat/core-APP-0-part1` 생성.
- 허용: core APP-0 P2 표의 APP-0-P1 13파일, 이 진행·결과·인수인계 기록과 목록 등록. 계약 키·시그니처·토큰 이름 변경은 사전 질문.
- 보존: 미추적 `개발산출물/시안/PR51_56e6ecb_VISIT-1_시안.html`, `PR77_VISIT-1b_시안.html`, `PR79_LIB-1_시안.html`. team의 `templates/시안.html` 수정·`docs/앱_표준_패턴.md`·`tools/check_mockup.py`·`.sh` 미추적 묶음.
- Git: Hunseokc로 commit/push/PR·CI 확인까지 허용. 종료 시 choise-hun 복구. 머지·주니어 PR 리뷰·team 커밋·알림·후속 파트 착수 금지.

## 순서

| 순서 | 파트 | 상태 |
| --- | --- | --- |
| 1 | APP-0-P1 | 로컬 검증·게시 완료 / CI·iOS D 확인 대기 |
| 2 | APP-0-P2 | 미착수 |
| 3 | APP-0-P3 | 미착수; P1 머지·카카오 JS 키 필요 |
| 4 | LIB-0-P1 → P2 → P3 | 미착수 |
| 5 | SRV-0-P1 → P2 | 미착수 |

후속 순서는 재개용 기록이며 이번 승인 범위는 P1뿐이다. 제품 순서 원본은 계획 §2다.

## 검증과 다음 행동

- Expo SDK 58 공식 문서: location 권장 `~58.0.22`, AsyncStorage `2.2.0`(기존과 같음). 설치는 현재 SDK의 `npx expo install` 결과를 따른다.
- 정보나루 공식 매뉴얼 v20260620 pp.63~70 활성 코드 264개·폐지 2개 제외·11020 중구 확인, 계약 변경 불필요.
- 구현 코드 `6d6bb502b7fb137f4af149bd7810d19c2b559543`. 로컬 `npm ci`, `tsc`, Jest 6 suites/42 tests, 웹 export, Expo 생성 설정 검사 통과. 가드 제거 변이 4개 실패 확인·원복.
- **사용자 후속 지시(2026-11-16): CI 확인은 D가 직접 한다.** 자동 CI 대기/판정은 수행하지 않음. Draft 유지, CI·iOS 확인 뒤 Ready/머지는 D가 판단한다.
- 실행 증거·제한 원본은 [결과](결과/APP-0-P1_앱공통기반.md). 다음: D의 PR #96 CI·iOS 확인·리뷰. 후속 파트는 미착수 유지.

## 재개 인계 (§7)

```text
작업 ID / 목표: APP-0-P1 게시 완료, D의 CI·플랫폼 확인 및 별도 머지 판단
사람 역할 / 기능 / AI 담당 역할: D / core / 구현·자체 검증 완료(독립 리뷰 아님)
현재 단계 / 브랜치 / HEAD / PR: Draft PR / feat/core-APP-0-part1 / 코드 6d6bb50 + 별도 docs 커밋(재개 시 실제 HEAD 확인) / #96
기존 미커밋 변경과 보존할 파일: 위 입력과 경계의 시안 3개, team 보류 묶음
읽을 원문·승인 명세·계약: AGENTS.md → 필수 규칙, B2, core APP-0 C1~C7·P1~P5·LIB-0 C3, 이 결과 §4~5
수정 허용 파일 / 금지 범위: 후속 수정은 요청 범위 확인. P2·P3·LIB-0·SRV-0·주니어 리뷰·team 커밋 금지
완료 기준 / 현재 충족: P1 구현·로컬 검증·PR 게시 충족. CI·실기기·머지 미확인
실행 명령·위치·결과: 결과 §4, mobile npm ci/tsc/Jest 42/export exit 0
정적 검토 / 실행 검증 / 미검증: 결과 §3~5. CI는 사용자 담당, 운영 미실행
명세와 달라진 점 / 결정 대기: 계약 변경 없음. web noopener 팝업 판별 한계는 결과 §5
다음 담당자가 할 첫 행동: branch/HEAD/status/diff와 PR #96 실제 최신 head 확인 후 CI·iOS 결과 확인
허용된 Git 단계 / 외부 알림 여부 / 승인 근거: commit/push/PR까지 사용자 승인. 머지 별도 D 확인. 외부 알림 미승인·미수행
```

종료 점검 중 미추적 `개발산출물/시안/PR78_LOCAL-1_시안.html`이 추가로 나타났다. 다른 세션 산출물로 보고 읽거나 수정·스테이징하지 않고 보존했다.
