# 결과: SET-3 앱 뼈대·CI

- **일시:** 2026-11-12 (win) · **수행:** Claude Code (D 요청) · **브랜치:** `step/SET-3`(main `e9bc341`, SET-2 PR #5 머지 뒤 분기)
- **명세:** [SET-1 구현명세](../명세/SET-1_구현명세.md) §1·§3·§5·§5-1
- **범위 결정(사용자, 2026-11-12):** 파일 상한(7개)을 넘어 **iOS 빌드 점검 job은 SET-3b로 분리**했다. SET-3은 앱 뼈대 + 서버·앱 CI + `CI ok` 집계다. `.nvmrc`는 만들지 않고 `package.json`의 `engines`와 CI의 `node-version: 24`로 대신한다.

## 1. 시작 전 확인한 버전(공식 출처, 2026-11-12)

| 항목 | 확인 결과 | 출처 |
| --- | --- | --- |
| Expo SDK 최신 | **SDK 58**, React Native 0.88. 패키지 `expo` 최신 58.0.24 | docs.expo.dev 버전 문서, npm |
| Node 요구 | **22.13 이상 22계열 / 24.3 이상 24계열 / 26 이상**, 홀수(23·25) 미지원. `react-native@0.88`·`@expo/cli`의 `engines`도 같은 범위. 이 PC Node 26.8.1, CI는 24(24.3+) | Expo SDK 58 변경 기록, npm `engines` |
| 공개 레포 macOS 실행기 | 표준 GitHub 호스팅 실행기는 공개 레포에서 **무료·무제한**. macOS 표준은 `macos-latest`·`macos-26`(arm64, 3 vCPU·7GB), `macos-15-intel`·`macos-26-intel`(4 vCPU·14GB). 공개 레포의 분 배수는 문서에 따로 없음 | GitHub Docs(요금·호스팅 실행기) |
| macOS 이미지 Xcode | `macos-26` 이미지: Xcode **26.6(기본)**, 26.5, 26.4.1, 26.3, 26.2, 26.1.1, 26.0.1. iOS 시뮬레이터 26.2·26.4·26.5 | actions/runner-images `macos-26-arm64` README |
| iOS 시뮬레이터 빌드 명령 | `npx expo run:ios`(`ios/`가 없으면 `expo prebuild` 먼저). 완전 재생성은 `npx expo prebuild --clean`. Release는 `--configuration Release`(서명 없음) | docs.expo.dev 로컬 앱 개발 |
| SDK 58의 **최소 Xcode** | **공식 문서에서 확인하지 못함**(환경 설정·SDK 58 변경 기록 모두 최소 버전 미기재, Xcode 27은 일부 기능에만 언급). SET-3b 시작 때 다시 확인 | 위 문서들 |
| macOS 빌드 소요 시간 | **공식 수치 없음.** SET-3b에서 실측하고 길면 `main` push·네이티브 의존성 변경 PR로 제한 | — |
| Actions 메이저(재확인) | `actions/checkout` **v7**(7.0.1), `actions/setup-node` **v7**(7.1.0), `astral-sh/setup-uv`는 메이저 태그(`v10`)가 없어 **`v10.3.3`으로 고정**(CI에서 `@v10`이 해석 실패해 확인). 참고: `actions/setup-python` v7, `actions/cache` v6, `dorny/paths-filter` v4(이번엔 안 씀) | 각 레포 releases API |

## 2. 만든 것

`mobile/package.json`, `mobile/package-lock.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `.github/workflows/ci.yml`, `.gitignore`(기존 파일에 8줄 추가). 파일 7개(잠금 제외 — 승인된 해석) · 변경 약 255줄(잠금·`.gitignore` 기존분 제외).

- **스모크 화면:** `GET {EXPO_PUBLIC_API_URL 또는 http://localhost:8000}/api/v1/ready`를 5초 제한으로 호출해 로딩 → "서버 상태: 준비됨"(확인 시각) 또는 "서버에 연결하지 못했어요 + 다시 시도"를 보인다.
- **`ci.yml`:** 트리거는 `main` 대상 `pull_request`와 `main` push. job 4개 — `변경 감지`(PR 변경 파일이 전부 `*.md`·`docs/`·`개발산출물/`이면 `code=false`, main push는 항상 true), `서버 시험`(`postgres:17` 서비스 컨테이너 5433, `uv sync --locked`, `uv run pytest -W error`), `앱 점검`(Node 24, `npm ci` → `tsc --noEmit` → `expo export --platform web`), `CI ok`(`if: always()`, `needs` 3개 중 failure·cancelled가 하나라도 있으면 실패, 건너뜀은 통과).
- **고정된 버전(`mobile/package-lock.json`):** expo 58.0.24, expo-router 58.0.31, react·react-dom 19.3.0, react-native 0.88.1, react-native-web 0.21.4, typescript 6.0.3, @types/react 19.3.0 외 `expo install`이 맞춘 부속(expo-linking·expo-constants·expo-status-bar·safe-area-context·screens·@expo/metro-runtime).
- 네이티브 폴더(`ios/`·`android/`)는 만들지 않고 `.gitignore`에 넣었다. 번들 ID는 임시값 `kr.localone.app`(스토어 제출 전 D가 정한다).

## 3. 명세와 다르게 한 것(이유)

| 명세 | 실제 | 이유 |
| --- | --- | --- |
| §5-1 iOS 빌드 점검 job을 SET-3에 포함 | **SET-3b로 분리** | 파일 상한 초과, 최소 Xcode·소요 시간 미확인(사용자 결정) |
| §1 `mobile/.nvmrc` | 만들지 않음, `engines` + CI `node-version: 24` | 상한 7파일 유지 |
| §3 앱 파일 6개 | 같음 | `expo-router`에 필요한 `scheme`·`expo-linking` 등 의존성만 추가 |

## 4. 검증 결과

| 명령/방법 | 결과 |
| --- | --- |
| `cd mobile && npm ci` | 성공(잠금과 일치) |
| `npx tsc --noEmit` | 종료 코드 0 |
| `npx expo export --platform web` | 성공(`dist/` 생성, 번들 1.1MB) |
| `npx expo-doctor` | 20/20 통과 |
| `cd server && uv sync --locked` | 성공 |
| `ci.yml` YAML 파싱 | job 4개 인식 |
| 변경 감지 정규식(로컬 모의) | `개발산출물/a.md`·`docs/x.txt` → 문서, `server/x.py` → 코드 |

## 5. 미검증·주의

- **CI 실제 실행은 PR을 올린 뒤에야 확인된다.** 이 문서 작성 시점에는 미실행이다(워크플로 문법·서비스 컨테이너 연결·`CI ok` 집계는 PR 결과로 확인하고 아래에 적는다).
- **스모크 화면을 서버와 붙여 실제로 띄워 보지 않았다.** 웹 출력에서 `localhost:8081`이 `localhost:8000`을 부르면 서버에 **CORS 설정이 없어** 브라우저가 막는다(서버 코드에 CORS 없음 확인). SET-3은 `server/`를 건드리지 않는 범위라 고치지 않았다 → 서버에 개발용 CORS 허용(로컬 출처만)을 넣는 작은 후속이 필요하다. 모바일 기기·에뮬레이터는 CORS 영향이 없고 Android 에뮬레이터는 `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`이 필요하다.
- `npm audit`(운영 의존성) 중간 심각도 3건이 나온다. 이번에는 `audit fix --force`를 하지 않았다(`expo` 하위 의존, 버전 호환 깨짐 위험). 내용 확인은 별도.
- **main 보호 ruleset은 켜지 않았다.** SET-3 PR의 `CI ok`가 `main`에서 한 번 통과한 뒤 명세 §5-1대로 적용한다.

## 6. 이어서 할 일

1. SET-3 PR 통과·머지 → `main`에서 `CI ok` 통과 확인 → ruleset 적용(Hunseokc) → 문서 PR 하나로 `CI ok` 통과·머지 확인.
2. **SET-3b: iOS 빌드 점검 job**(`ci.yml`에 추가, 파일 1개). 시작 때 SDK 58 최소 Xcode와 macOS 소요 시간을 확인한다.
3. 서버 개발용 CORS(웹 스모크 확인용), 번들 ID 확정.
