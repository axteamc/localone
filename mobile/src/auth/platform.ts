import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { AppState, Platform } from "react-native";

export type SignInFailureReason = "cancelled" | "failed" | "network";
export type SignInResult =
  | { ok: true; errorMessage?: undefined }
  | { ok: false; reason: SignInFailureReason; errorMessage?: string };

export interface AuthLikeClient {
  auth: {
    signInWithOAuth: (params: {
      provider: "google";
      options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
    }) => Promise<{ data: { url?: string | null }; error: unknown }>;
    exchangeCodeForSession: (
      code: string
    ) => Promise<{ data: unknown; error: unknown }>;
    signInWithIdToken: (params: {
      provider: "apple";
      token: string;
      nonce: string;
    }) => Promise<{ data: unknown; error: unknown }>;
    startAutoRefresh: () => void | Promise<void>;
    stopAutoRefresh: () => void | Promise<void>;
  };
}

export const NATIVE_REDIRECT_URI = "localone://auth-callback";

// 네이티브 복귀 주소 처리(C4 Google 행, C-67). Android는 Chrome 탭이 `localone:///auth-callback?code=…`로
// 앱을 다시 열 때 Expo Router가 이 주소를 화면 경로로 열어 "Unmatched Route"를 띄운다.
// 세션 교환은 `openAuthSessionAsync`가 돌려준 주소로 `startGoogleSignIn`이 하므로, 이 주소로는 화면을 바꾸지 않는다.
// `mobile/app/+native-intent.tsx`의 `redirectSystemPath`가 이 함수를 부른다(웹에서는 그 파일이 실행되지 않음).
const AUTH_CALLBACK_PATH = /^(?:[a-z][a-z0-9+.-]*:\/\/\/?|\/)?auth-callback(?:[/?#]|$)/i;

export function isAuthCallbackPath(path: string): boolean {
  return AUTH_CALLBACK_PATH.test(path.trim());
}

/** 켜진 앱: `null`(이동 없음) / 꺼진 앱이 이 주소로 열림: `/`(홈) / 그 밖의 주소: 그대로 */
export function authCallbackSystemPath(event: { path: string; initial: boolean }): string | null {
  if (!isAuthCallbackPath(event.path)) return event.path;
  return event.initial ? "/" : null;
}

export function isWebPlatform(): boolean {
  return Platform.OS === "web";
}

function isNetworkFailure(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err);
  return /network|fetch|offline|connection|internet/i.test(msg);
}

const webStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.removeItem(key);
  },
};

export const authStorage = {
  getItem: (key: string): Promise<string | null> =>
    Platform.OS === "web" ? webStorage.getItem(key) : AsyncStorage.getItem(key),
  setItem: (key: string, value: string): Promise<void> =>
    Platform.OS === "web"
      ? webStorage.setItem(key, value)
      : AsyncStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> =>
    Platform.OS === "web"
      ? webStorage.removeItem(key)
      : AsyncStorage.removeItem(key),
};

// Apple 로그인 켜기 설정(C4). 유료 Apple Developer 계정이 생기기 전에는 꺼 둔다(2026-11-16 D 결정).
// 정확히 "true"일 때만 켜짐. 빈 값·"false"·오타는 모두 꺼짐. mobile/app.config.js도 같은 값을 본다.
function isAppleSignInEnabled(): boolean {
  return process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === "true";
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios" || !isAppleSignInEnabled()) {
    return false;
  }
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function extractCodeFromUrl(callbackUrl: string): string | null {
  try {
    const parsed = new URL(callbackUrl);
    const queryCode = parsed.searchParams.get("code");
    if (queryCode) return queryCode;
    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      return hashParams.get("code");
    }
    return null;
  } catch {
    const match = /[?&#]code=([^&#]+)/.exec(callbackUrl);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

export async function startGoogleSignIn(
  client: AuthLikeClient
): Promise<SignInResult> {
  try {
    if (Platform.OS === "web") {
      const origin =
        typeof globalThis.location !== "undefined" && globalThis.location.origin
          ? globalThis.location.origin
          : "http://localhost:8081";
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/login`,
          skipBrowserRedirect: false,
        },
      });
      if (error) {
        return {
          ok: false,
          reason: isNetworkFailure(error) ? "network" : "failed",
        };
      }
      return { ok: true };
    }

    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: NATIVE_REDIRECT_URI,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      return {
        ok: false,
        reason: isNetworkFailure(error) ? "network" : "failed",
      };
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.url,
      NATIVE_REDIRECT_URI
    );
    if (browserResult.type !== "success" || !("url" in browserResult)) {
      return { ok: false, reason: "cancelled" };
    }

    const code = extractCodeFromUrl(browserResult.url);
    if (!code) {
      return { ok: false, reason: "failed" };
    }

    const { error: exchangeError } =
      await client.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return {
        ok: false,
        reason: isNetworkFailure(exchangeError) ? "network" : "failed",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: isNetworkFailure(err) ? "network" : "failed",
    };
  }
}

export async function startAppleSignIn(
  client: AuthLikeClient
): Promise<SignInResult> {
  if (!(await isAppleSignInAvailable())) {
    return { ok: false, reason: "failed" };
  }
  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) {
      return { ok: false, reason: "failed" };
    }
    const { error } = await client.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) {
      return {
        ok: false,
        reason: isNetworkFailure(error) ? "network" : "failed",
      };
    }
    return { ok: true };
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED") {
      return { ok: false, reason: "cancelled" };
    }
    return {
      ok: false,
      reason: isNetworkFailure(err) ? "network" : "failed",
    };
  }
}

export function watchAppForeground(client: AuthLikeClient): () => void {
  if (Platform.OS === "web") {
    return () => {};
  }
  const subscription = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  });
  return () => {
    subscription.remove();
  };
}
