// 홈 방위·큐브 배치 계산 (VISIT-1 V3·V18, 2026-11-18 "홈 큐브 배치")
import { describe, expect, test } from "@jest/globals";
import {
  assignSpineTones,
  computeBearingDeg,
  computeDistanceMeters,
  CUBE_H,
  CUBE_W,
  MAX_CUBES,
  facadeItems,
  formatCompassCode,
  heroScene,
  initialHeroId,
  pickByDrag,
  ringScale,
  ringScene,
  sectorOf,
  shownItems,
  type FacadeScene,
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

  test("only libraries with coordinates, nearest first, ties by id", () => {
    expect(facadeItems(C, [lib(1, null, null)])).toEqual([]);
    const r = facadeItems(C, [
      lib(5, C.lat + 0.02, C.lng + 0.02, { distance_m: 3000 }),
      lib(4, C.lat + 0.01, C.lng + 0.01, { distance_m: 1000 }),
      lib(3, C.lat + 0.01, C.lng + 0.01, { distance_m: 1000 }),
    ]);
    expect(r.map((it) => it.lib.id)).toEqual([3, 4, 5]);
    expect(r[0]!.code).toMatch(/^NE 0\d\d°$/);
  });

  test("invalid server distance falls back to straight line", () => {
    expect(facadeItems(C, [lib(1, C.lat + 0.01, C.lng, { distance_m: -5 })])[0]!.distanceM).toBeGreaterThan(1100);
  });

  test("tones: closed always, nearest open is fill1, then fill2 and fill3 alternate", () => {
    const items = facadeItems(C, [
      lib(1, C.lat + 0.01, C.lng + 0.01, { distance_m: 500, today: { date: "d", is_closed: true, hours_text: null, holiday_unchecked: false } }),
      lib(2, C.lat + 0.01, C.lng - 0.01, { distance_m: 900 }),
      lib(3, C.lat - 0.01, C.lng + 0.01, { distance_m: 1200 }),
      lib(4, C.lat - 0.01, C.lng - 0.01, { distance_m: 1800 }),
    ]);
    const t = assignSpineTones(items);
    expect([t.get(1), t.get(2), t.get(3), t.get(4)]).toEqual(["closed", "fill1", "fill2", "fill3"]);
  });

  test("first hero is the nearest by default, recent visit only when set and on the board", () => {
    const items = facadeItems(C, [lib(1, C.lat + 0.01, C.lng, { distance_m: 900 }), lib(2, C.lat, C.lng + 0.01, { distance_m: 400 })]);
    expect(initialHeroId(items, "nearest", 1)).toBe(2);
    expect(initialHeroId(items, "recent", 1)).toBe(1);
    expect(initialHeroId(items, "recent", 99)).toBe(2);
    expect(initialHeroId(items, "recent", null)).toBe(2);
    expect(initialHeroId([], "nearest", null)).toBeNull();
  });

  test("sectors: N 315-45, E 45-135, S, W; wide boards send north and south sideways", () => {
    expect([0, 44, 45, 134, 135, 224, 225, 314, 315].map((b) => sectorOf(b, 390, 325))).toEqual([
      "N", "N", "E", "E", "S", "S", "W", "W", "N",
    ]);
    expect(sectorOf(10, 844, 200)).toBe("E");
    expect(sectorOf(350, 844, 200)).toBe("W");
    expect(sectorOf(170, 844, 200)).toBe("E");
    expect(sectorOf(190, 844, 200)).toBe("W");
  });

  test("shown cubes are capped and always include the hero", () => {
    const many = facadeItems(
      C,
      Array.from({ length: 10 }, (_, i) => lib(i + 1, C.lat + 0.001 * (i + 1), C.lng, { distance_m: 100 * (i + 1) }))
    );
    expect(shownItems(many, 1)).toHaveLength(MAX_CUBES);
    const withFar = shownItems(many, 10);
    expect(withFar).toHaveLength(MAX_CUBES);
    expect(withFar.at(-1)!.lib.id).toBe(10);
  });
});

// 판 둘레 도서관: 북 0.4km · 동 0.9 · 남 1.3 · 서 2.1 · 북동 2.8
const around = () =>
  facadeItems(C, [
    lib(1, C.lat + 0.004, C.lng, { distance_m: 400 }),
    lib(2, C.lat, C.lng + 0.01, { distance_m: 900 }),
    lib(3, C.lat - 0.012, C.lng, { distance_m: 1300 }),
    lib(4, C.lat, C.lng - 0.023, { distance_m: 2100 }),
    lib(5, C.lat + 0.018, C.lng + 0.022, { distance_m: 2800 }),
  ]);
const heroOf = (s: FacadeScene) => s.cubes.find((c) => c.role === "hero")!;
const box = (c: { cx: number; cy: number; scale: number }) => ({
  l: c.cx - (CUBE_W * c.scale) / 2,
  r: c.cx + (CUBE_W * c.scale) / 2,
  t: c.cy - (CUBE_H * c.scale) / 2,
  b: c.cy + (CUBE_H * c.scale) / 2,
});
// 하단 창 위로 보이는 판: 390×844 웹 · 360×640 · 844×412 가로
const SIZES: [number, number][] = [
  [390, 325],
  [360, 220],
  [844, 200],
];

describe("cube layout", () => {
  test.each(SIZES)("hero north pushes the origin to the far side and grows big (%ix%i)", (W, H) => {
    const s = heroScene(around(), 1, W, H);
    const h = box(heroOf(s));
    if (sectorOf(0, W, H) === "N") {
      expect(s.origin).toEqual({ x: W / 2, y: H * 0.88 });
      expect(h.b).toBeLessThanOrEqual(s.origin.y - 22);
    } else {
      // 가로 화면: 북쪽도 동쪽 칸
      expect(s.origin.x).toBeCloseTo(W * 0.12);
      expect(h.l).toBeGreaterThanOrEqual(s.origin.x + 29);
    }
    expect(h.l).toBeGreaterThanOrEqual(6 - 0.01);
    expect(h.r).toBeLessThanOrEqual(W - 6 + 0.01);
    expect(h.t).toBeGreaterThanOrEqual(6 - 0.01);
    expect(heroOf(s).scale).toBeLessThanOrEqual(1.7);
  });

  test("hero east pushes the origin left and the hero fills the right", () => {
    const s = heroScene(around(), 2, 390, 325);
    expect(s.origin).toEqual({ x: 390 * 0.12, y: 325 / 2 });
    expect(box(heroOf(s)).l).toBeGreaterThan(s.origin.x + 29);
    expect(heroOf(s).scale).toBeGreaterThan(1.1); // 390 화면에서 폭 240px 넘게
  });

  test("hero west and south mirror it", () => {
    expect(heroScene(around(), 4, 390, 325).origin).toEqual({ x: 390 * 0.88, y: 325 / 2 });
    expect(heroScene(around(), 3, 390, 325).origin).toEqual({ x: 195, y: 325 * 0.12 });
  });

  test.each(SIZES)("other libraries perch on the edge with the name inside (%ix%i)", (W, H) => {
    const s = heroScene(around(), 1, W, H);
    const peeks = s.cubes.filter((c) => c.role === "peek");
    expect(peeks).toHaveLength(4);
    for (const p of peeks) {
      // 이름 자리 = 윗면 가운데(큐브 몸 가운데보다 35.6×배율 위)
      const ny = p.cy - 35.6 * p.scale;
      expect(p.cx).toBeGreaterThanOrEqual(20 - 0.01);
      expect(p.cx).toBeLessThanOrEqual(W - 20 + 0.01);
      expect(ny).toBeGreaterThanOrEqual(20 - 0.01);
      expect(ny).toBeLessThanOrEqual(H - 20 + 0.01);
      expect(p.scale).toBeGreaterThanOrEqual(0.45);
      expect(p.scale).toBeLessThanOrEqual(0.62);
    }
    expect(s.cubes.find((c) => c.id === 2)!.cx).toBeGreaterThan(W / 2); // 동쪽은 오른쪽 가장자리
    expect(s.cubes.find((c) => c.id === 4)!.cx).toBeLessThan(W / 2); // 서쪽은 왼쪽 가장자리
  });

  test("overview puts the origin in the middle and every cube the same size, about 46% of the width", () => {
    const s = ringScene(around(), 390, 325);
    expect(s.origin).toEqual({ x: 195, y: 162.5 });
    expect(new Set(s.cubes.map((c) => c.scale)).size).toBe(1);
    expect(s.cubes.every((c) => c.role === "ring")).toBe(true);
    expect((CUBE_W * ringScale(390, 325)) / 390).toBeCloseTo(0.46, 1);
    for (const c of s.cubes) {
      expect(c.cx).toBeGreaterThanOrEqual(24 - 0.01);
      expect(c.cx).toBeLessThanOrEqual(390 - 24 + 0.01);
    }
    const at = (id: number) => s.cubes.find((c) => c.id === id)!;
    expect(at(2).cx).toBeGreaterThan(195); // 동쪽은 기점 오른쪽
    expect(at(4).cx).toBeLessThan(195); // 서쪽은 왼쪽
    expect(at(3).cy).toBeGreaterThan(162.5); // 남쪽은 아래
  });

  test("drag picks the library opposite to the drag, only past 40px", () => {
    const items = around();
    expect(pickByDrag(items, 1, -60, 0)).toBe(2); // 왼쪽으로 끌면 동쪽
    expect(pickByDrag(items, 1, 60, 0)).toBe(4); // 오른쪽으로 끌면 서쪽
    expect(pickByDrag(items, 1, 0, -60)).toBe(3); // 위로 끌면 남쪽
    expect(pickByDrag(items, 1, -30, 0)).toBeNull(); // 덜 끌면 제자리
    expect(pickByDrag(items, 2, 0, 60)).toBe(1); // 아래로 끌면 북쪽, 주인공(2)은 빼고
  });
});
