// VISIT-1b-P1 필수 테스트 (계약서 library-visit.md VISIT-1b P5): 홈 하단 창과 인기 도서 한 줄
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { PanResponder, type PanResponderCallbacks, type PanResponderGestureState } from "react-native";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";
import { snapOffsets, useHomeSheet } from "../useHomeSheet";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => (require("react") as typeof import("react")).useEffect(cb, [cb]),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 이 파일은 창·인기 도서만 본다. 소식(실제 LOCAL-2 #26)은 빈 결과로 둔다
jest.mock("../../local-feed/api", () => ({
  fetchLibraryPosts: jest.fn(async () => ({ items: [], next_cursor: null })),
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
  test("short screens keep books peekable while leaving most of the facade open", () => {
    expect(495 - snapOffsets(495).half).toBe(156); // 하단 창은 156px, 파사드 339px 확보
    expect(snapOffsets(600).half).toBe(432); // 파사드 72%(432px), 하단 창 168px
    expect(snapOffsets(400).half).toBe(244); // 하단 창 156px, 파사드 244px
    expect(snapOffsets(200)).toEqual({ full: 0, half: 144, peek: 144 });
    expect(snapOffsets(0)).toEqual({ full: 0, half: 0, peek: 0 });
  });

  test("sheet starts half and snaps to three positions", async () => {
    jest.useFakeTimers();
    let config: PanResponderCallbacks = {};
    const create = PanResponder.create.bind(PanResponder);
    const spy = jest.spyOn(PanResponder, "create").mockImplementation((c) => {
      config = c;
      return create(c);
    });
    const AREA = 700;
    const o = snapOffsets(AREA);
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

    expect(result.current.snap).toBe("half"); // 결정 2: 평소 절반 높이
    expect(o.half).toBe(Math.round(AREA * 0.72)); // 파사드 72% · 하단 창 28%(모바일 확대 조정)
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

  test("popular asks national (YES24) regardless of frequent or nearest library (P2, Y-4 A안)", async () => {
    await openHome();
    await popular().findByText("소년이 온다");
    expect(m.fetchRecommendations).toHaveBeenCalled();
    // 도서관 기준으로 묻지 않는다 — 늘 전국(서버가 YES24 → 실패 시 정보나루 전국)
    expect(m.fetchRecommendations.mock.calls.every((c) => c[0] === undefined)).toBe(true);
    expect(popular().getByText("요즘 많이 읽는 책")).toBeTruthy();
  });

  test("series volumes are left out of the home row (P2)", async () => {
    m.fetchRecommendations.mockResolvedValue({
      ...actual.FAKE_RECOMMENDATIONS,
      books: [{ ...book(1), title: "화산귀환 10" }, { ...book(2), title: "아몬드" }, { ...book(3), title: "토지 3권" }],
    });
    await openHome();
    await popular().findByText("아몬드");
    expect(popular().getAllByTestId("popular-book")).toHaveLength(1);
    expect(popular().queryByText("화산귀환 10")).toBeNull();
  });

  test("national YES24 recommendations show one attribution for the section", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    m.fetchLibrariesNearby.mockResolvedValue({ mode: "nearby", radius_km: 3, dtl_region: null, q: null, items: [] });
    m.fetchRecommendations.mockResolvedValue({
      ...actual.FAKE_RECOMMENDATIONS,
      scope: "national",
      library_id: null,
      basis_label: "YES24 스테디셀러 · 국내도서",
      books: [book(1), book(2)],
    });

    await openHome();
    await popular().findByText("YES24 스테디셀러 · 국내도서");
    expect(popular().getAllByTestId("popular-book")).toHaveLength(2);
    expect(popular().getAllByText("출처: YES24")).toHaveLength(1);
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

  test("broken cover url falls back to title cover", async () => {
    await openHome();
    // 가짜 첫 책은 cover_url이 있다. 그림을 못 받으면 빈칸이 아니라 제목 글자 표지로 바뀐다(C3)
    const image = await popular().findByTestId("popular-book-cover-image");
    const first = popular().getByLabelText("소년이 온다");
    expect(within(first).getAllByText("소년이 온다")).toHaveLength(1);
    await act(async () => {
      image.props.onError?.({ nativeEvent: { error: "load failed" } });
    });
    expect(popular().queryByTestId("popular-book-cover-image")).toBeNull();
    expect(within(first).getAllByText("소년이 온다")).toHaveLength(2);
  });

  test("book press opens book detail once", async () => {
    await openHome();
    const first = await popular().findByLabelText("소년이 온다");
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
    expect(await popular().findByText("추천 도서를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("정보를 가져오지 못했어요. 다시 시도해 주세요.")).toBeNull(); // 서버 원문은 안 보임
    // 다른 칸·지도는 그대로
    expect(screen.queryByText("소식을 불러오지 못했어요.")).toBeNull();
    expect(screen.queryByText("지금은 도서관을 불러올 수 없어요.")).toBeNull();
    expect(within(screen.getByTestId("facade-board")).getByText("정독")).toBeTruthy();
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
    expect(await popular().findByText("아직 추천할 책을 모으지 못했어요.")).toBeTruthy();
    expect(popular().queryAllByTestId("popular-book")).toHaveLength(0);
  });

  test("no reading log section", async () => {
    await openHome();
    await popular().findByText("소년이 온다");
    expect(within(screen.getByTestId("home-sheet")).queryByText(/독서 기록/)).toBeNull();
  });
});
