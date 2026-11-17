// LIB-1-P1 검색 진입·결과 (book-search.md LIB-1 P5)
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import * as api from "../__fakes__/publicApi";
import type { Book, BookSearchResponse, RecommendationResponse } from "../__fakes__/publicApi";
import {
  clearRecentBooks,
  listRecentBooks,
  pushRecentBook,
  removeRecentBook,
} from "../recentBooks";
import { SearchScreen } from "../SearchScreen";
import { suggestionQueries } from "../useBookSearch";

// @types/node 없이 쓰는 최소 타입(소스 검사용)
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: "utf8"): string;
};
const path = require("path") as { join(...parts: string[]): string };

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => {
  const ReactLib = require("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    // 화면이 처음 보일 때 한 번 부른다(포커스가 다시 오는 일은 테스트에서 없음)
    useFocusEffect: (cb: () => void) => ReactLib.useEffect(cb, [cb]),
    Stack: { Screen: () => null },
  };
});

jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));

jest.mock("../__fakes__/publicApi", () => {
  const actual = jest.requireActual<typeof import("../__fakes__/publicApi")>(
    "../__fakes__/publicApi"
  );
  return {
    ...actual,
    searchBooks: jest.fn(),
    fetchRecommendations: jest.fn(),
    fetchBook: jest.fn(),
    fetchAvailabilityNearby: jest.fn(),
  };
});

const searchBooks = jest.mocked(api.searchBooks);
const fetchRecommendations = jest.mocked(api.fetchRecommendations);
const fetchAvailabilityNearby = jest.mocked(api.fetchAvailabilityNearby);
const mockedUseAuth = jest.mocked(useAuth);

const USER_A = "00000000-0000-4000-8000-00000000000a";

function book(n: number, extra: Partial<Book> = {}): Book {
  return {
    isbn13: `97800000000${String(n).padStart(2, "0")}`,
    title: `책 ${n}`,
    author: `저자 ${n}`,
    publisher: "창비",
    cover_url: null,
    source: "naver",
    description: null,
    pub_year: 2014,
    ...extra,
  };
}

function page(items: Book[], next: number | null = null): BookSearchResponse {
  return { items, next_start: next, source: "naver", fallback_reason: null };
}

const REC: RecommendationResponse = {
  kind: "popular",
  scope: "national",
  library_id: null,
  basis_label: "전국 · 최근 30일 대출",
  theme: null,
  books: [book(1, { title: "불편한 편의점" }), book(2, { title: "소년이 온다" })],
  fetched_at: "2026-11-16T06:00:00+09:00",
  stale: false,
  fallback_reason: null,
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

const providerDown = () => new api.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", "");

async function typeAndSearch(q: string) {
  await fireEvent.changeText(screen.getByTestId("search-input"), q);
  await fireEvent.press(screen.getByTestId("search-button"));
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = {};
  await AsyncStorage.clear();
  mockedUseAuth.mockReturnValue({
    status: "signedOut",
    userId: null,
    signInWithGoogle: jest.fn<() => Promise<never>>(),
    signInWithApple: jest.fn<() => Promise<never>>(),
  } as unknown as ReturnType<typeof useAuth>);
  fetchRecommendations.mockResolvedValue(REC);
  searchBooks.mockResolvedValue(page([book(1), book(2)]));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("검색 진입 화면", () => {
  test("entry shows national recommendations with basis label", async () => {
    await render(<SearchScreen />);
    expect(await screen.findByText("전국 · 최근 30일 대출")).toBeTruthy();
    expect(screen.getByText(/인기 도서/)).toBeTruthy();
    expect(fetchRecommendations).toHaveBeenCalledTimes(1);
    expect(fetchRecommendations.mock.calls[0]![0]).toBeUndefined(); // 도서관 기준 아님
  });

  test("entry order is recent then popular", async () => {
    await pushRecentBook(null, book(7, { title: "작별인사" }));
    await pushRecentBook(null, book(8, { title: "하얼빈" }));
    await render(<SearchScreen />);
    await screen.findByText("하얼빈");
    await screen.findByText("불편한 편의점");
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf("최근 본 도서")).toBeGreaterThan(-1);
    expect(json.indexOf("최근 본 도서")).toBeLessThan(json.indexOf("인기 도서"));
    // 순위 번호와 함께
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  test("first day hides recent section", async () => {
    await render(<SearchScreen />);
    await screen.findByText("불편한 편의점");
    expect(screen.queryByTestId("recent-section")).toBeNull();
    expect(screen.queryByText("최근 본 도서")).toBeNull();
    expect(screen.getByTestId("popular-section")).toBeTruthy();
  });

  test("long recent title is cut at 10 chars", async () => {
    await pushRecentBook(null, book(9, { title: "가나다라마바사아자차카타파" })); // 13자
    await render(<SearchScreen />);
    expect(await screen.findByText("가나다라마바사아자차…")).toBeTruthy();
  });

  test("no theme band in M1", async () => {
    await render(<SearchScreen />);
    await screen.findByText("불편한 편의점");
    expect(screen.queryByText(/테마/)).toBeNull();
  });

  test("recommendation failure keeps recent and search", async () => {
    await pushRecentBook(null, book(7, { title: "작별인사" }));
    await pushRecentBook(null, book(8, { title: "하얼빈" }));
    fetchRecommendations.mockRejectedValueOnce(providerDown());
    await render(<SearchScreen />);
    expect(await screen.findByText("인기 도서를 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("하얼빈")).toBeTruthy();
    expect(screen.getByTestId("search-input")).toBeTruthy();
    await fireEvent.press(screen.getByText("다시 해 보기"));
    expect(await screen.findByText("불편한 편의점")).toBeTruthy();
    expect(fetchRecommendations).toHaveBeenCalledTimes(2);
    expect(screen.getByText("하얼빈")).toBeTruthy();
  });

  test("query param searches immediately", async () => {
    mockParams = { q: "소년" };
    const Route = require("../../../../app/search").default as React.ComponentType;
    await render(<Route />);
    await waitFor(() => expect(searchBooks).toHaveBeenCalledWith("소년", 1, expect.anything()));
    expect(await screen.findByText('"소년" 검색 결과')).toBeTruthy();
  });
});

describe("검색 결과", () => {
  test("infinite scroll uses next_start once", async () => {
    searchBooks.mockResolvedValueOnce(page([book(1), book(2)], 21));
    const more = deferred<BookSearchResponse>();
    searchBooks.mockReturnValueOnce(more.promise);
    await render(<SearchScreen />);
    await typeAndSearch("해리");
    const list = await screen.findByTestId("results");
    await screen.findByTestId(`book-${book(1).isbn13}`);
    await fireEvent(list, "onEndReached");
    await fireEvent(list, "onEndReached");
    expect(await screen.findByText("책을 더 불러오는 중이에요")).toBeTruthy();
    const startCalls = searchBooks.mock.calls.filter((c) => c[1] === 21);
    expect(startCalls).toHaveLength(1);
    expect(startCalls[0]![0]).toBe("해리");
    await act(async () => more.resolve(page([book(3)], null)));
    expect(await screen.findByTestId(`book-${book(3).isbn13}`)).toBeTruthy();
    expect(screen.getByText("여기까지예요")).toBeTruthy();
  });

  test("no more when next_start null", async () => {
    await render(<SearchScreen />);
    await typeAndSearch("해리");
    const list = await screen.findByTestId("results");
    await screen.findByTestId(`book-${book(1).isbn13}`);
    await fireEvent(list, "onEndReached");
    expect(searchBooks).toHaveBeenCalledTimes(1);
    expect(screen.getByText("여기까지예요")).toBeTruthy();
  });

  test("late response for old query is dropped", async () => {
    const boy = deferred<BookSearchResponse>();
    const store = deferred<BookSearchResponse>();
    searchBooks.mockReturnValueOnce(boy.promise).mockReturnValueOnce(store.promise);
    await render(<SearchScreen />);
    await typeAndSearch("소년");
    await typeAndSearch("편의점");
    await act(async () => store.resolve(page([book(5, { title: "불편한 편의점 2" })])));
    await act(async () => boy.resolve(page([book(6, { title: "소년이 온다" })])));
    expect(await screen.findByTestId(`book-${book(5).isbn13}`)).toBeTruthy();
    expect(screen.queryByText("소년이 온다")).toBeNull();
    expect(screen.getByText('"편의점" 검색 결과')).toBeTruthy();
  });

  test("search failure shows retry", async () => {
    searchBooks.mockRejectedValueOnce(providerDown());
    await render(<SearchScreen />);
    await typeAndSearch("해리");
    expect(
      await screen.findByText("지금은 책을 찾을 수 없어요. 잠시 후 다시 해 주세요.")
    ).toBeTruthy();
    expect(screen.getByTestId("search-input").props.value).toBe("해리");
    await fireEvent.press(screen.getByText("다시 해 보기"));
    expect(await screen.findByTestId(`book-${book(1).isbn13}`)).toBeTruthy();
    expect(searchBooks).toHaveBeenCalledTimes(2);
    expect(searchBooks.mock.calls[1]!.slice(0, 2)).toEqual(searchBooks.mock.calls[0]!.slice(0, 2));
    expect(await listRecentBooks(null)).toEqual([]); // 최근 본 도서 무변경
  });

  test("empty result shows message with query", async () => {
    searchBooks.mockResolvedValueOnce(page([]));
    await render(<SearchScreen />);
    await typeAndSearch("해리해리");
    expect(
      await screen.findByText("‘해리해리’는 찾지 못했어요. 글자를 바꿔서 다시 찾아보세요.")
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("다시 찾기"));
    expect(screen.getByTestId("search-input").props.value).toBe("해리해리");
    expect(screen.queryByText(/찾지 못했어요/)).toBeNull();
  });

  test("results do not call availability", async () => {
    await render(<SearchScreen />);
    await typeAndSearch("해리");
    await screen.findByTestId(`book-${book(1).isbn13}`);
    expect(fetchAvailabilityNearby).not.toHaveBeenCalled();
    expect(screen.queryByText(/대출 가능/)).toBeNull();
    expect(screen.queryByText(/3km/)).toBeNull();
    expect(screen.queryByText(/도시 내 모든 도서관/)).toBeNull();
  });

  test("view toggle keeps same items", async () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => book(n));
    searchBooks.mockResolvedValueOnce(page(six));
    await render(<SearchScreen />);
    await typeAndSearch("해리");
    await screen.findByTestId(`book-${book(6).isbn13}`);
    const order = () =>
      screen.getAllByTestId(/^book-/).map((n) => String(n.props.testID).replace("book-", ""));
    const expected = six.map((b) => b.isbn13);
    expect(order()).toEqual(expected);
    await fireEvent.press(screen.getByText("☰ 목록으로"));
    expect(order()).toEqual(expected);
    await fireEvent.press(screen.getByText("▦ 표지로"));
    expect(order()).toEqual(expected);
    expect(searchBooks).toHaveBeenCalledTimes(1);
  });

  test("list row shows publisher and year", async () => {
    searchBooks.mockResolvedValueOnce(page([book(1), book(2, { pub_year: null })]));
    await render(<SearchScreen />);
    await typeAndSearch("해리");
    await screen.findByTestId(`book-${book(1).isbn13}`);
    await fireEvent.press(screen.getByText("☰ 목록으로"));
    expect(screen.getByText("창비 · 2014")).toBeTruthy();
    expect(screen.getByText("창비")).toBeTruthy();
  });

  test("double tap opens results once", async () => {
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "해리");
    await fireEvent.press(screen.getByTestId("search-button"));
    await fireEvent.press(screen.getByTestId("search-button"));
    await screen.findByTestId(`book-${book(1).isbn13}`);
    expect(searchBooks).toHaveBeenCalledTimes(1);
  });

  test("empty query does not search", async () => {
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "   ");
    await fireEvent.press(screen.getByTestId("search-button"));
    await screen.findByText("불편한 편의점");
    expect(searchBooks).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-button").props.accessibilityState.disabled).toBe(true);
  });
});

describe("입력 중 추천", () => {
  const sugg = [
    book(11, { title: "해리 포터와 마법사의 돌 (1)" }),
    book(12, { title: "해리 포터와 비밀의 방 (2)" }),
    book(13, { title: "해리 포터와 불의 잔 (4)" }),
    book(14, { title: "스페어: 해리 왕자 자서전" }),
    book(15, { title: "해리 쿼버트 사건의 진실 - 상" }),
    book(16, { title: "해리" }),
  ];

  test("suggestions wait for 2 chars and debounce", async () => {
    jest.useFakeTimers();
    searchBooks.mockResolvedValue(page(sugg));
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "해");
    await act(async () => jest.advanceTimersByTime(400));
    expect(searchBooks).toHaveBeenCalledTimes(0);
    await fireEvent.changeText(screen.getByTestId("search-input"), "해리");
    await act(async () => jest.advanceTimersByTime(399));
    expect(searchBooks).toHaveBeenCalledTimes(0);
    await act(async () => jest.advanceTimersByTime(1));
    expect(searchBooks).toHaveBeenCalledTimes(1);
    expect(searchBooks).toHaveBeenCalledWith("해리", 1, expect.anything());
  });

  test("suggestionQueries strips subtitle and dedupes", () => {
    const items = [
      book(1, { title: "해리 포터와 마법사의 돌 (1)" }),
      book(2, { title: "해리 포터와 비밀의 방 (2)" }),
      book(3, { title: "해리 포터와 불의 잔 (4)" }),
      book(4, { title: "해리 포터와 불의 잔 (5)" }), // 앞글 같음
      book(5, { title: "해리" }), // 입력과 같음
      book(6, { title: "스페어: 해리 왕자 자서전" }),
      book(7, { title: "해리 쿼버트 사건의 진실 - 상" }),
      book(8, { title: "또 하나" }),
    ];
    const out = suggestionQueries(items, "해리");
    expect(out).toEqual(["해리 포터와 불의 잔", "스페어", "해리 쿼버트 사건의 진실"]);
    expect(out).not.toContain("해리 포터와 마법사의 돌");
    expect(out).toHaveLength(3);
    expect(suggestionQueries(items.slice(0, 3), "해리")).toEqual(["해리 포터와 불의 잔"]);
  });

  test("suggestion book opens detail and query opens results", async () => {
    jest.useFakeTimers();
    searchBooks.mockResolvedValue(page(sugg));
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "해리");
    await act(async () => jest.advanceTimersByTime(400));
    await screen.findByTestId("suggestions");
    await fireEvent.press(screen.getAllByText("해리 포터와 마법사의 돌 (1)")[0]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/books/[isbn13]",
      params: { isbn13: sugg[0]!.isbn13 },
    });
    await fireEvent.press(screen.getByText("🔍  해리 포터와 불의 잔"));
    expect(searchBooks).toHaveBeenLastCalledWith("해리 포터와 불의 잔", 1, expect.anything());
    await act(async () => jest.advanceTimersByTime(400));
    expect(await screen.findByText('"해리 포터와 불의 잔" 검색 결과')).toBeTruthy();
    expect(screen.queryByTestId("suggestions")).toBeNull();
  });

  test.each([
    ["failure", () => searchBooks.mockRejectedValue(providerDown())],
    ["empty", () => searchBooks.mockResolvedValue(page([]))],
  ])("suggestion failure or empty hides panel (%s)", async (_name, arrange) => {
    jest.useFakeTimers();
    arrange();
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "해리");
    await act(async () => jest.advanceTimersByTime(400));
    expect(searchBooks).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("suggestions")).toBeNull();
    expect(screen.queryByText(/찾을 수 없어요/)).toBeNull();
    expect(screen.getByTestId("search-button").props.accessibilityState.disabled).toBe(false);
  });

  test("submit cancels pending suggestion", async () => {
    jest.useFakeTimers();
    const pending = deferred<BookSearchResponse>();
    searchBooks.mockReturnValueOnce(pending.promise).mockResolvedValue(page([book(1)]));
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "해리");
    await act(async () => jest.advanceTimersByTime(400)); // 추천 요청이 나감(아직 안 끝남)
    await fireEvent.press(screen.getByTestId("search-button"));
    await act(async () => pending.resolve(page(sugg)));
    await act(async () => jest.advanceTimersByTime(400));
    expect(screen.queryByTestId("suggestions")).toBeNull();
    expect(await screen.findByText('"해리" 검색 결과')).toBeTruthy();
  });
});

describe("최근 본 도서 저장", () => {
  test("recent books keys are exact", async () => {
    await pushRecentBook(USER_A, book(1));
    await pushRecentBook(null, book(2));
    const keys = await AsyncStorage.getAllKeys();
    expect([...keys].sort()).toEqual(
      ["recent_books:00000000-0000-4000-8000-00000000000a", "recent_books:guest"].sort()
    );
    expect((await listRecentBooks(USER_A)).map((b) => b.isbn13)).toEqual([book(1).isbn13]);
    expect((await listRecentBooks(null)).map((b) => b.isbn13)).toEqual([book(2).isbn13]);
  });

  test("recent books max 20 and revisit moves to front", async () => {
    for (let n = 1; n <= 20; n++) await pushRecentBook(null, book(n));
    expect(await listRecentBooks(null)).toHaveLength(20);
    await pushRecentBook(null, book(21));
    let list = await listRecentBooks(null);
    expect(list).toHaveLength(20);
    expect(list[0]!.isbn13).toBe(book(21).isbn13);
    expect(list.some((b) => b.isbn13 === book(1).isbn13)).toBe(false); // 가장 오래된 것이 빠짐
    // 기기에 저장된 값 자체가 20권이어야 한다(읽을 때 자르는 것만으로는 안 됨)
    expect(JSON.parse((await AsyncStorage.getItem("recent_books:guest"))!)).toHaveLength(20);
    await pushRecentBook(null, book(10));
    list = await listRecentBooks(null);
    expect(list).toHaveLength(20);
    expect(list[0]!.isbn13).toBe(book(10).isbn13);
    expect(list.filter((b) => b.isbn13 === book(10).isbn13)).toHaveLength(1);
  });

  test("remove and clear recent books", async () => {
    for (const n of [1, 2, 3]) await pushRecentBook(null, book(n));
    await removeRecentBook(null, book(2).isbn13);
    expect((await listRecentBooks(null)).map((b) => b.isbn13)).toEqual([
      book(3).isbn13,
      book(1).isbn13,
    ]);
    await clearRecentBooks(null);
    expect(await listRecentBooks(null)).toEqual([]);
    await render(<SearchScreen />);
    await screen.findByText("불편한 편의점");
    expect(screen.queryByTestId("recent-section")).toBeNull();
  });

  test("remove and clear from entry screen", async () => {
    for (const n of [1, 2, 3]) await pushRecentBook(null, book(n));
    await render(<SearchScreen />);
    await screen.findByText("책 3");
    await fireEvent.press(screen.getByLabelText("책 2 지우기"));
    await waitFor(() => expect(screen.queryByText("책 2")).toBeNull());
    expect((await listRecentBooks(null)).map((b) => b.isbn13)).toEqual([
      book(3).isbn13,
      book(1).isbn13,
    ]);
    await fireEvent.press(screen.getByText("전체 삭제"));
    await waitFor(() => expect(screen.queryByTestId("recent-section")).toBeNull());
    expect(await listRecentBooks(null)).toEqual([]);
  });

  test("broken stored value reads as empty and is not overwritten", async () => {
    await AsyncStorage.setItem("recent_books:guest", "{not json");
    expect(await listRecentBooks(null)).toEqual([]);
    await render(<SearchScreen />);
    await screen.findByText("불편한 편의점");
    expect(screen.queryByTestId("recent-section")).toBeNull();
    expect(await AsyncStorage.getItem("recent_books:guest")).toBe("{not json");
  });
});

describe("최근 본 도서 계정 격리·경합 (PR #95 리뷰)", () => {
  const USER_B = "00000000-0000-4000-8000-00000000000b";
  const signedIn = (userId: string) =>
    ({
      status: "signedIn",
      userId,
      signInWithGoogle: jest.fn<() => Promise<never>>(),
      signInWithApple: jest.fn<() => Promise<never>>(),
    }) as unknown as ReturnType<typeof useAuth>;

  /** 지정한 키의 getItem을 붙잡아 두고, 나머지는 실제 저장소로 보낸다. */
  function holdReads(keys: string[]) {
    // 저장소 모의 객체의 getItem은 이미 jest.fn이라 원래 구현을 꺼내 감싼다
    const getItem = jest.mocked(AsyncStorage.getItem);
    const real = getItem.getMockImplementation()!;
    const held = new Map(keys.map((k) => [k, deferred<void>()]));
    getItem.mockImplementation(async (key: string, ...rest) => {
      const gate = held.get(key);
      if (gate) await gate.promise;
      return real(key, ...rest);
    });
    return {
      release: (k: string) => held.get(k)!.resolve(),
      restore: () => getItem.mockImplementation(real),
    };
  }

  test("late read of previous account never shows after switch", async () => {
    await pushRecentBook(USER_A, book(1, { title: "PRIVATE_A_HISTORY" }));
    await pushRecentBook(USER_B, book(2, { title: "B_HISTORY" }));
    const keyA = `recent_books:${USER_A}`;
    const keyB = `recent_books:${USER_B}`;
    const reads = holdReads([keyA, keyB]);
    try {
      mockedUseAuth.mockReturnValue(signedIn(USER_A));
      await render(<SearchScreen />);
      await screen.findByText("불편한 편의점");
      mockedUseAuth.mockReturnValue(signedIn(USER_B));
      await screen.rerender(<SearchScreen />);
      await act(async () => reads.release(keyB)); // B 먼저 끝남
      expect(await screen.findByText("B_HISTORY")).toBeTruthy();
      await act(async () => reads.release(keyA)); // A가 늦게 끝남
      expect(screen.queryByLabelText("PRIVATE_A_HISTORY 지우기")).toBeNull();
      expect(screen.getByText("B_HISTORY")).toBeTruthy();
    } finally {
      reads.restore();
    }
  });

  test("previous account list hides immediately on switch", async () => {
    await pushRecentBook(USER_A, book(1, { title: "PRIVATE_A_HISTORY" }));
    mockedUseAuth.mockReturnValue(signedIn(USER_A));
    await render(<SearchScreen />);
    await screen.findByLabelText("PRIVATE_A_HISTORY 지우기");
    const reads = holdReads([`recent_books:${USER_B}`]); // B 읽기는 끝나지 않은 채로
    try {
      mockedUseAuth.mockReturnValue(signedIn(USER_B));
      await screen.rerender(<SearchScreen />);
      expect(screen.queryByLabelText("PRIVATE_A_HISTORY 지우기")).toBeNull();
      expect(screen.queryByTestId("recent-section")).toBeNull();
    } finally {
      reads.release(`recent_books:${USER_B}`);
      reads.restore();
    }
  });

  test("review: concurrent removes are not undone", async () => {
    for (const n of [1, 2, 3]) await pushRecentBook(null, book(n));
    await Promise.all([removeRecentBook(null, book(1).isbn13), removeRecentBook(null, book(2).isbn13)]);
    expect((await listRecentBooks(null)).map((b) => b.isbn13)).toEqual([book(3).isbn13]);
  });

  test("review: clear after in-flight push stays empty", async () => {
    await pushRecentBook(null, book(1));
    await Promise.all([pushRecentBook(null, book(2)), clearRecentBooks(null)]);
    expect(await listRecentBooks(null)).toEqual([]);
    expect(await AsyncStorage.getItem("recent_books:guest")).toBeNull();
  });

  test("review: concurrent removes from entry screen persist", async () => {
    for (const n of [1, 2, 3]) await pushRecentBook(null, book(n));
    await render(<SearchScreen />);
    await screen.findByText("책 3");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("책 1 지우기"));
      fireEvent.press(screen.getByLabelText("책 2 지우기"));
    });
    await waitFor(async () =>
      expect((await listRecentBooks(null)).map((b) => b.isbn13)).toEqual([book(3).isbn13])
    );
    expect(screen.queryByText("책 1")).toBeNull();
    expect(screen.queryByText("책 2")).toBeNull();
  });

  test("failed write does not disturb queue for next write", async () => {
    await pushRecentBook(null, book(1));
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("disk")); // 한 번만 실패
    await expect(pushRecentBook(null, book(2))).rejects.toThrow("disk");
    await pushRecentBook(null, book(3));
    expect((await listRecentBooks(null)).map((b) => b.isbn13)).toEqual([book(3).isbn13, book(1).isbn13]);
  });
});

describe("색·곡률 토큰", () => {
  test("no hard-coded colors in book-search screens", () => {
    const dir = path.join(__dirname, "..");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (/#[0-9A-Fa-f]{3,8}\b/.test(src)) offenders.push(`${f}: #hex`);
      if (/rgba?\(/.test(src)) offenders.push(`${f}: rgb(`);
      if (/[bB]orderRadius:\s*\d/.test(src)) offenders.push(`${f}: borderRadius 숫자`);
      if (/Radius:\s*\d/.test(src)) offenders.push(`${f}: *Radius 숫자`);
    }
    expect(offenders).toEqual([]);
  });
});
