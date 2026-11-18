// VISIT-2-P2 도서관 기본값·앱 시작 분기 (contracts/local-feed.md VISIT-2 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import { theme } from "../../../theme";
import * as platform from "../../../lib/platform";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail, LibraryListResponse, LibrarySummary } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import type { VisitResult } from "../../../lib/visits";
import { ASK_TEXT } from "../AskDefaultCard";
import { DefaultLibraryGate, releasedText, resetDefaultLibraryGateForTests } from "../DefaultLibraryGate";
import { MENU_TEXT } from "../VisitMenu";
import { VisitScreen } from "../VisitScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush, canGoBack: () => true }),
  useNavigation: () => ({ addListener: () => () => undefined }),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
  fetchLibrariesNearby: jest.fn(),
}));
jest.mock("../../../lib/platform", () => ({
  locate: jest.fn(),
  openExternalUrl: jest.fn(),
}));
jest.mock("../../../lib/visits", () => ({
  recordVisit: jest.fn(),
  getDefaultLibrary: jest.fn(),
  setDefaultLibrary: jest.fn(),
  markDefaultAsked: jest.fn(),
}));

const fetchLibrary = jest.mocked(publicApi.fetchLibrary);
const fetchLibrariesNearby = jest.mocked(publicApi.fetchLibrariesNearby);
const locate = jest.mocked(platform.locate);
const openExternalUrl = jest.mocked(platform.openExternalUrl);
const recordVisit = jest.mocked(visits.recordVisit);
const getDefaultLibrary = jest.mocked(visits.getDefaultLibrary);
const setDefaultLibrary = jest.mocked(visits.setDefaultLibrary);
const markDefaultAsked = jest.mocked(visits.markDefaultAsked);

function lib(id: number, name: string): LibraryDetail {
  return {
    id, name, address: null, latitude: null, longitude: null, dtl_region_code: null, area_label: null,
    distance_m: null, tel: null, homepage: "https://lib.test", operating_time_text: null, closed_text: null,
    today: { date: "2026-11-17", is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false },
  };
}

function nearby(...entries: [number, number][]): LibraryListResponse {
  return {
    mode: "nearby", radius_km: 3, dtl_region: null, q: null,
    items: entries.map(([id, d]) => ({ ...lib(id, `도서관${id}`), distance_m: d }) as LibrarySummary),
  };
}

function visit(count: number, extra: Partial<VisitResult["record"]> = {}): VisitResult {
  return {
    counted: true, isFirst: count === 1, previousVisitedOn: "2026-11-15",
    record: { libraryId: 101, count, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-17", streakDays: 1,
      defaultAsked: false, ...extra },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let storedDefault: number | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  resetDefaultLibraryGateForTests();
  storedDefault = null;
  jest.mocked(useAuth).mockReturnValue({ status: "signedIn", userId: "u" } as unknown as ReturnType<typeof useAuth>);
  fetchLibrary.mockImplementation(async (id) => lib(id, id === 101 ? "정독도서관" : "종로도서관"));
  recordVisit.mockResolvedValue({ ...visit(2), counted: false });
  getDefaultLibrary.mockImplementation(async () => storedDefault);
  setDefaultLibrary.mockImplementation(async (id) => {
    storedDefault = id;
  });
  markDefaultAsked.mockResolvedValue(undefined);
  locate.mockResolvedValue({ ok: true, lat: 37.58, lng: 126.98 });
});

async function enterVisit() {
  await render(<VisitScreen libraryId={101} distanceM={null} />);
  await screen.findByText("정독도서관");
}

describe("⋯ 메뉴", () => {
  test("menu toggles default library", async () => {
    await enterVisit();
    await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
    await fireEvent.press(await screen.findByText(MENU_TEXT.turnOn));
    await waitFor(() => expect(setDefaultLibrary).toHaveBeenCalledWith(101));
    expect(await screen.findByText("앱을 켜면 정독도서관부터 열어요")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
    await fireEvent.press(await screen.findByText(MENU_TEXT.turnOff));
    await waitFor(() => expect(setDefaultLibrary).toHaveBeenLastCalledWith(null));
    expect(setDefaultLibrary.mock.calls.map((c) => c[0])).toEqual([101, null]);
    expect(await screen.findByText(MENU_TEXT.offNotice)).toBeTruthy();
  });

  test("menu default toggle pressed twice changes once", async () => {
    const slow = deferred<void>();
    setDefaultLibrary.mockReturnValueOnce(slow.promise);
    await enterVisit();
    await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
    const item = await screen.findByText(MENU_TEXT.turnOn);
    await fireEvent.press(item);
    await fireEvent.press(item);
    expect(setDefaultLibrary).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve());
    expect(setDefaultLibrary).toHaveBeenCalledTimes(1);
  });

  test("homepage item opens library homepage", async () => {
    openExternalUrl.mockResolvedValue(true);
    await enterVisit();
    await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
    await fireEvent.press(await screen.findByText(MENU_TEXT.homepage));
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith("https://lib.test"));
  });
});

describe("세 번째 방문 질문", () => {
  test("ask card yes sets default and marks asked", async () => {
    recordVisit.mockResolvedValue(visit(3));
    await enterVisit();
    expect(await screen.findByText(ASK_TEXT.title)).toBeTruthy();
    expect(screen.getByText("앱을 켜면 정독도서관부터 열까요?")).toBeTruthy();
    await fireEvent.press(screen.getByText(ASK_TEXT.yes));
    await waitFor(() => expect(markDefaultAsked).toHaveBeenCalledWith(101));
    expect(setDefaultLibrary).toHaveBeenCalledWith(101);
    expect(screen.queryByText(ASK_TEXT.title)).toBeNull();
  });

  test("ask card no only marks asked", async () => {
    recordVisit.mockResolvedValue(visit(3));
    await enterVisit();
    await fireEvent.press(await screen.findByText(ASK_TEXT.no));
    await waitFor(() => expect(markDefaultAsked).toHaveBeenCalledWith(101));
    expect(setDefaultLibrary).not.toHaveBeenCalled();
    expect(screen.queryByText(ASK_TEXT.title)).toBeNull();
  });

  test("ask card not shown when already default", async () => {
    storedDefault = 101;
    recordVisit.mockResolvedValue(visit(3));
    await enterVisit();
    await waitFor(() => expect(recordVisit).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(ASK_TEXT.title)).toBeNull();
  });
});

describe("앱 시작 분기", () => {
  test("gate opens default library when inside radius", async () => {
    storedDefault = 101;
    fetchLibrariesNearby.mockResolvedValue(nearby([102, 500], [101, 320]));
    await render(<DefaultLibraryGate />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/libraries/[libraryId]",
      params: { libraryId: "101", distanceM: "320" },
    });
    expect(setDefaultLibrary).not.toHaveBeenCalled();
  });

  test("gate releases when another library is near and default is not", async () => {
    storedDefault = 101;
    fetchLibrariesNearby.mockResolvedValue(nearby([102, 500]));
    await render(<DefaultLibraryGate />);
    expect(await screen.findByText(releasedText("정독도서관"))).toBeTruthy();
    expect(screen.getByText("정독도서관 바로 열기를 풀었어요")).toBeTruthy();
    expect(setDefaultLibrary).toHaveBeenCalledWith(null);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("gate keeps default when location unavailable", async () => {
    storedDefault = 101;
    locate.mockResolvedValue({ ok: false, reason: "denied" });
    await render(<DefaultLibraryGate />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush.mock.calls[0]![0]).toEqual({ pathname: "/libraries/[libraryId]", params: { libraryId: "101" } });
    expect(setDefaultLibrary).not.toHaveBeenCalled();
    expect(fetchLibrariesNearby).not.toHaveBeenCalled();
  });

  test("gate decides only once per launch", async () => {
    storedDefault = 101;
    fetchLibrariesNearby.mockResolvedValue(nearby([101, 320]));
    const view = await render(<DefaultLibraryGate />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    await view.unmount();
    await render(<DefaultLibraryGate />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchLibrariesNearby).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("gate does nothing without default", async () => {
    await render(<DefaultLibraryGate />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchLibrary).not.toHaveBeenCalled();
    expect(locate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("gate clears default when library vanished", async () => {
    storedDefault = 101;
    fetchLibrary.mockRejectedValue(new publicApi.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", ""));
    await render(<DefaultLibraryGate />);
    await waitFor(() => expect(setDefaultLibrary).toHaveBeenCalledWith(null));
    expect(locate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("gate keeps default when no library is nearby at all", async () => {
    storedDefault = 101;
    fetchLibrariesNearby.mockResolvedValue(nearby());
    await render(<DefaultLibraryGate />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(setDefaultLibrary).not.toHaveBeenCalled();
  });

  test("gate keeps default and opens library when nearby lookup fails", async () => {
    storedDefault = 101;
    fetchLibrariesNearby.mockRejectedValue(new publicApi.ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", ""));
    await render(<DefaultLibraryGate />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/libraries/[libraryId]",
      params: { libraryId: "101" },
    });
    expect(setDefaultLibrary).not.toHaveBeenCalled();
    expect(fetchLibrariesNearby).toHaveBeenCalledTimes(1);
  });

  test("gate releases default silently when library info lookup fails with non-404", async () => {
    storedDefault = 101;
    fetchLibrary.mockRejectedValue(new publicApi.ApiCallError(503, "PROVIDER_UNAVAILABLE", "불러오지 못했어요.", ""));
    fetchLibrariesNearby.mockResolvedValue(nearby([102, 500]));
    await render(<DefaultLibraryGate />);
    await waitFor(() => expect(setDefaultLibrary).toHaveBeenCalledWith(null));
    expect(screen.queryByTestId("gate-notice")).toBeNull();
    expect(screen.queryByText(/기본 도서관/)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("L4 카드 표면", () => {
  test("VisitMenu and AskDefaultCard use cardSurface onPanel with infoCard radius", async () => {
    recordVisit.mockResolvedValue(visit(3));
    await enterVisit();

    const askCard = await screen.findByTestId("ask-default-card");
    const askStyle = StyleSheet.flatten(askCard.props.style);
    expect(askStyle).toEqual(
      expect.objectContaining({
        backgroundColor: theme.colors.panelLit,
        borderRadius: theme.radii.infoCard,
        borderWidth: 1,
        borderColor: theme.colors.seamHairline,
      }),
    );

    await fireEvent.press(screen.getByLabelText("도서관 메뉴"));
    const menuCard = await screen.findByTestId("visit-menu-card");
    const menuStyle = StyleSheet.flatten(menuCard.props.style);
    expect(menuStyle).toEqual(
      expect.objectContaining({
        backgroundColor: theme.colors.panelLit,
        borderRadius: theme.radii.infoCard,
        borderWidth: 1,
        borderColor: theme.colors.seamHairline,
      }),
    );
  });
});
