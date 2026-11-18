import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import SettingsScreen from "../../../app/settings";
import { AuthStatus, useAccountActions, useAuth } from "../AuthProvider";
import { SignInResult } from "../platform";

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
}));

jest.mock("../AuthProvider", () => ({
  useAuth: jest.fn(),
  useAccountActions: jest.fn(),
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseActions = jest.mocked(useAccountActions);

function authAs(status: AuthStatus) {
  mockedUseAuth.mockReturnValue({
    status,
    userId: status === "signedIn" ? "00000000-0000-4000-8000-00000000000a" : null,
    signInWithGoogle: jest.fn<() => Promise<SignInResult>>(),
    signInWithApple: jest.fn<() => Promise<SignInResult>>(),
  });
}

describe("SettingsScreen (AUTH-2-P2)", () => {
  const signOutMock = jest.fn<() => Promise<void>>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseActions.mockReturnValue({ signOut: signOutMock });
  });

  test("settings_logout_flow", async () => {
    authAs("signedIn");
    let finish!: () => void;
    signOutMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText("로그아웃"));
    // 진행 중: 진행 표시, 버튼 글자 사라짐, 다시 눌러도 한 번
    expect(screen.getByLabelText("로그아웃하는 중")).toBeTruthy();
    expect(screen.queryByText("로그아웃")).toBeNull();
    await fireEvent.press(screen.getByRole("button"));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      finish();
    });
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test("settings_signed_out_shows_login", async () => {
    authAs("signedOut");
    const screen = await render(<SettingsScreen />);
    expect(screen.getByText("로그인하면 설정을 볼 수 있어요")).toBeTruthy();
    expect(screen.queryByText("로그아웃")).toBeNull();
    await fireEvent.press(screen.getByText("로그인"));
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
