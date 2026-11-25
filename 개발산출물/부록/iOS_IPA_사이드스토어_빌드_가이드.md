# iOS IPA(SideStore · LiveContainer) GitHub Actions 빌드 참고 가이드

> 작성일: 2026-11-23  
> 목적: Windows 환경에서 Mac 없이 GitHub Actions(`macos` 러너)로 서명 없는(Unsigned) `.ipa`를 생성해 SideStore + LiveContainer로 실기기 테스트를 진행할 때 참고할 정리·검토 문서.  
> 상태: **적용(2026-11-25 win)** — [`.github/workflows/device-builds.yml`](../../.github/workflows/device-builds.yml)(수동 실행 `실기기 빌드`, iOS 서명 없는 IPA + Android Release APK, 값은 레포의 `mobile/.env.production`). 아래 §4 골격은 처음 검토본이다.

---

## 1. 조사 내용 요약 (원칙)

1. **원격 macOS 빌드:** Windows PC에서 직접 빌드하지 않고 GitHub Actions의 클라우드 macOS 러너를 이용해 `.ipa`를 생성한 뒤 **Artifacts**에서 내려받아 기기로 옮긴다.
2. **유료 개발자 계정($99) 불필요:** SideStore + LiveContainer 환경에서는 설치 시점에 LiveContainer가 자체 재서명(Re-sign)을 처리하므로, 인증서(`.p12`)·프로비저닝 프로파일 없이 `CODE_SIGNING_ALLOWED=NO`로 서명 없는 `.app`을 빌드한 뒤 `Payload/<App>.app` 구조로 압축해 `.ipa`를 만들면 된다.
3. **GitHub Actions 할당량:**
   - **Private 레포(무료 계정):** 월 2,000분 기준 macOS 러너는 분당 10배 차감되어 실질 **월 200분** 무료.
   - **Public 레포:** 표준 GitHub 호스팅 macOS 러너는 **무료·무제한**.

---

## 2. 우리 프로젝트(`axteamc/localone`) 기준 검토 결과

현재 저장소 설정(`.github/workflows/ci.yml`, `mobile/package.json`, `mobile/app.config.js`, `개발산출물/결과/SET-3b_iOS빌드점검.md`)과 대조한 결과는 다음과 같다.

| 항목 | 조사 내용 | 우리 레포 현황 및 적용 판단 |
| --- | --- | --- |
| **레포 공개 여부 / 요금** | Public이면 무료·무제한 | `axteamc/localone`은 **Public** 저장소이므로 macOS 러너 비용 제한 없음([PROJECT.md](../../team/PROJECT.md) §1). 단, Expo + CocoaPods + Xcode 빌드는 일반 네이티브 앱(5~10분)보다 길어 **실측 13~23분** 소요([ci.yml](../../.github/workflows/ci.yml) 주석). |
| **macOS 러너 버전** | `runs-on: macos-latest` | 우리 앱은 Expo SDK 58(`expo: ~58.0.24`)이라 **Xcode 26.4+**가 필수. 현재 `ci.yml`은 `macos-26`(기본 Xcode 26.6)으로 고정 중이므로, 새 워크플로우도 **`macos-26`** 사용 권장. |
| **기존 `ci.yml`과 분리** | Push마다 빌드 | `ci.yml`의 `ios` job은 PR 비차단·`main` push 전용 **시뮬레이터 빌드 점검**(`expo run:ios --device generic`)이다. 실기기용 `.ipa` 빌드는 **별도 워크플로우(`workflow_dispatch` 수동 실행)**로 분리해야 기존 CI 흐름을 방해하지 않는다. |
| **시뮬레이터 vs 실기기 빌드** | `.app` → `Payload` → `.ipa` | **중요:** 기존 `ci.yml`의 `--device generic`은 시뮬레이터(Simulator)용 Debug 빌드라 실기기에 설치할 수 없고 Metro 서버도 필요하다. `.ipa`용으로는 반드시 **`-sdk iphoneos` + `Release` 구성**으로 빌드해 JS 번들(`main.jsbundle`)을 `.app` 안에 내장해야 한다. |
| **Apple 로그인 권한** | 무료 계정 제약 | `mobile/app.config.js`에서 `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED !== "true"`이면 `com.apple.developer.applesignin` 권한을 자동 제거하도록 이미 구현되어 있어 무료/재서명 환경과 충돌하지 않는다. |

---

## 3. Expo + SideStore/LiveContainer 빌드 시 추가 주의사항

1. **환경변수(`EXPO_PUBLIC_*`) 주입 필수**
   - `mobile/.env`는 `.gitignore` 대상이므로 CI 러너에 없다.
   - `Release` 빌드는 빌드 시점에 JS 번들을 생성하므로, 워크플로우 `env:`에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_KAKAO_JS_KEY` 등을 **GitHub Secrets**로 넘겨야 앱이 정상 동작한다.
2. **Public 레포 Artifact 노출 주의**
   - `axteamc/localone`은 Public 레포이므로 GitHub Actions Artifacts를 외부에서도 조회·다운로드할 수 있다.
   - 빌드 결과물(`.ipa` 내부 JS 번들)에 **비공개 API 키, 개인 PC 사설 IP, 민감한 내부 테스트 URL**이 들어가지 않도록 주의한다. (운영/공개용으로 허용된 클라이언트 공개 키만 사용)
3. **Expo Push(`expo-notifications`) 등 Entitlements 확인**
   - `mobile/app.json`에 `expo-notifications` 플러그인이 포함되어 있다.
   - LiveContainer 재서명 시 `aps-environment` 등 유료 계정 전용 entitlement가 남아 있어 설치가 거부되면, `app.config.js` 또는 빌드 단계에서 해당 entitlement 제거 여부를 점검해야 한다([실기기_확인_목록.md](실기기_확인_목록.md) LOAN-3 참고).
4. **OAuth 복귀 URL Scheme (`localone://`) 실기기 검증 필요**
   - Google 로그인 후 `localone://auth-callback`으로 복귀하는 흐름이 LiveContainer 컨테이너 환경에서도 앱으로 정상 라우팅되는지는 첫 실기기 테스트 때 확인이 필요하다.

---

## 4. 향후 워크플로우 작성 시 참고 골격 (미적용 예시)

실제로 `.ipa` 추출 워크플로우(예: `.github/workflows/ios-ipa.yml`)를 만들 때는 아래 흐름을 기준으로 작성한다.

```yaml
name: Build Unsigned iOS IPA

on:
  workflow_dispatch: # 필요할 때 원하는 브랜치에서 수동 실행

jobs:
  build-ipa:
    runs-on: macos-26
    timeout-minutes: 60
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: mobile/package-lock.json
      - run: npm ci

      # 1. Expo 네이티브 프로젝트 생성 (ios/ 폴더)
      - name: Expo Prebuild (iOS)
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
          EXPO_PUBLIC_API_URL: ${{ secrets.EXPO_PUBLIC_API_URL }}
          EXPO_PUBLIC_KAKAO_JS_KEY: ${{ secrets.EXPO_PUBLIC_KAKAO_JS_KEY }}
        run: npx expo prebuild --platform ios --clean

      # 2. 실기기(iphoneos) Release 서명 없이 빌드 (JS 번들 내장)
      #    실제 workspace/scheme 이름은 prebuild 결과(mobile/ios/*.xcworkspace) 확인 후 지정
      - name: Build Unsigned .app
        working-directory: mobile/ios
        run: |
          WORKSPACE=$(ls -d *.xcworkspace | head -n 1)
          SCHEME="${WORKSPACE%.xcworkspace}"
          xcodebuild \
            -workspace "$WORKSPACE" \
            -scheme "$SCHEME" \
            -configuration Release \
            -sdk iphoneos \
            -derivedDataPath build \
            CODE_SIGNING_ALLOWED=NO \
            CODE_SIGNING_REQUIRED=NO \
            CODE_SIGN_IDENTITY="" \
            build

      # 3. Payload 폴더로 압축해 .ipa 생성
      - name: Package .ipa
        working-directory: mobile/ios
        run: |
          mkdir -p Payload
          APP_PATH=$(find build/Build/Products/Release-iphoneos -name "*.app" -maxdepth 1 | head -n 1)
          cp -R "$APP_PATH" Payload/
          zip -r -y localone-unsigned.ipa Payload

      # 4. Artifacts 업로드
      - uses: actions/upload-artifact@v4
        with:
          name: localone-unsigned-ipa
          path: mobile/ios/localone-unsigned.ipa
          retention-days: 7
```

---

## 5. 실기기 적용 순서 요약

1. GitHub 저장소 **Actions** 탭 → 해당 워크플로우 수동 실행(`Run workflow`) → 완료 후 **Artifacts**에서 `localone-unsigned.ipa` 다운로드.
2. Windows에서 iCloud Drive / 로컬 전송 등으로 아이폰에 `.ipa` 파일 전달.
3. 아이폰 **LiveContainer**(SideStore로 설치·서명 유지)에서 해당 `.ipa` 불러오기 및 실행 후 실기기 테스트 진행.
