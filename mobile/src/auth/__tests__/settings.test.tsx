import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import SettingsScreen from "../../../app/settings";
import { actionColors, theme } from "../../theme";
import { AuthStatus, useAccountActions, useAuth, WithdrawResult } from "../AuthProvider";
import { SignInResult } from "../platform";

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
    // 화면에 올 때 한 번 실행(시험에는 내비게이션이 없다)
    useFocusEffect: (fn: () => void | (() => void)) => React.useEffect(fn, [fn]),
  };
});
jest.mock("../../features/library-visit/heroPref", () => ({ getHeroRule: jest.fn(async () => "recent") }));
// 알림 두 줄은 NotificationSettings 시험에서 따로 본다(여기서는 자리만)
jest.mock("../../features/settings/NotificationSettings", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return { NotificationSettings: () => <Text>알림 설정 자리</Text> };
});

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

  test("guest can clear only the rough start and retry after storage failure", async () => {
    authAs("signedOut");
    const key = "localone:rough_start:v1";
    await AsyncStorage.setItem(key, "old");
    await AsyncStorage.setItem("other", "keep");
    const screen = await render(<SettingsScreen />);
    jest.spyOn(AsyncStorage, "removeItem").mockRejectedValueOnce(new Error("storage"));
    const clear = screen.getByText("대략적인 위치 지우기");
    await fireEvent.press(clear);
    expect(await screen.findByText("위치를 지우지 못했어요. 다시 시도해 주세요.")).toBeTruthy();
    expect(await AsyncStorage.getItem(key)).toBe("old");
    await fireEvent.press(clear);
    expect(await screen.findByText("대략적인 위치를 지웠어요.")).toBeTruthy();
    expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(await AsyncStorage.getItem("other")).toBe("keep");
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

  test("settings_grouped_list_account_screen_notify (C-90, 시안 #el-settings A)", async () => {
    authAs("signedIn");
    const ACT = actionColors(theme.colors);
    const screen = await render(<SettingsScreen />);
    for (const title of ["계정", "화면", "알림"]) expect(screen.getByText(title)).toBeTruthy();
    // 화면: 처음 크게 보일 도서관 = 지금 값 + › → 다음 화면
    expect(await screen.findByText("최근 방문한 곳 ›")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("settings-first-library"));
    expect(mockPush).toHaveBeenCalledWith("/settings-first-library");
    // 다크 모드는 자리만(준비 중)
    expect(screen.getByTestId("settings-dark-mode")).toBeTruthy();
    expect(screen.getByText("준비 중")).toBeTruthy();
    expect(screen.getByText("알림 설정 자리")).toBeTruthy();

    // 계정 줄은 목록 줄(채운 주 버튼 아님). 탈퇴 확인 칸: 곡률 9 + panelLit, 탈퇴하기만 주 버튼
    const signOutRow = screen.getByRole("button", { name: "로그아웃" });
    expect(JSON.stringify(signOutRow.props.style)).not.toContain(ACT.primary.backgroundColor);
    await fireEvent.press(screen.getByText("회원 탈퇴"));
    const confirmBox = screen.getByTestId("withdraw-confirm");
    expect(confirmBox.props.style).toEqual(
      expect.objectContaining({ borderRadius: theme.radii.infoCard, backgroundColor: theme.colors.panelLit })
    );
    const withdrawBtn = screen.getByRole("button", { name: "탈퇴하기" });
    expect(withdrawBtn.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: ACT.primary.backgroundColor })])
    );
  });
});
