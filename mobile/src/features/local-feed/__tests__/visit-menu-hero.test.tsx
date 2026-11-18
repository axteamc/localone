// 방문 페이지 ⋯ 메뉴의 홈 처음 주인공 설정 (L6 2026-11-19 D 결정 "방문 ⋯에 같이 추가")
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import * as heroPref from "../../library-visit/heroPref";
import * as visits from "../../../lib/visits";
import { MENU_TEXT, VisitMenu } from "../VisitMenu";

jest.mock("../../../lib/platform", () => ({ openExternalUrl: jest.fn() }));
jest.mock("../../../lib/visits", () => ({ getDefaultLibrary: jest.fn(), setDefaultLibrary: jest.fn() }));
jest.mock("../../library-visit/heroPref", () => ({
  ...jest.requireActual<object>("../../library-visit/heroPref"),
  getHeroRule: jest.fn(),
  setHeroRule: jest.fn(),
}));

const getHeroRule = jest.mocked(heroPref.getHeroRule);
const setHeroRule = jest.mocked(heroPref.setHeroRule);
const getDefaultLibrary = jest.mocked(visits.getDefaultLibrary);

const LIB = { id: 103, name: "남산도서관", homepage: null };

async function openMenu(onNotice = jest.fn<(t: string) => void>()) {
  await render(<VisitMenu library={LIB} onNotice={onNotice} />);
  await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
  await screen.findByTestId("visit-menu-card");
  return onNotice;
}

beforeEach(() => {
  jest.clearAllMocks();
  getDefaultLibrary.mockResolvedValue(null);
  getHeroRule.mockResolvedValue("nearest");
  setHeroRule.mockResolvedValue(undefined);
});

describe("VISIT-2 menu: home first-hero setting (L6)", () => {
  test("shows the same title and two choices as the home long-press menu, nearest marked basic and selected", async () => {
    await openMenu();
    expect(screen.getByText("홈을 열면 처음 크게 보일 도서관")).toBeTruthy();
    expect(screen.getByText("가장 가까운 곳")).toBeTruthy();
    expect(screen.getByText("최근 방문한 곳")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("visit-menu-hero-nearest").props.accessibilityState).toEqual({ disabled: false, selected: true })
    );
    expect(screen.getByTestId("visit-menu-hero-recent").props.accessibilityState).toEqual({ disabled: false, selected: false });
    // 기본값 켜기 줄은 그대로 맨 위에 있다
    expect(screen.getByText(MENU_TEXT.turnOn)).toBeTruthy();
  });

  test("choosing recent saves to the shared device key, closes and shows a notice", async () => {
    const onNotice = await openMenu();
    await waitFor(() => expect(screen.getByTestId("visit-menu-hero-recent").props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByTestId("visit-menu-hero-recent"));
    expect(setHeroRule).toHaveBeenCalledWith("recent");
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("홈을 열면 최근 방문한 곳을 크게 보여 줘요"));
    expect(screen.queryByTestId("visit-menu-card")).toBeNull();
  });

  test("choosing the current setting again only closes the menu", async () => {
    getHeroRule.mockResolvedValue("recent");
    const onNotice = await openMenu();
    await waitFor(() => expect(screen.getByTestId("visit-menu-hero-recent").props.accessibilityState.selected).toBe(true));
    await fireEvent.press(screen.getByTestId("visit-menu-hero-recent"));
    expect(setHeroRule).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
    expect(screen.queryByTestId("visit-menu-card")).toBeNull();
  });
});
