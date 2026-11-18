// LOAN-2-P2 기한 수정·반납 (loan-assistant.md LOAN-2 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import * as api from "../api";
import type { Loan, LoanPage } from "../api";
import { DUE_FAILED, SHEET_TITLE, addDays, parseYmd } from "../DueDateSheet";
import {
  CHANGED,
  LOANS_EMPTY,
  LoansSection,
  RETURNED_EMPTY,
  RETURNED_NOTE,
  RETURN_FAILED,
  RETURN_TITLE,
} from "../LoansSection";

// @types/node 없이 쓰는 최소 타입(소스 검사용, search.test.tsx와 같은 방식)
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: "utf8"): string;
};
const path = require("path") as { join(...parts: string[]): string };

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

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, listLoans: jest.fn(), startLoan: jest.fn(), changeDueDate: jest.fn(), returnLoan: jest.fn() };
});

const listLoans = jest.mocked(api.listLoans);
const changeDueDate = jest.mocked(api.changeDueDate);
const returnLoan = jest.mocked(api.returnLoan);

function loan(id: string, extra: Partial<Loan> = {}): Loan {
  return {
    id,
    book: { isbn13: "9788936434120", title: `책 ${id}`, author: "한강", cover_url: null },
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

const page = (items: Loan[], next_cursor: string | null = null): LoanPage => ({ items, next_cursor, today: "2026-11-16" });
const err = (status: number, code: string) => new api.ApiCallError(status, code, "x", "");

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function openSheet(id: string) {
  await fireEvent.press(within(screen.getByTestId(`loan-${id}`)).getByText("수정"));
  expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of [listLoans, changeDueDate, returnLoan]) m.mockReset();
});

describe("LOAN-2-P2", () => {
  test("due date sheet blocks dates before loaned_on and updates card on save", async () => {
    listLoans.mockResolvedValue(page([loan("a")]));
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");
    await openSheet("a");
    expect(screen.getByText("대출일 2026-11-10부터 고를 수 있어요.")).toBeTruthy();
    expect(screen.getByTestId("due-input").props.value).toBe("2026-11-24");

    // 대출일 이전·달력 밖·형식 틀림: 보내지 않고 시트 안 문구
    for (const bad of ["2026-11-09", "2026-02-30", "2026-11-31", "2026/11/28"]) {
      await fireEvent.changeText(screen.getByTestId("due-input"), bad);
      await fireEvent.press(screen.getByTestId("due-save"));
      expect(screen.getByText("대출일(2026-11-10) 이후 날짜를 골라 주세요.")).toBeTruthy();
    }
    expect(changeDueDate).not.toHaveBeenCalled();

    // 빠른 조정: 지금 고른 날 기준, 대출일 이전으로 가는 "하루 전"은 막힘
    await fireEvent.changeText(screen.getByTestId("due-input"), "2026-11-10");
    expect(screen.getByTestId("due-chip--1").props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByText("하루 전"));
    expect(screen.getByTestId("due-input").props.value).toBe("2026-11-10"); // 눌러도 그대로
    await fireEvent.press(screen.getByText("+14일"));
    expect(screen.getByTestId("due-input").props.value).toBe("2026-11-24");
    await fireEvent.press(screen.getByText("하루 뒤"));
    expect(screen.getByTestId("due-input").props.value).toBe("2026-11-25");

    // 저장: 연타해도 한 번, 성공하면 시트 닫고 (추정) 사라짐
    await fireEvent.changeText(screen.getByTestId("due-input"), "2026-11-28");
    const d = deferred<Loan>();
    changeDueDate.mockReturnValue(d.promise);
    await fireEvent.press(screen.getByTestId("due-save"));
    await fireEvent.press(screen.getByTestId("due-save"));
    expect(screen.getByText("저장 중…")).toBeTruthy();
    expect(changeDueDate).toHaveBeenCalledTimes(1);
    expect(changeDueDate).toHaveBeenCalledWith("a", "2026-11-28");
    const savedA = loan("a", { due_on: "2026-11-28", due_on_assumed: false, d_day: 12 });
    listLoans.mockResolvedValue(page([savedA])); // 저장 뒤 다시 읽기는 커밋된 값을 돌려준다
    await act(async () => d.resolve(savedA));
    await waitFor(() => expect(screen.queryByText(SHEET_TITLE)).toBeNull());
    const card = screen.getByTestId("loan-a");
    expect(within(card).getByText("2026.11.10 — 11.28")).toBeTruthy();
    expect(within(card).getByText("D-12")).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain("(추정)");

    // 422가 오면 같은 문구, 시트 유지
    await openSheet("a");
    changeDueDate.mockRejectedValueOnce(err(422, "VALIDATION_ERROR"));
    await fireEvent.press(screen.getByTestId("due-save"));
    expect(await screen.findByText("대출일(2026-11-10) 이후 날짜를 골라 주세요.")).toBeTruthy();
    expect(screen.getByText(SHEET_TITLE)).toBeTruthy();

    // 날짜 도우미
    expect(parseYmd("2028-02-29")).toBe("2028-02-29");
    expect(parseYmd("2026-02-29")).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("due date sheet handles 409 conflict by closing and refreshing list", async () => {
    listLoans.mockResolvedValue(page([loan("a")]));
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");

    // 503: 시트 유지 + 문구, 다시 누를 수 있음
    await openSheet("a");
    changeDueDate.mockRejectedValueOnce(err(503, "DB_UNAVAILABLE"));
    await fireEvent.press(screen.getByTestId("due-save"));
    expect(await screen.findByText(DUE_FAILED)).toBeTruthy();
    expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
    expect(listLoans).toHaveBeenCalledTimes(1);

    // 409: 시트 닫고 안내 + 목록 다시 읽기
    changeDueDate.mockRejectedValueOnce(err(409, "CONFLICT"));
    listLoans.mockResolvedValue(page([]));
    await fireEvent.press(screen.getByTestId("due-save"));
    await waitFor(() => expect(screen.queryByText(SHEET_TITLE)).toBeNull());
    expect(changeDueDate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(listLoans).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(LOANS_EMPTY)).toBeTruthy();
    expect(screen.getByText(CHANGED)).toBeTruthy();
  });

  test("return button asks confirmation and moves loan to returned tab", async () => {
    listLoans.mockResolvedValue(page([loan("a"), loan("b", { d_day: 3 })]));
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");

    // 취소: 보내지 않는다
    await fireEvent.press(within(screen.getByTestId("loan-a")).getByText("반납->"));
    expect(screen.getByText(RETURN_TITLE)).toBeTruthy();
    expect(screen.getByText("책 a을 지난 대출로 옮길게요.")).toBeTruthy();
    await fireEvent.press(screen.getByText("취소"));
    expect(screen.queryByText(RETURN_TITLE)).toBeNull();
    expect(returnLoan).not.toHaveBeenCalled();

    // 실패(503): 창 유지 + 문구
    await fireEvent.press(within(screen.getByTestId("loan-a")).getByText("반납->"));
    returnLoan.mockRejectedValueOnce(err(503, "DB_UNAVAILABLE"));
    await fireEvent.press(screen.getByTestId("return-confirm-ok"));
    expect(await screen.findByText(RETURN_FAILED)).toBeTruthy();
    expect(screen.getByText(RETURN_TITLE)).toBeTruthy();

    // 확인: 연타해도 한 번, 빌린 책에서 빠지고 안내
    const d = deferred<Loan>();
    returnLoan.mockReturnValue(d.promise);
    await fireEvent.press(screen.getByTestId("return-confirm-ok"));
    await fireEvent.press(screen.getByTestId("return-confirm-ok"));
    expect(screen.getByText("처리 중…")).toBeTruthy();
    expect(returnLoan).toHaveBeenCalledTimes(2); // 503 한 번 + 이번 한 번
    const refetch = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(refetch.promise);
    await act(async () => d.resolve(loan("a", { status: "returned", returned_on: "2026-11-16", d_day: 0 })));
    await waitFor(() => expect(screen.queryByText(RETURN_TITLE)).toBeNull());
    // 다시 읽기 응답 전에도 바로 빠진다(E7)
    expect(screen.queryByTestId("loan-a")).toBeNull();
    expect(screen.getByTestId("loan-b")).toBeTruthy();
    expect(screen.getByText(RETURNED_NOTE)).toBeTruthy();
    expect(listLoans).toHaveBeenCalledTimes(2);
    await act(async () => refetch.resolve(page([loan("b", { d_day: 3 })])));
    expect(screen.queryByTestId("loan-a")).toBeNull();
    expect(screen.getByText(RETURNED_NOTE)).toBeTruthy();

    // 404: 창 닫고 안내 + 다시 읽기
    returnLoan.mockReset();
    returnLoan.mockRejectedValueOnce(err(404, "NOT_FOUND"));
    listLoans.mockResolvedValue(page([]));
    await fireEvent.press(within(screen.getByTestId("loan-b")).getByText("반납->"));
    await fireEvent.press(screen.getByTestId("return-confirm-ok"));
    await waitFor(() => expect(screen.queryByText(RETURN_TITLE)).toBeNull());
    expect(await screen.findByText(CHANGED)).toBeTruthy();
    expect(listLoans).toHaveBeenCalledTimes(3);
  });

  test("loans section switches between on_loan and returned tabs with race guard", async () => {
    listLoans.mockResolvedValueOnce(page([loan("a")]));
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");
    expect(listLoans.mock.calls[0]?.[0]).toBe("on_loan");

    // 지난 대출 0건
    listLoans.mockResolvedValueOnce(page([]));
    await fireEvent.press(screen.getByTestId("loans-tab-returned"));
    expect(await screen.findByText(RETURNED_EMPTY)).toBeTruthy();
    expect(listLoans.mock.calls[1]?.[0]).toBe("returned");
    expect(screen.queryByTestId("loan-a")).toBeNull();

    // 빠른 왕복: 빌린 책(늦음) → 지난 대출(1건) 순서로 눌렀는데 빌린 책 응답이 나중에 와도 덮지 않는다
    const slowOnLoan = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(slowOnLoan.promise);
    listLoans.mockResolvedValueOnce(page([loan("r", { status: "returned", returned_on: "2026-11-15", d_day: 0 })]));
    await fireEvent.press(screen.getByTestId("loans-tab-on_loan"));
    await fireEvent.press(screen.getByTestId("loans-tab-returned"));
    const done = await screen.findByTestId("returned-r");
    await act(async () => slowOnLoan.resolve(page([loan("stale")])));
    expect(screen.queryByTestId("loan-stale")).toBeNull();
    expect(screen.getByTestId("returned-r")).toBe(done); // 늦은 응답 뒤에도 같은 화면 그대로
    expect(screen.queryByText("내 대출을 불러오지 못했어요.")).toBeNull();
    expect(within(done).getByText("반납 완료")).toBeTruthy();
    expect(within(done).getByText("2026.11.10 — 11.15")).toBeTruthy();
    // 지난 대출 카드에는 D-day·수정·반납->가 없다
    expect(within(done).queryByText("수정")).toBeNull();
    expect(within(done).queryByText("반납->")).toBeNull();
    expect(within(done).queryByText(/D-|연체|오늘 반납/)).toBeNull();
    expect(listLoans.mock.calls.map((call) => call[0])).toEqual(["on_loan", "returned", "on_loan", "returned"]);
  });

  // ── PR #170 리뷰 보완 ──

  const cardOrder = () => screen.getAllByTestId(/^loan-/).map((n) => n.props.testID as string);

  test("due change re-reads from first page so order and cursor follow the server (M8·C2)", async () => {
    const a = loan("a", { due_on: "2026-11-20", d_day: 4 });
    const b = loan("b", { due_on: "2026-11-21", d_day: 5 });
    const c = loan("c", { due_on: "2026-12-01", d_day: 15 });
    // 서버 흉내: 첫 페이지는 지금 서버 상태, 다음 페이지는 커서로 답한다(알림 맞추기도 같은 #19를 끝까지 읽는다, LOAN-3 T4)
    let firstPage = page([a, b], "cur-old");
    listLoans.mockImplementation(async (_status, p) => (p.cursor === null ? firstPage : page([c])));
    const firstPageReads = () => listLoans.mock.calls.filter((call) => call[1].cursor === null).length;
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");
    expect(cardOrder()).toEqual(["loan-a", "loan-b"]);

    // 첫 책 예정일을 뒤로 → 저장 성공 → 첫 페이지부터 다시 읽음(서버: B, A 순·새 커서)
    await openSheet("a");
    await fireEvent.changeText(screen.getByTestId("due-input"), "2026-11-30");
    const savedA = loan("a", { due_on: "2026-11-30", due_on_assumed: false, d_day: 14 });
    changeDueDate.mockResolvedValueOnce(savedA);
    const before = firstPageReads();
    firstPage = page([b, savedA], "cur-new");
    await fireEvent.press(screen.getByTestId("due-save"));
    await waitFor(() => expect(cardOrder()).toEqual(["loan-b", "loan-a"]));
    expect(firstPageReads()).toBe(before + 1);
    expect(within(screen.getByTestId("loan-a")).getByText("2026.11.10 — 11.30")).toBeTruthy();

    // 다음 페이지는 새 커서로 이어진다(중복·누락 없음)
    await fireEvent.press(screen.getByText("더 보기"));
    await waitFor(() => expect(cardOrder()).toEqual(["loan-b", "loan-a", "loan-c"]));
    expect(listLoans.mock.lastCall?.slice(0, 2)).toEqual(["on_loan", { cursor: "cur-new" }]);
    expect(screen.queryByText("더 보기")).toBeNull();
  });

  test("return success discards list reads started before commit (E7)", async () => {
    listLoans.mockResolvedValueOnce(page([loan("a"), loan("b")]));
    const view = await render(<LoansSection refreshKey={0} />);
    await screen.findByTestId("loan-a");

    const post = deferred<Loan>();
    returnLoan.mockReturnValueOnce(post.promise);
    await fireEvent.press(within(screen.getByTestId("loan-a")).getByText("반납->"));
    await fireEvent.press(screen.getByTestId("return-confirm-ok"));

    // 반납 POST 진행 중 다시 읽기 시작(커밋 전 행을 읽은 응답이 늦게 옴)
    const stale = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(stale.promise);
    await view.rerender(<LoansSection refreshKey={1} />);
    expect(screen.getByLabelText("불러오는 중")).toBeTruthy();

    // 쓰기 성공이 먼저 → 변경 전 응답이 나중
    const fresh = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(fresh.promise);
    await act(async () => post.resolve(loan("a", { status: "returned", returned_on: "2026-11-16" })));
    expect(screen.getByText(RETURNED_NOTE)).toBeTruthy();
    await act(async () => stale.resolve(page([loan("a"), loan("b")])));
    expect(screen.queryByTestId("loan-a")).toBeNull();
    await act(async () => fresh.resolve(page([loan("b")])));
    expect(screen.queryByTestId("loan-a")).toBeNull();
    expect(screen.getByTestId("loan-b")).toBeTruthy();
    expect(screen.getByText(RETURNED_NOTE)).toBeTruthy();
    expect(listLoans).toHaveBeenCalledTimes(3);
  });

  test("due change success discards list reads started before commit", async () => {
    listLoans.mockResolvedValueOnce(page([loan("a")]));
    const view = await render(<LoansSection refreshKey={0} />);
    await screen.findByTestId("loan-a");

    await openSheet("a");
    await fireEvent.changeText(screen.getByTestId("due-input"), "2026-11-28");
    const patch = deferred<Loan>();
    changeDueDate.mockReturnValueOnce(patch.promise);
    await fireEvent.press(screen.getByTestId("due-save"));

    const stale = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(stale.promise);
    await view.rerender(<LoansSection refreshKey={1} />);

    const savedA = loan("a", { due_on: "2026-11-28", due_on_assumed: false, d_day: 12 });
    const fresh = deferred<LoanPage>();
    listLoans.mockReturnValueOnce(fresh.promise);
    await act(async () => patch.resolve(savedA));
    await act(async () => stale.resolve(page([loan("a")]))); // 옛 예정일 2026.11.10 — 11.24 · 추정
    expect(screen.queryByText("2026.11.10 — 11.24 · 추정")).toBeNull();
    await act(async () => fresh.resolve(page([savedA])));
    expect(within(screen.getByTestId("loan-a")).getByText("2026.11.10 — 11.28")).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain("(추정)");
  });

  test("late completion of a closed sheet never touches the sheet now open for another loan", async () => {
    const a = loan("a");
    const b = loan("b", { loaned_on: "2026-11-12", due_on: "2026-11-26", d_day: 10 });
    listLoans.mockResolvedValue(page([a, b]));
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");

    // A 저장(지연) → 닫기 → B 열고 입력
    const openBWhileAPending = async () => {
      await openSheet("a");
      await fireEvent.changeText(screen.getByTestId("due-input"), "2026-11-29");
      const pending = deferred<Loan>();
      changeDueDate.mockReturnValueOnce(pending.promise);
      await fireEvent.press(screen.getByTestId("due-save"));
      expect(screen.getByText("저장 중…")).toBeTruthy();
      await fireEvent.press(screen.getByText("닫기"));
      expect(screen.queryByText(SHEET_TITLE)).toBeNull();
      await openSheet("b");
      expect(screen.getByText("대출일 2026-11-12부터 고를 수 있어요.")).toBeTruthy();
      expect(screen.getByText("저장")).toBeTruthy(); // A 때문에 B 저장이 막히지 않는다
      await fireEvent.changeText(screen.getByTestId("due-input"), "2026-12-05");
      return pending;
    };
    const keepsB = () => {
      expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
      expect(screen.getByText("대출일 2026-11-12부터 고를 수 있어요.")).toBeTruthy();
      expect(screen.getByTestId("due-input").props.value).toBe("2026-12-05");
      expect(screen.getByText("저장")).toBeTruthy();
      expect(screen.queryByText(DUE_FAILED)).toBeNull();
      expect(screen.queryByText(/이후 날짜를 골라 주세요/)).toBeNull();
      expect(screen.queryByText(CHANGED)).toBeNull();
    };

    // ① A 성공: B 시트 유지, A 카드는 목록에서 새 예정일로 맞춰짐
    let pending = await openBWhileAPending();
    const savedA = loan("a", { due_on: "2026-11-29", due_on_assumed: false, d_day: 13 });
    listLoans.mockResolvedValue(page([b, savedA]));
    await act(async () => pending.resolve(savedA));
    keepsB();
    await waitFor(() => expect(cardOrder()).toEqual(["loan-b", "loan-a"]));
    expect(within(screen.getByTestId("loan-a")).getByText("2026.11.10 — 11.29")).toBeTruthy();
    await fireEvent.press(screen.getByText("닫기"));

    // ② A 503 / 422: B 시트에 엉뚱한 문구가 뜨지 않는다
    for (const failure of [err(503, "DB_UNAVAILABLE"), err(422, "VALIDATION_ERROR")]) {
      pending = await openBWhileAPending();
      await act(async () => pending.reject(failure));
      keepsB();
      await fireEvent.press(screen.getByText("닫기"));
    }

    // ③ A 409: B 시트는 닫히지 않고, 목록만 조용히 다시 읽는다
    pending = await openBWhileAPending();
    const calls = listLoans.mock.calls.length;
    await act(async () => pending.reject(err(409, "CONFLICT")));
    keepsB();
    await waitFor(() => expect(listLoans.mock.calls.length).toBe(calls + 1));

    // B 저장은 정상으로 끝난다
    const savedB = loan("b", { loaned_on: "2026-11-12", due_on: "2026-12-05", due_on_assumed: false, d_day: 19 });
    changeDueDate.mockResolvedValueOnce(savedB);
    listLoans.mockResolvedValue(page([savedA, savedB]));
    await fireEvent.press(screen.getByTestId("due-save"));
    await waitFor(() => expect(screen.queryByText(SHEET_TITLE)).toBeNull());
    expect(within(screen.getByTestId("loan-b")).getByText("2026.11.12 — 12.05")).toBeTruthy();
  });

  test("late return of a dismissed confirm does not close the confirm opened for another loan", async () => {
    listLoans.mockResolvedValue(page([loan("a"), loan("b")]));
    await render(<LoansSection />);
    await screen.findByTestId("loan-a");

    const post = deferred<Loan>();
    returnLoan.mockReturnValueOnce(post.promise);
    await fireEvent.press(within(screen.getByTestId("loan-a")).getByText("반납->"));
    await fireEvent.press(screen.getByTestId("return-confirm-ok"));
    // 안드로이드 뒤로 가기(onRequestClose)로 처리 중 창을 닫고 B 창을 연다
    let modal = screen.getByTestId("return-confirm");
    while (modal.parent && typeof modal.props.onRequestClose !== "function") modal = modal.parent;
    await fireEvent(modal, "requestClose");
    expect(screen.queryByText(RETURN_TITLE)).toBeNull();
    await fireEvent.press(within(screen.getByTestId("loan-b")).getByText("반납->"));
    expect(screen.getByText("책 b을 지난 대출로 옮길게요.")).toBeTruthy();

    listLoans.mockResolvedValue(page([loan("b")]));
    await act(async () => post.resolve(loan("a", { status: "returned", returned_on: "2026-11-16" })));
    expect(screen.getByText("책 b을 지난 대출로 옮길게요.")).toBeTruthy();
    expect(within(screen.getByTestId("return-confirm")).getByText("반납했어요")).toBeTruthy(); // 처리 중 아님
    await waitFor(() => expect(screen.queryByTestId("loan-a")).toBeNull());
    expect(screen.queryByText(RETURN_FAILED)).toBeNull();
  });

  test("no hard-coded colors or native date picker in loan-assistant", () => {
    const dir = path.join(__dirname, "..");
    const sources = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(sources).toEqual(expect.arrayContaining(["DueDateSheet.tsx", "LoansSection.tsx", "api.ts"]));
    const offenders: string[] = [];
    for (const f of sources) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (/#[0-9A-Fa-f]{3,8}\b/.test(src)) offenders.push(`${f}: #hex`);
      if (/rgba?\(/.test(src)) offenders.push(`${f}: rgb(`);
      if (/Radius:\s*\d/.test(src)) offenders.push(`${f}: *Radius 숫자`);
      if (/from\s+["'](@react-native-community\/datetimepicker|react-native-date-picker|react-native-calendars|date-fns|dayjs|moment|luxon)/.test(src)) {
        offenders.push(`${f}: 날짜 라이브러리`);
      }
    }
    expect(offenders).toEqual([]);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "..", "..", "..", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).filter((d) => /date|calendar|moment|luxon/i.test(d))).toEqual([]);
  });
});
