# 결과: SET-2 서버 뼈대

- **일시:** 2026-11-12 (win) · **수행:** Claude Code (D 요청) · **브랜치:** `step/SET-2`(main `e3121a9`에서 분기). 커밋·push·PR은 아직 하지 않았다
- **명세:** [SET-1 구현명세](../명세/SET-1_구현명세.md) §3·§4·§5. CI·`mobile/`·`.gitignore`는 SET-3이라 만들지 않았다

## 1. 시작 전 확인한 버전(공식 출처, 2026-11-12)

| 항목 | 확인 결과 | 출처 |
| --- | --- | --- |
| FastAPI 최신 | **0.162.5**(2026-11-11). 0.162.0의 Breaking Change는 폼의 생략된 bool 필드 처리라 이 Step과 무관 | FastAPI 릴리스 노트, PyPI |
| GitHub Actions 최신 메이저 | `actions/checkout` **v7**(7.0.1), `actions/setup-node` **v7**(7.1.0), `actions/setup-python` **v7**(7.1.0), `astral-sh/setup-uv` **v10**(10.3.3), `actions/cache` v6, `dorny/paths-filter` v4. SET-3에서 메이저만 적는다 | 각 레포 GitHub releases API |
| Supabase Postgres 메이저 | **미확정.** 공식 업그레이드 문서에 15와 17이 나오고 17이 15의 업그레이드 대상이다. "신규 프로젝트 기본값"은 문서에 없다. 프로젝트 생성 때 확인하고, 그때까지 시험 DB는 17 유지 | Supabase 문서(업그레이드 가이드) |
| Expo SDK 58·Node 요구 | SET-3 시작 때 확인 |  |

## 2. 만든 것

`server/pyproject.toml`, `server/uv.lock`, `server/app/{main,settings,common}.py`, `server/tests/test_ready.py`, `docker-compose.yml`, `.env.example` (소스·설정 약 270줄, 잠금 제외).

## 3. 고정된 버전(`server/uv.lock`)

Python 3.12(`requires-python >=3.12,<3.13`), fastapi 0.162.5, starlette 1.10.0, uvicorn 0.54.0, sqlalchemy 2.1.8, psycopg 3.3.8, pydantic-settings 2.16.2, tzdata 2026.6, pytest 9.2.0(개발), httpx2 2.16.0(개발). `uv` 0.13.7(`pip install --user uv`로 설치, 이 PC에 없었음). 시험 DB 이미지는 `postgres:17`.

## 4. 명세와 다르게 한 것(이유)

| 명세 | 실제 | 이유 |
| --- | --- | --- |
| SQLAlchemy asyncio + psycopg 비동기 | **동기 엔진을 `asyncio.to_thread`로 호출**, 전체 제한 2초는 `asyncio.wait_for` | Windows에서 uvicorn 기본 루프(Proactor)에선 psycopg 비동기가 `InterfaceError`로 죽는다. 이벤트 루프 정책 변경은 uvicorn이 무시했다. 동기+스레드는 OS와 무관하게 동작. 연결 시도는 `connect_timeout=2`로 끝나 스레드가 남지 않는다 |
| 의존성에 `pytest-asyncio`, `httpx` | 둘 다 뺌, `httpx2` 추가 | 시험을 동기 `TestClient`로 써서 pytest-asyncio가 불필요. Starlette 1.10이 `httpx` 사용을 사용 중단 경고하고 `httpx2`를 요구 |
| 시험 ② "닫힌 포트" | **연결을 받자마자 끊는 가짜 DB 소켓** | Windows는 닫힌 포트 거부가 2초 넘게 걸려 `DB_TIMEOUT`이 나온다(실측 2.0~4.0초). 가짜 소켓은 OS 무관하게 즉시 실패 |
| `app.main:app` | 모듈 `__getattr__`로 처음 접근할 때 생성 | import만으로는 환경 변수를 읽지 않게 해 시험이 `create_app(settings)`를 직접 쓰게 함. uvicorn 명령은 명세 그대로 |
| 오류 코드 | 404·405 외 HTTP 오류는 `HTTP_ERROR` | 명세에 없는 상태의 대비 |

`docs_url`·`redoc_url`·`openapi_url`은 끈 상태다(스모크 단계에선 불필요, 필요해지면 계약서에서 켠다).

## 5. 검증 결과

| 명령/방법 | 결과 |
| --- | --- |
| `docker compose up -d --wait db` | healthy |
| `cd server && uv run pytest -W error` | **4 passed**(경고 0): ① DB 켬 → 200, `status/db/checked_at`(`+09:00`) ② 끊는 DB → 503 `DB_UNAVAILABLE` ③ 없는 경로 → 404 `NOT_FOUND`, 키 3개 ④ `APP_ENV=test`+원격 호스트 → `ValidationError` |
| 실서버 `uvicorn app.main:app` + curl | `/api/v1/ready` 200 `{"status":"ok","db":"ok","checked_at":"…+09:00"}`, 없는 경로 404, DELETE 405 `METHOD_NOT_ALLOWED` |
| 수동: 받고 응답 안 하는 DB | 503 `DB_TIMEOUT` |
| 수동: 환경 변수 없이 시작 / `APP_ENV=test`+원격 DB | 둘 다 종료 코드 **1** |
| 수동: `today_kst` | UTC 2026-11-12 16:00 → 2026-11-13, 14:59 → 2026-11-12 (경계 정상) |

시험에 넣지 않은 것: 500 `INTERNAL_ERROR`와 422(처리기는 있으나 시험 4개 상한이라 수동 확인도 안 함 — **미검증**), `today_kst` 자동 시험(수동만).

## 6. 이어서 할 일

SET-3(앱·CI). 시작 때 Expo SDK 58·Node 요구, macOS 실행기 한도를 확인한다. CI에서 `uv`는 `astral-sh/setup-uv@v10`, 서버 시험 DB는 서비스 컨테이너 `postgres:17`을 쓴다.
