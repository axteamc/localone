# APP-0-P1 앱 공통 기반 결과

2026-11-16 Windows / 사람 D / AI 구현·자체 검증 담당.
상태: **로컬 검증·코드 게시 완료, Draft PR [#96](https://github.com/axteamc/localone/pull/96). CI 확인은 사용자 D 담당, 미확인. 머지하지 않음.**

## 1. 기준과 범위

- PR #92 `docs/impl-flow-junior`의 MERGED·`mergedAt` 확인 후 main pull. 출발 `4b73789bfa2074c71a5331922a00d545f3013b76`, 최신 origin/main에서 `feat/core-APP-0-part1` 생성.
- 기준: [B2 §0](../기준선.md), team `3361a5f21479c184c97476962ef92e94e9c85aa5`, core APP-0 본문 `492425ddf3d5985a336c368d5c320d82fd044bc1`. APP-0 C1~C7·P1~P5 및 LIB-0 C3 대조.
- 코드 커밋: **`6d6bb502b7fb137f4af149bd7810d19c2b559543`**, `Owner: D`.
- 구현·테스트 파일은 core APP-0-P1 행의 13개와 집합 일치 검사 통과. 운영 기록은 별도 docs 커밋. 계약서·토큰 이름·시그니처·저장 키 변경 없음.
- 1,121 TS 줄(지역 표 264행 포함). 계약이 공통 기반과 그 시험을 한 파트로 지정하므로 13파일을 함께 제공한다. 참고치 초과 사유를 PR 본문에 기록.
- APP-0-P2·P3, LIB-0, SRV-0은 [진행 파일](../완료/진행_D공통기반.md)에 순서만 기록. 주니어 PR 리뷰·team 보류 묶음 커밋·머지·외부 알림 없음.

## 2. 사전 공식 확인

| 대상 | 공식 출처와 확인 | 반영 |
| --- | --- | --- |
| Expo SDK 58 Location | [SDK 58 문서](https://docs.expo.dev/versions/v58.0.0/sdk/location/) 권장 `~58.0.22`, 전경 권한·Balanced·config plugin | package `~58.0.22`, lock `58.0.22` |
| AsyncStorage | [SDK 58 문서](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/) 권장 `2.2.0` | 기존 버전 유지 |
| 정보나루 지역 | [공식 활용 안내](https://www.data4library.kr/apiUtilization) → [공식 매뉴얼](https://www.data4library.kr/downloadApiManual) `v20260620`, pp.63~70 | 활성 264코드 전수 추출, 23030·37310 제외, 22520 대구 군위 포함. `11020` 서울특별시 중구 확인 → K18 값 유지 |

공식 매뉴얼 SHA256: `672AC843264A8407B9F8C184E4EC5E73E5DAC67E737666C6D2DB688BB3480DF2`.
PDF 표의 텍스트 전수 추출과 p.63 렌더 확인. 원본·중간 파일은 OS 임시 폴더에만 두고 커밋하지 않았다.

`npx expo install expo-location @react-native-async-storage/async-storage`은 Expo 원격 버전 조회에서 `TypeError: Body is unusable: Body has already been read`로 실패했다. 공식 권장 범위로 `npm install expo-location@~58.0.22` 성공. SDK 로컬 bundledNativeModules 값 `~58.0.21`에도 설치 58.0.22가 포함된다.

## 3. 구현과 계약 추적

| 계약 | 구현 근거 | 시험 근거 (`mobile/src/lib/__tests__/lib.test.ts`, 테마 별도) |
| --- | --- | --- |
| 색·곡률 | `theme/tokens.ts`, `theme/index.ts` 4룩·파생색·6개 임시 의미색·inner | `theme/__tests__/theme.test.ts` warm 전수·곡률·대비·4룩 |
| K14 / P-#6 | `lib/latest.ts` abort + 순번 판별·cancel | 첫 요청 늦은 성공/실패 폐기·cancel·현 요청 오류 |
| C3 / K16~17 / P-#7 | `lib/policy.ts`, `lib/visits.ts` 서울 날짜·쓰기 직렬화·JSON/모양 검증 | 동시 중복 집계 방지·서울 자정·연속 방문 초기화·정렬 3단계·깨진 저장 원본 보존·저장 실패·기본 도서관 설정/삭제 |
| K18·K20 | `lib/policy.ts`, `lib/regions.ts` | 코드 수·고유성·폐지 제외·기본 위치·부분 일치·앞 일치 우선·limit |
| C4 / P-#1·2·8 | `lib/platform.ts` 플랫폼 분기·전경 위치·외부 주소 | 허용/거부/서비스 끔/없음/시간 초과/취소, 늦은 권한 뒤 GPS 미호출, 웹 localStorage, Linking·noopener, 비http 차단 |
| LIB-0 C3 / P-#4·5 | `lib/publicApi.ts` 응답 타입 11개·공개 함수 11개, apiFetch 재사용 | 서버 오류 code/message/detail·NETWORK·취소 전달·쿼리 인코딩·전 함수 경로·signal |

정확한 저장 키: `recent_books:<user_id>`·`recent_books:guest`, `localone:visits:v1`, `localone:default_library:v1`.
방문·기본값은 계정과 무관한 기기 기록으로 로그아웃 보존. AUTH-2 `registerSignOutCleanup`은 아직 없으므로 호출하지 않고 연결 주석만 남겼다.
위치 저장·로그·외부 제공자 직접 호출·서버/DB 변경 없음. 소장/대출 타입은 yes/no/unknown 유지. 화면 연결은 이번 범위에 없음.

## 4. 실제 검증

대상: 코드 커밋 `6d6bb50`와 같은 소스·잠금 파일의 커밋 전 working tree. 모든 명령 작업 위치는 `C:\seokhunchoi_Ax_Fullstack\libproject\mobile`(Git/문서 검사는 루트).

| 명령/검사 | 실제 결과 |
| --- | --- |
| `npm ci` | exit 0, 1,094 packages 설치 |
| `npx tsc --noEmit` | exit 0 |
| `npx jest --runInBand` | exit 0, **6 suites / 42 tests passed**, 9.653s |
| `npx expo export --platform web` | exit 0, 860 modules, `Exported: dist` |
| `npx expo config --type introspect --json` | exit 0. iOS 전경 권한 문구가 계약과 동일. UIBackgroundModes 위치 없음. Android 위치는 COARSE/FINE, 배경/전경서비스 권한 없음 |
| 계약 파일 목록 집합 비교 | 허용 13 = 구현 13 |
| `git diff --check`, UTF-8·BOM/LF 검사 | 통과(코드/운영 기록 확인) |

초기 표적 시험은 2 suites / 28 tests 통과. 새 prefix 우선 단언 추가 후 전체 42개를 검증했다. 타입 검사도 최종 설치 후 실행했다.
웹 export는 이전 Metro 캐시의 `Unable to deserialize cloned data` 경고 뒤 전체 탐색으로 자동 복구했다. 재실행 없이 최종 성공했다.
`npm ci`의 audit 출력은 23건(1 low·22 moderate), deprecated·install-script 알림도 있었다. 범위 밖 의존성 일괄 변경은 하지 않았다.

### 실제 가드 제거 변이 (자체 점검)

각 변이는 프로덕션 파일을 한 번에 하나씩 변경 → 해당 Jest 실행 → 실제 단언 실패(exit 1) 확인 → `finally`로 원복했다. 변형본은 커밋하지 않았다. `--testNamePattern`으로 제외된 다른 시험은 skip 추가가 아니다.

| 제거한 가드 | 실패 단언 |
| --- | --- |
| `latest.ts`의 `mine === seq`를 항상 true로 | `latest runner drops stale result`: 첫 응답 stale 기대가 ok로 실패 |
| `visits.ts` 동일 서울 날짜 조기 반환 제거 | `recordVisit counts once per Seoul day`: [true,false] 기대·count·쓰기 횟수 실패 |
| `platform.ts` http(s) 제한 제거 | `openExternalUrl rejects non-http`: javascript URL false 기대 실패 |
| `platform.ts` 권한 거부 분기 제거 | `locate denied returns reason without throwing`: denied 기대가 성공 좌표로 실패 |

원복 후 전체 42개 통과. 독립 검증 관문 통과로 세지 않는다.

## 5. 미검증과 인계

- **CI:** 2026-11-16 사용자 후속 지시 "커밋 푸시해서 pr 올리면 CI 확인은 내가 할게"에 따라 D에게 이관. CI 대기·성공 판정·실패 분석을 수행하지 않았다. 로컬 통과와 구별한다.
- 화면 연결: N/A(P1은 화면 없는 공통 도구). 기존 화면에 import를 추가하지 않았으므로 export 성공은 새 도구의 실제 화면 연결 증거가 아니다.
- 통합: LIB-0 서버·DB 연결·실제 제공자 여정 미검증. publicApi는 모의 apiFetch, 기존 apiFetch는 기존 시험에서 검증.
- 플랫폼: 웹은 export·모의 웹 어댑터만. 실제 위치 권한·팝업·기기 재시작 미검증. Android·iOS 에뮬레이터/실기기·빌드 미검증(Windows, 기기 미연결). PR `needs-ios`, D 확인 필요.
- 웹 `window.open(..., "noopener")`는 성공에도 null을 반환할 수 있어 예외 없는 호출을 성공으로 판정한다. 팝업 차단의 실제 결과 판별은 한계로 남긴다.
- 서버 로컬 시험·DB 마이그레이션 N/A(서버 변경 없음), 운영·배포 미실행.
- 원문 대비: 제품 요구사항 추가·삭제·변경 없음.
- 보존: 시작 시 미추적 시안 3개와 종료 점검 중 나타난 `PR78_LOCAL-1_시안.html`, team 시안 템플릿 수정·표준 패턴/검사 도구 묶음. 자동 stash·삭제·커밋하지 않음.
- 다음 담당: D가 PR #96 CI와 iOS 확인·자체 점검 근거를 검토. 머지는 D 별도 확인 뒤. 후속 파트는 새 지시 전 착수하지 않는다.
