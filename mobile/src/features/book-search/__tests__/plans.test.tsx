// LIB-3-P2 빌릴 예정 담기 창·대출·반납 탭 구역 (book-search.md LIB-3 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import LoansTabScreen from "../../../../app/(tabs)/loans";
import { useAuth } from "../../../auth/AuthProvider";
import * as platform from "../../../lib/platform";
import * as lib from "../../../lib/publicApi";
import type { AvailabilityItem, AvailabilityResponse, Book } from "../../../lib/publicApi";
import * as api from "../api";
import type { LoanPlan } from "../api";
import { BookDetailScreen, SAVED_NOTE } from "../BookDetailScreen";
import { PLANS_EMPTY, PLANS_FAILED, RELEASE_CONFLICT, RELEASE_FAILED } from "../LoanPlansSection";
import { SAVE_FAILED, SHEET_NO_CANDIDATES, SHEET_SUBTITLE, SHEET_TITLE } from "../SavePlanSheet";

const mockPush = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

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

jest.mock("../../../lib/platform", () => {
  const actual = jest.requireActual<typeof import("../../../lib/platform")>("../../../lib/platform");
  return { ...actual, locate: jest.fn(), openExternalUrl: jest.fn(), requestLocationPermission: jest.fn() };
});

jest.mock("../../../lib/publicApi", () => {
  const actual = jest.requireActual<typeof import("../../../lib/publicApi")>("../../../lib/publicApi");
  return { ...actual, fetchBook: jest.fn(), fetchAvailabilityNearby: jest.fn(), fetchAvailabilityInCity: jest.fn(), fetchLibrary: jest.fn() };
});

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, listLoanPlans: jest.fn(), saveLoanPlan: jest.fn(), releaseLoanPlan: jest.fn() };
});

// LOAN-1: 같은 탭 위쪽 "내 대출" 구역은 빈 목록으로 둔다(loan-assistant loans.test.tsx에서 본다)
jest.mock("../../loan-assistant/api", () => {
  const actual = jest.requireActual<typeof import("../../loan-assistant/api")>("../../loan-assistant/api");
  return { ...actual, listLoans: jest.fn(async () => ({ items: [], next_cursor: null, today: "2026-11-17" })), startLoan: jest.fn() };
});

const locate = jest.mocked(platform.locate);
const fetchAvailabilityNearby = jest.mocked(lib.fetchAvailabilityNearby);
const fetchBook = jest.mocked(lib.fetchBook);
const listLoanPlans = jest.mocked(api.listLoanPlans);
const saveLoanPlan = jest.mocked(api.saveLoanPlan);
const releaseLoanPlan = jest.mocked(api.releaseLoanPlan);

const BOY: Book = {
  isbn13: "9788936434120",
  title: "소년이 온다",
  author: "한강",
  publisher: "창비",
  cover_url: null,
  source: "data4library",
  description: "소개",
  pub_year: 2014,
};

function item(id: number, name: string, extra: Partial<AvailabilityItem> = {}): AvailabilityItem {
  return {
    library: {
      id,
      name,
      address: null,
      area_label: "화동",
      distance_m: id * 100,
      today: { date: "2026-11-17", is_closed: null, hours_text: null, holiday_unchecked: false },
      tel: null,
    },
    holding: "yes",
    loanable: "yes",
    basis: "today",
    source: "data4library",
    observed_at: null,
    data_date: "2026-11-16",
    data_date_assumed: false,
    fallback_reason: null,
    live_check: null,
    ...extra,
  };
}

function resp(items: AvailabilityItem[]): AvailabilityResponse {
  return { isbn13: BOY.isbn13, scope: "nearby", radius_km: 3, dtl_region: null, checked_at: "2026-11-17T09:30:12+09:00", items };
}

function plan(id: string, title: string, library = "정독도서관"): LoanPlan {
  return {
    id,
    book: { isbn13: BOY.isbn13, title, author: "한강", cover_url: null },
    library: { id: 101, name: library, area_label: "화동" },
    status: "planned",
    created_at: "2026-11-17T10:00:00+09:00",
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

function signedIn() {
  jest.mocked(useAuth).mockReturnValue({
    status: "signedIn",
    userId: "user-a",
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

const json = () => JSON.stringify(screen.toJSON());
const at = (s: string) => json().indexOf(s);

beforeEach(async () => {
  jest.clearAllMocks();
  for (const m of [locate, fetchAvailabilityNearby, fetchBook, listLoanPlans, saveLoanPlan, releaseLoanPlan]) m.mockReset();
  await AsyncStorage.clear();
  jest.mocked(useAuth).mockReturnValue({
    status: "signedOut",
    userId: null,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  fetchBook.mockResolvedValue(BOY);
  locate.mockResolvedValue({ ok: true, lat: 37.58, lng: 126.98 });
  fetchAvailabilityNearby.mockResolvedValue(resp([item(1, "정독도서관"), item(2, "종로도서관")]));
});

async function openDetail() {
  await render(<BookDetailScreen isbn13={BOY.isbn13} />);
  await screen.findByText("정독도서관");
}

async function openSheet() {
  signedIn();
  await openDetail();
  await fireEvent.press(screen.getByTestId("save-plan"));
  await screen.findByTestId("save-plan-sheet");
}

describe("LIB-3-P2 담기 창(N7·N8)", () => {
  test("save sheet opens only when signed in", async () => {
    await openDetail();
    await fireEvent.press(screen.getByTestId("save-plan"));
    expect(screen.getByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeTruthy();
    expect(screen.queryByTestId("save-plan-sheet")).toBeNull();
    await screen.unmount();

    await openSheet();
    expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
    expect(screen.getByText(SHEET_SUBTITLE)).toBeTruthy();
    expect(screen.getByTestId("plan-candidate-1")).toBeTruthy();
    expect(screen.getByTestId("plan-candidate-2")).toBeTruthy();
    expect(screen.getAllByText("선택")).toHaveLength(2);
    expect(screen.queryByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeNull();
    await fireEvent.press(screen.getByText("닫기"));
    expect(screen.queryByTestId("save-plan-sheet")).toBeNull();
    expect(saveLoanPlan).not.toHaveBeenCalled();
  });

  test("save plan double tap sends once and shows memo wording", async () => {
    const d = deferred<LoanPlan>();
    saveLoanPlan.mockReturnValue(d.promise);
    await openSheet();
    const choose = within(screen.getByTestId("plan-candidate-2")).getByText("선택");
    await fireEvent.press(choose);
    await fireEvent.press(choose);
    expect(saveLoanPlan).toHaveBeenCalledTimes(1);
    expect(saveLoanPlan).toHaveBeenCalledWith(BOY.isbn13, 2);
    await act(async () => d.resolve(plan("p1", BOY.title, "종로도서관")));
    await waitFor(() => expect(screen.queryByTestId("save-plan-sheet")).toBeNull());
    expect(screen.getByText(SAVED_NOTE)).toBeTruthy();
    expect(json()).not.toMatch(/예약|확보/);
    await fireEvent.press(screen.getByText("대출·반납 보기"));
    expect(mockPush).toHaveBeenCalledWith("/loans");
  });

  test("save failure keeps sheet open for retry", async () => {
    saveLoanPlan.mockRejectedValueOnce(new api.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", ""));
    saveLoanPlan.mockResolvedValueOnce(plan("p1", BOY.title));
    await openSheet();
    await fireEvent.press(within(screen.getByTestId("plan-candidate-1")).getByText("선택"));
    expect(await screen.findByText(SAVE_FAILED)).toBeTruthy();
    expect(screen.getByTestId("save-plan-sheet")).toBeTruthy();
    expect(screen.queryByText(SAVED_NOTE)).toBeNull();
    await fireEvent.press(within(screen.getByTestId("plan-candidate-1")).getByText("선택"));
    await waitFor(() => expect(screen.queryByTestId("save-plan-sheet")).toBeNull());
    expect(saveLoanPlan).toHaveBeenCalledTimes(2);
    expect(screen.getByText(SAVED_NOTE)).toBeTruthy();
  });

  test("failure of a save closed mid-request is not shown on next open (②-2)", async () => {
    const d = deferred<LoanPlan>();
    saveLoanPlan.mockReturnValueOnce(d.promise);
    await openSheet();
    await fireEvent.press(within(screen.getByTestId("plan-candidate-1")).getByText("선택"));
    await fireEvent.press(screen.getByText("닫기"));
    await act(async () => d.reject(new api.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", "")));
    await fireEvent.press(screen.getByTestId("save-plan"));
    await screen.findByTestId("save-plan-sheet");
    expect(screen.queryByText(SAVE_FAILED)).toBeNull();
  });

  test("save button while auth is restoring shows no login prompt (②-3)", async () => {
    jest.mocked(useAuth).mockReturnValue({
      status: "loading", userId: null, signInWithGoogle: jest.fn(), signInWithApple: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    await openDetail();
    await fireEvent.press(screen.getByTestId("save-plan"));
    expect(screen.queryByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeNull();
    expect(screen.queryByTestId("save-plan-sheet")).toBeNull();
  });

  test("save 401 closes sheet and shows login prompt", async () => {
    saveLoanPlan.mockRejectedValueOnce(new api.ApiCallError(401, "AUTH_REQUIRED", "x", ""));
    await openSheet();
    await fireEvent.press(within(screen.getByTestId("plan-candidate-1")).getByText("선택"));
    expect(await screen.findByText("로그인하면 빌릴 예정을 저장할 수 있어요")).toBeTruthy();
    expect(screen.queryByTestId("save-plan-sheet")).toBeNull();
  });

  test("empty availability save button opens sheet", async () => {
    fetchAvailabilityNearby.mockResolvedValue(
      resp([item(1, "정독도서관", { holding: "no", loanable: "no" }), item(2, "종로도서관", { holding: "unknown", loanable: "unknown" })])
    );
    signedIn();
    await openDetail();
    await fireEvent.press(await screen.findByText("나중에 빌릴 책으로 저장"));
    expect(await screen.findByTestId("save-plan-sheet")).toBeTruthy();
    expect(screen.getByTestId("plan-candidate-1")).toBeTruthy();
    expect(screen.getByTestId("plan-candidate-2")).toBeTruthy();
    expect(within(screen.getByTestId("plan-candidate-1")).getByText("소장 없음")).toBeTruthy();
    expect(within(screen.getByTestId("plan-candidate-2")).getByText("소장 알 수 없음")).toBeTruthy();
  });

  test("sheet without looked-up libraries asks to find libraries first", async () => {
    fetchAvailabilityNearby.mockResolvedValue(resp([]));
    signedIn();
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByText("나중에 빌릴 책으로 저장"));
    expect(await screen.findByText(SHEET_NO_CANDIDATES)).toBeTruthy();
    expect(screen.queryByText("선택")).toBeNull();
  });
});

describe("LIB-3-P2 대출·반납 탭 빌릴 예정(N9·N10)", () => {
  test("loans tab shows loans slot above planned list and guards signed out", async () => {
    await render(<LoansTabScreen />);
    expect(screen.getByText("로그인하면 빌릴 예정과 내 대출을 볼 수 있어요")).toBeTruthy();
    await fireEvent.press(screen.getByText("로그인"));
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(listLoanPlans).not.toHaveBeenCalled();
    await screen.unmount();

    signedIn();
    listLoanPlans.mockResolvedValue({ items: [plan("p1", "첫 책"), plan("p2", "둘째 책", "종로도서관")], next_cursor: null });
    await render(<LoansTabScreen />);
    await screen.findByTestId("plan-p1");
    expect(screen.getByTestId("plan-p2")).toBeTruthy();
    expect(screen.getByText("종로도서관 · 화동")).toBeTruthy();
    expect(at("내 대출")).toBeGreaterThanOrEqual(0);
    expect(at("내 대출")).toBeLessThan(at("빌릴 예정"));
    expect(at("빌릴 예정")).toBeLessThan(at("첫 책"));
    expect(listLoanPlans).toHaveBeenCalledTimes(1);
    expect(listLoanPlans.mock.calls[0]?.[0]).toEqual({ cursor: null });
  });

  test("release button removes item without confirm dialog", async () => {
    const alert = jest.spyOn(Alert, "alert");
    signedIn();
    listLoanPlans.mockResolvedValue({ items: [plan("p1", "첫 책"), plan("p2", "둘째 책")], next_cursor: null });
    const d = deferred<{ id: string; status: "released" }>();
    releaseLoanPlan.mockReturnValue(d.promise);
    await render(<LoansTabScreen />);
    await screen.findByTestId("plan-p1");
    const btn = within(screen.getByTestId("plan-p1")).getByText("빼기");
    await fireEvent.press(btn);
    await fireEvent.press(btn);
    expect(releaseLoanPlan).toHaveBeenCalledTimes(1);
    expect(releaseLoanPlan).toHaveBeenCalledWith("p1");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-p1")).toBeTruthy(); // 끝나기 전엔 그대로
    await act(async () => d.resolve({ id: "p1", status: "released" }));
    await waitFor(() => expect(screen.queryByTestId("plan-p1")).toBeNull());
    expect(screen.getByTestId("plan-p2")).toBeTruthy();
  });

  test("release failure keeps item and shows message", async () => {
    signedIn();
    listLoanPlans.mockResolvedValue({ items: [plan("p1", "첫 책")], next_cursor: null });
    releaseLoanPlan.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    releaseLoanPlan.mockRejectedValueOnce(new api.ApiCallError(409, "CONFLICT", "x", ""));
    await render(<LoansTabScreen />);
    await fireEvent.press(await screen.findByText("빼기"));
    expect(await screen.findByText(RELEASE_FAILED)).toBeTruthy();
    expect(screen.getByTestId("plan-p1")).toBeTruthy();
    await fireEvent.press(screen.getByText("빼기"));
    expect(await screen.findByText(RELEASE_CONFLICT)).toBeTruthy();
    expect(screen.getByTestId("plan-p1")).toBeTruthy();
  });

  test("releasing every visible plan loads the next page instead of the empty guide (②-1)", async () => {
    signedIn();
    listLoanPlans.mockResolvedValueOnce({ items: [plan("p1", "첫 책")], next_cursor: "c1" });
    listLoanPlans.mockResolvedValueOnce({ items: [plan("p2", "둘째 책")], next_cursor: null });
    releaseLoanPlan.mockResolvedValueOnce({ id: "p1", status: "released" });
    await render(<LoansTabScreen />);
    await fireEvent.press(await screen.findByText("빼기"));
    expect(await screen.findByTestId("plan-p2")).toBeTruthy();
    expect(listLoanPlans.mock.calls[1]?.[0]).toEqual({ cursor: "c1" });
    expect(screen.queryByText(PLANS_EMPTY)).toBeNull();
    expect(screen.queryByText("더 보기")).toBeNull();
  });

  test("empty planned list guides to search", async () => {
    signedIn();
    listLoanPlans.mockResolvedValue({ items: [], next_cursor: null });
    await render(<LoansTabScreen />);
    expect(await screen.findByText(PLANS_EMPTY)).toBeTruthy();
    await fireEvent.press(screen.getByText("책 찾아보기"));
    expect(mockPush).toHaveBeenCalledWith("/search");
  });

  test("list failure shows retry and more button pages with cursor", async () => {
    signedIn();
    listLoanPlans.mockRejectedValueOnce(new api.ApiCallError(503, "DB_UNAVAILABLE", "x", ""));
    listLoanPlans.mockResolvedValueOnce({ items: [plan("p1", "첫 책")], next_cursor: "c1" });
    listLoanPlans.mockResolvedValueOnce({ items: [plan("p2", "둘째 책")], next_cursor: null });
    await render(<LoansTabScreen />);
    expect(await screen.findByText(PLANS_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText("다시 시도"));
    await screen.findByTestId("plan-p1");
    await fireEvent.press(screen.getByText("더 보기"));
    await screen.findByTestId("plan-p2");
    expect(listLoanPlans.mock.calls[2]?.[0]).toEqual({ cursor: "c1" });
    expect(screen.getByTestId("plan-p1")).toBeTruthy();
    expect(screen.queryByText("더 보기")).toBeNull();
  });
});
