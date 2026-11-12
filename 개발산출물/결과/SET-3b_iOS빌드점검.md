# 결과: SET-3b iOS 빌드 점검 job

- **일시:** 2026-11-12 (win) · **수행:** Claude Code (D 요청) · **브랜치:** `step/SET-3b`(main `aa4a6c3`에서 분기, PR #11 머지 `76ab264` 반영) · **PR:** #12
- **명세:** [SET-1 구현명세](../명세/SET-1_구현명세.md) §5-1 (iOS 빌드 점검 job, ruleset 적용 시점)
- **범위:** `.github/workflows/ci.yml` 한 파일 + 이 결과·진행·인수인계 문서. `server/`·`mobile/` 소스는 건드리지 않았다.

## 1. main 보호 ruleset 적용과 확인

| 순서 | 확인 내용 | 결과 |
| --- | --- | --- |
| 1 | `main` push 실행에서 `CI ok` 통과 | #9 머지(`3c589cc`, run 43138136569)·#10 머지(`aa4a6c3`, run 43141180494) 모두 변경 감지·서버 시험·앱 점검·`CI ok` success |
| 2 | ruleset 적용(사용자 확인 뒤, Hunseokc) | `gh api repos/axteamc/localone/rulesets --method POST --input 개발산출물/자료/ruleset_main.json` → `localone-main`, id **27086574**, `active`, 규칙 deletion·non_fast_forward·pull_request·required_status_checks |
| 3 | 문서 PR 하나로 확인(PR #11, SET-3 결과 §5 한 줄) | 변경 감지 pass, **서버 시험·앱 점검 skipping**, `CI ok` pass(4초), `mergeStateStatus: CLEAN` → merge 머지 `76ab264`. 우회 없이 머지됨 |

## 2. 시작 전 확인(공식 출처, 2026-11-12)

| 항목 | 확인 결과 | 출처 |
| --- | --- | --- |
| Expo SDK 58의 **최소 Xcode** | **26.4+** (iOS 16.4+, Android 7+, compileSdk 37 / targetSdk 36). SDK 57도 같은 26.4+. SET-3 때는 이 표를 못 찾았다 | [docs.expo.dev/versions/latest](https://docs.expo.dev/versions/latest/) "Support for Android and iOS versions" 표 |
| `macos-26` 이미지 | 이미지 20261102.0473.1, Xcode **26.6(기본, 17F113)**·26.5·26.4.1·26.3·26.2·26.1.1·26.0.1, 시뮬레이터 런타임 iOS 26.2·26.4·26.5, Node 24.22.2, CocoaPods 1.17.0 → 기본 Xcode가 최소 26.4를 넘으므로 `xcode-select`를 따로 하지 않았다 | [actions/runner-images macos-26-arm64 README](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md) |
| prebuild + 시뮬레이터 빌드 명령 | `npx expo prebuild -p ios --clean`(문서 예시), 빌드는 `npx expo run:ios --device generic` — 문서가 "Build-only workflow"로 설명, `generic/platform=iOS Simulator` 대상으로 빌드하며 CI 용도로 "시뮬레이터 설정 없이 시뮬레이터 앱을 빌드"한다고 적혀 있다. `--no-bundler`는 개발 서버를 띄우지 않는 옵션 | [docs.expo.dev/more/expo-cli](https://docs.expo.dev/more/expo-cli/) Compiling iOS |
| macOS 빌드 소요 시간 | **공식 수치 없음** → PR #12에서 실측(§4) | — |

## 3. 만든 것(`ci.yml`)

- **최종 실행 조건:** `ios` job은 `if: github.event_name != 'pull_request'` — **PR에서는 돌지 않고(PR 대기 0) `main` push와 수동 실행(`workflow_dispatch`, 새로 추가)에서만 돈다.** PR에서는 건너뜀이라 `CI ok`가 통과한다. `main`에서 깨지면 그 머지 커밋이 원인이다.
- `concurrency`: PR은 이전과 같이 브랜치마다 새 push가 이전 실행을 취소한다. `main` push·수동 실행은 그룹을 커밋 SHA로 나눠 **취소하지 않는다**(연달아 머지해도 커밋마다 iOS 결과가 남는다).
- `ios` job(이름 **iOS 빌드 점검**): `runs-on: macos-26`, `timeout-minutes: 60`, `mobile/`에서 checkout → setup-node 24(npm 캐시) → `xcodebuild -version` → `npm ci` → `npx expo prebuild --platform ios --clean` → `npx expo run:ios --device generic --no-bundler`. `ios/`는 CI 안에서만 생기고 커밋하지 않는다(`.gitignore` 58행 `ios/`로 `mobile/ios/` 무시 확인). 스크린샷 비교 없음.
- `CI ok`의 `needs`를 `[changes, server, app, ios]`로 늘렸다(건너뜀은 통과, 실패·취소는 실패 — 집계 로직은 그대로).

## 4. 검증 결과(PR #12, run 43142731551)

| job·단계 | 결과 | 소요 |
| --- | --- | --- |
| 변경 감지 / 서버 시험 / 앱 점검 | pass | 5초 / 18초 / 36초 |
| **iOS 빌드 점검** 전체 | pass, 로그에 `Xcode 26.6`·`Build version 17F113`·`Pod installation complete! … 108 total pods installed`·`› Build Succeeded` | **22분 33초** |
| └ `npm ci` | | 15초 |
| └ `expo prebuild`(CocoaPods 설치 포함) | | 2분 |
| └ `expo run:ios --device generic`(Debug, 캐시 없음) | | 약 19분 57초 |
| `CI ok` | pass(iOS job을 기다린 뒤 집계) | 3초 |

- 실행 조건은 세 번 바뀌었다. ① 첫 실행: `mobile/`·`.github/workflows/`가 바뀐 PR + main push. ② 1차 결정: 네이티브 영향 파일 PR + main push. ③ **최종 결정: main push·수동 실행만**(아래).
- **1차 결정(사용자, 2026-11-12):** 네이티브에 영향을 주는 파일이 바뀐 PR(`package.json`·`package-lock.json`·`app.json`·`ci.yml`) + main push. 줄인 조건은 로컬 모의로 확인했다(`mobile/app/index.tsx`·`server/x.py` → false, 위 4개 파일 → true). 줄인 조건으로 PR #12를 다시 돌린 결과(run 43145951384): 변경 감지·서버 시험(27초)·앱 점검(20초)·**iOS 빌드 점검(13분 30초)**·`CI ok` 모두 pass. 캐시가 없는데도 첫 실행(22분 33초)과 9분 차이가 나서, 실행기에 따라 **약 13~23분**으로 본다.
- **최종 결정(사용자, 2026-11-12):** 그래도 너무 길다는 의견에 따라 다시 물었다. 사용자 제안은 "대기능(계획 §2 Feature) 완성 때만"이었고, 비교안으로 "main push만, 비차단"을 냈다. **1순위 = main push만(비차단, PR 대기 0)**, 차선은 없음. 탈락: 대기능 완성 때만(마지막 PR에 라벨을 붙여 실행 — 지도·알림·카메라 같은 네이티브 모듈은 대기능 중간 Step에서 들어오므로 깨짐이 최대 3~4 PR 쌓인 뒤 발견된다), 둘 다(라벨 운영이 추가되는데 이득이 작다). 고른 이유: PR 대기를 없애면서도 머지마다 확인해 깨진 커밋을 하나로 특정한다. 대가는 깨진 것을 머지 뒤에 알고 고치는 PR이 하나 더 필요하다는 점이다.
- 최종 조건 검증은 아래 §4-1.

### 4-1. 최종 조건 검증(커밋 `8583b6d`)

| 실행 | 결과 | 소요 |
| --- | --- | --- |
| PR #12 `pull_request`(run 43150150124) | 변경 감지·서버 시험·앱 점검 success, **iOS 빌드 점검 skipped**, `CI ok` success | 전체 **46초**(PR 대기에서 iOS가 빠짐) |
| 브랜치 수동 실행 `workflow_dispatch`(run 43150155914, main push와 같은 경로) | 변경 감지·서버 시험·앱 점검·**iOS 빌드 점검 success**, `CI ok`가 iOS를 기다린 뒤 success | iOS **12분 46초** |

## 5. 명세와 다르게 한 것(이유)

| 명세 | 실제 | 이유 |
| --- | --- | --- |
| §5-1 "`mobile/` 안이 바뀐 PR만 이 job을 켠다", 의도 "PR마다 자동으로 본다" | **PR에서는 돌지 않고 `main` push·수동 실행에서만** | 실측 13~23분 → 사용자 결정(2026-11-12). 머지 전 차단이 아니라 머지 뒤 감지로 바뀐다 |
| (없음) | `workflow_dispatch` 추가 | 워크플로를 고친 브랜치에서 PR이 아닌 경로(iOS job 포함)를 머지 전에 돌려 보려고. 이번 PR에서 이것으로 확인했다 |
| (없음) | `main`·수동 실행의 `concurrency`를 커밋마다 분리, 취소 안 함 | 연달아 머지하면 앞 실행이 취소돼 어느 커밋이 깨뜨렸는지 모르게 되는 것을 막으려고 |

## 6. 미검증·주의

- **iOS 빌드 깨짐은 머지 뒤 `main`에서야 드러난다.** `main`의 `CI ok`가 빨간색이면 그 머지 커밋의 iOS job 로그를 보고 고치는 PR을 낸다. 네이티브 모듈(지도·알림·카메라 등)을 넣는 PR은 머지 전에 그 브랜치에서 수동 실행(`gh workflow run CI --ref <브랜치>`)을 거는 것을 권한다(필수 아님).
- `main`의 `CI ok`가 iOS job을 기다리므로 `main` 실행은 13~23분 걸린다. PR 머지는 막지 않는다.
- 캐시(CocoaPods·DerivedData·ccache)는 넣지 않았다. 빌드 시간을 줄이려면 후속으로 검토한다.
- Debug 빌드만 본다. Release·서명·실기기 설치·조작감은 D의 실기기 확인이 남는다.
- 실제 `main` push 경로는 이 PR 머지 뒤 첫 실행에서 확인한다(수동 실행으로 같은 조건은 미리 확인).

## 7. 이어서 할 일

1. PR #12 머지(D) → `main` push에서 iOS job 통과 확인.
2. 후속(이번 범위 아님): 서버 개발용 CORS(웹 스모크 확인용, 로컬 출처만), 번들 ID 확정(`kr.localone.app`은 임시).
