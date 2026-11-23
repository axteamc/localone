// READ-2-P1 책장 숫자 줄·도서관별 보기·한 도서관 책장 (reading-log.md READ-2 P5, specs/reading-log/세부/READ-2.md)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import { CUBE_PALETTE } from "../../../theme/tokens";
import { paletteIndexOf } from "../../library-visit/direction";
import * as api from "../api";
import type { ReadingLog, ReadingLogPage, ReadingStats } from "../api";
import { ReadingLogScreen, TEXT } from "../ReadingLogScreen";
import { useReadingLogs } from "../useReadingLogs";

const mockPush = jest.fn();
const focusListeners: (() => void)[] = [];

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({
    setOptions: () => undefined,
    addListener: (event: string, fn: () => void) => {
      if (event === "focus") focusListeners.push(fn);
      return () => {
        const i = focusListeners.indexOf(fn);
        if (i >= 0) focusListeners.splice(i, 1);
      };
    },
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(),
  registerSignOutCleanup: jest.fn(() => () => undefined),
}));

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, fetchReadingLogs: jest.fn(), fetchReadingStats: jest.fn() };
});

const mockedUseAuth = jest.mocked(useAuth);
const fetchReadingLogs = jest.mocked(api.fetchReadingLogs);
const fetchReadingStats = jest.mocked(api.fetchReadingStats);

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

function signedIn(userId = USER_A) {
  mockedUseAuth.mockReturnValue({ status: "signedIn", userId } as unknown as ReturnType<typeof useAuth>);
}
function signedOut() {
  mockedUseAuth.mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
}

function log(id: string, title: string, libraryId: number | null, readOn = "2026-11-15"): ReadingLog {
  return {
    id,
    book: { isbn13: `97900000${id.padStart(5, "0")}`, title, author: null, cover_url: null },
    library: libraryId === null ? null : { id: libraryId, name: libraryId === 102 ? "서대문도서관" : "마포중앙도서관" },
    read_on: readOn,
    note: null,
    quote: null,
    loan_id: null,
    published_post_id: null,
    created_at: `${readOn}T21:00:00+09:00`,
    updated_at: `${readOn}T21:00:00+09:00`,
  };
}

const page = (items: ReadingLog[], next: string | null = null): ReadingLogPage => ({ items, next_cursor: next });

const ALL = [log("1", "소년이 온다", 101, "2026-11-19"), log("2", "아몬드", 102, "2026-11-22"), log("3", "흰", null, "2026-10-02")];
const LIB_101 = [log("1", "소년이 온다", 101, "2026-11-19"), log("11", "파친코", 101, "2026-10-01")];
const LIB_102 = [log("2", "아몬드", 102, "2026-11-22"), log("12", "시선으로부터", 102, "2026-09-01")];

const STATS: ReadingStats = {
  total: 12,
  this_year: 9,
  this_month: 2,
  libraries: [
    { library_id: 102, name: "서대문도서관", count: 2, last_read_on: "2026-11-22" },
    { library_id: 101, name: "마포중앙도서관", count: 6, last_read_on: "2026-11-19" },
  ],
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 전체 책장·도서관 줄·한 도서관 책장을 `library_id`로 나눠 답한다 */
function logsAre(byLib: { all?: ReadingLog[]; 101?: ReadingLog[]; 102?: ReadingLog[] } = {}) {
  fetchReadingLogs.mockImplementation(async (q) => {
    if (q.libraryId === undefined) return page(byLib.all ?? ALL);
    const items = (byLib[q.libraryId as 101 | 102] ?? (q.libraryId === 101 ? LIB_101 : LIB_102)).slice(0, q.limit ?? 20);
    return page(items);
  });
}

const libCalls = (id: number) => fetchReadingLogs.mock.calls.filter((c) => c[0].libraryId === id);

beforeEach(() => {
  jest.clearAllMocks();
  api.shelfStore.clear();
  focusListeners.length = 0;
  signedIn();
  logsAre();
  fetchReadingStats.mockResolvedValue(STATS);
});

describe("숫자 줄 (R2-O2, 예외 #1·#2)", () => {
  test("stats line shows three numbers and scrolls with shelf", async () => {
    await render(<ReadingLogScreen />);
    const shelf = await screen.findByTestId("shelf");
    expect(await within(shelf).findByText("전체 12 · 올해 9 · 이번 달 2")).toBeTruthy();
    const head = screen.getByTestId("reading-head");
    expect(within(head).getByText(TEXT.title)).toBeTruthy();
    expect(within(head).getByText(TEXT.toggleAll)).toBeTruthy();
    expect(within(head).queryByText("전체 12 · 올해 9 · 이번 달 2")).toBeNull();
    expect(screen.getByLabelText(TEXT.toLibrariesA11y)).toBeTruthy();
    // ⚙ 순서 메뉴는 별도 계약 승인 전이라 그리지 않는다
    expect(screen.queryByText("⚙")).toBeNull();
  });

  test("stats failure keeps shelf and retries stats only", async () => {
    fetchReadingStats.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", ""));
    await render(<ReadingLogScreen />);
    expect(await screen.findByText(TEXT.statsFailed)).toBeTruthy();
    expect(screen.getByTestId("shelf-book-1")).toBeTruthy();
    expect(screen.getByTestId("shelf-book-2")).toBeTruthy();
    expect(screen.queryByText("서버에 연결하지 못했어요.")).toBeNull();
    expect(screen.getByText(`↻ ${TEXT.refresh}`)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(TEXT.refresh));
    expect(await screen.findByText("전체 12 · 올해 9 · 이번 달 2")).toBeTruthy();
    expect(screen.queryByText(TEXT.statsFailed)).toBeNull();
    expect(fetchReadingStats).toHaveBeenCalledTimes(2);
    expect(fetchReadingLogs).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("shelf-book-1")).toBeTruthy();
  });

  test("stats retry leaves a failed shelf request alone", async () => {
    fetchReadingStats.mockRejectedValueOnce(new Error("stats unavailable"));
    fetchReadingLogs.mockRejectedValueOnce(new Error("shelf unavailable"));
    await render(<ReadingLogScreen />);
    await screen.findByText(TEXT.loadFailed);

    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    await fireEvent.press(await screen.findByLabelText(TEXT.refresh));
    await screen.findByTestId("stats-line");

    expect(fetchReadingStats).toHaveBeenCalledTimes(2);
    expect(fetchReadingLogs.mock.calls.filter(([q]) => q.libraryId === undefined)).toHaveLength(1);
  });

  test("zero stats and empty library view", async () => {
    fetchReadingStats.mockResolvedValue({ total: 0, this_year: 0, this_month: 0, libraries: [] });
    logsAre({ all: [] });
    await render(<ReadingLogScreen />);
    expect(await screen.findByText("전체 0 · 올해 0 · 이번 달 0")).toBeTruthy();
    expect(screen.getByText(TEXT.emptyTitle)).toBeTruthy();

    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    expect(screen.getByText("전체 0 · 올해 0 · 이번 달 0")).toBeTruthy();
    expect(screen.getByText(TEXT.libEmptyTitle)).toBeTruthy();
    expect(screen.getByText(TEXT.libEmptyBody)).toBeTruthy();
    expect(screen.getByLabelText(TEXT.write)).toBeTruthy();
    expect(screen.getByText(TEXT.toggleLibraries)).toBeTruthy();
    expect(libCalls(101)).toHaveLength(0);
  });
});

describe("도서관별 보기 (R2-O1·R2-O3, C6)", () => {
  test("library view rows load nine per library with library color", async () => {
    const many = Array.from({ length: 12 }, (_, i) => log(`m${i}`, `책${i}`, 101, `2026-11-${String(19 - i).padStart(2, "0")}`));
    logsAre({ 101: many });
    await render(<ReadingLogScreen />);
    await screen.findByText("전체 12 · 올해 9 · 이번 달 2");
    await fireEvent.press(screen.getByText(TEXT.toggleAll));

    await screen.findByTestId("shelf-book-m0");
    expect(libCalls(101)).toHaveLength(1);
    expect(libCalls(102)).toHaveLength(1);
    expect(libCalls(101)[0]![0]).toEqual({ libraryId: 101, limit: 9 });
    expect(libCalls(102)[0]![0]).toEqual({ libraryId: 102, limit: 9 });
    expect(screen.getByTestId("shelf-book-m8")).toBeTruthy();
    expect(screen.queryByTestId("shelf-book-m9")).toBeNull();

    // 응답 순서 그대로: 첫 줄(최근)만 날짜, 둘째 줄은 권수만
    const tags = screen.getAllByTestId(/^lib-tag-/).map((t) => t.props.testID);
    expect(tags).toEqual(["lib-tag-102", "lib-tag-101"]);
    expect(screen.getByText("서대문도서관 2권 · 최근 11월 22일 ›")).toBeTruthy();
    expect(screen.getByText("마포중앙도서관 6권 ›")).toBeTruthy();
    expect(screen.queryByText(/마포중앙도서관 6권 · 최근/)).toBeNull();

    for (const id of [101, 102]) {
      const hex = CUBE_PALETTE[paletteIndexOf(id, CUBE_PALETTE.length)]!.hex;
      expect(StyleSheet.flatten(screen.getByTestId(`lib-plank-${id}`).props.style).backgroundColor).toBe(hex);
    }
    // 숫자 줄은 도서관별 보기에도 그대로
    expect(within(screen.getByTestId("library-shelf")).getByText("전체 12 · 올해 9 · 이번 달 2")).toBeTruthy();
    // 도서관 없는 기록("흰")은 도서관별 보기에 없다
    expect(screen.queryByTestId("shelf-book-3")).toBeNull();
  });

  test("one library row failure keeps other rows", async () => {
    let fail102 = true;
    fetchReadingLogs.mockImplementation(async (q) => {
      if (q.libraryId === undefined) return page(ALL);
      if (q.libraryId === 102 && fail102) throw new api.ApiCallError(0, "NETWORK", "x", "");
      return page(q.libraryId === 101 ? LIB_101 : LIB_102);
    });
    await render(<ReadingLogScreen />);
    await screen.findByText("전체 12 · 올해 9 · 이번 달 2");
    await fireEvent.press(screen.getByText(TEXT.toggleAll));

    const failed = await screen.findByTestId("lib-row-failed-102");
    expect(within(failed).getByText(TEXT.rowFailed)).toBeTruthy();
    expect(screen.getAllByText(TEXT.rowFailed)).toHaveLength(1);
    expect(screen.getByTestId("lib-tag-102")).toBeTruthy();
    expect(within(screen.getByTestId("lib-row-101")).getByTestId("shelf-book-11")).toBeTruthy();
    expect(screen.getByText("전체 12 · 올해 9 · 이번 달 2")).toBeTruthy();

    fail102 = false;
    const before101 = libCalls(101).length;
    await fireEvent.press(within(failed).getByLabelText(TEXT.refresh));
    expect(await within(screen.getByTestId("lib-row-102")).findByTestId("shelf-book-12")).toBeTruthy();
    expect(libCalls(102)).toHaveLength(2);
    expect(libCalls(101)).toHaveLength(before101);
    expect(fetchReadingStats).toHaveBeenCalledTimes(1);
  });

  test("library tag opens that library shelf and late response is dropped", async () => {
    await render(<ReadingLogScreen />);
    await screen.findByText("전체 12 · 올해 9 · 이번 달 2");
    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    await screen.findByTestId("shelf-book-11");

    const late101 = deferred<ReadingLogPage>();
    const late102 = deferred<ReadingLogPage>();
    fetchReadingLogs.mockImplementation((q) => {
      if (q.libraryId === 101 && q.limit === undefined) return late101.promise;
      if (q.libraryId === 102 && q.limit === undefined) return late102.promise;
      return Promise.resolve(page(q.libraryId === 101 ? LIB_101 : q.libraryId === 102 ? LIB_102 : ALL));
    });

    await fireEvent.press(screen.getByTestId("lib-tag-101"));
    expect(within(screen.getByTestId("reading-head")).getByText("마포중앙도서관")).toBeTruthy();
    expect(within(screen.getByTestId("reading-head")).getByText("6권")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(TEXT.back));
    await fireEvent.press(await screen.findByTestId("lib-tag-102"));

    await act(async () => late101.resolve(page(LIB_101)));
    expect(screen.queryByTestId("shelf-book-11")).toBeNull();
    await act(async () => late102.resolve(page(LIB_102)));
    const head = screen.getByTestId("reading-head");
    expect(within(head).getByText("서대문도서관")).toBeTruthy();
    expect(within(head).getByText("2권")).toBeTruthy();
    expect(await screen.findByTestId("shelf-book-12")).toBeTruthy();
    expect(screen.getByTestId("shelf-book-2")).toBeTruthy();
    expect(screen.queryByTestId("shelf-book-11")).toBeNull();
    expect(screen.queryByTestId("shelf-book-1")).toBeNull();
    expect(fetchReadingLogs.mock.calls.filter((c) => c[0].libraryId === 102 && c[0].limit === undefined)[0]![0]).toEqual({
      libraryId: 102,
      cursor: null,
    });

    // ‹ 로 도서관별 보기로 돌아온다
    await fireEvent.press(screen.getByLabelText(TEXT.back));
    expect(await screen.findByTestId("lib-tag-101")).toBeTruthy();
    expect(screen.getByText(TEXT.toggleLibraries)).toBeTruthy();
  });

  test("toggle twice quickly shows last view only", async () => {
    const stats = deferred<ReadingStats>();
    fetchReadingStats.mockReturnValueOnce(stats.promise);
    await render(<ReadingLogScreen />);
    await screen.findByTestId("shelf-book-1");
    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    await fireEvent.press(screen.getByText(TEXT.toggleLibraries));
    await act(async () => stats.resolve(STATS));

    expect(screen.getByText(TEXT.toggleAll)).toBeTruthy();
    expect(screen.getByTestId("shelf-book-3")).toBeTruthy(); // 전체 책장(도서관 없는 기록 포함)
    expect(screen.queryByTestId(/^lib-tag-/)).toBeNull();
    expect(libCalls(101)).toHaveLength(0);
    expect(screen.queryByText(/알림|안내/)).toBeNull(); // 예외 #3: 따로 안내 없음

    // 줄을 받는 중에 다시 바꾸면 그 줄 요청은 끊긴다
    const signals: AbortSignal[] = [];
    fetchReadingLogs.mockImplementation((q, signal) => {
      if (q.libraryId !== undefined && signal) signals.push(signal);
      return q.libraryId === undefined ? Promise.resolve(page(ALL)) : new Promise(() => undefined);
    });
    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    await fireEvent.press(screen.getByText(TEXT.toggleLibraries));
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(screen.getByTestId("shelf-book-3")).toBeTruthy();
  });

  test("sign out during stats load clears view", async () => {
    const stats = deferred<ReadingStats>();
    fetchReadingStats.mockReturnValueOnce(stats.promise);
    const view = await render(<ReadingLogScreen />);
    await screen.findByTestId("shelf-book-1");
    await fireEvent.press(screen.getByText(TEXT.toggleAll));

    signedOut();
    await view.rerender(<ReadingLogScreen />);
    await act(async () => stats.resolve(STATS));
    expect(screen.queryByText("전체 12 · 올해 9 · 이번 달 2")).toBeNull();
    expect(screen.queryByTestId(/^lib-tag-/)).toBeNull();
    expect(screen.getByText("SIGN IN REQUIRED")).toBeTruthy();

    // 다른 계정으로 들어오면 전체 보기에서 시작하고, A의 숫자는 B 응답 전까지도 보이지 않는다
    signedIn(USER_B);
    fetchReadingStats.mockReturnValueOnce(new Promise(() => undefined));
    await view.rerender(<ReadingLogScreen />);
    expect(screen.queryByText("전체 12 · 올해 9 · 이번 달 2")).toBeNull();
    expect(screen.getByText(TEXT.toggleAll)).toBeTruthy();
  });

  test("account switch during stats load never shows the previous account numbers", async () => {
    const statsA = deferred<ReadingStats>();
    fetchReadingStats.mockReturnValueOnce(statsA.promise);
    const view = await render(<ReadingLogScreen />);
    await screen.findByTestId("shelf-book-1");

    signedIn(USER_B);
    fetchReadingStats.mockReturnValueOnce(new Promise(() => undefined));
    await view.rerender(<ReadingLogScreen />);
    await act(async () => statsA.resolve(STATS));
    expect(screen.queryByText("전체 12 · 올해 9 · 이번 달 2")).toBeNull();
    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    expect(screen.queryByTestId(/^lib-tag-/)).toBeNull();
  });

  test("returning to the tab reloads stats and library rows", async () => {
    await render(<ReadingLogScreen />);
    await screen.findByText("전체 12 · 올해 9 · 이번 달 2");
    await fireEvent.press(screen.getByText(TEXT.toggleAll));
    await screen.findByTestId("shelf-book-11");
    expect(libCalls(101)).toHaveLength(1);

    // 기록을 지우고 돌아옴 → 101이 첫 줄로
    fetchReadingStats.mockResolvedValueOnce({
      ...STATS,
      total: 11,
      libraries: [
        { library_id: 101, name: "마포중앙도서관", count: 6, last_read_on: "2026-11-19" },
        { library_id: 102, name: "서대문도서관", count: 1, last_read_on: "2026-09-01" },
      ],
    });
    await act(async () => focusListeners.forEach((fn) => fn()));
    expect(await screen.findByText("마포중앙도서관 6권 · 최근 11월 19일 ›")).toBeTruthy();
    expect(screen.getByText("서대문도서관 1권 ›")).toBeTruthy();
    expect(fetchReadingStats).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(libCalls(101)).toHaveLength(2));
    expect(libCalls(102)).toHaveLength(2);
  });
});

describe("useReadingLogs 거르기 (C2·C6)", () => {
  test("switching shelves aborts pending pagination and lets the new shelf paginate", async () => {
    const stalePage = deferred<ReadingLogPage>();
    fetchReadingLogs.mockImplementation((q) => {
      if (q.libraryId === 101) {
        return Promise.resolve(q.cursor ? page([LIB_101[1]!]) : page([LIB_101[0]!], "library-next"));
      }
      return q.cursor ? stalePage.promise : Promise.resolve(page(ALL, "all-next"));
    });
    const { result } = await renderHook(() => useReadingLogs());
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => result.current.loadMore());
    const oldSignal = fetchReadingLogs.mock.calls.find(([q]) => q.cursor === "all-next")?.[1];
    expect(result.current.moreLoading).toBe(true);

    await act(async () => result.current.setFilter(101));
    expect(oldSignal?.aborted).toBe(true);
    expect(result.current.moreLoading).toBe(false);
    await act(async () => result.current.loadMore());
    await act(async () => stalePage.resolve(page([ALL[2]!])));

    expect(result.current.items.map((l) => l.id)).toEqual(["1", "11"]);
    expect(result.current.moreLoading).toBe(false);
  });

  test("filter switch shows last library only", async () => {
    const first = deferred<ReadingLogPage>();
    const second = deferred<ReadingLogPage>();
    fetchReadingLogs.mockImplementation((q) => {
      if (q.libraryId === 101) return first.promise;
      if (q.libraryId === 102) return second.promise;
      return Promise.resolve(page(ALL));
    });
    const { result } = await renderHook(() => useReadingLogs());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.filter).toEqual({ libraryId: null });

    await act(async () => result.current.setFilter(101));
    await act(async () => result.current.setFilter(102));
    expect(result.current.filter).toEqual({ libraryId: 102 });
    expect(result.current.status).toBe("loading");

    await act(async () => second.resolve(page(LIB_102)));
    await act(async () => first.resolve(page(LIB_101)));
    expect(result.current.items.map((l) => l.id)).toEqual(["2", "12"]);
    expect(result.current.status).toBe("ready");

    await act(async () => result.current.setFilter(null));
    expect(result.current.items.map((l) => l.id)).toEqual(["1", "2", "3"]);
    expect(result.current.stats).toEqual(STATS);
  });
});
