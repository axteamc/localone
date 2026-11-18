// 홈 파사드의 방위·배치 계산 (VISIT-1 V3·V18, 2026-11-18 큐브 배치). 순수 함수만 둔다.
// 기준 시안: 개발산출물/시안/홈_파사드_큐브_시안.html "3. 실제 배치 미리보기 v2"의 layout()·layoutRing()·끌기.
import type { LatLng, LibrarySummary } from "./deps";

export type SpineTone = "fill1" | "fill2" | "fill3" | "closed";

export type FacadeItem = {
  lib: LibrarySummary;
  /** 진북(0°) 기준 시계 방향 0 이상 360 미만 */
  bearingDeg: number;
  /** 서버 distance_m이 올바르면 그 값, 아니면 직선거리(m) */
  distanceM: number;
  /** "NW 315°" */
  code: string;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function computeBearingDeg(from: LatLng, to: LatLng): number {
  const p1 = rad(from.lat);
  const p2 = rad(to.lat);
  const dl = rad(to.lng - from.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** 하버사인 직선거리(m) */
export function computeDistanceMeters(from: LatLng, to: LatLng): number {
  const R = 6371000;
  const dp = rad(to.lat - from.lat);
  const dl = rad(to.lng - from.lng);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8방위 약어 + 3자리 각도. 예: "NW 315°", "NE 042°" */
export function formatCompassCode(bearingDeg: number): string {
  const d = ((bearingDeg % 360) + 360) % 360;
  const name = SECTORS[Math.round(d / 45) % 8];
  const whole = String(Math.round(d) % 360).padStart(3, "0");
  return `${name} ${whole}°`;
}

/** 서버 distance_m이 0 이상 유한한 값일 때만 쓴다. null·음수·NaN은 직선거리로 대신한다 */
function validDistance(d: number | null): number | null {
  return d != null && Number.isFinite(d) && d >= 0 ? d : null;
}

const byDistance = (a: FacadeItem, b: FacadeItem) => a.distanceM - b.distanceM || a.lib.id - b.lib.id;

/** 판에 한 번에 놓는 큐브 수 상한(가까운 순). 기본값(Claude): 걸침·전체 보기가 서로 덮지 않는 정도 */
export const MAX_CUBES = 7;

/** 좌표 있는 도서관만 방위·거리를 붙여 거리 오름차순(같으면 id)으로 */
export function facadeItems(center: LatLng, libs: LibrarySummary[]): FacadeItem[] {
  const items: FacadeItem[] = [];
  for (const lib of libs) {
    if (lib.latitude == null || lib.longitude == null) continue;
    const to = { lat: lib.latitude, lng: lib.longitude };
    const bearingDeg = computeBearingDeg(center, to);
    items.push({
      lib,
      bearingDeg,
      distanceM: validDistance(lib.distance_m) ?? computeDistanceMeters(center, to),
      code: formatCompassCode(bearingDeg),
    });
  }
  return items.sort(byDistance);
}

/** 판에 놓을 큐브: 가까운 MAX_CUBES곳. 주인공이 그 밖이면 마지막 자리를 주인공에게 준다 */
export function shownItems(items: FacadeItem[], heroId: number | null): FacadeItem[] {
  const top = items.slice(0, MAX_CUBES);
  if (heroId == null || top.some((it) => it.lib.id === heroId)) return top;
  const hero = items.find((it) => it.lib.id === heroId);
  return hero ? [...top.slice(0, MAX_CUBES - 1), hero] : top;
}

/**
 * 윗면 색(V3, 홈 색 규칙 그대로): 오늘 휴관(is_closed === true)은 항상 closed. 나머지는 거리순으로
 * 가장 가까운 1곳이 fill1, 그 뒤는 fill2·fill3를 번갈아 쓴다. 키는 도서관 id.
 */
export function assignSpineTones(items: FacadeItem[]): Map<number, SpineTone> {
  const all = [...items].sort(byDistance);
  const tones = new Map<number, SpineTone>();
  let open = 0;
  for (const it of all) {
    if (it.lib.today.is_closed === true) {
      tones.set(it.lib.id, "closed");
      continue;
    }
    tones.set(it.lib.id, open === 0 ? "fill1" : open % 2 === 1 ? "fill2" : "fill3");
    open += 1;
  }
  return tones;
}

// ── 큐브 배치 (2026-11-18 D 결정 "홈 큐브 배치") ─────────────────────────

export type HeroRule = "nearest" | "recent";

/** 처음 주인공: 기본은 가장 가까운 곳, 설정이 "최근 방문"이고 그곳이 판에 있으면 그곳 */
export function initialHeroId(items: FacadeItem[], rule: HeroRule, recentId: number | null): number | null {
  if (items.length === 0) return null;
  if (rule === "recent" && recentId != null && items.some((it) => it.lib.id === recentId)) return recentId;
  return (items[0] as FacadeItem).lib.id;
}

/** 큐브 기본 크기(시안 C2 좌표계). 윗면 가운데 (110, 67.4), 큐브 몸 가운데 (110, 103) */
export const CUBE_W = 220;
export const CUBE_H = 206;
const TOP_CY = 67.4;

export type Sector = "N" | "E" | "S" | "W";
export type CubeRole = "hero" | "peek" | "ring";
/** cx·cy = 큐브 몸(220×206) 가운데의 판 좌표, scale = 기본 크기 대비 배율 */
export type CubePlace = { id: number; role: CubeRole; cx: number; cy: number; scale: number };
export type FacadeScene = { origin: { x: number; y: number }; cubes: CubePlace[] };

const norm = (b: number) => ((b % 360) + 360) % 360;
/** 화면 방향 단위 벡터(오른쪽 +x, 아래 +y) */
const dirOf = (b: number): [number, number] => [Math.sin(rad(b)), -Math.cos(rad(b))];

/** 주인공 방향 칸: 북 315°~45° · 동 45°~135° · 남 · 서. 가로 화면(가로 > 세로×1.6)은 북·남도 동·서 칸 */
export function sectorOf(bearingDeg: number, W: number, H: number): Sector {
  const b = norm(bearingDeg);
  const s: Sector = b >= 315 || b < 45 ? "N" : b < 135 ? "E" : b < 225 ? "S" : "W";
  if (W > H * 1.6 && (s === "N" || s === "S")) return b < 180 ? "E" : "W";
  return s;
}

const EDGE_F = 0.12; // 기점: 반대쪽 가장자리에서 12% 안쪽
const PLINTH_HW = 29; // 기점 반폭(58×44)
const PLINTH_HH = 22;
const ORIGIN_GAP = 10;
const NAME_IN = 24; // 걸친 큐브 이름(윗면 가운데)이 판 안쪽에 남는 거리
const NAME_DY = 103 - TOP_CY; // 큐브 몸 가운데 ~ 윗면 가운데(기본 좌표)

// ── 겹침 판정(PR 191 리뷰 수정) ─────────────────────────────────────────
// 누르는 영역 = FacadeHome이 큐브마다 그리는 Pressable(220×206, 가운데 기준 scale)을 보이는 판(0..W × 0..H)으로 자른 것.
// 판 밖과 하단 창 아래는 누를 수 없으므로 자른다. 기점은 58×44. 이름(윗면 가운데)은 큐브 안에 있으므로
// 누르는 영역끼리 겹치지 않으면 이름도 다른 큐브·기점에 가리지 않는다.
type Rect = [number, number, number, number];
const pressRect = (cx: number, cy: number, s: number, W: number, H: number): Rect => [
  Math.max(0, cx - (CUBE_W / 2) * s),
  Math.max(0, cy - (CUBE_H / 2) * s),
  Math.min(W, cx + (CUBE_W / 2) * s),
  Math.min(H, cy + (CUBE_H / 2) * s),
];

/** 후보 이름 자리(x, y)와 원래 자리에서 옮긴 거리 d. 렌더마다 부르므로 객체를 만들지 않고 숫자 배열로 둔다 */
type Cands = { n: number; x: Float64Array; y: Float64Array; d: Float64Array };

/**
 * 후보 중 원래 자리와 가장 가까운 빈자리. 빈자리가 없으면(판에 다 들어가지 않을 때, 2026-11-18 D 결정: 지금대로 최소 겹침 분산)
 * "겹친 넓이 ÷ 큐브 한 개 넓이 + d ÷ dRef"가 가장 작은 곳: 큐브 하나를 통째로 덮는 손해가 dRef만큼 옮기는 손해와 같아서,
 * 같은 자리에 포개지 않고 방향도 되도록 지킨다. s = 배율, 고른 자리의 누르는 영역은 taken에 더한다.
 */
function pickSpot(c: Cands, s: number, W: number, H: number, taken: Rect[], dRef: number): [number, number] {
  const hw = (CUBE_W / 2) * s;
  const hh = (CUBE_H / 2) * s;
  const dy = NAME_DY * s; // 이름 자리 → 큐브 몸 가운데
  const area = 4 * hw * hh;
  let free = -1;
  let least = -1;
  let leastCost = Infinity;
  for (let i = 0; i < c.n; i++) {
    const d = c.d[i] as number;
    if (free >= 0 && d >= (c.d[free] as number)) continue;
    const x = c.x[i] as number;
    const cy = (c.y[i] as number) + dy;
    const l = Math.max(0, x - hw);
    const r = Math.min(W, x + hw);
    const t = Math.max(0, cy - hh);
    const b = Math.min(H, cy + hh);
    let o = 0;
    for (const q of taken) o += Math.max(0, Math.min(r, q[2]) - Math.max(l, q[0])) * Math.max(0, Math.min(b, q[3]) - Math.max(t, q[1]));
    if (o === 0) free = i;
    else if (free < 0) {
      const cost = o / area + d / dRef;
      if (cost < leastCost) {
        leastCost = cost;
        least = i;
      }
    }
  }
  const k = free >= 0 ? free : Math.max(0, least);
  const px = c.x[k] as number;
  const py = c.y[k] as number;
  taken.push(pressRect(px, py + dy, s, W, H));
  return [px, py];
}

/** 이름이 판 안쪽 NAME_IN에 남는 둘레(윗변 → 오른변 → 아랫변 → 왼변). 판이 작으면 한 점·한 선으로 줄어든다 */
function insetLoop(W: number, H: number) {
  const x0 = Math.min(NAME_IN, W / 2);
  const y0 = Math.min(NAME_IN, H / 2);
  const w = W - 2 * x0;
  const h = H - 2 * y0;
  const L = 2 * (w + h);
  const at = (u: number): [number, number] => {
    const v = ((u % L) + L) % L;
    if (v < w) return [x0 + v, y0];
    if (v < w + h) return [x0 + w, y0 + (v - w)];
    if (v < 2 * w + h) return [x0 + w - (v - w - h), y0 + h];
    return [x0, y0 + h - (v - 2 * w - h)];
  };
  /** 둘레 위 점(x, y)의 위치 u */
  const toU = (x: number, y: number): number => {
    if (y <= y0 + 1e-6) return x - x0;
    if (x >= x0 + w - 1e-6) return w + (y - y0);
    if (y >= y0 + h - 1e-6) return w + h + (x0 + w - x);
    return 2 * w + h + (y0 + h - y);
  };
  return { L, at, toU };
}

/**
 * 주인공 모드: 주인공 하나 크게(칸의 92% 안, 최대 1.7배), 기점은 반대쪽 12%,
 * 나머지는 밀려난 기점에서 본 실제 방향의 가장자리에 걸친 작은 큐브(이름만 판 안 24px). 누르는 영역이 주인공·기점·
 * 먼저 놓인 큐브와 겹치면 가장자리를 따라(다른 변으로 넘어가도) 가장 가까운 빈자리로 간다(PR 191 리뷰 수정).
 * W·H는 하단 창 위로 보이는 판 크기.
 */
export function heroScene(items: FacadeItem[], heroId: number, W: number, H: number): FacadeScene {
  const h = items.find((it) => it.lib.id === heroId) ?? items[0];
  if (!h) return { origin: { x: W / 2, y: H / 2 }, cubes: [] };
  const sec = sectorOf(h.bearingDeg, W, H);
  const O: [number, number] =
    sec === "N" ? [W / 2, H * (1 - EDGE_F)] : sec === "S" ? [W / 2, H * EDGE_F] : sec === "E" ? [W * EDGE_F, H / 2] : [W * (1 - EDGE_F), H / 2];
  const R =
    sec === "N"
      ? [6, 6, W - 6, O[1] - PLINTH_HH - ORIGIN_GAP]
      : sec === "S"
        ? [6, O[1] + PLINTH_HH + ORIGIN_GAP, W - 6, H - 6]
        : sec === "E"
          ? [O[0] + PLINTH_HW + ORIGIN_GAP, 6, W - 6, H - 6]
          : [6, 6, O[0] - PLINTH_HW - ORIGIN_GAP, H - 6];
  const [r0, r1, r2, r3] = R as [number, number, number, number];
  const rw = r2 - r0;
  const rh = r3 - r1;
  const s = Math.max(0.4, Math.min((rw * 0.92) / CUBE_W, (rh * 0.92) / CUBE_H, 1.7));
  const cw = CUBE_W * s;
  const ch = CUBE_H * s;
  const [hdx, hdy] = dirOf(h.bearingDeg);
  // 칸 안에서도 실제 방향만큼 더 비킨다
  let hx = r0 + (rw - cw) / 2;
  let hy = r1 + (rh - ch) / 2;
  if (sec === "N" || sec === "S") hx += (hdx * (rw - cw)) / 2;
  else hy += (hdy * (rh - ch)) / 2;
  hx = Math.min(r2 - cw, Math.max(r0, hx));
  hy = Math.min(r3 - ch, Math.max(r1, hy));

  const cubes: CubePlace[] = [{ id: h.lib.id, role: "hero", cx: hx + cw / 2, cy: hy + ch / 2, scale: s }];
  const P = Math.max(0.45, Math.min(0.62, s * 0.5)); // 걸친 큐브 크기
  // 이미 놓인 누르는 영역: 주인공·기점, 그다음 걸친 큐브를 가까운 순으로 더한다
  const taken: Rect[] = [
    pressRect(hx + cw / 2, hy + ch / 2, s, W, H),
    [O[0] - PLINTH_HW, O[1] - PLINTH_HH, O[0] + PLINTH_HW, O[1] + PLINTH_HH],
  ];
  const loop = insetLoop(W, H);
  const steps = Math.floor(loop.L / 2 / 2); // 2px 간격, 양쪽으로 반 둘레까지
  const cands: Cands = { n: 0, x: new Float64Array(2 * steps + 1), y: new Float64Array(2 * steps + 1), d: new Float64Array(2 * steps + 1) };
  for (const it of items) {
    if (it.lib.id === h.lib.id) continue;
    const [dx, dy] = dirOf(it.bearingDeg);
    // 밀려난 기점에서 실제 방향으로 그은 선이 가장자리와 만나는 곳 → 이름 자리(판 안 24px 둘레)
    const tx = dx > 1e-9 ? (W - O[0]) / dx : dx < -1e-9 ? -O[0] / dx : Infinity;
    const ty = dy > 1e-9 ? (H - O[1]) / dy : dy < -1e-9 ? -O[1] / dy : Infinity;
    const t = Math.min(tx, ty);
    const onSide = tx < ty;
    let ex = O[0] + dx * t;
    let ey = O[1] + dy * t;
    if (onSide) ex = dx > 0 ? W - NAME_IN : NAME_IN;
    else ey = dy > 0 ? H - NAME_IN : NAME_IN;
    ex = Math.min(W - NAME_IN, Math.max(NAME_IN, ex));
    ey = Math.min(H - NAME_IN, Math.max(NAME_IN, ey));
    // 겹치면 둘레를 따라(다른 변으로 넘어가도) 양쪽으로 가장 가까운 빈자리. 없으면 겹침이 가장 적은 곳
    const u0 = loop.toU(ex, ey);
    cands.n = 0;
    for (let k = 0; k <= steps; k++) {
      for (const u of k === 0 ? [u0] : [u0 + 2 * k, u0 - 2 * k]) {
        const [x, y] = loop.at(u);
        cands.x[cands.n] = x;
        cands.y[cands.n] = y;
        cands.d[cands.n] = 2 * k;
        cands.n += 1;
      }
    }
    const [px, py] = pickSpot(cands, P, W, H, taken, loop.L / 2);
    // (px, py)는 윗면 가운데 → 큐브 몸 가운데로
    cubes.push({ id: it.lib.id, role: "peek", cx: px, cy: py + NAME_DY * P, scale: P });
  }
  return { origin: { x: O[0], y: O[1] }, cubes };
}

/** 전체 보기 큐브 배율: 판 폭의 약 46%(D 5차) */
export function ringScale(W: number, H: number): number {
  return Math.max(0.5, Math.min(0.95, (Math.min(W, H * 1.1) * 0.46) / CUBE_W));
}

/**
 * 전체 보기(기점 누르기): 기점이 가운데, 모든 도서관을 같은 크기 큐브로 실제 방향에, 거리는 비례(가까울수록 안쪽).
 * 원래 자리에서 누르는 영역이 서로·기점과 겹치지 않는 가장 가까운 빈자리로 옮기고(PR 191 리뷰 수정), 가장자리에서 잘려도
 * 이름(윗면 가운데)은 판 안 24px.
 */
export function ringScene(items: FacadeItem[], W: number, H: number): FacadeScene {
  const O: [number, number] = [W / 2, H / 2];
  const q = ringScale(W, H);
  const cw = CUBE_W * q;
  const ch = CUBE_H * q;
  const NAME = NAME_DY * q; // 큐브 몸 가운데 ~ 윗면 가운데
  const dMax = Math.max(1, ...items.map((it) => it.distanceM));
  // 이름 자리 후보: 판 안 24px 안쪽 격자(3px, 큰 판은 후보가 약 1.2만 개가 되게 넓힌다).
  // 원래 자리(실제 방향·거리 비례)와 가장 가까운 빈자리에 가까운 순으로 놓는다
  const x0 = Math.min(NAME_IN, W / 2);
  const y0 = Math.min(NAME_IN, H / 2);
  const step = Math.max(3, Math.ceil(Math.sqrt((W * H) / 12000)));
  const nx = Math.floor((W - 2 * x0) / step) + 1;
  const ny = Math.floor((H - 2 * y0) / step) + 1;
  const cands: Cands = { n: nx * ny, x: new Float64Array(nx * ny), y: new Float64Array(nx * ny), d: new Float64Array(nx * ny) };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      cands.x[j * nx + i] = x0 + i * step;
      cands.y[j * nx + i] = y0 + j * step;
    }
  const taken: Rect[] = [[O[0] - PLINTH_HW, O[1] - PLINTH_HH, O[0] + PLINTH_HW, O[1] + PLINTH_HH]];
  const cubes: CubePlace[] = items.map((it) => {
    const [dx, dy] = dirOf(it.bearingDeg);
    const f = 0.72 + 0.28 * (it.distanceM / dMax);
    // 원래 자리(큐브 몸 가운데)를 이름 자리로 바꿔 판 안 24px로 맞춘다
    const want = [
      Math.min(W - x0, Math.max(x0, O[0] + dx * (W / 2 - cw * 0.18) * f)),
      Math.min(H - y0, Math.max(y0, O[1] + dy * (H / 2 - ch * 0.12) * f - NAME)),
    ] as const;
    for (let k = 0; k < cands.n; k++) cands.d[k] = Math.hypot((cands.x[k] as number) - want[0], (cands.y[k] as number) - want[1]);
    const [px, py] = pickSpot(cands, q, W, H, taken, Math.hypot(W, H));
    return { id: it.lib.id, role: "ring" as const, cx: px, cy: py + NAME, scale: q };
  });
  return { origin: { x: O[0], y: O[1] }, cubes };
}

/** 이만큼(px) 넘게 끌어야 주인공을 바꾼다 */
export const DRAG_PICK = 40;

/** 빈 판 끌기: 지도처럼 끈 반대 방향과 가장 가까운 방향의 도서관(코사인 0.3 초과). 덜 끌었거나 없으면 null */
export function pickByDrag(items: FacadeItem[], heroId: number | null, dx: number, dy: number): number | null {
  const len = Math.hypot(dx, dy);
  if (len < DRAG_PICK) return null;
  const v = [-dx / len, -dy / len] as const;
  let best: number | null = null;
  let bestCos = 0.3;
  for (const it of items) {
    if (it.lib.id === heroId) continue;
    const [ux, uy] = dirOf(it.bearingDeg);
    const c = ux * v[0] + uy * v[1];
    if (c > bestCos) {
      bestCos = c;
      best = it.lib.id;
    }
  }
  return best;
}
