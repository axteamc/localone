// MY-1-P2 내 정보 화면 — contracts/my-collection.md MY-1 P5 (잠금 7행 + 열린 14행)
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { ApiCallError } from "../../../lib/publicApi";
import * as feedApi from "../../local-feed/api";
import { MENU_TEXT, PostMenu } from "../../local-feed/PostMenu";
import * as api from "../api";
import type { MyCollectionPage, MyCollectionPost, MyProfile } from "../api";
import { FAKE_PROFILE, fakePage, fakePost } from "../__fakes__/myCollectionApi";
import { MyCollectionScreen } from "../MyCollectionScreen";
import { MY_TEXT } from "../useMyCollection";

// 시험 환경(node)에서만 쓰는 모듈 — 앱 tsconfig에 node 타입이 없어 여기서만 선언한다(home-list.test.tsx와 같음)
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(d: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(f: string, enc: "utf8"): string;
};
const path = require("path") as { resolve(...p: string[]): string; join(...p: string[]): string };

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockFocus: (() => void) | null = null;
jest.mock("expo-router", () => {
  const ReactLib = require("react");
  return {
    useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      mockFocus = cb;
      ReactLib.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchMyProfile: jest.fn(),
  fetchMyPosts: jest.fn(),
  fetchMyReactions: jest.fn(),
  fetchMyBookmarks: jest.fn(),
}));
jest.mock("../../local-feed/api", () => ({
  ...jest.requireActual<object>("../../local-feed/api"),
  setReaction: jest.fn(),
  setBookmark: jest.fn(),
}));

const fetchMyProfile = jest.mocked(api.fetchMyProfile);
const fetchMyPosts = jest.mocked(api.fetchMyPosts);
const fetchMyReactions = jest.mocked(api.fetchMyReactions);
const fetchMyBookmarks = jest.mocked(api.fetchMyBookmarks);
const setReaction = jest.mocked(feedApi.setReaction);
const setBookmark = jest.mocked(feedApi.setBookmark);
const mockedUseAuth = jest.mocked(useAuth);

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

function setAuth(status: "signedIn" | "signedOut" | "loading", userId: string | null = USER_A) {
  mockedUseAuth.mockReturnValue({
    status,
    userId: status === "signedIn" ? userId : null,
  } as unknown as ReturnType<typeof useAuth>);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const unavailable = () => new ApiCallError(503, "DB_UNAVAILABLE", "데이터베이스에 연결하지 못했어요.", "");
const network = () => new ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
const gone = () => new ApiCallError(404, "POST_NOT_AVAILABLE", "더 이상 공개되지 않는 게시물이에요.", "post_id");

const liked = (id: string) => fakePost(id, { my_reaction: true, my_bookmark: false });
const saved = (id: string) => fakePost(id, { my_reaction: false, my_bookmark: true });

function cardIds(): string[] {
  return screen
    .queryAllByTestId(/^post-card-/)
    .map((n) => String(n.props.testID).replace("post-card-", ""))
    .sort();
}

async function show() {
  const view = await render(<MyCollectionScreen />);
  await waitFor(() => expect(fetchMyPosts).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

async function pressTab(tab: "posts" | "reactions" | "bookmarks") {
  await fireEvent.press(screen.getByTestId(`tab-${tab}`));
  await act(async () => undefined);
}

async function openMenu(id: string) {
  await fireEvent(screen.getByTestId(`post-card-${id}`), "longPress");
  await waitFor(() => expect(screen.getByTestId("post-menu")).toBeTruthy());
}

function scrollEvent(y: number) {
  return { nativeEvent: { layoutMeasurement: { height: 800 }, contentOffset: { y }, contentSize: { height: 2000 } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus = null;
  setAuth("signedIn");
  fetchMyProfile.mockResolvedValue(FAKE_PROFILE);
  fetchMyPosts.mockResolvedValue(fakePage([fakePost("p1"), fakePost("p2")]));
  fetchMyReactions.mockResolvedValue(fakePage([liked("r1"), liked("r2")]));
  fetchMyBookmarks.mockResolvedValue(fakePage([saved("b1")]));
  setReaction.mockImplementation(async (postId, on) => ({ post_id: postId, reacted: on, reaction_count: on ? 1 : 0 }));
  setBookmark.mockImplementation(async (postId, on) => ({ post_id: postId, bookmarked: on }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("MY-1-P2 잠금 테스트", () => {
  test("signed out renders login prompt without calling me endpoints", async () => {
    setAuth("signedOut");
    await render(<MyCollectionScreen />);
    expect(screen.getByText(MY_TEXT.loginTitle)).toBeTruthy();
    expect(screen.getByText(MY_TEXT.loginSub)).toBeTruthy();
    expect(screen.queryByTestId("collection-tabs")).toBeNull();
    await fireEvent.press(screen.getByText("로그인"));
    expect(mockPush).toHaveBeenCalledWith("/login");
    for (const fn of [fetchMyProfile, fetchMyPosts, fetchMyReactions, fetchMyBookmarks]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  test("initial load selects my posts tab first and renders 3 tabs in order", async () => {
    await show();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.props.testID)).toEqual(["tab-posts", "tab-reactions", "tab-bookmarks"]);
    expect(screen.getByText("내 게시물")).toBeTruthy();
    expect(screen.getByText("좋아요")).toBeTruthy();
    expect(screen.getByText("북마크")).toBeTruthy();
    expect(screen.getByTestId("tab-posts").props.accessibilityState).toEqual({ selected: true });
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    expect(fetchMyPosts.mock.calls[0]![0]).toEqual({ cursor: null });
    expect(fetchMyReactions).not.toHaveBeenCalled();
    expect(fetchMyBookmarks).not.toHaveBeenCalled();
    expect(cardIds()).toEqual(["p1", "p2"]);
    expect(screen.getByText(FAKE_PROFILE.nickname)).toBeTruthy();
  });

  test("tab switch drops late response from previous tab", async () => {
    await show();
    const late = deferred<MyCollectionPage>();
    fetchMyReactions.mockReturnValueOnce(late.promise);
    await pressTab("reactions");
    await pressTab("bookmarks");
    await waitFor(() => expect(cardIds()).toEqual(["b1"]));
    await act(async () => late.resolve(fakePage([liked("late")])));
    expect(cardIds()).toEqual(["b1"]);
    expect(screen.getByTestId("tab-bookmarks").props.accessibilityState).toEqual({ selected: true });
    // 버려진 좋아요 탭은 다시 누르면 새로 부른다
    fetchMyReactions.mockResolvedValueOnce(fakePage([liked("r9")]));
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r9"]));
  });

  test("account change or sign out clears previous user profile and lists", async () => {
    const view = await show();
    expect(screen.getByText(FAKE_PROFILE.nickname)).toBeTruthy();
    await pressTab("reactions"); // A의 좋아요 탭도 읽어 둔다
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    const bProfile = deferred<MyProfile>();
    const bPosts = deferred<MyCollectionPage>();
    fetchMyProfile.mockReturnValueOnce(bProfile.promise);
    fetchMyPosts.mockReturnValueOnce(bPosts.promise);
    setAuth("signedIn", USER_B);
    await view.rerender(<MyCollectionScreen />);
    await act(async () => undefined);
    // B 응답 전: A 닉네임·카드가 바로 사라지고 빈 모양
    expect(screen.queryByText(FAKE_PROFILE.nickname)).toBeNull();
    expect(cardIds()).toEqual([]);
    expect(screen.getByTestId("profile-skeleton")).toBeTruthy();
    expect(screen.getByTestId("card-skeleton")).toBeTruthy();
    expect(screen.getByTestId("tab-posts").props.accessibilityState).toEqual({ selected: true }); // 처음 탭으로
    // B로 바뀐 뒤 좋아요 탭은 A의 것을 보이지 않고 새로 부른다
    const bReactions = deferred<MyCollectionPage>();
    fetchMyReactions.mockReturnValueOnce(bReactions.promise);
    await pressTab("reactions");
    expect(fetchMyReactions).toHaveBeenCalledTimes(2);
    expect(cardIds()).toEqual([]);
    const bSignal = fetchMyProfile.mock.calls[1]![0] as AbortSignal;
    // 로그아웃: 진행 중인 B 요청을 취소하고 로그인 안내만
    setAuth("signedOut");
    await view.rerender(<MyCollectionScreen />);
    await act(async () => undefined);
    expect(bSignal.aborted).toBe(true);
    await act(async () => {
      bProfile.resolve({ ...FAKE_PROFILE, nickname: "B 이웃" });
      bPosts.resolve(fakePage([fakePost("bpost")]));
    });
    expect(screen.queryByText("B 이웃")).toBeNull();
    expect(cardIds()).toEqual([]);
    expect(screen.getByText(MY_TEXT.loginTitle)).toBeTruthy();
  });

  test("post card press navigates to post detail without rendering follow counts", async () => {
    await show();
    await fireEvent.press(screen.getByTestId("post-card-p1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: "p1" } });
    expect(screen.queryByText(/팔로워/)).toBeNull();
    expect(screen.queryByText(/팔로잉/)).toBeNull();
    expect(screen.queryByText(/팔로우/)).toBeNull();
  });

  // auth.md AUTH-2 G6·C7 (#178): 로그인했을 때 머리 ⚙ → /settings
  test("settings gear opens settings screen when signed in", async () => {
    await show();
    await fireEvent.press(screen.getByLabelText(MY_TEXT.settings));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  test("section errors are isolated and retry refetches failed section only", async () => {
    fetchMyProfile.mockRejectedValueOnce(unavailable());
    const view = await show();
    expect(screen.getByText(MY_TEXT.profileFailed)).toBeTruthy();
    expect(cardIds()).toEqual(["p1", "p2"]); // 탭·카드 유지
    expect(screen.getByTestId("collection-tabs")).toBeTruthy();
    await fireEvent.press(screen.getByText(MY_TEXT.reload));
    await waitFor(() => expect(screen.getByText(FAKE_PROFILE.nickname)).toBeTruthy());
    expect(fetchMyProfile).toHaveBeenCalledTimes(2);
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    await view.unmount();

    jest.clearAllMocks();
    fetchMyProfile.mockResolvedValue(FAKE_PROFILE);
    fetchMyPosts.mockRejectedValueOnce(network()).mockResolvedValueOnce(fakePage([fakePost("p1")]));
    await show();
    expect(screen.getByText(MY_TEXT.listFailed)).toBeTruthy();
    expect(screen.getByText(FAKE_PROFILE.nickname)).toBeTruthy(); // 프로필 유지
    expect(screen.queryByText(MY_TEXT.profileFailed)).toBeNull();
    await fireEvent.press(screen.getByText(MY_TEXT.reload));
    await waitFor(() => expect(cardIds()).toEqual(["p1"]));
    expect(fetchMyPosts).toHaveBeenCalledTimes(2);
    expect(fetchMyProfile).toHaveBeenCalledTimes(1);
  });

  test("no hard-coded colors radii or platform branches in my-collection", () => {
    const root = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(e.name)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect([file, src.match(/#[0-9A-Fa-f]{3,8}\b/g)]).toEqual([file, null]);
      expect([file, src.match(/rgba?\(/g)]).toEqual([file, null]);
      expect([file, src.match(/Platform\.OS/g)]).toEqual([file, null]);
      expect([file, src.match(/borderRadius:\s*\d/g)]).toEqual([file, null]);
    }
    expect(files.some((f) => /\.(ios|android|web)\.tsx?$/.test(f))).toBe(false);
  });
});

describe("MY-1-P2 열린 테스트(명세 결정·예외)", () => {
  test("profile header hides bio when null and edit button shows coming soon notice", async () => {
    fetchMyProfile.mockResolvedValue({ ...FAKE_PROFILE, bio: null });
    await show();
    expect(screen.getByText(FAKE_PROFILE.nickname)).toBeTruthy();
    expect(screen.queryByTestId("profile-bio")).toBeNull();
    await fireEvent.press(screen.getByText(MY_TEXT.editProfile));
    await fireEvent.press(screen.getByText(MY_TEXT.editProfile));
    expect(screen.getAllByText(MY_TEXT.editSoon)).toHaveLength(1);
    expect(fetchMyProfile).toHaveBeenCalledTimes(1);
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("empty tab shows tab specific notice and button navigates home", async () => {
    fetchMyPosts.mockResolvedValue(fakePage([]));
    fetchMyReactions.mockResolvedValue(fakePage([]));
    fetchMyBookmarks.mockResolvedValue(fakePage([]));
    await show();
    for (const tab of ["posts", "reactions", "bookmarks"] as const) {
      if (tab !== "posts") await pressTab(tab);
      await waitFor(() => expect(screen.getByTestId(`empty-${tab}`)).toBeTruthy());
      expect(screen.getByText(MY_TEXT.empty[tab].title)).toBeTruthy();
      expect(screen.getByText(MY_TEXT.empty[tab].sub)).toBeTruthy();
      expect(cardIds()).toEqual([]);
      expect(screen.getByTestId("collection-tabs")).toBeTruthy();
      await fireEvent.press(screen.getByText(MY_TEXT.browse));
      expect(mockNavigate).toHaveBeenLastCalledWith("/");
    }
    expect(mockNavigate).toHaveBeenCalledTimes(3);
  });

  test("unlike dims card with undo then removes it after 4 seconds", async () => {
    jest.useFakeTimers();
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    await openMenu("r1");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    expect(setReaction).toHaveBeenCalledWith("r1", false);
    expect(screen.queryByTestId("post-menu")).toBeNull();
    expect(screen.getByTestId("dimmed-r1")).toBeTruthy();
    expect(screen.getByText(MY_TEXT.dimmed)).toBeTruthy();
    expect(screen.getByText(MY_TEXT.unliked)).toBeTruthy();
    expect(screen.getByText(MY_TEXT.undo)).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(3900));
    expect(cardIds()).toEqual(["r1", "r2"]);
    expect(screen.getByText(MY_TEXT.unliked)).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(100));
    expect(cardIds()).toEqual(["r2"]);
    expect(screen.queryByText(MY_TEXT.unliked)).toBeNull();
    expect(screen.queryByText(MY_TEXT.dimmed)).toBeNull();
  });

  test("undo within 4 seconds restores card in place via reaction put", async () => {
    jest.useFakeTimers();
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    const before = screen.getAllByTestId(/^post-card-/).map((n) => n.props.testID);
    await openMenu("r1");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => jest.advanceTimersByTime(2000));
    const put = deferred<feedApi.ReactionState>();
    setReaction.mockReturnValueOnce(put.promise);
    await fireEvent.press(screen.getByText(MY_TEXT.undo));
    await fireEvent.press(screen.getByText(MY_TEXT.undo)); // 연타(예외 #3)
    await act(async () => put.resolve({ post_id: "r1", reacted: true, reaction_count: 1 }));
    expect(setReaction.mock.calls).toEqual([
      ["r1", false],
      ["r1", true],
    ]);
    expect(screen.queryByTestId("dimmed-r1")).toBeNull();
    expect(screen.queryByText(MY_TEXT.unliked)).toBeNull();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.getAllByTestId(/^post-card-/).map((n) => n.props.testID)).toEqual(before); // 같은 자리
    // 되돌린 카드는 다시 좋아요 상태(메뉴가 "좋아요됨")
    await openMenu("r1");
    expect(screen.getByLabelText(MENU_TEXT.liked)).toBeTruthy();
  });

  test("second cancel within 4 seconds removes previously dimmed card immediately", async () => {
    jest.useFakeTimers();
    fetchMyReactions.mockResolvedValue(fakePage([liked("r1"), liked("r2"), liked("r3")]));
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2", "r3"]));
    await openMenu("r1");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => jest.advanceTimersByTime(1000));
    await openMenu("r2");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    expect(cardIds()).toEqual(["r2", "r3"]);
    expect(screen.getByTestId("dimmed-r2")).toBeTruthy();
    expect(screen.getAllByText(MY_TEXT.dimmed)).toHaveLength(1);
    expect(screen.getAllByTestId("my-notice")).toHaveLength(1);
    // 둘째 카드의 4초는 새로 센다
    await act(async () => jest.advanceTimersByTime(3500));
    expect(cardIds()).toEqual(["r2", "r3"]);
    await act(async () => jest.advanceTimersByTime(500));
    expect(cardIds()).toEqual(["r3"]);
  });

  test("bookmark tab unbookmark follows same dim and undo flow", async () => {
    jest.useFakeTimers();
    fetchMyBookmarks.mockResolvedValue(fakePage([saved("b1"), saved("b2")]));
    await show();
    await pressTab("bookmarks");
    await waitFor(() => expect(cardIds()).toEqual(["b1", "b2"]));
    await openMenu("b1");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.bookmarked));
    await act(async () => undefined);
    expect(screen.getByText(MY_TEXT.unbookmarked)).toBeTruthy();
    expect(screen.getByTestId("dimmed-b1")).toBeTruthy();
    await fireEvent.press(screen.getByText(MY_TEXT.undo));
    await act(async () => undefined);
    expect(setBookmark.mock.calls).toEqual([
      ["b1", false],
      ["b1", true],
    ]);
    expect(setReaction).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dimmed-b1")).toBeNull();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(cardIds()).toEqual(["b1", "b2"]);
  });

  test("double press on same card sends one request and failed delete keeps card", async () => {
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    const pending = deferred<feedApi.ReactionState>();
    setReaction.mockReturnValueOnce(pending.promise);
    await openMenu("r1");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    expect(setReaction).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(gone()));
    expect(screen.queryByTestId("dimmed-r1")).toBeNull();
    expect(cardIds()).toEqual(["r1", "r2"]);
    expect(screen.getByText(MY_TEXT.unlikeFailed)).toBeTruthy();
    expect(fetchMyReactions).toHaveBeenCalledTimes(1); // 확정 실패는 다시 부르지 않는다
    // 같은 탭에서 🔖 켜기 실패는 B 기본 문구
    setBookmark.mockRejectedValueOnce(network());
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.bookmark));
    await act(async () => undefined);
    expect(screen.getByText(MENU_TEXT.failed)).toBeTruthy();
    expect(fetchMyReactions).toHaveBeenCalledTimes(1);
  });

  test("next page failure keeps cards and retries same cursor", async () => {
    fetchMyPosts
      .mockResolvedValueOnce(fakePage([fakePost("p1"), fakePost("p2")], "c1"))
      .mockRejectedValueOnce(unavailable())
      .mockRejectedValueOnce(network())
      .mockResolvedValueOnce(fakePage([fakePost("p3"), fakePost("p2")], null));
    await show();
    const scroll = screen.getByTestId("my-collection-scroll");
    await fireEvent.scroll(scroll, scrollEvent(1250));
    await waitFor(() => expect(screen.getByText(MY_TEXT.moreFailed)).toBeTruthy());
    expect(cardIds()).toEqual(["p1", "p2"]);
    // 끝에 머문 채 스크롤이 더 와도 저절로 다시 부르지 않는다
    await fireEvent.scroll(scroll, scrollEvent(1260));
    expect(fetchMyPosts).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByText(MY_TEXT.reload));
    await waitFor(() => expect(fetchMyPosts).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(MY_TEXT.moreFailed)).toBeTruthy());
    // 맨 아래에서 한 번 더 끌어내림
    await fireEvent(scroll, "scrollEndDrag", scrollEvent(1260));
    await waitFor(() => expect(screen.getByText(MY_TEXT.end)).toBeTruthy());
    expect(fetchMyPosts.mock.calls.slice(1).map((c) => c[0])).toEqual([
      { cursor: "c1" },
      { cursor: "c1" },
      { cursor: "c1" },
    ]);
    expect(cardIds()).toEqual(["p1", "p2", "p3"]); // 이어 붙임·중복 0
    expect(screen.getAllByTestId("post-card-p2")).toHaveLength(1);
    expect(screen.queryByText(MY_TEXT.moreFailed)).toBeNull();
  });

  test("revisiting loaded tab reuses cached items and cursor without refetch", async () => {
    fetchMyPosts.mockResolvedValue(fakePage([fakePost("p1")], "p1c"));
    fetchMyReactions.mockResolvedValueOnce(fakePage([liked("r1")], "r1c"));
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1"]));
    await pressTab("posts");
    expect(cardIds()).toEqual(["p1"]);
    expect(screen.queryByTestId("card-skeleton")).toBeNull();
    await pressTab("reactions");
    expect(cardIds()).toEqual(["r1"]);
    expect(screen.queryByTestId("card-skeleton")).toBeNull();
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    expect(fetchMyReactions).toHaveBeenCalledTimes(1);
    fetchMyReactions.mockResolvedValueOnce(fakePage([liked("r2")], null));
    await fireEvent.scroll(screen.getByTestId("my-collection-scroll"), scrollEvent(1250));
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    expect(fetchMyReactions.mock.calls[1]![0]).toEqual({ cursor: "r1c" });
  });

  test("pull to refresh refetches active tab first page and profile only", async () => {
    fetchMyReactions
      .mockResolvedValueOnce(fakePage([liked("r1")], "r1c"))
      .mockResolvedValueOnce(fakePage([liked("r2")], null));
    await show();
    await pressTab("bookmarks");
    await waitFor(() => expect(cardIds()).toEqual(["b1"]));
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1"]));
    await fireEvent.scroll(screen.getByTestId("my-collection-scroll"), scrollEvent(1250));
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    const fresh = deferred<MyCollectionPage>();
    fetchMyReactions.mockReturnValueOnce(fresh.promise);
    fetchMyProfile.mockResolvedValueOnce({ ...FAKE_PROFILE, nickname: "새 이름" });
    await act(async () => {
      screen.getByTestId("my-collection-scroll").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByTestId("my-collection-scroll").props.refreshControl.props.refreshing).toBe(true);
    expect(cardIds()).toEqual(["r1", "r2"]); // 받기 전 유지
    await act(async () => fresh.resolve(fakePage([liked("r5")], "r5c")));
    expect(cardIds()).toEqual(["r5"]); // 2쪽 카드 잔존 0
    expect(screen.getByTestId("my-collection-scroll").props.refreshControl.props.refreshing).toBe(false);
    expect(screen.getByText("새 이름")).toBeTruthy();
    expect(fetchMyProfile).toHaveBeenCalledTimes(2);
    expect(fetchMyReactions).toHaveBeenCalledTimes(3);
    expect(fetchMyReactions.mock.calls[2]![0]).toEqual({ cursor: null });
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    expect(fetchMyBookmarks).toHaveBeenCalledTimes(1);
    // 새 커서로 이어 간다
    fetchMyReactions.mockResolvedValueOnce(fakePage([], null));
    await fireEvent.scroll(screen.getByTestId("my-collection-scroll"), scrollEvent(0));
    await fireEvent.scroll(screen.getByTestId("my-collection-scroll"), scrollEvent(1250));
    await waitFor(() => expect(fetchMyReactions).toHaveBeenCalledTimes(4));
    expect(fetchMyReactions.mock.calls[3]![0]).toEqual({ cursor: "r5c" });
  });

  test("returning from post detail silently refetches active tab keeping cards until response", async () => {
    await show();
    expect(mockFocus).not.toBeNull();
    // 첫 진입 포커스는 최초 조회 외 추가 호출 0
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    expect(fetchMyProfile).toHaveBeenCalledTimes(1);
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    await fireEvent.press(screen.getByTestId("post-card-r1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: "r1" } });
    const back = deferred<MyCollectionPage>();
    fetchMyReactions.mockReturnValueOnce(back.promise);
    await act(async () => mockFocus!());
    expect(cardIds()).toEqual(["r1", "r2"]);
    expect(screen.queryByTestId("card-skeleton")).toBeNull();
    expect(screen.queryByTestId(/^empty-/)).toBeNull();
    expect(fetchMyReactions).toHaveBeenCalledTimes(2);
    expect(fetchMyReactions.mock.calls[1]![0]).toEqual({ cursor: null });
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    expect(fetchMyProfile).toHaveBeenCalledTimes(1);
    await act(async () => back.resolve(fakePage([liked("r2")])));
    expect(cardIds()).toEqual(["r2"]);
  });

  test("reaction change elsewhere patches same post in all tabs and drops changed collection cache", async () => {
    const P = fakePost("P", { my_reaction: false, my_bookmark: true });
    fetchMyPosts.mockResolvedValue(fakePage([P, fakePost("p2")]));
    fetchMyBookmarks.mockResolvedValueOnce(fakePage([P]));
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["r1", "r2"]));
    await pressTab("bookmarks");
    await waitFor(() => expect(cardIds()).toEqual(["P"]));
    await pressTab("posts");
    expect(cardIds()).toEqual(["P", "p2"]);
    // 내 게시물 탭의 P 메뉴에서 🔖 해제 → 목록에서 빠지지 않음(⑥)
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.bookmarked));
    await act(async () => undefined);
    expect(setBookmark).toHaveBeenCalledWith("P", false);
    expect(screen.queryByTestId("dimmed-P")).toBeNull();
    expect(cardIds()).toEqual(["P", "p2"]);
    // 내 게시물 캐시의 P는 my_bookmark=false: 메뉴가 "북마크"로 보인다(다음 누름이 PUT)
    expect(screen.getByLabelText(MENU_TEXT.bookmark)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("메뉴 닫기"));
    // 북마크 탭은 모음이 바뀌어 버려졌다 → 다시 누르면 첫 페이지부터, 응답 전 빈 모양
    const again = deferred<MyCollectionPage>();
    fetchMyBookmarks.mockReturnValueOnce(again.promise);
    await pressTab("bookmarks");
    expect(fetchMyBookmarks).toHaveBeenCalledTimes(2);
    expect(fetchMyBookmarks.mock.calls[1]![0]).toEqual({ cursor: null });
    expect(screen.getByTestId("card-skeleton")).toBeTruthy();
    expect(cardIds()).toEqual([]);
    await act(async () => again.resolve(fakePage([])));
    // 다른 화면(상세)에서 P에 좋아요 → 좋아요 탭 캐시를 버림
    await act(async () => feedApi.emitPostReaction("P", { my_reaction: true }));
    fetchMyReactions.mockResolvedValueOnce(fakePage([liked("P"), liked("r1")]));
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P", "r1"]));
    expect(fetchMyReactions).toHaveBeenCalledTimes(2);
    // 모음이 안 바뀐 탭은 다시 부르지 않음
    await pressTab("posts");
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    await openMenu("P");
    expect(screen.getByLabelText(MENU_TEXT.liked)).toBeTruthy(); // 내 게시물 캐시도 my_reaction=true
  });

  test("unknown result on unlike or undo reconciles with silent refetch instead of guessing", async () => {
    // ① DELETE 응답 없음(status 0) → 안내 + 조용히 다시 불러 서버 목록대로
    const P = liked("P");
    const Q = liked("Q");
    fetchMyReactions.mockResolvedValueOnce(fakePage([P, Q]));
    let view = await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P", "Q"]));
    const re1 = deferred<MyCollectionPage>();
    fetchMyReactions.mockReturnValueOnce(re1.promise);
    setReaction.mockRejectedValueOnce(network());
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    expect(screen.getByText(MY_TEXT.unlikeFailed)).toBeTruthy();
    expect(fetchMyReactions).toHaveBeenCalledTimes(2);
    expect(fetchMyReactions.mock.calls[1]![0]).toEqual({ cursor: null });
    expect(cardIds()).toEqual(["P", "Q"]);
    expect(screen.queryByTestId("dimmed-P")).toBeNull();
    await act(async () => re1.resolve(fakePage([Q])));
    expect(cardIds()).toEqual(["Q"]);
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    await view.unmount();

    // ② DELETE 성공 → 되돌리기 PUT 503 → 안내 + 조용히 다시 불러 P가 보통 모습으로
    jest.clearAllMocks();
    fetchMyProfile.mockResolvedValue(FAKE_PROFILE);
    fetchMyPosts.mockResolvedValue(fakePage([fakePost("p1")]));
    fetchMyReactions.mockResolvedValueOnce(fakePage([P, Q]));
    setReaction.mockResolvedValueOnce({ post_id: "P", reacted: false, reaction_count: 0 });
    setReaction.mockRejectedValueOnce(unavailable());
    view = await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P", "Q"]));
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    expect(screen.getByTestId("dimmed-P")).toBeTruthy();
    const re2 = deferred<MyCollectionPage>();
    fetchMyReactions.mockReturnValueOnce(re2.promise);
    await fireEvent.press(screen.getByText(MY_TEXT.undo));
    await act(async () => undefined);
    expect(screen.getByText(MY_TEXT.undoFailed)).toBeTruthy();
    expect(fetchMyReactions).toHaveBeenCalledTimes(2);
    expect(fetchMyReactions.mock.calls[1]![0]).toEqual({ cursor: null });
    expect(cardIds()).toEqual(["P", "Q"]);
    expect(screen.queryByTestId("dimmed-P")).toBeNull();
    await act(async () => re2.resolve(fakePage([P, Q])));
    expect(cardIds()).toEqual(["P", "Q"]);
    expect(screen.queryByTestId("dimmed-P")).toBeNull();
    expect(fetchMyPosts).toHaveBeenCalledTimes(1);
    await view.unmount();

    // ③ 되돌리기 PUT 404(확정 실패) → 안내 뒤 다시 부르지 않고 P 제거
    jest.clearAllMocks();
    jest.useFakeTimers();
    fetchMyProfile.mockResolvedValue(FAKE_PROFILE);
    fetchMyPosts.mockResolvedValue(fakePage([fakePost("p1")]));
    fetchMyReactions.mockResolvedValueOnce(fakePage([P, Q]));
    setReaction.mockResolvedValueOnce({ post_id: "P", reacted: false, reaction_count: 0 });
    setReaction.mockRejectedValueOnce(gone());
    view = await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P", "Q"]));
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    await fireEvent.press(screen.getByText(MY_TEXT.undo));
    await act(async () => undefined);
    expect(screen.getByText(MY_TEXT.undoFailed)).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(cardIds()).toEqual(["Q"]);
    expect(fetchMyReactions).toHaveBeenCalledTimes(1);
  });

  test("post menu without failText keeps default fail text", async () => {
    const post = fakePost("m1", { my_reaction: false });
    const onNotice = jest.fn();
    setReaction.mockRejectedValue(network());
    const view = await render(
      <PostMenu post={post} signedIn onClose={jest.fn()} onChange={jest.fn()} onNotice={onNotice} onLoginNeeded={jest.fn()} />
    );
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.like));
    await act(async () => undefined);
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith("지금은 처리하지 못했어요. 다시 시도해 주세요.");
    expect(MENU_TEXT.failed).toBe("지금은 처리하지 못했어요. 다시 시도해 주세요.");
    await view.unmount();

    onNotice.mockClear();
    const failText = jest.fn((_kind: "reaction" | "bookmark", _e: unknown) => "바꾼 문구");
    await render(
      <PostMenu
        post={post}
        signedIn
        onClose={jest.fn()}
        onChange={jest.fn()}
        onNotice={onNotice}
        onLoginNeeded={jest.fn()}
        failText={failText}
      />
    );
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.like));
    await act(async () => undefined);
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith("바꾼 문구");
    expect(failText).toHaveBeenCalledTimes(1);
    expect(failText.mock.calls[0]![0]).toBe("reaction");
  });

  test("stale PostMenu response from previous account does not mutate new account", async () => {
    jest.useFakeTimers();
    const sharedP = liked("P");
    fetchMyReactions.mockResolvedValue(fakePage([sharedP]));
    const view = await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P"]));

    // A 계정에서 P 좋아요 해제 요청을 보류한 채 B 계정으로 전환
    const pendingDelete = deferred<feedApi.ReactionState>();
    setReaction.mockReturnValueOnce(pendingDelete.promise);
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));

    setAuth("signedIn", USER_B);
    await view.rerender(<MyCollectionScreen />);
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P"]));

    // 뒤늦게 이전 A 계정의 DELETE 응답이 성공해도 B 계정의 P는 유지되어야 한다
    await act(async () => pendingDelete.resolve({ post_id: "P", reacted: false, reaction_count: 0 }));
    expect(screen.queryByTestId("dimmed-P")).toBeNull();
    expect(screen.queryByText(MY_TEXT.unliked)).toBeNull();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(cardIds()).toEqual(["P"]);
    await openMenu("P");
    expect(screen.getByLabelText(MENU_TEXT.liked)).toBeTruthy();
  });

  test("unknown result invalidates other cached tabs containing the post so next request uses server state", async () => {
    const P = fakePost("P", { my_reaction: true, my_bookmark: true });
    fetchMyPosts.mockResolvedValueOnce(fakePage([P]));
    fetchMyBookmarks.mockResolvedValueOnce(fakePage([P]));
    fetchMyReactions.mockResolvedValueOnce(fakePage([P]));
    await show();
    await pressTab("bookmarks");
    await waitFor(() => expect(cardIds()).toEqual(["P"]));
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P"]));

    // 좋아요 탭에서 P 해제 응답 유실(status 0) → 서버에서는 이미 해제된 상태
    fetchMyReactions.mockResolvedValueOnce(fakePage([]));
    setReaction.mockRejectedValueOnce(network());
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    expect(screen.getByText(MY_TEXT.unlikeFailed)).toBeTruthy();

    // 북마크 탭으로 넘어가면 캐시가 무효화되어 서버에서 최신 상태(my_reaction: false)를 다시 받아온다
    fetchMyBookmarks.mockResolvedValueOnce(fakePage([fakePost("P", { my_reaction: false, my_bookmark: true })]));
    await pressTab("bookmarks");
    await waitFor(() => expect(fetchMyBookmarks).toHaveBeenCalledTimes(2));
    await openMenu("P");
    expect(screen.getByLabelText(MENU_TEXT.like)).toBeTruthy();
    setReaction.mockResolvedValueOnce({ post_id: "P", reacted: true, reaction_count: 1 });
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.like));
    await act(async () => undefined);
    expect(setReaction).toHaveBeenLastCalledWith("P", true);
  });

  test("previous undo completion does not clear newer card dim or undo notice", async () => {
    jest.useFakeTimers();
    fetchMyReactions.mockResolvedValueOnce(fakePage([liked("P"), liked("Q"), liked("R")]));
    await show();
    await pressTab("reactions");
    await waitFor(() => expect(cardIds()).toEqual(["P", "Q", "R"]));

    // P 취소 후 되돌리기 PUT을 보류
    await openMenu("P");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    const putP = deferred<feedApi.ReactionState>();
    setReaction.mockReturnValueOnce(putP.promise);
    await fireEvent.press(screen.getByText(MY_TEXT.undo));

    // P의 PUT이 진행 중인 동안 Q 취소
    await openMenu("Q");
    await fireEvent.press(screen.getByLabelText(MENU_TEXT.liked));
    await act(async () => undefined);
    expect(screen.getByTestId("dimmed-Q")).toBeTruthy();
    expect(screen.getByText(MY_TEXT.unliked)).toBeTruthy();

    // 뒤늦게 P의 PUT이 성공해도 P는 복원되고 Q의 흐림·안내는 유지된다
    await act(async () => putP.resolve({ post_id: "P", reacted: true, reaction_count: 1 }));
    expect(screen.getByTestId("dimmed-Q")).toBeTruthy();
    expect(screen.getByText(MY_TEXT.unliked)).toBeTruthy();
    expect(screen.getByText(MY_TEXT.undo)).toBeTruthy();
    expect(cardIds()).toEqual(["P", "Q", "R"]);

    // 4초 뒤 Q만 제거되고 P와 R은 남는다
    await act(async () => jest.advanceTimersByTime(4000));
    expect(cardIds()).toEqual(["P", "R"]);
  });
});

// 시험 데이터 형태 점검(가짜 응답이 계약 C3 MyCollectionPost 키를 모두 갖는지)
test("fake page matches MyCollectionPost shape", () => {
  const keys: (keyof MyCollectionPost)[] = [
    "id", "library_id", "library_name", "image_kind", "image_url", "image_color", "overlay_text", "book",
    "published_at", "my_reaction", "my_bookmark", "item_kind", "collected_at",
  ];
  expect(Object.keys(fakePost("x")).sort()).toEqual([...keys].sort());
});
