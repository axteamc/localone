// VISIT-1-P3 필수 테스트 (계약서 library-visit.md VISIT-1 P5): 보는 위치 바꾸기·도서관 찾기 창
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { BackHandler } from "react-native";
import * as api from "../deps";
import { HomeScreen } from "../HomeScreen";

const mockPush = jest.fn();
let mockLastMapProps: api.KakaoMapProps | null = null;
let mockMapFails = false;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  const ReactLib = require("react");
  const { Text, View } = require("react-native");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(),
    fetchLibrariesInRegion: jest.fn(),
    searchLibrariesByName: jest.fn(),
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    KakaoMap: (props: api.KakaoMapProps) => {
      mockLastMapProps = props;
      ReactLib.useEffect(() => {
        if (mockMapFails) props.onError("no_key");
      }, []);
      return ReactLib.createElement(
        View,
        { testID: "kakao-map" },
        props.markers.map((mk: api.MapMarker) => ReactLib.createElement(Text, { key: mk.id }, mk.title))
      );
    },
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

function mapProps(): api.KakaoMapProps {
  if (!mockLastMapProps) throw new Error("지도가 그려지지 않음");
  return mockLastMapProps;
}

async function openHome() {
  await render(<HomeScreen />);
  await screen.findByText("정독도서관");
}

async function drag(to: api.LatLng) {
  await act(async () => mapProps().onRegionChange!(to));
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
  mockLastMapProps = null;
  mockMapFails = false;
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
  test("drag shows search here and reloads at center", async () => {
    await openHome();
    expect(screen.queryByText("이 지역에서 다시 찾기")).toBeNull();
    expect(screen.queryByText("현재 위치로")).toBeNull();
    await drag({ lat: 37.57, lng: 126.99 });
    expect(screen.getByText("현재 위치로")).toBeTruthy();
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기"));
    await waitFor(() =>
      expect(m.fetchLibrariesNearby).toHaveBeenLastCalledWith(37.57, 126.99, 3, expect.anything())
    );
    await waitFor(() => expect(screen.queryByText("이 지역에서 다시 찾기")).toBeNull());
    expect(screen.getByText("현재 위치로")).toBeTruthy();
    expect(mapProps().center).toEqual({ lat: 37.57, lng: 126.99 });
  });

  test("search here double press makes one request", async () => {
    await openHome();
    const d = deferred<api.LibraryListResponse>();
    m.fetchLibrariesNearby.mockImplementation(() => d.promise);
    await drag({ lat: 37.57, lng: 126.99 });
    m.fetchLibrariesNearby.mockClear(); // 앱을 켤 때의 첫 조회는 세지 않는다
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기"));
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기"));
    expect(m.fetchLibrariesNearby).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("home-search-here").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => d.resolve(nearby(actual.FAKE_LIBRARIES)));
    expect(m.fetchLibrariesNearby).toHaveBeenCalledTimes(1);
  });

  test("late response does not overwrite newer area", async () => {
    await openHome();
    const first = deferred<api.LibraryListResponse>();
    const second = deferred<api.LibraryListResponse>();
    m.fetchLibrariesNearby.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    await drag({ lat: 37.57, lng: 126.99 });
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기")); // 1번 시작
    await fireEvent.press(screen.getByText("현재 위치로")); // 2번 시작
    await act(async () => second.resolve(nearby([lib(201, "새지역도서관")])));
    expect(await screen.findByText("새지역도서관")).toBeTruthy();
    await act(async () => first.resolve(nearby([lib(301, "늦은도서관")]))); // 1번이 늦게 끝남
    expect(screen.queryByText("늦은도서관")).toBeNull();
    expect(screen.getByText("새지역도서관")).toBeTruthy();
    expect(mapProps().center).toEqual(CURRENT);
  });

  test("drag during search here keeps newer spot", async () => {
    await openHome();
    const first = deferred<api.LibraryListResponse>();
    m.fetchLibrariesNearby.mockImplementationOnce(() => first.promise);
    const A = { lat: 37.57, lng: 126.99 };
    const B = { lat: 37.55, lng: 126.97 };
    await drag(A);
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기")); // A 요청 시작
    await drag(B); // 요청 없이 지도만 또 옮김
    await act(async () => first.resolve(nearby([lib(301, "A지역도서관")])));
    await screen.findByText("A지역도서관");
    // B를 다시 찾을 버튼이 남아 있고 누를 수 있다. 지도는 A로 되돌아가지 않는다
    expect(screen.getByTestId("home-search-here").props.accessibilityState).toMatchObject({ disabled: false });
    expect(mapProps().center).not.toEqual(A);
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기"));
    await waitFor(() => expect(m.fetchLibrariesNearby).toHaveBeenLastCalledWith(B.lat, B.lng, 3, expect.anything()));
    await waitFor(() => expect(screen.queryByText("이 지역에서 다시 찾기")).toBeNull());
    expect(mapProps().center).toEqual(B);
  });

  test("back to current restores current location", async () => {
    await openHome();
    await drag({ lat: 37.57, lng: 126.99 });
    await fireEvent.press(screen.getByText("이 지역에서 다시 찾기"));
    await waitFor(() => expect(screen.queryByText("이 지역에서 다시 찾기")).toBeNull());
    await fireEvent.press(screen.getByText("현재 위치로"));
    await waitFor(() =>
      expect(m.fetchLibrariesNearby).toHaveBeenLastCalledWith(CURRENT.lat, CURRENT.lng, 3, expect.anything())
    );
    await waitFor(() => expect(screen.queryByText("현재 위치로")).toBeNull());
    expect(mapProps().center).toEqual(CURRENT);
  });

  test("back to current right after drag moves map back even though home center is unchanged", async () => {
    await openHome();
    const away = { lat: 37.57, lng: 126.99 };
    await drag(away);
    // 지도는 끌어 옮긴 자리를 기억한다(실제 지도 어댑터는 이 값과 다를 때만 옮긴다)
    expect(mapProps().center).toEqual(away);
    await fireEvent.press(screen.getByText("현재 위치로"));
    await waitFor(() => expect(mapProps().center).toEqual(CURRENT));
  });

  test("allow and back buttons never show together when location denied", async () => {
    m.locate.mockResolvedValue({ ok: false, reason: "denied" });
    await render(<HomeScreen />);
    await screen.findByText("위치 허용하기");
    await drag({ lat: 37.57, lng: 126.99 });
    expect(screen.getByText("이 지역에서 다시 찾기")).toBeTruthy();
    expect(screen.getByText("위치 허용하기")).toBeTruthy();
    expect(screen.queryByText("현재 위치로")).toBeNull();
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

  test("find result moves map not visit page", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("정독");
    // 지도 핀 글자와 찾기 결과 줄이 같은 이름이라, 창(나중에 그려짐)의 줄을 누른다
    await waitFor(() => expect(screen.getAllByText("정독도서관")).toHaveLength(2));
    await fireEvent.press(screen.getAllByText("정독도서관").at(-1)!);
    await waitFor(() => expect(screen.queryByTestId("find-sheet")).toBeNull());
    await waitFor(() => expect(mapProps().selectedId).toBe(101));
    expect(mapProps().center).toEqual({ lat: 37.5815, lng: 126.9831 });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("find region result in map mode moves to region center", async () => {
    jest.useFakeTimers();
    await openHome();
    await openFind();
    await typeAndWait("용산");
    await fireEvent.press(await screen.findByText("서울 용산구"));
    await waitFor(() => expect(m.fetchLibrariesInRegion).toHaveBeenCalledWith("11030", expect.anything()));
    await waitFor(() => expect(mapProps().center).toEqual({ lat: 37.5531, lng: 126.9817 }));
    expect(mapProps().markers.map((x) => x.id)).toEqual([103]);
    expect(screen.getByText("현재 위치로")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("find result in list mode swaps region list", async () => {
    jest.useFakeTimers();
    mockMapFails = true;
    await render(<HomeScreen />);
    await screen.findByText("정독도서관 · 화동 · 09:00~22:00");
    await openFind();
    await typeAndWait("용산");
    await fireEvent.press(await screen.findByText("서울 용산구"));
    await waitFor(() => expect(m.fetchLibrariesInRegion).toHaveBeenLastCalledWith("11030", expect.anything()));
    expect(await screen.findByText("남산도서관 · 서울특별시 용산구 소월로 109")).toBeTruthy();
    expect(screen.queryByText("정독도서관 · 화동 · 09:00~22:00")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
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
