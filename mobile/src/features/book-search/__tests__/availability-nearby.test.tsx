// LIB-2-P1 내 주변 소장·대출 목록 (book-search.md LIB-2 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as platform from "../../../lib/platform";
import * as lib from "../../../lib/publicApi";
import type { AvailabilityItem, AvailabilityResponse, Book } from "../../../lib/publicApi";
import { BookDetailScreen } from "../BookDetailScreen";
import { listRecentBooks } from "../recentBooks";
import { SearchScreen } from "../SearchScreen";
import { AVAILABILITY_FAILED, AVAILABILITY_LIMITED } from "../useAvailability";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => {
  const ReactLib = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => ReactLib.useEffect(cb, [cb]),
    Stack: { Screen: () => null },
  };
});

jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));

jest.mock("../../../lib/platform", () => {
  const actual = jest.requireActual<typeof import("../../../lib/platform")>("../../../lib/platform");
  return { ...actual, locate: jest.fn(), openExternalUrl: jest.fn(), requestLocationPermission: jest.fn() };
});

jest.mock("../../../lib/publicApi", () => {
  const actual = jest.requireActual<typeof import("../../../lib/publicApi")>("../../../lib/publicApi");
  return {
    ...actual,
    searchBooks: jest.fn(),
    fetchRecommendations: jest.fn(),
    fetchBook: jest.fn(),
    fetchAvailabilityNearby: jest.fn(),
    fetchAvailabilityInCity: jest.fn(),
    fetchAvailabilityAt: jest.fn(),
    fetchLibrariesNearby: jest.fn(),
    fetchLibrary: jest.fn(),
    fetchPurchaseLink: jest.fn(async () => { throw new actual.ApiCallError(404, "NOT_FOUND", "x", ""); }),
  };
});

const locate = jest.mocked(platform.locate);
const openExternalUrl = jest.mocked(platform.openExternalUrl);
const fetchAvailabilityNearby = jest.mocked(lib.fetchAvailabilityNearby);
const fetchBook = jest.mocked(lib.fetchBook);
const searchBooks = jest.mocked(lib.searchBooks);
const fetchRecommendations = jest.mocked(lib.fetchRecommendations);
const mockedUseAuth = jest.mocked(useAuth);

const HERE = { ok: true as const, lat: 37.58, lng: 126.98 };
const USER_A = "00000000-0000-4000-8000-00000000000a";

const BOY: Book = {
  isbn13: "9788936434120",
  title: "소년이 온다",
  author: "한강",
  publisher: "창비",
  cover_url: null,
  source: "data4library",
  description: null,
  pub_year: 2014,
};
const STORE: Book = { ...BOY, isbn13: "9788954682152", title: "불편한 편의점", author: "김호연" };

function lib1(id: number, name: string, extra: Partial<AvailabilityItem> = {}, libExtra = {}): AvailabilityItem {
  return {
    library: {
      id,
      name,
      address: `서울 종로구 ${id}`,
      area_label: "서울 종로구",
      distance_m: id * 100,
      today: { date: "2026-11-17", is_closed: null, hours_text: null, holiday_unchecked: false },
      tel: null,
      ...libExtra,
    },
    holding: "yes",
    loanable: "yes",
    basis: "today",
    source: "data4library",
    observed_at: "2026-11-17T09:00:00+09:00",
    data_date: "2026-11-16",
    data_date_assumed: false,
    fallback_reason: null,
    live_check: null,
    ...extra,
  };
}

function resp(items: AvailabilityItem[], isbn13 = BOY.isbn13): AvailabilityResponse {
  return {
    isbn13,
    scope: "nearby",
    radius_km: 3,
    dtl_region: null,
    checked_at: "2026-11-17T09:30:12+09:00",
    items,
  };
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

function auth(status: "loading" | "signedIn" | "signedOut", userId: string | null) {
  mockedUseAuth.mockReturnValue({
    status,
    userId,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

type Node = { type: string; children: (Node | string)[] | null };

/** 화면에 보이는 모든 글자(Text 하나당 한 줄) */
function allTexts(): string[] {
  const out: string[] = [];
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === "string") return;
    if (n.type === "Text") {
      out.push((n.children ?? []).filter((c): c is string => typeof c === "string").join(""));
    }
    (n.children ?? []).forEach(walk);
  };
  const root = screen.toJSON() as Node | Node[] | null;
  (Array.isArray(root) ? root : [root]).forEach(walk);
  return out;
}

beforeEach(async () => {
  jest.clearAllMocks();
  // clearAllMocks는 남은 mockResolvedValueOnce를 지우지 않아 다음 시험으로 샌다
  for (const m of [locate, openExternalUrl, fetchAvailabilityNearby, fetchBook, searchBooks, fetchRecommendations]) m.mockReset();
  await AsyncStorage.clear();
  auth("signedOut", null);
  locate.mockResolvedValue(HERE);
  openExternalUrl.mockResolvedValue(true);
  fetchBook.mockImplementation(async (isbn) => {
    const b = [BOY, STORE].find((x) => x.isbn13 === isbn);
    if (!b) throw new lib.ApiCallError(404, "NOT_FOUND", "x", "");
    return b;
  });
  fetchAvailabilityNearby.mockResolvedValue(resp([lib1(3, "정독도서관")]));
});

/** 상세를 띄우고 하단 "도서관 확인"으로 조회 창을 연다(LIB-3b V3 — 창을 열 때만 #12를 부른다) */
async function renderDetail(isbn13: string) {
  await render(<BookDetailScreen isbn13={isbn13} />);
  await fireEvent.press(await screen.findByTestId("find-libraries"));
}

test("P8 guest lookup uses device start and gives recovered GPS priority on reopen", async () => {
  await AsyncStorage.setItem("localone:rough_start:v1", JSON.stringify({ lat: 35, lng: 127, area_label: "광주광역시 동구" }));
  locate.mockResolvedValueOnce({ ok: false, reason: "denied" });
  await renderDetail(BOY.isbn13);
  expect(await screen.findByText("광주광역시 동구")).toBeTruthy();
  expect(fetchAvailabilityNearby).toHaveBeenLastCalledWith(BOY.isbn13, 35, 127, 3, expect.anything());
  await fireEvent.press(screen.getByTestId("library-sheet-close"));
  await fireEvent.press(screen.getByTestId("find-libraries"));
  await screen.findByText("정독도서관");
  expect(fetchAvailabilityNearby).toHaveBeenLastCalledWith(BOY.isbn13, HERE.lat, HERE.lng, 3, expect.anything());
  expect(screen.queryByText("광주광역시 동구")).toBeNull();
});

describe("내 주변 소장·대출 목록", () => {
  test("nearby list keeps server distance order", async () => {
    // 서버가 준 순서(가까운 순) 그대로. 이름순·id순으로 다시 정렬하면 순서가 바뀌도록 고른 값
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([lib1(9, "정독도서관", {}, { distance_m: 300 }), lib1(2, "종로도서관", {}, { distance_m: 1200 })])
    );
    await renderDetail(BOY.isbn13);
    await screen.findByText("종로도서관");
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf("정독도서관")).toBeLessThan(json.indexOf("종로도서관"));
    expect(screen.getByText("300m")).toBeTruthy();
    expect(screen.getByText("1.2km")).toBeTruthy();
    expect(fetchAvailabilityNearby).toHaveBeenCalledWith(BOY.isbn13, HERE.lat, HERE.lng, 3, expect.anything());
  });

  test("unknown is never shown as none", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([
        lib1(1, "소장 모름", { holding: "unknown", loanable: "unknown", data_date: null }),
        lib1(2, "대출 모름", { holding: "yes", loanable: "unknown" }),
      ])
    );
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText("소장 알 수 없음")).toBeTruthy();
    expect(screen.getByText("소장 있음 · 대출 알 수 없음")).toBeTruthy(); // C-70 상태 한 줄
    expect(screen.getAllByText("다시 시도")).toHaveLength(2);
    const texts = allTexts();
    expect(texts).not.toContain("소장 없음");
    expect(texts.some((t) => t.includes("대출 불가"))).toBe(false);
  });

  test("data date label yesterday and assumed", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([
        lib1(1, "가", { data_date: "2026-11-16", data_date_assumed: true }),
        lib1(2, "나", { data_date: "2026-11-14", loanable: "no" }),
      ])
    );
    await renderDetail(BOY.isbn13);
    // 오늘은 checked_at의 서울 날짜(2026-11-17)
    expect(await screen.findByText("어제(추정) 기준 · 대출 가능")).toBeTruthy();
    expect(screen.getByText("11월 14일 기준 · 대출 불가")).toBeTruthy();
  });

  test("no realtime wording except live check button", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([
        lib1(1, "가", { live_check: { url: "https://lib.example.org/s?isbn=1", kind: "isbn_search" } }),
        lib1(2, "나", { holding: "unknown", loanable: "unknown" }),
      ])
    );
    await renderDetail(BOY.isbn13);
    await screen.findByText("실시간 ↗");
    const texts = allTexts();
    expect(texts.filter((t) => t.includes("실시간"))).toEqual(["실시간 ↗"]);
    for (const banned of ["지금 바로", "방금 반납"]) {
      expect(texts.some((t) => t.includes(banned))).toBe(false);
    }
  });

  test("live check opens external url", async () => {
    const url = "https://lib.example.org/s?isbn=9788936434120";
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([lib1(1, "있음", { live_check: { url, kind: "isbn_search" } }), lib1(2, "없음칸")])
    );
    await renderDetail(BOY.isbn13);
    const buttons = await screen.findAllByText("실시간 ↗");
    expect(buttons).toHaveLength(1); // live_check null인 카드는 버튼 없음(V-7)
    await fireEvent.press(buttons[0]!);
    expect(openExternalUrl).toHaveBeenCalledWith(url);
  });

  test("live check open failure shows message", async () => {
    openExternalUrl.mockResolvedValueOnce(false);
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([lib1(1, "가", { live_check: { url: "https://x.example.org", kind: "homepage" } })])
    );
    await renderDetail(BOY.isbn13);
    await fireEvent.press(await screen.findByText("실시간 ↗"));
    expect(await screen.findByText("주소를 열지 못했어요.")).toBeTruthy(); // V-8
  });

  test("live check sits on the card right beside status and info", async () => {
    const live = { url: "https://lib.example.org/s?isbn=1", kind: "isbn_search" as const };
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([
        lib1(1, "가", { live_check: live }, { tel: "02-2011-5799" }),
        // A14 limit 카드: "다시 시도"와 버튼이 함께 있다
        lib1(2, "나", { holding: "unknown", loanable: "unknown", fallback_reason: "limit", live_check: live }),
      ])
    );
    await renderDetail(BOY.isbn13);
    for (const id of [1, 2]) {
      const btn = await screen.findByTestId(`live-check-${id}`);
      // 버튼과 상태·정보 줄이 같은 가로 줄(A11 ④). 정보 줄 아래 바닥 버튼이 아니다(C-69)
      const row = btn.parent!;
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: "row" });
      expect(within(row).getByTestId(`info-open-${id}`)).toBeTruthy(); // 주소·전화 접기(C-70)
      // 다시 시도는 왼쪽 칸에 있고 버튼 안에 없다(A14)
      expect(within(btn).queryByText("다시 시도")).toBeNull();
      // LIB-3b V6: 필 버튼 높이 44(누르는 영역 44 이상), 고정 폭
      expect(StyleSheet.flatten(btn.props.style)).toMatchObject({ height: 44, width: 96 });
    }
    expect(within(screen.getByTestId("library-2")).getByText("다시 시도")).toBeTruthy();
  });

  test("retry refetches same scope", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "가", { holding: "unknown", loanable: "unknown" })]));
    await renderDetail(BOY.isbn13);
    await fireEvent.press(await screen.findByText("다시 시도"));
    await waitFor(() => expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(2));
    const [first, second] = fetchAvailabilityNearby.mock.calls;
    expect(second!.slice(0, 4)).toEqual(first!.slice(0, 4)); // 같은 책·위치·반경
    expect(locate).toHaveBeenCalledTimes(1); // 위치를 다시 잡지 않는다
    expect(await screen.findByText("정독도서관")).toBeTruthy();
  });

  test("late response for previous book dropped", async () => {
    const boy = deferred<AvailabilityResponse>();
    fetchAvailabilityNearby.mockImplementation(async (isbn) =>
      isbn === BOY.isbn13 ? boy.promise : resp([lib1(2, "편의점 도서관")], STORE.isbn13)
    );
    await renderDetail(BOY.isbn13);
    await waitFor(() => expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(1));
    await screen.rerender(<BookDetailScreen isbn13={STORE.isbn13} />);
    await fireEvent.press(await screen.findByTestId("find-libraries")); // 책이 바뀌면 창은 닫힌다
    expect(await screen.findByText("편의점 도서관")).toBeTruthy();
    boy.resolve(resp([lib1(1, "소년 도서관")])); // 앞 책 응답이 늦게 옴
    await waitFor(() => expect(screen.getByText("편의점 도서관")).toBeTruthy());
    expect(screen.queryByText("소년 도서관")).toBeNull();
  });

  test("all limited shows 429 message", async () => {
    fetchAvailabilityNearby.mockRejectedValueOnce(new lib.ApiCallError(429, "PROVIDER_LIMIT", "x", ""));
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText(AVAILABILITY_LIMITED)).toBeTruthy();
    expect(screen.getByText("다시 시도")).toBeTruthy();
    expect(screen.queryByText(AVAILABILITY_FAILED)).toBeNull();
  });

  test("card renders 4-row layout, phone as plain text, and source label", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([
        lib1(1, "정독도서관", {}, {
          tel: "02-2011-5799",
          today: { date: "2026-11-17", is_closed: true, hours_text: null, holiday_unchecked: false },
        }),
        lib1(2, "종로도서관", {}, {
          address: null,
          today: { date: "2026-11-17", is_closed: false, hours_text: "09:00~22:00", holiday_unchecked: false },
        }),
      ])
    );
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText("오늘 휴관")).toBeTruthy();
    expect(screen.getByText("오늘 09:00~22:00")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("info-open-1")); // 주소·전화는 펼쳐야 보인다(C-70)
    const phone = screen.getByText("전화 02-2011-5799");
    expect(phone.props.selectable).toBe(true);
    await fireEvent.press(phone);
    expect(openExternalUrl).not.toHaveBeenCalled(); // tel: 걸기 없음(A2)
    expect(screen.getByText("09:30에 확인 · 출처 도서관 정보나루")).toBeTruthy();
    // 머리 줄 → 상태 한 줄 → (펼친) 주소·전화 순서
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf("정독도서관")).toBeLessThan(json.indexOf("오늘 휴관"));
    expect(json.indexOf("오늘 휴관")).toBeLessThan(json.indexOf("대출 가능"));
    expect(json.indexOf("대출 가능")).toBeLessThan(json.indexOf("서울 종로구 1"));
    expect(json.indexOf("서울 종로구 1")).toBeLessThan(json.indexOf("전화 02-2011-5799"));
  });

  test("address and phone are folded until opened", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "정독도서관", {}, { tel: "02-2011-5799" })]));
    await renderDetail(BOY.isbn13);
    await screen.findByText("정독도서관");
    expect(screen.queryByText("서울 종로구 1")).toBeNull();
    expect(screen.queryByText("전화 02-2011-5799")).toBeNull();
    expect(screen.queryByText("소장 있음")).toBeNull(); // 대출이 확인되면 소장 있음은 따로 쓰지 않음(A11 ②)
    await fireEvent.press(screen.getByText("주소·전화 ⌄"));
    expect(screen.getByText("서울 종로구 1")).toBeTruthy();
    expect(screen.getByText("전화 02-2011-5799")).toBeTruthy();
    await fireEvent.press(screen.getByText("접기 ⌃"));
    expect(screen.queryByText("서울 종로구 1")).toBeNull();
  });

  test("nearby error shows retry", async () => {
    fetchAvailabilityNearby.mockRejectedValueOnce(new lib.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", ""));
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText(AVAILABILITY_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText("다시 시도"));
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(AVAILABILITY_FAILED)).toBeNull();
  });

  test("late error and unmount do not update state", async () => {
    const boy = deferred<AvailabilityResponse>();
    fetchAvailabilityNearby.mockImplementation(async (isbn) =>
      isbn === BOY.isbn13 ? boy.promise : resp([lib1(2, "편의점 도서관")], STORE.isbn13)
    );
    await renderDetail(BOY.isbn13);
    await waitFor(() => expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(1));
    const firstSignal = fetchAvailabilityNearby.mock.calls[0]![4]!;
    await screen.rerender(<BookDetailScreen isbn13={STORE.isbn13} />);
    await fireEvent.press(await screen.findByTestId("find-libraries")); // 책이 바뀌면 창은 닫힌다
    expect(await screen.findByText("편의점 도서관")).toBeTruthy();
    expect(firstSignal.aborted).toBe(true); // 앞 책 요청 취소
    boy.reject(new lib.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", "")); // 늦은 오류
    await waitFor(() => expect(screen.getByText("편의점 도서관")).toBeTruthy());
    expect(screen.queryByText(AVAILABILITY_FAILED)).toBeNull();

    // 언마운트하면 진행 중인 요청을 취소한다
    const pending = deferred<AvailabilityResponse>();
    fetchAvailabilityNearby.mockImplementation(async () => pending.promise);
    await screen.rerender(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByTestId("find-libraries"));
    await waitFor(() => expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(3));
    const lastSignal = fetchAvailabilityNearby.mock.calls[2]![4]!;
    await screen.unmount();
    expect(lastSignal.aborted).toBe(true);
    pending.reject(new lib.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", ""));
  });
});

describe("상세에서만 조회", () => {
  test("search results never call availability", async () => {
    // A10: /search 결과는 #12를 자동으로 부르지 않는다(실제 core 함수 기준)
    searchBooks.mockResolvedValue({ items: [BOY, STORE], next_start: null, source: "kakao", fallback_reason: null });
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
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId("search-input"), "소년");
    await fireEvent.press(screen.getByTestId("search-button"));
    await screen.findByTestId(`book-${STORE.isbn13}`);
    expect(fetchAvailabilityNearby).not.toHaveBeenCalled();
    expect(locate).not.toHaveBeenCalled();
  });

  test("not found book does not look up libraries", async () => {
    await render(<BookDetailScreen isbn13="9780000000000" />);
    await screen.findByText("찾을 수 없어요.");
    expect(locate).not.toHaveBeenCalled();
    expect(fetchAvailabilityNearby).not.toHaveBeenCalled();
  });
});

describe("최근 본 도서 기록 계정 (D 이월 메모)", () => {
  test("recent book waits for auth restore and uses restored account", async () => {
    auth("loading", null); // 로그인 복원 중
    await renderDetail(BOY.isbn13);
    await screen.findByTestId("save-plan");
    expect(await listRecentBooks(null)).toEqual([]); // guest 키에 남기지 않는다
    auth("signedIn", USER_A);
    await screen.rerender(<BookDetailScreen isbn13={BOY.isbn13} />);
    await waitFor(async () => expect((await listRecentBooks(USER_A)).map((b) => b.isbn13)).toEqual([BOY.isbn13]));
    expect(await listRecentBooks(null)).toEqual([]);
  });
});

describe("LIB-3b 도서 상세 조회 창(V2·V3·V5·V6·V7)", () => {
  const fetchPurchaseLink = jest.mocked(lib.fetchPurchaseLink);
  const PRODUCT = { isbn13: BOY.isbn13, provider: "yes24" as const, kind: "product" as const, url: "https://www.yes24.com/product/goods/1" };

  test("libraries are looked up only after pressing find (V3)", async () => {
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await screen.findByTestId("find-libraries");
    expect(fetchAvailabilityNearby).not.toHaveBeenCalled();
    expect(locate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("find-libraries"));
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(1);
  });

  test("yes24 link label follows kind and opens url (V2)", async () => {
    fetchPurchaseLink.mockResolvedValueOnce(PRODUCT);
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByText("YES24에서 도서 상세 보기 ↗"));
    expect(openExternalUrl).toHaveBeenCalledWith(PRODUCT.url);
    await screen.unmount();

    fetchPurchaseLink.mockResolvedValueOnce({ ...PRODUCT, kind: "search", url: "https://www.yes24.com/search?q=1" });
    openExternalUrl.mockResolvedValueOnce(false);
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByText("YES24에서 도서 검색 ↗"));
    expect(await screen.findByText("YES24를 열지 못했어요. 다시 시도해 주세요.")).toBeTruthy();
  });

  test("live pill turns to done after open, same size, reopens same link (V6)", async () => {
    const url = "https://lib.example.org/s?isbn=1";
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "가", { live_check: { url, kind: "isbn_search" } })]));
    openExternalUrl.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await renderDetail(BOY.isbn13);
    const pill = await screen.findByTestId("live-check-1");
    const before = StyleSheet.flatten(pill.props.style);
    await fireEvent.press(pill); // 실패 — 그대로 다시 누를 수 있다
    expect(await screen.findByText("주소를 열지 못했어요.")).toBeTruthy();
    expect(within(pill).getByText("실시간 ↗")).toBeTruthy();
    await fireEvent.press(pill);
    expect(await within(screen.getByTestId("live-check-1")).findByText("확인 완료")).toBeTruthy();
    expect(screen.getByTestId("live-check-1-done-dot")).toBeTruthy();
    expect(screen.queryByText("주소를 열지 못했어요.")).toBeNull();
    const after = StyleSheet.flatten(screen.getByTestId("live-check-1").props.style);
    expect({ w: after.width, h: after.height }).toEqual({ w: before.width, h: before.height });
    expect(after.height).toBeGreaterThanOrEqual(44);
    await fireEvent.press(screen.getByTestId("live-check-1"));
    expect(openExternalUrl).toHaveBeenCalledTimes(3);
    expect(openExternalUrl.mock.calls.every(([u]) => u === url)).toBe(true);
    // 링크를 열어도 대출 상태 글자는 그대로(V6 별개)
    expect(screen.getByText(/대출 가능/)).toBeTruthy();
  });

  test("card body selects one library, pill does not select (V5)", async () => {
    const live = { url: "https://lib.example.org/s?isbn=1", kind: "isbn_search" as const };
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "가", { live_check: live }), lib1(2, "나")]));
    await renderDetail(BOY.isbn13);
    await fireEvent.press(await screen.findByTestId("live-check-1"));
    expect(screen.queryByText("✓")).toBeNull();
    // 웹 <button> 중첩 방지: 선택 레이어는 다른 버튼을 감싸지 않는다(2026-11-24 웹 확인)
    const layer = screen.getByTestId("select-library-1");
    expect(within(layer).queryByTestId("live-check-1")).toBeNull();
    expect(within(layer).queryByTestId("info-open-1")).toBeNull();
    await fireEvent.press(layer);
    expect(within(screen.getByTestId("library-1")).getByText("✓")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("select-library-2"));
    expect(within(screen.getByTestId("library-2")).getByText("✓")).toBeTruthy();
    expect(screen.getAllByText("✓")).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("select-library-2"));
    expect(screen.queryByText("✓")).toBeNull();
  });

  test("buy link only when every library is confirmed not held (V7)", async () => {
    const no = { holding: "no" as const, loanable: "no" as const };
    fetchPurchaseLink.mockResolvedValue(PRODUCT);
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "가", no), lib1(2, "나", no)]));
    await renderDetail(BOY.isbn13);
    await fireEvent.press(await screen.findByTestId("yes24-buy"));
    expect(openExternalUrl).toHaveBeenCalledWith(PRODUCT.url);
    await screen.unmount();

    // unknown이 섞이면 숨긴다(useAvailability의 empty와 다르다)
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([lib1(1, "가", no), lib1(2, "나", { holding: "unknown", loanable: "unknown" })])
    );
    await renderDetail(BOY.isbn13);
    await screen.findByTestId("empty-availability");
    expect(screen.queryByTestId("yes24-buy")).toBeNull();
    await screen.unmount();

    // 소장 도서관이 있으면 숨긴다
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "가"), lib1(2, "나", no)]));
    await renderDetail(BOY.isbn13);
    await screen.findByText("가");
    expect(screen.queryByTestId("yes24-buy")).toBeNull();
    fetchPurchaseLink.mockReset();
    fetchPurchaseLink.mockRejectedValue(new lib.ApiCallError(404, "NOT_FOUND", "x", ""));
  });
});

describe("SNS 도서 카드에서 들어온 조회 창 (C-87)", () => {
  const fetchAvailabilityAt = jest.mocked(lib.fetchAvailabilityAt);

  test("openLookup opens the sheet at once and pins the card library on top only once", async () => {
    fetchAvailabilityAt.mockReset();
    fetchAvailabilityAt.mockResolvedValue(resp([lib1(3, "정독도서관")]));
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([lib1(1, "가까운"), lib1(3, "정독도서관"), lib1(5, "먼")]));
    await render(<BookDetailScreen isbn13={BOY.isbn13} openLookup pinLibraryId={3} />);
    const list = within(await screen.findByTestId("availability-list"));
    expect(fetchAvailabilityAt).toHaveBeenCalledWith(BOY.isbn13, 3, expect.anything());
    await waitFor(() => {
      const names = list.getAllByTestId(/^select-library-/).map((n) => n.props.testID);
      expect(names).toEqual(["select-library-3", "select-library-1", "select-library-5"]);
    });
  });

  test("without openLookup the sheet stays closed and nothing is pinned", async () => {
    fetchAvailabilityAt.mockReset();
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await screen.findByTestId("find-libraries");
    expect(screen.queryByTestId("library-sheet")).toBeNull();
    expect(fetchAvailabilityAt).not.toHaveBeenCalled();
  });
});
