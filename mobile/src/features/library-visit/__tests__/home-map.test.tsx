// VISIT-1-P2 필수 테스트 (계약서 library-visit.md VISIT-1 P5): 지도·핀·묶음
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";

const mockPush = jest.fn();
// 지도 가짜가 마지막으로 받은 값 (APP-0-P3 머지 전 "받은 markers를 시험에서 읽을 수 있게 그리는 목", 머리말 5칸)
let mockLastMapProps: api.KakaoMapProps | null = null;

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
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    KakaoMap: (props: api.KakaoMapProps) => {
      mockLastMapProps = props;
      return ReactLib.createElement(
        View,
        { testID: "kakao-map" },
        props.markers.map((mk: api.MapMarker) => ReactLib.createElement(Text, { key: mk.id }, mk.title))
      );
    },
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
};

function mapProps(): api.KakaoMapProps {
  if (!mockLastMapProps) throw new Error("지도가 그려지지 않음");
  return mockLastMapProps;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLastMapProps = null;
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
});

describe("VISIT-1-P2 home map", () => {
  test("markers carry name distance and closed tone", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    const markers = mapProps().markers;
    expect(markers).toHaveLength(3);
    expect(markers.find((x) => x.id === 101)).toEqual({
      id: 101,
      lat: 37.5815,
      lng: 126.9831,
      title: "정독도서관",
      subtitle: "420m",
      tone: "normal",
    });
    expect(markers.find((x) => x.id === 102)).toMatchObject({ title: "종로도서관", subtitle: "1.3km", tone: "closed" });
    // 휴관을 모르면(null) 평소 핀
    expect(markers.find((x) => x.id === 103)).toMatchObject({ title: "남산도서관", subtitle: "2.9km", tone: "normal" });
  });

  test("libraries without coords are not markers", async () => {
    const noCoords: api.LibrarySummary = {
      ...actual.FAKE_LIBRARIES[0]!,
      id: 104,
      name: "좌표없는도서관",
      latitude: null,
      longitude: null,
    };
    m.fetchLibrariesNearby.mockResolvedValue({
      mode: "nearby",
      radius_km: 3,
      dtl_region: null,
      q: null,
      items: [...actual.FAKE_LIBRARIES, noCoords],
    });
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    const ids = mapProps().markers.map((x) => x.id);
    expect(ids).toEqual([101, 102, 103]);
    expect(screen.queryByText("좌표없는도서관")).toBeNull();
  });

  test("distance is omitted when unknown", async () => {
    m.fetchLibrariesNearby.mockResolvedValue({
      mode: "nearby",
      radius_km: 3,
      dtl_region: null,
      q: null,
      items: [{ ...actual.FAKE_LIBRARIES[0]!, distance_m: null }],
    });
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(mapProps().markers[0]!.subtitle).toBeNull();
  });

  test("cluster is enabled", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    expect(mapProps().cluster).toBe(true);
  });

  test("cluster press zooms in at that spot", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    const before = mapProps().level!;
    const spot = { lat: 37.57, lng: 126.98 };
    await act(async () => mapProps().onClusterPress!(spot));
    expect(mapProps().center).toEqual(spot);
    expect(mapProps().level!).toBeLessThan(before);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("map centers on current location", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await waitFor(() => expect(mapProps().center).toEqual({ lat: 37.5815, lng: 126.9831 }));
  });

  test("marker press opens visit page without preview", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    const shownBefore = screen.toJSON();
    await act(async () => mapProps().onMarkerPress(102));
    expect(mockPush).toHaveBeenCalledTimes(1);
    // V5: 그 도서관의 distance_m(1310)을 distanceM으로 같이 넘긴다
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/libraries/[libraryId]",
      params: { libraryId: "102", distanceM: "1310" },
    });
    // 미리보기 창 없이 화면은 그대로
    expect(screen.toJSON()).toEqual(shownBefore);
  });

  test("marker press omits distanceM when distance is null or invalid", async () => {
    m.fetchLibrariesNearby.mockResolvedValue({
      mode: "nearby",
      radius_km: 3,
      dtl_region: null,
      q: null,
      items: [
        { ...actual.FAKE_LIBRARIES[0]!, id: 201, distance_m: null },
        { ...actual.FAKE_LIBRARIES[1]!, id: 202, distance_m: 12.5 },
        { ...actual.FAKE_LIBRARIES[2]!, id: 203, distance_m: -1 },
      ],
    });
    await render(<HomeScreen />);
    await screen.findByText("정독도서관");
    await act(async () => mapProps().onMarkerPress(201));
    await act(async () => mapProps().onMarkerPress(202));
    await act(async () => mapProps().onMarkerPress(203));
    expect(mockPush).toHaveBeenNthCalledWith(1, { pathname: "/libraries/[libraryId]", params: { libraryId: "201" } });
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: "/libraries/[libraryId]", params: { libraryId: "202" } });
    expect(mockPush).toHaveBeenNthCalledWith(3, { pathname: "/libraries/[libraryId]", params: { libraryId: "203" } });
  });
});
