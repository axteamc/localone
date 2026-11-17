// LOCAL-2-P3 방문 페이지 피드·카드·컴팩트 메뉴 (contracts/local-feed.md LOCAL-2 H1·H4·H10~H13·C4, P5)
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { Platform } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import * as api from "../api";
import type { FeedPage, FeedPost } from "../api";
import { splitColumns } from "../LibraryFeed";
import { PostCard } from "../PostCard";
import { MENU_TEXT } from "../PostMenu";
import { SHARE_TEXT } from "../share";
import { VisitScreen } from "../VisitScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush, canGoBack: () => true }),
  useNavigation: () => ({ addListener: () => () => undefined }),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
}));
jest.mock("../../../lib/visits", () => ({ recordVisit: jest.fn(), getDefaultLibrary: jest.fn() }));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchLibraryPosts: jest.fn(),
  setReaction: jest.fn(),
  setBookmark: jest.fn(),
}));

const fetchLibrary = jest.mocked(publicApi.fetchLibrary);
const fetchLibraryPosts = jest.mocked(api.fetchLibraryPosts);
const setReaction = jest.mocked(api.setReaction);
const setBookmark = jest.mocked(api.setBookmark);
const mockedUseAuth = jest.mocked(useAuth);

function post(id: string, extra: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    library_id: 101,
    library_name: "정독도서관",
    image_kind: "color",
    image_url: null,
    image_color: "fill2",
    overlay_text: `글자 ${id}`,
    book: { isbn13: "9788936434120", title: "소년이 온다", author: "한강" },
    published_at: "2026-11-17T12:00:00+09:00",
    my_reaction: false,
    my_bookmark: false,
    ...extra,
  };
}

function lib(): LibraryDetail {
  return {
    id: 101, name: "정독도서관", address: null, latitude: null, longitude: null, dtl_region_code: null,
    area_label: null, distance_m: null, homepage: null, tel: null, operating_time_text: null, closed_text: null,
    today: { date: "2026-11-17", is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setAuth(status: "signedIn" | "signedOut") {
  mockedUseAuth.mockReturnValue({ status } as unknown as ReturnType<typeof useAuth>);
}

async function enterWith(page: FeedPage) {
  fetchLibraryPosts.mockResolvedValueOnce(page);
  await render(<VisitScreen libraryId={101} distanceM={null} />);
  await screen.findByTestId("library-feed");
}

async function openMenu(id: string) {
  await fireEvent(screen.getByTestId(`post-card-${id}`), "longPress");
  return screen.findByTestId("post-menu");
}

const scrollToEnd = () =>
  fireEvent.scroll(screen.getByTestId("visit-scroll"), {
    nativeEvent: { contentOffset: { y: 900 }, layoutMeasurement: { height: 800 }, contentSize: { height: 1600 } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  setAuth("signedIn");
  fetchLibrary.mockResolvedValue(lib());
  jest.mocked(visits.recordVisit).mockResolvedValue({
    counted: false, isFirst: false, previousVisitedOn: null,
    record: { libraryId: 101, count: 2, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-17", streakDays: 1,
              defaultAsked: true },
  });
  jest.mocked(visits.getDefaultLibrary).mockResolvedValue(null);
});

describe("PostCard", () => {
  test("post card renders image only without title author or count", async () => {
    const onPress = jest.fn();
    await render(<PostCard post={post("p1", { image_kind: "photo", image_url: "https://img.test/a.jpg",
      image_color: null })} onPress={onPress} width={160} />);
    expect(screen.getByText("글자 p1")).toBeTruthy();
    expect(screen.queryByText(/소년이 온다/)).toBeNull();
    expect(screen.queryByText(/한강/)).toBeNull();
    expect(screen.queryByText(/정독도서관/)).toBeNull();
    expect(screen.queryByText(/[♡♥]/)).toBeNull();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
    await fireEvent.press(screen.getByTestId("post-card-p1"));
    expect(onPress).toHaveBeenCalledWith("p1");
  });

  test("card without onMenu has no menu on long press or hover (A home sheet)", async () => {
    await render(<PostCard post={post("p1")} onPress={jest.fn()} width={160} />);
    await fireEvent(screen.getByTestId("post-card-p1"), "hoverIn");
    expect(screen.queryByLabelText("카드 메뉴")).toBeNull();
  });

  test("web hover shows dots button that opens the menu", async () => {
    const onMenu = jest.fn();
    await render(<PostCard post={post("p1")} onPress={jest.fn()} onMenu={onMenu} width={160} />);
    expect(screen.queryByLabelText("카드 메뉴")).toBeNull();
    await fireEvent(screen.getByTestId("post-card-p1"), "hoverIn");
    await fireEvent.press(screen.getByLabelText("카드 메뉴"));
    expect(onMenu).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  test("masonry puts the next card in the shorter column", () => {
    const tall = post("t", { image_kind: "photo", image_url: "https://x", image_color: null }); // 4:3
    const square = post("s", { overlay_text: null }); // 1:1
    const [left, right] = splitColumns([tall, square, square, square]);
    expect(left.length + right.length).toBe(4);
    expect(left[0]).toBe(tall);
    expect(right.length).toBe(2); // 1 + 1 < 4/3 + 1
  });
});

describe("LibraryFeed in VisitScreen", () => {
  test("feed shows cards newest first and opens detail on press", async () => {
    await enterWith({ items: [post("p2"), post("p1")], next_cursor: null });
    expect(fetchLibraryPosts).toHaveBeenCalledWith(101, { cursor: null }, expect.anything());
    await fireEvent.press(screen.getByTestId("post-card-p2"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: "p2", libraryId: "101" } });
  });

  test("post withdrawn on detail disappears from feed with notice", async () => {
    await enterWith({ items: [post("p2"), post("p1")], next_cursor: null });
    await act(async () => api.emitPostWithdrawn("p2"));
    expect(screen.queryByTestId("post-card-p2")).toBeNull();
    expect(screen.getByTestId("post-card-p1")).toBeTruthy();
    expect(await screen.findByText("내렸어요")).toBeTruthy();
  });

  test("empty feed keeps VISIT-2 empty guide", async () => {
    fetchLibraryPosts.mockResolvedValueOnce({ items: [], next_cursor: null });
    await render(<VisitScreen libraryId={101} distanceM={null} />);
    expect(await screen.findByTestId("empty-feed")).toBeTruthy();
    expect(screen.queryByTestId("library-feed")).toBeNull();
  });

  test("compact menu with book shows 3 icon buttons and book-author search rows", async () => {
    await enterWith({ items: [post("p1")], next_cursor: null });
    const menu = within(await openMenu("p1"));
    expect(menu.getByLabelText(MENU_TEXT.like)).toBeTruthy();
    expect(menu.getByLabelText(MENU_TEXT.bookmark)).toBeTruthy();
    expect(menu.getByLabelText(MENU_TEXT.share)).toBeTruthy();
    expect(menu.getByText("📖 소년이 온다 검색")).toBeTruthy();
    expect(menu.getByText("👤 한강의 다른 책")).toBeTruthy();
    expect(menu.queryByText(MENU_TEXT.bookless)).toBeNull();
    await fireEvent.press(menu.getByText("📖 소년이 온다 검색"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/search", params: { q: "소년이 온다" } });
    expect(screen.queryByTestId("post-menu")).toBeNull();
    await fireEvent.press(within(await openMenu("p1")).getByText("👤 한강의 다른 책"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/search", params: { q: "한강" } });
  });

  test("compact menu hides author row when author is null", async () => {
    await enterWith({ items: [post("p1", { book: { isbn13: "9788936434120", title: "책", author: null } })],
      next_cursor: null });
    const menu = within(await openMenu("p1"));
    expect(menu.getByText("📖 책 검색")).toBeTruthy();
    expect(menu.queryByText(/의 다른 책/)).toBeNull();
  });

  test("compact menu without book shows bookless purchase button UI only without API call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await enterWith({ items: [post("p1", { book: null })], next_cursor: null });
    const menu = within(await openMenu("p1"));
    expect(menu.getByLabelText(MENU_TEXT.like)).toBeTruthy();
    expect(menu.getByLabelText(MENU_TEXT.bookmark)).toBeTruthy();
    expect(menu.getByLabelText(MENU_TEXT.share)).toBeTruthy();
    expect(menu.queryByText(/검색$/)).toBeNull();
    const callsBefore = fetchLibraryPosts.mock.calls.length;
    await fireEvent.press(menu.getByText(MENU_TEXT.bookless));
    expect(await screen.findByText(MENU_TEXT.preparing)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(fetchLibraryPosts.mock.calls.length).toBe(callsBefore);
    expect(setReaction).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("menu like toggles once on rapid double tap and shows liked state", async () => {
    const res = deferred<api.ReactionState>();
    setReaction.mockReturnValueOnce(res.promise);
    await enterWith({ items: [post("p1")], next_cursor: null });
    const menu = within(await openMenu("p1"));
    await fireEvent.press(menu.getByLabelText(MENU_TEXT.like));
    await fireEvent.press(menu.getByLabelText(MENU_TEXT.like));
    expect(setReaction).toHaveBeenCalledTimes(1);
    expect(setReaction).toHaveBeenCalledWith("p1", true);
    await act(async () => res.resolve({ post_id: "p1", reacted: true, reaction_count: 3 }));
    expect(await screen.findByLabelText(MENU_TEXT.liked)).toBeTruthy();
  });

  test("menu bookmark toggles off without confirm", async () => {
    setBookmark.mockResolvedValueOnce({ post_id: "p1", bookmarked: false });
    await enterWith({ items: [post("p1", { my_bookmark: true })], next_cursor: null });
    const menu = within(await openMenu("p1"));
    await fireEvent.press(menu.getByLabelText(MENU_TEXT.bookmarked));
    expect(setBookmark).toHaveBeenCalledWith("p1", false);
    expect(await screen.findByLabelText(MENU_TEXT.bookmark)).toBeTruthy();
  });

  test("signed out like or bookmark shows login prompt without request", async () => {
    setAuth("signedOut");
    await enterWith({ items: [post("p1")], next_cursor: null });
    await fireEvent.press(within(await openMenu("p1")).getByLabelText(MENU_TEXT.like));
    expect(await screen.findByText(MENU_TEXT.loginNeeded)).toBeTruthy();
    await fireEvent.press(screen.getByText(MENU_TEXT.close));
    await fireEvent.press(within(await openMenu("p1")).getByLabelText(MENU_TEXT.bookmark));
    await fireEvent.press(screen.getByText(MENU_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login" });
    expect(setReaction).not.toHaveBeenCalled();
    expect(setBookmark).not.toHaveBeenCalled();
  });

  test("library feed paginates with cursor once per scroll end", async () => {
    const second = deferred<FeedPage>();
    await enterWith({ items: [post("p3"), post("p2")], next_cursor: "c1" });
    fetchLibraryPosts.mockReturnValueOnce(second.promise);
    await scrollToEnd();
    await scrollToEnd();
    expect(fetchLibraryPosts).toHaveBeenCalledTimes(2);
    expect(fetchLibraryPosts).toHaveBeenLastCalledWith(101, { cursor: "c1" }, expect.anything());
    await act(async () => second.resolve({ items: [post("p2"), post("p1")], next_cursor: null }));
    expect(await screen.findByTestId("post-card-p1")).toBeTruthy();
    expect(screen.getAllByTestId("post-card-p2")).toHaveLength(1); // 겹친 항목은 한 번만
    await scrollToEnd(); // 더 없음
    expect(fetchLibraryPosts).toHaveBeenCalledTimes(2);
  });
});

describe("공유 (C4)", () => {
  const originalOS = Platform.OS;
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const saved = { share: nav.share, clipboard: nav.clipboard };

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    Object.defineProperty(nav, "share", { value: saved.share, configurable: true, writable: true });
    Object.defineProperty(nav, "clipboard", { value: saved.clipboard, configurable: true, writable: true });
  });

  test("web share copies link to clipboard when navigator.share unavailable", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const writeText = jest.fn(async (_: string) => undefined);
    Object.defineProperty(nav, "share", { value: undefined, configurable: true, writable: true });
    Object.defineProperty(nav, "clipboard", { value: { writeText }, configurable: true, writable: true });
    await enterWith({ items: [post("p1")], next_cursor: null });
    await fireEvent.press(within(await openMenu("p1")).getByLabelText(MENU_TEXT.share));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toMatch(/\/posts\/p1$/);
    expect(await screen.findByText(SHARE_TEXT.copied)).toBeTruthy();
  });

  test("web share failure shows retry message", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    Object.defineProperty(nav, "share", { value: undefined, configurable: true, writable: true });
    Object.defineProperty(nav, "clipboard", {
      value: { writeText: jest.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
      writable: true,
    });
    await enterWith({ items: [post("p1")], next_cursor: null });
    await fireEvent.press(within(await openMenu("p1")).getByLabelText(MENU_TEXT.share));
    expect(await screen.findByText(SHARE_TEXT.failed)).toBeTruthy();
  });
});
