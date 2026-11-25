import { deviceStorage } from "./platform";
import { STORAGE_KEYS } from "./policy";
import type { Place } from "./publicApi";

export type RoughStart = Pick<Place, "lat" | "lng" | "area_label">;
const listeners = new Set<() => void>();
export function subscribeRoughStart(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function readRoughStart(): Promise<RoughStart | null> {
  try {
    const raw = await deviceStorage.getItem(STORAGE_KEYS.roughStart);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Number.isFinite(p?.lat) || Math.abs(p.lat) > 90 ||
        !Number.isFinite(p.lng) || Math.abs(p.lng) > 180 ||
        typeof p.area_label !== "string" || !p.area_label.trim()) return null;
    return { lat: p.lat, lng: p.lng, area_label: p.area_label };
  } catch { return null; }
}

export async function writeRoughStart(value: RoughStart | null) {
  if (value) {
    const { lat, lng, area_label } = value;
    await deviceStorage.setItem(STORAGE_KEYS.roughStart, JSON.stringify({ lat, lng, area_label }));
  } else {
    await deviceStorage.removeItem(STORAGE_KEYS.roughStart);
  }
  for (const notify of listeners) notify();
}
