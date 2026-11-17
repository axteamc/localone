// VISIT-1b-P2 필수 테스트 (계약서 library-visit.md VISIT-1b P5): 자주 가는·가까운 도서관 소식
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { PanResponder, type PanResponderCallbacks, type PanResponderGestureState } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as feedApi from "../__fakes__/localFeedApi";
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

jest.mock("../__fakes__/localFeedApi", () => {
  const actual = jest.requireActual("../__fakes__/localFeedApi") as typeof import("../__fakes__/localFeedApi");
  return { ...actual, fetchLibraryPosts: jest.fn() };
});

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
const actualFeed = jest.requireActual("../__fakes__/localFeedApi") as typeof import("../__fakes__/localFeedApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  fetchRecommendations: jest.Mock<typeof api.fetchRecommendations>;
  getFrequentLibraries: jest.Mock<typeof api.getFrequentLibraries>;
  fetchLibrary: jest.Mock<typeof api.fetchLibrary>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
};
const posts = (feedApi as unknown as { fetchLibraryPosts: jest.Mock<typeof feedApi.fetchLibraryPosts> }).fetchLibraryPosts;
const mockedUseAuth = useAuth as unknown as jest.Mock<() => unknown>;

const post = (n: number, libraryId = 101): feedApi.FeedPost => ({
  ...actualFeed.FAKE_FEED_PAGE.items[0]!,
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  library_id: libraryId,
  overlay_text: `글${n}`,
});
const page = (items: feedApi.FeedPost[], next_cursor: string | null = null): feedApi.FeedPage => ({ items, next_cursor });

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ status: "signedOut", session: null, user: null });
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.fetchRecommendations.mockImplementation(actual.fetchRecommendations);
  m.getFrequentLibraries.mockImplementation(actual.getFrequentLibraries);
  m.fetchLibrary.mockImplementation(actual.fetchLibrary);
  posts.mockImplementation(async (id) => page(id === 101 ? [post(1)] : id === 102 ? [post(2, 102)] : []));
});

afterEach(() => {
  jest.useRealTimers();
});

async function openHome() {
  await render(<HomeScreen />);
  await screen.findByTestId("library-news");
}

function news() {
  return within(screen.getByTestId("library-news"));
}

describe("VISIT-1b-P2 library news", () => {
  test("frequent pills ordered and first active", async () => {
    await openHome();
    expect(await news().findByLabelText("글1")).toBeTruthy();
    expect(news().getByText("자주 가는 도서관 소식")).toBeTruthy();
    const pills = news().getAllByTestId(/^news-pill-/);
    expect(pills.map((p) => p.props.testID)).toEqual(["news-pill-101", "news-pill-102"]);
    expect(within(pills[0]!).getByText("정독도서관")).toBeTruthy();
    expect(within(pills[1]!).getByText("종로도서관")).toBeTruthy();
    expect(pills[0]!.props.accessibilityState).toMatchObject({ selected: true });
    expect(pills[1]!.props.accessibilityState).toMatchObject({ selected: false });
    expect(posts).toHaveBeenCalledWith(101, { cursor: null, limit: 20 }, expect.anything());
    expect(posts).not.toHaveBeenCalledWith(102, expect.anything(), expect.anything());
  });

  test("no visits falls back to nearby with distance", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    await openHome();
    expect(await news().findByText("가까운 도서관 소식")).toBeTruthy();
    expect(news().getByText("자주 가는 곳이 생기면 바뀌어요")).toBeTruthy();
    expect(news().queryByText("지금 보는 지역 기준")).toBeNull();
    const first = await news().findByTestId("news-pill-101");
    expect(within(first).getByText("420m")).toBeTruthy();
    expect(within(news().getByTestId("news-pill-102")).getByText("1.3km")).toBeTruthy();
    expect(await news().findByLabelText("글1")).toBeTruthy();
  });

  test("location unavailable uses area label", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    await openHome();
    expect(await news().findByText("지금 보는 지역 기준")).toBeTruthy();
    const first = await news().findByTestId("news-pill-101");
    expect(within(first).getByText("화동")).toBeTruthy();
    expect(within(first).queryByText("420m")).toBeNull();
  });

  test("pill rapid switch shows last library only", async () => {
    const slow101 = deferred<feedApi.FeedPage>();
    posts.mockImplementation((id) => (id === 101 ? slow101.promise : Promise.resolve(page([post(2, 102)]))));
    await openHome();
    await waitFor(() => expect(posts).toHaveBeenCalledWith(101, expect.anything(), expect.anything())); // 101 응답 늦음
    await fireEvent.press(await news().findByTestId("news-pill-102"));
    expect(await news().findByLabelText("글2")).toBeTruthy();
    await act(async () => slow101.resolve(page([post(1)])));
    expect(news().queryByLabelText("글1")).toBeNull();
    expect(news().getByLabelText("글2")).toBeTruthy();
    expect(news().getByTestId("news-pill-102").props.accessibilityState).toMatchObject({ selected: true });
  });

  test("post press opens post detail once", async () => {
    await openHome();
    const card = await news().findByLabelText("글1");
    await fireEvent.press(card);
    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: post(1).id } });
  });

  test("frequent library without posts", async () => {
    posts.mockResolvedValue(page([]));
    await openHome();
    expect(await news().findByText("정독도서관에는 아직 게시물이 없어요.")).toBeTruthy();
    expect(news().getAllByTestId(/^news-pill-/)).toHaveLength(2); // 알약 그대로
    expect(news().queryAllByTestId("post-card")).toHaveLength(0); // 가짜 게시물 없음
  });

  test("missing frequent library pill is dropped", async () => {
    const before = JSON.stringify(actual.FAKE_VISITS);
    m.fetchLibrary.mockImplementation(async (id) => {
      if (id === 102) throw new actual.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.");
      return actual.fetchLibrary(id);
    });
    await openHome();
    await news().findByLabelText("글1");
    expect(news().getAllByTestId(/^news-pill-/).map((p) => p.props.testID)).toEqual(["news-pill-101"]);
    expect(news().getByText("자주 가는 도서관 소식")).toBeTruthy();
    expect(JSON.stringify(actual.FAKE_VISITS)).toBe(before); // 방문 기록은 지우지 않음
    expect(m.getFrequentLibraries).toHaveBeenCalled();
  });

  test("load more uses next cursor", async () => {
    posts.mockImplementation(async (_id, p) => (p.cursor === "c1" ? page([post(3)]) : page([post(1)], "c1")));
    await openHome();
    await news().findByLabelText("글1");
    await fireEvent.scroll(screen.getByTestId("home-sheet-scroll"), {
      nativeEvent: { contentOffset: { y: 900 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 400 } },
    });
    expect(await news().findByLabelText("글3")).toBeTruthy();
    expect(posts).toHaveBeenCalledWith(101, { cursor: "c1", limit: 20 }, expect.anything());
    expect(news().getByLabelText("글1")).toBeTruthy(); // 이어 붙임
  });

  test("news failure only affects news section", async () => {
    posts.mockRejectedValueOnce(new actual.ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요."));
    await openHome();
    expect(await news().findByText("소식을 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("서버에 연결하지 못했어요.")).toBeNull();
    // 인기 칸·지도는 그대로
    expect(await within(screen.getByTestId("popular-books")).findByText("소년이 온다")).toBeTruthy();
    expect(screen.queryByText("인기 도서를 불러오지 못했어요.")).toBeNull();
    await fireEvent.press(news().getByText("↻ 새로고침"));
    expect(await news().findByLabelText("글1")).toBeTruthy();
  });

  test("same view signed out", async () => {
    const snapshot = async () => {
      await openHome();
      await news().findByLabelText("글1");
      const view = {
        pills: news().getAllByTestId(/^news-pill-/).map((p) => p.props.testID),
        cards: news().getAllByTestId("post-card").map((c) => c.props.accessibilityLabel),
      };
      await screen.unmount();
      return view;
    };
    const signedOut = await snapshot();
    mockedUseAuth.mockReturnValue({ status: "signedIn", session: { access_token: "t" }, user: { id: "u1" } });
    const signedIn = await snapshot();
    expect(signedOut).toEqual(signedIn);
    expect(signedOut.pills).toEqual(["news-pill-101", "news-pill-102"]);
  });

  test("sheet does not drop while list is scrolled in full", async () => {
    jest.useFakeTimers();
    let config: PanResponderCallbacks = {};
    const create = PanResponder.create.bind(PanResponder);
    const spy = jest.spyOn(PanResponder, "create").mockImplementation((c) => {
      config = c;
      return create(c);
    });
    let listAtTop = false;
    const AREA = 700;
    const o = snapOffsets(AREA);
    const { result } = await renderHook(() => useHomeSheet(AREA, () => listAtTop));
    const e = {} as never;
    const g = (dy: number) => ({ dx: 0, dy, vx: 0, vy: 0 }) as PanResponderGestureState;
    // 반쯤에서는 안쪽 스크롤보다 끌기가 먼저
    expect(config.onMoveShouldSetPanResponderCapture!(e, g(-30))).toBe(true);
    await act(async () => {
      result.current.snapTo("full");
      jest.advanceTimersByTime(1000); // 붙는 움직임이 끝나게
    });
    expect(result.current.snap).toBe("full");
    // 올림(full): 목록을 스크롤한 상태면 아래로 끌어도 창이 가로채지 않는다(C4)
    expect(config.onMoveShouldSetPanResponderCapture!(e, g(30))).toBe(false);
    expect(config.onMoveShouldSetPanResponderCapture!(e, g(-30))).toBe(false);
    // 목록이 맨 위면 아래로 끌어 창을 내린다
    listAtTop = true;
    expect(config.onMoveShouldSetPanResponderCapture!(e, g(30))).toBe(true);
    expect(o.full).toBe(0);
    spy.mockRestore();
  });
});
