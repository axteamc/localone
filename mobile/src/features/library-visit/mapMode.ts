// 홈 지도 모드(C-96 2차, 시안 개발산출물/시안/홈_지도모드_v2_시안.html 채택 S·바닥 A) 계산. 순수 함수만 둔다.
// 지도와 100% 같지 않게: 방향은 화면 가운데에서 본 실제 방위, 거리는 √(거리/가장 먼 곳)로 눌러 담는다.
// 가까운 순서로 놓고, 받침·앞서 놓은 큐브와 겹치면 같은 방향 바깥으로 밀고, 판 끝에서도 겹치면 ±10·20·30° 튼다.
// 바닥은 북쪽이 위인 기울인 평면(세로 MAP_TILT배)과 가운데 기준 거리 고리 2개.
import type { LatLng } from "./deps";

/** 세로를 눕히는 비율(시안 0.6) */
export const MAP_TILT = 0.6;
/** 판 위 안쪽 여백(기울이기 전 반지름 px). 가장 가까운 곳도 받침 밖에서 시작 */
export const MAP_INNER_PX = 65;
/** 고리 거리 후보(km). 고리 글자는 이 둥근 값만 쓴다(사용자: "1.5KM 이런식으로만") */
export const MAP_RING_KM = [0.1, 0.2, 0.3, 0.5, 1, 1.5, 2, 3, 5, 10, 15, 20, 30, 50] as const;
/** 판 끝에서도 겹칠 때 트는 각도(°), 앞에서부터 */
const NUDGE_DEG = [0, 10, -10, 20, -20, 30, -30] as const;
/** 바깥으로 미는 간격(px) */
const PUSH_PX = 3;
/** 큐브·받침 사이 최소 틈(px) */
const GAP = 2;
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

/** 계기판 목소리 거리: 1km 미만 "420M", 10km 미만 "1.5KM"(정수면 "2KM"), 그 이상 "12KM" */
export function gaugeKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}M`;
  if (km < 10 && km % 1 !== 0) return `${km.toFixed(1)}KM`;
  return `${Math.round(km)}KM`;
}

/** 끈 만큼 가운데를 옮긴다(손가락을 오른쪽으로 끌면 지도는 왼쪽 = 가운데가 서쪽으로) */
export function movedCenter(center: KmPoint, dx: number, dy: number, ppk: number): KmPoint {
  return { x: center.x - dx / ppk, y: center.y + dy / (ppk * MAP_TILT) };
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

/** 판 끝 반지름(기울이기 전 px): 가로·눌린 세로 모두 판 안 */
export function boardRadius(W: number, H: number): number {
  return Math.max(MAP_INNER_PX + 1, Math.min(W / 2 - EDGE_X, (H / 2 - EDGE_Y) / MAP_TILT));
}

/** 진북 0° 시계 방향 방위 */
export function bearingDeg(p: KmPoint): number {
  return ((Math.atan2(p.x, p.y) * 180) / Math.PI + 360) % 360;
}

/** 거리 → 판 위 반지름: 안쪽 여백 + 남은 폭 × √(거리/가장 먼 곳). 가장 먼 곳보다 멀면 판 끝 */
export function squashR(km: number, farKm: number, rMax: number): number {
  const t = farKm > 0 ? Math.sqrt(Math.min(1, Math.max(0, km) / farKm)) : 0;
  return MAP_INNER_PX + (rMax - MAP_INNER_PX) * t;
}

/** 판 위 반지름·방위 → 화면 자리(판 가운데 기준, 세로는 기울기만큼 눌림) */
export function polarToScreen(r: number, deg: number, W: number, H: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: W / 2 + r * Math.sin(a), y: H / 2 - r * Math.cos(a) * MAP_TILT };
}

/** 큐브 몸 상자: 바닥 자리(x, y)가 큐브 아래쪽 1/4에 오게 */
export function cubeBody(p: { x: number; y: number }, w: number, h: number): Rect {
  return [p.x - w / 2, p.y - h * 0.75, p.x + w / 2, p.y + h * 0.25];
}

const touches = (a: Rect, b: Rect) => a[0] < b[2] + GAP && b[0] < a[2] + GAP && a[1] < b[3] + GAP && b[1] < a[3] + GAP;
const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

export type MapSpot<T> = { item: T; x: number; y: number; body: Rect; pushed: boolean; turnedDeg: number };
export type MapRing = { km: number; r: number };
export type MapLayout<T> = {
  spots: MapSpot<T>[];
  /** 현위치 받침 자리. 가장 먼 곳보다 멀면 null(판 밖 → 현위치 버튼) */
  home: { x: number; y: number } | null;
  /** 가운데 기준 거리 고리(바깥·안쪽), 반지름은 기울이기 전 px */
  rings: MapRing[];
  farKm: number;
  /** 끌기 환산: 판 끝 반지름 ÷ 가장 먼 곳 거리(1km당 px) */
  pxPerKm: number;
};

/** 고리: 바깥 = 가장 먼 곳(5% 여유) 이하 가장 큰 둥근 값, 안쪽 = 그 절반 이하 가장 큰 둥근 값 */
export function mapRings(farKm: number, rMax: number): MapRing[] {
  const outer = [...MAP_RING_KM].reverse().find((k) => k <= farKm * 1.05);
  if (outer === undefined) return [];
  const inner = [...MAP_RING_KM].reverse().find((k) => k <= outer / 2);
  return [outer, inner]
    .filter((k): k is (typeof MAP_RING_KM)[number] => k !== undefined)
    .map((km) => ({ km, r: squashR(Math.min(km, farKm), farKm, rMax) }));
}

/**
 * 지도 모드 배치(방안 S). items는 가운데(center) 기준 가까운 순이 아니어도 된다(여기서 정렬).
 * 받침(현위치)을 먼저 놓고, 가까운 순으로 시작 반지름에서 바깥으로 PUSH_PX씩 → 판 끝에서도 겹치면 NUDGE_DEG만큼 튼다.
 * 어디에도 빈 곳이 없으면 겹친 넓이가 가장 작은 자리.
 */
export function layoutMap<T>(
  items: { item: T; at: KmPoint }[],
  opts: { center: KmPoint; home: KmPoint; W: number; H: number; cube: { w: number; h: number }; plinth: { w: number; h: number } }
): MapLayout<T> {
  const { center, W, H, cube, plinth } = opts;
  const rMax = boardRadius(W, H);
  const rel = (p: KmPoint) => ({ x: p.x - center.x, y: p.y - center.y });
  const sorted = items
    .map((it) => ({ ...it, d: Math.hypot(rel(it.at).x, rel(it.at).y) }))
    .sort((a, b) => a.d - b.d);
  const farKm = sorted.length > 0 ? Math.max(sorted[sorted.length - 1]!.d, 0.05) : 0;

  const taken: Rect[] = [];
  let home: { x: number; y: number } | null = null;
  const h = rel(opts.home);
  const hd = Math.hypot(h.x, h.y);
  // 받침은 안쪽 여백 없이 가운데에서 이어지게(조금 끌면 조금만 움직인다)
  if (hd < 0.001) home = { x: W / 2, y: H / 2 };
  else if (farKm > 0 && hd <= farKm) home = polarToScreen(rMax * Math.sqrt(hd / farKm), bearingDeg(h), W, H);
  if (home) taken.push([home.x - plinth.w / 2, home.y - plinth.h / 2, home.x + plinth.w / 2, home.y + plinth.h / 2]);

  const spots = sorted.map(({ item, at, d }) => {
    const deg0 = bearingDeg(rel(at));
    const r0 = squashR(d, farKm, rMax);
    const rs: number[] = [];
    for (let r = r0; r < rMax; r += PUSH_PX) rs.push(r);
    rs.push(rMax);
    let best: { r: number; off: number; body: Rect; cost: number } | null = null;
    search: for (const off of NUDGE_DEG) {
      for (const r of rs) {
        const body = cubeBody(polarToScreen(r, deg0 + off, W, H), cube.w, cube.h);
        const cost = taken.reduce((sum, t) => sum + (touches(body, t) ? area(body, t) + 1 : 0), 0);
        if (!best || cost < best.cost) best = { r, off, body, cost };
        if (cost === 0) break search;
      }
    }
    const pick = best!;
    taken.push(pick.body);
    const p = polarToScreen(pick.r, deg0 + pick.off, W, H);
    return { item, x: p.x, y: p.y, body: pick.body, pushed: pick.r > r0 + 0.5, turnedDeg: pick.off };
  });

  return { spots, home, rings: farKm > 0 ? mapRings(farKm, rMax) : [], farKm, pxPerKm: farKm > 0 ? rMax / farKm : 1 };
}
