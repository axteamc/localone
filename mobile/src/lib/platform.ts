import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Linking, Platform } from "react-native";
import { LOCATE_TIMEOUT_MS } from "./policy";

export const deviceStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS !== "web") return AsyncStorage.getItem(key);
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS !== "web") return AsyncStorage.setItem(key, value);
    if (typeof localStorage === "undefined") throw new Error("기기 저장소를 사용할 수 없어요.");
    localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS !== "web") return AsyncStorage.removeItem(key);
    if (typeof localStorage === "undefined") throw new Error("기기 저장소를 사용할 수 없어요.");
    localStorage.removeItem(key);
  },
};

export type LocateResult = { ok: true; lat: number; lng: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "aborted" };

const LAST_FIX_FRESH_MS = 2 * 60_000;
const LAST_FIX_STALE_MS = 24 * 60 * 60_000;
const FRESH_FIX_WAIT_MS = 7_000; // LOCATE_TIMEOUT_MS(10초) 안에서 ③을 볼 여유를 남긴다

async function lastFix(maxAge: number): Promise<LocateResult | null> {
  try {
    const p = await Location.getLastKnownPositionAsync({ maxAge });
    return p ? { ok: true, lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch { return null; }
}

// Only one foreground reading; coordinates are never stored or logged.
export function locate(signal: AbortSignal): Promise<LocateResult> {
  if (signal.aborted) return Promise.resolve({ ok: false, reason: "aborted" });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: LocateResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve(result);
    };
    const cancel = () => finish({ ok: false, reason: "aborted" });
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), LOCATE_TIMEOUT_MS);
    signal.addEventListener("abort", cancel, { once: true });
    if (Platform.OS === "web") {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        finish({ ok: false, reason: "unavailable" });
        return;
      }
      try {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => finish({ ok: true, lat: coords.latitude, lng: coords.longitude }),
          ({ code }) => finish({ ok: false, reason: code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable" }),
          { timeout: LOCATE_TIMEOUT_MS, enableHighAccuracy: false, maximumAge: 0 },
        );
      } catch { finish({ ok: false, reason: "unavailable" }); }
    } else {
      void (async () => {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (settled) return;
          if (permission.status !== "granted") { finish({ ok: false, reason: "denied" }); return; }
          if (!await Location.hasServicesEnabledAsync()) { finish({ ok: false, reason: "denied" }); return; }
          if (settled) return;
          // Android는 새 위치 갱신이 없으면 getCurrentPosition이 응답하지 않는 때가 있다(실기기 P8: 권한 허용인데 서울 기본값).
          // ① 최근 위치(LAST_FIX_FRESH_MS 이내)를 바로 쓰고 ② 없으면 새 위치를 FRESH_FIX_WAIT_MS까지 기다린 뒤 ③ 하루 안의 마지막 위치.
          const recent = await lastFix(LAST_FIX_FRESH_MS);
          if (settled) return;
          if (recent) { finish(recent); return; }
          let wait: ReturnType<typeof setTimeout> | undefined;
          const fresh = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              .then(({ coords }): LocateResult => ({ ok: true, lat: coords.latitude, lng: coords.longitude }))
              .catch(() => null),
            new Promise<null>((r) => { wait = setTimeout(() => r(null), FRESH_FIX_WAIT_MS); }),
          ]);
          clearTimeout(wait);
          if (settled) return;
          finish(fresh ?? (await lastFix(LAST_FIX_STALE_MS)) ?? { ok: false, reason: "unavailable" });
        } catch { finish({ ok: false, reason: "unavailable" }); }
      })();
    }
  });
}

export async function requestLocationPermission(): Promise<"granted" | "denied"> {
  if (Platform.OS === "web") {
    const result = await locate(new AbortController().signal);
    return result.ok ? "granted" : "denied";
  }
  try {
    return (await Location.requestForegroundPermissionsAsync()).status === "granted" ? "granted" : "denied";
  } catch { return "denied"; }
}

export async function openExternalUrl(url: string): Promise<boolean> {
  try {
    if (!/^https?:\/\//i.test(url) || !new URL(url).hostname) return false;
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return false;
      // noopener can return null on success too; do not treat it as a failure.
      window.open(url, "_blank", "noopener");
    } else { await Linking.openURL(url); }
    return true;
  } catch { return false; }
}
