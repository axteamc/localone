# 결과: SET-5 번들 ID 확정

- **일시:** 2026-11-12 (win) · **수행:** Claude Code (D 요청) · **브랜치:** `step/SET-5-bundle-id`(main `88fa944`에서 분기)
- **범위:** 문서만. `mobile/app.json`은 바꾸지 않았다(값이 이미 `kr.localone.app`).

## 1. 결정 (2026-11-12, D)

| 항목 | 값 | 위치 |
| --- | --- | --- |
| iOS 번들 ID | `kr.localone.app` | `mobile/app.json` `expo.ios.bundleIdentifier` |
| Android 패키지 | `kr.localone.app` | `mobile/app.json` `expo.android.package` |

- 임시값을 그대로 최종으로 확정했다. D가 선택지(그대로 확정 / 다른 값 / 보류) 중 "그대로 확정"을 골랐다.
- **도메인 소유는 이 세션에서 확인하지 않았다.** `kr.localone.app`은 역도메인 표기라 `localone.kr`에 해당하지만, 번들 ID는 도메인 소유를 요구하지 않는다(아래 §2). 도메인을 실제로 쓸지·살지는 D의 몫이다.

## 2. 공식 문서 확인 (2026-11-12)

출처: [Expo app.json 설정 레퍼런스](https://docs.expo.dev/versions/latest/config/app/)

| 항목 | 문서에 있는 내용 |
| --- | --- |
| `ios.bundleIdentifier` | 직접 정하며 App Store에서 유일해야 한다. 역도메인 형식. 허용 문자 규칙은 이 페이지에 없다 |
| `android.package` | 직접 정하며 Play Store에서 유일해야 한다. 유효한 Android Application ID: 영문·숫자·밑줄만, 마침표로 구분, **각 구성 요소는 소문자로 시작** |
| `kr.localone.app` 검사 | 세 구성 요소(`kr`·`localone`·`app`) 모두 소문자로 시작하고 영문만 써서 두 규칙을 만족 |
| 문서에 **없는** 것 | 게시 뒤 값을 바꿀 때의 영향, prebuild·EAS가 이 값으로 네이티브 프로젝트를 만드는 방식(Expo prebuild·EAS Build 문서를 별도 확인해야 함 — 이번에 안 읽음) |

- 문서에 "도메인을 소유해야 한다"는 요구는 없다. 임시값인 이유는 도메인을 확정하지 않았기 때문이다.
- **스토어에 올리기 전에는 값을 바꿔도 부담이 적다.** 올린 뒤의 변경 영향은 위처럼 문서로 확인하지 않았다. 업계 상식(스토어 앱 식별자라 올린 뒤에는 사실상 바꿀 수 없음)은 추정이며 출시 전(RELEASE) 확인 항목이다.

## 3. 영향 범위

- `ios/`·`android/`는 커밋하지 않고 `.gitignore`라 CI의 `expo prebuild`가 매번 이 값으로 만든다. 값이 같아 CI에 영향 없음.
- 변경된 파일은 문서 3개(이 결과·진행 파일·인수인계 메모)뿐이다.

## 4. 미검증·주의

- 도메인 `localone.kr` 소유·등록 여부: 미확인(D).
- App Store Connect·Play Console에서 해당 ID가 이미 다른 앱에 쓰이는지: 조회하지 않음(계정 필요, RELEASE 때).
- 브라우저 웹 스모크 화면(`expo start --web` → `/api/v1/ready`) 확인은 D가 직접 한다([SET-4 결과 §5](SET-4_서버개발용CORS.md)).

## 5. 머지·CI 확인 (2026-11-12)

- SET-4 PR #13 머지 `88fa944`의 main push 실행(run 43154458284): 전체 success(iOS 빌드 점검 포함).
- PR #14: `CI ok` 통과(문서만 바뀌어 서버·앱·iOS job은 건너뜀, run 43159571317).

## 6. 이어서 할 일

1. 브라우저 웹 스모크 화면 확인(D).
2. 스토어 제출 전(RELEASE): 도메인·스토어 ID 중복 확인과 변경 영향(prebuild·EAS 문서) 확인.
