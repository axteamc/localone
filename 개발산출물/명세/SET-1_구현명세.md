# SET-1 구현명세 — 실행 뼈대(INIT)

> 상태: **승인됨(2026-11-11, 사용자) — SET-2 구현 시작은 보류.** 이 문서는 SET-2(서버 뼈대)·SET-3(앱 뼈대·CI)의 입력이다. 시작 승인은 별도이며(§7 결과), 시작 때 §1의 확인 못 한 항목부터 확인한다.
> 근거: [진행_프로젝트_설정.md](../진행_프로젝트_설정.md) §2·§4, `../team/PROJECT.md` §2·§3, [계획 §2·§3](../../계획/상용_서비스_계획.md). 일부 사실은 2026-11-11 웹 검색으로만 확인했으며 §1에 구분했다.

## 0. 한눈에

- 만드는 것: **"서버 준비 상태"를 서버와 앱(웹 포함)에서 확인하는 하나의 개발 스모크 여정.** 팀원 기능이 그 위에 올라갈 뼈대(서버·격리 DB·앱·CI)만 만든다.
- 안 만드는 것: 로그인, 제품 DB 테이블, 도서관·게시물 기능, 알림, 지도, 네이티브 빌드(EAS)·iOS, 배포, Supabase 프로젝트 생성.
- Step: SET-2 서버 뼈대(8파일), SET-3 앱 뼈대·CI(8파일). INIT은 SET-0·SET-1 포함 4 Step(상한 안, §6).
- 폴더: 코드 레포 루트에 `server/`(FastAPI), `mobile/`(Expo), `docker-compose.yml`, `.github/workflows/`. 팀원 명세서는 기존대로 `specs/<기능>/`.

## 1. 확인한 사실과 버전 정책

| 항목 | 확인한 것 | 출처·확인 정도 |
| --- | --- | --- |
| Expo SDK | 최신은 SDK 58(React Native 0.88). SDK 56·57은 React 19.2 | 주간 소식·블로그(2026-07~10). **공식 SDK 58 문서에서 재확인 필요** |
| Node 요구 | SDK 58 도구가 Node 22.13+ / 24.3+ / 26을 요구한다고 보도됨 | 블로그 한 곳, **공식 확인 전**. 이 PC는 Node 26.8.1 |
| FastAPI | 공식 릴리스 노트에 0.141.1(2026-07-29)까지 확인. 그 뒤 최신은 미확인 | 공식 릴리스 노트(검색 결과) |
| Python | 이 PC는 3.12.7, `uv`는 없음, Docker 있음 | 이 PC에서 직접 확인(2026-11-11) |
| Postgres 메이저 | Supabase 프로젝트의 메이저는 **미확인** | 프로젝트 생성 후 확인 |

**버전 정책(결정):** 이 명세는 **범위와 확인 방법**을 정하고, 정확한 버전은 SET-2·SET-3 시작 때 공식 문서·레지스트리에서 확인해 **잠금 파일로 고정**한 뒤 결과 문서에 기록한다. "최신"이라는 이유로 올리지 않는다. 확인 못 한 요구(위 Node·Expo)는 확인될 때까지 구현을 시작하지 않는다.

- Python: **3.12** (이 PC·팀원 PC 공통 기준)
- Node: **24 LTS 계열**(`mobile/.nvmrc`). Expo SDK의 요구 범위 안에 들어가는지 SET-3 시작 때 확인한다
- Postgres(격리 DB): **17로 가정**하고 Supabase 프로젝트의 실제 메이저를 확인하면 맞춘다
- 도구: `uv`(서버 의존성·잠금), `npm`(앱, `package-lock.json`), Alembic은 **첫 제품 테이블이 필요한 Step(AUTH-1 이후)에서** 추가한다(SET-2에는 넣지 않음 — 빈 마이그레이션을 만들지 않는다)

## 2. Pre-flight

| 점검 | 결과 |
| --- | --- |
| 사용자 데이터 격리 | 해당 없음(사용자 데이터·인증 없음). 이후 기능은 계약서에서 정한다 |
| 오류 응답 버전 경계 | 모든 오류는 `PROJECT.md` §3 5의 `{"error":{"code","message","detail"}}` 형식. 경로 접두사 `/api/v1` |
| 취소·외부 I/O·트랜잭션 | 외부 I/O 없음. DB 확인은 `SELECT 1` 한 번이며 제한 시간 2초, 클라이언트가 끊으면 취소한다 |
| 참조 파일 실재 | `server/`, `mobile/`, `docker-compose.yml`, `.github/` 모두 **현재 없음**(이 명세가 만드는 목록) |
| 활성 PR·충돌 | PR 없음. 원격 `main`과 로컬이 13커밋 차이(문서만) — 구현 전 푸시·동기화 방식을 사용자에게 확인 |
| 신규 의존성 | 서버: fastapi, uvicorn, sqlalchemy(asyncio), psycopg(3), pydantic-settings, tzdata(Windows에서 `Asia/Seoul` 사용에 필요), pytest, pytest-asyncio, httpx. 앱: expo, react, react-native, react-native-web, react-dom, @expo/metro-runtime, expo-router, typescript, @types/react. 정확한 버전은 `uv add`·`npx expo install`이 정한 값을 잠금 파일에 고정 |

## 3. 파일 전수 표 (SET-2, SET-3)

### SET-2 서버 뼈대

| # | 경로 | 역할 | 핵심 |
| --- | --- | --- | --- |
| 1 | `server/pyproject.toml` | 프로젝트·의존성·pytest 설정 | |
| 2 | `server/uv.lock` | 잠금(생성물) | |
| 3 | `server/app/main.py` | 앱 만들기, `/api/v1/ready`, 오류 처리기(404·422·500) | ✔ |
| 4 | `server/app/settings.py` | 환경 변수 읽기·검증(DB 주소, 환경 이름), 테스트에서 외부 DB 주소 거부 | ✔ |
| 5 | `server/app/common.py` | 오류 응답 만들기, 서울 오늘 날짜(`Asia/Seoul`) — 모든 기능이 쓰는 공통 함수 | ✔ |
| 6 | `server/tests/test_ready.py` | 준비 상태·오류 형식·설정 검증 시험 | ✔ |
| 7 | `docker-compose.yml` | 격리 시험 DB(Postgres) 하나, 포트 5433 | |
| 8 | `.env.example` | 비밀 없는 예시 값 | |

### SET-3 앱 뼈대·CI

| # | 경로 | 역할 | 핵심 |
| --- | --- | --- | --- |
| 1 | `mobile/package.json` | 앱·웹 출력 의존성, 실행·점검 명령 | |
| 2 | `mobile/package-lock.json` | 잠금(생성물) | |
| 3 | `mobile/app.json` | Expo 설정(`ios/`·`android/`는 만들지 않음) | |
| 4 | `mobile/tsconfig.json` | TypeScript 엄격 설정 | |
| 5 | `mobile/app/_layout.tsx` | 앱 최상위 틀 | ✔ |
| 6 | `mobile/app/index.tsx` | 스모크 화면: 서버 준비 상태 표시, 로딩·실패 상태 | ✔ |
| 7 | `.github/workflows/ci.yml` | 서버(시험 DB 포함)와 앱 점검, 문서만 바뀐 PR은 점검 건너뛰기, 마지막에 `CI ok` 집계 job(§5-1) | ✔ |
| 8 | `.gitignore` | `ios/`·`android/`·`.env`·`node_modules`·`.venv` 제외 | |

## 4. 최소 사용자 여정과 계약

**여정(스모크):** 개발자가 시험 DB와 서버를 켠다 → 앱(웹 출력)을 연다 → "서버 상태: 준비됨"이 보인다. 서버가 꺼져 있으면 "서버에 연결하지 못했어요 + 다시 시도"가 보인다.

**`GET /api/v1/ready`** — 요청 본문·쿼리 없음, 인증 없음.

| 조건 | HTTP | 본문 |
| --- | --- | --- |
| DB가 2초 안에 응답 | 200 | `{"status":"ok","db":"ok","checked_at":"<서울 시각 ISO 8601>"}` (세 필드 모두 필수, `status`·`db`는 문자열 `"ok"`) |
| DB 연결 실패 | 503 | `{"error":{"code":"DB_UNAVAILABLE","message":"데이터베이스에 연결하지 못했어요.","detail":""}}` |
| DB가 2초 안에 응답 없음 | 503 | `{"error":{"code":"DB_TIMEOUT","message":"데이터베이스 응답이 늦어요.","detail":""}}` |
| 없는 경로 | 404 | `{"error":{"code":"NOT_FOUND","message":"찾을 수 없어요.","detail":""}}` |
| 허용되지 않는 메서드 | 405 | `{"error":{"code":"METHOD_NOT_ALLOWED",...}}` |
| 요청 형식 오류 | 422 | `{"error":{"code":"VALIDATION_ERROR",...}}` |
| 처리 못 한 예외 | 500 | `{"error":{"code":"INTERNAL_ERROR","message":"문제가 생겼어요.","detail":""}}` (예외 내용은 `detail`에 넣지 않고 서버 로그에만) |

- DB 필수: 서버는 DB 없이도 **시작**하고, `/ready`만 503을 낸다(시작 때 DB 연결을 시도하지 않음). 필수 환경 변수가 없으면 서버는 시작하지 않고 종료 코드 1로 끝난다.
- `settings.py`: 환경 이름이 `test`일 때 DB 주소의 호스트가 `localhost`·`127.0.0.1`이 아니면 시작을 거부한다(원격·운영 DB 보호, `PROJECT.md` §3 8).
- `common.py`: `today_kst()`는 서버 시계 기준 `Asia/Seoul` 날짜를 돌려주고, 시험에서 시각을 고정할 수 있어야 한다(`PROJECT.md` §3 6). 오류 응답 함수는 위 형식 하나만 만든다.

## 5. 환경과 검증

`.env.example`(비밀 없음):

```
APP_ENV=local
DATABASE_URL=postgresql+psycopg://localone:localone@localhost:5433/localone_test
```

| 대상 | 명령 | 기대 결과 |
| --- | --- | --- |
| 시험 DB | `docker compose up -d db` | `db` 컨테이너가 healthy |
| 서버 | `cd server && uv sync && uv run pytest` | 시험 4개 통과: ① DB 켬 → 200과 세 필드 ② DB 주소를 닫힌 포트로 → 503 `DB_UNAVAILABLE` ③ 없는 경로 → 404 오류 형식 ④ `APP_ENV=test`에 원격 호스트 → 시작 거부 |
| 서버 실행 | `cd server && uv run uvicorn app.main:app --port 8000` | `curl localhost:8000/api/v1/ready`가 200 |
| 앱 | `cd mobile && npm ci && npx tsc --noEmit && npx expo export --platform web` | 세 명령 모두 종료 코드 0 |
| CI | PR마다 서버 시험과 앱 점검 실행 | 둘 다 통과해야 머지(액션 버전은 메이저까지만 적고 SET-3 시작 때 확인) |

### 5-1. CI와 main 보호 규칙 (2026-11-12 보강, 사용자 확인)

- **`CI ok` 집계 job**: `ci.yml` 마지막에 `name: CI ok` job을 둔다. `needs`에 서버·앱·변경 감지 job을 모두 걸고 `if: always()`로 돌려, 하나라도 `failure`·`cancelled`면 실패, 건너뛴 job만 있으면 통과시킨다. ruleset의 필수 체크는 이 이름 **하나뿐**이다(job 이름이 바뀌어도 규칙은 안 바뀐다).
- **문서 PR 건너뛰기**: 워크플로 `paths-ignore`는 필수 체크를 '대기'로 남겨 머지를 막으므로 쓰지 않는다. `changes` job이 PR 변경 파일을 보고, 전부 `*.md`·`docs/`·`개발산출물/`이면 서버·앱 job을 건너뛴다(`CI ok`는 통과). `specs/`는 문서로 보지 않는다(시안 코드가 있을 수 있음). `main`에 push된 실행은 항상 전부 돈다.
- **트리거**: `pull_request`와 `push`는 `main`만 대상으로 한다. `stage*` 같은 통합 브랜치는 쓰지 않는다(기능 단위 PR이 `main`으로 들어간다).
- **ruleset**: [자료/ruleset_main.json](../자료/ruleset_main.json) — 기본 브랜치 삭제·force push 금지, PR 필수(승인 0명, 리뷰 대화 해결 필수, merge·squash만), 필수 체크 `CI ok`. 리포지토리 Admin 역할만 PR을 통해 우회한다.
- **적용 시점**: SET-3 PR에서 `CI ok`가 한 번 통과하고 `main`에 들어간 **뒤** Hunseokc 계정으로 `gh api repos/axteamc/localone/rulesets --input 개발산출물/자료/ruleset_main.json`을 실행한다. 그전에 켜면 `CI ok`가 없어 모든 머지가 막힌다. 적용 뒤 문서 PR 하나로 `CI ok` 통과와 머지를 확인하고 결과 문서에 적는다.

- 화면 자동 테스트(Q-27) 결정: SET-3에서는 만들지 않는다. **`jest-expo` + React Native Testing Library를 첫 기능 화면 Step(VISIT-1·LIB-1) 계약서에서 추가**한다(일반 지식 기준, 그때 Expo 문서로 확인). 스모크 화면은 `expo export` 성공과 수동 확인으로 본다.
- 잡을 버그: DB 주소 잘못, 시간 초과 처리 누락, 오류 형식 불일치, 서울 날짜 계산(Windows `tzdata` 누락), 시험이 원격 DB에 붙는 사고.
- 비밀값: 키·비밀번호는 코드·Git에 넣지 않는다(`.env`는 `.gitignore`). 이 단계에는 외부 서비스 키가 필요 없다.

## 6. 규모와 Step 조정

| Step | 파일 수 | 핵심 파일 | 예상 변경 줄 수(잠금 제외) | 판정 |
| --- | --- | --- | --- | --- |
| SET-2 | 8(잠금 포함) / 7(제외) | 4 | 약 330 | 한도(파일 ≤7, 핵심 ≤5, ≤600~700줄) 안. 잠금 파일은 생성물이라 7개 계산에서 제외하는 해석을 승인받는다(§7-3) |
| SET-3 | 8(잠금 포함) / 7(제외) | 3 | 약 220 | 같음 |

- 계획 §2의 INIT은 "3 Step"이라 적혀 있다. 이 명세는 **4 Step**(SET-0 규칙, SET-1 명세, SET-2 서버, SET-3 앱·CI)으로 나눈다. 상한 4 안이지만 계획 변경이므로 승인 시 계획을 같이 고친다.
- 제품 DB 스키마·로그인은 이 Step에 끼워 넣지 않는다. 팀원이 `ready`를 보고 "뼈대가 돈다"를 확인한 뒤 각자 계약서로 들어간다.

## 7. 승인받을 항목 (비어 있으면 구현을 인계하지 않는다)

1. 폴더 구조: `server/`·`mobile/`·루트 `docker-compose.yml`
2. INIT 4 Step으로 조정(SET-2 서버, SET-3 앱·CI)하고 계획 §2를 고치는 것
3. 잠금 파일(`uv.lock`, `package-lock.json`)을 7파일 계산에서 제외하는 해석
4. 버전 정책(§1): 범위만 정하고 정확한 번호는 구현 시작 때 확인해 잠금 파일에 고정. Node 24·Python 3.12·Postgres 17(가정)
5. Q-28: `uv` 채택, Alembic은 첫 제품 테이블 Step에서 추가. Q-27: 화면 시험은 첫 기능 화면 Step에서 jest-expo 추가
6. 원격 `main`과 로컬 13커밋 차이를 어떻게 처리할지(푸시 여부)
7. **실행 승인**: 위가 확정되면 SET-2 구현을 시작해도 되는지(별도 승인)

**승인 결과(2026-11-11, 사용자):** 1~3(폴더 구조·INIT 4 Step·잠금 파일 제외) 승인, 4(버전 정책: Python 3.12·Node 24 LTS 계열·Postgres 17 가정) 승인, 5(Q-28 uv·Alembic은 첫 제품 테이블 Step, Q-27 jest-expo는 첫 기능 화면 Step) 승인. 6(원격 처리): 올림(team `3e6a4c3`, localone `483c587`). 7(실행 승인): **보류** — 명세만 확정하고 SET-2는 사용자가 시작을 말할 때 시작한다.

확인되지 않은 것: Expo SDK 58의 정확한 Node 요구, FastAPI 최신 버전, Supabase Postgres 메이저, GitHub Actions 액션 버전. 모두 구현 시작 때 확인하고 결과 문서에 적는다.
