// 방문 페이지 ⋯ 메뉴: 홈 처음 주인공 설정은 2026-11-25 설정 화면으로 옮겼다(C-89). 여기는 빠졌는지만 본다
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

beforeEach(() => {
  jest.clearAllMocks();
  getDefaultLibrary.mockResolvedValue(null);
  getHeroRule.mockResolvedValue("nearest");
  setHeroRule.mockResolvedValue(undefined);
});

describe("VISIT-2 menu after C-89: home first-hero setting moved to settings", () => {
  test("menu has only open-here-first and homepage, no first-hero group", async () => {
    await render(<VisitMenu library={{ ...LIB, homepage: "https://lib.example.org" }} onNotice={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
    await screen.findByTestId("visit-menu-card");
    await waitFor(() => expect(screen.getByText(MENU_TEXT.turnOn)).toBeTruthy());
    expect(screen.getByText(MENU_TEXT.homepage)).toBeTruthy();
    expect(screen.queryByText("홈을 열면 처음 크게 보일 도서관")).toBeNull();
    expect(screen.queryByTestId("visit-menu-hero-recent")).toBeNull();
    expect(getHeroRule).not.toHaveBeenCalled();
    expect(setHeroRule).not.toHaveBeenCalled();
  });
});
