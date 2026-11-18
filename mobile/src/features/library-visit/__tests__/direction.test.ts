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

  // 360×220은 가로 판(가로 > 세로×1.6)이라 북쪽 주인공도 동쪽 칸 → 주인공이 오른쪽을 채워 동쪽 도서관의 오른쪽 자리가 막힌다.
  // PR 191 리뷰 수정(D 결정 "엄격"): 그때는 가장자리를 따라(아랫변으로 넘어가) 가장 가까운 빈자리로 간다.
  test.each([
    [390, 325, "right"],
    [360, 220, "bottom"],
    [844, 200, "right"],
  ] as const)("other libraries perch on the edge with the name inside (%ix%i)", (W, H, eastEdge) => {
    const s = heroScene(around(), 1, W, H);
    const peeks = s.cubes.filter((c) => c.role === "peek");
    expect(peeks).toHaveLength(4);
    for (const p of peeks) {
      // 이름 자리 = 윗면 가운데(큐브 몸 가운데보다 35.6×배율 위), V3: 판 안 24px
      const ny = p.cy - 35.6 * p.scale;
      expect(p.cx).toBeGreaterThanOrEqual(24 - 0.01);
      expect(p.cx).toBeLessThanOrEqual(W - 24 + 0.01);
      expect(ny).toBeGreaterThanOrEqual(24 - 0.01);
      expect(ny).toBeLessThanOrEqual(H - 24 + 0.01);
      expect(p.scale).toBeGreaterThanOrEqual(0.45);
      expect(p.scale).toBeLessThanOrEqual(0.62);
    }
    const east = s.cubes.find((c) => c.id === 2)!;
    if (eastEdge === "right") expect(east.cx).toBeGreaterThan(W / 2); // 동쪽은 오른쪽 가장자리
    else expect(east.cy - 35.6 * east.scale).toBeCloseTo(H - 24); // 오른쪽이 막혀 아랫변을 따라 비킴
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

// ── PR 191 리뷰 수정: 같은 방향 여러 곳의 겹침(2026-11-18, D 결정 "엄격 + 7곳 보류") ─────────────
// 영역 크기는 FacadeHome.tsx가 실제로 그리는 크기에서 가져온다.
// - 누르는 영역: IsoCube의 Pressable(styles.cubeHit = CUBE_W×CUBE_H = 220×206)을 Animated.View의 transform scale로
//   가운데 기준 확대·축소(FacadeHome.tsx styles.cube·cubeHit, left/top = cx−110, cy−103). 판(styles.board)은 overflow hidden이고
//   하단 창이 판 아래(H 밖)를 덮으므로 보이는 판 0..W × 0..H로 자른다. 주인공은 zIndex가 높아 겹친 곳을 가져간다.
// - 기점: styles.plinthWrap 58×44(FacadeHome.tsx PLINTH_W·PLINTH_H), 가운데 = origin.
// - 이름 영역: topTextWrap(192×60, 가운데 = 큐브 좌표 (110, 67.4) = 윗면 가운데) 안의 글자 상자
//   topFont(name, role, scale)의 width × (lines × fontSize × 1.2 lineHeight)를 transform
//   rotate(−30°)·skewX(30°)·scaleY(0.866)로 기울인 것. 이 변환은 글자 가로축을 (0.866, −0.5), 세로축을 (0.866, 0.5)로
//   보내므로 바깥 상자 = 0.866(w+h) × 0.5(w+h)(큐브 좌표), 화면에서는 × scale. 가운데 = (cx, cy − 35.6 × scale).
const PLINTH = { w: 58, h: 44 };
type Box = { l: number; t: number; r: number; b: number };
const clipTo = (W: number, H: number, x: Box): Box => ({ l: Math.max(0, x.l), t: Math.max(0, x.t), r: Math.min(W, x.r), b: Math.min(H, x.b) });
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const pressBox = (c: CubePlace, W: number, H: number) => clipTo(W, H, box(c));
const nameBox = (c: CubePlace, name: string, W: number, H: number): Box => {
  const fs = topFont(name, c.role, c.scale);
  const k = fs.width + fs.lines * fs.fontSize * 1.2;
  const hw = (0.866 * k * c.scale) / 2;
  const hh = (0.5 * k * c.scale) / 2;
  const y = c.cy - 35.6 * c.scale;
  return clipTo(W, H, { l: c.cx - hw, t: y - hh, r: c.cx + hw, b: y + hh });
};
const plinthBox = (s: FacadeScene): Box => ({
  l: s.origin.x - PLINTH.w / 2,
  t: s.origin.y - PLINTH.h / 2,
  r: s.origin.x + PLINTH.w / 2,
  b: s.origin.y + PLINTH.h / 2,
});
/** 같은 방위(동쪽 90°)에 100m 간격으로 n곳. 이름은 실제처럼 길이가 다르게 */
const sameWay = (n: number) =>
  facadeItems(
    C,
    Array.from({ length: n }, (_, i) =>
      lib(i + 1, C.lat, C.lng + 0.0009 * (i + 1), { distance_m: 100 * (i + 1), name: ["정독도서관", "종로", "어린이도서관", "남산도서관", "서울특별시교육청도서관", "삼청", "용산꿈나무도서관"][i]! })
    )
  );
/** 겹치는 쌍을 사람이 읽을 수 있게 모은다(빈 배열이면 통과) */
function collisions(s: FacadeScene, items: ReturnType<typeof sameWay>, W: number, H: number): string[] {
  const nameOf = new Map(items.map((it) => [it.lib.id, it.lib.name]));
  const press = s.cubes.map((c) => ({ id: `${c.role}#${c.id}`, box: pressBox(c, W, H) }));
  const all = [...press, { id: "origin", box: plinthBox(s) }];
  const out: string[] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const o = overlap(all[i]!.box, all[j]!.box);
      if (o > 1e-6) out.push(`press ${all[i]!.id} × ${all[j]!.id} = ${o.toFixed(1)}px²`);
    }
  for (const c of s.cubes) {
    if (c.role === "hero") continue;
    const nb = nameBox(c, nameOf.get(c.id)!, W, H);
    for (const other of all) {
      if (other.id === `${c.role}#${c.id}`) continue;
      const o = overlap(nb, other.box);
      if (o > 1e-6) out.push(`name ${c.role}#${c.id} × ${other.id} = ${o.toFixed(1)}px²`);
    }
  }
  return out;
}
// 844×412 가로 화면: 하단 창 평소 높이 위로 보이는 판이 약 120px(V18, 진행_L2_홈큐브.md)
const STRICT_CASES: [string, number, number, number][] = [
  ["hero", 390, 325, 3],
  ["hero", 844, 120, 3],
  ["hero", 844, 120, 7],
  ["ring", 390, 325, 3],
  ["ring", 390, 325, 4],
  ["ring", 844, 120, 3],
  ["ring", 844, 120, 6],
];
// 판에 7곳이 무겹침으로 다 들어가지 않는 경우(2026-11-18 D 결정 확정: 지금대로 유지):
// 들어가는 앞부분(fit개)은 이름·누름·기점이 겹치지 않고, 초과 큐브도 포개지 않고 최소 겹침으로 분산하며(중심 거리 >= minDist),
// 모든 큐브가 이름(24px)·가장자리 걸침 규칙을 지킨다.
const OVERFLOW_CASES: [string, number, number, number, number, number][] = [
  ["hero", 390, 325, 7, 3, 120],
  ["ring", 390, 325, 7, 4, 35],
  ["ring", 844, 120, 7, 6, 100],
];
const sceneOf = (mode: string, items: ReturnType<typeof sameWay>, W: number, H: number) =>
  mode === "hero" ? heroScene(items, items[0]!.lib.id, W, H) : ringScene(items, W, H);

function assertInsideAndClipped(s: FacadeScene, W: number, H: number) {
  for (const c of s.cubes) {
    if (c.role === "hero") continue;
    // V3: 이름(윗면 가운데)은 판 안 24px
    expect(c.cx).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(c.cx).toBeLessThanOrEqual(W - 24 + 1e-6);
    expect(c.cy - 35.6 * c.scale).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(c.cy - 35.6 * c.scale).toBeLessThanOrEqual(H - 24 + 1e-6);
    // V3: 걸친 큐브는 가장자리에서 잘린다(큐브 상자가 보이는 판 밖으로 나간다)
    if (c.role === "peek") {
      const b = box(c);
      expect(b.l < 0 || b.t < 0 || b.r > W || b.b > H).toBe(true);
    }
  }
}

describe("same-direction libraries do not overlap (review fix)", () => {
  test.each(STRICT_CASES)("%s %ix%i, %i libraries due east: names and press areas clear of each other, the hero and the origin", (mode, W, H, n) => {
    const items = sameWay(n);
    const s = sceneOf(mode, items, W, H);
    expect(s.cubes).toHaveLength(n);
    expect(collisions(s, items, W, H)).toEqual([]);
    assertInsideAndClipped(s, W, H);
  });

  test.each(OVERFLOW_CASES)(
    "%s %ix%i, %i libraries due east (overflow): first %i clear, all keep 24px inset and >= %ipx center gap",
    (mode, W, H, n, fit, minDist) => {
      const items = sameWay(n);
      const s = sceneOf(mode, items, W, H);
      expect(s.cubes).toHaveLength(n);
      assertInsideAndClipped(s, W, H);
      // 들어가는 앞부분(fit개)은 이름·누름·기점 무겹침
      expect(collisions({ origin: s.origin, cubes: s.cubes.slice(0, fit) }, items.slice(0, fit), W, H)).toEqual([]);
      // 주인공 모드에서는 걸친 큐브끼리도·기점과도 겹치지 않는다
      if (mode === "hero") {
        expect(collisions({ origin: s.origin, cubes: s.cubes.filter((c) => c.role === "peek") }, items.slice(1), W, H)).toEqual([]);
      }
      // 어떤 두 큐브도 같은 자리에 포개지지 않는다(중심 거리 >= minDist)
      for (let i = 0; i < s.cubes.length; i++) {
        for (let j = i + 1; j < s.cubes.length; j++) {
          const a = s.cubes[i]!;
          const b = s.cubes[j]!;
          expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(minDist);
        }
      }
    }
  );

  test("three due east at 390x325: the nearest stays on the east edge when its spot is free", () => {
    // 주인공 북쪽(북쪽 0.1km 하나 + 동쪽 둘): 동쪽 둘은 오른쪽 가장자리 아래 구석과 그 둘레를 따라 놓인다
    const items = facadeItems(C, [
      lib(1, C.lat + 0.0009, C.lng, { distance_m: 100 }),
      lib(2, C.lat, C.lng + 0.0018, { distance_m: 200 }),
      lib(3, C.lat, C.lng + 0.0027, { distance_m: 300 }),
    ]);
    const s = heroScene(items, 1, 390, 325);
    expect(collisions(s, items, 390, 325)).toEqual([]);
    expect(s.cubes.find((c) => c.id === 2)!.cx).toBeCloseTo(390 - 24); // 가장 가까운 동쪽은 오른쪽 가장자리 그대로
  });

  test("three due east at 390x325 with east hero: peeks wrap cleanly to the opposite edge without collision (D accepted)", () => {
    const items = sameWay(3);
    const s = heroScene(items, 1, 390, 325);
    expect(collisions(s, items, 390, 325)).toEqual([]);
    for (const p of s.cubes.filter((c) => c.role === "peek")) {
      expect(p.cx).toBeLessThan(390 / 2); // 오른쪽 가장자리가 막혀 서쪽 가장자리 위·아래 구석으로 이동
    }
  });
});
