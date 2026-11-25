// LIB-3b(Y-6) 빌릴 예정 구역: 미지정 예정(U5·U7), 일괄 검색 #70(V8·V9), 일괄 빌림(§4 B1~B6)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { apiFetch } from "../../../auth/apiFetch";
import * as platform from "../../../lib/platform";
import * as loanApi from "../../loan-assistant/api";
import type { Loan } from "../../loan-assistant/api";
import * as api from "../api";
import type { BatchAvailabilityResponse, BatchCandidate, LoanPlan, LoanPlanPage } from "../api";
import {
  BATCH_NONE_COMPLETE,
  BATCH_NONE_PARTIAL,
  BATCH_NO_LOCATION,
  BATCH_PARTIAL,
  BATCH_STALE,
  BATCH_TOO_MANY,
} from "../BatchAvailabilityPanel";
import { LoanPlansSection, alreadyNote, failedNote, movedNote } from "../LoanPlansSection";

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
jest.mock("../../../auth/apiFetch", () => ({ apiFetch: jest.fn() }));

jest.mock("../../../lib/platform", () => {
  const actual = jest.requireActual<typeof import("../../../lib/platform")>("../../../lib/platform");
  return { ...actual, locate: jest.fn(), openExternalUrl: jest.fn() };
});

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return { ...actual, listLoanPlans: jest.fn(), releaseLoanPlan: jest.fn(), fetchPlansAvailability: jest.fn() };
});

jest.mock("../../loan-assistant/api", () => {
  const actual = jest.requireActual<typeof import("../../loan-assistant/api")>("../../loan-assistant/api");
  return { ...actual, startLoan: jest.fn() };
});

const locate = jest.mocked(platform.locate);
const openExternalUrl = jest.mocked(platform.openExternalUrl);
const listLoanPlans = jest.mocked(api.listLoanPlans);
const fetchPlansAvailability = jest.mocked(api.fetchPlansAvailability);
const startLoan = jest.mocked(loanApi.startLoan);

const HERE = { ok: true as const, lat: 37.58, lng: 126.98 };
const ISBN_A = "9788936434120";
const ISBN_B = "9788954682152";

function plan(id: string, isbn13: string, library: LoanPlan["library"]): LoanPlan {
  return {
    id,
    book: { isbn13, title: `책 ${id}`, author: null, cover_url: null },
    library,
    status: "planned",
    created_at: "2026-11-24T10:00:00+09:00",
  };
}
const ASSIGNED = plan("p1", ISBN_A, { id: 101, name: "정독도서관", area_label: "화동" });
const UNASSIGNED = plan("p2", ISBN_B, null);

function cand(id: number, name: string, extra: Partial<BatchCandidate> = {}): BatchCandidate {
  return {
    library: {
      id,
      name,
      address: null,
      area_label: null,
      distance_m: id * 100,
      today: { date: "2026-11-24", is_closed: null, hours_text: null, holiday_unchecked: false },
      tel: null,
      homepage: null,
    },
    holding_count: 2,
    loanable_count: 1,
    held_isbn13s: [ISBN_A, ISBN_B],
    loanable_isbn13s: [ISBN_A],
    link: null,
    ...extra,
  };
}

function batch(candidates: BatchCandidate[], extra: Partial<BatchAvailabilityResponse> = {}): BatchAvailabilityResponse {
  return {
    checked_at: "2026-11-24T09:30:00+09:00",
    radius_km: 3,
    complete: true,
    unknown_pairs: 0,
    fallback_counts: { limit: 0, provider_error: 0, not_configured: 0 },
    books: [],
    candidates,
    ...extra,
  };
}

function loan(planId: string | null, isbn13: string): Loan {
  return {
    id: `loan-${planId ?? isbn13}`,
    book: { isbn13, title: "x", author: null, cover_url: null },
    library: null,
    plan_id: planId,
    loaned_on: "2026-11-24",
    due_on: "2026-12-08",
    due_on_assumed: true,
    status: "on_loan",
    returned_on: null,
    d_day: 14,
    is_overdue: false,
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

const page = (items: LoanPlan[], next: string | null = null): LoanPlanPage => ({ items, next_cursor: next });

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of [locate, openExternalUrl, listLoanPlans, fetchPlansAvailability, startLoan]) m.mockReset();
  jest.mocked(useAuth).mockReturnValue({
    status: "signedIn",
    userId: "user-a",
  } as unknown as ReturnType<typeof useAuth>);
  locate.mockResolvedValue(HERE);
  openExternalUrl.mockResolvedValue(true);
  listLoanPlans.mockResolvedValue(page([ASSIGNED, UNASSIGNED]));
  fetchPlansAvailability.mockResolvedValue(batch([cand(7, "종로도서관")]));
});

async function openSection() {
  await render(<LoanPlansSection />);
  await screen.findByTestId("plan-p2");
}

describe("미지정 예정(U5·U7·B3)", () => {
  test("unassigned plan shows undecided library and per-card loan sends no library", async () => {
    startLoan.mockResolvedValueOnce(loan("p2", ISBN_B));
    await openSection();
    expect(listLoanPlans.mock.calls[0]?.[0]).toMatchObject({ includeUnassigned: true });
    expect(within(screen.getByTestId("plan-p2")).getByText("도서관 미정")).toBeTruthy();
    expect(within(screen.getByTestId("plan-p1")).getByText("정독도서관 · 화동")).toBeTruthy();
    expect(screen.getByTestId("plans-count").props.children).toBe("2권"); // V4 권수는 제목 옆
    await fireEvent.press(screen.getByTestId("start-loan-p2"));
    await waitFor(() => expect(startLoan).toHaveBeenCalledTimes(1));
    expect(startLoan).toHaveBeenCalledWith({ isbn13: ISBN_B, libraryId: undefined, planId: "p2" });
  });
});

describe("일괄 검색 #70(V8·V9)", () => {
  test("no selection asks all plans with location and shows counts", async () => {
    await openSection();
    await fireEvent.press(screen.getByTestId("batch-search"));
    expect(await screen.findByText("소장 2권 · 대출 가능 1권")).toBeTruthy();
    expect(fetchPlansAvailability).toHaveBeenCalledWith(
      { planIds: null, lat: HERE.lat, lng: HERE.lng, radiusKm: 3 },
      expect.anything()
    );
  });

  test("selected plans only, and select all toggles", async () => {
    await openSection();
    await fireEvent.press(screen.getByTestId("select-plan-p2"));
    expect(screen.getByText("선택한 1권 빌렸어요")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("batch-search"));
    await screen.findByText("종로도서관");
    expect(fetchPlansAvailability.mock.calls[0]?.[0]).toMatchObject({ planIds: ["p2"] });
    await fireEvent.press(screen.getByTestId("select-all"));
    expect(screen.getByText("선택한 2권 빌렸어요")).toBeTruthy();
    await waitFor(() => expect(fetchPlansAvailability).toHaveBeenCalledTimes(2)); // V9 범위가 바뀌면 다시 묻는다
    expect(fetchPlansAvailability.mock.calls[1]?.[0]).toMatchObject({ planIds: ["p1", "p2"] });
    await fireEvent.press(screen.getByTestId("select-all"));
    expect(screen.getByText("빌렸어요")).toBeTruthy();
  });

  test("changing selection cancels the previous request and drops its late answer (V9)", async () => {
    const first = deferred<BatchAvailabilityResponse>();
    fetchPlansAvailability.mockReturnValueOnce(first.promise);
    fetchPlansAvailability.mockResolvedValueOnce(batch([cand(8, "새 결과 도서관")]));
    await openSection();
    await fireEvent.press(screen.getByTestId("batch-search"));
    await waitFor(() => expect(fetchPlansAvailability).toHaveBeenCalledTimes(1));
    const firstSignal = fetchPlansAvailability.mock.calls[0]![1]!;
    await fireEvent.press(screen.getByTestId("select-plan-p1"));
    expect(await screen.findByText("새 결과 도서관")).toBeTruthy();
    expect(firstSignal.aborted).toBe(true);
    await act(async () => first.resolve(batch([cand(9, "늦은 도서관")])));
    expect(screen.queryByText("늦은 도서관")).toBeNull();
    expect(screen.getByText("새 결과 도서관")).toBeTruthy();
  });

  test("partial result shows retry; empty candidates wording follows complete", async () => {
    fetchPlansAvailability.mockResolvedValueOnce(batch([cand(7, "종로도서관")], { complete: false, unknown_pairs: 2 }));
    fetchPlansAvailability.mockResolvedValueOnce(batch([], { complete: false }));
    fetchPlansAvailability.mockResolvedValueOnce(batch([], { complete: true }));
    await openSection();
    await fireEvent.press(screen.getByTestId("batch-search"));
    expect(await screen.findByText(BATCH_PARTIAL)).toBeTruthy();
    expect(screen.getByText("종로도서관")).toBeTruthy(); // 부분 결과도 보인다
    await fireEvent.press(screen.getByText("다시 조회"));
    expect(await screen.findByText(BATCH_NONE_PARTIAL)).toBeTruthy();
    await fireEvent.press(screen.getByText("다시 조회"));
    expect(await screen.findByText(BATCH_NONE_COMPLETE)).toBeTruthy();
    expect(screen.queryByText(BATCH_PARTIAL)).toBeNull();
  });

  test("errors: 422 plan_ids, 404 reloads list, no location", async () => {
    fetchPlansAvailability.mockRejectedValueOnce(new api.ApiCallError(422, "VALIDATION_ERROR", "x", "plan_ids"));
    await openSection();
    await fireEvent.press(screen.getByTestId("batch-search"));
    expect(await screen.findByText(BATCH_TOO_MANY)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("batch-search")); // 닫기
    locate.mockResolvedValueOnce({ ok: false, reason: "denied" } as Awaited<ReturnType<typeof platform.locate>>);
    await fireEvent.press(screen.getByTestId("batch-search"));
    expect(await screen.findByText(BATCH_NO_LOCATION)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("batch-search"));

    fetchPlansAvailability.mockRejectedValueOnce(new api.ApiCallError(404, "NOT_FOUND", "x", "plan_ids"));
    listLoanPlans.mockResolvedValueOnce(page([ASSIGNED]));
    await fireEvent.press(screen.getByTestId("batch-search"));
    expect(await screen.findByText(BATCH_STALE)).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("plan-p2")).toBeNull());
    expect(listLoanPlans).toHaveBeenCalledTimes(2);
  });

  test("more than 20 distinct books selected is stopped before calling", async () => {
    const many = Array.from({ length: 21 }, (_, i) => plan(`m${i}`, String(9780000000000 + i), null));
    listLoanPlans.mockResolvedValue(page(many));
    await render(<LoanPlansSection />);
    await screen.findByTestId("plan-m0");
    await fireEvent.press(screen.getByTestId("select-all"));
    await fireEvent.press(screen.getByTestId("batch-search"));
    expect(await screen.findByText(BATCH_TOO_MANY)).toBeTruthy();
    expect(fetchPlansAvailability).not.toHaveBeenCalled();
  });

  test("candidate card selects, homepage pill opens link independently (V5·V6)", async () => {
    fetchPlansAvailability.mockResolvedValueOnce(
      batch([cand(7, "종로도서관", { link: { url: "https://lib.example.org", kind: "homepage" } }), cand(8, "정독도서관")])
    );
    await openSection();
    await fireEvent.press(screen.getByTestId("batch-search"));
    await fireEvent.press(await screen.findByTestId("batch-live-7"));
    expect(openExternalUrl).toHaveBeenCalledWith("https://lib.example.org");
    expect(await screen.findByText("확인 완료")).toBeTruthy();
    expect(screen.queryByText("선택됨")).toBeNull();
    expect(screen.queryByTestId("batch-live-8")).toBeNull(); // link = null이면 버튼 없음
    await fireEvent.press(screen.getByTestId("batch-select-8"));
    expect(within(screen.getByTestId("batch-library-8")).getByText("선택됨")).toBeTruthy();
  });

  test("pill on a selected card keeps the selection and reopens the link; layer does not wrap the pill (C-87)", async () => {
    fetchPlansAvailability.mockResolvedValueOnce(
      batch([cand(7, "종로도서관", { link: { url: "https://lib.example.org", kind: "homepage" } })])
    );
    await openSection();
    await fireEvent.press(screen.getByTestId("batch-search"));
    await fireEvent.press(await screen.findByTestId("batch-select-7"));
    await fireEvent.press(screen.getByTestId("batch-live-7"));
    await fireEvent.press(await screen.findByTestId("batch-live-7"));
    expect(openExternalUrl).toHaveBeenCalledTimes(2); // 확인 완료 뒤 다시 누르면 같은 링크를 다시 연다
    expect(within(screen.getByTestId("batch-library-7")).getByText("선택됨")).toBeTruthy();
    // 선택 레이어는 필의 조상이 아니다(웹 <button> 안 <button> 방지)
    const layer = screen.getByTestId("batch-select-7");
    expect(within(layer).queryByTestId("batch-live-7")).toBeNull();
    // 단일 조회 창과 같은 X 닫기
    await fireEvent.press(screen.getByLabelText("일괄 검색 닫기"));
    expect(screen.queryByTestId("batch-panel")).toBeNull();
  });
});

describe("일괄 빌림(B1~B6)", () => {
  async function selectBothAndSearch() {
    await openSection();
    await fireEvent.press(screen.getByTestId("select-all"));
    await fireEvent.press(screen.getByTestId("batch-search"));
    await screen.findByText("종로도서관");
  }

  test("prefills picked library as candidate only, then calls #20 in order and reloads (B1·B2·B4)", async () => {
    const d1 = deferred<Loan>();
    const d2 = deferred<Loan>();
    startLoan.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    await selectBothAndSearch();
    await fireEvent.press(screen.getByTestId("batch-select-7"));
    await fireEvent.press(screen.getByTestId("bulk-loan"));
    const sheet = await screen.findByTestId("batch-loan-sheet");
    // 지정 예정은 그 도서관, 미지정은 고른 도서관이 미리 채워졌을 뿐 아직 보내지 않았다
    expect(within(screen.getByTestId("batch-loan-row-p1")).getByText("정독도서관")).toBeTruthy();
    expect(screen.getByTestId("batch-loan-pick-p2-7").props.accessibilityState).toMatchObject({ checked: true });
    expect(startLoan).not.toHaveBeenCalled();

    listLoanPlans.mockResolvedValueOnce(page([]));
    const confirm = within(sheet).getByTestId("batch-loan-confirm");
    await fireEvent.press(confirm);
    await fireEvent.press(confirm); // 연타해도 한 번
    expect(startLoan).toHaveBeenCalledTimes(1); // 순차: 첫 응답 전에는 둘째를 보내지 않는다
    expect(startLoan).toHaveBeenNthCalledWith(1, { isbn13: ISBN_A, libraryId: 101, planId: "p1" });
    await act(async () => d1.resolve(loan("p1", ISBN_A)));
    await waitFor(() => expect(startLoan).toHaveBeenCalledTimes(2));
    expect(startLoan).toHaveBeenNthCalledWith(2, { isbn13: ISBN_B, libraryId: 7, planId: "p2" });
    await act(async () => d2.resolve(loan("p2", ISBN_B)));
    expect(await screen.findByText(movedNote(2))).toBeTruthy();
    expect(listLoanPlans).toHaveBeenCalledTimes(2);
    expect(listLoanPlans.mock.calls[1]?.[0]).toMatchObject({ includeUnassigned: true, limit: 50 });
    expect(screen.queryByTestId("plan-p1")).toBeNull();
    expect(screen.queryByTestId("batch-loan-sheet")).toBeNull();
  });

  test("unassigned plan must be chosen; no record sends no library (B2·B3)", async () => {
    startLoan.mockResolvedValueOnce(loan("p2", ISBN_B));
    listLoanPlans.mockResolvedValueOnce(page([ASSIGNED, UNASSIGNED])).mockResolvedValueOnce(page([ASSIGNED]));
    await openSection();
    await fireEvent.press(screen.getByTestId("select-plan-p2"));
    await fireEvent.press(screen.getByTestId("bulk-loan")); // 일괄 검색 없이 — 후보 없음
    await screen.findByTestId("batch-loan-sheet");
    const confirm = screen.getByTestId("batch-loan-confirm");
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(confirm);
    expect(startLoan).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("batch-loan-none-p2"));
    await fireEvent.press(screen.getByTestId("batch-loan-confirm"));
    await waitFor(() => expect(startLoan).toHaveBeenCalledTimes(1));
    expect(startLoan).toHaveBeenCalledWith({ isbn13: ISBN_B, libraryId: undefined, planId: "p2" });
    expect(await screen.findByText(movedNote(1))).toBeTruthy();
  });

  test("failed and already borrowed plans stay selected with notes; retry sends same plan id (B4·B5·B6)", async () => {
    startLoan
      .mockRejectedValueOnce(new loanApi.ApiCallError(0, "NETWORK", "x", "")) // p1 응답 유실
      .mockResolvedValueOnce(loan(null, ISBN_B)); // p2 같은 책 대출 중 → 기존 대출(M5)
    listLoanPlans.mockResolvedValueOnce(page([ASSIGNED, UNASSIGNED])).mockResolvedValueOnce(page([ASSIGNED, UNASSIGNED]));
    await selectBothAndSearch();
    await fireEvent.press(screen.getByTestId("bulk-loan"));
    await fireEvent.press(await screen.findByTestId("batch-loan-pick-p2-7"));
    await fireEvent.press(screen.getByTestId("batch-loan-confirm"));
    expect(await screen.findByText(`${failedNote(1)} ${alreadyNote(1)}`)).toBeTruthy();
    expect(screen.queryByText(movedNote(1))).toBeNull();
    expect(screen.getByTestId("plan-p1")).toBeTruthy();
    expect(screen.getByTestId("select-plan-p1").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId("select-plan-p2").props.accessibilityState).toMatchObject({ checked: true });

    // 다시 시도: 응답만 잃었고 서버는 이미 converted → #16에서 빠지면 옮긴 것으로 본다(B6)
    startLoan.mockRejectedValueOnce(new loanApi.ApiCallError(409, "CONFLICT", "x", "")).mockResolvedValueOnce(loan(null, ISBN_B));
    listLoanPlans.mockResolvedValueOnce(page([UNASSIGNED]));
    await fireEvent.press(screen.getByTestId("bulk-loan"));
    await fireEvent.press(await screen.findByTestId("batch-loan-none-p2"));
    await fireEvent.press(screen.getByTestId("batch-loan-confirm"));
    expect(await screen.findByText(movedNote(1))).toBeTruthy();
    expect(startLoan.mock.calls[2]?.[0]).toMatchObject({ planId: "p1" });
    expect(screen.getByText(alreadyNote(1))).toBeTruthy();
    expect(screen.queryByTestId("plan-p1")).toBeNull();
  });
});

describe("api 요청 모양(U4·U5·#70)", () => {
  const real = jest.requireActual<typeof import("../api")>("../api");
  const fetchMock = jest.mocked(apiFetch);
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  test("list asks unassigned only when requested, save sends null library, #70 omits null plan ids", async () => {
    fetchMock.mockResolvedValue(ok({ items: [], next_cursor: null }));
    await real.listLoanPlans({ cursor: null });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/me/loan-plans");
    await real.listLoanPlans({ cursor: "c1", limit: 50, includeUnassigned: true });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/me/loan-plans?include_unassigned=true&cursor=c1&limit=50");

    await real.saveLoanPlan(ISBN_A, null);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ isbn13: ISBN_A, library_id: null });

    await real.fetchPlansAvailability({ planIds: null, lat: 1, lng: 2, radiusKm: 3 });
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/v1/me/loan-plans/availability");
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({ lat: 1, lng: 2, radius_km: 3 });
    await real.fetchPlansAvailability({ planIds: ["p1"], lat: 1, lng: 2, radiusKm: 3 });
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toMatchObject({ plan_ids: ["p1"] });
  });
});
