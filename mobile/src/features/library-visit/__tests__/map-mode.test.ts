// 홈 지도 모드 계산(C-96 2차, 시안 홈_지도모드_v2_시안.html 채택 S·바닥 A)
import { describe, expect, test } from "@jest/globals";
import {
  MAP_INNER_PX,
  MAP_TILT,
  bearingDeg,
  boardRadius,
  gaugeKm,
  layoutMap,
  mapRings,
  movedCenter,
  placeLabel,
  squashR,
  toKm,
  toLatLng,
  type KmPoint,
  type Rect,
} from "../mapMode";

const W = 390;
const H = 400;
const CUBE = { w: 43, h: 46 };
const PLINTH = { w: 58, h: 44 };
// 광주 캡처(2026-11-26) 근사: 가장 가까운 곳이 현위치 바로 위(250M), 둘째도 같은 북북동
const GWANGJU: { item: string; at: KmPoint }[] = [
  { item: "중앙", at: { x: 0.12, y: 0.22 } },
  { item: "산수", at: { x: 0.3, y: 0.78 } },
  { item: "계림", at: { x: -0.55, y: 1.38 } },
  { item: "사직", at: { x: -0.95, y: -1.12 } },
];
const touches = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const plinthRect = (p: { x: number; y: number }): Rect => [p.x - 29, p.y - 22, p.x + 29, p.y + 22];
const angleGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("map mode math", () => {
  test("km offsets round-trip and point north/east", () => {
    const o = { lat: 35.146, lng: 126.923 };
    const p = toKm(o, { lat: 35.155, lng: 126.933 });
    expect(p.y).toBeCloseTo(0.995, 2); // 북쪽 약 1km
    expect(p.x).toBeGreaterThan(0.85); // 동쪽
    const back = toLatLng(o, p);
    expect(back.lat).toBeCloseTo(35.155, 6);
    expect(back.lng).toBeCloseTo(126.933, 6);
  });

  test("distance in the gauge voice", () => {
    expect(gaugeKm(0.841)).toBe("841M");
    expect(gaugeKm(1.5)).toBe("1.5KM");
    expect(gaugeKm(2)).toBe("2KM");
    expect(gaugeKm(12.4)).toBe("12KM");
  });

  test("distance is squashed by square root: inner margin for 0, board edge for the farthest", () => {
    const rMax = boardRadius(W, H);
    expect(rMax).toBeLessThanOrEqual(W / 2 - 28);
    expect(rMax * MAP_TILT).toBeLessThanOrEqual(H / 2 - 40 + 1e-9);
    expect(squashR(0, 1.5, rMax)).toBe(MAP_INNER_PX);
    expect(squashR(1.5, 1.5, rMax)).toBeCloseTo(rMax);
    expect(squashR(3, 1.5, rMax)).toBeCloseTo(rMax); // 더 멀면 판 끝
    // 같은 거리 차이라도 가까운 쪽을 더 벌린다
    expect(squashR(0.5, 1.5, rMax) - squashR(0.25, 1.5, rMax)).toBeGreaterThan(squashR(1.5, 1.5, rMax) - squashR(1.25, 1.5, rMax));
  });

  test("rings carry only round distances (user: just like 1.5KM)", () => {
    const rMax = boardRadius(W, H);
    expect(mapRings(1.49, rMax).map((g) => gaugeKm(g.km))).toEqual(["1.5KM", "500M"]);
    expect(mapRings(0.841, rMax).map((g) => gaugeKm(g.km))).toEqual(["500M", "200M"]);
    expect(mapRings(4.2, rMax).map((g) => gaugeKm(g.km))).toEqual(["3KM", "1.5KM"]);
    expect(mapRings(0.05, rMax)).toEqual([]);
    // 바깥 고리는 판 끝을 넘지 않는다
    expect(mapRings(1.49, rMax)[0]!.r).toBeLessThanOrEqual(rMax);
  });

  test("Gwangju capture: all four fit with no cube touching another or the plinth, directions stay close", () => {
    const L = layoutMap(GWANGJU, { center: { x: 0, y: 0 }, home: { x: 0, y: 0 }, W, H, cube: CUBE, plinth: PLINTH });
    expect(L.spots.map((s) => s.item)).toEqual(["중앙", "산수", "사직", "계림"]); // 가까운 순(사직 1.47KM < 계림 1.49KM)
    expect(L.home).toEqual({ x: W / 2, y: H / 2 });
    const rects = [plinthRect(L.home!), ...L.spots.map((s) => s.body)];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(touches(rects[i]!, rects[j]!)).toBe(false);
    for (const s of L.spots) {
      expect(s.body[0]).toBeGreaterThanOrEqual(0);
      expect(s.body[2]).toBeLessThanOrEqual(W);
      expect(s.body[1]).toBeGreaterThanOrEqual(0);
      expect(s.body[3]).toBeLessThanOrEqual(H);
      expect(Math.abs(s.turnedDeg)).toBeLessThanOrEqual(30);
      // 화면 방향(세로를 기울기만큼 되돌림)은 실제 방위에서 30° 안
      const real = bearingDeg(GWANGJU.find((g) => g.item === s.item)!.at);
      const seen = bearingDeg({ x: s.x - W / 2, y: (H / 2 - s.y) / MAP_TILT });
      expect(angleGap(real, seen)).toBeLessThanOrEqual(30.5);
    }
    // 같은 북북동의 가까운 곳(중앙)이 먼 곳(산수)보다 안쪽
    const r = (n: string) => {
      const s = L.spots.find((q) => q.item === n)!;
      return Math.hypot(s.x - W / 2, (s.y - H / 2) / MAP_TILT);
    };
    expect(r("중앙")).toBeLessThan(r("산수"));
    expect(L.farKm).toBeCloseTo(Math.hypot(-0.55, 1.38), 5);
  });

  test("dragged far away: the plinth leaves the board (locate button), drag converts with the edge scale", () => {
    const L = layoutMap(GWANGJU, { center: { x: 0, y: 0 }, home: { x: 0, y: 0 }, W, H, cube: CUBE, plinth: PLINTH });
    const c = movedCenter({ x: 0, y: 0 }, L.pxPerKm, 0, L.pxPerKm); // 판 끝 반지름만큼 오른쪽 → 가장 먼 곳 거리만큼 서쪽
    expect(c.x).toBeCloseTo(-1);
    // 멀리 끌면 서버는 새 가운데 근처를 준다
    const moved = GWANGJU.map((g) => ({ ...g, at: { x: g.at.x - 5, y: g.at.y } }));
    const far = layoutMap(moved, { center: { x: -5, y: 0 }, home: { x: 0, y: 0 }, W, H, cube: CUBE, plinth: PLINTH });
    expect(far.home).toBeNull();
    const near = layoutMap(GWANGJU, { center: { x: -0.01, y: 0 }, home: { x: 0, y: 0 }, W, H, cube: CUBE, plinth: PLINTH });
    expect(near.home!.x).toBeGreaterThan(W / 2); // 현위치는 가운데의 동쪽
    expect(near.home!.x - W / 2).toBeLessThan(30); // 조금 끌면 조금만
  });

  test("empty result draws nothing", () => {
    const L = layoutMap([], { center: { x: 0, y: 0 }, home: { x: 0, y: 0 }, W, H, cube: CUBE, plinth: PLINTH });
    expect(L.spots).toEqual([]);
    expect(L.rings).toEqual([]);
    expect(L.home).toEqual({ x: W / 2, y: H / 2 });
  });

  test("labels go above, then below, right, left, avoiding the plinth and other cubes", () => {
    const body: Rect = [100, 100, 140, 140];
    const taken: Rect[] = [];
    expect(placeLabel(body, 60, 28, taken).pos).toBe("above");
    // 위가 막히면 아래
    const blockedAbove: Rect[] = [[90, 60, 200, 99]];
    expect(placeLabel(body, 60, 28, blockedAbove).pos).toBe("below");
    // 위·아래가 막히면 오른쪽
    const blocked: Rect[] = [[90, 60, 200, 99], [90, 141, 200, 180]];
    expect(placeLabel(body, 60, 28, blocked).pos).toBe("right");
    // 고른 자리는 다음 이름표가 피한다
    expect(blocked.length).toBe(3);
  });
});
