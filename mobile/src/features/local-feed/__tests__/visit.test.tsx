// VISIT-2-P1 방문 페이지 틀·방문 멘트 (contracts/local-feed.md VISIT-2 P5)
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet, Text } from "react-native";
import LibraryVisitRoute from "../../../../app/libraries/[libraryId]";
import { theme, type as T } from "../../../theme";
import { useAuth } from "../../../auth/AuthProvider";
import { deviceStorage } from "../../../lib/platform";
import { STORAGE_KEYS } from "../../../lib/policy";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail, Today } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import type { VisitRecord, VisitResult } from "../../../lib/visits";
import { formatDistance, parseDistanceM } from "../VisitHeader";
import { FAB_BOTTOM, VISIT_TEXT, VisitScreen } from "../VisitScreen";
import { COMPOSE_TEXT } from "../ComposeChooser";
import { pickVisitMent } from "../visitMent";

const realVisits = jest.requireActual<typeof import("../../../lib/visits")>("../../../lib/visits");

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockCanGoBack = true;
let mockParams: Record<string, unknown> = {};
const mockListeners: Record<string, () => void> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush, canGoBack: () => mockCanGoBack }),
  useNavigation: () => ({
    addListener: (event: string, cb: () => void) => {
      mockListeners[event] = cb;
      return () => delete mockListeners[event];
    },
  }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
}));
// LOCAL-2부터 기본 피드는 #26(fetchLibraryPosts). 이 파일의 시험은 빈 피드를 기준으로 본다
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchLibraryPosts: jest.fn(async () => ({ items: [], next_cursor: null })),
  fetchShelf: jest.fn(async () => ({ pages: [] })), // VISIT-3 책장(#31): 이 파일은 책장을 보지 않는다
  // VISIT-3부터 방문 페이지 기본 피드는 #32(fetchLibraryFeedItems). 이 파일의 시험은 빈 피드를 기준으로 본다
  fetchLibraryFeedItems: jest.fn(async () => ({ items: [], next_cursor: null })),
}));
jest.mock("../../../lib/visits", () => ({
  recordVisit: jest.fn(),
  getDefaultLibrary: jest.fn(),
}));

const fetchLibrary = jest.mocked(publicApi.fetchLibrary);
const recordVisit = jest.mocked(visits.recordVisit);
const getDefaultLibrary = jest.mocked(visits.getDefaultLibrary);
const mockedUseAuth = jest.mocked(useAuth);

const TODAY = "2026-11-17";

function today(extra: Partial<Today> = {}): Today {
  return { date: TODAY, is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false, ...extra };
}

function lib(id: number, name: string, t: Partial<Today> = {}): LibraryDetail {
  return {
    id, name, address: null, latitude: null, longitude: null, dtl_region_code: null, area_label: null,
    distance_m: null, today: today(t), tel: null, homepage: "https://lib.test", operating_time_text: null,
    closed_text: null,
  };
}

function record(extra: Partial<VisitRecord> = {}): VisitRecord {
  return {
    libraryId: 101, count: 1, firstVisitedOn: TODAY, lastVisitedOn: TODAY, streakDays: 1, defaultAsked: false,
    ...extra,
  };
}

function visit(extra: Partial<VisitResult> = {}, rec: Partial<VisitRecord> = {}): VisitResult {
  return { counted: true, isFirst: false, previousVisitedOn: null, record: record(rec), ...extra };
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

function setAuth(status: "signedIn" | "signedOut") {
  mockedUseAuth.mockReturnValue({ status, userId: status === "signedIn" ? "u" : null } as unknown as ReturnType<
    typeof useAuth
  >);
}

const network = () => new publicApi.ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
const notFound = () => new publicApi.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", "");

async function enter(props: Partial<React.ComponentProps<typeof VisitScreen>> = {}) {
  await render(<VisitScreen libraryId={101} distanceM={null} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockParams = {};
  setAuth("signedIn");
  fetchLibrary.mockImplementation(async (id) => lib(id, id === 101 ? "정독도서관" : "종로도서관"));
  recordVisit.mockResolvedValue(visit({ counted: false }));
  getDefaultLibrary.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("pickVisitMent", () => {
  test.each([
    ["first", visit({ isFirst: true }), "처음으로 정독도서관에 방문했어요!"],
    ["streak 3", visit({}, { count: 5, streakDays: 3 }), "3일 연속으로 방문했어요!"],
    ["streak 4", visit({}, { count: 5, streakDays: 4 }), null],
    ["streak 5", visit({}, { count: 6, streakDays: 5 }), null],
    ["streak 7", visit({}, { count: 9, streakDays: 7 }), "일주일 동안 매일 방문했어요!"],
    ["streak 14", visit({}, { count: 20, streakDays: 14 }), "2주 동안 매일 방문했어요!"],
    ["streak 30", visit({}, { count: 40, streakDays: 30 }), "한 달 동안 매일 방문했어요!"],
    ["streak 31", visit({}, { count: 40, streakDays: 31 }), null],
    ["streak 100", visit({}, { count: 120, streakDays: 100 }), "100일 연속으로 방문했어요!"],
    ["streak 200", visit({}, { count: 220, streakDays: 200 }), "200일 연속으로 방문했어요!"],
    ["streak 150", visit({}, { count: 220, streakDays: 150 }), null],
    ["long gap 30", visit({ previousVisitedOn: "2026-10-18" }, { count: 4 }), "오랜만이에요! 30일 만에 방문했어요"],
    ["gap 29", visit({ previousVisitedOn: "2026-10-19" }, { count: 4 }), null],
    ["plain", visit({ previousVisitedOn: "2026-11-15" }, { count: 2 }), null],
  ])("pickVisitMent table: %s", (_label, input, expected) => {
    const out = pickVisitMent(input, "정독도서관", false, TODAY);
    expect(out).toEqual(expected === null ? null : { kind: "ment", text: expected });
  });

  test("third visit asks instead of streak ment", () => {
    expect(pickVisitMent(visit({}, { count: 3, streakDays: 3 }), "정독도서관", false, TODAY)).toEqual({ kind: "ask" });
    // 이미 물었거나 지금 기본값이면 묻지 않고 연속 멘트
    expect(pickVisitMent(visit({}, { count: 3, streakDays: 3, defaultAsked: true }), "정독도서관", false, TODAY))
      .toEqual({ kind: "ment", text: "3일 연속으로 방문했어요!" });
    expect(pickVisitMent(visit({}, { count: 3, streakDays: 3 }), "정독도서관", true, TODAY))
      .toEqual({ kind: "ment", text: "3일 연속으로 방문했어요!" });
  });

  test("same day revisit shows no card", () => {
    expect(pickVisitMent(visit({ counted: false, isFirst: true }), "정독도서관", false, TODAY)).toBeNull();
  });
});

describe("들어올 때", () => {
  test("visit records once and shows first ment", async () => {
    recordVisit.mockResolvedValue(visit({ isFirst: true }));
    await enter();
    expect(await screen.findByText("처음으로 정독도서관에 방문했어요!", {}, { timeout: 2000 })).toBeTruthy();
    expect(recordVisit).toHaveBeenCalledTimes(1);
    expect(recordVisit.mock.calls[0]![0]).toBe(101);
  });

  test("ment card shows once at bottom and hides", async () => {
    jest.useFakeTimers();
    recordVisit.mockResolvedValue(visit({ isFirst: true }));
    await enter();
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(recordVisit).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId("visit-ment")).toBeNull(); // 0.3초 전에는 없음
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getAllByTestId("visit-ment")).toHaveLength(1);
    const style = Object.assign({}, ...[screen.getByTestId("visit-ment").props.style].flat());
    expect(style).toEqual(expect.objectContaining({ position: "absolute", bottom: FAB_BOTTOM + 52 + 16, alignSelf: "center" }));
    expect(screen.getByTestId("visit-ment").props.pointerEvents).toBe("none");
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.queryByTestId("visit-ment")).toBeNull();
  });

  test("unknown library shows not found and does not record", async () => {
    fetchLibrary.mockRejectedValue(notFound());
    await enter();
    expect(await screen.findByText(VISIT_TEXT.notFound)).toBeTruthy();
    await fireEvent.press(screen.getByText(VISIT_TEXT.home));
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(recordVisit).not.toHaveBeenCalled();
  });

  test("bad route id never fetches or records", async () => {
    for (const bad of ["abc", "0", "-1", "1.5", ["101", "102"], "9007199254740993", undefined]) {
      mockParams = { libraryId: bad };
      await render(<LibraryVisitRoute />);
      expect(screen.getByText(VISIT_TEXT.notFound)).toBeTruthy();
    }
    expect(fetchLibrary).not.toHaveBeenCalled();
    expect(recordVisit).not.toHaveBeenCalled();
  });

  test("library info failure shows retry and keeps visit counted", async () => {
    jest.useFakeTimers();
    fetchLibrary.mockRejectedValueOnce(network());
    recordVisit.mockResolvedValue(visit({ isFirst: true }));
    const askCard = jest.fn(() => <Text>질문</Text>);
    await enter({ askCard });
    expect(await screen.findByText(VISIT_TEXT.libFailed)).toBeTruthy();
    await waitFor(() => expect(recordVisit).toHaveBeenCalledTimes(1));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId("visit-ment")).toBeNull(); // #11 실패 시 가짜 도서관 이름으로 멘트를 띄우지 않는다
    expect(screen.queryByText(/이 도서관에 방문했어요/)).toBeNull();
    expect(askCard).not.toHaveBeenCalled();
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(VISIT_TEXT.libRetry));
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(fetchLibrary).toHaveBeenCalledTimes(2);
    expect(recordVisit).toHaveBeenCalledTimes(1); // 새로고침은 방문을 다시 세지 않는다
  });

  test("storage failure hides ment and ask without blocking page", async () => {
    for (const failed of [visit({ counted: false, isFirst: false }), visit({ counted: false }, { count: 3 })]) {
      jest.useFakeTimers();
      recordVisit.mockResolvedValue(failed);
      const askCard = jest.fn(() => <Text>질문</Text>);
      await enter({ askCard });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByText("정독도서관")).toBeTruthy();
      expect(screen.getByText(VISIT_TEXT.emptyTitle)).toBeTruthy();
      expect(screen.queryByTestId("visit-ment")).toBeNull();
      expect(askCard).not.toHaveBeenCalled();
      jest.useRealTimers();
    }
  });

  test("integration uses real visit adapter failure signal (G-#6)", async () => {
    recordVisit.mockImplementation((id) => realVisits.recordVisit(id, new Date("2026-11-17T03:00:00Z")));
    getDefaultLibrary.mockImplementation(() => realVisits.getDefaultLibrary());

    // 1) 첫 방문 시 setItem reject → counted:false, 화면 유지·카드 0개
    await deviceStorage.removeItem(STORAGE_KEYS.visits);
    const setItemSpy = jest.spyOn(deviceStorage, "setItem").mockRejectedValue(new Error("storage full"));
    jest.useFakeTimers();
    const askCard = jest.fn(() => <Text>질문</Text>);
    const firstResult = await realVisits.recordVisit(201, new Date("2026-11-17T03:00:00Z"));
    expect(firstResult.counted).toBe(false);

    const view1 = await render(<VisitScreen libraryId={101} distanceM={null} askCard={askCard} />);
    await waitFor(() => expect(recordVisit).toHaveBeenCalledWith(101));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("정독도서관")).toBeTruthy();
    expect(screen.getByText(VISIT_TEXT.emptyTitle)).toBeTruthy();
    expect(screen.queryByTestId("visit-ment")).toBeNull();
    expect(askCard).not.toHaveBeenCalled();
    await view1.unmount();
    jest.useRealTimers();

    // 2) 누적 세 번째 방문 시 setItem reject → counted:false, 질문 카드 0개
    setItemSpy.mockRestore();
    await deviceStorage.setItem(
      STORAGE_KEYS.visits,
      JSON.stringify({
        "101": {
          libraryId: 101,
          count: 2,
          firstVisitedOn: "2026-11-10",
          lastVisitedOn: "2026-11-15",
          streakDays: 2,
          defaultAsked: false,
        },
      }),
    );
    const setItemSpy2 = jest.spyOn(deviceStorage, "setItem").mockRejectedValue(new Error("storage full"));
    jest.useFakeTimers();
    const view2 = await render(<VisitScreen libraryId={101} distanceM={null} askCard={askCard} />);
    await waitFor(() => expect(recordVisit).toHaveBeenCalledTimes(2));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("정독도서관")).toBeTruthy();
    expect(screen.queryByTestId("visit-ment")).toBeNull();
    expect(askCard).not.toHaveBeenCalled();
    await view2.unmount();
    setItemSpy2.mockRestore();
    await deviceStorage.removeItem(STORAGE_KEYS.visits);
  });

  test("no search bar on visit page", async () => {
    await enter();
    await screen.findByText("정독도서관");
    expect(screen.queryAllByRole("search")).toHaveLength(0);
    expect(screen.queryByPlaceholderText(/검색|찾/)).toBeNull();
    expect(screen.toJSON() && JSON.stringify(screen.toJSON()).includes("TextInput")).toBe(false);
  });
});

describe("머리", () => {
  test("header puts ‹ and the single ⋯ on the top row, then name, then distance and hours (C-89)", async () => {
    await enter({ distanceM: 320, more: () => <Text testID="more">⋯</Text> });
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    const top = screen.getByTestId("visit-header-top-row");
    expect(within(top).getByLabelText("지도 홈으로 돌아가기")).toBeTruthy();
    expect(within(top).getByTestId("more")).toBeTruthy(); // 이름 길이와 상관없이 ‹와 같은 줄
    const row = screen.getByTestId("visit-header-info-row");
    expect(within(row).getByTestId("visit-header-info").props.children).toEqual(["320m · ", "09:00–18:00"]);
    expect(within(row).queryByTestId("more")).toBeNull();
  });

  test("header hides distance when not passed", async () => {
    await enter({ distanceM: null });
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("visit-header-info").props.children).toEqual(["", "09:00–18:00"]);
    expect(JSON.stringify(screen.getByTestId("visit-header-info").props.children)).not.toContain("·");
  });

  test("header shows info missing when hours unknown", async () => {
    fetchLibrary.mockResolvedValue(lib(101, "정독도서관", { hours_text: null, is_closed: null }));
    await enter();
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("visit-header-info").props.children).toEqual(["", "정보 없음"]);
  });

  test("header shows closed today only when is_closed is true", async () => {
    fetchLibrary.mockResolvedValue(lib(101, "정독도서관", { is_closed: true }));
    await enter();
    expect(await screen.findByText("오늘 휴관")).toBeTruthy();
    expect(screen.queryByText(/09:00/)).toBeNull();

    fetchLibrary.mockResolvedValue(lib(101, "정독도서관", { is_closed: null }));
    await enter();
    await screen.findByText("정독도서관");
    expect(screen.queryByText("오늘 휴관")).toBeNull();
    expect(screen.getByTestId("visit-header-info").props.children).toEqual(["", "09:00–18:00"]);
  });

  test("header folds to one line when feed scrolls and unfolds at top", async () => {
    await enter();
    await screen.findByText("정독도서관");
    const scroll = screen.getByTestId("visit-scroll");
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 40 } } });
    expect(screen.queryByTestId("visit-header-one")).toBeNull(); // FOLD_AT(63) 아래
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 200 } } });
    const one = screen.getByTestId("visit-header-one");
    expect(within(one).getByText("정독도서관")).toBeTruthy();
    expect(within(one).queryByText(/09:00/)).toBeNull();
    expect(screen.getAllByLabelText("지도 홈으로 돌아가기")).toHaveLength(1);
    expect(screen.getAllByLabelText("도서관 메뉴")).toHaveLength(1);
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 30 } } });
    expect(screen.getByTestId("visit-header-one")).toBeTruthy(); // 접힌 뒤에는 맨 위에서만 펼침
    await fireEvent.press(within(screen.getByTestId("visit-header-one")).getByLabelText("지도 홈으로 돌아가기"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 0 } } });
    expect(screen.queryByTestId("visit-header-one")).toBeNull();
    expect(screen.getAllByLabelText("지도 홈으로 돌아가기")).toHaveLength(1);
    expect(screen.getAllByLabelText("도서관 메뉴")).toHaveLength(1);
  });

  test("distance route parsing and formatting", async () => {
    expect(formatDistance(0)).toBe("0m");
    expect(formatDistance(320)).toBe("320m");
    expect(formatDistance(1300)).toBe("1.3km");
    for (const bad of [undefined, ["320"], "-1", "1.5", "NaN", "9007199254740993", ""]) {
      expect(parseDistanceM(bad)).toBeNull();
    }
    expect(parseDistanceM("0")).toBe(0);
    mockParams = { libraryId: "101", distanceM: "1300" };
    await render(<LibraryVisitRoute />);
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("visit-header-info").props.children).toEqual(["1.3km · ", "09:00–18:00"]);
    mockParams = { libraryId: "101", distanceM: "-5" };
    await render(<LibraryVisitRoute />);
    await screen.findByText("정독도서관");
    expect(screen.getByTestId("visit-header-info").props.children).toEqual(["", "09:00–18:00"]);
  });
});

describe("피드 자리", () => {
  test("empty feed shows guide and first post link", async () => {
    await enter();
    expect(await screen.findByText(VISIT_TEXT.emptyTitle)).toBeTruthy();
    expect(screen.getByText(VISIT_TEXT.emptySub)).toBeTruthy();
    await fireEvent.press(screen.getByText(VISIT_TEXT.emptyLink));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/new", params: { libraryId: "101" } });
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    await fireEvent.press(screen.getByText(COMPOSE_TEXT.choosePost)); // VISIT-3 V3-O3: "+" → 고르기 창
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  test("first post link and plus ask login when signed out", async () => {
    setAuth("signedOut");
    await enter();
    await screen.findByText(VISIT_TEXT.emptyTitle);
    await fireEvent.press(screen.getByText(VISIT_TEXT.emptyLink));
    expect(screen.getByText(VISIT_TEXT.loginNeeded)).toBeTruthy();
    await fireEvent.press(screen.getByText(VISIT_TEXT.close));
    expect(screen.queryByText(VISIT_TEXT.loginNeeded)).toBeNull();
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    await fireEvent.press(screen.getByText(COMPOSE_TEXT.choosePost)); // VISIT-3 V3-O3: 로그인 확인은 고른 뒤
    expect(screen.getByText(VISIT_TEXT.loginNeeded)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(VISIT_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login" });
  });

  test("visit page renders signed out", async () => {
    setAuth("signedOut");
    await enter();
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(screen.getByText(VISIT_TEXT.emptyTitle)).toBeTruthy();
    expect(screen.queryByText(VISIT_TEXT.loginNeeded)).toBeNull();
  });

  test("feed loading, failure and empty are distinct", async () => {
    const first = deferred<{ items: unknown[] }>();
    const loadFeed = jest.fn<(id: number, s: AbortSignal) => Promise<{ items: unknown[] }>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ items: [] });
    await enter({ loadFeed });
    expect(screen.getByText(VISIT_TEXT.feedLoading)).toBeTruthy();
    expect(screen.queryByText(VISIT_TEXT.emptyTitle)).toBeNull();
    await act(async () => first.reject(network()));
    expect(await screen.findByText(VISIT_TEXT.feedFailed)).toBeTruthy();
    expect(screen.queryByText(VISIT_TEXT.emptyTitle)).toBeNull();
    expect(screen.queryByText(VISIT_TEXT.feedLoading)).toBeNull();
    await screen.findByText("정독도서관");
    const libCalls = fetchLibrary.mock.calls.length;
    await fireEvent.press(screen.getByText(VISIT_TEXT.feedRetry));
    expect(await screen.findByText(VISIT_TEXT.emptyTitle)).toBeTruthy();
    expect(screen.queryByText(VISIT_TEXT.feedFailed)).toBeNull();
    expect(loadFeed).toHaveBeenCalledTimes(2);
    expect(fetchLibrary).toHaveBeenCalledTimes(libCalls); // 피드만 다시
  });

  // 시연 전 개선 S1 ③: 글을 올리고(router.back) 돌아오면 새로고침 없이 바로 보인다
  test("returning to the page reloads the first feed page without clearing it", async () => {
    const renderFeed = (items: unknown[]) => (
      <Text>{items.map((p) => (p as { id: string }).id).join(",")}</Text>
    );
    const loadFeed = jest
      .fn<(id: number, s: AbortSignal, c?: string | null) => Promise<{ items: unknown[]; next_cursor?: string | null }>>()
      .mockResolvedValueOnce({ items: [{ id: "old" }], next_cursor: null })
      .mockResolvedValueOnce({ items: [{ id: "new" }, { id: "old" }], next_cursor: null })
      .mockRejectedValueOnce(network());
    await enter({ loadFeed, renderFeed });
    expect(await screen.findByText("old")).toBeTruthy();
    expect(loadFeed).toHaveBeenCalledTimes(1);

    // 처음 보일 때의 focus만으로는 다시 받지 않는다(두 번 받기 금지)
    await act(async () => mockListeners.focus?.());
    expect(loadFeed).toHaveBeenCalledTimes(1);

    // 글쓰기로 가렸다가 돌아오면 첫 묶음을 다시 받는다
    await act(async () => mockListeners.blur?.());
    await act(async () => mockListeners.focus?.());
    expect(await screen.findByText("new,old")).toBeTruthy();
    expect(loadFeed).toHaveBeenCalledTimes(2);
    expect(loadFeed.mock.calls[1]?.[0]).toBe(101);
    expect(loadFeed.mock.calls[1]?.[2]).toBeNull();

    // 다시 받기가 실패해도 보이던 글을 지우지 않는다
    await act(async () => mockListeners.blur?.());
    await act(async () => mockListeners.focus?.());
    expect(loadFeed).toHaveBeenCalledTimes(3);
    expect(screen.getByText("new,old")).toBeTruthy();
    expect(screen.queryByText(VISIT_TEXT.feedFailed)).toBeNull();
  });
});

describe("돌아가기", () => {
  test("back goes to home", async () => {
    await enter();
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("지도 홈으로 돌아가기"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("back without history replaces to home", async () => {
    mockCanGoBack = false;
    await enter();
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("지도 홈으로 돌아가기"));
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("back pressed twice returns home once", async () => {
    await enter();
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByLabelText("지도 홈으로 돌아가기"));
    await fireEvent.press(screen.getByLabelText("지도 홈으로 돌아가기"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("back gesture overlapping press navigates once", async () => {
    await enter();
    await screen.findByText("정독도서관");
    await act(async () => mockListeners.beforeRemove?.()); // 왼쪽 끝 밀기로 나가는 중
    await fireEvent.press(screen.getByLabelText("지도 홈으로 돌아가기"));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("늦은 응답", () => {
  test("late library response does not overwrite newer library", async () => {
    const slow = deferred<LibraryDetail>();
    fetchLibrary.mockImplementation((id) => (id === 101 ? slow.promise : Promise.resolve(lib(102, "종로도서관"))));
    const view = await render(<VisitScreen libraryId={101} distanceM={null} />);
    await view.rerender(<VisitScreen libraryId={102} distanceM={null} />);
    expect(await screen.findByText("종로도서관")).toBeTruthy();
    await act(async () => slow.resolve(lib(101, "정독도서관")));
    expect(screen.getByText("종로도서관")).toBeTruthy();
    expect(screen.queryByText("정독도서관")).toBeNull();
    expect(recordVisit.mock.calls.map((c) => c[0])).toEqual([102]);
  });

  test("late error and unmount cannot update current header", async () => {
    const slow = deferred<LibraryDetail>();
    fetchLibrary.mockImplementation((id) => (id === 101 ? slow.promise : Promise.resolve(lib(102, "종로도서관"))));
    const view = await render(<VisitScreen libraryId={101} distanceM={null} />);
    await view.rerender(<VisitScreen libraryId={102} distanceM={null} />);
    await screen.findByText("종로도서관");
    await act(async () => slow.reject(network()));
    expect(screen.queryByText(VISIT_TEXT.libFailed)).toBeNull();
    expect(screen.getByText("종로도서관")).toBeTruthy();

    const late = deferred<LibraryDetail>();
    fetchLibrary.mockImplementation(() => late.promise);
    recordVisit.mockClear();
    const second = await render(<VisitScreen libraryId={103} distanceM={null} />);
    await second.unmount();
    await act(async () => late.resolve(lib(103, "남산도서관")));
    expect(recordVisit).not.toHaveBeenCalled();
  });

  test("libraryId change resets folded header and handles null transition", async () => {
    fetchLibrary.mockImplementation(async (id) => lib(id, id === 101 ? "정독도서관" : "종로도서관"));
    const view = await render(<VisitScreen libraryId={101} distanceM={null} />);
    await screen.findByText("정독도서관");
    await fireEvent.scroll(screen.getByTestId("visit-scroll"), { nativeEvent: { contentOffset: { y: 200 } } });
    expect(screen.getByTestId("visit-header-one")).toBeTruthy();

    await view.rerender(<VisitScreen libraryId={102} distanceM={null} />);
    await screen.findByText("종로도서관");
    expect(screen.queryByTestId("visit-header-one")).toBeNull();

    await view.rerender(<VisitScreen libraryId={null} distanceM={null} />);
    expect(screen.getByText(VISIT_TEXT.notFound)).toBeTruthy();
  });
});

describe("L4 디자인 반영", () => {
  test("matte FAB, panelFrosted screen, header typography and folded surface, empty title, ment & sheet surfaces", async () => {
    jest.useFakeTimers();
    recordVisit.mockResolvedValue(visit({ isFirst: true }));
    setAuth("signedOut");
    await enter({ distanceM: 320 });
    expect(await screen.findByText("정독도서관")).toBeTruthy();

    // 바탕: panelFrosted
    const rootStyle = StyleSheet.flatten(screen.getByTestId("visit-screen").props.style);
    expect(rootStyle.backgroundColor).toBe(theme.colors.panelFrosted);

    // 머리 이름 type.pageTitle, 거리/시간 type.gauge
    const nameStyle = StyleSheet.flatten(screen.getByText("정독도서관").props.style);
    expect(nameStyle).toEqual(expect.objectContaining(T.pageTitle));
    const infoStyle = StyleSheet.flatten(screen.getByTestId("visit-header-info").props.style);
    expect(infoStyle).toEqual(expect.objectContaining(T.gauge));

    // 빈 피드 제목 type.title
    const emptyTitleStyle = StyleSheet.flatten(screen.getByText(VISIT_TEXT.emptyTitle).props.style);
    expect(emptyTitleStyle).toEqual(expect.objectContaining(T.title));

    // + : C-92 V3-O3 유리 원(가로 넘김 버튼과 같은 paper 62% 바탕·75% 테두리, 지름 52)
    const fab = screen.getByLabelText("글쓰기");
    const fabStyle = StyleSheet.flatten(fab.props.style);
    expect(fabStyle).toEqual(
      expect.objectContaining({
        backgroundColor: `${theme.colors.paper}9E`,
        borderWidth: 1,
        borderColor: `${theme.colors.paper}BF`,
        borderRadius: theme.radii.control,
        width: 52,
        height: 52,
        right: 16,
        bottom: FAB_BOTTOM, // 책장 인라인 전환 후 화면 우하단 고정 위치
      }),
    );
    expect(fabStyle.backgroundColor).not.toBe(theme.colors.fill1);
    expect(StyleSheet.flatten(within(fab).getByText("+").props.style).color).toBe(theme.colors.inkStrong);

    // 접힌 머리: panelFrosted + 아래 1px seamHairline
    await fireEvent.scroll(screen.getByTestId("visit-scroll"), { nativeEvent: { contentOffset: { y: 200 } } });
    const foldedStyle = StyleSheet.flatten(screen.getByTestId("visit-header-one").props.style);
    expect(foldedStyle).toEqual(
      expect.objectContaining({
        backgroundColor: theme.colors.panelFrosted,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.seamHairline,
      }),
    );

    // 멘트 카드: cardSurface({ onPanel: true }) 곡률 9
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    const mentStyle = StyleSheet.flatten(screen.getByTestId("visit-ment").props.style);
    expect(mentStyle).toEqual(
      expect.objectContaining({
        backgroundColor: theme.colors.panelLit,
        borderRadius: theme.radii.infoCard,
        borderColor: theme.colors.seamHairline,
        borderWidth: 1,
      }),
    );

    // 비로그인 시트: panelLit + 위쪽만 곡률 9
    await fireEvent.press(fab);
    await fireEvent.press(screen.getByText(COMPOSE_TEXT.choosePost)); // VISIT-3 V3-O3: "+" → 고르기 창 → 게시물
    const sheetStyle = StyleSheet.flatten(screen.getByTestId("visit-login-sheet").props.style);
    expect(sheetStyle).toEqual(
      expect.objectContaining({
        backgroundColor: theme.colors.panelLit,
        borderTopLeftRadius: theme.radii.infoCard,
        borderTopRightRadius: theme.radii.infoCard,
        borderColor: theme.colors.seamHairline,
      }),
    );
  });
});
