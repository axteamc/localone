// 실기기 개선 P4(C-90): 알림 두 줄(반납 알림·모임 안내)과 "처음 크게 보일 도서관" 다음 화면
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import FirstLibrarySettingScreen from "../../../../app/settings-first-library";
import * as heroPref from "../../library-visit/heroPref";
import * as reminders from "../../loan-assistant/reminders";
import * as pref from "../../loan-assistant/reminderPref";
import * as myApi from "../../my-collection/api";
import { NOTIFY_TEXT, NotificationSettings } from "../NotificationSettings";
import { SearchRadiusSetting } from "../SearchRadiusSetting";
import * as radius from "../../../lib/searchRadius";

const mockBack = jest.fn();
jest.mock("expo-router", () => {
  const R = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ back: mockBack, canGoBack: () => true }),
    useFocusEffect: (fn: () => void | (() => void)) => R.useEffect(fn, [fn]),
  };
});
jest.mock("../../../lib/searchRadius", () => ({ getSearchRadius: jest.fn(async () => 3), setSearchRadius: jest.fn(async () => undefined) }));
jest.mock("../../loan-assistant/notifications.platform", () => ({ NOTIFICATIONS_SUPPORTED: true }));
jest.mock("../../loan-assistant/reminders", () => ({ clearLoanReminders: jest.fn(async () => undefined) }));
jest.mock("../../loan-assistant/reminderPref", () => ({
  getLoanRemindersEnabled: jest.fn(async () => true),
  setLoanRemindersEnabled: jest.fn(async () => undefined),
}));
jest.mock("../../my-collection/api", () => ({ fetchMySettings: jest.fn(), updateMySettings: jest.fn() }));
jest.mock("../../library-visit/heroPref", () => ({ getHeroRule: jest.fn(), setHeroRule: jest.fn(async () => undefined) }));

const fetchMySettings = jest.mocked(myApi.fetchMySettings);
const updateMySettings = jest.mocked(myApi.updateMySettings);
const setLoan = jest.mocked(pref.setLoanRemindersEnabled);
const clearLoan = jest.mocked(reminders.clearLoanReminders);
const getHeroRule = jest.mocked(heroPref.getHeroRule);
const setHeroRule = jest.mocked(heroPref.setHeroRule);
const setSearchRadius = jest.mocked(radius.setSearchRadius);

beforeEach(() => {
  jest.clearAllMocks();
  fetchMySettings.mockResolvedValue({ club_notices: true });
  getHeroRule.mockResolvedValue("nearest");
});

describe("NotificationSettings", () => {
  test("turning loan reminders off saves on the device and clears scheduled loan reminders at once", async () => {
    await render(<NotificationSettings />);
    const sw = screen.getByTestId("switch-loan-reminders");
    await waitFor(() => expect(sw.props.value).toBe(true));
    await act(async () => fireEvent(sw, "valueChange", false));
    expect(setLoan).toHaveBeenCalledWith(false);
    expect(clearLoan).toHaveBeenCalledTimes(1);
  });

  test("club notices toggle calls #71 and reverts with a message on failure", async () => {
    updateMySettings.mockResolvedValueOnce({ club_notices: false });
    await render(<NotificationSettings />);
    const sw = screen.getByTestId("switch-club-notices");
    await waitFor(() => expect(sw.props.value).toBe(true));
    await act(async () => fireEvent(sw, "valueChange", false));
    expect(updateMySettings).toHaveBeenLastCalledWith({ club_notices: false });
    expect(screen.getByTestId("switch-club-notices").props.value).toBe(false);

    updateMySettings.mockRejectedValueOnce(new Error("network"));
    await act(async () => fireEvent(screen.getByTestId("switch-club-notices"), "valueChange", true));
    expect(screen.getByTestId("switch-club-notices").props.value).toBe(false); // 되돌림
    expect(screen.getByText(NOTIFY_TEXT.failed)).toBeTruthy();
  });

  test("club switch stays disabled when settings cannot be read", async () => {
    fetchMySettings.mockRejectedValueOnce(new Error("x"));
    await render(<NotificationSettings />);
    await act(async () => undefined);
    expect(screen.getByTestId("switch-club-notices").props.disabled).toBe(true);
  });
});

describe("settings → 처음 크게 보일 도서관", () => {
  test("shows current choice, saving another goes back; same choice only goes back", async () => {
    await render(<FirstLibrarySettingScreen />);
    await waitFor(() => expect(screen.getByTestId("first-library-nearest").props.accessibilityState.checked).toBe(true));
    await fireEvent.press(screen.getByTestId("first-library-recent"));
    expect(setHeroRule).toHaveBeenCalledWith("recent");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("same choice does not save again", async () => {
    await render(<FirstLibrarySettingScreen />);
    await waitFor(() => expect(screen.getByTestId("first-library-nearest").props.accessibilityState.checked).toBe(true));
    await fireEvent.press(screen.getByTestId("first-library-nearest"));
    expect(setHeroRule).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe("SearchRadiusSetting (C-96)", () => {
  test("shows 2·3·5km with the saved one selected and saves a new choice on the device", async () => {
    await render(<SearchRadiusSetting />);
    await waitFor(() => expect(screen.getByTestId("settings-radius-3").props.accessibilityState.selected).toBe(true));
    expect(screen.getByText("2km")).toBeTruthy();
    expect(screen.getByText("5km")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("settings-radius-2"));
    expect(setSearchRadius).toHaveBeenCalledWith(2);
    expect(screen.getByTestId("settings-radius-2").props.accessibilityState.selected).toBe(true);
  });
});
