// LOAN-3-P1 기기 예약 알림·알림 진입 (loan-assistant.md LOAN-3 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import RootLayout from "../../../../app/_layout";
import * as api from "../api";
import type { Loan, LoanPage } from "../api";
import { LoansSection, REMINDERS_DENIED, WEB_NO_REMINDERS } from "../LoansSection";
import * as platform from "../notifications.platform";
import { REMINDER_TITLE, clearLoanReminders, reminderPlan, syncLoanReminders } from "../reminders";

// @types/node 없이 쓰는 최소 타입(소스 검사용, search.test.tsx와 같은 방식)
declare const __dirname: string;
const fs = require("fs") as {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: "utf8"): string;
};
const path = require("path") as { join(...parts: string[]): string };

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
    expect(screen.getByText("D-8")).toBeTruthy(); // 대출 목록·D-day는 그대로
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
});
