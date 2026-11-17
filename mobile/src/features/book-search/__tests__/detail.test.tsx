// LIB-1-P2 책 상세 (book-search.md LIB-1 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import { theme } from "../../../theme";
import * as api from "../__fakes__/publicApi";
import type { Book, BookSearchResponse } from "../__fakes__/publicApi";
import { BookDetailScreen } from "../BookDetailScreen";
import * as recent from "../recentBooks";
import { SearchScreen } from "../SearchScreen";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const ReactLib = require("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => ReactLib.useEffect(cb, [cb]),
    Stack: { Screen: () => null },
  };
});

jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));

jest.mock("../__fakes__/publicApi", () => {
  const actual = jest.requireActual<typeof import("../__fakes__/publicApi")>(
    "../__fakes__/publicApi"
  );
  return { ...actual, searchBooks: jest.fn(), fetchRecommendations: jest.fn(), fetchBook: jest.fn() };
});

jest.mock("../recentBooks", () => {
  const actual = jest.requireActual<typeof import("../recentBooks")>("../recentBooks");
  return { ...actual, pushRecentBook: jest.fn(actual.pushRecentBook) };
});

const fetchBook = jest.mocked(api.fetchBook);
const searchBooks = jest.mocked(api.searchBooks);
const fetchRecommendations = jest.mocked(api.fetchRecommendations);
const pushRecentBook = jest.mocked(recent.pushRecentBook);
const mockedUseAuth = jest.mocked(useAuth);

const USER_A = "00000000-0000-4000-8000-00000000000a";

const BOY: Book = {
  isbn13: "9788936434120",
  title: "소년이 온다",
  author: "한강",
  publisher: "창비",
  cover_url: "https://example.invalid/cover/9788936434120.jpg",
  source: "data4library",
  description: "1980년 5월 광주를 겪은 사람들의 이야기.",
  pub_year: 2014,
};
const STORE: Book = {
  isbn13: "9788954682152",
  title: "불편한 편의점",
  author: "김호연",
  publisher: "나무옆의자",
  cover_url: null,
  source: "data4library",
  description: null,
  pub_year: null,
};

function signedIn(userId: string | null) {
  mockedUseAuth.mockReturnValue({
    status: userId ? "signedIn" : "signedOut",
    userId,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

const page = (items: Book[]): BookSearchResponse => ({
  items,
  next_start: null,
  source: "naver",
  fallback_reason: null,
});

/** 화면 이동(mockPush)을 받아 그 책의 상세를 실제로 띄운다. */
async function openPushedDetail() {
  const call = mockPush.mock.calls.at(-1)![0] as { params: { isbn13: string } };
  await screen.unmount();
  await render(<BookDetailScreen isbn13={call.params.isbn13} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  signedIn(null);
  fetchBook.mockImplementation(async (isbn) => {
    const b = [BOY, STORE].find((x) => x.isbn13 === isbn);
    if (!b) throw new api.ApiCallError(404, "NOT_FOUND", "x", "");
    return b;
  });
  searchBooks.mockResolvedValue(page([BOY, STORE]));
  fetchRecommendations.mockResolvedValue({
    kind: "popular",
    scope: "national",
    library_id: null,
    basis_label: "전국 · 최근 30일 대출",
    theme: null,
    books: [STORE],
    fetched_at: null,
    stale: false,
    fallback_reason: null,
  });
});

describe("상세로 가면 최근 본 도서에 남김", () => {
  test("opening detail from results records recent", async () => {
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "소년");
    await fireEvent.press(screen.getByTestId("search-button"));
    await fireEvent.press(await screen.findByTestId(`book-${BOY.isbn13}`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/books/[isbn13]", params: { isbn13: BOY.isbn13 } });
    await openPushedDetail();
    await screen.findByText("소년이 온다");
    expect(pushRecentBook).toHaveBeenCalledTimes(1);
    expect((await recent.listRecentBooks(null)).map((b) => b.isbn13)).toEqual([BOY.isbn13]);
  });

  test("opening detail from popular records recent", async () => {
    await render(<SearchScreen />);
    await fireEvent.press(await screen.findByText("불편한 편의점"));
    await openPushedDetail();
    await screen.findByTestId("save-plan");
    expect(pushRecentBook).toHaveBeenCalledTimes(1);
    expect(pushRecentBook.mock.calls[0]![1].isbn13).toBe(STORE.isbn13);
  });

  test("double tap on result card opens detail once", async () => {
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "소년");
    await fireEvent.press(screen.getByTestId("search-button"));
    const card = await screen.findByTestId(`book-${BOY.isbn13}`);
    await fireEvent.press(card);
    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledTimes(1);
    await openPushedDetail();
    await screen.findByText("소년이 온다");
    expect(pushRecentBook).toHaveBeenCalledTimes(1);
  });
});

describe("상세 화면", () => {
  test("detail order is info, save, then description", async () => {
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await screen.findByText("소년이 온다");
    expect(screen.getByText("한강")).toBeTruthy();
    expect(screen.getByText("창비 · 2014")).toBeTruthy();
    const json = JSON.stringify(screen.toJSON());
    const at = (s: string) => json.indexOf(s);
    expect(at("소년이 온다")).toBeGreaterThan(-1);
    expect(at("소년이 온다")).toBeLessThan(at("빌릴 예정에 저장"));
    expect(at("빌릴 예정에 저장")).toBeLessThan(at("책 소개"));
    expect(at("책 소개")).toBeLessThan(at("1980년 5월"));
    expect(screen.queryByText(/도서관/)).toBeNull(); // 도서관 목록 칸 없음(LIB-2)
  });

  test("no description hides section", async () => {
    await render(<BookDetailScreen isbn13={STORE.isbn13} />);
    await screen.findAllByText("불편한 편의점");
    expect(screen.queryByText("책 소개")).toBeNull();
    expect(screen.queryByTestId("description")).toBeNull();
  });

  test("detail not found does not record", async () => {
    await render(<BookDetailScreen isbn13="9780000000000" />);
    expect(await screen.findByText("찾을 수 없어요.")).toBeTruthy();
    expect(pushRecentBook).not.toHaveBeenCalled();
    expect(await recent.listRecentBooks(null)).toEqual([]);
  });

  test("malformed isbn shows not found without asking", async () => {
    await render(<BookDetailScreen isbn13="123" />);
    expect(await screen.findByText("찾을 수 없어요.")).toBeTruthy();
    expect(fetchBook).not.toHaveBeenCalled();
  });

  test("detail provider failure shows retry and does not record", async () => {
    fetchBook.mockRejectedValueOnce(new api.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", ""));
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    expect(
      await screen.findByText("지금은 책을 찾을 수 없어요. 잠시 후 다시 해 주세요.")
    ).toBeTruthy();
    expect(pushRecentBook).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("다시 해 보기"));
    await screen.findByText("소년이 온다");
    expect(fetchBook).toHaveBeenCalledTimes(2);
    expect(pushRecentBook).toHaveBeenCalledTimes(1);
  });

  test("save while logged out shows login prompt", async () => {
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByTestId("save-plan"));
    expect(screen.getByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeTruthy();
    await fireEvent.press(screen.getByText("로그인"));
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(screen.getByText("소년이 온다")).toBeTruthy(); // 상세 그대로
  });

  test("save while logged in shows preparing", async () => {
    signedIn(USER_A);
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByTestId("save-plan"));
    expect(screen.getByText("준비 중이에요")).toBeTruthy();
    expect(screen.queryByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeNull();
    // 로그인했으면 계정 키에 남는다
    expect((await recent.listRecentBooks(USER_A)).map((b) => b.isbn13)).toEqual([BOY.isbn13]);
    expect(await recent.listRecentBooks(null)).toEqual([]);
  });

  test("no cover shows text cover", async () => {
    await render(<BookDetailScreen isbn13={STORE.isbn13} />);
    const cover = await screen.findByTestId("text-cover");
    const style = StyleSheet.flatten(cover.props.style);
    expect(style.backgroundColor).toBe(theme.colors.surface3);
    const label = screen.getAllByText("불편한 편의점").find((n) =>
      StyleSheet.flatten(n.props.style).color === theme.colors.inkSoft
    );
    expect(label).toBeTruthy();
  });
});
