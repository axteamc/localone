// VISIT-1-P3 필수 테스트 (계약서 library-visit.md VISIT-1 P5): 보는 위치 바꾸기·도서관 찾기 창
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { BackHandler } from "react-native";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  fetchLibrariesInRegion: jest.Mock<typeof api.fetchLibrariesInRegion>;
  searchLibrariesByName: jest.Mock<typeof api.searchLibrariesByName>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
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
  await screen.findByText("정독도서관");
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
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.fetchLibrariesInRegion.mockImplementation(actual.fetchLibrariesInRegion);
  m.searchLibrariesByName.mockImplementation(actual.searchLibrariesByName);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("VISIT-1-P3 move and find", () => {
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
    // 블록과 찾기 결과 줄이 같은 이름이라, 창(나중에 그려짐)의 줄을 누른다
    await waitFor(() => expect(screen.getAllByText("정독도서관")).toHaveLength(2));
    await fireEvent.press(screen.getAllByText("정독도서관").at(-1)!);
    await waitFor(() => expect(screen.queryByTestId("find-sheet")).toBeNull());
    expect(screen.getByTestId("facade-block-NE")).toHaveTextContent(/정독도서관/);
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
    await waitFor(() => expect(screen.getByTestId("facade-block-MAIN")).toHaveTextContent(/남산도서관/));
    expect(screen.queryByText("정독도서관")).toBeNull();
    expect(screen.getByText("이동한 지역")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
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
    expect(await screen.findByText("정독도서관")).toBeTruthy();
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
