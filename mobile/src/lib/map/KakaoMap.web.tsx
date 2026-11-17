import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { KakaoMapProps, LatLng, MapMarker } from "./KakaoMap";
import {
  createClusterContentElement,
  createMarkerContentElement,
  DEFAULT_MAP_LEVEL,
  getKakaoJsKey,
  getKakaoMapPalette,
  getKakaoSdkUrl,
  KAKAO_READY_TIMEOUT_MS,
} from "./kakaoHtml";

interface KakaoLatLngInstance {
  getLat(): number;
  getLng(): number;
}

interface KakaoMapInstance {
  setCenter(latlng: KakaoLatLngInstance): void;
  getCenter(): KakaoLatLngInstance;
  setLevel(level: number, options?: { anchor?: KakaoLatLngInstance }): void;
  getLevel(): number;
}

interface KakaoCustomOverlayInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoClusterMarkerInstance {
  setContent(content: HTMLElement | string): void;
}

interface KakaoClusterInstance {
  getSize(): number;
  getCenter(): KakaoLatLngInstance;
  getClusterMarker(): KakaoClusterMarkerInstance;
}

interface KakaoMarkerClustererInstance {
  clear(): void;
  addMarkers(markers: KakaoCustomOverlayInstance[]): void;
}

interface KakaoMapsNamespace {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLngInstance;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLngInstance; level: number; mapTypeId: unknown }
  ) => KakaoMapInstance;
  MapTypeId: { ROADMAP: unknown };
  CustomOverlay: new (options: {
    position: KakaoLatLngInstance;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    clickable?: boolean;
    zIndex?: number;
  }) => KakaoCustomOverlayInstance;
  MarkerClusterer: new (options: {
    map: KakaoMapInstance;
    averageCenter?: boolean;
    minLevel?: number;
    disableClickZoom?: boolean;
  }) => KakaoMarkerClustererInstance;
  event: {
    addListener(
      target: unknown,
      type: string,
      handler: (...args: unknown[]) => void
    ): unknown;
    removeListener?(
      target: unknown,
      type: string,
      handler: (...args: unknown[]) => void
    ): void;
  };
}

type KakaoClusterer = KakaoMarkerClustererInstance;

declare global {
  interface Window {
    kakao?: {
      maps?: KakaoMapsNamespace;
    };
  }
}

let sdkLoadPromise: Promise<KakaoMapsNamespace> | null = null;
let sdkLoadedKey: string | null = null;

function loadKakaoSdk(appKey: string): Promise<KakaoMapsNamespace> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("DOM unavailable"));
  }
  const existingMaps = window.kakao?.maps;
  if (existingMaps && typeof existingMaps.Map === "function") {
    return Promise.resolve(existingMaps);
  }
  if (sdkLoadPromise && sdkLoadedKey === appKey) {
    return sdkLoadPromise;
  }

  sdkLoadedKey = appKey;
  sdkLoadPromise = new Promise<KakaoMapsNamespace>((resolve, reject) => {
    const fail = (scriptEl?: HTMLScriptElement) => {
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
      sdkLoadPromise = null;
      sdkLoadedKey = null;
      reject(new Error("Kakao Maps SDK load failed"));
    };

    const finishLoad = (scriptEl?: HTMLScriptElement) => {
      const maps = window.kakao?.maps;
      if (!maps || typeof maps.load !== "function") {
        fail(scriptEl);
        return;
      }
      maps.load(() => {
        const readyMaps = window.kakao?.maps;
        if (!readyMaps || typeof readyMaps.Map !== "function") {
          fail(scriptEl);
          return;
        }
        resolve(readyMaps);
      });
    };

    if (existingMaps && typeof existingMaps.load === "function") {
      finishLoad();
      return;
    }

    const script = document.createElement("script");
    script.src = getKakaoSdkUrl(appKey);
    script.async = true;
    script.setAttribute("data-kakao-maps-sdk", "true");
    script.onload = () => finishLoad(script);
    script.onerror = () => fail(script);
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export function resetKakaoSdkLoaderForTest(): void {
  sdkLoadPromise = null;
  sdkLoadedKey = null;
}

export function KakaoMap(props: KakaoMapProps) {
  const {
    center,
    level = DEFAULT_MAP_LEVEL,
    markers,
    selectedId = null,
    cluster = true,
  } = props;

  const appKey = getKakaoJsKey();
  const palette = useMemo(() => getKakaoMapPalette(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapsRef = useRef<KakaoMapsNamespace | null>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const clustererRef = useRef<KakaoClusterer | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlayInstance[]>([]);
  const lastCenterRef = useRef<LatLng | null>(null);
  const lastLevelRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorReportedRef = useRef(false);
  const readyRef = useRef(false);

  const callbacksRef = useRef(props);
  callbacksRef.current = props;

  const latestPropsRef = useRef({
    center,
    level,
    markers,
    selectedId,
    cluster,
  });
  latestPropsRef.current = { center, level, markers, selectedId, cluster };

  const clearReadyTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reportError = useCallback(
    (reason: "no_key" | "load_failed" | "timeout") => {
      if (errorReportedRef.current || readyRef.current) return;
      errorReportedRef.current = true;
      clearReadyTimer();
      callbacksRef.current.onError(reason);
    },
    [clearReadyTimer]
  );

  const clearMarkers = useCallback(() => {
    if (clustererRef.current) {
      clustererRef.current.clear();
    }
    for (const overlay of overlaysRef.current) {
      overlay.setMap(null);
    }
    overlaysRef.current = [];
  }, []);

  const syncMapState = useCallback(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || typeof document === "undefined") return;

    const current = latestPropsRef.current;
    if (
      !lastCenterRef.current ||
      lastCenterRef.current.lat !== current.center.lat ||
      lastCenterRef.current.lng !== current.center.lng
    ) {
      map.setCenter(new maps.LatLng(current.center.lat, current.center.lng));
      lastCenterRef.current = { lat: current.center.lat, lng: current.center.lng };
    }
    if (lastLevelRef.current !== current.level) {
      map.setLevel(current.level);
      lastLevelRef.current = current.level;
    }

    clearMarkers();
    const nextOverlays = current.markers.map((marker: MapMarker) => {
      const isSelected = marker.id === current.selectedId;
      const content = createMarkerContentElement(
        document,
        marker,
        isSelected,
        palette,
        () => callbacksRef.current.onMarkerPress(marker.id)
      );
      return new maps.CustomOverlay({
        position: new maps.LatLng(marker.lat, marker.lng),
        content,
        xAnchor: 0.5,
        yAnchor: 0.35,
        clickable: true,
        zIndex: isSelected ? 3 : 1,
      });
    });
    overlaysRef.current = nextOverlays;

    if (current.cluster && clustererRef.current) {
      clustererRef.current.addMarkers(nextOverlays);
    } else {
      for (const overlay of nextOverlays) {
        overlay.setMap(map);
      }
    }
  }, [clearMarkers, palette]);

  useEffect(() => {
    errorReportedRef.current = false;
    readyRef.current = false;

    if (!appKey) {
      reportError("no_key");
      return;
    }

    let cancelled = false;
    timeoutRef.current = setTimeout(() => {
      if (!cancelled) {
        reportError("timeout");
      }
    }, KAKAO_READY_TIMEOUT_MS);

    loadKakaoSdk(appKey)
      .then((maps) => {
        if (cancelled || errorReportedRef.current || !containerRef.current) return;

        const initial = latestPropsRef.current;
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(initial.center.lat, initial.center.lng),
          level: initial.level,
          mapTypeId: maps.MapTypeId.ROADMAP,
        });
        lastCenterRef.current = { lat: initial.center.lat, lng: initial.center.lng };
        lastLevelRef.current = initial.level;

        const clusterer = new maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 2,
          disableClickZoom: true,
        });

        maps.event.addListener(clusterer, "clustered", (rawClusters: unknown) => {
          if (cancelled || !Array.isArray(rawClusters) || typeof document === "undefined") {
            return;
          }
          for (const clusterItem of rawClusters as KakaoClusterInstance[]) {
            const el = createClusterContentElement(
              document,
              clusterItem.getSize(),
              palette,
              () => {
                const c = clusterItem.getCenter();
                map.setLevel(Math.max(1, map.getLevel() - 1), { anchor: c });
                callbacksRef.current.onClusterPress?.({
                  lat: c.getLat(),
                  lng: c.getLng(),
                });
              }
            );
            clusterItem.getClusterMarker().setContent(el);
          }
        });

        maps.event.addListener(map, "dragend", () => {
          if (cancelled) return;
          const c = map.getCenter();
          callbacksRef.current.onRegionChange?.({
            lat: c.getLat(),
            lng: c.getLng(),
          });
        });

        mapsRef.current = maps;
        mapRef.current = map;
        clustererRef.current = clusterer;

        readyRef.current = true;
        clearReadyTimer();
        syncMapState();
        callbacksRef.current.onReady?.();
      })
      .catch(() => {
        if (!cancelled) {
          reportError("load_failed");
        }
      });

    return () => {
      cancelled = true;
      clearReadyTimer();
      clearMarkers();
      clustererRef.current = null;
      mapRef.current = null;
      mapsRef.current = null;
      lastCenterRef.current = null;
      lastLevelRef.current = null;
    };
  }, [appKey, clearMarkers, clearReadyTimer, palette, reportError, syncMapState]);

  useEffect(() => {
    if (!readyRef.current) return;
    syncMapState();
  }, [center.lat, center.lng, level, markers, selectedId, cluster, syncMapState]);

  if (!appKey) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: palette.bg,
        }}
      />
    </View>
  );
}

export default KakaoMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
