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
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

export type LocateResult = { ok: true; lat: number; lng: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "aborted" };

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
          const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          finish({ ok: true, lat: coords.latitude, lng: coords.longitude });
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
