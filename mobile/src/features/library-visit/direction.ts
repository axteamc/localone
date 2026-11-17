// 홈 파사드(시안 C)의 방위·배치 계산 (VISIT-1 총정리 §3.1·§3.2). 순수 함수만 둔다.
import type { LatLng, LibrarySummary } from "./deps";

export type FacadeSlot = "NW" | "NE" | "SW" | "SE" | "W" | "E" | "MAIN";
export type FacadeKind = "empty" | "single" | "dual" | "quad";
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

export type FacadeGroup = { slot: FacadeSlot; items: FacadeItem[] };
export type FacadeLayout = { kind: FacadeKind; groups: FacadeGroup[] };

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

function quadrantOf(bearingDeg: number): "NE" | "SE" | "SW" | "NW" {
  if (bearingDeg < 90) return "NE";
  if (bearingDeg < 180) return "SE";
  if (bearingDeg < 270) return "SW";
  return "NW";
}

/** 서버 distance_m이 0 이상 유한한 값일 때만 쓴다. null·음수·NaN은 직선거리로 대신한다 */
function validDistance(d: number | null): number | null {
  return d != null && Number.isFinite(d) && d >= 0 ? d : null;
}

const byDistance = (a: FacadeItem, b: FacadeItem) => a.distanceM - b.distanceM || a.lib.id - b.lib.id;

/**
 * 좌표 있는 도서관만 골라 개수에 따라 배치한다: 0=empty, 1=single, 2=dual(경도 서→W·동→E), 3+=quad(사분면).
 * 같은 칸 안은 거리 오름차순(동률이면 id). 첫 항목이 대표로 보인다.
 */
export function groupLibrariesForFacade(center: LatLng, libs: LibrarySummary[]): FacadeLayout {
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
  items.sort(byDistance);

  if (items.length === 0) return { kind: "empty", groups: [] };
  const only = items[0] as FacadeItem;
  if (items.length === 1) return { kind: "single", groups: [{ slot: "MAIN", items: [only] }] };
  if (items.length === 2) {
    const [west, east] = [...items].sort((a, b) => (a.lib.longitude as number) - (b.lib.longitude as number)) as [
      FacadeItem,
      FacadeItem,
    ];
    return {
      kind: "dual",
      groups: [
        { slot: "W", items: [west] },
        { slot: "E", items: [east] },
      ],
    };
  }
  const groups: FacadeGroup[] = [];
  for (const slot of ["NW", "NE", "SW", "SE"] as const) {
    const inSlot = items.filter((it) => quadrantOf(it.bearingDeg) === slot);
    if (inSlot.length > 0) groups.push({ slot, items: inSlot });
  }
  return { kind: "quad", groups };
}

/**
 * 스파인 색 배정(총정리 §3.2): 오늘 휴관(is_closed === true)은 항상 closed. 나머지는 거리순으로
 * 가장 가까운 1곳이 fill1, 그 뒤는 fill2·fill3를 번갈아 쓴다. 키는 도서관 id.
 */
export function assignSpineTones(layout: FacadeLayout): Map<number, SpineTone> {
  const all = layout.groups.flatMap((g) => g.items).sort(byDistance);
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
