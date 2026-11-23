// VISIT-1b-P2 필수 테스트 (계약서 library-visit.md VISIT-1b P5): 자주 가는·가까운 도서관 소식
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { PanResponder, type PanResponderCallbacks, type PanResponderGestureState } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as feedApi from "../../local-feed/api";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";
import { useHomeFeed } from "../useHomeFeed";
import { snapOffsets, useHomeSheet } from "../useHomeSheet";

const mockPush = jest.fn();
let mockFocus: () => void;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    mockFocus = cb;
    (require("react") as typeof import("react")).useEffect(cb, [cb]);
  },
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 실제 LOCAL-2 API(#26) 모듈에서 게시물 조회만 가짜로 바꾼다
jest.mock("../../local-feed/api", () => ({ fetchLibraryPosts: jest.fn() }));

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
const posts = (feedApi as unknown as { fetchLibraryPosts: jest.Mock<typeof feedApi.fetchLibraryPosts> }).fetchLibraryPosts;
const mockedUseAuth = useAuth as unknown as jest.Mock<() => unknown>;

const post = (n: number, libraryId = 101): feedApi.FeedPost => ({
  library_name: "정독도서관",
  image_kind: "color",
  image_url: null,
  image_color: "fill2",
  book: { isbn13: "9788936434120", title: "소년이 온다", author: "한강" },
  published_at: "2026-11-15T19:20:00+09:00",
  my_reaction: false,
  my_bookmark: false,
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  library_id: libraryId,
  overlay_text: `글${n}`,
});
const page = (items: feedApi.FeedPost[], next_cursor: string | null = null): feedApi.FeedPage => ({ items, next_cursor });
const nearEnd = {
  nativeEvent: { contentOffset: { y: 900 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 400 } },
};

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<T>((r, fail) => { resolve = r; reject = fail; });
  return { promise, resolve, reject };
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
    expect(posts).toHaveBeenCalledWith(101, { cursor: null, limit: 20, expand: "region" }, expect.anything());
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
    expect(news().queryAllByTestId(/^post-card-/)).toHaveLength(0); // 가짜 게시물 없음
  });

  test("nearby libraries all without posts", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    posts.mockResolvedValue(page([]));
    await openHome();
    expect(await news().findByText("가까운 도서관에도 아직 게시물이 없어요.")).toBeTruthy(); // 예외 #2-c
    const pills = news().getAllByTestId(/^news-pill-/);
    expect(pills).toHaveLength(3); // 알약은 그대로
    expect(pills.every((p) => p.props.accessibilityState?.selected === false)).toBe(true);
    expect(posts.mock.calls.map(([id, p]) => [id, p.expand])).toEqual([
      [101, undefined], [102, undefined], [103, undefined], [101, "region"],
    ]);
  });

  test("nearby opens first library that has posts", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    const own = post(2, 102);
    const extra = { ...post(5), library_name: "시도에서 보충한 도서관의 전체 이름" };
    const expanded = deferred<feedApi.FeedPage>();
    posts.mockImplementation(async (id, p) => {
      if (id === 102) return p.expand ? expanded.promise : page([own]);
      return page([]);
    });
    await openHome();
    await waitFor(() => expect(posts.mock.calls.map(([id, p]) => [id, p.expand])).toEqual([
      [101, undefined], [102, undefined], [102, "region"],
    ]));
    expect(news().getByTestId("news-pill-102").props.accessibilityState).toMatchObject({ selected: true });
    await act(async () => expanded.resolve(page([own, extra])));
    expect(await news().findByLabelText("글2")).toBeTruthy();
    expect(within(news().getByTestId(`post-card-${own.id}`)).queryByText(own.library_name)).toBeNull();
    const extraCard = news().getByTestId(`post-card-${extra.id}`);
    expect(extraCard.props.accessibilityLabel).toBe(`글5, ${extra.library_name}`);
    expect(within(extraCard).getByText(extra.library_name, { includeHiddenElements: true }).props.numberOfLines).toBe(1);
    await fireEvent.press(extraCard);
    await fireEvent.press(extraCard);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: extra.id } });
    expect(news().getByTestId("news-pill-102").props.accessibilityState).toMatchObject({ selected: true });
    // 그 뒤 게시물 없는 가까운 알약을 누르면 그 도서관 이름으로 안내
    await fireEvent.press(news().getByTestId("news-pill-101"));
    expect(await news().findByText("정독도서관에는 아직 게시물이 없어요.")).toBeTruthy();
  });

  test("nearby probes never expand a candidate with six own posts", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    posts.mockResolvedValue(page(Array.from({ length: 6 }, (_, i) => post(i + 1))));
    await openHome();
    expect(await news().findByLabelText("글6")).toBeTruthy();
    expect(posts.mock.calls.map(([id, p]) => [id, p.expand])).toEqual([[101, undefined]]);
  });

  test("when all nearby candidates are empty, only the first receives regional posts", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    posts.mockImplementation(async (_id, p) => page(p.expand ? [{ ...post(3, 103), library_name: "남산도서관" }] : []));
    await openHome();
    expect(await news().findByLabelText("글3, 남산도서관")).toBeTruthy();
    expect(news().getByTestId("news-pill-101").props.accessibilityState.selected).toBe(true);
    expect(posts.mock.calls.map(([id, p]) => [id, p.expand])).toEqual([
      [101, undefined], [102, undefined], [103, undefined], [101, "region"],
    ]);
    await fireEvent.scroll(screen.getByTestId("home-sheet-scroll"), nearEnd);
    expect(posts).toHaveBeenCalledTimes(4);
  });

  test("no nearby candidates does not request posts", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    const candidates: api.LibrarySummary[] = [];
    const { result } = await renderHook(() =>
      useHomeFeed(candidates, "current", { locationReady: true, viewSeq: 0, visitRefresh: 0 })
    );
    await waitFor(() => expect(result.current.news).toMatchObject({ status: "empty", activeId: null }));
    expect(posts).not.toHaveBeenCalled();
  });

  test("a failed nearby probe stops the search and retry probes again", async () => {
    m.getFrequentLibraries.mockResolvedValue([]);
    posts.mockRejectedValueOnce(new Error("probe failed"));
    await openHome();
    expect(await news().findByText("소식을 불러오지 못했어요.")).toBeTruthy();
    expect(posts.mock.calls.map(([id, p]) => [id, p.expand])).toEqual([[101, undefined]]);
    await fireEvent.press(news().getByText("↻ 새로고침"));
    expect(await news().findByLabelText("글1")).toBeTruthy();
    expect(posts.mock.calls.map(([id, p]) => [id, p.expand])).toEqual([
      [101, undefined], [101, undefined], [101, "region"],
    ]);
  });

  test("home focus refreshes a reordered frequent list and discards the previous error", async () => {
    const slow = deferred<feedApi.FeedPage>();
    posts.mockReturnValueOnce(slow.promise);
    await openHome();
    await waitFor(() => expect(posts).toHaveBeenCalledWith(101, expect.anything(), expect.anything()));
    m.getFrequentLibraries.mockResolvedValue([...actual.FAKE_VISITS].reverse());
    await act(async () => mockFocus());
    expect(await news().findByLabelText("글2")).toBeTruthy();
    expect(news().getByTestId("news-pill-102").props.accessibilityState.selected).toBe(true);
    await act(async () => slow.reject(new Error("old request failed")));
    expect(news().queryByText("소식을 불러오지 못했어요.")).toBeNull();
  });

  test("a location change cancels regional lookup before the next candidate list resolves", async () => {
    const slow = deferred<feedApi.FeedPage>();
    const visits = deferred<Awaited<ReturnType<typeof api.getFrequentLibraries>>>();
    const nearby = (await actual.fetchLibrariesNearby(37.5815, 126.9831, 3)).items;
    m.getFrequentLibraries.mockResolvedValueOnce([]).mockReturnValueOnce(visits.promise);
    posts.mockImplementation(async (id, p) => {
      if (id === 101 && p.expand) return slow.promise;
      return page([post(id === 101 ? 1 : 2, id)]);
    });
    const { result, rerender } = await renderHook<ReturnType<typeof useHomeFeed>, { seq: number; candidates: typeof nearby }>(
      ({ seq, candidates }) => useHomeFeed(candidates, "current", { locationReady: true, viewSeq: seq, visitRefresh: 0 }),
      { initialProps: { seq: 0, candidates: nearby } }
    );
    await waitFor(() => expect(posts).toHaveBeenCalledWith(101, { cursor: null, limit: 20, expand: "region" }, expect.anything()));
    const previousSignal = posts.mock.calls.at(-1)?.[2];
    await rerender({ seq: 1, candidates: nearby.slice(1) });
    expect(previousSignal?.aborted).toBe(true);
    await act(async () => slow.resolve(page([post(1)], "old-cursor")));
    expect(result.current.news).toMatchObject({ status: "loading", activeId: null, posts: [], hasMore: false });
    await act(async () => visits.resolve([]));
    expect(result.current.news).toMatchObject({ status: "ready", activeId: 102, posts: [post(2, 102)] });
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
    await fireEvent.scroll(screen.getByTestId("home-sheet-scroll"), nearEnd);
    expect(await news().findByLabelText("글3")).toBeTruthy();
    expect(posts).toHaveBeenCalledWith(101, { cursor: "c1", limit: 20 }, expect.anything());
    expect(news().getByLabelText("글1")).toBeTruthy(); // 이어 붙임
  });

  test("the next cursor is requested once while pending and retries after an error without duplicating IDs", async () => {
    const next = deferred<feedApi.FeedPage>();
    const first = post(1);
    posts.mockResolvedValueOnce(page([first], "c1"))
      .mockReturnValueOnce(next.promise)
      .mockResolvedValueOnce(page([first, post(3), post(3)]));
    await openHome();
    await news().findByLabelText("글1");
    const scroll = () => fireEvent.scroll(screen.getByTestId("home-sheet-scroll"), nearEnd);
    await scroll();
    await scroll();
    expect(posts).toHaveBeenCalledTimes(2);
    await act(async () => next.reject(new Error("next page failed")));
    expect(news().getByLabelText("글1")).toBeTruthy();
    expect(news().queryByText("소식을 불러오지 못했어요.")).toBeNull();
    await scroll();
    expect(await news().findByLabelText("글3")).toBeTruthy();
    expect(news().getAllByTestId(/^post-card-/)).toHaveLength(2);
    expect(posts.mock.calls.slice(1).map(([, p]) => p)).toEqual([
      { cursor: "c1", limit: 20 }, { cursor: "c1", limit: 20 },
    ]);
    await scroll();
    expect(posts).toHaveBeenCalledTimes(3);
  });

  test("switching pills lets the new cursor load while the old page is still pending", async () => {
    const previous = deferred<feedApi.FeedPage>();
    posts.mockResolvedValueOnce(page([post(1)], "old"))
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(page([post(2, 102)], "new"))
      .mockResolvedValueOnce(page([post(3, 102)]));
    await openHome();
    await news().findByLabelText("글1");
    const scroll = () => fireEvent.scroll(screen.getByTestId("home-sheet-scroll"), nearEnd);
    await scroll();
    await fireEvent.press(news().getByTestId("news-pill-102"));
    await news().findByLabelText("글2");
    await scroll();
    expect(await news().findByLabelText("글3")).toBeTruthy();
    await act(async () => previous.resolve(page([post(4)], "obsolete")));
    expect(news().queryByLabelText("글4")).toBeNull();
    await scroll();
    expect(posts).toHaveBeenCalledTimes(4);
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
        cards: news().getAllByTestId(/^post-card-/).map((c) => c.props.accessibilityLabel),
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
