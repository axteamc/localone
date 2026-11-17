// VISIT-1 시안 C 홈 파사드 시험 (총정리 §2·§3): 방위 블록·"+N곳 전환"·개수별 배치·블록 눌러 방문 페이지
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import * as api from "../deps";
import { quadLayout } from "../FacadeHome";
import { HomeScreen } from "../HomeScreen";
import { snapOffsets } from "../useHomeSheet";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 홈 시험은 파사드 블록 동작만 본다. 하단 창(VISIT-1b)은 home-sheet·home-news 시험이 따로 본다.
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
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
};

const nearby = (items: api.LibrarySummary[]): api.LibraryListResponse => ({
  mode: "nearby",
  radius_km: 3,
  dtl_region: null,
  q: null,
  items,
});

beforeEach(() => {
  jest.clearAllMocks();
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
});

describe("VISIT-1 home facade", () => {
  test("blocks carry name, distance, compass code and closed band", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("facade-grid")).toBeTruthy();
    expect(screen.getByTestId("facade-ruler")).toBeTruthy();
    expect(screen.getByTestId("facade-origin")).toBeTruthy();
    expect(screen.getByText("420m")).toBeTruthy();
    // 종로도서관은 오늘 휴관이 확실하다
    expect(screen.getByText("종로도서관")).toBeTruthy();
    expect(screen.getByText("1.3km")).toBeTruthy();
    expect(screen.getByText("오늘 휴관")).toBeTruthy();
    // 방위 코드 "SW 2xx°" 형태
    expect(screen.getAllByText(/^(N|NE|E|SE|S|SW|W|NW) \d{3}°$/).length).toBeGreaterThanOrEqual(2);
  });

  test("origin plinth says current location and radius", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.getByText("현위치")).toBeTruthy();
    expect(screen.getByText("3KM")).toBeTruthy();
    expect(screen.getByText("W 1.5km")).toBeTruthy();
    expect(screen.getByText("E 1.5km")).toBeTruthy();
  });

  test("libraries without coords get no block", async () => {
    const noCoords: api.LibrarySummary = {
      ...actual.FAKE_LIBRARIES[0]!,
      id: 104,
      name: "좌표없는도서관",
      latitude: null,
      longitude: null,
    };
    m.fetchLibrariesNearby.mockResolvedValue(nearby([...actual.FAKE_LIBRARIES, noCoords]));
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.queryByText("좌표없는도서관")).toBeNull();
  });

  test("distance falls back to straight-line when the server gives none", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(nearby([{ ...actual.FAKE_LIBRARIES[0]!, distance_m: null }]));
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    // 한 곳뿐이면 와이드 한 블록(MAIN). 기준 위치와 같은 좌표라 0m
    expect(screen.getByTestId("facade-block-MAIN")).toBeTruthy();
    expect(screen.getByText("0m")).toBeTruthy();
  });

  test("two libraries sit west and east by longitude", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(nearby([actual.FAKE_LIBRARIES[0]!, actual.FAKE_LIBRARIES[1]!]));
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("facade-block-W")).toHaveTextContent(/종로도서관/);
    expect(screen.getByTestId("facade-block-E")).toHaveTextContent(/정독도서관/);
  });

  test("same-direction libraries stack and the +N pill cycles without leaving the page", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    // 종로(1.3km)와 남산(2.9km)은 같은 남서 방향 → 가까운 종로가 대표
    expect(screen.getByText("종로도서관")).toBeTruthy();
    expect(screen.queryByText("남산도서관")).toBeNull();
    await fireEvent.press(screen.getByLabelText("같은 방향 도서관 1곳 더 보기"));
    expect(screen.getByText("남산도서관")).toBeTruthy();
    expect(screen.queryByText("종로도서관")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    // 한 바퀴 돌면 처음으로
    await fireEvent.press(screen.getByLabelText("같은 방향 도서관 1곳 더 보기"));
    expect(screen.getByText("종로도서관")).toBeTruthy();
  });

  test("block press opens visit page without preview", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("종로도서관 1.3km"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    // V5: 그 도서관의 distance_m(1310)을 distanceM으로 같이 넘긴다
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/libraries/[libraryId]",
      params: { libraryId: "102", distanceM: "1310" },
    });
  });

  test("block press omits distanceM when distance is null or invalid", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(
      nearby([
        { ...actual.FAKE_LIBRARIES[0]!, id: 201, distance_m: null },
        { ...actual.FAKE_LIBRARIES[1]!, id: 202, distance_m: 12.5 },
        { ...actual.FAKE_LIBRARIES[2]!, id: 203, distance_m: -1 },
      ])
    );
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText(/^정독도서관 /));
    await fireEvent.press(screen.getByLabelText(/^종로도서관 /));
    // 남산(203)은 종로(202)와 같은 방향이라 한 번 넘겨야 보인다. 거리가 음수(-1)면 직선거리로 보이되 distanceM은 뺀다
    await fireEvent.press(screen.getByLabelText("같은 방향 도서관 1곳 더 보기"));
    await fireEvent.press(screen.getByLabelText(/^남산도서관 /));
    expect(mockPush).toHaveBeenNthCalledWith(1, { pathname: "/libraries/[libraryId]", params: { libraryId: "201" } });
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: "/libraries/[libraryId]", params: { libraryId: "202" } });
    expect(mockPush).toHaveBeenNthCalledWith(3, { pathname: "/libraries/[libraryId]", params: { libraryId: "203" } });
  });

  // ③-2: 파사드와 하단 창은 같은 영역. 처음 열린 홈(half)에서 남쪽 블록도 창 위쪽 끝 위에 있어야 보이고 눌린다.
  // 판 높이 650·450은 웹 390×844·375×667에서 잰 값(PR 141 사후 검토 §4.7)
  test.each([650, 450, 400])("south blocks stay above the half sheet (board %ipx)", async (boardH) => {
    // 기준점(37.5815, 126.9831) 둘레 네 방향에 한 곳씩 → 네 칸 배치
    const base = actual.FAKE_LIBRARIES[0]!;
    const at = (id: number, name: string, dLat: number, dLng: number): api.LibrarySummary => ({
      ...base,
      id,
      name,
      latitude: 37.5815 + dLat,
      longitude: 126.9831 + dLng,
    });
    m.fetchLibrariesNearby.mockResolvedValue(
      nearby([
        at(301, "북서도서관", 0.005, -0.006),
        at(302, "북동도서관", 0.006, 0.005),
        at(303, "남서도서관", -0.005, -0.006),
        at(304, "남동도서관", -0.006, 0.005),
      ])
    );
    await render(<HomeScreen />);
    await screen.findByText("남서도서관");
    await fireEvent(screen.getByTestId("facade-board"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: boardH } },
    });
    const half = snapOffsets(boardH).half;
    const box = (slot: string) => {
      const st = StyleSheet.flatten(screen.getByTestId(`facade-block-${slot}`).props.style);
      return { top: st.top as number, bottom: (st.top as number) + (st.height as number) };
    };
    expect(screen.getByTestId("facade-block-SW")).toHaveTextContent(/남서도서관/);
    expect(screen.getByTestId("facade-block-SE")).toHaveTextContent(/남동도서관/);
    for (const slot of ["SW", "SE"]) {
      expect(typeof box(slot).top).toBe("number");
      expect(box(slot).bottom).toBeLessThanOrEqual(half);
    }
    // 북쪽 블록과 같은 줄에서 겹치지 않는다
    expect(box("NW").bottom).toBeLessThan(box("SW").top);
    expect(box("NE").bottom).toBeLessThan(box("SE").top);
  });

  test("quad layout keeps full blocks on tall boards and shrinks them on short ones", () => {
    const tall = quadLayout(650);
    expect(tall.blockH).toBe(104);
    expect(tall.top.SE + tall.blockH).toBeLessThanOrEqual(snapOffsets(650).half);
    const short = quadLayout(450);
    expect(short.blockH).toBeLessThan(104);
    expect(short.top.SE + short.blockH).toBeLessThanOrEqual(snapOffsets(450).half);
    expect(short.top.NE + short.blockH).toBeLessThan(short.originY);
    expect(short.originY).toBeLessThan(short.top.SW);
  });
});
