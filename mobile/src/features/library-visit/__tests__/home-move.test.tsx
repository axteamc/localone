// VISIT-1-P3 필수 테스트 (계약서 library-visit.md VISIT-1 P5): 보는 위치 바꾸기·도서관 찾기 창
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { BackHandler, StyleSheet } from "react-native";
import { theme } from "../../../theme";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";
import { averageCenter } from "../useHomeLibraries";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => (require("react") as typeof import("react")).useEffect(cb, [cb]),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 홈 시험은 파사드 블록과 찾기 동작만 본다. 하단 창(VISIT-1b)은 home-sheet·home-news 시험이 따로 본다.
// 창 위쪽 끝에 붙는 안내·버튼(above)만 그대로 그린다
jest.mock("../HomeSheet", () => ({
  HomeSheet: (p: { above?: unknown }) => p.above ?? null,
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(),
    fetchLibrariesInRegion: jest.fn(),
    searchLibrariesByName: jest.fn(),
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    getLastRegion: jest.fn(),
    setLastRegion: jest.fn(),
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  fetchLibrariesInRegion: jest.Mock<typeof api.fetchLibrariesInRegion>;
  searchLibrariesByName: jest.Mock<typeof api.searchLibrariesByName>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
  getLastRegion: jest.Mock<typeof api.getLastRegion>;
  setLastRegion: jest.Mock<typeof api.setLastRegion>;
};

const CURRENT = { lat: 37.5815, lng: 126.9831 };
const nearby = (items: api.LibrarySummary[]): api.LibraryListResponse => ({
  mode: "nearby",
  radius_km: 3,
  dtl_region: null,
  q: null,
  items,
});
const lib = (id: number, name: string): api.LibrarySummary => ({ ...actual.FAKE_LIBRARIES[0]!, id, name });

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function openHome() {
  await render(<HomeScreen />);
  await screen.findByText("정독");
}

async function openFind() {
  await fireEvent.press(screen.getByTestId("home-find-library"));
  return screen.getByTestId("find-sheet-input");
}

async function typeAndWait(text: string) {
  const input = screen.getByTestId("find-sheet-input");
  await fireEvent.changeText(input, text);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  m.locate.mockResolvedValue({ ok: true, ...CURRENT });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.getLastRegion.mockResolvedValue(null);
  m.setLastRegion.mockResolvedValue(undefined);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.fetchLibrariesInRegion.mockImplementation(actual.fetchLibrariesInRegion);
  m.searchLibrariesByName.mockImplementation(actual.searchLibrariesByName);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("VISIT-1-P3 move and find", () => {
  // 시연 전 개선 S1 W-2: 창 배경이 없어 뒤의 블록과 글자가 겹쳤다 → 토큰 paper로 막힌 창
  test("find sheet is opaque paper over the board", async () => {
    await openHome();
    await openFind();
    const style = StyleSheet.flatten(screen.getByTestId("find-sheet").props.style);
    expect(style.backgroundColor).toBe(theme.colors.paper);
    expect(style.borderColor).toBe(theme.colors.divider);
  });

  test("find sheet searches regions and libraries", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    expect(screen.getByText("지역이나 도서관 이름을 적어 주세요")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("find-sheet-input"), "종");
    await fireEvent.changeText(screen.getByTestId("find-sheet-input"), "종로");
    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(m.searchLibrariesByName).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(m.searchLibrariesByName).toHaveBeenCalledTimes(1);
    expect(m.searchLibrariesByName).toHaveBeenCalledWith("종로", expect.anything());
    await screen.findByText("서울 종로구");
    // 창 안에서: 지역 줄이 도서관 줄보다 먼저 (지도 핀 글자는 세지 않는다)
    const sheet = within(screen.getByTestId("find-sheet"));
    const texts = sheet.getAllByText(/서울 종로구|종로도서관/).map((n) => n.props.children);
    expect(texts).toEqual(["서울 종로구", "종로도서관"]);
  });

  test("find library result closes the sheet without opening the visit page", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("정독");
    // 큐브는 줄인 이름("정독"), 찾기 결과 줄은 원래 이름이라 결과 줄 하나만 맞는다
    await waitFor(() => expect(screen.getAllByText("정독도서관")).toHaveLength(1));
    await fireEvent.press(screen.getByText("정독도서관"));
    await waitFor(() => expect(screen.queryByTestId("find-sheet")).toBeNull());
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독/);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("find region result swaps the blocks and shows back to current", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("용산");
    await fireEvent.press(await screen.findByText("서울 용산구"));
    await waitFor(() => expect(m.fetchLibrariesInRegion).toHaveBeenCalledWith("11030", expect.anything()));
    // 용산구 결과는 남산도서관 한 곳 → 한 블록(MAIN)으로, 기준 위치는 그 지역
    await waitFor(() => expect(screen.getByTestId("facade-hero")).toHaveTextContent(/남산/));
    expect(screen.queryByText("정독")).toBeNull();
    expect(screen.getByText("이동한 지역")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("find region result is remembered as the next start region", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("용산");
    await fireEvent.press(await screen.findByText("서울 용산구"));
    await waitFor(() => expect(m.setLastRegion).toHaveBeenCalledWith("11030"));
  });

  // 시연 전 개선 S2(C-68): 위치를 못 쓰고 기본 도서관이 없으면 마지막으로 고른 지역에서 시작한다
  test("last region is used when location denied and no default", async () => {
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    m.getLastRegion.mockResolvedValue("11030");
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId("facade-hero")).toHaveTextContent(/남산/));
    expect(m.fetchLibrariesInRegion).toHaveBeenCalledWith("11030", expect.anything());
    expect(m.fetchLibrariesNearby).not.toHaveBeenCalled();
    expect(screen.getByText("임시 시작점")).toBeTruthy();
    expect(screen.getByText("위치 허용하기")).toBeTruthy();
  });

  test("region center ignores one library with a far-off coordinate", () => {
    const at = (id: number, latitude: number | null, longitude: number | null) => ({ ...lib(id, `L${id}`), latitude, longitude });
    // 광주 북구 실제 데이터: 6곳은 광주, 1곳만 서울 좌표로 잘못 들어가 있다
    const c = averageCenter([at(1, 35.17, 126.92), at(2, 35.2, 126.86), at(3, 35.18, 126.87), at(4, 37.6, 127.02), at(5, 35.21, 126.89), at(6, null, null)]);
    expect(c!.lat).toBeCloseTo(35.2, 2); // 평균이면 35.67(약 50km 북쪽)
    expect(c!.lng).toBeCloseTo(126.89, 2);
    expect(averageCenter([at(7, null, null)])).toBeNull();
  });

  test("last region falls back to default start when it has no libraries", async () => {
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    m.getLastRegion.mockResolvedValue("99999");
    m.fetchLibrariesInRegion.mockResolvedValue({ mode: "region", radius_km: null, dtl_region: "99999", q: null, items: [] });
    await render(<HomeScreen />);
    await waitFor(() =>
      expect(m.fetchLibrariesNearby).toHaveBeenCalledWith(api.DEFAULT_START.lat, api.DEFAULT_START.lng, 3, expect.anything())
    );
  });

  test("empty start offers region pick and remembers it", async () => {
    jest.useFakeTimers();
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    m.fetchLibrariesNearby.mockResolvedValue(nearby([]));
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByText("지역 골라 시작"));
    expect(screen.queryByText("더 넓게 찾기")).toBeNull();
    expect(screen.getByTestId("find-sheet-input")).toBeTruthy();
    await typeAndWait("용산");
    await fireEvent.press(await screen.findByText("서울 용산구"));
    await waitFor(() => expect(screen.getByTestId("facade-hero")).toHaveTextContent(/남산/));
    expect(m.setLastRegion).toHaveBeenCalledWith("11030");
    expect(screen.getByText("임시 시작점")).toBeTruthy();
  });

  test("back to current restores current location", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("용산");
    await fireEvent.press(await screen.findByText("서울 용산구"));
    await fireEvent.press(await screen.findByText("현재 위치로"));
    await waitFor(() =>
      expect(m.fetchLibrariesNearby).toHaveBeenLastCalledWith(CURRENT.lat, CURRENT.lng, 3, expect.anything())
    );
    await waitFor(() => expect(screen.queryByText("현재 위치로")).toBeNull());
    expect(await screen.findByText("정독")).toBeTruthy();
    expect(screen.getByText("현위치")).toBeTruthy();
  });

  test("find sheet empty message", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("연동");
    expect(await screen.findByText("‘연동’에 맞는 지역·도서관을 찾지 못했어요.")).toBeTruthy();
  });

  test("find sheet error shows reload", async () => {
    jest.useFakeTimers();
    await openHome();
    m.searchLibrariesByName.mockRejectedValueOnce(new actual.ApiCallError(0, "NETWORK", "Network request failed"));
    await openFind();
    await typeAndWait("정독");
    expect(await screen.findByText("지금은 도서관을 불러올 수 없어요.")).toBeTruthy();
    expect(screen.queryByText("Network request failed")).toBeNull();
    await fireEvent.press(screen.getByText("↻ 새로고침"));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(m.searchLibrariesByName).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText("지금은 도서관을 불러올 수 없어요.")).toBeNull());
  });

  test("find sheet takes the place of the top search bar", async () => {
    await openHome();
    const bar = screen.getByTestId("home-search-bar");
    await openFind();
    // 열려 있는 동안 맨 위는 "‹ 지역이나 도서관 이름" 칸 — 책 검색 칸은 보이지 않고 눌리지 않는다
    expect(screen.getByPlaceholderText("지역이나 도서관 이름")).toBeTruthy();
    expect(screen.getByTestId("find-sheet-input").props.autoFocus).toBe(true);
    expect(screen.getByText("책 제목·저자를 검색")).not.toBeVisible();
    await fireEvent.press(bar);
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("‹"));
    expect(screen.getByText("책 제목·저자를 검색")).toBeVisible();
  });

  test("find sheet closes three ways", async () => {
    await openHome();
    await openFind();
    await fireEvent.press(screen.getByTestId("find-sheet-backdrop"));
    expect(screen.queryByTestId("find-sheet")).toBeNull();

    await openFind();
    await fireEvent.press(screen.getByText("‹"));
    expect(screen.queryByTestId("find-sheet")).toBeNull();

    await openFind();
    const spy = jest.spyOn(BackHandler, "addEventListener");
    // 열린 창이 이미 등록한 뒤라 다시 열어 등록 함수를 잡는다
    await fireEvent.press(screen.getByText("‹"));
    await openFind();
    const handler = spy.mock.calls.at(-1)![1] as () => boolean;
    let handled = false;
    await act(async () => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(screen.queryByTestId("find-sheet")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("find sheet drops old result as soon as query changes", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    const old = deferred<api.LibraryListResponse>();
    m.searchLibrariesByName.mockImplementationOnce(() => old.promise);
    await typeAndWait("정독"); // 앞 요청 진행 중
    await fireEvent.changeText(screen.getByTestId("find-sheet-input"), "종로"); // 새 요청은 아직(300ms 전)
    await act(async () =>
      old.resolve({ mode: "search", radius_km: null, dtl_region: null, q: "정독", items: [lib(401, "OLD_RESULT")] })
    );
    const sheet = within(screen.getByTestId("find-sheet"));
    expect(sheet.queryByText("OLD_RESULT")).toBeNull();
    expect(sheet.getByText("찾는 중…")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await waitFor(() => expect(sheet.getByText("종로도서관")).toBeTruthy());
    expect(sheet.queryByText("OLD_RESULT")).toBeNull();
  });

  test("find sheet drops old result when query is cleared", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    const old = deferred<api.LibraryListResponse>();
    m.searchLibrariesByName.mockImplementationOnce(() => old.promise);
    await typeAndWait("정독");
    await fireEvent.changeText(screen.getByTestId("find-sheet-input"), "");
    await act(async () =>
      old.resolve({ mode: "search", radius_km: null, dtl_region: null, q: "정독", items: [lib(401, "OLD_RESULT")] })
    );
    const sheet = within(screen.getByTestId("find-sheet"));
    expect(sheet.queryByText("OLD_RESULT")).toBeNull();
    expect(sheet.getByText("지역이나 도서관 이름을 적어 주세요")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(sheet.queryByText("OLD_RESULT")).toBeNull();
    expect(m.searchLibrariesByName).toHaveBeenCalledTimes(1);
  });

  test("query longer than 30 is trimmed", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    const long = "가".repeat(35);
    await typeAndWait(long);
    expect(m.searchLibrariesByName).toHaveBeenCalledTimes(1);
    expect(m.searchLibrariesByName.mock.calls[0]![0]).toBe("가".repeat(30));
  });
});
