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

- `changes` job에 출력 `mobile` 추가. PR은 바뀐 파일에 **`mobile/package.json`·`mobile/package-lock.json`·`mobile/app.json`·`.github/workflows/ci.yml`** 중 하나가 있으면 `true`, `main` push는 항상 `true`.
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

- 첫 실행은 감지 조건이 `mobile/`·`.github/workflows/` 전체였다. 소요 시간이 길어 사용자에게 물었다.
- **실행 조건 결정(사용자, 2026-11-12):** 1순위 = **네이티브에 영향을 주는 파일이 바뀐 PR(`package.json`·`package-lock.json`·`app.json`·`ci.yml`) + main push**. 차선은 없음. 탈락: 지금대로(`mobile/` 전체 PR, 매번 약 23분), main push만(깨진 것을 머지 뒤에야 앎). 줄인 조건은 로컬 모의로 확인했다(`mobile/app/index.tsx`·`server/x.py` → false, 위 4개 파일 → true). 줄인 조건으로 PR #12를 다시 돌린 결과(run 43145951384): 변경 감지·서버 시험(27초)·앱 점검(20초)·**iOS 빌드 점검(13분 30초)**·`CI ok` 모두 pass. 캐시가 없는데도 첫 실행(22분 33초)과 9분 차이가 나서, 실행기에 따라 **약 13~23분**으로 본다.

## 5. 명세와 다르게 한 것(이유)

| 명세 | 실제 | 이유 |
| --- | --- | --- |
| §5-1 "`mobile/` 안이 바뀐 PR만 이 job을 켠다" | `mobile/`의 `package.json`·`package-lock.json`·`app.json` + `ci.yml`이 바뀐 PR만 | 실측 약 23분 → 사용자 결정(명세가 적어 둔 축소안). `ci.yml`은 워크플로 자체를 바꾼 PR에서 job을 확인하려고 넣었다 |

## 6. 미검증·주의

- **`app.config.js`·config plugin 파일·`mobile/plugins/` 같은 새 네이티브 설정 파일**은 아직 없어서 감지 목록에 없다. 생기면 감지 정규식에 넣어야 한다. 화면 코드(`.tsx`)만 바뀐 PR은 iOS 빌드를 보지 않으므로, 네이티브 모듈을 쓰는 화면 변경이 깨지면 `main` push에서야 드러난다.
- 캐시(CocoaPods·DerivedData·ccache)는 넣지 않았다. 빌드 시간을 줄이려면 후속으로 검토한다.
- Debug 빌드만 본다. Release·서명·실기기 설치·조작감은 D의 실기기 확인이 남는다.
- `main` push 경로의 iOS job은 이 PR 머지 뒤 첫 실행에서 확인한다.

## 7. 이어서 할 일

1. PR #12 머지(D) → `main` push에서 iOS job 통과 확인. 이 PR은 `ci.yml`을 바꾸므로 push할 때마다 iOS job이 다시 돈다.
2. 후속(이번 범위 아님): 서버 개발용 CORS(웹 스모크 확인용, 로컬 출처만), 번들 ID 확정(`kr.localone.app`은 임시).
