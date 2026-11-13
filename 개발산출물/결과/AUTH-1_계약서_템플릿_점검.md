# AUTH-1 계약서 — 템플릿을 처음 써 보며 막힌 칸 (T1~T12)

> 2026-11-13, team `contracts/auth.md` AUTH-1 절의 §8을 그대로 옮긴 것이다([정리안](../명세/AUTH-1_계약_분리_정리안.md) "가" 4번, [C-57](../스펙_변경_이력.md)). D용 기록이고 구현 Claude는 읽지 않아도 된다.
> 표 안의 §번호는 옮기기 전 계약서·템플릿의 옛 번호다. 계약서의 새 번호: §0→C1, §3.1→C2, §3.2→C3, §3.3→C4, §3.4→C5, §4→C6, §6→C7 / §1→P1, §2→P2, §3.5→P3, §5→P4, §7→P5.
> 최신 반영 상태(C-59): T6·T7은 `656d1a7`, T1·T2·T3·T5·T9·T10·T12와 C/P 구조 분리는 `94e7363`에 반영했다. 표는 처음 막혔을 때의 원문 기록이고 현재 상태는 아래 C-59 절이다.

| # | 템플릿 위치 | 막힌 것 | 이번에 한 것 | 제안 |
| :--- | :--- | :--- | :--- | :--- |
| T1 | 머리 "기준 명세서 `specs/<기능>/명세서.md` (SHA)" | D 담당 Step(AUTH·RELEASE·조회 엔진)은 주니어 명세서가 없다 | 02·모호점 기록과 커밋을 적고 §0 "결정" 표를 새로 둠 | 템플릿에 "명세서 없는 D Step이면 §0 결정 표로 대신" 한 줄 |
| T2 | 파일 구조 | `README.md`는 "세부(Step)별 절"이라는데 템플릿은 한 Step짜리 문서 모양(`##` 절)이다 | `## AUTH-1` 아래로 한 단계씩 내려 씀 | 템플릿 맨 위에 "Step마다 `## <STEP>` 절, 그 안에 §0~§7" 구조를 보여 주기 |
| T3 | 파트 머리말 4번 "계약서 커밋" | 계약서 자신이 들어간 커밋은 쓰는 시점에 알 수 없다 | `<sha>`로 두고 "push한 커밋"이라고 적음 | "push 뒤 D가 채운다, 비어 있으면 구현 시작 안 함"을 칸 설명에 넣기. 또는 이 칸을 기준선 §10에 맡기기 |
| T4 | 파트 머리말 3번 "기준선 버전" | B0가 아직 선언 전이라 이 계약서가 들어갈 판이 정해지지 않았다 | `B1`로 적고 머리에 "B0 선언 뒤 push" 조건 | 선언 전 작성을 허용할지 정하기 |
| T5 | §3.3 "분기를 모아 둘 곳 (`file:line`)" | 새로 만들 파일은 줄 번호가 없다 | 파일 경로 + "(파트 2에서 만듦)" | 칸 설명에 "새 파일이면 경로만" |
| T6 | §3.4 표 | 소유자 컬럼이 자기 자신인 테이블(`users`), 부모 FK 없는 테이블의 "부모가 지워질 때", **RLS 칸이 없다** | 삭제 동작 표에 "행 수준 보안" 줄을 더함 | §3.4 삭제 동작 표에 RLS 줄을 정식으로 넣기(Supabase는 `public`을 REST로 열기 때문에 모든 테이블에 필요) |
| T7 | §3.4 예시 `user_id bigint` | 이 프로젝트의 사용자 id는 Supabase `uuid`다 | §3.4 아래에 `uuid`로 적음 | 템플릿 예시를 `uuid`로 고치기 |
| T8 | §4 "명세서 예외 #" | 명세서가 없어 번호의 출처가 없다(T1과 같은 원인) | 이 계약서 안의 번호로 정함 | T1과 함께 |
| T9 | 템플릿에 없는 칸 | 새 라이브러리 목록, 코드 밖 외부 설정(Supabase·Google·Apple 콘솔), 마이그레이션 규칙을 둘 자리가 없다 | §3.5·§6 마지막 행·§3.4 아래 줄로 둠 | §3.5 "새 라이브러리" 절을 정식으로, 외부 설정은 §6에 행으로 |
| T10 | §1 표 아래 주석(서비스 함수의 오류 올리기) | 템플릿이 "첫 계약서에서 정한다"고 맡겨 둔 것 | `ApiError` + 처리기로 정함 | 이 계약서가 머지되면 템플릿 §5 예시의 `raise_api_error`를 `raise ApiError(...)`로 바꾸기 |
| T12 | §5 "의사코드 20~40줄" | 검증 순서(헤더·설정·JWKS·decode·role·sub)와 DB 단계를 함께 못 박으니 약 50줄이 됐다 | 줄이지 않고 그대로 둠(순서가 보안 가드라 빼면 안 됨) | "보안 검증 골격은 40줄을 넘어도 된다" 예외 한 줄 |
| T11 | 파트 머리말 10번 "보고 형식" | `3_구현.md` 5단계의 "주니어가 직접 확인한 것"이 D 태스크에는 없다 | `N/A: D 담당 태스크` | 그대로 둬도 됨(N/A 규칙으로 충분) |

## 2026-11-13 D 계약 검토·B1 (C-58)

- 사람 역할: `git config --local team.role` = D. AI 역할: 계약 설계·검토 담당(동일 세션 자체 검토, 별도 에이전트 없음).
- 코드 기준: PR #45가 `main`에 머지됨(`1353eb465373cf994b305c93ec08c3ce5d7a46c8`, 2026-11-13 13:36 KST)을 직접 조회했다. `main`을 `git pull --ff-only origin main`으로 맞추고 `docs/auth-1-b1`을 만들었다. 서버·앱은 열람만 했다.
- team 기준: 원격 `main`은 `ed018de`, 이 PC의 재배치 커밋 `d7cbda3`은 원격보다 한 커밋 앞선 상태였다. 이번 검토 수정과 함께 push한다. 최종 team 커밋은 기준선 §0·§10에서 관리한다.

| 검토 지점 | 직접 확인한 근거 | 반영 / 남은 제한 |
| --- | --- | --- |
| JWKS 경로·알고리즘 | [Supabase JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys) | `/auth/v1/.well-known/jwks.json`, ES256·RS256 허용 유지. 실제 프로젝트의 비대칭 키 활성화는 외부 설정 관문 |
| 모르는 kid 재조회·캐시 | [PyJWT 2.15.1 소스](https://github.com/jpadilla/pyjwt/blob/2.15.1/jwt/jwks_client.py), [API](https://pyjwt.readthedocs.io/en/2.15.1/api.html) | C6·P4: 마지막 성공 조회 뒤 cooldown 30초, 이후 최대 한 번 재조회. 개별 키의 무기한 캐시 끔. P5는 실제 클라이언트와 가짜 HTTP·시계를 써야 함 |
| 깨진 JWKS 오류 | 같은 소스의 `fetch_data`, `get_jwk_set`, `get_signing_keys`와 [예외 계층](https://github.com/jpadilla/pyjwt/blob/2.15.1/jwt/exceptions.py) ↔ C6 #2·#4 ↔ P4 | broad `PyJWTError`만으로 401 처리하던 골격을 전송·파싱 오류 503 / 유효 집합의 kid 없음 401로 분리. 필수 클레임·kid 형식·DB 오류 시험도 명시 |
| 앱 복구 재시도 | C2 `apiFetch` ↔ C6 #3·#5 | 오류별 각 한 번으로 중첩하지 않고 전체 재전송 한 번. 복구 실패는 실패 응답 반환, 등록 요청 재귀 금지. 제품 코드는 없음 |
| A5~A8·A9 | C1, [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [React Native 가이드](https://supabase.com/docs/guides/auth/quickstarts/react-native) | A5~A8 기본값 유지(확정 승격 없음). A8의 근거를 현재 React Native 가이드로 바로잡음. A9는 P2 전 후보 3개 시안 검토, 이번에는 시안 새로 만들지 않음. 선택 질문은 답 대기 |
| 05·06 대조 | 05 §3.1·§4·§9, 06 §2.1·§3 | users·두 경로·기존 공통 오류 코드 유지. user_profiles/Q-55는 LOCAL-1 전 별도 계약, 05·06 미확인 칸 변경 없음 |
| 구현 파트 크기 | 계약서 P2 실제 허용 파일 ↔ 문서_운영 §3 | 서버·앱 묶음 모두 7개 상한 초과. B1에서 예외 승인하지 않고 재분할 전 P1·P2 착수 보류. 재분할 여부 답 대기 |
| 공통 템플릿·규칙 | 정리안 §3 5·6, T1·T2·T9 | 이번 범위 포함 여부 답 대기. 수정하지 않음. 기존 계약서 머리 옛 번호 대응표 사용 |

검증은 문서의 경로·심볼·줄 번호·인코딩·diff 정적 대조다. 제품 테스트·DB·OAuth·웹·Android·iOS·운영 확인은 실행하지 않았다. PyJWT를 설치하거나 외부 인증 서비스를 호출하지 않았으므로 잠금 버전 실행 증거는 구현 파트가 남긴다.

기존 변경 보존: 코드 레포 `.gitignore`, 미추적 `개발산출물/시안/book-search_결정_시안.html`; team의 다른 작업 `templates/시안.html`, `docs/앱_표준_패턴.md`, `tools/check_mockup.py`, `tools/check_mockup.sh`를 이번 변경·커밋에서 제외한다.

### 실제 실행 기록 (Windows / PowerShell, 2026-11-13)

작업 위치는 `C:/seokhunchoi_Ax_Fullstack/libproject`, team은 `../team`이다.

- `git switch main` → `git pull --ff-only origin main` → `git switch -c docs/auth-1-b1`: 성공, 기준 HEAD `1353eb4`.
- team `git fetch origin main`: 원격 `ed018de`, `d7cbda3` 미게시 확인. 첫 `ls-remote`는 활성 계정 `choise-hun`으로 private 레포 접근에 실패했고 `Hunseokc` 전환 후 재조회·fetch 성공.
- team 검토 본문·A절 커밋 `f773ad96d1f5755427a07ca76b664e7f30d8eba1` push 성공. 이어 머리말 두 칸에 이 SHA를 넣은 `ccafacb0267b1986237305fc7030f19d74017d07` push 성공. `git ls-remote origin refs/heads/main`으로 원격 SHA 일치 확인.
- `sh ../team/tools/notify_junior.sh ...`: PATH에 `sh`가 없어 실행 실패. 같은 내용으로 UTF-8 body 파일을 만들어 `gh issue create --repo axteamc/localone --label to:A --body-file ...` 실행 성공, [공지 #47](https://github.com/axteamc/localone/issues/47). `gh issue view 47 --json url,labels`에서 `to:A` 확인. gh·team 원격 명령은 `Hunseokc`로 수행 후 매번 `choise-hun`으로 복구.
- `python -X utf8 -` 정적 검사: 수정 6파일 UTF-8·BOM 없음·LF, C1~C7/P1~P5 단일 절, 두 파트 머리말 SHA, 카드 HTML ID 중복 없음·3일 연속 선택지·누적 임시 문구 해소 모두 통과.
- `git diff --check`(코드 레포), team 대상 파일 `git diff --check`: 통과. `git diff --exit-code -- specs server mobile`: diff 없음. 05·06도 수정하지 않았다.
- 공통 팀 규칙의 유료 Claude 대화 시나리오(`tests/규칙_점검/run.py`)는 미실행: 이번에는 템플릿·프롬프트·스킬을 고치지 않았고, 문서 정적 검사만 수행했다.
- 선언·인계 작성 뒤 최종 정적 검사: `git diff --name-only 1353eb4`의 이번 문서 범위·UTF-8/BOM 없음/LF, B1·C-58 표의 행 연결, 두 레포 SHA 참조 확인 통과. `git diff 1353eb4 --exit-code -- specs server mobile 개발산출물/05_ERD_및_DB설계서.md 개발산출물/06_기능_API_정의서.md`는 diff 없음. 마지막 status의 잔여 변경은 위에 적은 다른 작업뿐이며 이번 문서만 경로 지정 커밋한다. 코드 레포는 로컬 커밋까지만 수행한다.

## 2026-11-13 추가 답변 반영 — C-59

사용자 답: A5~A8 "이번에 네 기본값 검토·확정", A9 "이번에 후보 3개 검토", 공통 규칙은 "반영하되 어떤 내용 변경 되었는지 나한테 알려주고, 인수인계 메모에도 남겨", 구현 계획은 "이번에 구현 파트도 재분할". C-58에서 답 대기였던 항목을 이 답으로 갱신한다.

### 공통 규칙에서 실제 바꾼 내용

| 파일 | 변경 | 보존한 관문·제한 |
| --- | --- | --- |
| team templates/계약.md | Step별 `## <STEP>`, 계약 C1~C7 / 구현 계획 P1~P5. C1 D 결정 표, P3 새 라이브러리 목록, C7 외부 설정 행 안내. 본문 push 뒤 SHA 후속 기입·빈 SHA 착수 금지, 새 분기 파일은 경로+생성 파트, 보안 골격 40줄 초과 가능. 공통 오류 예시를 ApiError·UUID·동기 트랜잭션+run_db로 정리하고 아직 구현 안 된 계약임을 명시 | 기존 RLS·uuid 예시(T6·T7), 열 칸·선행 가짜 값·7파일·600~700줄 상한 유지. 주니어 명세 승인 관문 유지. 예시를 새 제품 API/오류 승인으로 쓰지 않음 |
| team prompts/3_구현.md | 계약서 참조를 P1(기존 코드)·P4(골격)·C2/C3/C5/C6(계약)·P5(시험)로 정리. 명세서 없는 D Step만 승인 요구사항·상세 결정·C1로 대체, B1/SHA/선행/미결 확인 명시 | 주니어의 머지된 세부 명세+계약 두 관문, 실제 외부/운영 DB 금지·가드 제거 검증·테스트 무결성 보존 |
| team skills/pr-review/SKILL.md | P2 담당 파일·P4 골격·C7 가짜 값·C4 플랫폼·P5 반증 참조 갱신. D Step은 C1·C6·승인 요구사항으로 대조, 시안·SHA·선행 확인 명시 | 기존 3자 대조·소유권·가드/단언·iOS 머지 전 확인 보존. 이번에는 실제 PR 리뷰/머지 작업을 수행하지 않음 |
| team contracts/auth.md | A5~A8 확인으로 승격. A9는 D 산출물 후보 링크·P6 시안 관문. 기존 미착수 2파트를 6파트로 교체, 실제 전수 파일·선행·검증 명령·금지 범위·완료 조건·시험 배정·머리말 10칸 작성 | API 경로·필드·users 컬럼 추가 없음, 05·06 미확인 칸 유지. 생성 잠금 파일의 전체 줄 수는 미측정이며 상한 예외 승인 아님 |

계약/규칙 본문 team `94e7363740a70ec41c2a2a826e832275f8b35092`, 6파트 머리말에 본문 SHA를 적은 후속 커밋 `c9823aed210c043ac8cc159169597d16b0a24c5d`까지 main push 성공·ls-remote 일치 확인. Hunseokc로 원격 작업 후 choise-hun 복구. 다른 작업의 시안 템플릿·미추적 패턴/검사 도구는 커밋하지 않음.

### A9 후보 제시·검증 경계

[로그인 시안](../시안/AUTH-1_로그인_시안.html), [후보·명세 기록](../명세/AUTH-1_계약_분리_정리안.md#5-a9-로그인-배치-후보-검토-c-59). A 중앙 묶음(추천) / B 위 소개·아래 버튼 / C 이전 화면 위 시트. 현재 `data-chosen`은 비어 있고 채택안·사용자 이유는 없다. 선택 후 같은 시안에 반영하고 불편한 점 확인이 남는다. A9 미결이 AUTH-1-P1~P5 계약 정의를 막지는 않으며 P6 화면 구현만 막는다. 이번에는 어느 파트도 구현하지 않는다.

- `python -X utf8 ../team/tools/check_mockup.py 개발산출물/시안/AUTH-1_로그인_시안.html`: 시안 검사 통과. 검사기는 다른 작업의 로컬 미추적 파일인 현재 판을 읽어 실행했으며 이번에 team에 게시하지 않았다.
- HTML script를 .git 임시 파일로 추출 후 `node --check`: 성공. 실제 클릭을 실행한 증거는 아님.
- Python 정적 대조: 6파트 파일 수 7·7·5·7·5·4, 전수 파일 목록·머리말 10칸·A5~A8 확인·C/P 절·구현/리뷰의 옛 계약 번호 제거 통과.
- `git diff --check` 및 team 대상 4파일 diff 검사 통과. specs/server/mobile/05/06은 main `1353eb4`와 diff 없음.
- 브라우저 자동 확인은 실패: 브라우저 host unavailable 이후 기존 Chrome 창 선택 시 도구가 `could not determine the current browser URL on Windows with enough confidence to enforce policy`로 Computer Use를 종료했다. 이후 UI 조작·우회 없음. 렌더링·클릭·웹/Android/iOS 제품 동작은 미검증이다.
- 유료 Claude 행동 시나리오/추가 에이전트는 실행하지 않았다. 공통 규칙의 정적 참조 일치는 확인했지만 다른 AI가 새 규칙을 실제로 따르는지는 미검증이다.

원문에 없는 AI 추가: 로그인 배치 후보 3개(제안 상태), 구현 파트 분할·규칙 구조 보완(사용자 이번 지시). 원문에서 뺀 기능 없음. 원본/·00 §2·제품 요구사항을 변경하지 않았다.

## 2026-11-13 A9 B 채택 — C-60

- 사용자 선택 원문은 AUTH-1 정리안 §5·시안 명세 패널에 기록했다. B 위 소개·아래 버튼, 주요 컬러의 현재 책 모양을 로고로 발전시키는 방향을 채택했다. 선택 이유는 미관·앱 색감·교육기관 프로젝트 시연에서 텍스트보다 기억에 남는 점이다.
- 시안 `data-chosen="B"`, 선택 상자 B 기본 선택, B의 채택 테두리·배지, 명세 패널 채택/이유/차선/미채택/상태를 갱신했다. A(이전 AI 추천)·C는 보존. 차선은 받지 않아 없음, 개별 탈락 이유는 받지 않았다고 기록.
- AUTH-1 C1 A9는 확인(채택)·반영 확인 대기. P6 제품 화면 구현 전에 같은 시안의 반영 확인·불편한 점 답이 필요하다. 별도 최종 로고 자산 제작은 이번 작업에 포함하지 않았다. 기존 인증 동작·필드·플랫폼·제품 범위 변화 없음.
- team 본문 `c4a57b32f8e6df8121d7b03b06c5a6edebda2fcc`, 6파트 머리말 갱신 `70eaf171809162683247244dfdb35f2e6e093dcb` push·원격 main 일치 확인. Hunseokc 전환 뒤 choise-hun 복구.
- `python -X utf8 ../team/tools/check_mockup.py 개발산출물/시안/AUTH-1_로그인_시안.html`: 통과. diff 정적 검사 통과. 선택 상태·후보 보존·SHA·UTF-8/LF는 정적으로 대조한다. 이전 브라우저 도구 차단 뒤 이번에는 UI 재조작하지 않았고 렌더링·클릭·제품 동작은 미검증 유지.
- 코드 레포는 docs/auth-1-b1 로컬 기록, 제품 구현·코드 원격 게시·새 외부 공지 없음. 기존 .gitignore·book-search 시안 및 team 다른 작업 파일은 그대로 보존.
- AI가 새로 추가한 기능 없음. 사용자가 고른 로고 방향·배치를 기록한 것이며 원본/·00 §2·05/06 미확인 칸·specs/server/mobile은 수정하지 않았다.
