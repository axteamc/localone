// LIB-1-P2 책 상세 (book-search.md LIB-1 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import { theme } from "../../../theme";
import * as api from "../../../lib/publicApi";
import type { Book, BookSearchResponse } from "../../../lib/publicApi";
import { BookDetailScreen } from "../BookDetailScreen";
import * as plansApi from "../api";
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

jest.mock("../../../lib/publicApi", () => {
  const actual = jest.requireActual<typeof import("../../../lib/publicApi")>(
    "../../../lib/publicApi"
  );
  return { ...actual, fetchPurchaseLink: jest.fn(async () => { throw new actual.ApiCallError(404, "NOT_FOUND", "x", ""); }), searchBooks: jest.fn(), fetchRecommendations: jest.fn(), fetchBook: jest.fn() };
});

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, saveLoanPlan: jest.fn() };
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
const saveLoanPlan = jest.mocked(plansApi.saveLoanPlan);

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
  source: "kakao",
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
  test("detail order is cover, title, intro, then book info (LIB-3b V1)", async () => {
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await screen.findByText("소년이 온다");
    const json = JSON.stringify(screen.toJSON());
    const at = (s: string) => json.indexOf(s);
    expect(at(BOY.cover_url!)).toBeGreaterThan(-1); // 큰 표지가 맨 위
    expect(at(BOY.cover_url!)).toBeLessThan(at("소년이 온다"));
    expect(at("소년이 온다")).toBeLessThan(at("한강"));
    expect(at("한강")).toBeLessThan(at("책 소개"));
    expect(at("책 소개")).toBeLessThan(at("1980년 5월"));
    expect(at("1980년 5월")).toBeLessThan(at("도서 정보"));
    expect(at("도서 정보")).toBeLessThan(at("창비"));
    expect(at("창비")).toBeLessThan(at("2014"));
    expect(screen.getByText(BOY.isbn13)).toBeTruthy();
    // V3 하단 버튼 두 개, 조회 창은 누르기 전에는 없다
    expect(screen.getByText("대출 예정")).toBeTruthy();
    expect(screen.getByText("도서관 확인")).toBeTruthy();
    expect(screen.queryByTestId("library-sheet")).toBeNull();
    // 출처 표기는 YES24 책만(V1)
    expect(screen.queryByText("출처: YES24")).toBeNull();
    // M10 ① "빌렸어요"는 본문 맨 아래 사각 버튼(도서 정보 다음, 사용자 결정 2026-11-24 시안 후보 C)
    expect(at("책 소개")).toBeLessThan(at("빌렸어요"));
    expect(at(BOY.isbn13)).toBeLessThan(at("빌렸어요"));
  });

  test("detail end: book info, then 빌렸어요 block, then YES24 link (decision 2026-11-24 C)", async () => {
    (api.fetchPurchaseLink as jest.Mock<typeof api.fetchPurchaseLink>).mockResolvedValueOnce({
      isbn13: BOY.isbn13,
      provider: "yes24",
      kind: "search",
      url: "https://www.yes24.com/Product/Search?query=9788936434120",
    });
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await screen.findByText("YES24에서 도서 검색 ↗");
    const json = JSON.stringify(screen.toJSON());
    const at = (s: string) => json.indexOf(s);
    expect(at("도서 정보")).toBeLessThan(at("빌렸어요"));
    expect(at("빌렸어요")).toBeLessThan(at("이 책을 빌렸으면 눌러 내 대출에 기록해요"));
    expect(at("빌렸어요")).toBeLessThan(at("YES24에서 도서 검색 ↗"));
    // YES24 링크는 책 소개 구역 안에 있지 않다(본문 맨 아래로 옮김)
    expect(within(screen.getByTestId("description")).queryByText("YES24에서 도서 검색 ↗")).toBeNull();
    expect(within(screen.getByTestId("detail-end")).getByText("YES24에서 도서 검색 ↗")).toBeTruthy();
  });

  test("yes24 book shows source once", async () => {
    fetchBook.mockResolvedValueOnce({ ...BOY, source: "yes24" });
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    expect(await screen.findAllByText("출처: YES24")).toHaveLength(1);
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

  test("plan button saves without library and shows memo note (U6)", async () => {
    signedIn(USER_A);
    let release!: (v: plansApi.LoanPlan) => void;
    saveLoanPlan.mockReturnValueOnce(new Promise((r) => (release = r)));
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    const btn = await screen.findByTestId("save-plan");
    await fireEvent.press(btn);
    await fireEvent.press(btn); // 연타해도 한 번
    expect(saveLoanPlan).toHaveBeenCalledTimes(1);
    expect(saveLoanPlan).toHaveBeenCalledWith(BOY.isbn13, null);
    await act(async () =>
      release({
        id: "p1",
        book: { isbn13: BOY.isbn13, title: BOY.title, author: BOY.author, cover_url: null },
        library: null,
        status: "planned",
        created_at: "2026-11-24T10:00:00+09:00",
      })
    );
    expect(await screen.findByText("빌릴 예정 메모에 저장했어요. 대출·반납 탭에서 볼 수 있어요.")).toBeTruthy();
    expect(screen.queryByText("어느 도서관에서 빌릴 예정인가요?")).toBeNull(); // 도서관 고르는 창을 열지 않는다
    expect(screen.queryByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeNull();
    // 로그인했으면 계정 키에 남는다
    expect((await recent.listRecentBooks(USER_A)).map((b) => b.isbn13)).toEqual([BOY.isbn13]);
    expect(await recent.listRecentBooks(null)).toEqual([]);
  });

  test("plan save failure shows retry wording and 401 shows login", async () => {
    signedIn(USER_A);
    saveLoanPlan.mockRejectedValueOnce(new api.ApiCallError(503, "X", "x", ""));
    saveLoanPlan.mockRejectedValueOnce(new api.ApiCallError(401, "AUTH_REQUIRED", "x", ""));
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByTestId("save-plan"));
    expect(await screen.findByText("저장하지 못했어요. 다시 시도해 주세요.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("save-plan"));
    expect(await screen.findByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeTruthy();
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
