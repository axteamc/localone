import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import SettingsScreen from "../../../app/settings";
import { AuthStatus, useAccountActions, useAuth, WithdrawResult } from "../AuthProvider";
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
  const withdrawMock = jest.fn<() => Promise<WithdrawResult>>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseActions.mockReturnValue({ signOut: signOutMock, withdrawAccount: withdrawMock });
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
    await fireEvent.press(screen.getByLabelText("로그아웃하는 중"));
    await fireEvent.press(screen.getByText("회원 탈퇴")); // 로그아웃 중에는 탈퇴도 막힘
    expect(screen.queryByTestId("withdraw-confirm")).toBeNull();
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

  test("settings_withdraw_confirm_flow", async () => {
    authAs("signedIn");
    const screen = await render(<SettingsScreen />);
    expect(screen.queryByTestId("withdraw-confirm")).toBeNull();

    // 취소: 호출 0, 칸 닫힘
    await fireEvent.press(screen.getByText("회원 탈퇴"));
    expect(screen.getByText("정말 탈퇴할까요?")).toBeTruthy();
    expect(
      screen.getByText(
        "빌릴 예정, 좋아요, 북마크가 지워지고 내가 올린 글은 더 이상 보이지 않아요. 같은 계정으로 다시 가입할 수 없고 되돌릴 수 없어요."
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("취소"));
    expect(screen.queryByTestId("withdraw-confirm")).toBeNull();
    expect(withdrawMock).not.toHaveBeenCalled();

    // 실패: 문구, 로그인 유지(이동 없음), 다시 시도 가능
    withdrawMock.mockResolvedValueOnce({ ok: false, errorMessage: "서버에 연결하지 못했어요." });
    await fireEvent.press(screen.getByText("회원 탈퇴"));
    await act(async () => {
      fireEvent.press(screen.getByText("탈퇴하기"));
    });
    expect(screen.getByText("서버에 연결하지 못했어요.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    // 성공: 진행 중 표시·연타 막힘 → 홈
    let finish!: (r: WithdrawResult) => void;
    withdrawMock.mockReturnValueOnce(
      new Promise<WithdrawResult>((resolve) => {
        finish = resolve;
      })
    );
    await act(async () => {
      fireEvent.press(screen.getByText("탈퇴하기"));
    });
    expect(screen.getByLabelText("탈퇴하는 중")).toBeTruthy();
    expect(screen.queryByText("서버에 연결하지 못했어요.")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("탈퇴하는 중"));
    });
    expect(withdrawMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish({ ok: true });
    });
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(signOutMock).not.toHaveBeenCalled(); // 로그아웃은 withdrawAccount 안에서
  });
});
