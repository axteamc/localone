// VISIT-1 홈 큐브 파사드 시험 (2026-11-18 "홈 큐브 배치"): 주인공·가장자리 걸침·기점 전체 보기·꾹 누르기 설정·큐브 눌러 방문 페이지.
// 자리 계산(칸 나누기·기점·걸침·전체 보기·끌기)은 direction.test.ts가 순수 함수로 본다.
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";
import { theme } from "../../../theme";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 홈 시험은 파사드 동작만 본다. 하단 창(VISIT-1b)은 home-sheet·home-news 시험이 따로 본다.
jest.mock("../HomeSheet", () => ({
  HomeSheet: (p: { above?: unknown }) => p.above ?? null,
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(),
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    getHeroRule: jest.fn(),
    setHeroRule: jest.fn(),
    getRecentVisitedLibraryId: jest.fn(),
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
  getHeroRule: jest.Mock<typeof api.getHeroRule>;
  setHeroRule: jest.Mock<typeof api.setHeroRule>;
  getRecentVisitedLibraryId: jest.Mock<typeof api.getRecentVisitedLibraryId>;
};

const nearby = (items: api.LibrarySummary[]): api.LibraryListResponse => ({
  mode: "nearby",
  radius_km: 3,
  dtl_region: null,
  q: null,
  items,
});

const role = (id: string) => screen.getByTestId(id).props.accessibilityHint as string;

beforeEach(() => {
  jest.clearAllMocks();
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.getHeroRule.mockResolvedValue("nearest");
  m.setHeroRule.mockResolvedValue(undefined);
  m.getRecentVisitedLibraryId.mockResolvedValue(102);
});

// 가짜 #10: 정독(101, 기준 위치, 420m) · 종로(102, 남서 1.3km, 오늘 휴관) · 남산(103, 남쪽 2.9km)
describe("VISIT-1 home cubes", () => {
  test("the nearest library is the hero and every cube carries name, distance, bearing and today", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독도서관/);
    expect(screen.getByLabelText("정독도서관 420m")).toBeTruthy();
    // 나머지는 가장자리에 걸친 작은 큐브
    expect(role("facade-cube-102")).toBe("peek");
    expect(role("facade-cube-103")).toBe("peek");
    expect(screen.getByText("1.3km")).toBeTruthy();
    expect(screen.getByText("오늘 휴관")).toBeTruthy();
    expect(screen.getByText("CLOSED")).toBeTruthy();
    expect(screen.getAllByText(/^(N|NE|E|SE|S|SW|W|NW) \d{3}°$/).length).toBe(3);
    expect(screen.getByTestId("facade-grid")).toBeTruthy();
  });

  test("origin says current location and radius, and there is no separate axis or ruler", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.getByText("현위치")).toBeTruthy();
    expect(screen.getByText("3KM")).toBeTruthy();
    expect(screen.queryByTestId("facade-ruler")).toBeNull();
    expect(screen.queryByTestId("facade-axis")).toBeNull();
  });

  test("libraries without coords get no cube", async () => {
    const noCoords: api.LibrarySummary = { ...actual.FAKE_LIBRARIES[0]!, id: 104, name: "좌표없는도서관", latitude: null, longitude: null };
    m.fetchLibrariesNearby.mockResolvedValue(nearby([...actual.FAKE_LIBRARIES, noCoords]));
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.queryByText("좌표없는도서관")).toBeNull();
  });

  test("results with no coordinates at all show a notice instead of a blank facade (③-3)", async () => {
    const noCoords = (id: number, name: string): api.LibrarySummary => ({
      ...actual.FAKE_LIBRARIES[0]!, id, name, latitude: null, longitude: null,
    });
    m.fetchLibrariesNearby.mockResolvedValue(nearby([noCoords(104, "좌표없는도서관"), noCoords(105, "또없는도서관")]));
    await render(<HomeScreen />);
    expect(await screen.findByText("이 지역 도서관은 위치 정보가 없어 여기에 놓지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("좌표없는도서관")).toBeNull();
  });

  test("find button uses matte primary plate instead of yellow fill (2026-11-18 주 버튼 색 B)", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(StyleSheet.flatten(screen.getByTestId("home-find-library").props.style).backgroundColor).toBe(theme.colors.panelLit);
    expect(StyleSheet.flatten(screen.getByText("도서관 찾기").props.style).color).toBe(theme.colors.inkStrong);
  });

  test("distance falls back to straight-line when the server gives none", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(nearby([{ ...actual.FAKE_LIBRARIES[0]!, distance_m: null }]));
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/0m/);
  });

  test("hero press opens visit page without preview", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("정독도서관 420m"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/libraries/[libraryId]", params: { libraryId: "101", distanceM: "420" } });
  });

  test("an edge cube becomes the hero without leaving the page, then opens on press", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("종로도서관 크게 보기"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/종로도서관/);
    expect(role("facade-cube-101")).toBe("peek");
    await fireEvent.press(screen.getByLabelText("종로도서관 1.3km"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/libraries/[libraryId]", params: { libraryId: "102", distanceM: "1310" } });
  });

  test("hero press omits distanceM when distance is null or invalid", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(
      nearby([
        { ...actual.FAKE_LIBRARIES[0]!, id: 201, distance_m: null },
        { ...actual.FAKE_LIBRARIES[1]!, id: 202, distance_m: 12.5 },
        { ...actual.FAKE_LIBRARIES[2]!, id: 203, distance_m: -1 },
      ])
    );
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText(/^정독도서관 \d/));
    await fireEvent.press(screen.getByLabelText("종로도서관 크게 보기"));
    await fireEvent.press(screen.getByLabelText(/^종로도서관 \d/));
    await fireEvent.press(screen.getByLabelText("남산도서관 크게 보기"));
    await fireEvent.press(screen.getByLabelText(/^남산도서관 \d/));
    expect(mockPush).toHaveBeenNthCalledWith(1, { pathname: "/libraries/[libraryId]", params: { libraryId: "201" } });
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: "/libraries/[libraryId]", params: { libraryId: "202" } });
    expect(mockPush).toHaveBeenNthCalledWith(3, { pathname: "/libraries/[libraryId]", params: { libraryId: "203" } });
  });

  test("origin press shows every library as same-size cubes, a cube press focuses it, origin again restores", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("주변 도서관 전체 보기"));
    expect(screen.queryByTestId("facade-hero")).toBeNull();
    for (const id of [101, 102, 103]) expect(role(`facade-cube-${id}`)).toBe("ring");
    // 기점 다시 → 원래 주인공
    await fireEvent.press(screen.getByLabelText("원래 도서관 크게 보기"));
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독도서관/);
    // 전체 보기에서 큐브 누르기 → 그 도서관이 주인공
    await fireEvent.press(screen.getByLabelText("주변 도서관 전체 보기"));
    await fireEvent.press(screen.getByLabelText("남산도서관 크게 보기"));
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/남산도서관/);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("long press on the hero opens the first-hero setting and saves it on the device", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent(screen.getByLabelText("정독도서관 420m"), "longPress");
    expect(screen.getByTestId("facade-hero-menu")).toBeTruthy();
    expect(screen.getByText("홈을 열면 처음 크게 보일 도서관")).toBeTruthy();
    await fireEvent.press(screen.getByText("최근 방문한 곳"));
    expect(m.setHeroRule).toHaveBeenCalledWith("recent");
    expect(screen.queryByTestId("facade-hero-menu")).toBeNull();
    // 최근 방문(102 종로)이 주인공
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/종로도서관/);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a saved recent-visit setting makes that library the first hero", async () => {
    m.getHeroRule.mockResolvedValue("recent");
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await waitFor(() => expect(screen.getByTestId("facade-hero")).toHaveTextContent(/종로도서관/));
  });

  test("recent-visit setting falls back to the nearest when that library is not on the board", async () => {
    m.getHeroRule.mockResolvedValue("recent");
    m.getRecentVisitedLibraryId.mockResolvedValue(999);
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await act(async () => {});
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독도서관/);
  });
});
