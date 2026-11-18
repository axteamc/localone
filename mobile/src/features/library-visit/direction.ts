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

/**
 * 주인공 모드: 주인공 하나 크게(칸의 92% 안, 최대 1.7배), 기점은 반대쪽 12%,
 * 나머지는 밀려난 기점에서 본 실제 방향의 가장자리에 걸친 작은 큐브(이름만 판 안 24px).
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
  const heroRect = [hx, hy + ch * 0.05, hx + cw, hy + ch * 0.92] as const;
  const inHero = (x: number, y: number) => x > heroRect[0] - 62 && x < heroRect[2] + 62 && y > heroRect[1] - 36 && y < heroRect[3] + 36;
  const nearPlinth = (x: number, y: number) => Math.abs(x - O[0]) < PLINTH_HW + 62 && Math.abs(y - O[1]) < PLINTH_HH + 36;
  const P = Math.max(0.45, Math.min(0.62, s * 0.5)); // 걸친 큐브 크기
  const placed: [number, number][] = [];
  for (const it of items) {
    if (it.lib.id === h.lib.id) continue;
    const [dx, dy] = dirOf(it.bearingDeg);
    // 밀려난 기점에서 실제 방향으로 그은 선이 가장자리와 만나는 곳
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
    for (let k = 0; k < 8; k++) {
      const other = placed.find((q) => Math.abs(q[0] - ex) < (136 * P) / 0.62 && Math.abs(q[1] - ey) < (78 * P) / 0.62);
      const hit: "hero" | "plinth" | [number, number] | undefined = inHero(ex, ey) ? "hero" : nearPlinth(ex, ey) ? "plinth" : other;
      if (!hit) break;
      if (onSide) {
        const box = hit === "hero" ? [heroRect[1] - 40, heroRect[3] + 40] : hit === "plinth" ? [O[1] - 62, O[1] + 62] : [hit[1] - 66, hit[1] + 66];
        const [b0, b1] = box as [number, number];
        ey = b0 > 20 && (Math.abs(b0 - ey) <= Math.abs(b1 - ey) || b1 > H - 20) ? b0 : Math.min(H - 20, b1);
      } else {
        const box = hit === "hero" ? [heroRect[0] - 66, heroRect[2] + 66] : hit === "plinth" ? [O[0] - 96, O[0] + 96] : [hit[0] - 120, hit[0] + 120];
        const [b0, b1] = box as [number, number];
        ex = b0 > 30 && (Math.abs(b0 - ex) <= Math.abs(b1 - ex) || b1 > W - 30) ? b0 : Math.min(W - 30, b1);
      }
    }
    placed.push([ex, ey]);
    // (ex, ey)는 윗면 가운데 → 큐브 몸 가운데로
    cubes.push({ id: it.lib.id, role: "peek", cx: ex, cy: ey + (103 - TOP_CY) * P, scale: P });
  }
  return { origin: { x: O[0], y: O[1] }, cubes };
}

/** 전체 보기 큐브 배율: 판 폭의 약 46%(D 5차) */
export function ringScale(W: number, H: number): number {
  return Math.max(0.5, Math.min(0.95, (Math.min(W, H * 1.1) * 0.46) / CUBE_W));
}

/**
 * 전체 보기(기점 누르기): 기점이 가운데, 모든 도서관을 같은 크기 큐브로 실제 방향에, 거리는 비례(가까울수록 안쪽).
 * 서로·기점과 겹치지 않게 밀어내고, 가장자리에서 잘려도 이름(윗면 가운데)은 판 안 24px.
 */
export function ringScene(items: FacadeItem[], W: number, H: number): FacadeScene {
  const O: [number, number] = [W / 2, H / 2];
  const q = ringScale(W, H);
  const cw = CUBE_W * q;
  const ch = CUBE_H * q;
  const NAME = (103 - TOP_CY) * q; // 큐브 몸 가운데 ~ 윗면 가운데
  const dMax = Math.max(1, ...items.map((it) => it.distanceM));
  const pts = items.map((it) => {
    const [dx, dy] = dirOf(it.bearingDeg);
    const f = 0.72 + 0.28 * (it.distanceM / dMax);
    return { id: it.lib.id, x: O[0] + dx * (W / 2 - cw * 0.18) * f, y: O[1] + dy * (H / 2 - ch * 0.12) * f };
  });
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const A = pts[i]!;
        const B = pts[j]!;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const ox = cw * 0.8 - Math.abs(dx);
        const oy = ch * 0.72 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox / cw < oy / ch) {
            const m = (ox / 2) * Math.sign(dx || 1);
            A.x -= m;
            B.x += m;
          } else {
            const m = (oy / 2) * Math.sign(dy || 1);
            A.y -= m;
            B.y += m;
          }
        }
      }
    for (const p of pts) {
      const dx = p.x - O[0];
      const dy = p.y - O[1];
      const ox = cw * 0.5 + 34 - Math.abs(dx);
      const oy = ch * 0.5 + 28 - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        if (ox / cw < oy / ch) p.x += ox * Math.sign(dx || 1);
        else p.y += oy * Math.sign(dy || 1);
      }
      p.x = Math.min(W - NAME_IN, Math.max(NAME_IN, p.x));
      p.y = Math.min(H - NAME_IN + NAME, Math.max(NAME_IN + NAME, p.y));
    }
  }
  return { origin: { x: O[0], y: O[1] }, cubes: pts.map((p) => ({ id: p.id, role: "ring", cx: p.x, cy: p.y, scale: q })) };
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
