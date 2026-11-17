// Expo Router 정해진 파일(https://docs.expo.dev/router/advanced/native-intent/). 네이티브에서만 실행된다.
// 판정은 auth 플랫폼 분기 한 곳(platform.ts)에 있고 여기서는 부르기만 한다(contracts/auth.md C4 Google 행, C-67).
import { authCallbackSystemPath } from "../src/auth/platform";

export function redirectSystemPath(event: { path: string; initial: boolean }): string | null {
  return authCallbackSystemPath(event);
}
