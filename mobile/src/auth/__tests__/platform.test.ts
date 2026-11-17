import { afterAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { AppState, AppStateStatus, Platform } from "react-native";
import {
  AuthLikeClient,
  authCallbackSystemPath,
  authStorage,
  isAppleSignInAvailable,
  NATIVE_REDIRECT_URI,
  startAppleSignIn,
  startGoogleSignIn,
  watchAppForeground,
} from "../platform";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: "cancel", DISMISS: "dismiss" },
}));

const mockedOpenAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);
const mockedAppleIsAvailable = jest.mocked(AppleAuthentication.isAvailableAsync);
const mockedAppleSignIn = jest.mocked(AppleAuthentication.signInAsync);
const mockedRandomUUID = jest.mocked(Crypto.randomUUID);
const mockedDigestString = jest.mocked(Crypto.digestStringAsync);
const mockedGetItem = jest.mocked(AsyncStorage.getItem);
const mockedSetItem = jest.mocked(AsyncStorage.setItem);
const mockedRemoveItem = jest.mocked(AsyncStorage.removeItem);

function makeFakeClient() {
  const signInWithOAuth =
    jest.fn<AuthLikeClient["auth"]["signInWithOAuth"]>();
  const exchangeCodeForSession =
    jest.fn<AuthLikeClient["auth"]["exchangeCodeForSession"]>();
  const signInWithIdToken =
    jest.fn<AuthLikeClient["auth"]["signInWithIdToken"]>();
  const startAutoRefresh =
    jest.fn<AuthLikeClient["auth"]["startAutoRefresh"]>();
  const stopAutoRefresh =
    jest.fn<AuthLikeClient["auth"]["stopAutoRefresh"]>();

  return {
    auth: {
      signInWithOAuth,
      exchangeCodeForSession,
      signInWithIdToken,
      startAutoRefresh,
      stopAutoRefresh,
    },
  };
}

describe("platform OAuth adapter lifecycle (AUTH-1-P4)", () => {
  const originalOS = Platform.OS;
  const originalAppleFlag = process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    // 아래 lifecycle 시험은 계정이 생겨 값을 켠 상태를 본다
    process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED = "true";
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      configurable: true,
    });
    if (originalAppleFlag === undefined) {
      delete process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED;
    } else {
      process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED = originalAppleFlag;
    }
  });

  test("apple_disabled_by_setting_on_ios", async () => {
    const client = makeFakeClient();
    mockedAppleIsAvailable.mockResolvedValue(true);

    // 값 없음(기본)·"false"·오타는 모두 꺼짐: iOS여도 버튼 없음, Apple을 부르지 않음
    for (const value of [undefined, "", "false", "TRUE", "1"]) {
      if (value === undefined) {
        delete process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED;
      } else {
        process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED = value;
      }
      expect(await isAppleSignInAvailable()).toBe(false);
      expect(await startAppleSignIn(client)).toEqual({
        ok: false,
        reason: "failed",
      });
    }
    expect(mockedAppleIsAvailable).not.toHaveBeenCalled();
    expect(mockedAppleSignIn).not.toHaveBeenCalled();
    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();

    // 값만 켜면 iOS에서 다시 기기 확인 결과를 따른다
    process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED = "true";
    expect(await isAppleSignInAvailable()).toBe(true);
    expect(mockedAppleIsAvailable).toHaveBeenCalledTimes(1);
  });

  test("oauth_adapter_lifecycle", async () => {
    const client = makeFakeClient();

    // 1. Google PKCE 성공 및 취소
    client.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: "https://supabase.example.co/authorize" },
      error: null,
    });
    mockedOpenAuthSession.mockResolvedValueOnce({
      type: "success",
      url: `${NATIVE_REDIRECT_URI}?code=pkce-code-123`,
    });
    client.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: {} },
      error: null,
    });

    const googleOk = await startGoogleSignIn(client);
    expect(googleOk).toEqual({ ok: true });
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: NATIVE_REDIRECT_URI,
        skipBrowserRedirect: true,
      },
    });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "pkce-code-123"
    );

    client.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: "https://supabase.example.co/authorize" },
      error: null,
    });
    mockedOpenAuthSession.mockResolvedValueOnce({
      type: WebBrowser.WebBrowserResultType.CANCEL,
    });
    const googleCancel = await startGoogleSignIn(client);
    expect(googleCancel).toEqual({ ok: false, reason: "cancelled" });

    // 2. Apple nonce 전달(SHA-256 해시는 Apple에, 원본 nonce는 Supabase에) 및 플랫폼 분기
    mockedAppleIsAvailable.mockResolvedValue(true);
    mockedRandomUUID.mockReturnValue("raw-nonce-abc");
    mockedDigestString.mockResolvedValue("sha256-nonce-xyz");
    mockedAppleSignIn.mockResolvedValueOnce({
      user: "apple-user",
      identityToken: "apple-id-token",
      authorizationCode: "code",
      email: null,
      fullName: null,
      realUserStatus: 1,
      state: null,
    });
    client.auth.signInWithIdToken.mockResolvedValueOnce({
      data: { session: {} },
      error: null,
    });

    expect(await isAppleSignInAvailable()).toBe(true);
    const appleOk = await startAppleSignIn(client);
    expect(appleOk).toEqual({ ok: true });
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "sha256-nonce-xyz" })
    );
    expect(client.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "apple-id-token",
      nonce: "raw-nonce-abc",
    });

    // Android·웹에서는 Apple 항상 false
    Object.defineProperty(Platform, "OS", {
      value: "android",
      configurable: true,
    });
    expect(await isAppleSignInAvailable()).toBe(false);
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    expect(await isAppleSignInAvailable()).toBe(false);

    // 3. 저장소 재사용 (네이티브 AsyncStorage)
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    mockedGetItem.mockResolvedValueOnce("stored-session");
    await authStorage.setItem("sb-key", "stored-session");
    expect(mockedSetItem).toHaveBeenCalledWith("sb-key", "stored-session");
    expect(await authStorage.getItem("sb-key")).toBe("stored-session");
    await authStorage.removeItem("sb-key");
    expect(mockedRemoveItem).toHaveBeenCalledWith("sb-key");

    // 4. AppState foreground 구독 및 cleanup
    let capturedListener: ((state: AppStateStatus) => void) | null = null;
    const removeMock = jest.fn();
    const addListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        capturedListener = listener as (state: AppStateStatus) => void;
        return { remove: removeMock } as ReturnType<
          typeof AppState.addEventListener
        >;
      });

    const cleanup = watchAppForeground(client);
    expect(capturedListener).not.toBeNull();
    capturedListener!("active");
    expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    capturedListener!("background");
    expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    cleanup();
    expect(removeMock).toHaveBeenCalledTimes(1);
    addListenerSpy.mockRestore();
  });
});

// C4 Google 행 네이티브 복귀 주소 처리(AUTH-1-P8, C-67): Android "Unmatched Route" 방지
describe("native auth-callback system path (AUTH-1-P8)", () => {
  test.each([
    "localone:///auth-callback?code=abc",
    "localone://auth-callback?code=abc",
    "localone://auth-callback",
    "localone:///auth-callback#code=abc",
    "/auth-callback?code=abc",
  ])("running app keeps the current screen for %s", (path) => {
    expect(authCallbackSystemPath({ path, initial: false })).toBeNull();
  });

  test("cold start from the callback opens home", () => {
    expect(authCallbackSystemPath({ path: "localone:///auth-callback?code=abc", initial: true })).toBe("/");
  });

  test.each(["localone:///books/9788936434120", "/libraries/30", "localone:///auth-callbackx", "/login"])(
    "other paths pass through unchanged: %s",
    (path) => {
      expect(authCallbackSystemPath({ path, initial: false })).toBe(path);
      expect(authCallbackSystemPath({ path, initial: true })).toBe(path);
    }
  );

  test("+native-intent delegates to the platform helper", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const intent = require("../../../app/+native-intent") as typeof import("../../../app/+native-intent");
    expect(intent.redirectSystemPath({ path: "localone:///auth-callback?code=x", initial: false })).toBeNull();
    expect(intent.redirectSystemPath({ path: "/libraries/30", initial: false })).toBe("/libraries/30");
  });
});
