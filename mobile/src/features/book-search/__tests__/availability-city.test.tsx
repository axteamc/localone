// LIB-2-P2 도시 전체·지역 고르기·빈 결과 (book-search.md LIB-2 P5)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import * as platform from "../../../lib/platform";
import * as lib from "../../../lib/publicApi";
import type { AvailabilityItem, AvailabilityResponse, Book, LibraryDetail } from "../../../lib/publicApi";
import { searchRegions } from "../../../lib/regions";
import { BookDetailScreen } from "../BookDetailScreen";
import { EMPTY_CITY, EMPTY_NEARBY } from "../EmptyAvailability";
import { LIMIT_UNCHECKED } from "../LibraryAvailabilityCard";
import { REGION_INTRO, REGION_LOCATION_DENIED, REGION_NO_MATCH } from "../RegionPicker";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));

jest.mock("../../../lib/platform", () => {
  const actual = jest.requireActual<typeof import("../../../lib/platform")>("../../../lib/platform");
  return { ...actual, locate: jest.fn(), openExternalUrl: jest.fn(), requestLocationPermission: jest.fn() };
});

jest.mock("../../../lib/publicApi", () => {
  const actual = jest.requireActual<typeof import("../../../lib/publicApi")>("../../../lib/publicApi");
  return {
    ...actual,
    fetchBook: jest.fn(),
    fetchAvailabilityNearby: jest.fn(),
    fetchAvailabilityInCity: jest.fn(),
    fetchLibrariesNearby: jest.fn(),
    fetchLibrary: jest.fn(),
    fetchPurchaseLink: jest.fn(async () => { throw new actual.ApiCallError(404, "NOT_FOUND", "x", ""); }),
  };
});

const locate = jest.mocked(platform.locate);
const requestLocationPermission = jest.mocked(platform.requestLocationPermission);
const fetchAvailabilityNearby = jest.mocked(lib.fetchAvailabilityNearby);
const fetchAvailabilityInCity = jest.mocked(lib.fetchAvailabilityInCity);
const fetchLibrariesNearby = jest.mocked(lib.fetchLibrariesNearby);
const fetchLibrary = jest.mocked(lib.fetchLibrary);
const fetchBook = jest.mocked(lib.fetchBook);

const HERE = { ok: true as const, lat: 37.58, lng: 126.98 };
const CITY_BTN = "현재 도시 내 모든 도서관 검색";

const BOY: Book = {
  isbn13: "9788936434120",
  title: "소년이 온다",
  author: "한강",
  publisher: "창비",
  cover_url: null,
  source: "data4library",
  description: null,
  pub_year: 2014,
};

function item(id: number, name: string, extra: Partial<AvailabilityItem> = {}): AvailabilityItem {
  return {
    library: {
      id,
      name,
      address: null,
      area_label: "서울 종로구",
      distance_m: id * 100,
      today: { date: "2026-11-17", is_closed: null, hours_text: null, holiday_unchecked: false },
      tel: null,
    },
    holding: "yes",
    loanable: "yes",
    basis: "today",
    source: "data4library",
    observed_at: null,
    data_date: "2026-11-16",
    data_date_assumed: false,
    fallback_reason: null,
    live_check: null,
    ...extra,
  };
}

function resp(items: AvailabilityItem[], scope: "nearby" | "city" = "nearby"): AvailabilityResponse {
  return {
    isbn13: BOY.isbn13,
    scope,
    radius_km: scope === "nearby" ? 3 : null,
    dtl_region: scope === "city" ? "11010" : null,
    checked_at: "2026-11-17T09:30:12+09:00",
    items,
  };
}

function libDetail(id: number, code: string | null): LibraryDetail {
  return {
    id,
    name: `도서관 ${id}`,
    address: null,
    latitude: null,
    longitude: null,
    dtl_region_code: code,
    area_label: null,
    distance_m: null,
    today: { date: "2026-11-17", is_closed: null, hours_text: null, holiday_unchecked: false },
    tel: null,
    homepage: null,
    operating_time_text: null,
    closed_text: null,
  };
}

/** 화면 JSON에서 글자 위치(순서 비교용) */
const at = (s: string) => JSON.stringify(screen.toJSON()).indexOf(s);

beforeEach(async () => {
  jest.clearAllMocks();
  // clearAllMocks는 남은 mockResolvedValueOnce를 지우지 않아 다음 시험으로 샌다
  for (const m of [locate, requestLocationPermission, fetchAvailabilityNearby, fetchAvailabilityInCity, fetchLibrariesNearby, fetchLibrary, fetchBook]) m.mockReset();
  await AsyncStorage.clear();
  jest.mocked(useAuth).mockReturnValue({
    status: "signedOut",
    userId: null,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  fetchBook.mockResolvedValue(BOY);
  locate.mockResolvedValue(HERE);
  requestLocationPermission.mockResolvedValue("denied");
  fetchAvailabilityNearby.mockResolvedValue(resp([item(7, "정독도서관"), item(8, "종로도서관")]));
  fetchAvailabilityInCity.mockResolvedValue(resp([item(1, "가 도서관"), item(2, "나 도서관")], "city"));
  fetchLibrary.mockImplementation(async (id) => libDetail(id, "11010"));
  fetchLibrariesNearby.mockResolvedValue({ mode: "nearby", radius_km: 5, dtl_region: null, q: null, items: [] });
});

/** 상세를 띄우고 하단 "도서관 확인"으로 조회 창을 연다(LIB-3b V3 — 창을 열 때만 #12를 부른다) */
async function renderDetail(isbn13: string) {
  await render(<BookDetailScreen isbn13={isbn13} />);
  await fireEvent.press(await screen.findByTestId("find-libraries"));
}

describe("도시 전체 도서관", () => {
  test("city search uses nearest library region", async () => {
    await renderDetail(BOY.isbn13);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByText(CITY_BTN));
    expect(await screen.findByText("가 도서관")).toBeTruthy();
    expect(fetchLibrary).toHaveBeenCalledWith(7, expect.anything()); // 주변 결과 첫 도서관
    expect(fetchAvailabilityInCity).toHaveBeenCalledWith(BOY.isbn13, "11010", expect.anything());
    expect(fetchLibrariesNearby).not.toHaveBeenCalled();
    expect(screen.getByText(/도시 전체 도서관 · 서울특별시 종로구/)).toBeTruthy();
    expect(screen.getByText("내 주변 다시 보기")).toBeTruthy();
  });

  test("city search falls back to libraries near location, then region picker", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([])); // 주변 결과 없음
    fetchLibrariesNearby.mockResolvedValueOnce({
      mode: "nearby",
      radius_km: 5,
      dtl_region: null,
      q: null,
      items: [{ ...libDetail(3, null) }, { ...libDetail(4, "11020") }],
    });
    await renderDetail(BOY.isbn13);
    await screen.findByText(EMPTY_NEARBY);
    await fireEvent.press(screen.getByText(CITY_BTN));
    await screen.findByText("가 도서관");
    expect(fetchLibrariesNearby).toHaveBeenCalledWith(HERE.lat, HERE.lng, 5, expect.anything());
    expect(fetchAvailabilityInCity).toHaveBeenCalledWith(BOY.isbn13, "11020", expect.anything());

    // 근처 도서관에도 시군구가 없으면 지역 고르기
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([]));
    await fireEvent.press(screen.getByText("내 주변 다시 보기"));
    await screen.findByText(EMPTY_NEARBY);
    await fireEvent.press(screen.getByText(CITY_BTN));
    expect(await screen.findByText(REGION_INTRO)).toBeTruthy();
  });

  test("city search summarizes unknown limit items without marking absent", async () => {
    fetchAvailabilityInCity.mockResolvedValueOnce(
      resp(
        [
          item(1, "가 도서관"),
          item(2, "나 도서관", { holding: "unknown", loanable: "unknown", fallback_reason: "limit", data_date: null }),
        ],
        "city"
      )
    );
    await renderDetail(BOY.isbn13);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByText(CITY_BTN));
    expect(await screen.findByText("총 2곳 중 확인 1곳 · 미확인 1곳")).toBeTruthy();
    expect(screen.getByText(LIMIT_UNCHECKED)).toBeTruthy();
    expect(screen.getByText("다시 시도")).toBeTruthy();
    expect(screen.queryByText("소장 없음")).toBeNull();
    expect(screen.queryByText(/대출 불가/)).toBeNull();
  });

  test("city retry refetches same region", async () => {
    fetchAvailabilityInCity.mockResolvedValueOnce(
      resp([item(2, "나 도서관", { holding: "unknown", loanable: "unknown" })], "city")
    );
    await renderDetail(BOY.isbn13);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByText(CITY_BTN));
    await fireEvent.press(await screen.findByText("다시 시도"));
    await screen.findByText("가 도서관");
    expect(fetchAvailabilityInCity).toHaveBeenCalledTimes(2);
    expect(fetchAvailabilityInCity.mock.calls[1]!.slice(0, 2)).toEqual([BOY.isbn13, "11010"]);
    expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(1);
    expect(fetchLibrary).toHaveBeenCalledTimes(1); // 다시 시도는 시군구를 다시 찾지 않고 같은 지역으로
  });

  test("city search button stays visible above nearby list", async () => {
    await renderDetail(BOY.isbn13);
    await screen.findByText("종로도서관");
    expect(screen.getByTestId("search-city")).toBeTruthy();
    expect(at(CITY_BTN)).toBeGreaterThan(-1);
    expect(at(CITY_BTN)).toBeLessThan(at("정독도서관"));
    expect(screen.queryByTestId("empty-availability")).toBeNull();
  });
});

describe("빈 결과", () => {
  test("empty nearby shows city retry and save", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(resp([]));
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText(EMPTY_NEARBY)).toBeTruthy();
    expect(screen.getByText("도시 전체 도서관에서 다시 찾기")).toBeTruthy();
    expect(screen.getByText("나중에 빌릴 책으로 저장")).toBeTruthy();
    expect(screen.queryByText(/없어요/)).toBeNull(); // "찾지 못했어요"로만, 없다고 단정하지 않음
    // 1순위 버튼은 도시 전체로 다시 찾기
    await fireEvent.press(screen.getByText("도시 전체 도서관에서 다시 찾기"));
    await waitFor(() => expect(fetchLibrariesNearby).toHaveBeenCalledTimes(1));
  });

  test("all no or unknown keeps cards below empty box", async () => {
    fetchAvailabilityNearby.mockResolvedValueOnce(
      resp([
        item(7, "정독도서관", { holding: "no", loanable: "no" }),
        item(8, "종로도서관", { holding: "unknown", loanable: "unknown" }),
      ])
    );
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText(EMPTY_NEARBY)).toBeTruthy();
    expect(screen.getByText("정독도서관")).toBeTruthy();
    expect(screen.getByText("종로도서관")).toBeTruthy();
    expect(at(EMPTY_NEARBY)).toBeLessThan(at("정독도서관"));
  });

  test("empty city offers region pick again", async () => {
    fetchAvailabilityInCity.mockResolvedValueOnce(resp([], "city"));
    await renderDetail(BOY.isbn13);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByText(CITY_BTN));
    expect(await screen.findByText(EMPTY_CITY)).toBeTruthy();
    await fireEvent.press(screen.getByText("지역 다시 고르기"));
    expect(screen.getByText(REGION_INTRO)).toBeTruthy();
  });
});

describe("위치 없이 지역 고르기", () => {
  test("location denied asks region", async () => {
    locate.mockResolvedValueOnce({ ok: false, reason: "denied" });
    await renderDetail(BOY.isbn13);
    expect(await screen.findByText(REGION_INTRO)).toBeTruthy();
    expect(fetchAvailabilityNearby).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("sido-서울특별시")); // 글자 없이 열면 시·도부터 (2026-11-20 문제 ④)
    await fireEvent.press(screen.getByTestId("region-11010"));
    expect(await screen.findByText("가 도서관")).toBeTruthy();
    expect(fetchAvailabilityInCity).toHaveBeenCalledWith(BOY.isbn13, "11010", expect.anything());
  });

  test("empty picker lists all 17 sido and a sido press lists its sigungu", async () => {
    locate.mockResolvedValueOnce({ ok: false, reason: "denied" });
    await renderDetail(BOY.isbn13);
    await screen.findByText(REGION_INTRO);
    expect(screen.getByTestId("sido-제주특별자치도")).toBeTruthy();
    expect(screen.getByTestId("sido-경기도")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sido-경기도"));
    expect(screen.getByTestId("region-31010")).toBeTruthy();
    expect(screen.getByTestId("region-31580")).toBeTruthy(); // 경기 뒤쪽 군도 잘리지 않는다
  });

  test("region picker filters regions and retries location", async () => {
    locate.mockResolvedValueOnce({ ok: false, reason: "timeout" });
    await renderDetail(BOY.isbn13);
    await screen.findByText(REGION_INTRO);
    await fireEvent.changeText(screen.getByTestId("region-input"), "종로");
    const expected = searchRegions("종로", 20).map((r) => r.label);
    expect(expected.length).toBeGreaterThan(0);
    for (const label of expected) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("서울특별시 중구")).toBeNull(); // 걸러진 지역은 안 보임

    await fireEvent.changeText(screen.getByTestId("region-input"), "없는지역이름");
    expect(screen.getByText(REGION_NO_MATCH)).toBeTruthy();

    // 위치를 허용하면 주변을 다시 찾는다
    requestLocationPermission.mockResolvedValueOnce("granted");
    await fireEvent.press(screen.getByText("위치 허용해서 주변 찾기"));
    expect(await screen.findByText("정독도서관")).toBeTruthy();
    expect(locate).toHaveBeenCalledTimes(2);
    expect(fetchAvailabilityNearby).toHaveBeenCalledTimes(1);
  });

  test("region picker tells the user when location is denied again (②-4)", async () => {
    locate.mockResolvedValueOnce({ ok: false, reason: "timeout" });
    await renderDetail(BOY.isbn13);
    await screen.findByText(REGION_INTRO);
    expect(screen.queryByText(REGION_LOCATION_DENIED)).toBeNull();
    requestLocationPermission.mockResolvedValueOnce("denied");
    await fireEvent.press(screen.getByText("위치 허용해서 주변 찾기"));
    expect(await screen.findByText(REGION_LOCATION_DENIED)).toBeTruthy();
    expect(screen.getByTestId("region-picker")).toBeTruthy();
  });

  test("region picker choose sends city request with code", async () => {
    locate.mockResolvedValueOnce({ ok: false, reason: "denied" });
    await renderDetail(BOY.isbn13);
    await screen.findByText(REGION_INTRO);
    await fireEvent.changeText(screen.getByTestId("region-input"), "종로");
    await fireEvent.press(screen.getByText("서울특별시 종로구"));
    await screen.findByText("가 도서관");
    expect(fetchAvailabilityInCity).toHaveBeenCalledWith(BOY.isbn13, "11010", expect.anything());
  });

  test("no location stored", async () => {
    const setItem = jest.mocked(AsyncStorage.setItem);
    await renderDetail(BOY.isbn13);
    await screen.findByText("정독도서관");
    await fireEvent.press(screen.getByText(CITY_BTN));
    await screen.findByText("가 도서관");
    await fireEvent.press(screen.getByText("내 주변 다시 보기"));
    await screen.findByText("정독도서관");
    await waitFor(() => expect(setItem).toHaveBeenCalled()); // 최근 본 도서는 저장된다(대조군)
    for (const [key, value] of setItem.mock.calls) {
      const written = `${key} ${value}`;
      expect(written).not.toContain(String(HERE.lat));
      expect(written).not.toContain(String(HERE.lng));
      expect(written).not.toMatch(/lat|lng|latitude|longitude/);
    }
  });
});
