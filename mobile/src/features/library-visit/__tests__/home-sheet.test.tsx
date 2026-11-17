// VISIT-1b-P1 필수 테스트 (계약서 library-visit.md VISIT-1b P5): 홈 하단 창과 인기 도서 한 줄
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { Dimensions, PanResponder, type PanResponderCallbacks, type PanResponderGestureState } from "react-native";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";
import { snapOffsets, useHomeSheet } from "../useHomeSheet";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  const ReactLib = require("react");
  const { Text, View } = require("react-native");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(),
    fetchRecommendations: jest.fn(),
    getFrequentLibraries: jest.fn(),
    fetchLibrary: jest.fn(),
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    KakaoMap: (props: api.KakaoMapProps) =>
      ReactLib.createElement(
        View,
        { testID: "kakao-map" },
        props.markers.map((mk: api.MapMarker) => ReactLib.createElement(Text, { key: mk.id }, mk.title))
      ),
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  fetchRecommendations: jest.Mock<typeof api.fetchRecommendations>;
  getFrequentLibraries: jest.Mock<typeof api.getFrequentLibraries>;
  fetchLibrary: jest.Mock<typeof api.fetchLibrary>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
};

const book = (n: number): api.Book => ({
  ...actual.FAKE_RECOMMENDATIONS.books[0]!,
  isbn13: String(9788900000000 + n),
  title: `책${n}`,
});

beforeEach(() => {
  jest.clearAllMocks();
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.fetchRecommendations.mockImplementation(actual.fetchRecommendations);
  m.getFrequentLibraries.mockImplementation(actual.getFrequentLibraries);
  m.fetchLibrary.mockImplementation(actual.fetchLibrary);
});

afterEach(() => {
  jest.useRealTimers();
});

async function openHome() {
  await render(<HomeScreen />);
  await screen.findByTestId("home-sheet");
}

function popular() {
  return within(screen.getByTestId("popular-books"));
}

describe("VISIT-1b-P1 home sheet", () => {
  test("sheet starts half and snaps to three positions", async () => {
    jest.useFakeTimers();
    let config: PanResponderCallbacks = {};
    const create = PanResponder.create.bind(PanResponder);
    const spy = jest.spyOn(PanResponder, "create").mockImplementation((c) => {
      config = c;
      return create(c);
    });
    const AREA = 700;
    const o = snapOffsets(AREA, Dimensions.get("window").height);
    const { result } = await renderHook(() => useHomeSheet(AREA));
    const e = {} as never;
    const g = (dy: number, vy: number) => ({ dx: 0, dy, vx: 0, vy }) as PanResponderGestureState;
    const drag = async (dy: number, vy = 0) => {
      await act(async () => {
        config.onPanResponderGrant!(e, g(0, 0));
        config.onPanResponderMove!(e, g(dy, vy));
        config.onPanResponderRelease!(e, g(dy, vy));
        jest.advanceTimersByTime(1000); // 붙는 움직임이 끝나게
      });
    };

    expect(result.current.snap).toBe("half"); // 결정 2: 평소 반쯤
    expect(o.full).toBeLessThan(o.half);
    expect(o.half).toBeLessThan(o.peek);
    expect(o.peek).toBe(AREA - 56); // 내림 = 제목 한 줄 56px

    await drag(-(o.half - o.full)); // 위로 끝까지
    expect(result.current.snap).toBe("full");
    await drag(o.peek); // 아래로 끝까지
    expect(result.current.snap).toBe("peek");
    await drag(-10); // 조금만 올리고 놓으면 가까운 자리(그대로 내림)
    expect(result.current.snap).toBe("peek");
    await drag(-10, -1); // 빠르게 올리면 그 방향 다음 자리
    expect(result.current.snap).toBe("half");
    await drag((o.peek - o.half) * 0.4); // 반쯤에서 덜 내리고 놓으면 반쯤으로 돌아옴
    expect(result.current.snap).toBe("half");
    spy.mockRestore();
  });

  test("popular uses first frequent library", async () => {
    await openHome();
    expect(await popular().findByText("정독도서관 · 최근 30일 대출")).toBeTruthy();
    expect(m.getFrequentLibraries).toHaveBeenCalledWith(3);
    expect(m.fetchRecommendations).toHaveBeenLastCalledWith(101, expect.anything());
    // 방문 기록을 읽기 전에 전국으로 먼저 묻지 않는다
    expect(m.fetchRecommendations.mock.calls.every((c) => c[0] === 101)).toBe(true);
  });

  test("popular falls back to nearest then national", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    const nearest = actual.FAKE_LIBRARIES[0]!;
    await openHome();
    await waitFor(() => expect(m.fetchRecommendations).toHaveBeenLastCalledWith(nearest.id, expect.anything()));
    await screen.unmount();

    // 주변에도 도서관이 없으면 기준 없이(전국)
    m.fetchRecommendations.mockClear();
    m.fetchLibrariesNearby.mockResolvedValue({ mode: "nearby", radius_km: 3, dtl_region: null, q: null, items: [] });
    m.fetchRecommendations.mockResolvedValue({
      ...actual.FAKE_RECOMMENDATIONS,
      scope: "national",
      library_id: null,
      basis_label: "전국 · 최근 30일 대출",
    });
    await openHome();
    expect(await popular().findByText("전국 · 최근 30일 대출")).toBeTruthy();
    await screen.findByText("가까운 곳에서 도서관을 찾지 못했어요.");
    const last = m.fetchRecommendations.mock.calls.at(-1)!;
    expect(last[0]).toBeUndefined();
    expect(m.fetchRecommendations.mock.calls.some((c) => c[0] !== undefined)).toBe(false);
  });

  test("popular shows at most 10 books", async () => {
    m.fetchRecommendations.mockResolvedValue({
      ...actual.FAKE_RECOMMENDATIONS,
      books: Array.from({ length: 20 }, (_, i) => book(i + 1)),
    });
    await openHome();
    await popular().findByText("책1");
    expect(popular().getAllByTestId("popular-book")).toHaveLength(10);
    expect(popular().queryByText("책11")).toBeNull();
  });

  test("book press opens book detail once", async () => {
    await openHome();
    const first = await popular().findByLabelText("1위 소년이 온다");
    await fireEvent.press(first);
    await fireEvent.press(first);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/books/[isbn13]", params: { isbn13: "9788936434120" } });
  });

  test("popular failure only affects popular section", async () => {
    m.fetchRecommendations.mockRejectedValueOnce(
      new actual.ApiCallError(503, "PROVIDER_UNAVAILABLE", "정보를 가져오지 못했어요. 다시 시도해 주세요.")
    );
    await openHome();
    expect(await popular().findByText("인기 도서를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("정보를 가져오지 못했어요. 다시 시도해 주세요.")).toBeNull(); // 서버 원문은 안 보임
    // 다른 칸·지도는 그대로
    expect(screen.queryByText("소식을 불러오지 못했어요.")).toBeNull();
    expect(screen.queryByText("지금은 도서관을 불러올 수 없어요.")).toBeNull();
    expect(within(screen.getByTestId("kakao-map")).getByText("정독도서관")).toBeTruthy();
    // 새로고침하면 그 칸만 다시 묻는다
    const calls = m.fetchRecommendations.mock.calls.length;
    await fireEvent.press(popular().getByText("↻ 새로고침"));
    expect(await popular().findByText("소년이 온다")).toBeTruthy();
    expect(m.fetchRecommendations).toHaveBeenCalledTimes(calls + 1);
    expect(m.fetchLibrariesNearby).toHaveBeenCalledTimes(1);
  });

  test("popular empty message", async () => {
    m.fetchRecommendations.mockResolvedValue({ ...actual.FAKE_RECOMMENDATIONS, books: [] });
    await openHome();
    expect(await popular().findByText("이 동네 인기 도서를 아직 모으지 못했어요.")).toBeTruthy();
    expect(popular().queryAllByTestId("popular-book")).toHaveLength(0);
  });

  test("no reading log section", async () => {
    await openHome();
    await popular().findByText("소년이 온다");
    expect(within(screen.getByTestId("home-sheet")).queryByText(/독서 기록/)).toBeNull();
  });
});
