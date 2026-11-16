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

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") {
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
