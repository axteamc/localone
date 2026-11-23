import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import LoginScreen from "../../../app/login";
import { useAuth } from "../AuthProvider";
import { isAppleSignInAvailable, SignInResult } from "../platform";

const mockReplace = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("expo-apple-authentication", () => {
  const ReactLib = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) =>
      ReactLib.createElement(
        Pressable,
        { accessibilityRole: "button", onPress, testID: "apple-btn" },
        ReactLib.createElement(Text, null, "Apple로 계속하기")
      ),
  };
});

jest.mock("../AuthProvider", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../platform", () => ({
  isAppleSignInAvailable: jest.fn(),
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedIsAppleAvailable = jest.mocked(isAppleSignInAvailable);

describe("LoginScreen (AUTH-1-P6)", () => {
  const signInWithGoogleMock = jest.fn<() => Promise<SignInResult>>();
  const signInWithAppleMock = jest.fn<() => Promise<SignInResult>>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockedIsAppleAvailable.mockResolvedValue(false);
    mockedUseAuth.mockReturnValue({
      status: "signedOut",
      userId: null,
      signInWithGoogle: signInWithGoogleMock,
      signInWithApple: signInWithAppleMock,
    });
  });

  test("login_button_double_tap_calls_once", async () => {
    let resolveLogin!: (value: SignInResult) => void;
    signInWithGoogleMock.mockReturnValueOnce(
      new Promise<SignInResult>((resolve) => {
        resolveLogin = resolve;
      })
    );

    const screen = await render(<LoginScreen />);
    const googleButton = screen.getByText("Google로 계속하기");

    await fireEvent.press(googleButton);
    await fireEvent.press(googleButton);

    expect(signInWithGoogleMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("로그인하는 중")).toBeTruthy();

    await act(async () => {
      resolveLogin({ ok: false, reason: "cancelled" });
    });
  });

  test("login_cancel_shows_no_error", async () => {
    signInWithGoogleMock.mockResolvedValueOnce({
      ok: false,
      reason: "cancelled",
    });

    const screen = await render(<LoginScreen />);
    const googleButton = screen.getByText("Google로 계속하기");

    await act(async () => {
      await fireEvent.press(googleButton);
    });

    expect(
      screen.queryByText("로그인하지 못했어요. 다시 시도해 주세요.")
    ).toBeNull();
    expect(screen.queryByText("서버에 연결하지 못했어요.")).toBeNull();

    // 취소 뒤 다시 누를 수 있음
    signInWithGoogleMock.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await fireEvent.press(googleButton);
    });
    expect(signInWithGoogleMock).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  test("login_failure_shows_copy", async () => {
    signInWithGoogleMock.mockResolvedValueOnce({
      ok: false,
      reason: "failed",
    });

    const screen = await render(<LoginScreen />);
    const googleButton = screen.getByText("Google로 계속하기");

    await act(async () => {
      await fireEvent.press(googleButton);
    });
    expect(
      screen.getByText("로그인하지 못했어요. 다시 시도해 주세요.")
    ).toBeTruthy();

    signInWithGoogleMock.mockResolvedValueOnce({
      ok: false,
      reason: "network",
    });
    await act(async () => {
      await fireEvent.press(googleButton);
    });
    expect(screen.getByText("서버에 연결하지 못했어요.")).toBeTruthy();
  });

  test("apple_button_hidden_when_unavailable", async () => {
    mockedIsAppleAvailable.mockResolvedValueOnce(false);
    const screen = await render(<LoginScreen />);

    await waitFor(() => {
      expect(screen.getByText("Google로 계속하기")).toBeTruthy();
    });
    expect(screen.queryByTestId("apple-btn")).toBeNull();
  });

  test("signed_in_status_goes_home_once (DEF-019)", async () => {
    // 웹: 제공자에서 /login으로 돌아온 뒤 AuthProvider가 signedIn이 되면 스모크 화면으로 간다.
    const signedIn = {
      status: "signedIn" as const,
      userId: "00000000-0000-4000-8000-00000000000a",
      signInWithGoogle: signInWithGoogleMock,
      signInWithApple: signInWithAppleMock,
    };
    mockedUseAuth.mockReturnValue(signedIn);
    const screen = await render(<LoginScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));

    await screen.rerender(<LoginScreen />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test("returnTo_navigates_back_to_safe_internal_path_only", async () => {
    mockParams = { returnTo: "/clubs/club-1" };
    signInWithGoogleMock.mockResolvedValueOnce({ ok: true });
    const view1 = await render(<LoginScreen />);
    await act(async () => {
      await fireEvent.press(view1.getByText("Google로 계속하기"));
    });
    expect(mockReplace).toHaveBeenCalledWith("/clubs/club-1");
    await view1.unmount();

    mockReplace.mockClear();
    mockParams = { returnTo: "//evil.example/phish" };
    signInWithGoogleMock.mockResolvedValueOnce({ ok: true });
    const view2 = await render(<LoginScreen />);
    await act(async () => {
      await fireEvent.press(view2.getByText("Google로 계속하기"));
    });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
