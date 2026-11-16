// 지도 홈 상태 — 위치 → 주변 조회, 지도 실패는 목록 모드, 늦은 응답 폐기 (계약서 VISIT-1 C2·P4)
// VISIT-1-P1 범위: 시작·위치 허용·더 넓게·목록 모드·새로고침. 보는 위치 바꾸기(backToCurrent·showRegion·focusLibrary)는 P3.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// TODO(연결): D — core APP-0-P1·LIB-0-P1 머지 뒤 `../../lib/*`로 바꾼다
import {
  createLatestRunner,
  DEFAULT_START,
  fetchLibrariesInRegion,
  fetchLibrariesNearby,
  fetchLibrary,
  getDefaultLibrary,
  locate,
  NEARBY_DEFAULT_RADIUS_KM,
  requestLocationPermission,
  type LatLng,
  type LibrarySummary,
} from "./__fakes__/publicApi";

export type HomeMode = "map" | "list";
export type Origin = "current" | "start" | "moved";
export type HomeStatus = "loading" | "ready" | "empty" | "error";

export type HomeLibraries = {
  mode: HomeMode;
  center: LatLng;
  origin: Origin;
  libraries: LibrarySummary[];
  status: HomeStatus;
  radiusKm: 3 | 5;
  selectedId: number | null;
  reloadHere(center: LatLng): void;
  widen(): void;
  onMapError(): void;
  retryMap(): void;
  allowLocation(): Promise<void>;
};

// TODO(연결): D(AUTH-2) nearby_radius_km — 로그인했으면 내 설정 반경, 지금은 3 고정 (V2)
const BASE_RADIUS = NEARBY_DEFAULT_RADIUS_KM as 3;

export function useHomeLibraries(): HomeLibraries {
  const runner = useMemo(() => createLatestRunner(), []); // 한 화면에 하나
  const [mode, setMode] = useState<HomeMode>("map");
  const [center, setCenter] = useState<LatLng>({ lat: DEFAULT_START.lat, lng: DEFAULT_START.lng });
  const [origin, setOrigin] = useState<Origin>("start");
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [status, setStatus] = useState<HomeStatus>("loading");
  const [radiusKm, setRadiusKm] = useState<3 | 5>(BASE_RADIUS);

  const modeRef = useRef<HomeMode>("map");
  const nearbyRef = useRef<LibrarySummary[]>([]); // 목록 모드 시군구를 고르는 데 쓰는 마지막 주변 결과
  const startingRef = useRef(true); // 첫 주변 조회가 끝나기 전에 지도가 실패하면 끝난 뒤 목록으로
  const aliveRef = useRef(true);

  const loadRegion = useCallback(async () => {
    const code = nearbyRef.current.find((l) => l.dtl_region_code)?.dtl_region_code ?? DEFAULT_START.dtlRegion;
    setStatus("loading");
    const r = await runner.run((s) => fetchLibrariesInRegion(code, s));
    if (r.status === "stale") return;
    if (r.status === "error") {
      setStatus("error");
      return;
    }
    setLibraries(r.value.items);
    setStatus(r.value.items.length ? "ready" : "empty");
  }, [runner]);

  const load = useCallback(
    async (at: LatLng, from: Origin, radius: 3 | 5) => {
      setStatus("loading");
      const r = await runner.run((signal) => fetchLibrariesNearby(at.lat, at.lng, radius, signal));
      if (r.status === "stale") return; // 예외 #3: 화면 무변경
      startingRef.current = false;
      setCenter(at);
      setOrigin(from);
      setRadiusKm(radius);
      if (r.status === "ok") nearbyRef.current = r.value.items;
      if (modeRef.current === "list") {
        await loadRegion(); // 지도가 이미 실패했으면 시군구 목록 (V8)
        return;
      }
      if (r.status === "error") {
        setStatus("error"); // 예외 #1
        return;
      }
      setLibraries(r.value.items);
      setStatus(r.value.items.length === 0 ? "empty" : "ready"); // 예외 #2
    },
    [runner, loadRegion]
  );

  const start = useCallback(
    async (signal: AbortSignal) => {
      const loc = await locate(signal);
      if (!aliveRef.current) return;
      if (loc.ok) return load({ lat: loc.lat, lng: loc.lng }, "current", BASE_RADIUS);
      // V7: 기본 도서관이 있으면 그 좌표, 없으면 임시 시작 위치
      const defId = await getDefaultLibrary();
      const def = defId != null ? await fetchLibrary(defId).catch(() => null) : null;
      if (!aliveRef.current) return;
      const at =
        def?.latitude != null && def.longitude != null
          ? { lat: def.latitude, lng: def.longitude }
          : { lat: DEFAULT_START.lat, lng: DEFAULT_START.lng };
      return load(at, "start", BASE_RADIUS);
    },
    [load]
  );

  useEffect(() => {
    aliveRef.current = true;
    const abort = new AbortController();
    void start(abort.signal); // V1: 켤 때마다 현재 위치 한 번, 보는 위치는 저장하지 않음
    return () => {
      aliveRef.current = false;
      abort.abort();
      runner.cancel();
    };
  }, [start, runner]);

  const reloadHere = useCallback((at: LatLng) => void load(at, origin, radiusKm), [load, origin, radiusKm]);

  const widen = useCallback(() => void load(center, origin, 5), [load, center, origin]);

  const onMapError = useCallback(() => {
    if (modeRef.current === "list") return;
    modeRef.current = "list";
    setMode("list");
    if (!startingRef.current) void loadRegion(); // 첫 조회 중이면 load()가 끝난 뒤 목록을 부른다
  }, [loadRegion]);

  const retryMap = useCallback(() => {
    // V9: 지도 모드로 돌린다(지도 다시 만들기는 HomeScreen이 key로). 또 실패하면 onMapError가 목록을 다시 부른다
    modeRef.current = "map";
    setMode("map");
    void load(center, origin, radiusKm);
  }, [load, center, origin, radiusKm]);

  const allowLocation = useCallback(async () => {
    const answer = await requestLocationPermission();
    if (answer !== "granted" || !aliveRef.current) return;
    const abort = new AbortController();
    const loc = await locate(abort.signal);
    if (loc.ok && aliveRef.current) await load({ lat: loc.lat, lng: loc.lng }, "current", BASE_RADIUS);
  }, [load]);

  return {
    mode,
    center,
    origin,
    libraries,
    status,
    radiusKm,
    selectedId: null,
    reloadHere,
    widen,
    onMapError,
    retryMap,
    allowLocation,
  };
}
