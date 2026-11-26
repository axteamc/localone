// 홈 지도 모드(C-96, 시안 개발산출물/시안/홈_지도모드_시안.html 채택안 C) 계산. 순수 함수만 둔다.
// 화면 가운데에서 가까운 5곳을 그리고, 다섯째가 판에 들어오게 반경을 둥근 값으로 정해 축척을 맞춘다.
// 바닥은 북쪽이 위인 기울인 평면(세로 MAP_TILT배). 끈 뒤에는 축척을 그대로 두고 5곳만 다시 받는다.
import type { LatLng } from "./deps";

/** 세로를 눕히는 비율(시안 0.6) */
export const MAP_TILT = 0.6;
/** 반경 단계(km): 다섯째 거리 이상 중 가장 작은 값 */
export const MAP_RADII_KM = [0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50] as const;
/** 축척 막대 길이 후보(km). BAR_MAX_PX 안에서 가장 긴 것 */
const BAR_KM = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50] as const;
export const BAR_MAX_PX = 70;
/** 판 가장자리 여백: 가로는 큐브 반폭·이름표, 세로는 위 이름표 자리 */
const EDGE_X = 28;
const EDGE_Y = 40;

export type KmPoint = { x: number; y: number };
export type Rect = [number, number, number, number];

const KM_PER_LAT = 110.574;
const kmPerLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

/** 기준점에서 본 위치(km, 동 +x, 북 +y). 수 km 안은 평면 근사로 충분하다 */
export function toKm(origin: LatLng, at: LatLng): KmPoint {
  return { x: (at.lng - origin.lng) * kmPerLng(origin.lat), y: (at.lat - origin.lat) * KM_PER_LAT };
}

export function toLatLng(origin: LatLng, p: KmPoint): LatLng {
  return { lat: origin.lat + p.y / KM_PER_LAT, lng: origin.lng + p.x / kmPerLng(origin.lat) };
}

/** 다섯째(가장 먼 곳) 거리 이상 중 가장 작은 반경 단계. 그보다 멀면 그 거리 그대로 */
export function niceRadius(farKm: number): number {
  return MAP_RADII_KM.find((r) => r >= farKm) ?? farKm;
}

/** 반경이 판(W×H, 세로는 기울기만큼 눌림)에 들어오는 1km당 px */
export function pxPerKm(radiusKm: number, W: number, H: number): number {
  const r = Math.max(radiusKm, 0.05);
  return Math.max(1, Math.min((W / 2 - EDGE_X) / r, (H / 2 - EDGE_Y) / (r * MAP_TILT)));
}

/** 축척 막대: BAR_MAX_PX 안에서 가장 긴 둥근 길이 */
export function scaleBar(ppk: number): { km: number; px: number } {
  const km = [...BAR_KM].reverse().find((b) => b * ppk <= BAR_MAX_PX) ?? BAR_KM[0];
  return { km, px: km * ppk };
}

/** 계기판 목소리 거리: 1km 미만 "420M", 10km 미만 "1.5KM"(정수면 "2KM"), 그 이상 "12KM" */
export function gaugeKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}M`;
  if (km < 10 && km % 1 !== 0) return `${km.toFixed(1)}KM`;
  return `${Math.round(km)}KM`;
}

/** 화면 자리: 판 가운데(W/2, H/2)가 center, 끄는 중이면 drag만큼 */
export function toScreen(p: KmPoint, center: KmPoint, ppk: number, W: number, H: number, drag = { x: 0, y: 0 }) {
  return { x: W / 2 + (p.x - center.x) * ppk + drag.x, y: H / 2 - (p.y - center.y) * ppk * MAP_TILT + drag.y };
}

/** 끈 만큼 가운데를 옮긴다(손가락을 오른쪽으로 끌면 지도는 왼쪽 = 가운데가 서쪽으로) */
export function movedCenter(center: KmPoint, dx: number, dy: number, ppk: number): KmPoint {
  return { x: center.x - dx / ppk, y: center.y + dy / (ppk * MAP_TILT) };
}

/** 현위치 받침이 판 안쪽 margin 밖으로 나갔는지(나가면 현위치 버튼) */
export function offBoard(p: { x: number; y: number }, W: number, H: number, margin = 20): boolean {
  return p.x < margin || p.x > W - margin || p.y < margin || p.y > H - margin;
}

export type LabelPos = "above" | "below" | "right" | "left";

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/**
 * 이름표 자리: 큐브 몸(body) 위 → 아래 → 오른쪽 → 왼쪽 중 피할 것(받침·큐브·앞서 놓은 이름표)과 겹치지 않는 첫 자리.
 * 다 겹치면 겹친 넓이가 가장 작은 자리. 고른 자리는 taken에 더한다.
 */
export function placeLabel(body: Rect, w: number, h: number, taken: Rect[]): { pos: LabelPos; rect: Rect } {
  const [l, t, r, b] = body;
  const midY = (t + b) / 2;
  const opts: { pos: LabelPos; rect: Rect }[] = [
    { pos: "above", rect: [l, t - h - 2, l + w, t - 2] },
    { pos: "below", rect: [l, b + 2, l + w, b + h + 2] },
    { pos: "right", rect: [r + 4, midY - h / 2, r + 4 + w, midY + h / 2] },
    { pos: "left", rect: [l - 4 - w, midY - h / 2, l - 4, midY + h / 2] },
  ];
  const cost = (o: { rect: Rect }) => taken.reduce((sum, q) => sum + overlap(o.rect, q), 0);
  const pick = opts.find((o) => cost(o) === 0) ?? opts.reduce((best, o) => (cost(o) < cost(best) ? o : best));
  taken.push(pick.rect);
  return pick;
}
