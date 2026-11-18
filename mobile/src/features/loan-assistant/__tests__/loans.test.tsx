// LOAN-1-P2 빌렸어요·D-day 목록 (loan-assistant.md LOAN-1 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import LoansTabScreen from "../../../../app/(tabs)/loans";
import { useAuth } from "../../../auth/AuthProvider";
import * as platform from "../../../lib/platform";
import * as lib from "../../../lib/publicApi";
import type { Book } from "../../../lib/publicApi";
import { theme } from "../../../theme";
import * as planApi from "../../book-search/api";
import type { LoanPlan } from "../../book-search/api";
import { BookDetailScreen } from "../../book-search/BookDetailScreen";
import * as api from "../api";
import type { Loan, LoanPage } from "../api";
import { ddayColors, ddayFormat, ddayGauge } from "../dday";
import { LOANS_EMPTY, LOANS_FAILED } from "../LoansSection";
import { LOGIN_TO_LOAN, START_CONFLICT, START_FAILED } from "../StartLoanButton";

// @types/node 없이 쓰는 최소 타입(소스 검사용, search.test.tsx와 같은 방식)
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: "utf8"): string;
};
const path = require("path") as { join(...parts: string[]): string };

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
  return { ...actual, fetchBook: jest.fn(), fetchAvailabilityNearby: jest.fn(), fetchAvailabilityInCity: jest.fn() };
});

jest.mock("../../book-search/api", () => {
  const actual = jest.requireActual<typeof import("../../book-search/api")>("../../book-search/api");
  return { ...actual, listLoanPlans: jest.fn(), saveLoanPlan: jest.fn(), releaseLoanPlan: jest.fn() };
});

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, listLoans: jest.fn(), startLoan: jest.fn() };
});

const locate = jest.mocked(platform.locate);
const fetchBook = jest.mocked(lib.fetchBook);
const fetchAvailabilityNearby = jest.mocked(lib.fetchAvailabilityNearby);
const listLoanPlans = jest.mocked(planApi.listLoanPlans);
const listLoans = jest.mocked(api.listLoans);
const startLoan = jest.mocked(api.startLoan);

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

function loan(id: string, extra: Partial<Loan> = {}): Loan {
  return {
    id,
    book: { isbn13: BOY.isbn13, title: `책 ${id}`, author: "한강", cover_url: null },
    library: { id: 101, name: "정독도서관" },
    plan_id: null,
    loaned_on: "2026-11-10",
    due_on: "2026-11-24",
    due_on_assumed: true,
    status: "on_loan",
    returned_on: null,
    d_day: 8,
    is_overdue: false,
    ...extra,
  };
}

function page(items: Loan[], next_cursor: string | null = null): LoanPage {
  return { items, next_cursor, today: "2026-11-16" };
}

function plan(id: string, title: string): LoanPlan {
  return {
    id,
    book: { isbn13: BOY.isbn13, title, author: "한강", cover_url: null },
    library: { id: 102, name: "종로도서관", area_label: "사직동" },
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

function signedIn(userId = "user-a") {
  jest.mocked(useAuth).mockReturnValue({
    status: "signedIn",
    userId,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

function signedOut() {
  jest.mocked(useAuth).mockReturnValue({
    status: "signedOut",
    userId: null,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

const conflict = () => new api.ApiCallError(409, "CONFLICT", "이미 바뀐 내용이에요.", "");

beforeEach(async () => {
  jest.clearAllMocks();
  for (const m of [locate, fetchBook, fetchAvailabilityNearby, listLoanPlans, listLoans, startLoan]) m.mockReset();
  await AsyncStorage.clear();
  jest.mocked(useAuth).mockReturnValue({
    status: "signedOut",
    userId: null,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  fetchBook.mockResolvedValue(BOY);
  locate.mockResolvedValue({ ok: true, lat: 37.58, lng: 126.98 });
  fetchAvailabilityNearby.mockResolvedValue({
    isbn13: BOY.isbn13, scope: "nearby", radius_km: 3, dtl_region: null, checked_at: "2026-11-16T09:30:12+09:00", items: [],
  });
  listLoanPlans.mockResolvedValue({ items: [], next_cursor: null });
  listLoans.mockResolvedValue(page([]));
});

describe("LOAN-1-P2", () => {
  test("start loan from detail double tap sends once and shows assumed due banner", async () => {
    // 비로그인: 로그인 안내만, 서버에 묻지 않는다
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await screen.findByTestId("start-loan");
    await fireEvent.press(screen.getByTestId("start-loan"));
    expect(screen.getByText(LOGIN_TO_LOAN)).toBeTruthy();
    await fireEvent.press(screen.getByText("로그인"));
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(startLoan).not.toHaveBeenCalled();
    await screen.unmount();

    // 로그인: 두 번 빠르게 눌러도 한 번만, 진행 중 "기록 중…"
    signedIn();
    const d = deferred<Loan>();
    startLoan.mockReturnValue(d.promise);
    await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    const btn = await screen.findByTestId("start-loan");
    await fireEvent.press(btn);
    await fireEvent.press(btn);
    expect(screen.getByText("기록 중…")).toBeTruthy();
    expect(startLoan).toHaveBeenCalledTimes(1);
    expect(startLoan).toHaveBeenCalledWith({ isbn13: BOY.isbn13 });
    await act(async () => d.resolve(loan("n1", { loaned_on: "2026-11-16", due_on: "2026-11-30", d_day: 14 })));
    expect(await screen.findByText("내 대출에 기록했어요. 반납 예정일은 2026-11-30(추정)예요.")).toBeTruthy();
    await fireEvent.press(screen.getByText("내 대출 보기"));
    expect(mockPush).toHaveBeenCalledWith("/loans");
    expect(screen.getByText("빌렸어요")).toBeTruthy();

    // 실패 문구
    startLoan.mockRejectedValue(new api.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", ""));
    await fireEvent.press(screen.getByTestId("start-loan"));
    expect(await screen.findByText(START_FAILED)).toBeTruthy();
  });

  test("start loan from loan plan passes planId and refreshes loans", async () => {
    signedIn();
    listLoanPlans.mockResolvedValue({ items: [plan("p1", "예정 책"), plan("p2", "둘째 예정")], next_cursor: null });
    listLoans.mockResolvedValueOnce(page([]));
    await render(<LoansTabScreen />);
    await screen.findByTestId("plan-p1");
    await screen.findByText(LOANS_EMPTY);
    expect(listLoans).toHaveBeenCalledTimes(1);

    const moved = loan("l1", { plan_id: "p1", due_on: "2026-11-30", book: { ...loan("l1").book, title: "예정 책" } });
    listLoans.mockResolvedValue(page([moved]));
    startLoan.mockResolvedValueOnce(moved);
    await fireEvent.press(within(screen.getByTestId("plan-p1")).getByText("빌렸어요->"));
    expect(startLoan).toHaveBeenCalledWith({ isbn13: BOY.isbn13, libraryId: 102, planId: "p1" });
    expect(await screen.findByText("내 대출에 추가했어요. 반납 예정일은 2026-11-30(추정)예요.")).toBeTruthy();
    expect(screen.queryByTestId("plan-p1")).toBeNull();
    await screen.findByTestId("loan-l1");
    expect(listLoans).toHaveBeenCalledTimes(2);
    expect(listLoans.mock.calls[1]?.[0]).toBe("on_loan");

    // 409: 이미 바뀐 내용 — 예정·대출 둘 다 다시 읽는다
    listLoanPlans.mockResolvedValue({ items: [], next_cursor: null });
    startLoan.mockRejectedValueOnce(conflict());
    const plansBefore = listLoanPlans.mock.calls.length;
    await fireEvent.press(within(screen.getByTestId("plan-p2")).getByText("빌렸어요->"));
    expect(await screen.findByText(START_CONFLICT)).toBeTruthy();
    await waitFor(() => expect(listLoanPlans.mock.calls.length).toBe(plansBefore + 1));
    await waitFor(() => expect(listLoans).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByTestId("plan-p2")).toBeNull());
    expect(screen.getByText(START_CONFLICT)).toBeTruthy();
  });

  test("loans section renders server d_day verbatim without client recalculation", async () => {
    signedIn();
    // 기기 날짜를 서버 오늘과 다르게: 앱이 직접 계산하면 D-8이 아닌 값이 나온다
    jest.useFakeTimers({ now: new Date("2027-03-01T12:00:00+09:00"), doNotFake: ["nextTick", "setImmediate"] });
    try {
      listLoans.mockResolvedValue(page([
        loan("a", { d_day: 8, due_on_assumed: true }),
        loan("b", { d_day: 8, due_on_assumed: false, due_on: "2026-11-24" }),
      ]));
      await render(<LoansTabScreen />);
      await screen.findByTestId("loan-a");
      expect(within(screen.getByTestId("dday-a")).getByText("D-08")).toBeTruthy();
      expect(within(screen.getByTestId("dday-b")).getByText("D-08")).toBeTruthy();
      expect(within(screen.getByTestId("loan-a")).getByText("2026.11.10 — 11.24 · 추정")).toBeTruthy();
      expect(within(screen.getByTestId("loan-b")).getByText("2026.11.10 — 11.24")).toBeTruthy();
      expect(within(screen.getByTestId("loan-a")).getByText("정독도서관")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test("ddayFormat and ddayColors cover all 4 stages with theme tokens", () => {
    const c = theme.colors;
    const cases: [number, boolean, string, string, string, { bg: string; fg: string }][] = [
      [-2, true, "연체 2일", "+02D", "overdue", { bg: c.loanOut, fg: c.loanOut }],
      [0, false, "오늘 반납", "D-DAY", "urgent", { bg: c.inkStrong, fg: c.inkStrong }],
      [3, false, "임박", "D-03", "soon", { bg: c.fill1, fg: c.inkStrong }],
      [8, false, "여유", "D-08", "normal", { bg: c.surface3, fg: c.inkSoft }],
    ];
    for (const [dDay, overdue, label, gauge, tone, colors] of cases) {
      const f = ddayFormat(dDay, overdue);
      expect(f).toEqual({ label, tone });
      expect(ddayGauge(dDay, overdue)).toBe(gauge);
      expect(ddayColors(f.tone, c)).toEqual(colors);
    }
    expect(ddayFormat(1, false)).toEqual({ label: "임박", tone: "soon" });
    expect(ddayFormat(4, false)).toEqual({ label: "여유", tone: "normal" });
    expect(ddayFormat(-1, false).tone).toBe("overdue"); // 음수면 서버 표시가 빠져도 연체
    // 4단계 점 색이 서로 달라야 구분된다
    expect(new Set(cases.map(([, , , , , col]) => col.bg)).size).toBe(4);

    // 색·곡률 하드코딩 금지: loan-assistant 소스에 #RRGGBB·rgb(·곡률 숫자 없음
    const dir = path.join(__dirname, "..");
    const sources = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(sources.length).toBeGreaterThanOrEqual(4);
    const offenders: string[] = [];
    for (const f of sources) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (/#[0-9A-Fa-f]{3,8}\b/.test(src)) offenders.push(`${f}: #hex`);
      if (/rgba?\(/.test(src)) offenders.push(`${f}: rgb(`);
      if (/Radius:\s*\d/.test(src)) offenders.push(`${f}: *Radius 숫자`);
    }
    expect(offenders).toEqual([]);
  });

  test("loans section handles loading, empty, error retry, pagination, and signed out", async () => {
    // 비로그인: #19를 부르지 않는다
    await render(<LoansTabScreen />);
    expect(screen.getByText("로그인하면 빌릴 예정과 내 대출을 볼 수 있어요")).toBeTruthy();
    expect(listLoans).not.toHaveBeenCalled();
    await screen.unmount();

    signedIn();
    // 불러오는 중 → 실패 → 다시 시도 → 빈 화면
    const first = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(first.promise);
    await render(<LoansTabScreen />);
    expect(within(screen.getByTestId("my-loans")).getByLabelText("불러오는 중")).toBeTruthy();
    await act(async () => first.reject(new api.ApiCallError(503, "DB_UNAVAILABLE", "x", "")));
    expect(await screen.findByText(LOANS_FAILED)).toBeTruthy();
    listLoans.mockResolvedValueOnce(page([]));
    await fireEvent.press(within(screen.getByTestId("my-loans")).getByText("다시 시도"));
    expect(await screen.findByText(LOANS_EMPTY)).toBeTruthy();
    await screen.unmount();

    // 더 보기: 다음 쪽을 이어 붙이고, 끝나면 버튼이 사라진다
    listLoans.mockReset();
    // 커서별 응답(알림 맞추기도 빌린 책을 끝 페이지까지 읽으므로 호출 순서가 아니라 커서로 답한다, LOAN-3 T4)
    listLoans.mockImplementation(async (_status, p) =>
      p.cursor === "cur-1" ? page([loan("x2", { d_day: 5 })]) : page([loan("x1", { d_day: 1 })], "cur-1")
    );
    await render(<LoansTabScreen />);
    await screen.findByTestId("loan-x1");
    await fireEvent.press(screen.getByText("더 보기"));
    await screen.findByTestId("loan-x2");
    expect(listLoans.mock.calls[1]?.[1]).toEqual({ cursor: "cur-1" });
    expect(screen.queryByText("더 보기")).toBeNull();
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf("책 x1")).toBeLessThan(json.indexOf("책 x2")); // 서버 순서 그대로
    expect(json.indexOf("내 대출")).toBeLessThan(json.indexOf("빌릴 예정"));
    await screen.unmount();

    // 늦게 온 앞 응답은 화면을 덮지 않는다: 첫 읽기가 걸린 사이 "다시 읽기"가 먼저 끝남
    listLoans.mockReset();
    const slow = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(slow.promise);
    listLoanPlans.mockResolvedValue({ items: [plan("p9", "예정 책")], next_cursor: null });
    startLoan.mockRejectedValueOnce(conflict()); // 409 → 내 대출 다시 읽기
    listLoans.mockResolvedValueOnce(page([loan("fresh")]));
    await render(<LoansTabScreen />);
    await screen.findByTestId("plan-p9");
    await fireEvent.press(within(screen.getByTestId("plan-p9")).getByText("빌렸어요->"));
    await screen.findByTestId("loan-fresh");
    await act(async () => slow.resolve(page([loan("stale")])));
    expect(screen.queryByTestId("loan-stale")).toBeNull();
    expect(screen.getByTestId("loan-fresh")).toBeTruthy();
  });

  test("switching signed-in user clears previous loans and discards delayed response (P1)", async () => {
    signedIn("user-a");
    const slowA = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(slowA.promise);
    listLoanPlans.mockResolvedValue({ items: [], next_cursor: null });
    const { rerender } = await render(<LoansTabScreen />);
    expect(within(screen.getByTestId("my-loans")).getByLabelText("불러오는 중")).toBeTruthy();

    signedIn("user-b");
    listLoans.mockResolvedValueOnce(page([loan("b1")]));
    await rerender(<LoansTabScreen />);
    await screen.findByTestId("loan-b1");

    await act(async () => slowA.resolve(page([loan("a1")])));
    expect(screen.queryByTestId("loan-a1")).toBeNull();
    expect(screen.getByTestId("loan-b1")).toBeTruthy();
  });

  test("start loan button clears note on account change and drops in-flight response (P2)", async () => {
    signedIn("user-a");
    startLoan.mockResolvedValueOnce(loan("n1", { due_on: "2026-11-30" }));
    const { rerender } = await render(<BookDetailScreen isbn13={BOY.isbn13} />);
    await fireEvent.press(await screen.findByTestId("start-loan"));
    await screen.findByTestId("loan-started-note");

    // 로그아웃 시 기존 성공 배너 제거
    signedOut();
    await rerender(<BookDetailScreen isbn13={BOY.isbn13} />);
    expect(screen.queryByTestId("loan-started-note")).toBeNull();

    // POST 진행 중 계정 교체 시 이전 계정 응답 무시
    signedIn("user-a");
    await rerender(<BookDetailScreen isbn13={BOY.isbn13} />);
    const pendingA = deferred<Loan>();
    startLoan.mockReturnValueOnce(pendingA.promise);
    await fireEvent.press(screen.getByTestId("start-loan"));
    expect(screen.getByText("기록 중…")).toBeTruthy();

    signedIn("user-b");
    await rerender(<BookDetailScreen isbn13={BOY.isbn13} />);
    expect(screen.getByText("빌렸어요")).toBeTruthy();
    await act(async () => pendingA.resolve(loan("n2", { due_on: "2026-12-01" })));
    expect(screen.queryByTestId("loan-started-note")).toBeNull();
  });

  test("loan conversion cancels stale plan reload so converted card does not reappear (P2)", async () => {
    signedIn("user-a");
    listLoanPlans.mockResolvedValueOnce({
      items: [plan("p1", "전환 책"), plan("p2", "다른 책")],
      next_cursor: null,
    });
    listLoans.mockResolvedValue(page([]));
    await render(<LoansTabScreen />);
    await screen.findByTestId("plan-p1");

    const postDeferred = deferred<Loan>();
    startLoan.mockReturnValueOnce(postDeferred.promise);
    await fireEvent.press(within(screen.getByTestId("plan-p1")).getByText("빌렸어요->"));

    // 전환 POST 진행 중 #16 재조회가 시작된 상황(예: 다른 예정 404 → load())
    const staleReload = deferred<{ items: LoanPlan[]; next_cursor: null }>();
    listLoanPlans.mockReturnValueOnce(staleReload.promise);
    jest.mocked(planApi.releaseLoanPlan).mockRejectedValueOnce(new api.ApiCallError(404, "NOT_FOUND", "x", ""));
    await fireEvent.press(within(screen.getByTestId("plan-p2")).getByText("빼기"));

    // 전환 POST가 먼저 성공하고, 이후 커밋된 최신 목록은 빈 목록을 반환
    const freshReload = deferred<{ items: LoanPlan[]; next_cursor: null }>();
    listLoanPlans.mockReturnValueOnce(freshReload.promise);
    await act(async () =>
      postDeferred.resolve(loan("l1", { plan_id: "p1", due_on: "2026-11-30" }))
    );
    expect(await screen.findByTestId("loan-converted-note")).toBeTruthy();

    // 오래된 재조회 응답이 p1을 포함해 뒤늦게 도착해도 무시된다
    await act(async () => staleReload.resolve({ items: [plan("p1", "전환 책")], next_cursor: null }));
    await act(async () => freshReload.resolve({ items: [], next_cursor: null }));
    expect(screen.queryByTestId("plan-p1")).toBeNull();
    expect(screen.getByTestId("loan-converted-note")).toBeTruthy();
  });
});
