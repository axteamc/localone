# LIB-0-P1 도서관 조회·공공 데이터 기반 결과

2026-11-17 Windows / 사람 역할 D / AI 구현·자체 검수. PR [#111](https://github.com/axteamc/localone/pull/111), 리뷰 대기. 독립 검증 결과로 취급하지 않는다.

## 1. 기준과 작업 격리

- B2 [기준선](../기준선.md) 및 발행 core LIB-0 Pre-flight·C1~C7·P1~P5의 P1 범위. 계약 본문 기준 `492425d`, 열람 파일 Git blob `ce3dd881c83c6a21810e020c27483c5f17424196`.
- 새 worktree에 `.team_docs`가 없어 동일 발행 원본 `../team/contracts/core.md`를 직접 대조했다. 필수 로컬 규칙 두 파일은 사용자 승인으로 기존 폴더에서 읽기·복사만 했다.
- 시작 `origin/main` `71a9e6780907279dd8d63a63af3c5b0e5daf9242`, 전용 `../libproject-core-LIB-0-part1` / `feat/core-LIB-0-part1`.
- 구현 커밋 `4da20f7`, 최신 main `ad56767` 반영 merge `6a1506cdaf365547d5c3d3a39a1a8dc42ba79d24`. merge 전후 `server/` diff 0. 이후 main `dfa7f23`(#110)도 merge `52dd694`로 반영했다. 진행 파일 충돌은 최신 APP-0 기록과 LIB-0 기록을 모두 보존해 해결했다. 두 merge 전후 서버 diff 0을 확인했다.
- 원래 폴더 `docs/sync-artifacts-20261117`의 기존 tracked 3파일·untracked 2파일은 수정·stash·checkout하지 않았다. 이후 탐색·수정·실행은 전용 worktree 안에서 수행했다(허용된 규칙 복사와 필수 team 원본 열람 제외).

## 2. Pre-flight와 구현 대조

| 관문 | 현재 근거와 처리 |
| --- | --- |
| 격리·권한·호환 | 공개 #10·#11에 인증 의존성 없음. `server/app/common.py` 오류 형식 재사용. `0002_public_reference.py:13` 공공 테이블 5개·RLS, 테스트 `test_public_reference_rls_enabled`와 컬럼·키 검사 |
| 동시성·트랜잭션·외부 I/O | `provider_engine.py:94` 단일 upsert 상한 예약. `:321` 예약 커밋 뒤 외부 호출, `:329` 동기화 저장. 동시 5개/상한 2·열린 트랜잭션 감시 검증. 개인 데이터 쓰기·앱 경합은 이번 파트 N/A |
| 전제 실재성 | 기존 `run_db`·`ApiError`·`today_kst`·`Settings` 재사용. 새 서비스·라우터·정책·시드는 계약 허용 파일에만 추가. 이식 원본 `6944ce1`을 git object로 직접 열람 |
| 담당 파일 충돌 | 착수 시 열린 #93·#94·#95는 모바일/specs 영역. 서버 충돌 없음. 작업 중 머지된 #109·#94는 origin/main merge로 수용. 공유 폴더 작업과 격리 |
| 승인 게이트 | 사용자 LIB-0-P1 구현·검증·문서·커밋·PR 지시. 계약 경로·필드·새 라이브러리 변경 없음. 코드 커밋 14파일·Owner D. 06은 이미 선언된 #10·#11을 그대로 구현하므로 수정 없음 |

| 계약 | 코드·검증 |
| --- | --- |
| K2·K7, #10 | `libraries.py:122`, 주변 3/5km·시군구·이름 정확히 한 방식. 이름 검색 20곳·공백 제거·와일드카드 이스케이프·결정적 정렬. 반경 밖·좌표 NULL 제외 |
| K3~K5, #11 | `libraries.py:40,67,82,107,157`, 동네 이름·서울 날짜·휴관/운영시간과 원문 보존. 모르면 `is_closed=null`, `holiday_unchecked=true`, `hours_text=null` |
| K12 | 구현 전에 05 §11 정책 행 추가, `policy.py`에 단일 수치 정의. 마이그레이션의 고정 CHECK 경계 2000은 발행 C5 그대로 |
| C5 전수 | `0002_public_reference.py`의 5테이블만 발췌. description/pub_year, FK NO ACTION, PK·UNIQUE·부분 인덱스·CHECK·RLS 확인. M2·다른 담당 테이블 없음 |
| L-#1·#2·#7 | 422 필드명 detail·404 NOT_FOUND·503 DB_UNAVAILABLE. 422/404와 반복 조회의 공공 테이블 전체 스냅샷 불변 단언. 목록·상세 외부 호출 없음 |
| NFR-05 | `library_privacy.py:5,15`, Uvicorn 로그가 핸들러로 가기 전에 쿼리 전체 제거. 실제 서버 정상/422 요청에서 경로·상태는 남고 lat/lng·좌표 값은 없음 |

## 3. 실행 검증

DB는 이번 작업 전용 `localone-lib0-p1-db` (`postgres:17`, `127.0.0.1:55434`, `localone_test`)다. 다른 컨테이너·원격 DB를 재사용하지 않았다. 서버 명령에는 `APP_ENV=test`, `DATABASE_URL=postgresql+psycopg://localone:localone@127.0.0.1:55434/localone_test`를 명시했다(전용 로컬 시험용 자격 증명).

| 위치 | 실제 명령 | 결과 |
| --- | --- | --- |
| `server` | `python -m uv sync --locked` | exit 0, Python 3.12.7, 잠금 변경 없음 |
| `server` | `python -m uv run alembic upgrade head` | 성공, 0002 |
| `server` | `python -m uv run alembic downgrade -1` → `python -m uv run alembic upgrade head` | 성공 |
| `server` | `python -m uv run alembic downgrade base` → `python -m uv run alembic upgrade head` | 성공 |
| `server` | `python -m uv run pytest -W error tests/test_libraries.py -q` | 최초 76, 동기화·경계 보강 뒤 82 passed. C5 전수·빈 결과 4건 추가 후 전체에 포함 |
| `server` | `python -m uv run pytest -W error` | 최종 `148 passed in 5.01s` (LIB-0-P1 86 + 기존 62). 경고 무시·skip·단언 완화 없음 |
| `mobile` | `npm ci` | exit 0, 1,094 packages. 기존 잠금의 deprecated/audit 경고는 기록만 하고 의존성 변경하지 않음 |
| `mobile` | `npx tsc --noEmit` | exit 0 |
| `mobile` | `npx jest --runInBand` | 최초 45개, 최신 main #110 반영 후 7 suites / 48 tests passed |
| `mobile` | `npx expo export --platform web` | exit 0, 최신 main 반영 후 850 modules, Exported: dist |

서버 최종 검증 소스는 `4da20f7`과 동일하다. 최신 main #110 merge `52dd694` 후 모바일 tsc/Jest/export를 재검증했고 서버 diff 0을 확인했다. 테스트의 실제 HTTP+DB 검증과 별도로 Uvicorn 접근 로그까지 실행했다.

### 핵심 가드 변이

모두 한 번에 한 가드만 바꿔 `pytest -W error` 표적 검사가 exit 1로 실패하는지 확인하고 파일 바이트 원복을 검사했다. 변이 뒤 표적 전체 82개가 재통과했다. 마지막 추가 검사 4개까지 합친 전체 148개도 통과했다.

| 변경한 가드 | 실패 검사 | 실제 결과 |
| --- | --- | --- |
| `provider_engine.py:309` 반경 조건 제거 | `test_nearby_default_radius_is_3km_sorted_by_distance` | 1 failed |
| `libraries.py:131` 혼합 방식 거부 해제 | `test_list_validation_errors` | 3 failed / 12 passed |
| `provider_engine.py:294` LIKE 이스케이프 제거 | `test_search_by_name_escapes_wildcards` | 3 failed / 2 passed |
| `provider_engine.py:105` 상한 `<`를 `<=`로 변경 | `test_reserve_provider_call_is_atomic` | 1 failed (예약 수·저장 count 상한) |
| `library_privacy.py:10` 로그 쿼리 제거 해제 | `test_nfr05_access_log_never_keeps_coordinates` | 1 failed (좌표 노출) |

변이 실행 중 Windows 자식 출력 디코딩 오류 1회가 있었다. 소스는 finally에서 원복했고 `PYTHONUTF8=1`로 출력 인코딩을 지정해 나머지 검증을 완료했다. 이는 제품 실패를 통과로 바꾼 것이 아니다.

## 4. 자체 검수·제한

- 계약 대조·동시 예약·CHECK/FK/부분 UNIQUE·RLS·왕복·변이·문서 정합을 자체 점검했다. 인증/소유권 쓰기는 공개 조회 전용이라 N/A, 기존 인증 62개 회귀는 통과했다.
- K4의 정규식 앞에서 주소 괄호를 공백으로 바꾼다. 계약 P5가 요구하는 `(화동)`·`(사직동)`을 읽기 위한 정규화이며 응답 필드를 바꾸지 않는다. 휴관 파서는 모르는 수식/공휴일을 영업으로 단정하지 않는다.
- 422 필드명 응답을 `[lib-D]` 블록 안에서 등록했다. 공통 오류 형식을 유지하며 기존 422 handler 본문은 수정하지 않았다. SRV-0의 나머지 가드·테이블은 구현하지 않았다.
- 목록·상세는 DB 참조 데이터만 읽는다. 시드는 `python -m app.services.provider_engine seed`로 명시적으로 넣으며 시작 때 DB 연결/시드를 강제하지 않는다. 기존 제공자 행은 시드로 덮지 않는다. 실제 제공자 발급·응답 실측은 미검증이고 비밀값을 읽거나 게시하지 않았다.
- seed id는 DB identity가 정한다. C7의 101~103은 상대 기능 연결 전 가짜 값이고, 테스트 픽스처만 이 고정 ID를 쓴다.
- AC-LIB 중 서버 반경·지역 탐색만 이 파트에서 검증했다. 앱 선택 유지·AC-RACE·실기기·웹 상호작용·Android/iOS·운영 배포는 미검증이며 후속 기능의 인수 범위다.
- 도서 검색·추천·소장·구매 링크(P2/P3), M2, 계약·팀 문서 변경, 머지·배포·외부 알림은 수행하지 않았다.
- 코드 14파일/1,355줄은 도서관 탐색 한 동작에 필요한 스키마·엔진·라우터·검증을 묶은 것으로 계약 파트 표가 허용한 규모다.
- GitHub 연결 도구의 PR 쓰기는 403(integration 권한)이라 저장소 `team.ghuser=Hunseokc` 계정의 GitHub CLI로 #111을 만들었다. 전역 활성 계정은 바꾸지 않았다.

CI 결과와 최종 게시 상태는 PR의 최신 head를 기준으로 확인한다. 본 문서는 로컬 검증 증거이며 독립 리뷰·배포 증거가 아니다.

첫 게시 `6a1506c`의 CI 실행 `43999922977`은 success였다. main #110 반영 `08ac02d24d9ee31d04431a3419256ceb7f79c457`의 [CI 44000415084](https://github.com/axteamc/localone/actions/runs/44000415084)도 서버 시험·앱 점검·CI ok 모두 success(2026-11-17 11:06 KST), iOS job은 PR 정책으로 skipped다. 이후 이 CI 기록·줄 번호 보정만 담은 docs 커밋은 제품 코드 변경이 없으며 최신 PR checks와 구별한다.
