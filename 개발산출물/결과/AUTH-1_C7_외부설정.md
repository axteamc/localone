# AUTH-1 C7 외부 설정 체크리스트·적용 안내 (D)

> 2026-11-16 win, D. 계약서 `../team/contracts/auth.md` C7 "D 외부 설정" 행의 실행 절차와 확인 결과. [C-62](../스펙_변경_이력.md)
> 이 레포는 공개라 Supabase 프로젝트 ref·키·Google 클라이언트 비밀은 여기 적지 않는다(`<project-ref>`로 쓴다). 실제 값은 대시보드와 gitignore된 `.env`·`mobile/.env`에만 둔다.

## 0. 시작 전 확인 결과 (2026-11-16)

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| CI iOS 빌드 점검 | main `7bf6d59` push run 43785525329 **success**(iOS job 20분 16초), P6 브랜치 `33840b1` 수동 run 43785068209 **success**(22분 19초) | `gh run view` |
| iOS 빌드 점검이 확인하는 것 | 시뮬레이터용 빌드만(`npx expo run:ios --device generic --no-bundler`). **서명하지 않으므로 무료 팀 서명 가능 여부는 확인하지 않는다** | `.github/workflows/ci.yml` iOS job |
| Supabase 서명 키 | JWKS 공개 경로에 `ES256`(EC) 키 1개 — **이미 비대칭 키 사용 중**(계약 A3 충족, 할 일 없음) | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` 조회 |
| Supabase 켜진 제공자 | `email`만 켜짐, **Google 꺼짐** → 아래 2절 필요 | `/auth/v1/settings`(publishable 키로 조회) |
| Sign in with Apple, 무료 계정 | **안 됨.** Apple 지원 기능 표에서 "Sign in with Apple" 행은 ADP(유료)만 체크, "Apple Developer"(무료) 칸은 비어 있음 | [Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios) |
| 무료 서명 앱 만료 | **7일.** "Provisioning profiles that enable apps to be installed on a device will expire 7 days from issuance." 기기당 앱 3개, App ID 10개(7일 만료) | [Choosing a Membership](https://developer.apple.com/support/compare-memberships) |
| 무료 서명이 막힐 원인 | `expo-apple-authentication`이 설치만 돼 있어도 Expo 자동 플러그인(`@expo/prebuild-config` `versionedExpoSDKPackages`)이 `com.apple.developer.applesignin` 권한을 넣는다 → **AUTH-1-P7 `mobile/app.config.js`가 값이 꺼져 있으면 지운다** | `node_modules` 소스, `npx expo config --type introspect` 결과(꺼짐 `{}`/켜짐 `applesignin`) |

## 1. Supabase — URL Configuration (지금 할 것)

대시보드 → 프로젝트 → Authentication → URL Configuration (`https://supabase.com/dashboard/project/<project-ref>/auth/url-configuration`)

- [ ] **Site URL**: `http://localhost:8081` (redirectTo를 안 줬을 때 기본 복귀 주소. 배포 웹이 생기면 그 주소로 바꾼다)
- [ ] **Redirect URLs**에 정확히 두 줄 추가(와일드카드 쓰지 않음 — 문서가 운영에서는 정확한 경로를 권함):
  - `http://localhost:8081/login` (웹, `platform.ts` `startGoogleSignIn` 웹 분기의 `${origin}/login`)
  - `localone://auth-callback` (Android·iOS, `NATIVE_REDIRECT_URI`)
- 근거: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — "The URL in `redirectTo` should match the Redirect URLs list configuration", 모바일은 `com.supabase://login-callback/` 같은 사용자 스킴 예시.

## 2. Google Cloud + Supabase Google 제공자 (지금 할 것)

1. [ ] Supabase 대시보드 → Authentication → Sign In / Providers → **Google** 화면을 열고 **Callback URL**을 복사해 둔다(`https://<project-ref>.supabase.co/auth/v1/callback` 모양).
2. [ ] Google Cloud Console → Google Auth Platform
   - [ ] **Branding**(앱 이름 "동네한권", 지원 이메일) 입력. **Audience**는 External, 게시 상태 **Testing**이면 **Test users**에 로그인할 Google 계정을 넣는다(Testing 상태에서는 등록한 사용자만 로그인됨 — Google 쪽 동작, 이번 세션에서 공식 문서로 다시 확인하지 않음, 막히면 여기부터 본다).
   - [ ] **Data Access(Scopes)**: `openid`를 직접 추가(`userinfo.email`·`userinfo.profile`은 기본). Supabase 문서 지시.
   - [ ] **Clients → Create → Web application**
     - Authorized JavaScript origins: `http://localhost:8081`
     - Authorized redirect URIs: 1에서 복사한 Supabase Callback URL
   - [ ] 만들어진 **Client ID·Client Secret** 복사
3. [ ] Supabase Google 제공자 화면에서 **Enable**, Client ID·Client Secret 붙여 넣고 저장.
- Android·iOS 유형 클라이언트는 만들지 않는다. 이 앱은 네이티브에서도 브라우저(`WebBrowser.openAuthSessionAsync`)로 Supabase를 거치는 PKCE라 Google은 Supabase 콜백(웹 클라이언트)만 본다. Supabase 문서의 Expo 예시는 네이티브 Google 로그인(`signInWithIdToken`)이라 경로가 다르다. 네이티브에서 실제로 되는지는 실기기 확인 때 본다(미확인).
- 근거: [Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 3. Apple (계정 생기면 — 지금 안 함)

유료 Apple Developer Program 계정이 생겼을 때만 한다(2026-11-16 D 결정: 지금은 계정 없음·출시 안 함).

- [ ] Apple Developer → Identifiers에서 App ID `kr.localone.app`에 Sign in with Apple 켜기
- [ ] Supabase → Providers → Apple 켜기, Client IDs에 번들 ID `kr.localone.app` (네이티브 `signInWithIdToken`만 쓰므로 Services ID·비밀 키는 웹 Apple 로그인을 할 때만 필요 — 그때 Supabase Apple 문서로 다시 확인)
- [ ] `mobile/.env`(또는 빌드 환경)에 `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true` → `npx expo prebuild -p ios --clean`부터 다시 빌드
- [ ] 실기기 확인 목록에 "iOS: Apple 로그인" 항목 추가

## 4. 로컬에서 웹 실로그인 돌리는 법 (Windows)

1. 루트에서 `docker compose up -d --wait db`
2. 서버(`server/`): 루트 `.env`의 `SUPABASE_URL`은 이미 있다. DB는 로컬 컨테이너로 준다.
   `$env:APP_ENV="local"; $env:DATABASE_URL="postgresql+psycopg://localone:localone@localhost:5433/localone_test"` → `python -m uv run alembic upgrade head` → `python -m uv run uvicorn app.main:app --port 8000`
3. 앱(`mobile/`): `mobile/.env`(gitignore)에 `EXPO_PUBLIC_API_URL=http://localhost:8000`, `EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…`(대시보드 API Keys의 publishable 키) → `npx expo start --web --port 8081`
4. 브라우저에서 `http://localhost:8081` → "로그인" → "Google로 계속하기" → Google 계정 선택 → `/login`으로 돌아와 `/`에서 "로그인함"
5. 좁은 창(개발자 도구 기기 모드)·넓은 창 둘 다 본다(C4 확인 칸). Google 창에서 뒤로 가기·취소 때 오류 문구가 없는지(C6 #9)도 본다.

## 5. 확인 기록

| 날짜 | 플랫폼 | 결과 | 비고 |
| --- | --- | --- | --- |
| (기입) | 웹(Windows 브라우저) | | |
| — | Android | 미확인(D 실기기, 집/맥) | [실기기 확인 목록](../실기기_확인_목록.md) |
| — | iOS | 미확인(D 실기기, 집/맥) | 같은 곳 |
