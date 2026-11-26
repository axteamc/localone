import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { fetchUserPosts, fetchUserProfile, type UserPostsPage } from "../api";
import { PROFILE_TEXT, UserProfileScreen } from "../UserProfileScreen";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ status: "signedOut", userId: null }),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchUserProfile: jest.fn(),
  fetchUserPosts: jest.fn(),
}));

const profileId = "author-profile";
const getProfile = jest.mocked(fetchUserProfile);
const getPosts = jest.mocked(fetchUserPosts);
const emptyPage = { items: [], next_cursor: null };
const profile = {
  profile_id: profileId, nickname: "이웃", avatar_url: null, bio: null,
  post_count: 1, reading_log_count: 1, is_me: false,
};

function deferredPage() {
  let resolve!: (value: UserPostsPage) => void;
  const promise = new Promise<UserPostsPage>((done) => { resolve = done; });
  return { resolve, promise };
}

function page(label: string): UserPostsPage {
  return { next_cursor: null, items: [{
    id: label, library_id: 101, library_name: "정독도서관",
    image_kind: "color", image_url: null, image_color: "fill1",
    overlay_text: label, book: null, published_at: "2026-11-17T12:00:00+09:00",
    my_reaction: false, my_bookmark: false,
  }] };
}

beforeEach(() => {
  getProfile.mockReset();
  getPosts.mockReset().mockResolvedValue(emptyPage);
  getProfile.mockResolvedValue(profile);
});

test("opens the reading log tab first when the author has no regular posts", async () => {
  getProfile.mockResolvedValue({ ...profile, post_count: 0 });
  await render(<UserProfileScreen profileId={profileId} />);

  await screen.findByText(PROFILE_TEXT.emptyLog);
  expect(screen.getByTestId("tab-reading_log").props.accessibilityState.selected).toBe(true);
  expect(getPosts.mock.calls.map(([, origin]) => origin)).toEqual(["reading_log"]);
});

test("reopens a canceled tab and renders only the latest response", async () => {
  const firstPost = deferredPage();
  const firstLog = deferredPage();
  const lastPost = deferredPage();
  getPosts.mockReturnValueOnce(firstPost.promise).mockReturnValueOnce(firstLog.promise)
    .mockReturnValueOnce(lastPost.promise);

  await render(<UserProfileScreen profileId={profileId} />);
  await fireEvent.press(await screen.findByTestId("tab-reading_log"));
  await fireEvent.press(screen.getByTestId("tab-post"));

  expect(getPosts.mock.calls.map(([, origin]) => origin)).toEqual(["post", "reading_log", "post"]);
  expect(getPosts.mock.calls[0]?.[3]?.aborted).toBe(true);
  expect(getPosts.mock.calls[1]?.[3]?.aborted).toBe(true);
  await act(async () => { lastPost.resolve(page("최신 게시물")); });
  await act(async () => {
    firstPost.resolve(page("오래된 게시물"));
    firstLog.resolve(page("늦은 독서 기록"));
  });

  expect(screen.getByText("최신 게시물")).toBeTruthy();
  expect(screen.queryByText("오래된 게시물")).toBeNull();
  expect(screen.queryByText("늦은 독서 기록")).toBeNull();
});

test("can request the next page again after switching away mid-request", async () => {
  const canceledPage = deferredPage();
  getPosts.mockResolvedValueOnce({ ...page("첫 게시물"), next_cursor: "cursor" })
    .mockReturnValueOnce(canceledPage.promise)
    .mockResolvedValueOnce(emptyPage)
    .mockResolvedValueOnce(page("다음 게시물"));
  await render(<UserProfileScreen profileId={profileId} />);
  await screen.findByText("첫 게시물");

  async function scrollToEnd() {
    await fireEvent.scroll(screen.getByTestId("user-profile-scroll"), { nativeEvent: {
      layoutMeasurement: { height: 500 }, contentOffset: { y: 600 }, contentSize: { height: 1100 },
    } });
  }

  await scrollToEnd();
  await fireEvent.press(screen.getByTestId("tab-reading_log"));
  await screen.findByText(PROFILE_TEXT.emptyLog);
  await fireEvent.press(screen.getByTestId("tab-post"));
  await scrollToEnd();
  await screen.findByText("다음 게시물");
  await act(async () => { canceledPage.resolve(page("취소된 게시물")); });

  expect(getPosts.mock.calls.map(([, origin, cursor]) => [origin, cursor])).toEqual([
    ["post", null], ["post", "cursor"], ["reading_log", null], ["post", "cursor"],
  ]);
  expect(screen.queryByText("취소된 게시물")).toBeNull();
});
