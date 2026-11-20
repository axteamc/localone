// 홈 파사드의 방위·배치 계산 (VISIT-1 V3·V18, 2026-11-18 큐브 배치 · 2026-11-19 홈 큐브 개편 E1-A·E2-2). 순수 함수만 둔다.
// 기준 시안: 주인공 모드 = 개발산출물/시안/홈_큐브_개편_시안.html calcHero(E2-2)·calcScene(E1-A),
// 전체 보기 = 개발산출물/시안/홈_파사드_큐브_시안.html "3. 실제 배치 미리보기 v2"의 layoutRing()·끌기.
import type { LatLng, LibrarySummary } from "./deps";

/** 윗면 색: `CUBE_PALETTE`의 번호(0부터) 또는 휴관 */
export type SpineTone = number | "closed";

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

/** 판에 놓는 후보 수 상한(가까운 순). 전체 보기는 이만큼 다, 주인공 모드는 이 중 주인공 + 이웃 PEEK_MAX곳 */
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

/** 도서관 id → 0 이상 n 미만(곱셈 해시라 이웃한 id도 흩어진다) */
export function paletteIndexOf(id: number, n: number): number {
  return (Math.imul(id | 0, 0x9e3779b1) >>> 0) % n;
}

/**
 * 윗면 색(V3, 2026-11-20 H6 D 결정 "무작위로 표기해도 무관"): 오늘 휴관(is_closed === true)은 항상 closed.
 * 나머지는 도서관 id로 정한 팔레트 번호(늘 같은 색). 거리순으로 앞선 곳이 먼저 갖고, 이미 쓴 번호면 다음 번호로
 * 넘겨 팔레트 크기까지는 서로 겹치지 않는다. 키는 도서관 id, 값은 `CUBE_PALETTE` 번호.
 */
export function assignSpineTones(items: FacadeItem[], paletteSize: number): Map<number, SpineTone> {
  const all = [...items].sort(byDistance);
  const tones = new Map<number, SpineTone>();
  const used = new Set<number>();
  for (const it of all) {
    if (it.lib.today.is_closed === true) {
      tones.set(it.lib.id, "closed");
      continue;
    }
    if (used.size >= paletteSize) used.clear();
    let i = paletteIndexOf(it.lib.id, paletteSize);
    while (used.has(i)) i = (i + 1) % paletteSize;
    used.add(i);
    tones.set(it.lib.id, i);
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

const PLINTH_HW = 29; // 기점 반폭(58×44)
const PLINTH_HH = 22;
const NAME_IN = 24; // 전체 보기 큐브 이름(윗면 가운데)이 판 안쪽에 남는 거리
const NAME_DY = 103 - TOP_CY; // 큐브 몸 가운데 ~ 윗면 가운데(기본 좌표)

// ── 전체 보기 겹침 판정(PR 191 리뷰 수정) ─────────────────────────────────
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

// ── 주인공 모드(2026-11-19 홈 큐브 개편 H1, D 채택 E1-A · E2-2) ──────────────
/** E2-2: 주인공 폭 = 판 폭의 77%, 높이는 판의 94% 안, 최소 0.55배·최대 1.7배 */
export const HERO_W_F = 0.77;
const HERO_H_F = 0.94;
const HERO_MIN = 0.55;
const HERO_MAX = 1.7;
/** E2-2: 기점은 주인공 반대쪽 모서리 8% 안쪽(주인공 바닥·모퉁이와 조금 겹쳐도 된다, 기점이 위) */
const ORIGIN_F = 0.08;
/** E1-A: 이웃 = 주인공의 0.88배, 판 네 모서리 중 3곳에 크게 잘려 걸친다 */
export const PEEK_RATIO = 0.88;
export const PEEK_MAX = 3;

/**
 * E1-A 모서리 자리(큐브 몸 가운데, 이웃 큐브 폭 pw·높이 ph 기준). ang = 그 모서리가 뜻하는 화면 방위.
 * 시안 calcScene의 좌상·우상·좌하·우하 값 그대로 — 윗면 색·모서리만 판 안에 들어와 "옆에 공간이 이어진다"
 */
function peekSlots(W: number, H: number, pw: number, ph: number) {
  return [
    { x: -pw * 0.04, y: ph * 0.22, ang: 315 },
    { x: W + pw * 0.04, y: ph * 0.16, ang: 45 },
    { x: pw * 0.02, y: H + ph * 0.22, ang: 225 },
    { x: W - pw * 0.02, y: H + ph * 0.24, ang: 135 },
  ];
}

/**
 * 주인공 모드(E2-2 + E1-A): 주인공 하나 크게(판 폭 77%·높이 94% 안), 주인공 방향 칸(sectorOf) 쪽으로 조금 비키고,
 * 기점은 반대쪽 모서리 8% 안쪽. 이웃은 주인공의 0.88배로 판 네 모서리 중 주인공·기점에서 가장 먼 3곳에 크게 잘려 걸치고,
 * 모서리마다 그 방위와 가장 가까운 도서관을 놓는다(1km = 4°만큼 가까운 쪽을 더 친다). 정확한 방향은 전체 보기(ringScene).
 * W·H는 하단 창 위로 보이는 판 크기.
 */
export function heroScene(items: FacadeItem[], heroId: number, W: number, H: number): FacadeScene {
  const h = items.find((it) => it.lib.id === heroId) ?? items[0];
  if (!h) return { origin: { x: W / 2, y: H / 2 }, cubes: [] };
  const sec = sectorOf(h.bearingDeg, W, H);
  const [hdx, hdy] = dirOf(h.bearingDeg);
  const s = Math.max(HERO_MIN, Math.min((W * HERO_W_F) / CUBE_W, (H * HERO_H_F) / CUBE_H, HERO_MAX));
  const cw = CUBE_W * s;
  const ch = CUBE_H * s;
  const shiftX = sec === "E" ? 1 : sec === "W" ? -1 : hdx >= 0 ? 0.3 : -0.3;
  const shiftY = sec === "S" ? 1 : sec === "N" ? -1 : hdy >= 0 ? 0.2 : -0.2;
  const hx = W / 2 + shiftX * Math.min(24, Math.max(0, (W - cw) * 0.35));
  const hy = H / 2 + shiftY * Math.min(14, Math.max(0, (H - ch) * 0.4));
  const ox = sec === "E" ? W * ORIGIN_F + 16 : sec === "W" ? W * (1 - ORIGIN_F) - 16 : hdx >= 0 ? W * 0.18 : W * 0.82;
  const oy = sec === "S" ? H * ORIGIN_F + 12 : sec === "N" ? H * (1 - ORIGIN_F) - 4 : H * (1 - ORIGIN_F);
  // 기점 받침(58×44)이 판 안에 다 보이게
  const O = {
    x: Math.min(W - PLINTH_HW - 5, Math.max(PLINTH_HW + 5, ox)),
    y: Math.min(H - PLINTH_HH - 8, Math.max(PLINTH_HH + 6, oy)),
  };

  const cubes: CubePlace[] = [{ id: h.lib.id, role: "hero", cx: hx, cy: hy, scale: s }];
  const others = items.filter((it) => it.lib.id !== h.lib.id);
  const P = s * PEEK_RATIO;
  const slots = peekSlots(W, H, CUBE_W * P, CUBE_H * P)
    .map((sl) => ({ ...sl, room: Math.min(Math.hypot(sl.x - hx, sl.y - hy) * 0.8, Math.hypot(sl.x - O.x, sl.y - O.y)) }))
    .sort((a, b) => b.room - a.room)
    .slice(0, Math.min(PEEK_MAX, others.length));
  const used = new Set<number>();
  for (const sl of slots) {
    let best: FacadeItem | null = null;
    let bestScore = -Infinity;
    for (const it of others) {
      if (used.has(it.lib.id)) continue;
      const diff = Math.abs(((it.bearingDeg - sl.ang + 540) % 360) - 180);
      const score = 180 - diff - it.distanceM / 250;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (!best) break;
    used.add(best.lib.id);
    cubes.push({ id: best.lib.id, role: "peek", cx: sl.x, cy: sl.y, scale: P });
  }
  return { origin: O, cubes };
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

/**
 * 주인공 모드 끌기(2026-11-19 홈 큐브 개편, 기본값(Claude)): 이웃이 실제 방위가 아니라 모서리에 놓이므로,
 * 먼저 화면에 걸친 이웃 중 끈 반대 방향(주인공 → 이웃 화면 방향)과 가장 가까운 곳, 없으면 실제 방위(pickByDrag)로 고른다.
 */
export function pickByDragScene(scene: FacadeScene, items: FacadeItem[], heroId: number | null, dx: number, dy: number): number | null {
  const hero = scene.cubes.find((c) => c.role === "hero");
  const byId = new Map(items.map((it) => [it.lib.id, it]));
  const seen: FacadeItem[] = [];
  if (hero) {
    for (const c of scene.cubes) {
      const it = byId.get(c.id);
      if (c.role !== "peek" || !it) continue;
      // 화면 방향(오른쪽 +x, 아래 +y) → 방위
      seen.push({ ...it, bearingDeg: norm(deg(Math.atan2(c.cx - hero.cx, -(c.cy - hero.cy)))) });
    }
  }
  return pickByDrag(seen, heroId, dx, dy) ?? pickByDrag(items, heroId, dx, dy);
}
