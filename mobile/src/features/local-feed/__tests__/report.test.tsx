import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { registerSignOutCleanup, useAuth } from "../../../auth/AuthProvider";
import { fetchPost, reportTarget, withdrawGuestbook, type FeedItem, type FeedPost, type Post } from "../api";
import { GUESTBOOK_CARD_TEXT } from "../GuestbookCard";
import { LibraryFeed } from "../LibraryFeed";
import { PostDetail } from "../PostDetail";
import { PostMenu } from "../PostMenu";
import { REPORT_TEXT, ReportSheet } from "../ReportSheet";

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockNav = { addListener: () => () => undefined };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter, useNavigation: () => mockNav, useLocalSearchParams: () => ({}),
}));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn(), registerSignOutCleanup: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchPost: jest.fn(), reportTarget: jest.fn(), withdrawGuestbook: jest.fn(),
  fetchLibraryPosts: jest.fn(async () => ({ items: [], next_cursor: null })),
}));

const submit = jest.mocked(reportTarget);
const detail = jest.mocked(fetchPost);
const withdraw = jest.mocked(withdrawGuestbook);
const notice = jest.fn();
const close = jest.fn();

function account(userId: string | null = "account-A") {
  jest.mocked(useAuth).mockReturnValue({ status: userId ? "signedIn" : "signedOut", userId } as ReturnType<typeof useAuth>);
}

function card(id: string): FeedPost {
  return {
    id, library_id: 101, library_name: "도서관", image_kind: "color",
    image_url: null, image_color: "paper", overlay_text: id, book: null,
    published_at: "2026-11-24T00:00:00+09:00", my_reaction: false, my_bookmark: false,
  };
}

function full(id: string, mine = false): Post {
  return {
    ...card(id), library: { id: 101, name: "도서관" }, book: null,
    body: "공개 글", author: { nickname: "독자" }, is_mine: mine, reaction_count: 0,
  };
}

function guestbook(id: string, mine = false): FeedItem {
  return { kind: "guestbook", guestbook: {
    id, library_id: 101, body: id, author_nickname: "독자",
    published_at: "2026-11-24T00:00:00+09:00", mine,
  } };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function sendSpam() {
  await fireEvent.press(screen.getByText("스팸 또는 광고"));
  await fireEvent.press(screen.getByText("신고 보내기"));
}

beforeEach(() => {
  for (const [cleanup] of jest.mocked(registerSignOutCleanup).mock.calls) cleanup();
  account();
  detail.mockReset().mockImplementation(async (id) => full(id, id === "mine"));
  submit.mockReset().mockResolvedValue(undefined);
  withdraw.mockReset().mockResolvedValue(undefined);
  close.mockClear();
  notice.mockClear();
});

test("own post has no report action on its card menu or detail", async () => {
  const menu = await render(<PostMenu post={card("mine")} signedIn
    onClose={close} onChange={jest.fn()} onNotice={notice} onLoginNeeded={jest.fn()} />);
  await waitFor(() => expect(detail).toHaveBeenCalled());
  expect(screen.queryByText(REPORT_TEXT.open)).toBeNull();
  await menu.unmount();
  await render(<PostDetail postId="mine" visitLibraryId={null} />);
  await fireEvent.press(await screen.findByLabelText("더 보기"));
  expect(screen.queryByText(REPORT_TEXT.open)).toBeNull();
  expect(screen.getByText("게시물 내리기")).toBeTruthy();
});

test("report sheet sends once, retains failed input, and drops answers after a target or account change", async () => {
  const failed = deferred();
  const stale = deferred();
  submit.mockReturnValueOnce(failed.promise).mockReturnValueOnce(stale.promise);
  const done = jest.fn();
  const rendered = await render(<ReportSheet target={{ kind: "post", id: "old" }} onClose={close} onDone={done} />);
  await fireEvent.press(screen.getByText("기타"));
  await fireEvent.changeText(screen.getByLabelText("신고 상세"), "  보존할 입력  ");
  const button = screen.getByRole("button", { name: "신고 보내기" });
  await fireEvent.press(button);
  const busyButton = screen.getByRole("button", { name: "보내는 중…" });
  expect(busyButton.props.accessibilityState?.disabled).toBe(true);
  await fireEvent.press(busyButton);
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => failed.reject(new Error("offline")));
  expect(screen.getByDisplayValue("  보존할 입력  ")).toBeTruthy();
  await fireEvent.press(screen.getByText("다시 시도"));
  expect(submit.mock.calls).toEqual([
    [{ kind: "post", id: "old" }, "other", "보존할 입력"],
    [{ kind: "post", id: "old" }, "other", "보존할 입력"],
  ]);
  account("account-B");
  await rendered.rerender(<ReportSheet target={{ kind: "guestbook", id: "current" }} onClose={close} onDone={done} />);
  await fireEvent.press(screen.getByText("기타"));
  await fireEvent.changeText(screen.getByLabelText("신고 상세"), "현재 입력");
  await act(async () => stale.resolve());
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("현재 입력")).toBeTruthy();
  expect(submit).toHaveBeenCalledTimes(2);
});

test("post and guestbook menus separate report and withdrawal and clear collapsed cards on logout", async () => {
  const items: FeedItem[] = [{ kind: "post", post: card("other-post") }, guestbook("other"), guestbook("mine", true)];
  await render(<LibraryFeed items={items} onNotice={notice} />);
  await fireEvent(screen.getByTestId("post-card-other-post"), "longPress");
  await fireEvent.press(await screen.findByText(REPORT_TEXT.open));
  await sendSpam();
  await waitFor(() => expect(submit).toHaveBeenLastCalledWith({ kind: "post", id: "other-post" }, "spam", null));
  expect(notice).toHaveBeenCalledWith(REPORT_TEXT.done);
  expect(screen.getByText(REPORT_TEXT.collapsed)).toBeTruthy();

  await fireEvent.press(within(screen.getByTestId("guestbook-card-other")).getByLabelText(GUESTBOOK_CARD_TEXT.menuLabel));
  await fireEvent.press(screen.getByText(REPORT_TEXT.open));
  await sendSpam();
  expect(submit).toHaveBeenLastCalledWith({ kind: "guestbook", id: "other" }, "spam", null);
  expect(screen.getAllByText(REPORT_TEXT.collapsed)).toHaveLength(2);

  await fireEvent.press(within(screen.getByTestId("guestbook-card-mine")).getByLabelText(GUESTBOOK_CARD_TEXT.menuLabel));
  expect(screen.queryByText(REPORT_TEXT.open)).toBeNull();
  await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
  await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
  expect(withdraw).toHaveBeenCalledWith("mine");

  const [cleanup] = jest.mocked(registerSignOutCleanup).mock.calls[0]!;
  await act(async () => cleanup());
  expect(screen.queryByText(REPORT_TEXT.collapsed)).toBeNull();
  expect(screen.getByTestId("post-card-other-post")).toBeTruthy();
  expect(screen.getByTestId("guestbook-card-other")).toBeTruthy();
});

test("logged-out post and guestbook report paths open a login prompt with zero submissions", async () => {
  account(null);
  const feed = await render(<LibraryFeed items={[guestbook("other")]} onNotice={notice} />);
  await fireEvent.press(screen.getByLabelText(GUESTBOOK_CARD_TEXT.menuLabel));
  await fireEvent.press(screen.getByText(REPORT_TEXT.open));
  expect(screen.getByText(REPORT_TEXT.loginNeeded)).toBeTruthy();
  await feed.unmount();
  await render(<PostDetail postId="other-post" visitLibraryId={null} />);
  await fireEvent.press(await screen.findByLabelText("더 보기"));
  await fireEvent.press(screen.getByText(REPORT_TEXT.open));
  expect(screen.getByText(REPORT_TEXT.loginNeeded)).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});
