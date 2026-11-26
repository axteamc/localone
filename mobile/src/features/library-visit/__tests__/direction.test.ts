// 홈 방위·큐브 배치 계산 (VISIT-1 V3·V18, 2026-11-18 "홈 큐브 배치" · 2026-11-19 홈 큐브 개편 E1-A·E2-2·E3-2)
import { describe, expect, test } from "@jest/globals";
import {
  assignSpineTones,
  paletteIndexOf,
  computeBearingDeg,
  computeDistanceMeters,
  CUBE_H,
  CUBE_W,
  HERO_W_F,
  MAX_CUBES,
  PEEK_MAX,
  PEEK_RATIO,
  facadeItems,
  formatCompassCode,
  heroScene,
  initialHeroId,
  pickByDrag,
  pickByDragScene,
  ringScale,
  ringScene,
  sectorOf,
  shownItems,
  type CubePlace,
  type FacadeScene,
} from "../direction";
import type { LibrarySummary } from "../deps";
import { topFont } from "../FacadeHome";

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

  test("tones: closed always, open ones get a fixed palette color by id, no repeats on the board", () => {
    const closed = { date: "d", is_closed: true, hours_text: null, holiday_unchecked: false };
    const libs = [lib(1, C.lat + 0.01, C.lng + 0.01, { distance_m: 500, today: closed })];
    for (let id = 2; id <= 8; id++) libs.push(lib(id, C.lat + 0.001 * id, C.lng, { distance_m: 300 * id }));
    const t = assignSpineTones(facadeItems(C, libs), 20);
    expect(t.get(1)).toBe("closed");
    const open = [2, 3, 4, 5, 6, 7, 8].map((id) => t.get(id) as number);
    expect(open.every((v) => Number.isInteger(v) && v >= 0 && v < 20)).toBe(true);
    expect(new Set(open).size).toBe(7);
    // 같은 도서관은 다시 불러도 같은 색(맨 앞이라 해시 그대로)
    expect(t.get(2)).toBe(paletteIndexOf(2, 20));
    expect(assignSpineTones(facadeItems(C, libs), 20)).toEqual(t);
  });

  test("tones: more libraries than colors reuse the palette instead of looping forever", () => {
    const libs = [1, 2, 3, 4, 5].map((id) => lib(id, C.lat + 0.001 * id, C.lng, { distance_m: 100 * id }));
    const t = assignSpineTones(facadeItems(C, libs), 3);
    expect([...t.values()].every((v) => typeof v === "number" && v < 3)).toBe(true);
    expect(new Set([1, 2, 3].map((id) => t.get(id))).size).toBe(3);
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
// 하단 창 위로 보이는 판: 390×844 웹(390×325) · 375×667(375×220) · 844×412 가로(844×120)
const HERO_SIZES: [number, number][] = [
  [390, 325],
  [375, 220],
  [844, 120],
];
/** 큐브 상자가 보이는 판(0..W × 0..H) 밖으로 나간 넓이 비율 */
const clippedShare = (c: CubePlace, W: number, H: number) => {
  const b = box(c);
  const vis = Math.max(0, Math.min(W, b.r) - Math.max(0, b.l)) * Math.max(0, Math.min(H, b.b) - Math.max(0, b.t));
  return 1 - vis / ((b.r - b.l) * (b.b - b.t));
};

describe("cube layout", () => {
  test.each(HERO_SIZES)("E2-2: hero is 77%% of the width unless the height (94%%) limits it (%ix%i)", (W, H) => {
    const s = heroScene(around(), 1, W, H);
    const hero = heroOf(s);
    const want = Math.max(0.55, Math.min((W * HERO_W_F) / CUBE_W, (H * 0.94) / CUBE_H, 1.7));
    expect(hero.scale).toBeCloseTo(want);
    expect(hero.scale).toBeLessThanOrEqual(1.7);
    // 기점 받침(58×44)은 판 안에 다 보인다
    expect(s.origin.x - 29).toBeGreaterThanOrEqual(0);
    expect(s.origin.x + 29).toBeLessThanOrEqual(W);
    expect(s.origin.y - 22).toBeGreaterThanOrEqual(0);
    expect(s.origin.y + 22).toBeLessThanOrEqual(H);
  });

  test("E2-2 at 390x325: hero fits the height (2026-11-25 mac: 폭 86%까지)", () => {
    const hero = heroOf(heroScene(around(), 1, 390, 325));
    expect(hero.scale).toBeCloseTo((325 * 0.94) / CUBE_H, 2); // 폭 86%(1.52)보다 높이 94%가 먼저 닿는다
    expect(Math.round(CUBE_W * hero.scale)).toBe(326);
    expect(heroOf(heroScene(around(), 1, 375, 220)).scale).toBeCloseTo((220 * 0.94) / CUBE_H);
  });

  test("hero leans toward its direction and the origin sits in the opposite corner", () => {
    const north = heroScene(around(), 1, 390, 325);
    expect(north.origin.y).toBeGreaterThan(heroOf(north).cy);
    expect(north.origin.y).toBeCloseTo(Math.min(325 * 0.94 - 6, 325 - 22 - 8)); // 받침이 판 안에 남게 잘린다
    const east = heroScene(around(), 2, 390, 325);
    expect(east.origin.x).toBeCloseTo(390 * 0.06 + 12);
    expect(heroOf(east).cx).toBeGreaterThan(195);
    const west = heroScene(around(), 4, 390, 325);
    expect(west.origin.x).toBeCloseTo(390 * 0.94 - 12);
    expect(heroOf(west).cx).toBeLessThan(195);
    const south = heroScene(around(), 3, 390, 325);
    expect(south.origin.y).toBeLessThan(heroOf(south).cy);
  });

  test.each(HERO_SIZES)("E1-A: three neighbors at 0.88x the hero, in three different corners, mostly off the board (%ix%i)", (W, H) => {
    const s = heroScene(around(), 1, W, H);
    const hero = heroOf(s);
    const peeks = s.cubes.filter((c) => c.role === "peek");
    expect(peeks).toHaveLength(PEEK_MAX);
    expect(new Set(peeks.map((p) => p.id)).size).toBe(PEEK_MAX);
    const corners = new Set(peeks.map((p) => `${p.cx < W / 2 ? "L" : "R"}${p.cy < H / 2 ? "T" : "B"}`));
    expect(corners.size).toBe(PEEK_MAX);
    for (const p of peeks) {
      expect(p.scale).toBeCloseTo(hero.scale * PEEK_RATIO);
      // 시안 E1-A 자리 그대로(상자 넓이 기준): 위 모서리는 약 67~69%, 아래 모서리는 윗면 위쪽 끝만 보여 약 86% 잘린다
      const cut = clippedShare(p, W, H);
      if (p.cy < H / 2) {
        expect(cut).toBeGreaterThanOrEqual(0.6);
        expect(cut).toBeLessThanOrEqual(0.72);
      } else {
        expect(cut).toBeGreaterThanOrEqual(0.8);
        expect(cut).toBeLessThanOrEqual(0.9);
      }
    }
    // 이웃끼리는 누르는 영역(판 안)이 겹치지 않는다
    for (let i = 0; i < peeks.length; i++)
      for (let j = i + 1; j < peeks.length; j++) {
        const a = box(peeks[i]!);
        const b = box(peeks[j]!);
        const o =
          Math.max(0, Math.min(a.r, b.r, W) - Math.max(a.l, b.l, 0)) * Math.max(0, Math.min(a.b, b.b, H) - Math.max(a.t, b.t, 0));
        expect(o).toBe(0);
      }
  });

  test("E1-A: the corner nearest the origin stays empty and each corner takes the library closest to its direction", () => {
    // 북쪽 주인공: 기점은 왼쪽 아래 → 그 모서리는 비우고, 오른쪽 위 = 북동(5), 왼쪽 위 = 서(4), 오른쪽 아래 = 동(2)
    const s = heroScene(around(), 1, 390, 325);
    const at = (id: number) => s.cubes.find((c) => c.id === id);
    expect(s.origin.x).toBeLessThan(195);
    expect(at(5)!.cx).toBeGreaterThan(195);
    expect(at(5)!.cy).toBeLessThan(162.5);
    expect(at(4)!.cx).toBeLessThan(195);
    expect(at(4)!.cy).toBeLessThan(162.5);
    expect(at(2)!.cx).toBeGreaterThan(195);
    expect(at(2)!.cy).toBeGreaterThan(162.5);
    expect(at(3)).toBeUndefined(); // 7곳 중 나머지는 전체 보기에서
  });

  test("fewer libraries: as many neighbors as there are, none when alone", () => {
    const two = around().slice(0, 2);
    expect(heroScene(two, 1, 390, 325).cubes.filter((c) => c.role === "peek")).toHaveLength(1);
    expect(heroScene(two.slice(0, 1), 1, 390, 325).cubes).toHaveLength(1);
    expect(heroScene([], 1, 390, 325).cubes).toHaveLength(0);
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

  test("hero mode drag brings in the neighbor shown on the screen side first, real bearing otherwise", () => {
    const items = around();
    const s = heroScene(items, 1, 390, 325);
    // 왼쪽으로 끌면 오른쪽 위 모서리의 북동(5)이 온다(실제 방위만 보면 동쪽 2)
    expect(pickByDrag(items, 1, -60, 0)).toBe(2);
    expect(pickByDragScene(s, items, 1, -60, 0)).toBe(5);
    // 위로 끌면 오른쪽 아래 모서리의 동(2)
    expect(pickByDragScene(s, items, 1, 0, -60)).toBe(2);
    // 덜 끌면 제자리
    expect(pickByDragScene(s, items, 1, -30, 0)).toBeNull();
    // 걸친 이웃이 없으면 실제 방위
    const alone = { origin: s.origin, cubes: s.cubes.filter((c) => c.role === "hero") };
    expect(pickByDragScene(alone, items, 1, 0, -60)).toBe(3);
  });
});

// ── 전체 보기: 같은 방향 여러 곳의 겹침(PR 191 리뷰 수정, 2026-11-18 D 결정 "엄격 + 7곳 보류") ─────────────
// 영역 크기는 FacadeHome.tsx가 실제로 그리는 크기에서 가져온다.
// - 누르는 영역: IsoCube의 Pressable(220×206)을 가운데 기준 scale, 보이는 판 0..W × 0..H로 자른 것.
// - 기점: 58×44, 가운데 = origin.
// - 이름(2026-11-19 E3-2: 윗면 왼쪽 아래)은 윗면 마름모 안(overflow hidden)이라 누르는 영역끼리 겹치지 않으면 가리지 않는다.
// 주인공 모드(E1-A)는 이웃이 모서리에 크게 잘려 걸치고 주인공이 위에 그려지므로 이 검사를 하지 않는다(위 "cube layout").
const PLINTH = { w: 58, h: 44 };
type Box = { l: number; t: number; r: number; b: number };
const clipTo = (W: number, H: number, x: Box): Box => ({ l: Math.max(0, x.l), t: Math.max(0, x.t), r: Math.min(W, x.r), b: Math.min(H, x.b) });
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const plinthBox = (s: FacadeScene): Box => ({
  l: s.origin.x - PLINTH.w / 2,
  t: s.origin.y - PLINTH.h / 2,
  r: s.origin.x + PLINTH.w / 2,
  b: s.origin.y + PLINTH.h / 2,
});
/** 같은 방위(동쪽 90°)에 100m 간격으로 n곳 */
const sameWay = (n: number) =>
  facadeItems(
    C,
    Array.from({ length: n }, (_, i) => lib(i + 1, C.lat, C.lng + 0.0009 * (i + 1), { distance_m: 100 * (i + 1) }))
  );
/** 겹치는 쌍을 사람이 읽을 수 있게 모은다(빈 배열이면 통과) */
function collisions(s: FacadeScene, W: number, H: number): string[] {
  const all = [...s.cubes.map((c) => ({ id: `${c.role}#${c.id}`, box: clipTo(W, H, box(c)) })), { id: "origin", box: plinthBox(s) }];
  const out: string[] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const o = overlap(all[i]!.box, all[j]!.box);
      if (o > 1e-6) out.push(`press ${all[i]!.id} × ${all[j]!.id} = ${o.toFixed(1)}px²`);
    }
  return out;
}
function assertNameInside(s: FacadeScene, W: number, H: number) {
  for (const c of s.cubes) {
    // V3: 전체 보기 큐브의 윗면 가운데는 판 안 24px
    expect(c.cx).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(c.cx).toBeLessThanOrEqual(W - 24 + 1e-6);
    expect(c.cy - 35.6 * c.scale).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(c.cy - 35.6 * c.scale).toBeLessThanOrEqual(H - 24 + 1e-6);
  }
}

describe("overview: same-direction libraries do not overlap (review fix)", () => {
  test.each([
    [390, 325, 3],
    [390, 325, 4],
    [844, 120, 3],
    [844, 120, 6],
  ])("ring %ix%i, %i libraries due east: press areas clear of each other and the origin", (W, H, n) => {
    const s = ringScene(sameWay(n), W, H);
    expect(s.cubes).toHaveLength(n);
    expect(collisions(s, W, H)).toEqual([]);
    assertNameInside(s, W, H);
  });

  test.each([
    [390, 325, 7, 4, 35],
    [844, 120, 7, 6, 100],
  ])("ring %ix%i, %i due east (overflow): first %i clear, all keep 24px inset and >= %ipx center gap", (W, H, n, fit, minDist) => {
    const s = ringScene(sameWay(n), W, H);
    expect(s.cubes).toHaveLength(n);
    assertNameInside(s, W, H);
    expect(collisions({ origin: s.origin, cubes: s.cubes.slice(0, fit) }, W, H)).toEqual([]);
    for (let i = 0; i < s.cubes.length; i++)
      for (let j = i + 1; j < s.cubes.length; j++) {
        const a = s.cubes[i]!;
        const b = s.cubes[j]!;
        expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(minDist);
      }
  });
});

// ── 윗면 이름 크기(2026-11-19 E3-2, 기준 ewm 대비 -10%) ─────────────────────
describe("top name size (E3-2)", () => {
  test("two letters: 30.6 base, small letters 0.38x (min 9)", () => {
    const f = topFont("사직", "어린이");
    expect(f.fontSize).toBeCloseTo(30.6);
    expect(f.lines).toBe(1);
    expect(f.text).toBe("사직");
    expect(f.smallSize).toBeCloseTo(30.6 * 0.38);
    expect(f.lineHeight).toBeCloseTo(30.6 * 1.08);
    expect(topFont("사직").smallSize).toBe(0);
  });

  test("longer names shrink to fit; 6 letters or more go to two lines split front-heavy", () => {
    expect(topFont("푸른길").fontSize).toBeCloseTo(67.5 / 2.76);
    expect(topFont("효천어울림").fontSize).toBeCloseTo(67.5 / 4.6);
    const six = topFont("학생독립운동");
    expect(six.lines).toBe(2);
    expect(six.text).toBe("학생독\n립운동");
    expect(six.fontSize).toBeCloseTo(19.8);
    const seven = topFont("어린이생태학습");
    expect(seven.text).toBe("어린이생\n태학습");
    expect(seven.fontSize).toBeCloseTo(67.5 / (4.6 * 0.92));
    expect(topFont("가나다라마바사아자차카타파하").fontSize).toBeGreaterThanOrEqual(10);
    expect(topFont("가", "작은").smallSize).toBe(Math.max(9, topFont("가").fontSize * 0.38));
  });
});
