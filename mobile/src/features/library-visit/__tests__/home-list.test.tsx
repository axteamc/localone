// VISIT-1-P1 필수 테스트 (계약서 library-visit.md VISIT-1 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";

// 시험 환경(node)에서만 쓰는 모듈 — 앱 tsconfig에 node 타입이 없어 여기서만 선언한다
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(d: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(f: string, enc: "utf8"): string;
};
const path = require("path") as { resolve(...p: string[]): string; join(...p: string[]): string };

const mockPush = jest.fn();
let mockMapFails = false;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 지도 홈 시험은 지도·목록 동작만 본다. 하단 창(VISIT-1b)은 home-sheet·home-news 시험이 따로 본다.
// 창 위쪽 끝에 붙는 안내·버튼(above)만 그대로 그린다
jest.mock("../HomeSheet", () => ({
  HomeSheet: (p: { above?: unknown }) => p.above ?? null,
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  const ReactLib = require("react");
  const { Text, View } = require("react-native");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(),
    fetchLibrariesInRegion: jest.fn(),
    fetchLibrary: jest.fn(),
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    requestLocationPermission: jest.fn(),
    // 지도 가짜: 받은 핀 이름을 글자로 그린다. mockMapFails면 바로 onError("no_key")
    KakaoMap: (props: { markers: { id: number; title: string }[]; onError(r: string): void }) => {
      ReactLib.useEffect(() => {
        if (mockMapFails) props.onError("no_key");
      }, []);
      return ReactLib.createElement(
        View,
        { testID: "kakao-map" },
        props.markers.map((m) => ReactLib.createElement(Text, { key: m.id }, m.title))
      );
    },
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  fetchLibrariesInRegion: jest.Mock<typeof api.fetchLibrariesInRegion>;
  fetchLibrary: jest.Mock<typeof api.fetchLibrary>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
  requestLocationPermission: jest.Mock<typeof api.requestLocationPermission>;
};

const nearby = (items: api.LibrarySummary[], radius: 3 | 5 = 3): api.LibraryListResponse => ({
  mode: "nearby",
  radius_km: radius,
  dtl_region: null,
  q: null,
  items,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMapFails = false;
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrary.mockImplementation(actual.fetchLibrary);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.fetchLibrariesInRegion.mockImplementation(actual.fetchLibrariesInRegion);
  m.requestLocationPermission.mockResolvedValue("granted");
});

describe("VISIT-1-P1 home list", () => {
  test("starts at current location and lists nearby", async () => {
    await render(<HomeScreen />);
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(screen.getByText("종로도서관")).toBeTruthy();
    expect(screen.getByText("남산도서관")).toBeTruthy();
    expect(m.fetchLibrariesNearby).toHaveBeenCalledTimes(1);
    expect(m.fetchLibrariesNearby).toHaveBeenCalledWith(37.5815, 126.9831, 3, expect.anything());
    expect(screen.queryByText("위치 허용하기")).toBeNull();
  });

  test("location denied opens start position with allow button", async () => {
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    await render(<HomeScreen />);
    expect(await screen.findByText("위치 허용하기")).toBeTruthy();
    expect(m.fetchLibrariesNearby).toHaveBeenCalledWith(
      api.DEFAULT_START.lat,
      api.DEFAULT_START.lng,
      3,
      expect.anything()
    );
    expect(screen.queryByText("현재 위치로")).toBeNull();
  });

  test("default library position is used when location denied", async () => {
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    m.getDefaultLibrary.mockResolvedValue(101);
    await render(<HomeScreen />);
    await waitFor(() => expect(m.fetchLibrariesNearby).toHaveBeenCalled());
    expect(m.fetchLibrary).toHaveBeenCalledWith(101);
    expect(m.fetchLibrariesNearby).toHaveBeenCalledWith(37.5815, 126.9831, 3, expect.anything());
  });

  test("allow location reloads at current position", async () => {
    m.locate.mockResolvedValueOnce({ ok: false, reason: "denied" });
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByText("위치 허용하기"));
    await waitFor(() =>
      expect(m.fetchLibrariesNearby).toHaveBeenLastCalledWith(37.5815, 126.9831, 3, expect.anything())
    );
    expect(m.requestLocationPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("위치 허용하기")).toBeNull());
  });

  test("map error switches to region list", async () => {
    mockMapFails = true;
    await render(<HomeScreen />);
    expect(await screen.findByText("정독도서관 · 화동 · 09:00~22:00")).toBeTruthy();
    expect(screen.getByText("종로도서관 · 사직동 · 휴관")).toBeTruthy();
    expect(screen.getByText("지도를 불러오지 못했어요")).toBeTruthy();
    expect(m.fetchLibrariesInRegion).toHaveBeenCalledWith("11010", expect.anything());
    expect(m.fetchLibrariesNearby).toHaveBeenCalledTimes(1);
    // 위쪽 검색창·"도서관 찾기"는 그대로
    expect(screen.getByText("책 제목·저자를 검색")).toBeTruthy();
    expect(screen.getByText("도서관 찾기")).toBeTruthy();
  });

  test("map error without location uses default start region and keeps allow button", async () => {
    mockMapFails = true;
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    m.fetchLibrariesNearby.mockResolvedValue(nearby([]));
    await render(<HomeScreen />);
    await waitFor(() => expect(m.fetchLibrariesInRegion).toHaveBeenCalledWith("11020", expect.anything()));
    expect(screen.getByText("지도를 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("위치 허용하기")).toBeTruthy();
  });

  test("list row press opens visit page", async () => {
    mockMapFails = true;
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByText("정독도서관 · 화동 · 09:00~22:00"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/libraries/[libraryId]", params: { libraryId: "101" } });
  });

  test("reload in list mode rebuilds map and returns to map home", async () => {
    mockMapFails = true;
    await render(<HomeScreen />);
    await screen.findByText("정독도서관 · 화동 · 09:00~22:00");
    mockMapFails = false;
    await fireEvent.press(screen.getByText("↻ 새로고침"));
    expect(await screen.findByTestId("kakao-map")).toBeTruthy();
    expect(screen.queryByText("지도를 불러오지 못했어요")).toBeNull();
  });

  test("search bar opens book search", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByTestId("home-search-bar"));
    expect(mockPush).toHaveBeenCalledWith("/search");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("지역이나 도서관 이름을 적어 주세요")).toBeNull();
    // 오른쪽 "도서관 찾기"는 터치 영역이 따로라 책 검색으로 가지 않는다
    await fireEvent.press(screen.getByTestId("home-find-library"));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("network error shows reload and retries", async () => {
    m.fetchLibrariesNearby
      .mockRejectedValueOnce(new actual.ApiCallError(0, "NETWORK", "Network request failed"))
      .mockImplementation(actual.fetchLibrariesNearby);
    await render(<HomeScreen />);
    expect(await screen.findByText("지금은 도서관을 불러올 수 없어요.")).toBeTruthy();
    expect(screen.queryByText("Network request failed")).toBeNull();
    await fireEvent.press(screen.getByText("↻ 새로고침"));
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(m.fetchLibrariesNearby).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("지금은 도서관을 불러올 수 없어요.")).toBeNull();
  });

  test("empty radius shows widen and uses 5km", async () => {
    m.fetchLibrariesNearby.mockImplementation(async (_a, _b, r) => nearby([], r ?? 3));
    await render(<HomeScreen />);
    expect(await screen.findByText("가까운 곳에서 도서관을 찾지 못했어요.")).toBeTruthy();
    await fireEvent.press(screen.getByText("더 넓게 찾기"));
    await waitFor(() =>
      expect(m.fetchLibrariesNearby).toHaveBeenLastCalledWith(37.5815, 126.9831, 5, expect.anything())
    );
    await waitFor(() => expect(screen.queryByText("더 넓게 찾기")).toBeNull());
    expect(screen.getByText("가까운 곳에서 도서관을 찾지 못했어요.")).toBeTruthy();
  });

  test("loading shows small pill", async () => {
    let resolve: (v: api.LibraryListResponse) => void = () => {};
    m.fetchLibrariesNearby.mockImplementation(() => new Promise((r) => (resolve = r)));
    await render(<HomeScreen />);
    expect(await screen.findByText("도서관을 찾는 중…")).toBeTruthy();
    resolve(nearby(actual.FAKE_LIBRARIES));
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(screen.queryByText("도서관을 찾는 중…")).toBeNull();
  });

  test("no hardcoded colors in library-visit", () => {
    const root = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(4);
    const hits = files.filter((f) => /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  test("works signed out", async () => {
    await render(<HomeScreen />);
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(screen.queryByText(/로그인/)).toBeNull();
  });
});
