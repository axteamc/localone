# 결과: SET-4 서버 개발용 CORS

- **일시:** 2026-11-12 (win) · **수행:** Claude Code (D 요청) · **브랜치:** `step/SET-4-cors`(main `ba91804`에서 분기)
- **배경:** [SET-3 결과](SET-3_앱뼈대_CI.md)의 웹 스모크가 브라우저에서 서버 호출을 CORS로 막혔다. SET-3b 결과 §7의 후속 ①.
- **범위:** `server/`의 CORS 설정과 시험. `mobile/`·`ci.yml`은 건드리지 않았다.

## 1. 시작 전 확인(공식 출처, 2026-11-12)

| 항목 | 확인 결과 | 출처 |
| --- | --- | --- |
| `CORSMiddleware` 인자 | `allow_origins`(기본 `[]`), `allow_origin_regex`, `allow_methods`(기본 `['GET']`), `allow_headers`(기본 `[]`), `allow_credentials`(기본 `False`). `allow_credentials=True`이면 origins·methods·headers에 `*`를 쓸 수 없다. `Accept`·`Accept-Language`·`Content-Language`·`Content-Type`은 단순 요청에서 항상 허용 | [fastapi.tiangolo.com/tutorial/cors](https://fastapi.tiangolo.com/tutorial/cors/) |
| 로컬 출처만 허용하는 방법 | `allow_origin_regex`로 `localhost`·`127.0.0.1`의 모든 포트를 허용. Starlette은 정규식을 **전체 일치**로 검사해 `http://localhost.evil.com`이 통과하지 못한다(시험으로도 확인, §3) | 같은 문서 |
| APP_ENV별 분기 | 문서에 환경 분기 방식은 없다. 설정값(`app_env`)으로 미들웨어를 붙이거나 말지를 앱 코드에서 정한다(우리 규칙) | — |
| Expo 웹 개발 서버 출처 | `npx expo start`는 `http://localhost:8081`에서 서버를 시작하고 `--port` 기본값은 8081. 다만 `--web` 전용 주소·포트는 문서에 따로 나오지 않는다(포트가 겹치면 Expo가 다른 포트를 제안할 수 있어) → 포트를 고정하지 않고 로컬 출처 전체를 허용 | [docs.expo.dev/more/expo-cli](https://docs.expo.dev/more/expo-cli/) |

## 2. 만든 것

| 파일 | 내용 |
| --- | --- |
| `server/app/settings.py` | 상수 `LOCAL_ORIGIN_REGEX`(`https?://(localhost\|127\.0\.0\.1)(:\d+)?`)·`CORS_ENVS={"local","test"}` |
| `server/app/main.py` | `app_env`가 `local`·`test`일 때만 `CORSMiddleware` 추가: 출처=로컬 정규식, 메서드=GET·POST·PUT·PATCH·DELETE, 헤더=Authorization·Content-Type, 자격 증명(쿠키) 허용 안 함 |
| `server/tests/test_cors.py` | 신규. 14개(아래) |

- **production은 CORS를 켜지 않는다.** 모바일 앱(네이티브)은 CORS 대상이 아니고, 운영 웹 출처는 정해지지 않았다. 운영에 웹을 올릴 때 허용 출처 목록을 설정값으로 만든다(후속).
- 자격 증명을 끈 이유: 인증은 `Authorization` 헤더(JWT)로 하고 쿠키를 쓰지 않는다(D2). 쿠키를 쓰게 되면 그때 `allow_credentials`와 출처 목록을 함께 바꾼다.
- 파일 3개(수정 2·신규 1), 변경 약 90줄(상한 7개·600줄 안).

## 3. 검증 결과

| 확인 | 결과 |
| --- | --- |
| `uv run pytest -q`(win, 시험 DB 컨테이너 켠 상태) | **18 passed**(기존 4 + 신규 14) |
| 허용(local·test 두 환경 × 4개 출처) | `http://localhost:8081`·`http://127.0.0.1:8081`·`http://localhost`·`https://localhost:3000` → preflight 200, `Access-Control-Allow-Origin` = 요청 출처, 쿠키 자격 증명 헤더 없음, 404 응답에도 헤더가 붙는다 |
| 거부(5개) | `https://example.com`·`http://localhost.evil.com`·`http://evil.com:8081`·`http://localhost:8081.evil.com`·`null` → preflight 400, 허용 헤더 없음 |
| production | `http://localhost:8081`이라도 허용 헤더 없음 |
| 실서버 `uvicorn`(APP_ENV=local, 포트 8765, curl) | preflight 200 + `allow-origin: http://localhost:8081`, `allow-headers`에 Authorization 포함. 일반 요청에도 헤더. `http://localhost.evil.com`은 200이지만 허용 헤더 없음(브라우저가 막음) |
| main push 실행(`ba91804`, run 43151925728) | 전체 success(§4) |

## 4. SET-3b 마무리 확인

- PR #12는 이 세션 시작 전에 이미 머지됨(`ba91804`, 2026-11-12 13:00 KST, PR의 `CI ok` 통과 확인).
- main push 실행 43151925728: 변경 감지·서버 시험(21초)·앱 점검(36초) success. iOS 빌드 점검 success(§4-1).

### 4-1. main push의 iOS 빌드 점검

run 43151925728 전체 success: 변경 감지·서버 시험·앱 점검·**iOS 빌드 점검 success(10분 48초)**·`CI ok` success(iOS를 기다린 뒤 집계). 실제 `main` push 경로에서 iOS job이 통과했다.

## 5. 미검증·주의

- 브라우저에서 실제 웹 스모크 화면(`expo start --web` → `/api/v1/ready` 호출)은 이 세션에서 열어 보지 않았다. 서버 쪽 CORS 응답은 curl·시험으로 확인했고, 화면 확인은 D의 몫이다(서버 `APP_ENV=local`로 띄우고 `mobile/`에서 `npx expo start --web`).
- 실기기·에뮬레이터(Android `10.0.2.2`)는 CORS 대상이 아니라 이 변경과 무관하다.
- 운영 웹 출처 허용은 아직 없다(웹을 운영에 올릴 때 별도 Step).

## 6. 이어서 할 일

1. PR 리뷰·머지(D).
2. 번들 ID 확정(`kr.localone.app`은 임시) — 이번 세션에서는 하지 않았다.
