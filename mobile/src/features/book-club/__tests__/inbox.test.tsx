// CLUB-2-P4 알림함·제한 안내 (contracts/book-club.md CLUB-2 P5, K2-11·K2-O8·K2-O3·K2-O5, 명세 결정 6·큰 틀 결정 4)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { registerSignOutCleanup, useAuth } from "../../../auth/AuthProvider";
import * as api from "../api";
import type { InboxItem, Restriction } from "../api";
import { INBOX_TEXT, InboxScreen, inboxWhen } from "../InboxScreen";
import { RESTRICTION_TEXT, RestrictionNotice } from "../RestrictionNotice";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
const mockGetPermissions = jest.fn(async () => ({ status: "denied", granted: false }));
const mockRequestPermissions = jest.fn(async () => ({ status: "denied", granted: false }));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => mockGetPermissions(),
  requestPermissionsAsync: () => mockRequestPermissions(),
}));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn(), registerSignOutCleanup: jest.fn() }));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchInbox: jest.fn(),
  markAllRead: jest.fn(),
  fetchMyRestrictions: jest.fn(),
  requestRestrictionReview: jest.fn(),
}));

const m = {
  fetchInbox: jest.mocked(api.fetchInbox),
  markAllRead: jest.mocked(api.markAllRead),
  fetchMyRestrictions: jest.mocked(api.fetchMyRestrictions),
  requestRestrictionReview: jest.mocked(api.requestRestrictionReview),
};
const mockedUseAuth = jest.mocked(useAuth);
const mockedRegister = jest.mocked(registerSignOutCleanup);
const HOUR = 3600 * 1000;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function item(id: string, extra: Partial<InboxItem> = {}): InboxItem {
  return { id, kind: "club_ended", title: `안내 ${id}`, target: { club_id: `club-${id}` }, created_at: ago(HOUR), read: false, ...extra };
}

function signed(status: "signedIn" | "signedOut", userId = "user-a") {
  mockedUseAuth.mockReturnValue({ status, userId: status === "signedIn" ? userId : null } as ReturnType<typeof useAuth>);
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

const A_RESTRICTION: Restriction = {
  id: "r-a", reason_kind: "no_show", ends_at: "2099-11-26T18:00:00+09:00", reason_text: "불참으로 기록됐어요", review_requested: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(m).forEach((fn) => fn.mockReset());
  signed("signedIn");
  mockedRegister.mockImplementation(() => () => {});
  m.markAllRead.mockResolvedValue({ has_unread: false });
  m.fetchMyRestrictions.mockResolvedValue([]);
});

/** 화면 위에서 아래 순서로 testID를 모은다 */
type Json = { props?: Record<string, unknown>; children?: (Json | string)[] | null } | string | null;
function testIds(node: Json | Json[] = screen.toJSON() as Json, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => testIds(n, out));
  else if (node && typeof node === "object") {
    const id = node.props?.testID;
    if (typeof id === "string" && !out.includes(id)) out.push(id);
    (node.children ?? []).forEach((c) => testIds(c as Json, out));
  }
  return out;
}

describe("알림함", () => {
  test("inbox newest first and marks all read on open", async () => {
    // 서버는 최신순(created_at DESC)으로 준다: 새 2 + 지난 2
    m.fetchInbox.mockResolvedValue({
      items: [
        item("n1", { created_at: ago(1 * HOUR) }),
        item("n2", { created_at: ago(2 * HOUR) }),
        item("o1", { created_at: ago(30 * HOUR), read: true }),
        item("o2", { created_at: ago(50 * HOUR), read: true }),
      ],
      next_cursor: null,
    });
    await render(<InboxScreen />);
    await screen.findByTestId("inbox-item-n1");
    expect(testIds().filter((id) => id.startsWith("inbox-item-"))).toEqual([
      "inbox-item-n1",
      "inbox-item-n2",
      "inbox-item-o1",
      "inbox-item-o2",
    ]);
    expect(testIds().filter((id) => id.startsWith("inbox-dot-"))).toEqual(["inbox-dot-n1", "inbox-dot-n2"]);
    await waitFor(() => expect(m.markAllRead).toHaveBeenCalledTimes(1));
    expect(m.fetchInbox).toHaveBeenCalledWith(null, expect.anything());
    expect(screen.getByText("1시간 전")).toBeTruthy();
    expect(screen.getByText("어제")).toBeTruthy();
  });

  test("opening again after read shows no dots", async () => {
    m.fetchInbox.mockResolvedValue({ items: [item("n1", { read: true }), item("n2", { read: true })], next_cursor: null });
    await render(<InboxScreen />);
    await screen.findByTestId("inbox-item-n1");
    expect(testIds().filter((id) => id.startsWith("inbox-dot-"))).toEqual([]);
  });

  test("inbox hides items older than 90 days", async () => {
    m.fetchInbox.mockResolvedValue({
      items: [item("new"), item("d89", { created_at: ago(89 * 24 * HOUR) }), item("d91", { created_at: ago(91 * 24 * HOUR) })],
      next_cursor: null,
    });
    await render(<InboxScreen />);
    await screen.findByTestId("inbox-item-new");
    expect(screen.getByTestId("inbox-item-d89")).toBeTruthy();
    expect(screen.queryByTestId("inbox-item-d91")).toBeNull();
  });

  test("inbox item opens club screen", async () => {
    m.fetchInbox.mockResolvedValue({
      items: [item("a", { kind: "moderation", target: { club_id: "c-9" } }), item("b", { target: { post_id: "p-1" } })],
      next_cursor: null,
    });
    await render(<InboxScreen />);
    await fireEvent.press(await screen.findByTestId("inbox-item-a"));
    expect(mockPush).toHaveBeenCalledWith("/clubs/c-9");
    await fireEvent.press(screen.getByTestId("inbox-item-b"));
    expect(mockPush).toHaveBeenCalledWith("/posts/p-1");
  });

  test("inbox works without device notification permission", async () => {
    m.fetchInbox.mockResolvedValue({ items: [item("a")], next_cursor: null });
    await render(<InboxScreen />);
    expect(await screen.findByText("안내 a")).toBeTruthy();
    expect(mockRequestPermissions).not.toHaveBeenCalled(); // 기기 알림을 묻지도 쓰지도 않는다
    expect(await mockGetPermissions()).toEqual({ status: "denied", granted: false });
  });

  test("inbox cache cleared on sign out", async () => {
    let cleanup: (() => void | Promise<void>) | null = null;
    mockedRegister.mockImplementation((fn) => {
      cleanup = fn;
      return () => {};
    });
    m.fetchInbox.mockResolvedValue({ items: [item("a")], next_cursor: null });
    await render(<InboxScreen />);
    await screen.findByText("안내 a");
    expect(cleanup).not.toBeNull();
    await act(async () => {
      await cleanup!();
    });
    expect(screen.queryByText("안내 a")).toBeNull();
  });

  test.each(["success", "failure"] as const)(
    "late restriction lookup %s after account switch does not show on the new account",
    async (result) => {
      const aRestrictions = deferred<Restriction[]>();
      m.fetchInbox.mockResolvedValueOnce({ items: [item("a")], next_cursor: null });
      m.fetchMyRestrictions.mockReturnValueOnce(aRestrictions.promise); // A의 제한 조회를 보류
      const view = await render(<InboxScreen />);
      await screen.findByText("안내 a");

      const bInbox = deferred<{ items: InboxItem[]; next_cursor: string | null }>();
      m.fetchInbox.mockReturnValueOnce(bInbox.promise);
      m.fetchMyRestrictions.mockResolvedValueOnce([]);
      signed("signedIn", "user-b");
      await view.rerender(<InboxScreen />);
      expect(screen.queryByText("안내 a")).toBeNull(); // 바뀐 즉시 이전 계정 목록을 보여 주지 않는다
      expect(screen.queryByTestId("restriction-notice")).toBeNull();

      await act(async () => {
        if (result === "success") aRestrictions.resolve([A_RESTRICTION]);
        else aRestrictions.reject(new api.ApiCallError(0, "NETWORK", "x", ""));
      });
      expect(screen.queryByTestId("restriction-notice")).toBeNull(); // 아직 B 목록 전: A 제한이 끼어들지 않는다

      await act(async () => bInbox.resolve({ items: [item("b")], next_cursor: null }));
      await screen.findByText("안내 b");
      await waitFor(() => expect(m.fetchMyRestrictions).toHaveBeenCalledTimes(2));
      expect(screen.queryByTestId("restriction-notice")).toBeNull(); // B 화면에 A 제한 없음
      expect(screen.queryByText(RESTRICTION_TEXT.noShowTitle)).toBeNull();
      expect(screen.queryByText("안내 a")).toBeNull();
      expect(screen.queryByText(INBOX_TEXT.loadFailed)).toBeNull(); // 오류·다시 해 보기 없음
    }
  );

  test("empty failure and signed out states", async () => {
    m.fetchInbox.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    m.fetchInbox.mockResolvedValueOnce({ items: [], next_cursor: null });
    await render(<InboxScreen />);
    expect(await screen.findByText(INBOX_TEXT.loadFailed)).toBeTruthy();
    expect(m.markAllRead).not.toHaveBeenCalled(); // 못 불러오면 읽음 처리도 안 한다
    await fireEvent.press(screen.getByText(INBOX_TEXT.retry));
    expect(await screen.findByText(INBOX_TEXT.empty)).toBeTruthy();
  });

  test("signed out inbox asks for login and does not call", async () => {
    signed("signedOut");
    await render(<InboxScreen />);
    expect(screen.getByText(INBOX_TEXT.signedOut)).toBeTruthy();
    expect(m.fetchInbox).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(INBOX_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login", params: { returnTo: "/inbox" } });
  });

  test("scrolling down loads the next page once", async () => {
    m.fetchInbox.mockResolvedValueOnce({ items: [item("a")], next_cursor: "cur-1" });
    m.fetchInbox.mockResolvedValueOnce({ items: [item("b", { read: true })], next_cursor: null });
    await render(<InboxScreen />);
    await screen.findByTestId("inbox-item-a");
    await fireEvent(screen.getByTestId("inbox-list"), "onEndReached");
    expect(await screen.findByTestId("inbox-item-b")).toBeTruthy();
    expect(m.fetchInbox).toHaveBeenLastCalledWith("cur-1");
    await fireEvent(screen.getByTestId("inbox-list"), "onEndReached"); // 마지막 묶음 뒤에는 더 부르지 않는다
    expect(m.fetchInbox).toHaveBeenCalledTimes(2);
  });

  test("restrictions show above the list", async () => {
    m.fetchInbox.mockResolvedValue({ items: [item("a")], next_cursor: null });
    m.fetchMyRestrictions.mockResolvedValue([
      { id: "r1", reason_kind: "no_show", ends_at: "2099-11-26T18:00:00+09:00", reason_text: "불참으로 기록됐어요", review_requested: false },
    ]);
    await render(<InboxScreen />);
    await screen.findByTestId("restriction-notice");
    const ids = testIds();
    expect(ids.indexOf("restriction-notice")).toBeLessThan(ids.indexOf("inbox-item-a"));
  });

  test("when text", () => {
    const now = Date.parse("2026-11-23T12:00:00+09:00");
    expect(inboxWhen("2026-11-23T11:59:40+09:00", now)).toBe("방금");
    expect(inboxWhen("2026-11-23T11:30:00+09:00", now)).toBe("30분 전");
    expect(inboxWhen("2026-11-23T07:00:00+09:00", now)).toBe("5시간 전");
    expect(inboxWhen("2026-11-22T10:00:00+09:00", now)).toBe("어제");
    expect(inboxWhen("2026-11-20T12:00:00+09:00", now)).toBe("3일 전");
    expect(inboxWhen("2026-11-02T08:00:00+09:00", now)).toBe("2026.11.02");
  });
});

describe("내 참가 제한", () => {
  const items: Restriction[] = [
    { id: "c1", reason_kind: "comment", ends_at: null, reason_text: "모임과 관계없는 광고", review_requested: false },
    { id: "n2", reason_kind: "no_show", ends_at: "2099-11-26T18:00:00+09:00", reason_text: "불참으로 기록됐어요", review_requested: false },
    { id: "n1", reason_kind: "no_show", ends_at: "2026-11-01T18:00:00+09:00", reason_text: "불참으로 기록됐어요", review_requested: true },
  ];

  test("restriction notice shows reason expiry and review request once", async () => {
    const pending: { resolve: (r: Restriction) => void } = { resolve: () => {} };
    m.requestRestrictionReview.mockReturnValue(new Promise<Restriction>((r) => (pending.resolve = r)));
    await render(<RestrictionNotice items={items} now={Date.parse("2026-11-23T12:00:00+09:00")} />);
    expect(screen.getByText(RESTRICTION_TEXT.title)).toBeTruthy();
    expect(screen.getByText(RESTRICTION_TEXT.commentReason("모임과 관계없는 광고"))).toBeTruthy();
    expect(screen.getByText("운영자가 풀 때까지 모임 댓글과 참가가 제한돼요.")).toBeTruthy(); // 영구
    expect(screen.getByText("최근 180일 불참 2번째 → 7일 동안 모임 참가와 댓글이 제한돼요. (11.26 18:00까지)")).toBeTruthy();
    expect(screen.getByText(RESTRICTION_TEXT.ended)).toBeTruthy(); // 1번째는 기간이 끝남
    expect(screen.getAllByText(RESTRICTION_TEXT.counted)).toHaveLength(2);
    expect(screen.getAllByText(RESTRICTION_TEXT.reviewed)).toHaveLength(1); // 이미 요청한 것

    await fireEvent.press(screen.getByTestId("restriction-review-c1"));
    await fireEvent.changeText(screen.getByTestId("restriction-review-input-c1"), "광고가 아니었어요");
    const send = screen.getByTestId("restriction-review-send-c1");
    await fireEvent.press(send);
    await fireEvent.press(send);
    expect(m.requestRestrictionReview).toHaveBeenCalledTimes(1);
    expect(m.requestRestrictionReview).toHaveBeenCalledWith("c1", "광고가 아니었어요");
    pending.resolve({ ...items[0]!, review_requested: true });
    expect(await screen.findByText(RESTRICTION_TEXT.reviewDone)).toBeTruthy();
    expect(screen.getAllByText(RESTRICTION_TEXT.reviewed)).toHaveLength(2);
    expect(screen.queryByTestId("restriction-review-c1")).toBeNull();
  });

  test("fourth no show reads as until operator lifts", async () => {
    const four: Restriction[] = [1, 2, 3, 4].map((n) => ({
      id: `n${n}`,
      reason_kind: "no_show" as const,
      ends_at: n === 4 ? null : "2026-11-01T18:00:00+09:00",
      reason_text: "불참으로 기록됐어요",
      review_requested: false,
    })).reverse();
    await render(<RestrictionNotice items={four} now={Date.parse("2026-11-23T12:00:00+09:00")} />);
    expect(screen.getByText("최근 180일 불참 4번째 → 운영자가 풀 때까지 모임 참가와 댓글이 제한돼요.")).toBeTruthy();
  });

  test("review failure keeps text", async () => {
    m.requestRestrictionReview.mockRejectedValue(new api.ApiCallError(0, "NETWORK", "x", ""));
    await render(<RestrictionNotice items={items.slice(0, 1)} />);
    await fireEvent.press(screen.getByTestId("restriction-review-c1"));
    await fireEvent.changeText(screen.getByTestId("restriction-review-input-c1"), "사정");
    await fireEvent.press(screen.getByTestId("restriction-review-send-c1"));
    expect(await screen.findByText(RESTRICTION_TEXT.reviewFailed)).toBeTruthy();
    expect(screen.getByTestId("restriction-review-input-c1").props.value).toBe("사정");
  });
});
