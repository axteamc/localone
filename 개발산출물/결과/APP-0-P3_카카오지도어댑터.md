# APP-0-P3 카카오 지도 어댑터 결과

2026-11-17 Windows / 사람 D / AI 구현·자체 검증 담당.
상태: **로컬 구현·검증 완료, PR 게시 및 CI 대기.**

## 1. 기준과 범위

- 기준 `origin/main`: `dfa7f234785e8f6788e27fce49f60d070499ebf2` (PR #110 머지 반영).
- 계약: `../team/contracts/core.md` APP-0 C1(K19)·C2·C4·C6(P-#3)·C7·P2·P3·P5 (본문 SHA `492425ddf3d5985a336c368d5c320d82fd044bc1`).
- 격리 worktree: `../libproject-app0-p3`, 브랜치: `feat/core-APP-0-part3`.
- 코드 커밋: **`46218f31593f808ef85f22d5bf3947a88864252a`**, `Owner: D`.
- 허용 7파일 집합 일치: `mobile/src/lib/map/KakaoMap.tsx`, `mobile/src/lib/map/KakaoMap.web.tsx`, `mobile/src/lib/map/kakaoHtml.ts`, `mobile/src/lib/map/__tests__/KakaoMap.test.tsx`, `mobile/.env.example`, `mobile/package.json`, `mobile/package-lock.json`.
- 사전 조건(C7): 루트 `.env`의 `PUBLIC_KAKAO_JS_KEY`(32자)와 웹 도메인(`http://localhost:8081` · `https://map.localone.invalid`) 등록 완료 확인 후 `mobile/.env`에 `EXPO_PUBLIC_KAKAO_JS_KEY` 설정(gitignore 대상, 커밋 제외).
- 금지 준수: 길 안내·위치 추적·대출 가능 표시 없음, `mobile/app/`·서버/DB 변경 없음.

## 2. 구현과 계약 추적

| 계약 | 구현 근거 | 시험 근거 (`mobile/src/lib/map/__tests__/KakaoMap.test.tsx`) |
| --- | --- | --- |
| C2 타입·네이티브 WebView 어댑터 | `KakaoMap.tsx` (`LatLng` `L14`, `MapMarker` `L16-L23`, `KakaoMapProps` `L25-L36`, `KakaoMap` `L48-L188`), `baseUrl: "https://map.localone.invalid"` (`kakaoHtml.ts` `L4`), `injectJavaScript` 증분 갱신(`L92-L99`) | `kakao map marker press message calls onMarkerPress` (`L130`), `updates markers and center via injectJavaScript after ready` (`L268`), `parseKakaoBridgeMessage rejects invalid payloads` (`L338`) |
| C4 웹 SDK 직접 어댑터 | `KakaoMap.web.tsx` (`loadKakaoSdk` `L94-L148`, `KakaoMap` `L155-L381`, `MapTypeId.ROADMAP` `L289`, `MarkerClusterer` `L295-L320`, `dragend` `L322-L329`) | `web: loads SDK, renders ROADMAP/markers/clusters, and fires callbacks` (`L551`) |
| K19 / V3·V4 핀·묶음·토큰 색 | `kakaoHtml.ts` (`getKakaoMapPalette` `L38-L52`, `createMarkerContentElement` `L103-L183`, `createClusterContentElement` `L185-L247`, `buildKakaoMapHtml` `L257-L526`: `ROADMAP`, `MarkerClusterer`, 38px 원 + `도서관 n곳`, `safeJsonStringify` `L55-L62`) | `kakaoHtml uses ROADMAP, MarkerClusterer, theme tokens, and escapes HTML` (`L307`), `#RRGGBB` 0건 |
| P-#3 오류 단일 보고·5초 시간 초과 | `KakaoMap.tsx` (`reportError` `L82-L90`, `no_key` `L104-L107`, `timeout` `L109-L111`, `load_failed` `L148·L165`), `KakaoMap.web.tsx` (`reportError` `L197-L205`, `no_key` `L270-L273`, `timeout` `L276-L279`, `load_failed` `L344`) | `kakao map without key calls onError(no_key)` (`L88`), `kakao map with whitespace-only key calls onError(no_key)` (`L112`), `kakao map timeout calls onError(timeout)` (`L200`), `kakao map load error calls onError(load_failed) once and cancels timeout` (`L237`), 웹 3건(`L473·L490·L521`) |
| P3 `react-native-webview` 추가 | `mobile/package.json` (`"react-native-webview": "14.0.1"`), `mobile/package-lock.json`, `mobile/.env.example` (`EXPO_PUBLIC_KAKAO_JS_KEY=`) | `npx expo install --check react-native-webview` 일치 확인 |

## 3. 실제 검증

대상: 코드 커밋 `46218f31593f808ef85f22d5bf3947a88864252a`와 동일한 소스. 명령 작업 위치는 `C:\seokhunchoi_Ax_Fullstack\libproject-app0-p3\mobile`(정적 검사는 worktree 루트).

- 의존성 설치 메모: 사용자 `~/.npmrc`의 `allow-scripts` 설정 때문에 `npx expo install react-native-webview` 내부 `npm install`이 `EALLOWSCRIPTS`로 실패했고, `package.json`에 SDK 58 권장 버전(`14.0.1`, `bundledNativeModules.json` 일치)이 반영된 상태에서 `npm install --ignore-scripts` 및 `npx expo install --check react-native-webview`로 설치·정합을 확인했다.

| 명령/검사 | 실제 결과 |
| --- | --- |
| `npm install --ignore-scripts` & `npx expo install --check react-native-webview` | exit 0, `Dependencies are up to date` (`14.0.1`) |
| `npx tsc --noEmit` | exit 0 |
| `npx jest --runInBand` | exit 0, **8 suites / 60 tests passed** (`KakaoMap.test.tsx` 12 tests 포함, 2.004s) |
| `npx expo export --platform web` | exit 0, `env: export ... EXPO_PUBLIC_KAKAO_JS_KEY ...`, 867 modules, 14 web bundles, `Exported: dist` |
| 정적 점검 (`#RRGGBB` · UTF-8 BOM · CRLF · `git diff --check`) | 7파일 모두 `bom=False`, `crlf=False`, `mobile/src/lib/map/` 내 `#RRGGBB` 0건, `git diff --check` exit 0 |

### 실제 가드 제거 변이 (자체 점검)

각 변이는 프로덕션 파일 한 곳만 변경 → `npx jest --runInBand src/lib/map/__tests__/KakaoMap.test.tsx` 실행 → 의도한 단언 실패(`exit 1`) 확인 → `finally`로 원본 바이트 복원 후 전체 Jest(`8 suites / 60 tests`) 재통과 확인. 같은 세션 자체 점검이며 독립 검증 관문으로 세지 않는다.

| 제거/변형한 가드 | 실패 단언 |
| --- | --- |
| `KakaoMap.tsx` `!appKey` 조기 반환 무력화(`false && !appKey`) | `kakao map without key calls onError(no_key)`, `kakao map with whitespace-only key calls onError(no_key)` 실패 (`exit 1`) |
| `KakaoMap.tsx` 5초 준비 시간 초과 타이머 제거(`timeoutRef.current = null`) | `kakao map timeout calls onError(timeout)` 실패 (`exit 1`) |
| `KakaoMap.web.tsx` `reportError` 중복/완료 가드 제거(`if (false) return;`) | `web: timeout calls onError(timeout)` 실패 (`exit 1`) |
| `kakaoHtml.ts` `safeJsonStringify` `<` 이스케이프 제거 | `kakaoHtml uses ROADMAP, MarkerClusterer, theme tokens, and escapes HTML` 실패 (`exit 1`) |

## 4. 미검증과 인계

- 화면 연결: APP-0-P3는 공통 지도 어댑터 부품만 구현·단위 검증. `HomeScreen` 마운트는 A `VISIT-1-P2` 범위.
- 플랫폼: 웹 번들 export(`EXPO_PUBLIC_KAKAO_JS_KEY` 로드 포함) 통과. 실제 브라우저 내 카카오맵 SDK 실타일 렌더·도메인 검증, Android 에뮬레이터/실기기 WebView 실렌더, iOS 실기기/빌드는 미실행(Windows 환경, PR `needs-ios` 확인 필요).
- 운영·배포: 미실행.
- 보존: 공유 worktree `C:\seokhunchoi_Ax_Fullstack\libproject`(`docs/sync-artifacts-20261117` 미커밋 문서), `../libproject-core-LIB-0-part1`, `../team` 보류 묶음은 손대지 않고 보존.
