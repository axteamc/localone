import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { apiFetch } from "../../auth/apiFetch";
import { createLatestRunner } from "../latest";
import { deviceStorage, locate, requestLocationPermission, openExternalUrl } from "../platform";
import { DEFAULT_START, STORAGE_KEYS } from "../policy";
import { REGIONS, searchRegions } from "../regions";
import * as api from "../publicApi";
import { recordVisit, getVisitRecord, getFrequentLibraries, markDefaultAsked, getDefaultLibrary, setDefaultLibrary, getLastRegion, setLastRegion } from "../visits";

jest.mock("../../auth/apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(), Accuracy: { Balanced: 3 },
}));
const mockApiFetch = jest.mocked(apiFetch);
const mockPermission = jest.mocked(Location.requestForegroundPermissionsAsync);
const mockServices = jest.mocked(Location.hasServicesEnabledAsync);
const mockPosition = jest.mocked(Location.getCurrentPositionAsync);
const mockLastKnown = jest.mocked(Location.getLastKnownPositionAsync);
const originalOS = Platform.OS;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const store = new Map<string, string>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function os(value: "web" | "ios" | "android") { Object.defineProperty(Platform, "OS", { value, configurable: true }); }
function nav(geolocation?: Partial<Geolocation>) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation } });
}
function json(status: number, value: unknown) { return new Response(JSON.stringify(value), { status }); }
beforeEach(() => {
  jest.resetAllMocks(); store.clear(); os("ios");
  jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => store.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { store.set(key, value); });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => { store.delete(key); });
  mockPermission.mockResolvedValue({ status: "granted" } as never);
  mockServices.mockResolvedValue(true);
  mockPosition.mockResolvedValue({ coords: { latitude: 37.5, longitude: 127 } } as never);
  mockLastKnown.mockResolvedValue(null);
});
afterEach(() => {
  jest.useRealTimers(); jest.restoreAllMocks();
  Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS });
  for (const [key, descriptor] of [["navigator", originalNavigator], ["localStorage", originalStorage], ["window", originalWindow]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("latest runner (AC-RACE)", () => {
  test("latest runner drops stale result", async () => {
    const runner = createLatestRunner(), first = deferred<number>(), second = deferred<number>();
    let signal!: AbortSignal;
    const a = runner.run((s) => { signal = s; return first.promise; });
    const b = runner.run(() => second.promise);
    second.resolve(2); expect(await b).toEqual({ status: "ok", value: 2 });
    first.resolve(1); expect(await a).toEqual({ status: "stale" });
    expect(signal.aborted).toBe(true);
  });
  test("latest runner cancel makes running stale", async () => {
    const runner = createLatestRunner(), pending = deferred<number>();
    const result = runner.run(() => pending.promise); runner.cancel(); pending.resolve(1);
    expect(await result).toEqual({ status: "stale" });
  });
  test("stale rejection cannot replace current error or value", async () => {
    const runner = createLatestRunner(), pending = deferred<number>();
    const stale = runner.run(() => pending.promise);
    const error = new Error("current");
    expect(await runner.run(async () => { throw error; })).toEqual({ status: "error", error });
    pending.reject(new Error("old")); expect(await stale).toEqual({ status: "stale" });
  });
});

describe("visits and persistence", () => {
  const day1 = new Date("2026-11-16T14:30:00Z");
  const day2 = new Date("2026-11-16T15:10:00Z");
  test("recordVisit counts once per Seoul day, including concurrent taps", async () => {
    const results = await Promise.all([recordVisit(1, day1), recordVisit(1, day1)]);
    expect(results.map((r) => r.counted)).toEqual([true, false]);
    expect(results[0]).toMatchObject({ isFirst: true, previousVisitedOn: null });
    expect(results[1]).toMatchObject({ isFirst: false, previousVisitedOn: "2026-11-16", record: { count: 1 } });
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });
  test("recordVisit uses Seoul date across UTC midnight", async () => {
    await recordVisit(1, day1);
    const next = await recordVisit(1, day2);
    expect(next).toMatchObject({ counted: true, isFirst: false, previousVisitedOn: "2026-11-16",
      record: { count: 2, streakDays: 2, firstVisitedOn: "2026-11-16", lastVisitedOn: "2026-11-17" } });
    expect((await recordVisit(1, new Date("2026-11-19T00:00:00Z"))).record.streakDays).toBe(1);
  });
  test("getFrequentLibraries order and limit", async () => {
    await Promise.all([recordVisit(4, day1), recordVisit(3, day1), recordVisit(2, day1), recordVisit(1, day1)]);
    await recordVisit(4, day2); await recordVisit(2, day2);
    expect((await getFrequentLibraries()).map((r) => r.libraryId)).toEqual([2, 4, 1]);
    await recordVisit(3, new Date("2026-11-18T00:00:00Z"));
    expect((await getFrequentLibraries(4)).map((r) => r.libraryId)).toEqual([3, 2, 4, 1]);
    expect(await getFrequentLibraries(0)).toEqual([]);
  });
  test.each(["{broken", "[]", '{"1":{"libraryId":1,"count":-1}}', '{"1":{"libraryId":1,"count":1,"streakDays":1,"firstVisitedOn":"2026-02-30","lastVisitedOn":"2026-02-30","defaultAsked":false}}'])
  ("broken storage json reads as empty and is not overwritten: %s", async (value) => {
    store.set(STORAGE_KEYS.visits, value);
    expect(await getFrequentLibraries()).toEqual([]); expect(await getVisitRecord(1)).toBeNull();
    expect(store.get(STORAGE_KEYS.visits)).toBe(value); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect((await recordVisit(1, day1)).record.count).toBe(1);
  });
  test("mark default asked survives later visits and default library can be removed", async () => {
    await recordVisit(1, day1); await markDefaultAsked(1); await recordVisit(1, day2);
    expect((await getVisitRecord(1))?.defaultAsked).toBe(true);
    await setDefaultLibrary(1); expect(await getDefaultLibrary()).toBe(1);
    expect(JSON.parse(store.get(STORAGE_KEYS.defaultLibrary)!)).toMatchObject({ libraryId: 1, setOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await setDefaultLibrary(null); expect(await getDefaultLibrary()).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("localone:default_library:v1");
    store.set(STORAGE_KEYS.defaultLibrary, '{"libraryId":1}');
    expect(await getDefaultLibrary()).toBeNull();
    expect(store.get(STORAGE_KEYS.defaultLibrary)).toBe('{"libraryId":1}');
  });
  test("last region keeps only a 5-digit code (C-68)", async () => {
    expect(await getLastRegion()).toBeNull();
    await setLastRegion("24040"); expect(await getLastRegion()).toBe("24040");
    expect(JSON.parse(store.get(STORAGE_KEYS.lastRegion)!)).toEqual({ code: "24040", setOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await setLastRegion("광주"); expect(await getLastRegion()).toBe("24040");
    store.set(STORAGE_KEYS.lastRegion, '{"code":"abc","setOn":"2026-11-18"}');
    expect(await getLastRegion()).toBeNull();
  });
  test("storage failure does not block the visit screen", async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValue(new Error("read"));
    jest.mocked(AsyncStorage.setItem).mockRejectedValue(new Error("quota"));
    jest.mocked(AsyncStorage.removeItem).mockRejectedValue(new Error("unavailable"));
    await expect(recordVisit(1, day1)).resolves.toMatchObject({
      counted: false,
      isFirst: false,
      previousVisitedOn: null,
    });
    await expect(setDefaultLibrary(null)).resolves.toBeUndefined();
  });
  test("failed first visit is not counted", async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("quota"));
    const result = await recordVisit(101, day1);
    expect(result).toMatchObject({
      counted: false,
      isFirst: false,
      previousVisitedOn: null,
      record: { libraryId: 101, count: 1, firstVisitedOn: "2026-11-16", lastVisitedOn: "2026-11-16" },
    });
    expect(store.get(STORAGE_KEYS.visits)).toBeUndefined();
    expect(await getVisitRecord(101)).toBeNull();
  });
  test("failed later visit returns prior record and queue recovers", async () => {
    await recordVisit(101, day1);
    await recordVisit(101, day2);
    const day3 = new Date("2026-11-18T00:00:00Z");
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("quota"));
    const [failed, retried] = await Promise.all([recordVisit(101, day3), recordVisit(101, day3)]);
    expect(failed).toEqual({
      counted: false,
      isFirst: false,
      previousVisitedOn: "2026-11-17",
      record: {
        libraryId: 101, count: 2, firstVisitedOn: "2026-11-16",
        lastVisitedOn: "2026-11-17", streakDays: 2, defaultAsked: false,
      },
    });
    expect(retried).toEqual({
      counted: true,
      isFirst: false,
      previousVisitedOn: "2026-11-17",
      record: {
        libraryId: 101, count: 3, firstVisitedOn: "2026-11-16",
        lastVisitedOn: "2026-11-18", streakDays: 3, defaultAsked: false,
      },
    });
    expect((await getVisitRecord(101))?.count).toBe(3);
  });
  test("storage keys are exact", () => {
    expect(STORAGE_KEYS.recentBooks("user-a")).toBe("recent_books:user-a");
    expect(STORAGE_KEYS.recentBooks(null)).toBe("recent_books:guest");
    expect(STORAGE_KEYS.visits).toBe("localone:visits:v1");
    expect(STORAGE_KEYS.defaultLibrary).toBe("localone:default_library:v1");
    expect(STORAGE_KEYS.lastRegion).toBe("localone:last_region:v1");
  });
  test("web storage persists through the common adapter", async () => {
    os("web");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key),
    } });
    await deviceStorage.setItem("test", "kept"); expect(await deviceStorage.getItem("test")).toBe("kept");
    await deviceStorage.removeItem("test"); expect(await deviceStorage.getItem("test")).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    Reflect.deleteProperty(globalThis, "localStorage");
    expect(await deviceStorage.getItem("test")).toBeNull();
    await expect(deviceStorage.setItem("test", "x")).rejects.toThrow();
  });
});

describe("foreground location and external URLs", () => {
  test("locate denied returns reason without throwing", async () => {
    mockPermission.mockResolvedValue({ status: "denied" } as never);
    expect(await locate(new AbortController().signal)).toEqual({ ok: false, reason: "denied" });
    expect(await requestLocationPermission()).toBe("denied");
    expect(mockPosition).not.toHaveBeenCalled(); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
  test("native allowed, services off and unavailable", async () => {
    expect(await requestLocationPermission()).toBe("granted");
    expect(await locate(new AbortController().signal)).toEqual({ ok: true, lat: 37.5, lng: 127 });
    expect(mockPosition).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Balanced });
    mockServices.mockResolvedValue(false);
    expect(await locate(new AbortController().signal)).toEqual({ ok: false, reason: "denied" });
    mockPermission.mockRejectedValue(new Error("native failed"));
    expect(await locate(new AbortController().signal)).toEqual({ ok: false, reason: "unavailable" });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
  test("native: recent last-known first, then fresh, then a stale fix within a day (P8 emulator/Android)", async () => {
    mockLastKnown.mockResolvedValueOnce({ coords: { latitude: 35.17, longitude: 126.92 } } as never);
    expect(await locate(new AbortController().signal)).toEqual({ ok: true, lat: 35.17, lng: 126.92 });
    expect(mockLastKnown).toHaveBeenLastCalledWith({ maxAge: 2 * 60_000 });
    expect(mockPosition).not.toHaveBeenCalled();
    // 새 위치가 오지 않으면 7초 뒤 하루 안의 마지막 위치
    jest.useFakeTimers();
    mockPosition.mockReturnValue(new Promise(() => undefined) as never);
    mockLastKnown.mockResolvedValueOnce(null).mockResolvedValueOnce({ coords: { latitude: 1, longitude: 2 } } as never);
    const result = locate(new AbortController().signal);
    await jest.advanceTimersByTimeAsync(7_000);
    expect(await result).toEqual({ ok: true, lat: 1, lng: 2 });
    expect(mockLastKnown).toHaveBeenLastCalledWith({ maxAge: 24 * 60 * 60_000 });
    expect(jest.getTimerCount()).toBe(0);
    // 마지막 위치도 없으면 unavailable
    mockLastKnown.mockResolvedValue(null);
    const none = locate(new AbortController().signal);
    await jest.advanceTimersByTimeAsync(7_000);
    expect(await none).toEqual({ ok: false, reason: "unavailable" });
  });
  test("native timeout and abort while permission is pending suppress late GPS", async () => {
    jest.useFakeTimers(); const pending = deferred<Location.LocationPermissionResponse>();
    mockPermission.mockReturnValue(pending.promise);
    const timeout = locate(new AbortController().signal);
    jest.advanceTimersByTime(10_000); expect(await timeout).toEqual({ ok: false, reason: "timeout" });
    const ctrl = new AbortController(), aborted = locate(ctrl.signal); ctrl.abort();
    expect(await aborted).toEqual({ ok: false, reason: "aborted" });
    pending.resolve({ status: "granted" } as never); await Promise.resolve();
    expect(mockPosition).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
    expect(await locate(ctrl.signal)).toEqual({ ok: false, reason: "aborted" });
  });
  test("web unavailable, allowed, denied and timeout", async () => {
    os("web"); nav();
    expect(await locate(new AbortController().signal)).toEqual({ ok: false, reason: "unavailable" });
    const getPosition = jest.fn<Geolocation["getCurrentPosition"]>(); nav({ getCurrentPosition: getPosition });
    getPosition.mockImplementation((ok) => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition));
    expect(await locate(new AbortController().signal)).toEqual({ ok: true, lat: 1, lng: 2 });
    expect(await requestLocationPermission()).toBe("granted");
    for (const [code, reason] of [[1, "denied"], [2, "unavailable"], [3, "timeout"]] as const) {
      getPosition.mockImplementation((_ok, fail) => fail?.({ code } as GeolocationPositionError));
      expect(await locate(new AbortController().signal)).toEqual({ ok: false, reason });
    }
    expect(getPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function),
      { timeout: 10_000, enableHighAccuracy: false, maximumAge: 0 });
    expect(mockPermission).not.toHaveBeenCalled();
  });
  test("openExternalUrl rejects non-http, uses Linking or web noopener", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    expect(await openExternalUrl("javascript:alert(1)")).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(await openExternalUrl("https://library.example/books")).toBe(true);
    open.mockRejectedValue(new Error("unavailable")); expect(await openExternalUrl("http://library.example")).toBe(false);
    os("web"); const webOpen = jest.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { open: webOpen } });
    expect(await openExternalUrl("https://library.example")).toBe(true);
    expect(webOpen).toHaveBeenCalledWith("https://library.example", "_blank", "noopener");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("public API contracts", () => {
  test("P8 place query stays in POST body and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    mockApiFetch.mockResolvedValue(json(200, { items: [] }));
    await expect(api.searchPlaces("충장로 우체국", signal)).resolves.toEqual({ items: [] });
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/places/search", {
      method: "POST", body: JSON.stringify({ query: "충장로 우체국" }),
      headers: { "Content-Type": "application/json" }, signal,
    });
  });
  test("publicApi maps server error to ApiCallError", async () => {
    mockApiFetch.mockResolvedValue(json(422, { error: { code: "VALIDATION_ERROR", message: "요청 형식이 올바르지 않아요.", detail: "lat,lng" } }));
    await expect(api.fetchLibrariesNearby(100, 200)).rejects.toMatchObject({ name: "ApiCallError", status: 422,
      code: "VALIDATION_ERROR", message: "요청 형식이 올바르지 않아요.", detail: "lat,lng" });
  });
  test("publicApi network failure is NETWORK", async () => {
    mockApiFetch.mockRejectedValue(new TypeError("network"));
    await expect(api.searchBooks("책")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });
  test("aborted fetch keeps cancellation for latest runner", async () => {
    const ctrl = new AbortController(); ctrl.abort(); const error = new Error("aborted");
    mockApiFetch.mockRejectedValue(error); await expect(api.fetchBook("123", ctrl.signal)).rejects.toBe(error);
  });
  test("all endpoint paths encode queries and forward abort signal", async () => {
    mockApiFetch.mockResolvedValue(json(200, { items: [] })); const signal = new AbortController().signal;
    const calls: [() => Promise<unknown>, string][] = [
      [() => api.searchBooks("책 & 제목", 21, signal), "books/search?q=%EC%B1%85%20%26%20%EC%A0%9C%EB%AA%A9&start=21"],
      [() => api.fetchBook("9788936433598", signal), "books/9788936433598"],
      [() => api.fetchRecommendations(undefined, signal), "books/recommendations"],
      [() => api.fetchRecommendations(1, signal), "books/recommendations?library_id=1"],
      [() => api.fetchLibrariesNearby(37, 127, undefined, signal), "libraries?lat=37&lng=127&radius_km=3"],
      [() => api.fetchLibrariesInRegion("11020", signal), "libraries?dtl_region=11020"],
      [() => api.searchLibrariesByName("a&b", signal), "libraries?q=a%26b"],
      [() => api.fetchLibrary(1, signal), "libraries/1"],
      [() => api.fetchAvailabilityNearby("123", 37, 127, 5, signal), "books/123/availability?scope=nearby&lat=37&lng=127&radius_km=5"],
      [() => api.fetchAvailabilityInCity("123", "11020", signal), "books/123/availability?scope=city&dtl_region=11020"],
      [() => api.fetchAvailabilityAt("123", 1, signal), "books/123/availability?library_id=1"],
      [() => api.fetchPurchaseLink("123", signal), "books/123/purchase-link"],
    ];
    for (const [call, path] of calls) {
      mockApiFetch.mockResolvedValueOnce(json(200, { items: [] }));
      await call(); expect(mockApiFetch).toHaveBeenLastCalledWith(`/api/v1/${path}`, { signal });
    }
  });
});

describe("official regions", () => {
  test("searchRegions partial and prefix first", () => {
    expect(searchRegions("종로")[0]).toEqual({ code: "11010", sido: "서울특별시", sigungu: "종로구", label: "서울특별시 종로구" });
    expect(searchRegions("중구")[0]?.code).toBe("11020");
    expect(searchRegions("서울")).toHaveLength(10); expect(searchRegions("", 10)).toEqual([]);
    expect(searchRegions("수원시 장안")[0]?.code).toBe("31011");
    expect(searchRegions("구", 1)[0]?.code).toBe("11170");
    expect(searchRegions("중구", 1)).toHaveLength(1);
  });
  test("official table retains 264 active codes, excludes obsolete and matches DEFAULT_START", () => {
    expect(REGIONS).toHaveLength(264); expect(new Set(REGIONS.map((r) => r.code)).size).toBe(264);
    expect(REGIONS.some((r) => ["23030", "37310"].includes(r.code))).toBe(false);
    expect(REGIONS.find((r) => r.code === DEFAULT_START.dtlRegion)?.label).toBe("서울특별시 중구");
    expect(REGIONS.find((r) => r.code === "22520")?.label).toBe("대구광역시 군위군");
    expect(REGIONS.find((r) => r.code === "39020")?.sigungu).toBe("서귀포시");
  });
});
