// READ-2-P2 홈 하단 창 "내 최근 독서 기록" (reading-log.md READ-2 P5 · R2-5·R2-6·R2-O4·C6)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import type { ReadingLog, ReadingLogPage } from "../../reading-log/api";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";

const mockPush = jest.fn();
const mockFocusCallbacks = new Set<() => void>();

jest.mock("expo-router", () => {
  const ReactLib = require("react") as typeof import("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    // 화면이 다시 보일 때(focus)를 흉내 낼 수 있게 콜백을 모아 둔다
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactLib.useEffect(() => {
        mockFocusCallbacks.add(cb as () => void);
        const cleanup = cb();
        return () => {
          mockFocusCallbacks.delete(cb as () => void);
          if (typeof cleanup === "function") cleanup();
        };
      }, [cb]);
    },
  };
});

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", userId: null })),
}));

jest.mock("../../local-feed/api", () => ({
  fetchLibraryPosts: jest.fn(async () => ({ items: [], next_cursor: null })),
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(actual.fetchLibrariesNearby),
    fetchRecommendations: jest.fn(actual.fetchRecommendations),
    getFrequentLibraries: jest.fn(actual.getFrequentLibraries),
    fetchLibrary: jest.fn(actual.fetchLibrary),
    locate: jest.fn(async () => ({ ok: true, lat: 37.5815, lng: 126.9831 })),
    getDefaultLibrary: jest.fn(async () => null),
    fetchReadingLogs: jest.fn(),
  };
});

const mockedUseAuth = jest.mocked(useAuth);
const fetchReadingLogs = (api as unknown as { fetchReadingLogs: jest.Mock<(q: { limit?: number }, s?: AbortSignal) => Promise<ReadingLogPage>> })
  .fetchReadingLogs;

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

function signedIn(userId = USER_A) {
  mockedUseAuth.mockReturnValue({ status: "signedIn", userId } as unknown as ReturnType<typeof useAuth>);
}
function signedOut() {
  mockedUseAuth.mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
}

function log(n: number, owner = "A"): ReadingLog {
  const day = String(22 - n).padStart(2, "0");
  return {
    id: `00000000-0000-4000-8000-${owner === "A" ? "a" : "b"}${String(n).padStart(11, "0")}`,
    book: { isbn13: `97911000000${String(n).padStart(2, "0")}`, title: `${owner}의 기록책${n}`, author: null, cover_url: null },
    library: null,
    read_on: `2026-11-${day}`,
    note: null,
    quote: null,
    loan_id: null,
    published_post_id: null,
    created_at: `2026-11-${day}T21:00:00+09:00`,
    updated_at: `2026-11-${day}T21:00:00+09:00`,
  };
}

const SEVEN = Array.from({ length: 7 }, (_, i) => log(i + 1));

function logsAre(items: ReadingLog[]) {
  fetchReadingLogs.mockImplementation(async (q) => ({ items: items.slice(0, q.limit ?? 20), next_cursor: null }));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function openHome() {
  const view = await render(<HomeScreen />);
  await screen.findByTestId("home-sheet");
  // 인기 도서(기존 칸)가 다 그려질 때까지
  await within(screen.getByTestId("popular-books")).findByText("소년이 온다");
  return view;
}

/** 하단 창 안에서 칸이 그려진 순서 */
function sectionOrder(): string[] {
  const json = JSON.stringify(screen.getByTestId("home-sheet-scroll").props.children ? screen.toJSON() : null);
  return ["popular-books", "recent-reading", "library-news"]
    .map((id) => ({ id, at: json.indexOf(`"testID":"${id}"`) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallbacks.clear();
  signedIn();
  logsAre(SEVEN.slice(0, 2));
});

describe("READ-2-P2 홈 내 최근 독서 기록", () => {
  test("home row hidden when signed out or empty", async () => {
    // 비로그인: 묻지도 않고 칸 없음
    signedOut();
    let view = await openHome();
    const sheet = () => within(screen.getByTestId("home-sheet"));
    expect(sheet().queryByText(/독서 기록/)).toBeNull();
    expect(screen.queryByTestId("recent-reading")).toBeNull();
    expect(fetchReadingLogs).not.toHaveBeenCalled();
    expect(screen.getByTestId("library-news")).toBeTruthy();
    await view.unmount();

    // 로그인했지만 기록 0개
    signedIn();
    logsAre([]);
    view = await openHome();
    await waitFor(() => expect(fetchReadingLogs).toHaveBeenCalledTimes(1));
    expect(sheet().queryByText(/독서 기록/)).toBeNull();
    expect(screen.queryByTestId("recent-reading")).toBeNull();
    expect(screen.getByTestId("library-news")).toBeTruthy();
    await view.unmount();

    // 불러오기 실패: 칸을 그리지 않고 다른 칸은 그대로
    fetchReadingLogs.mockRejectedValue(new Error("network"));
    await openHome();
    await waitFor(() => expect(fetchReadingLogs).toHaveBeenCalledTimes(2));
    expect(sheet().queryByText(/독서 기록/)).toBeNull();
    expect(sheet().queryByText(/불러오지 못했어요/)).toBeNull();
    expect(within(screen.getByTestId("popular-books")).getByText("소년이 온다")).toBeTruthy();
    expect(screen.getByTestId("library-news")).toBeTruthy();
  });

  test("home row opens log detail", async () => {
    await openHome();
    const row = await screen.findByTestId("recent-reading");
    const first = SEVEN[0]!;
    await fireEvent.press(within(row).getByLabelText(first.book.title));
    await fireEvent.press(within(row).getByLabelText(first.book.title)); // 연타는 한 번만(W8 가드 그대로)
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/reading/[logId]", params: { logId: first.id } });
  });

  test("home sheet keeps existing sections order", async () => {
    signedOut();
    const view = await openHome();
    expect(sectionOrder()).toEqual(["popular-books", "library-news"]);
    await view.unmount();

    signedIn();
    await openHome();
    await screen.findByTestId("recent-reading");
    expect(sectionOrder()).toEqual(["popular-books", "recent-reading", "library-news"]);
  });

  test("home row sits between popular books and news with up to five covers", async () => {
    logsAre(SEVEN);
    await openHome();
    const row = await screen.findByTestId("recent-reading");
    expect(fetchReadingLogs).toHaveBeenCalledTimes(1);
    expect(fetchReadingLogs.mock.calls[0]![0]).toEqual({ limit: 5 });
    expect(within(row).getByText("내 최근 독서 기록")).toBeTruthy();
    const covers = within(row).getAllByTestId(/^recent-log-/);
    expect(covers).toHaveLength(5);
    expect(covers.map((c) => c.props.accessibilityLabel)).toEqual(SEVEN.slice(0, 5).map((l) => l.book.title));
    expect(sectionOrder()).toEqual(["popular-books", "recent-reading", "library-news"]);
  });

  test("home row drops late response after account switch", async () => {
    const lateA = deferred<ReadingLogPage>();
    fetchReadingLogs.mockReturnValueOnce(lateA.promise);
    const view = await openHome();
    const signalA = fetchReadingLogs.mock.calls[0]![1]!;

    signedIn(USER_B);
    const lateB = deferred<ReadingLogPage>();
    fetchReadingLogs.mockReturnValueOnce(lateB.promise);
    await view.rerender(<HomeScreen />);
    expect(signalA.aborted).toBe(true);

    await act(async () => lateA.resolve({ items: [log(1, "A")], next_cursor: null }));
    expect(screen.queryByTestId("recent-reading")).toBeNull();
    expect(screen.queryAllByText("A의 기록책1")).toHaveLength(0);

    await act(async () => lateB.resolve({ items: [log(1, "B")], next_cursor: null }));
    expect(await screen.findByLabelText("B의 기록책1")).toBeTruthy();
    expect(screen.queryAllByText("A의 기록책1")).toHaveLength(0);

    // 로그아웃하면 칸이 바로 사라진다
    signedOut();
    await view.rerender(<HomeScreen />);
    expect(screen.queryByTestId("recent-reading")).toBeNull();
  });

  test("returning home reloads the row", async () => {
    await openHome();
    await screen.findByTestId("recent-reading");
    expect(fetchReadingLogs).toHaveBeenCalledTimes(1);

    // 기록을 지우고 홈으로 돌아옴 → 다시 받아 0개면 칸이 사라진다
    logsAre([]);
    await act(async () => {
      for (const cb of Array.from(mockFocusCallbacks)) cb();
    });
    await waitFor(() => expect(screen.queryByTestId("recent-reading")).toBeNull());
    expect(fetchReadingLogs.mock.calls.filter((c) => c[0].limit === 5).length).toBeGreaterThanOrEqual(2);
  });
});
