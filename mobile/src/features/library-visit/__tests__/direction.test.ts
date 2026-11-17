// 시안 C 홈 방위·배치 계산 (VISIT-1 총정리 §3.1·§3.2)
import { describe, expect, test } from "@jest/globals";
import {
  assignSpineTones,
  computeBearingDeg,
  computeDistanceMeters,
  formatCompassCode,
  groupLibrariesForFacade,
} from "../direction";
import type { LibrarySummary } from "../deps";

const C = { lat: 37.5665, lng: 126.978 };
const lib = (id: number, lat: number | null, lng: number | null, over: Partial<LibrarySummary> = {}): LibrarySummary => ({
  id,
  name: `도서관${id}`,
  address: null,
  latitude: lat,
  longitude: lng,
  dtl_region_code: null,
  area_label: null,
  distance_m: null,
  today: { date: "2026-11-17", is_closed: false, hours_text: null, holiday_unchecked: false },
  ...over,
});

describe("direction", () => {
  test("bearing follows true north clockwise", () => {
    expect(computeBearingDeg(C, { lat: C.lat + 0.01, lng: C.lng })).toBeCloseTo(0, 0);
    expect(computeBearingDeg(C, { lat: C.lat, lng: C.lng + 0.01 })).toBeCloseTo(90, 0);
    expect(computeBearingDeg(C, { lat: C.lat - 0.01, lng: C.lng })).toBeCloseTo(180, 0);
    expect(computeBearingDeg(C, { lat: C.lat, lng: C.lng - 0.01 })).toBeCloseTo(270, 0);
  });

  test("haversine distance is about 1.1km per 0.01 degree latitude", () => {
    const d = computeDistanceMeters(C, { lat: C.lat + 0.01, lng: C.lng });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
    expect(computeDistanceMeters(C, C)).toBe(0);
  });

  test("compass code is 8 sector name plus 3 digit degree", () => {
    expect(formatCompassCode(315)).toBe("NW 315°");
    expect(formatCompassCode(42)).toBe("NE 042°");
    expect(formatCompassCode(0)).toBe("N 000°");
    expect(formatCompassCode(359.6)).toBe("N 000°");
    expect(formatCompassCode(-45)).toBe("NW 315°");
  });

  test("no coordinates means empty", () => {
    expect(groupLibrariesForFacade(C, [lib(1, null, null)])).toEqual({ kind: "empty", groups: [] });
    expect(groupLibrariesForFacade(C, [])).toEqual({ kind: "empty", groups: [] });
  });

  test("one library is a single wide block", () => {
    const r = groupLibrariesForFacade(C, [lib(1, C.lat + 0.01, C.lng)]);
    expect(r.kind).toBe("single");
    expect(r.groups.map((g) => g.slot)).toEqual(["MAIN"]);
  });

  test("two libraries split west and east by longitude", () => {
    const r = groupLibrariesForFacade(C, [lib(1, C.lat, C.lng + 0.02), lib(2, C.lat + 0.01, C.lng - 0.02)]);
    expect(r.kind).toBe("dual");
    expect(r.groups.map((g) => [g.slot, g.items[0]!.lib.id])).toEqual([
      ["W", 2],
      ["E", 1],
    ]);
  });

  test("three or more use quadrants, nearest first, ties by id, and skip empty quadrants", () => {
    const r = groupLibrariesForFacade(C, [
      lib(5, C.lat + 0.02, C.lng + 0.02, { distance_m: 3000 }), // NE
      lib(3, C.lat + 0.01, C.lng + 0.01, { distance_m: 1000 }), // NE (더 가까움)
      lib(4, C.lat + 0.01, C.lng + 0.01, { distance_m: 1000 }), // NE 동률 → id 순
      lib(6, C.lat - 0.01, C.lng - 0.01, { distance_m: 1500 }), // SW
    ]);
    expect(r.kind).toBe("quad");
    expect(r.groups.map((g) => g.slot)).toEqual(["NE", "SW"]);
    expect(r.groups[0]!.items.map((i) => i.lib.id)).toEqual([3, 4, 5]);
  });

  test("invalid server distance falls back to straight line", () => {
    const r = groupLibrariesForFacade(C, [lib(1, C.lat + 0.01, C.lng, { distance_m: -5 })]);
    expect(r.groups[0]!.items[0]!.distanceM).toBeGreaterThan(1100);
  });

  test("spine tones: closed first, nearest open is fill1, then fill2 and fill3 alternate", () => {
    const r = groupLibrariesForFacade(C, [
      lib(1, C.lat + 0.01, C.lng + 0.01, { distance_m: 500, today: { date: "d", is_closed: true, hours_text: null, holiday_unchecked: false } }),
      lib(2, C.lat + 0.01, C.lng - 0.01, { distance_m: 900 }),
      lib(3, C.lat - 0.01, C.lng + 0.01, { distance_m: 1200 }),
      lib(4, C.lat - 0.01, C.lng - 0.01, { distance_m: 1800 }),
    ]);
    const t = assignSpineTones(r);
    expect([t.get(1), t.get(2), t.get(3), t.get(4)]).toEqual(["closed", "fill1", "fill2", "fill3"]);
  });
});
