// 홈 지도 모드 계산(C-96, 시안 홈_지도모드_시안.html 채택안 C)
import { describe, expect, test } from "@jest/globals";
import {
  BAR_MAX_PX,
  MAP_TILT,
  gaugeKm,
  movedCenter,
  niceRadius,
  offBoard,
  placeLabel,
  pxPerKm,
  scaleBar,
  toKm,
  toLatLng,
  toScreen,
  type Rect,
} from "../mapMode";

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

  test("radius is the smallest step that holds the farthest of the five", () => {
    expect(niceRadius(1.42)).toBe(1.5);
    expect(niceRadius(0.52)).toBe(0.75);
    expect(niceRadius(0.013)).toBe(0.2);
    expect(niceRadius(12.4)).toBe(15);
    expect(niceRadius(80)).toBe(80); // 단계보다 멀면 그대로
  });

  test("the radius fits the board both across and (tilted) down", () => {
    const W = 390;
    const H = 400;
    const ppk = pxPerKm(1.5, W, H);
    expect(1.5 * ppk).toBeLessThanOrEqual(W / 2 - 28 + 1e-9);
    expect(1.5 * ppk * MAP_TILT).toBeLessThanOrEqual(H / 2 - 40 + 1e-9);
  });

  test("scale bar is the longest round length within the max width", () => {
    const bar = scaleBar(100); // 1km = 100px
    expect(bar.km).toBe(0.5);
    expect(bar.px).toBeLessThanOrEqual(BAR_MAX_PX);
    expect(scaleBar(5).km).toBe(10);
  });

  test("distance in the gauge voice", () => {
    expect(gaugeKm(0.841)).toBe("841M");
    expect(gaugeKm(1.5)).toBe("1.5KM");
    expect(gaugeKm(2)).toBe("2KM");
    expect(gaugeKm(12.4)).toBe("12KM");
  });

  test("drag moves the view centre the other way, and the origin can leave the board", () => {
    const ppk = 50;
    const c = movedCenter({ x: 0, y: 0 }, 100, 0, ppk); // 오른쪽으로 100px 끌기 → 가운데는 서쪽 2km
    expect(c.x).toBeCloseTo(-2);
    const W = 390;
    const H = 400;
    const o = toScreen({ x: 0, y: 0 }, c, ppk, W, H);
    expect(o.x).toBeCloseTo(W / 2 + 100);
    expect(offBoard(o, W, H)).toBe(false);
    const far = toScreen({ x: 0, y: 0 }, movedCenter(c, 300, 0, ppk), ppk, W, H);
    expect(offBoard(far, W, H)).toBe(true);
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
