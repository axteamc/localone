// LOAN-3-P1 기기 예약 알림·알림 진입 (loan-assistant.md LOAN-3 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import RootLayout from "../../../../app/_layout";
import * as api from "../api";
import type { Loan, LoanPage } from "../api";
import { LoansSection, REMINDERS_DENIED, WEB_NO_REMINDERS } from "../LoansSection";
import * as platform from "../notifications.platform";
import { registerSignOutCleanup } from "../../../auth/AuthProvider";
import { REMINDER_TITLE, clearLoanReminders, fetchAllOnLoan, reminderPlan, syncLoanReminders } from "../reminders";
import { setLoanRemindersEnabled } from "../reminderPref";

// @types/node 없이 쓰는 최소 타입(소스 검사용, search.test.tsx와 같은 방식)
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: "utf8"): string;
};
const path = require("path") as { join(...parts: string[]): string };

// reminders.ts가 모듈을 읽을 때 등록한 로그아웃 정화 함수(beforeEach의 clearAllMocks 전에 붙잡아 둔다)
const signOutCleanupsAtImport = (
  registerSignOutCleanup as unknown as jest.Mock<(fn: () => void | Promise<void>) => () => void>
).mock.calls.map(([fn]) => fn);

const mockPush = jest.fn();
// 기기 예약 저장소 흉내: 식별자 → 예약
const mockDevice = {
  supported: true,
  permission: "granted" as "granted" | "denied",
  scheduled: new Map<string, { date: Date; title: string; body: string }>(),
  tap: null as null | (() => void),
};

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => {
  const ReactLib = require("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => ReactLib.useEffect(cb, [cb]),
    Stack: Object.assign(() => null, { Screen: () => null }),
  };
});

jest.mock("../../../auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signedIn", userId: "user-a" }),
  // reminders.ts가 모듈을 읽을 때 등록한다(import보다 먼저 만들어져야 해서 jest.fn으로 둔다)
  registerSignOutCleanup: jest.fn(() => () => undefined),
}));

jest.mock("../notifications.platform", () => ({
  get NOTIFICATIONS_SUPPORTED() {
    return mockDevice.supported;
  },
  requestNotificationPermission: jest.fn(async () => (mockDevice.supported ? mockDevice.permission : "unsupported")),
  scheduleLocal: jest.fn(async (id: string, date: Date, title: string, body: string) => {
    mockDevice.scheduled.set(id, { date, title, body });
  }),
  cancelAllLoan: jest.fn(async () => {
    for (const id of [...mockDevice.scheduled.keys()]) if (id.startsWith("loan:")) mockDevice.scheduled.delete(id);
  }),
  openNotificationSettings: jest.fn(),
  subscribeNotificationTap: jest.fn((onTap: () => void) => {
    mockDevice.tap = onTap;
    return () => {
      mockDevice.tap = null;
    };
  }),
}));

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, listLoans: jest.fn(), startLoan: jest.fn(), changeDueDate: jest.fn(), returnLoan: jest.fn() };
});

const listLoans = jest.mocked(api.listLoans);
const requestPermission = jest.mocked(platform.requestNotificationPermission);
const cancelAllLoan = jest.mocked(platform.cancelAllLoan);
const openSettings = jest.mocked(platform.openNotificationSettings);

function loan(id: string, extra: Partial<Loan> = {}): Loan {
  return {
    id,
    book: { isbn13: "9788936434120", title: "소년이 온다", author: "한강", cover_url: null },
    library: null,
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
const page = (items: Loan[]): LoanPage => ({ items, next_cursor: null, today: "2026-11-16" });
// 2026-11-16 08:00 KST — 서울 09:00 전
const EARLY = new Date("2026-11-16T08:00:00+09:00");

beforeEach(() => {
  jest.clearAllMocks();
  mockDevice.supported = true;
  mockDevice.permission = "granted";
  mockDevice.scheduled.clear();
  mockDevice.tap = null;
  listLoans.mockReset();
});

describe("LOAN-3-P1", () => {
  test("plan has d3 d1 d0 at 09:00 KST", () => {
    const plan = reminderPlan(loan("a"), "2026-11-16", EARLY);
    expect(plan).toEqual([
      { id: "loan:a:d3", date: "2026-11-21T09:00:00+09:00", body: "반납일이 3일 남았어요" },
      { id: "loan:a:d1", date: "2026-11-23T09:00:00+09:00", body: "반납일이 내일이에요" },
      { id: "loan:a:d0", date: "2026-11-24T09:00:00+09:00", body: "오늘이 반납일이에요" },
    ]);
    expect(new Date(plan[0]!.date).toISOString()).toBe("2026-11-21T00:00:00.000Z"); // 서울 09:00 = UTC 00:00
  });

  test("past reminders are skipped", () => {
    // 예정 11-17: d3(11-14)는 지남, d1(11-16 09:00)은 now 기준으로 갈림, d0만 남음
    expect(reminderPlan(loan("a", { due_on: "2026-11-17" }), "2026-11-16", EARLY).map((r) => r.id)).toEqual([
      "loan:a:d1",
      "loan:a:d0",
    ]);
    const late = new Date("2026-11-16T09:00:00+09:00");
    expect(reminderPlan(loan("a", { due_on: "2026-11-17" }), "2026-11-16", late).map((r) => r.id)).toEqual([
      "loan:a:d0",
    ]);
    // 연체: 하나도 없음
    expect(reminderPlan(loan("a", { due_on: "2026-11-10", d_day: -6, is_overdue: true }), "2026-11-16", EARLY)).toEqual([]);
  });

  test("turned off in settings: no permission ask, existing loan reminders cleared (C-90)", async () => {
    await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    expect([...mockDevice.scheduled.keys()].some((k) => k.startsWith("loan:"))).toBe(true);
    await setLoanRemindersEnabled(false);
    requestPermission.mockClear();
    const res = await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    expect(res).toEqual({ scheduled: 0, skipped: 0, status: "off" });
    expect(requestPermission).not.toHaveBeenCalled();
    expect([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:"))).toEqual([]);
    await setLoanRemindersEnabled(true);
    expect((await syncLoanReminders([loan("a")], "2026-11-16", EARLY)).status).toBe("scheduled");
  });

  test("returned loan has no reminders", () => {
    expect(reminderPlan(loan("a", { status: "returned", returned_on: "2026-11-15", d_day: 0 }), "2026-11-16", EARLY)).toEqual([]);
  });

  test("sync twice does not duplicate", async () => {
    mockDevice.scheduled.set("other:keep", { date: EARLY, title: "x", body: "x" }); // 다른 기능 알림은 그대로
    const first = await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    const second = await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    expect(first).toEqual({ scheduled: 3, skipped: 0, status: "scheduled" });
    expect(second).toEqual(first);
    expect([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:")).sort()).toEqual([
      "loan:a:d0",
      "loan:a:d1",
      "loan:a:d3",
    ]);
    // 동시에 두 번 맞춰도 섞이지 않는다
    await Promise.all([
      syncLoanReminders([loan("a"), loan("b", { due_on: "2026-11-30" })], "2026-11-16", EARLY),
      syncLoanReminders([loan("a"), loan("b", { due_on: "2026-11-30" })], "2026-11-16", EARLY),
    ]);
    expect([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:"))).toHaveLength(6);
    expect(mockDevice.scheduled.has("other:keep")).toBe(true);
    // 목록에서 빠진 책(b)의 알림은 다음 맞추기 때 지워진다(지우고 다시 걸기)
    await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    expect([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:b:"))).toEqual([]);
    // 겹쳐 부른 맞추기는 차례로 돈다: 나중에 부른 것(a만)이 최종 상태
    await Promise.all([
      syncLoanReminders([loan("a"), loan("b", { due_on: "2026-11-30" })], "2026-11-16", EARLY),
      syncLoanReminders([loan("a")], "2026-11-16", EARLY),
    ]);
    expect([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:")).sort()).toEqual([
      "loan:a:d0",
      "loan:a:d1",
      "loan:a:d3",
    ]);
    // 다 반납하면 남은 알림도 지운다(권한은 묻지 않음)
    requestPermission.mockClear();
    expect(await syncLoanReminders([loan("a", { status: "returned", returned_on: "2026-11-16" })], "2026-11-16", EARLY))
      .toEqual({ scheduled: 0, skipped: 0, status: "scheduled" });
    expect([...mockDevice.scheduled.keys()]).toEqual(["other:keep"]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test("body never contains title", async () => {
    await syncLoanReminders([loan("a"), loan("b", { book: { ...loan("b").book, title: "채식주의자" } })], "2026-11-16", EARLY);
    expect(mockDevice.scheduled.size).toBe(6);
    for (const r of mockDevice.scheduled.values()) {
      expect(r.title).toBe(REMINDER_TITLE);
      expect(r.body).not.toContain("소년이 온다");
      expect(r.body).not.toContain("채식주의자");
      expect(["반납일이 3일 남았어요", "반납일이 내일이에요", "오늘이 반납일이에요"]).toContain(r.body);
    }
  });

  test("uses server today not device date", async () => {
    // 기기 날짜가 한 달 뒤여도 서버 today(11-16) 기준으로 계획한다
    jest.useFakeTimers({ now: new Date("2026-12-20T12:00:00+09:00"), doNotFake: ["nextTick", "setImmediate"] });
    try {
      expect(reminderPlan(loan("a"), "2026-11-16", EARLY).map((r) => r.id)).toEqual(["loan:a:d3", "loan:a:d1", "loan:a:d0"]);
      expect(reminderPlan(loan("a"), "2026-11-23", EARLY).map((r) => r.id)).toEqual(["loan:a:d1", "loan:a:d0"]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("web schedules nothing", async () => {
    mockDevice.supported = false;
    expect(await syncLoanReminders([loan("a")], "2026-11-16", EARLY)).toEqual({ scheduled: 0, skipped: 0, status: "web" });
    expect(mockDevice.scheduled.size).toBe(0);
    expect(requestPermission).not.toHaveBeenCalled();
    // 웹 화면: 빌린 책 위에 한 줄
    listLoans.mockResolvedValue(page([loan("a")]));
    await render(React.createElement(LoansSection));
    await screen.findByTestId("loan-a");
    expect(screen.getByText(WEB_NO_REMINDERS)).toBeTruthy();
    expect(screen.queryByText(REMINDERS_DENIED)).toBeNull();
  });

  test("permission denied skips scheduling and shows D-day fallback banner", async () => {
    mockDevice.permission = "denied";
    listLoans.mockResolvedValue(page([loan("a")]));
    await render(React.createElement(LoansSection));
    await screen.findByTestId("loan-a");
    expect(await screen.findByText(REMINDERS_DENIED)).toBeTruthy();
    expect(mockDevice.scheduled.size).toBe(0);
    expect(cancelAllLoan).not.toHaveBeenCalled(); // 예약을 시도하지 않는다
    expect(screen.getByText("D-08")).toBeTruthy(); // 대출 목록·D-day는 그대로
    expect(screen.queryByText(WEB_NO_REMINDERS)).toBeNull();
    await fireEvent.press(screen.getByText("알림 설정 열기"));
    expect(openSettings).toHaveBeenCalledTimes(1);

    // 허용으로 바뀌고 앞으로 돌아오면(다시 읽기) 예약하고 안내는 사라진다
    await screen.unmount();
    mockDevice.permission = "granted";
    await render(React.createElement(LoansSection));
    await screen.findByTestId("loan-a");
    await waitFor(() => expect(mockDevice.scheduled.size).toBe(3));
    expect(screen.queryByText(REMINDERS_DENIED)).toBeNull();
  });

  test("no loans means no permission prompt", async () => {
    listLoans.mockResolvedValue(page([]));
    await render(React.createElement(LoansSection));
    await screen.findByText(/지금 빌린 책이 없어요/);
    await waitFor(() => expect(cancelAllLoan).toHaveBeenCalled());
    expect(requestPermission).not.toHaveBeenCalled(); // 빌린 책이 있을 때만 묻는다(T10)
  });

  test("tapping notification navigates to /loans without Platform.OS in feature code", async () => {
    await render(React.createElement(RootLayout));
    expect(mockDevice.tap).not.toBeNull();
    await act(async () => mockDevice.tap?.());
    expect(mockPush).toHaveBeenCalledWith("/loans");
    await screen.unmount();
    expect(mockDevice.tap).toBeNull(); // 구독을 끊는다

    const feature = path.join(__dirname, "..");
    const files = [
      path.join(feature, "reminders.ts"),
      path.join(feature, "LoansSection.tsx"),
      path.join(feature, "..", "..", "..", "app", "_layout.tsx"),
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect([f, /Platform\.OS/.test(src)]).toEqual([f, false]);
      expect([f, /from\s+["']expo-notifications["']/.test(src)]).toEqual([f, false]);
    }
    // expo-notifications를 직접 쓰는 곳은 분기 파일 하나뿐
    const users = fs.readdirSync(feature).filter((f) => /\.(ts|tsx)$/.test(f) && /from\s+["']expo-notifications["']/.test(fs.readFileSync(path.join(feature, f), "utf8")));
    expect(users).toEqual(["notifications.platform.ts"]);
  });

  test("sign out clears all loan reminders", async () => {
    await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    mockDevice.scheduled.set("other:keep", { date: EARLY, title: "x", body: "x" });
    expect(mockDevice.scheduled.size).toBe(4);
    await clearLoanReminders();
    expect(cancelAllLoan).toHaveBeenCalled();
    expect([...mockDevice.scheduled.keys()]).toEqual(["other:keep"]);
  });

  test("clearLoanReminders is registered as a sign-out cleanup (T6, AUTH-2 G5)", async () => {
    expect(signOutCleanupsAtImport).toContain(clearLoanReminders);
    await syncLoanReminders([loan("a")], "2026-11-16", EARLY);
    expect(mockDevice.scheduled.size).toBeGreaterThan(0);
    // AuthProvider가 로그아웃·탈퇴 때 등록된 함수를 모두 부르는 것과 같다
    await Promise.all(signOutCleanupsAtImport.map((fn) => fn()));
    expect([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:"))).toEqual([]);
  });
});

// ── PR #172 리뷰 보완 ──
describe("LOAN-3 full-list sync (PR #172 review)", () => {
  const cursorPage = (items: Loan[], next_cursor: string | null): LoanPage => ({ items, next_cursor, today: "2026-11-16" });
  const loanIds = () =>
    [...new Set([...mockDevice.scheduled.keys()].filter((k) => k.startsWith("loan:")).map((k) => k.split(":")[1]))].sort();
  const many = (n: number, prefix = "m") =>
    Array.from({ length: n }, (_, i) => loan(`${prefix}${String(i).padStart(3, "0")}`, { due_on: "2026-12-10" }));
  const sorted = (ls: Loan[]) => ls.map((l) => l.id).sort();
  type ListArgs = Parameters<typeof api.listLoans>;
  const deferredPage = () => {
    let resolve!: (p: LoanPage) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<LoanPage>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  test("51+ loans: every page up to next_cursor end is scheduled, on re-entry too", async () => {
    const first50 = many(50);
    const tail = [loan("z051", { due_on: "2026-12-20" }), loan("z052", { due_on: "2026-12-21" })];
    listLoans.mockImplementation(async (status: ListArgs[0], p: ListArgs[1]) => {
      if (status !== "on_loan") return cursorPage([], null);
      if (p.cursor === null) return cursorPage(first50, "c1");
      if (p.cursor === "c1") return cursorPage([tail[0]!], "c2");
      return cursorPage([tail[1]!], null);
    });
    await render(React.createElement(LoansSection));
    await screen.findByTestId("loan-m000");
    await waitFor(() => expect(loanIds()).toEqual(sorted([...first50, ...tail])));
    expect(mockDevice.scheduled.size).toBe(52 * 3);
    expect(screen.queryByTestId("loan-z051")).toBeNull(); // 화면은 첫 페이지만(더 보기 전)

    // 다시 들어와도(포커스 재진입) 51권째부터의 예약이 사라지지 않는다
    await screen.unmount();
    await render(React.createElement(LoansSection));
    await screen.findByTestId("loan-m000");
    await waitFor(() => expect(listLoans.mock.calls.filter((c) => c[1].cursor === "c2")).toHaveLength(2));
    await waitFor(() => expect(loanIds()).toEqual(sorted([...first50, ...tail])));
    // 화면 첫 페이지를 재사용하므로 첫 페이지는 진입마다 한 번만 읽는다
    expect(listLoans.mock.calls.filter((c) => c[1].cursor === null)).toHaveLength(2);
  });

  test("a failing later page never applies a partial list", async () => {
    // 이전 맞추기로 세 권(a, b, c) 예약돼 있음
    await syncLoanReminders([loan("a"), loan("b"), loan("c")], "2026-11-16", EARLY);
    const before = new Map(mockDevice.scheduled);
    cancelAllLoan.mockClear();
    requestPermission.mockClear();
    listLoans.mockImplementation(async (_s: ListArgs[0], p: ListArgs[1]) => {
      if (p.cursor === null) return cursorPage([loan("a")], "c1");
      throw new api.ApiCallError(503, "DB_UNAVAILABLE", "x", "");
    });
    await render(React.createElement(LoansSection));
    await screen.findByTestId("loan-a");
    await waitFor(() => expect(listLoans.mock.calls.some((c) => c[1].cursor === "c1")).toBe(true));
    await act(async () => undefined);
    expect(cancelAllLoan).not.toHaveBeenCalled(); // 지우지 않는다
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockDevice.scheduled).toEqual(before); // b·c 예약 그대로
  });

  test("write completions merge into the latest list and reminders keep later pages in either order", async () => {
    const a = loan("a", { due_on: "2026-11-20", d_day: 4 });
    const b = loan("b", { due_on: "2026-11-30", d_day: 14 });
    const savedA = loan("a", { due_on: "2026-11-25", due_on_assumed: false, d_day: 9 });
    for (const order of ["page-then-patch", "patch-then-page"] as const) {
      mockDevice.scheduled.clear();
      let server = { first: cursorPage([a], "c1"), second: cursorPage([b], null) };
      let moreGate: ReturnType<typeof deferredPage> | null = null;
      listLoans.mockImplementation(async (_s: ListArgs[0], p: ListArgs[1]) => {
        if (p.cursor === null) return server.first;
        if (moreGate) {
          const gate = moreGate;
          moreGate = null;
          return gate.promise;
        }
        return server.second;
      });
      await render(React.createElement(LoansSection));
      await screen.findByTestId("loan-a");
      await waitFor(() => expect(loanIds()).toEqual(["a", "b"]));

      // 더 보기(지연) 시작 → A 기한 수정(지연) 시작
      const more = deferredPage();
      moreGate = more;
      await fireEvent.press(screen.getByText("더 보기"));
      await fireEvent.press(screen.getAllByText("기한 수정")[0]!);
      await fireEvent.changeText(screen.getByTestId("due-input"), "2026-11-25");
      const patch = deferredPage() as unknown as { promise: Promise<Loan>; resolve(l: Loan): void };
      jest.mocked(api.changeDueDate).mockReturnValueOnce(patch.promise);
      await fireEvent.press(screen.getByTestId("due-save"));

      server = { first: cursorPage([savedA], "c1n"), second: cursorPage([b], null) };
      if (order === "page-then-patch") {
        await act(async () => more.resolve(cursorPage([b], null)));
        expect(screen.getByTestId("loan-b")).toBeTruthy();
        await act(async () => patch.resolve(savedA));
      } else {
        await act(async () => patch.resolve(savedA));
        await act(async () => more.resolve(cursorPage([b], null)));
      }
      // 저장 결과는 최신 목록으로 합쳐지고 첫 페이지부터 다시 읽어 서버 커서를 받는다
      await waitFor(() =>
        expect(within(screen.getByTestId("loan-a")).getByText("2026.11.10 — 11.25")).toBeTruthy()
      );
      // 예약 대상은 화면 페이지와 무관하게 a(새 예정일)·b 모두
      await waitFor(() => expect(loanIds()).toEqual(["a", "b"]));
      expect(mockDevice.scheduled.get("loan:a:d0")?.date.toISOString()).toBe("2026-11-25T00:00:00.000Z");
      // 커서도 최신: 더 보기를 누르면 새 커서로 b가 중복 없이 붙는다
      await fireEvent.press(screen.getByText("더 보기"));
      await screen.findByTestId("loan-b");
      expect(listLoans.mock.lastCall?.[1]).toEqual({ cursor: "c1n" });
      expect(screen.getAllByTestId(/^loan-[ab]$/).map((n) => n.props.testID)).toEqual(["loan-a", "loan-b"]);
      await screen.unmount();
      listLoans.mockReset();
    }
  });

  test("returned tab: coming back to the app re-syncs reminders from the full on_loan list and keeps the tab", async () => {
    const handlers: ((s: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, fn: (s: AppStateStatus) => void) => {
      handlers.push(fn);
      return { remove: () => handlers.splice(handlers.indexOf(fn), 1) };
    }) as unknown as typeof AppState.addEventListener);
    try {
      mockDevice.permission = "denied";
      let onLoan = [loan("a"), loan("b", { due_on: "2026-11-30" })];
      listLoans.mockImplementation(async (status: ListArgs[0]) =>
        status === "on_loan"
          ? cursorPage(onLoan, null)
          : cursorPage([loan("r", { status: "returned", returned_on: "2026-11-15", d_day: 0 })], null)
      );
      await render(React.createElement(LoansSection));
      await screen.findByTestId("loan-a");
      expect(await screen.findByText(REMINDERS_DENIED)).toBeTruthy();
      expect(mockDevice.scheduled.size).toBe(0);

      await fireEvent.press(screen.getByTestId("loans-tab-returned"));
      await screen.findByTestId("returned-r");

      // 백그라운드에서: 다른 기기에서 b 반납 + a 기한 변경, 설정에서 알림 허용
      await act(async () => handlers.forEach((h) => h("background")));
      onLoan = [loan("a", { due_on: "2026-11-27", due_on_assumed: false })];
      mockDevice.permission = "granted";
      const displayReturnedReads = listLoans.mock.calls.filter((c) => c[0] === "returned").length;
      await act(async () => handlers.forEach((h) => h("active")));

      await waitFor(() => expect(loanIds()).toEqual(["a"]));
      expect(mockDevice.scheduled.get("loan:a:d0")?.date.toISOString()).toBe("2026-11-27T00:00:00.000Z");
      // 화면은 지난 대출 그대로(다시 읽지도 않음)
      expect(screen.getByTestId("returned-r")).toBeTruthy();
      expect(screen.getByTestId("loans-tab-returned").props.accessibilityState).toEqual({ selected: true });
      expect(listLoans.mock.calls.filter((c) => c[0] === "returned")).toHaveLength(displayReturnedReads);
      // 빌린 책으로 돌아가면 거부 안내도 사라져 있다
      await fireEvent.press(screen.getByTestId("loans-tab-on_loan"));
      await screen.findByTestId("loan-a");
      expect(screen.queryByText(REMINDERS_DENIED)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("fetchAllOnLoan collects until next_cursor null and throws on failure or a repeating cursor", async () => {
    listLoans.mockImplementation(async (_s: ListArgs[0], p: ListArgs[1]) =>
      p.cursor === null ? cursorPage([loan("a")], "c1") : p.cursor === "c1" ? cursorPage([loan("b"), loan("a")], "c2") : cursorPage([loan("c")], null)
    );
    const all = await fetchAllOnLoan();
    expect(all.items.map((l) => l.id)).toEqual(["a", "b", "c"]); // 겹친 a는 한 번만
    expect(all.today).toBe("2026-11-16");

    // first를 주면 첫 페이지는 다시 읽지 않는다
    listLoans.mockClear();
    await fetchAllOnLoan(undefined, cursorPage([loan("a")], "c1"));
    expect(listLoans.mock.calls.map((c) => c[1].cursor)).toEqual(["c1", "c2"]);

    listLoans.mockImplementation(async (_s: ListArgs[0], p: ListArgs[1]) => cursorPage([loan("a")], p.cursor === null ? "loop" : "loop"));
    await expect(fetchAllOnLoan()).rejects.toThrow();
    listLoans.mockImplementation(async (_s: ListArgs[0], p: ListArgs[1]) => {
      if (p.cursor === null) return cursorPage([loan("a")], "c1");
      throw new api.ApiCallError(503, "DB_UNAVAILABLE", "x", "");
    });
    await expect(fetchAllOnLoan()).rejects.toBeInstanceOf(api.ApiCallError);
  });
});

// 분기 파일 자체: 알림 응답이 대출 알림일 때만 onTap(진짜 notifications.platform + expo-notifications 목)
describe("notifications.platform", () => {
  test("subscribeNotificationTap fires only for loan notifications and cold start", async () => {
    const listeners: ((r: unknown) => void)[] = [];
    const remove = jest.fn();
    const response = (id: string) => ({ notification: { request: { identifier: id } } });
    let real!: typeof import("../notifications.platform");
    jest.isolateModules(() => {
      jest.doMock("expo-notifications", () => ({
        setNotificationHandler: jest.fn(),
        addNotificationResponseReceivedListener: (fn: (r: unknown) => void) => {
          listeners.push(fn);
          return { remove };
        },
        getLastNotificationResponseAsync: jest.fn(async () => response("loan:x:d1")),
        clearLastNotificationResponseAsync: jest.fn(async () => undefined),
      }));
      real = jest.requireActual<typeof import("../notifications.platform")>("../notifications.platform");
    });
    const onTap = jest.fn();
    const unsubscribe = real.subscribeNotificationTap(onTap);
    await waitFor(() => expect(onTap).toHaveBeenCalledTimes(1)); // 알림으로 앱이 열린 경우
    listeners[0]!(response("loan:y:d0"));
    listeners[0]!(response("other:z"));
    expect(onTap).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });

  /** 진짜 분기 파일을 OS·expo-notifications 대역과 함께 불러온다. calls에 네이티브 호출 순서가 쌓인다. */
  function loadPlatform(os: "android" | "ios", opts: { status?: string; canAskAgain?: boolean; channel?: Promise<unknown> } = {}) {
    const calls: string[] = [];
    const native = {
      setNotificationChannelAsync: jest.fn((id: string) => {
        calls.push(`channel:${id}`);
        return opts.channel ?? Promise.resolve(null);
      }),
      getPermissionsAsync: jest.fn(async () => {
        calls.push("getPermissions");
        return { granted: false, status: opts.status ?? "undetermined", canAskAgain: opts.canAskAgain ?? true };
      }),
      requestPermissionsAsync: jest.fn(async () => {
        calls.push("requestPermissions");
        return { granted: true, status: "granted", canAskAgain: true };
      }),
      scheduleNotificationAsync: jest.fn(async (req: { identifier: string }) => {
        calls.push(`schedule:${req.identifier}`);
        return req.identifier;
      }),
      AndroidImportance: { DEFAULT: 3 },
      SchedulableTriggerInputTypes: { DATE: "date" },
    };
    let real!: typeof import("../notifications.platform");
    jest.isolateModules(() => {
      jest.doMock("expo-notifications", () => native);
      jest.doMock("react-native", () => ({ Platform: { OS: os }, Linking: { openSettings: jest.fn() } }));
      real = jest.requireActual<typeof import("../notifications.platform")>("../notifications.platform");
    });
    return { real, native, calls };
  }

  test("android creates the channel before checking or requesting permission (fresh install)", async () => {
    let createChannel!: () => void;
    const channel = new Promise<unknown>((res) => (createChannel = () => res(null)));
    const { real, native, calls } = loadPlatform("android", { channel });
    const result = real.requestNotificationPermission();
    await Promise.resolve();
    await Promise.resolve();
    // 채널 생성이 끝나기 전에는 권한을 보지도 묻지도 않는다
    expect(calls).toEqual(["channel:loan-reminders"]);
    expect(native.getPermissionsAsync).not.toHaveBeenCalled();
    createChannel();
    expect(await result).toBe("granted");
    expect(calls).toEqual(["channel:loan-reminders", "getPermissions", "requestPermissions"]);

    // 첫 허용 뒤 예약: 같은 채널로, 채널은 다시 만들지 않는다
    await real.scheduleLocal("loan:a:d0", new Date("2026-11-24T00:00:00Z"), "동네한권", "오늘이 반납일이에요");
    expect(calls).toEqual(["channel:loan-reminders", "getPermissions", "requestPermissions", "schedule:loan:a:d0"]);
    expect(native.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ channelId: "loan-reminders" }) })
    );
  });

  test("android channel failure is not cached and permission is not requested without it", async () => {
    const { real, native, calls } = loadPlatform("android", { channel: Promise.reject(new Error("boom")) });
    await expect(real.requestNotificationPermission()).rejects.toThrow("boom");
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
    native.setNotificationChannelAsync.mockImplementation((id: string) => {
      calls.push(`channel:${id}`);
      return Promise.resolve(null);
    });
    expect(await real.requestNotificationPermission()).toBe("granted"); // 다음 맞추기 때 다시 만든다
    expect(calls.filter((c) => c.startsWith("channel:"))).toHaveLength(2);
  });

  test("android fresh install reports denied+canAskAgain and still shows the first prompt", async () => {
    // API 36 에뮬레이터 새 설치에서 실제로 받은 값: { status: "denied", canAskAgain: true }(아직 묻지 않음)
    const fresh = loadPlatform("android", { status: "denied", canAskAgain: true });
    expect(await fresh.real.requestNotificationPermission()).toBe("granted");
    expect(fresh.calls).toEqual(["channel:loan-reminders", "getPermissions", "requestPermissions"]);
  });

  test("ios never creates a channel and denied android does not prompt again", async () => {
    const ios = loadPlatform("ios");
    expect(await ios.real.requestNotificationPermission()).toBe("granted");
    expect(ios.calls).toEqual(["getPermissions", "requestPermissions"]);

    const denied = loadPlatform("android", { status: "denied", canAskAgain: false });
    expect(await denied.real.requestNotificationPermission()).toBe("denied");
    expect(denied.calls).toEqual(["channel:loan-reminders", "getPermissions"]);
  });
});
