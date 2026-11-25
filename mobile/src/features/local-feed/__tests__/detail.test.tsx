// LOCAL-2-P4 상세·이어 읽기·공감·북마크·대여/구매 버튼 (contracts/local-feed.md LOCAL-2 H3·H5~H7·H9·H14·H15, P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as platform from "../../../lib/platform";
import * as publicApi from "../../../lib/publicApi";
import type { AvailabilityItem, AvailabilityResponse } from "../../../lib/publicApi";
import { theme } from "../../../theme";
import { ON_FILL_LIGHT } from "../../../theme/tokens";
import * as api from "../api";
import type { FeedPost, Post } from "../api";
import { basisLabel, DETAIL_TEXT, loanLine, PostDetail } from "../PostDetail";
import { MENU_TEXT } from "../PostMenu";
import { SAVE_TEXT } from "../ReactionButton";
import { RELATED_TEXT } from "../SameBookPosts";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-2222-4333-8444-555555555555" }));
jest.mock("../imagePicker", () => ({ pickPostImage: jest.fn(), canUseCamera: jest.fn(() => true), buildImageFormData: jest.fn() }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/platform", () => ({ openExternalUrl: jest.fn(async () => true) }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchAvailabilityAt: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchPost: jest.fn(),
  fetchBookPosts: jest.fn(),
  fetchLibraryPosts: jest.fn(),
  setReaction: jest.fn(),
  setBookmark: jest.fn(),
  withdrawPost: jest.fn(),
}));

const fetchPost = jest.mocked(api.fetchPost);
const fetchBookPosts = jest.mocked(api.fetchBookPosts);
const fetchLibraryPosts = jest.mocked(api.fetchLibraryPosts);
const setReaction = jest.mocked(api.setReaction);
const setBookmark = jest.mocked(api.setBookmark);
const withdrawPost = jest.mocked(api.withdrawPost);
const fetchAvailabilityAt = jest.mocked(publicApi.fetchAvailabilityAt);
const openExternalUrl = jest.mocked(platform.openExternalUrl);
const mockedUseAuth = jest.mocked(useAuth);

const seoul = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const YESTERDAY = seoul(new Date(Date.now() - 24 * 3600 * 1000));

function post(extra: Partial<Post> = {}): Post {
  return {
    id: "p1",
    library: { id: 101, name: "정독도서관" },
    book: { isbn13: "9788936434120", title: "소년이 온다", author: "한강", cover_url: null },
    image_kind: "color",
    image_url: null,
    image_color: "fill2",
    overlay_text: "오늘 다 읽었어요",
    body: "마지막 장이 오래 남아요.",
    author: { nickname: "책읽는이웃" },
    is_mine: false,
    reaction_count: 2,
    my_reaction: false,
    my_bookmark: false,
    published_at: "2026-11-17T12:00:00+09:00",
    ...extra,
  };
}

function card(id: string, library = "정독도서관"): FeedPost {
  return {
    id, library_id: 101, library_name: library, image_kind: "color", image_url: null, image_color: "fill1",
    overlay_text: `카드 ${id}`, book: null, published_at: "2026-11-17T12:00:00+09:00", my_reaction: false,
    my_bookmark: false,
  };
}

function availability(extra: Partial<AvailabilityItem> = {}): AvailabilityResponse {
  const item: AvailabilityItem = {
    library: { id: 101, name: "정독도서관", address: null, area_label: null, distance_m: null, tel: null,
      today: { date: YESTERDAY, is_closed: false, hours_text: null, holiday_unchecked: false } },
    holding: "yes", loanable: "yes", basis: "stale", source: "data4library", observed_at: null,
    data_date: YESTERDAY, data_date_assumed: false, fallback_reason: null, live_check: null, ...extra,
  };
  return { isbn13: "9788936434120", scope: "library", radius_km: null, dtl_region: null, checked_at: "", items: [item] };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setAuth(status: "signedIn" | "signedOut" | "loading") {
  mockedUseAuth.mockReturnValue({ status } as unknown as ReturnType<typeof useAuth>);
}

async function enter(p: Post = post(), visitLibraryId: number | null = 101) {
  fetchPost.mockResolvedValueOnce(p);
  await render(<PostDetail postId={p.id} visitLibraryId={visitLibraryId} />);
  await screen.findByTestId("detail-action-bar");
}

beforeEach(() => {
  jest.clearAllMocks();
  setAuth("signedIn");
  fetchAvailabilityAt.mockResolvedValue(availability());
  fetchBookPosts.mockResolvedValue({ items: [], next_cursor: null });
  fetchLibraryPosts.mockResolvedValue({ items: [], next_cursor: null });
});

describe("상세 구조와 대여/구매 (H9·H14)", () => {
  test("detail renders clean image top bar and loan priority over yes24 button", async () => {
    await enter();
    const image = screen.getByTestId("detail-image");
    // 이미지 위에는 ‹와 글자만. 사이트 방문·이미지 검색·확대 버튼 없음
    expect(within(image).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["돌아가기"]);
    expect(within(image).getByText("오늘 다 읽었어요")).toBeTruthy();
    expect(screen.queryByText(/사이트 방문|이미지 검색/)).toBeNull();
    const bar = within(screen.getByTestId("detail-action-bar"));
    expect(bar.getByText("♡")).toBeTruthy();
    expect(bar.getByText("2")).toBeTruthy();
    expect(bar.getByLabelText("공유")).toBeTruthy();
    expect(bar.getByLabelText("더 보기")).toBeTruthy();
    expect(bar.getByLabelText(SAVE_TEXT.save)).toBeTruthy();
    const box = within(screen.getByTestId("loan-box"));
    expect(await box.findByText("정독도서관")).toBeTruthy();
    expect(box.getByText("어제 기준 대출 가능")).toBeTruthy();
    expect(fetchAvailabilityAt).toHaveBeenCalledWith("9788936434120", 101, expect.anything());
    const buttons = box.getAllByRole("button").map((b) => b.props.testID);
    expect(buttons).toEqual(["loan-book", "loan-find"]); // 왼쪽 책 정보, 오른쪽 도서관 확인 필(C-87)
    expect(box.getByText(DETAIL_TEXT.findLibrary)).toBeTruthy();
    expect(screen.queryByText(/구매/)).toBeNull(); // 구매 버튼은 카드에서 뺐다(사용자 2026-11-25)
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("책읽는이웃 · 정독도서관")).toBeTruthy();
    expect(screen.getByText("마지막 장이 오래 남아요.")).toBeTruthy();
  });

  test("book info opens book detail and never the library site, even with live check (C-87)", async () => {
    fetchAvailabilityAt.mockResolvedValueOnce(
      availability({ live_check: { url: "https://lib.test/search?isbn=1", kind: "isbn_search" } })
    );
    await enter();
    await within(screen.getByTestId("loan-box")).findByText("어제 기준 대출 가능");
    expect(screen.queryByText(/실시간/)).toBeNull(); // 외부 확인은 조회 창에서만
    await fireEvent.press(screen.getByTestId("loan-book"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/books/[isbn13]", params: { isbn13: "9788936434120" } });
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  test("find pill opens the same book's lookup with the card library pinned (C-87)", async () => {
    await enter(post(), 102); // 방문 중인 도서관 102 → 카드 상태 줄도, 창 맨 위도 102
    await fireEvent.press(await screen.findByTestId("loan-find"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/books/[isbn13]",
      params: { isbn13: "9788936434120", lookup: "1", library: "102" },
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  test("availability failure shows unknown and keeps the rest", async () => {
    fetchAvailabilityAt.mockRejectedValueOnce(new publicApi.ApiCallError(0, "NETWORK", "x", ""));
    await enter();
    const box = within(screen.getByTestId("loan-box"));
    expect(await box.findByText("정독도서관")).toBeTruthy();
    expect(box.getByText("알 수 없음")).toBeTruthy();
    expect(screen.getByText("마지막 장이 오래 남아요.")).toBeTruthy();
    expect(screen.getByTestId("reaction-button")).toBeTruthy();
  });

  test("availability uses the visiting library, falling back to the post library", async () => {
    await enter(post(), 102);
    expect(fetchAvailabilityAt).toHaveBeenCalledWith("9788936434120", 102, expect.anything());
    fetchAvailabilityAt.mockClear();
    await enter(post({ id: "p9" }), null);
    expect(fetchAvailabilityAt).toHaveBeenCalledWith("9788936434120", 101, expect.anything());
  });

  test("loan line of another library's post does not borrow the post library name (①-3)", async () => {
    fetchAvailabilityAt.mockRejectedValueOnce(new publicApi.ApiCallError(0, "NETWORK", "x", ""));
    await enter(post(), 102); // 방문 102, 게시물 101(정독도서관)
    expect(await screen.findByText(DETAIL_TEXT.unknown)).toBeTruthy();
    expect(screen.queryByText("정독도서관 · 알 수 없음")).toBeNull();
    expect(loanLine(null, null)).toBe(DETAIL_TEXT.checking);
    expect(loanLine(null, "failed")).toBe(DETAIL_TEXT.unknown);
  });

  test("post without book has no loan box", async () => {
    await enter(post({ book: null }));
    expect(screen.queryByTestId("loan-box")).toBeNull();
    expect(fetchAvailabilityAt).not.toHaveBeenCalled();
  });

  test("loan line wording", () => {
    const now = new Date("2026-11-17T03:00:00Z");
    const base = availability().items[0]!;
    expect(basisLabel("2026-11-16", now)).toBe("어제 기준");
    expect(basisLabel("2026-11-17", now)).toBe("오늘 기준");
    expect(basisLabel("2026-11-10", now)).toBe("11월 10일 기준");
    expect(loanLine("정독도서관", { ...base, data_date: "2026-11-16" }, now)).toBe("정독도서관 · 어제 기준 대출 가능");
    expect(loanLine("정독도서관", { ...base, loanable: "no", data_date: "2026-11-16" }, now))
      .toBe("정독도서관 · 어제 기준 · 대출 중");
    expect(loanLine("정독도서관", { ...base, holding: "no", loanable: "no" }, now)).toBe("정독도서관 · 소장 없음");
    expect(loanLine("정독도서관", { ...base, loanable: "unknown" }, now)).toBe("정독도서관 · 알 수 없음");
    expect(loanLine("정독도서관", { ...base, data_date: null }, now)).toBe("정독도서관 · 알 수 없음");
    expect(loanLine("정독도서관", "failed", now)).toBe("정독도서관 · 알 수 없음");
  });

  test("other's more menu has share only, mine has withdraw", async () => {
    await enter();
    await fireEvent.press(screen.getByLabelText("더 보기"));
    expect(screen.getByText(MENU_TEXT.share)).toBeTruthy();
    expect(screen.queryByText("게시물 내리기")).toBeNull();
  });

  test("withdrawing my post goes back and tells the feed to hide it", async () => {
    const heard: string[] = [];
    const off = api.onPostWithdrawn((id) => heard.push(id));
    withdrawPost.mockResolvedValueOnce({ id: "p1", status: "withdrawn" });
    await enter(post({ is_mine: true }));
    await fireEvent.press(screen.getByLabelText("더 보기"));
    await fireEvent.press(screen.getByText("게시물 내리기"));
    await fireEvent.press(screen.getByText("내리기"));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(withdrawPost).toHaveBeenCalledWith("p1");
    expect(heard).toEqual(["p1"]);
    off();
  });
});

describe("공감·저장 (H5·H6·H-#5·H-#6)", () => {
  test("detail reaction and bookmark toggle idempotently and block rapid double tap", async () => {
    const reaction = deferred<api.ReactionState>();
    const bookmark = deferred<api.BookmarkState>();
    setReaction.mockReturnValueOnce(reaction.promise).mockResolvedValueOnce({ post_id: "p1", reacted: false, reaction_count: 2 });
    setBookmark.mockReturnValueOnce(bookmark.promise).mockResolvedValueOnce({ post_id: "p1", bookmarked: false });
    await enter();
    await fireEvent.press(screen.getByTestId("reaction-button"));
    await fireEvent.press(screen.getByTestId("reaction-button"));
    await fireEvent.press(screen.getByTestId("save-button"));
    await fireEvent.press(screen.getByTestId("save-button"));
    expect(setReaction).toHaveBeenCalledTimes(1);
    expect(setReaction).toHaveBeenCalledWith("p1", true);
    expect(setBookmark).toHaveBeenCalledTimes(1);
    expect(setBookmark).toHaveBeenCalledWith("p1", true);
    await act(async () => {
      reaction.resolve({ post_id: "p1", reacted: true, reaction_count: 3 });
      bookmark.resolve({ post_id: "p1", bookmarked: true });
    });
    const bar = within(screen.getByTestId("detail-action-bar"));
    expect(bar.getByText("♥")).toBeTruthy();
    expect(bar.getByText("3")).toBeTruthy();
    expect(bar.getByLabelText(SAVE_TEXT.saved)).toBeTruthy();
    // 다시 누르면 확인 창 없이 바로 해제
    await fireEvent.press(screen.getByTestId("save-button"));
    expect(setBookmark).toHaveBeenLastCalledWith("p1", false);
    expect(await bar.findByLabelText(SAVE_TEXT.save)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("reaction-button"));
    expect(setReaction).toHaveBeenLastCalledWith("p1", false);
    expect(await bar.findByText("2")).toBeTruthy();
  });

  test("detail reaction and bookmark changes are sent to feed as field patches", async () => {
    // ①-2: 상세 변경을 피드가 받을 수 있게 바뀐 필드만 알린다. 실패하면 알리지 않는다
    const heard: Array<[string, api.PostReactionPatch]> = [];
    const off = api.onPostReaction((id, patch) => heard.push([id, patch]));
    setReaction
      .mockResolvedValueOnce({ post_id: "p1", reacted: true, reaction_count: 3 })
      .mockRejectedValueOnce(new api.ApiCallError(503, "UPSTREAM", "", ""));
    setBookmark.mockResolvedValueOnce({ post_id: "p1", bookmarked: true });
    await enter();
    await fireEvent.press(screen.getByTestId("reaction-button"));
    await within(screen.getByTestId("detail-action-bar")).findByText("3");
    await fireEvent.press(screen.getByTestId("save-button"));
    await within(screen.getByTestId("detail-action-bar")).findByLabelText(SAVE_TEXT.saved);
    await fireEvent.press(screen.getByTestId("reaction-button"));
    expect(await screen.findByText(MENU_TEXT.failed)).toBeTruthy();
    off();
    expect(heard).toEqual([
      ["p1", { my_reaction: true }],
      ["p1", { my_bookmark: true }],
    ]);
  });

  test("detail signed out reaction or bookmark shows login prompt", async () => {
    setAuth("signedOut");
    await enter();
    await fireEvent.press(screen.getByTestId("reaction-button"));
    expect(await screen.findByText(MENU_TEXT.loginNeeded)).toBeTruthy();
    await fireEvent.press(screen.getByText(MENU_TEXT.close));
    expect(screen.queryByText(MENU_TEXT.loginNeeded)).toBeNull();
    await fireEvent.press(screen.getByTestId("save-button"));
    expect(await screen.findByText(MENU_TEXT.loginNeeded)).toBeTruthy();
    await fireEvent.press(screen.getByText(MENU_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login" });
    expect(setReaction).not.toHaveBeenCalled();
    expect(setBookmark).not.toHaveBeenCalled();
  });

  test("detail reaction or bookmark while auth is restoring shows no login prompt (①-5)", async () => {
    setAuth("loading");
    await enter();
    await fireEvent.press(screen.getByTestId("reaction-button"));
    await fireEvent.press(screen.getByTestId("save-button"));
    expect(screen.queryByText(MENU_TEXT.loginNeeded)).toBeNull();
    expect(setReaction).not.toHaveBeenCalled();
    expect(setBookmark).not.toHaveBeenCalled();
  });

  test("reaction on a post withdrawn meanwhile shows server message", async () => {
    setReaction.mockRejectedValueOnce(
      new api.ApiCallError(404, "POST_NOT_AVAILABLE", "더 이상 공개되지 않는 게시물이에요.", "post_id")
    );
    await enter();
    await fireEvent.press(screen.getByTestId("reaction-button"));
    expect(await screen.findByText("더 이상 공개되지 않는 게시물이에요.")).toBeTruthy();
    expect(within(screen.getByTestId("detail-action-bar")).getByText("2")).toBeTruthy();
  });
});

describe("열 수 없는 글 (H3·H-#3·H-#4)", () => {
  test("detail of withdrawn post shows unavailable message and feed button", async () => {
    fetchPost.mockRejectedValueOnce(
      new api.ApiCallError(404, "POST_NOT_AVAILABLE", "더 이상 공개되지 않는 게시물이에요.", "post_id")
    );
    await render(<PostDetail postId="gone" visitLibraryId={101} />);
    expect(await screen.findByText(DETAIL_TEXT.unavailable)).toBeTruthy();
    expect(screen.queryByTestId("detail-action-bar")).toBeNull();
    expect(screen.queryByText("마지막 장이 오래 남아요.")).toBeNull();
    await fireEvent.press(screen.getByText(DETAIL_TEXT.toFeed));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("unknown post shows not found", async () => {
    fetchPost.mockRejectedValueOnce(new api.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", "post_id"));
    await render(<PostDetail postId="nope" visitLibraryId={101} />);
    expect(await screen.findByText(DETAIL_TEXT.notFound)).toBeTruthy();
  });

  test("network failure shows retry and reloads", async () => {
    fetchPost.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    await render(<PostDetail postId="p1" visitLibraryId={101} />);
    expect(await screen.findByText(DETAIL_TEXT.failed)).toBeTruthy();
    fetchPost.mockResolvedValueOnce(post());
    await fireEvent.press(screen.getByText(DETAIL_TEXT.retry));
    expect(await screen.findByTestId("detail-action-bar")).toBeTruthy();
  });
});

describe("이어지는 글 (H7·H15)", () => {
  test("detail shows same book posts first then library feed and hides same book section when empty", async () => {
    fetchBookPosts.mockResolvedValueOnce({ items: [card("s1", "종로도서관"), card("s2")], next_cursor: null });
    fetchLibraryPosts.mockResolvedValueOnce({ items: [card("p1"), card("l1"), card("l2"), card("l3")], next_cursor: null });
    await enter();
    const same = await screen.findByTestId("same-book-posts");
    const lib = await screen.findByTestId("library-other-posts");
    expect(fetchBookPosts).toHaveBeenCalledWith("9788936434120", { cursor: null, exclude: "p1" }, expect.anything());
    expect(within(same).getByText(RELATED_TEXT.sameBook)).toBeTruthy();
    expect(within(lib).getByText(RELATED_TEXT.library)).toBeTruthy();
    expect(within(same).getAllByTestId(/^post-card-/)).toHaveLength(2);
    expect(within(lib).queryByTestId("post-card-p1")).toBeNull(); // 지금 글 제외
    expect(within(lib).getAllByTestId(/^post-card-/)).toHaveLength(3);
    // 같은 책 묶음이 이 도서관 묶음보다 위
    const order = screen.getAllByText(new RegExp(`${RELATED_TEXT.sameBook}|${RELATED_TEXT.library}`)).map(
      (n) => n.props.children
    );
    expect(order).toEqual([RELATED_TEXT.sameBook, RELATED_TEXT.library]);
    // 다른 도서관 글을 눌러도 방문 중 도서관(테마)을 이어 간다
    await fireEvent.press(within(same).getByTestId("post-card-s1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: "s1", libraryId: "101" } });
    expect(StyleSheet.flatten(screen.getByTestId("detail-scroll").parent?.props.style).backgroundColor)
      .toBe(theme.colors.panelFrosted);
  });

  test("layout width uses container onLayout so 480px WebFrame stays single-column (H14)", async () => {
    await enter();
    const root = screen.getByTestId("detail-scroll").parent!;
    // 480 칼럼(데스크톱 WebFrame)에서는 1열 유지: wideRow(flexDirection: "row")가 생기지 않음
    await fireEvent(root, "layout", { nativeEvent: { layout: { width: 480, height: 800 } } });
    expect(StyleSheet.flatten(screen.getByTestId("detail-image").parent?.props.style)?.flexDirection).not.toBe("row");
    // 768 이상 컨테이너에서는 2열(wideRow)
    await fireEvent(root, "layout", { nativeEvent: { layout: { width: 820, height: 800 } } });
    expect(StyleSheet.flatten(screen.getByTestId("detail-image").parent?.props.style)?.flexDirection).toBe("row");
  });

  test("same book section hidden when zero results", async () => {
    fetchLibraryPosts.mockResolvedValueOnce({ items: [card("l1")], next_cursor: null });
    await enter();
    await screen.findByTestId("library-other-posts");
    expect(fetchBookPosts).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("same-book-posts")).toBeNull();
    expect(screen.queryByText(RELATED_TEXT.sameBook)).toBeNull();
  });

  test("same book section hidden and not requested when post has no book", async () => {
    fetchLibraryPosts.mockResolvedValueOnce({ items: [card("l1")], next_cursor: null });
    await enter(post({ book: null }));
    await screen.findByTestId("library-other-posts");
    expect(fetchBookPosts).not.toHaveBeenCalled();
    expect(screen.queryByText(RELATED_TEXT.sameBook)).toBeNull();
  });

  test("back button uses light ink on dark color or photo/cover and dark ink on light color", async () => {
    await enter(post({ image_kind: "color", image_color: "inkStrong", image_url: null }));
    const darkBtn = screen.getByRole("button", { name: "돌아가기" });
    const darkGlyph = within(darkBtn).getByText("‹");
    expect(StyleSheet.flatten(darkGlyph.props.style)?.color).toBe(ON_FILL_LIGHT);

    await enter(post({ image_kind: "color", image_color: "fill1", image_url: null }));
    const lightBtn = screen.getByRole("button", { name: "돌아가기" });
    const lightGlyph = within(lightBtn).getByText("‹");
    expect(StyleSheet.flatten(lightGlyph.props.style)?.color).toBe(theme.colors.inkStrong);

    await enter(post({ image_kind: "photo", image_color: null, image_url: "https://example.com/a.jpg" }));
    const photoBtn = screen.getByRole("button", { name: "돌아가기" });
    const photoGlyph = within(photoBtn).getByText("‹");
    expect(StyleSheet.flatten(photoGlyph.props.style)?.color).toBe(ON_FILL_LIGHT);
  });
});
