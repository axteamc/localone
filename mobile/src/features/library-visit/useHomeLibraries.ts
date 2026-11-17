// 지도 홈 상태 — 위치 → 주변 조회, 지도 실패는 목록 모드, 늦은 응답 폐기 (계약서 VISIT-1 C2·P4)
// P1: 시작·위치 허용·더 넓게·목록 모드·새로고침. P3: 보는 위치 바꾸기(reloadHere·backToCurrent·showRegion·focusLibrary).
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
  /** stillHere: 응답이 왔을 때 false면(그 사이 지도를 또 옮김) 지도를 그 자리로 되돌리지 않는다 */
  reloadHere(center: LatLng, stillHere?: () => boolean): void;
  backToCurrent(): void;
  widen(): void;
  showRegion(code: string): void;
  focusLibrary(lib: LibrarySummary): void;
  onMapError(): void;
  retryMap(): void;
  allowLocation(): Promise<void>;
};

// TODO(연결): D(AUTH-2) nearby_radius_km — 로그인했으면 내 설정 반경, 지금은 3 고정 (V2)
const BASE_RADIUS = NEARBY_DEFAULT_RADIUS_KM as 3;

/** V12 지역 결과: 좌표가 있는 도서관들의 평균 자리. 하나도 없으면 null */
export function averageCenter(libs: LibrarySummary[]): LatLng | null {
  const pts = libs.filter((l) => l.latitude != null && l.longitude != null);
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, l) => s + (l.latitude as number), 0) / pts.length;
  const lng = pts.reduce((s, l) => s + (l.longitude as number), 0) / pts.length;
  return { lat, lng };
}

export function useHomeLibraries(): HomeLibraries {
  const runner = useMemo(() => createLatestRunner(), []); // 한 화면에 하나
  const [mode, setMode] = useState<HomeMode>("map");
  const [center, setCenter] = useState<LatLng>({ lat: DEFAULT_START.lat, lng: DEFAULT_START.lng });
  const [origin, setOrigin] = useState<Origin>("start");
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [status, setStatus] = useState<HomeStatus>("loading");
  const [radiusKm, setRadiusKm] = useState<3 | 5>(BASE_RADIUS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const modeRef = useRef<HomeMode>("map");
  const nearbyRef = useRef<LibrarySummary[]>([]); // 목록 모드 시군구를 고르는 데 쓰는 마지막 주변 결과
  const regionRef = useRef<string | null>(null); // 찾기 결과로 고른 시군구(목록 모드에서 그대로 유지)
  const currentRef = useRef<LatLng | null>(null); // 이번에 켠 뒤 알게 된 현재 위치(기기에 저장하지 않음, V1)
  const startingRef = useRef(true); // 첫 주변 조회가 끝나기 전에 지도가 실패하면 끝난 뒤 목록으로
  const aliveRef = useRef(true);
  const searchedRef = useRef<LatLng | null>(null); // 마지막으로 결과를 받은 자리("더 넓게 찾기"가 쓴다)

  /** 현재 위치를 알면 옮긴 곳은 "moved", 모르면 계속 "start"(V10: "위치 허용하기"와 "현재 위치로"는 함께 뜨지 않음) */
  const movedOrigin = useCallback((): Origin => (currentRef.current ? "moved" : "start"), []);

  const loadRegion = useCallback(
    async (code?: string) => {
      const pick =
        code ??
        regionRef.current ??
        nearbyRef.current.find((l) => l.dtl_region_code)?.dtl_region_code ??
        DEFAULT_START.dtlRegion;
      setStatus("loading");
      const r = await runner.run((s) => fetchLibrariesInRegion(pick, s));
      if (r.status === "stale") return;
      if (r.status === "error") {
        setStatus("error");
        return;
      }
      if (code) regionRef.current = code;
      setLibraries(r.value.items);
      setStatus(r.value.items.length ? "ready" : "empty");
    },
    [runner]
  );

  const load = useCallback(
    async (
      at: LatLng,
      from: Origin,
      radius: 3 | 5,
      select: number | null = null,
      applyView: () => boolean = () => true
    ) => {
      setStatus("loading");
      const r = await runner.run((signal) => fetchLibrariesNearby(at.lat, at.lng, radius, signal));
      if (r.status === "stale") return; // 예외 #3: 화면 무변경
      startingRef.current = false;
      searchedRef.current = at;
      // V10: 요청 뒤 사용자가 지도를 또 옮겼으면 마지막으로 옮긴 자리를 지킨다
      if (applyView()) setCenter(at);
      setOrigin(from);
      setRadiusKm(radius);
      setSelectedId(select);
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
      if (loc.ok) {
        currentRef.current = { lat: loc.lat, lng: loc.lng };
        return load(currentRef.current, "current", BASE_RADIUS);
      }
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

  // V10: 지도를 끌어 옮긴 뒤 "이 지역에서 다시 찾기" — 지도 중심으로 주변 조회
  const reloadHere = useCallback(
    (at: LatLng, stillHere?: () => boolean) => {
      const same = currentRef.current && currentRef.current.lat === at.lat && currentRef.current.lng === at.lng;
      void load(at, same ? "current" : movedOrigin(), radiusKm, null, stillHere);
    },
    [load, movedOrigin, radiusKm]
  );

  // V10: "현재 위치로" — 이번에 알게 된 현재 위치 주변으로 돌아온다
  const backToCurrent = useCallback(() => {
    if (!currentRef.current) return;
    regionRef.current = null;
    void load(currentRef.current, "current", BASE_RADIUS);
  }, [load]);

  const widen = useCallback(() => void load(searchedRef.current ?? center, origin, 5), [load, center, origin]);

  // V12: 지역 결과 — 지도 모드는 그 지역 도서관 평균 자리로 옮기고 핀을 그 결과로, 목록 모드는 그 지역 목록
  const showRegion = useCallback(
    async (code: string) => {
      setSelectedId(null);
      if (modeRef.current === "list") {
        await loadRegion(code);
        return;
      }
      setStatus("loading");
      const r = await runner.run((s) => fetchLibrariesInRegion(code, s));
      if (r.status === "stale") return;
      if (r.status === "error") {
        setStatus("error");
        return;
      }
      const mid = averageCenter(r.value.items);
      if (mid) {
        setCenter(mid);
        setOrigin(movedOrigin());
      }
      setLibraries(r.value.items);
      setStatus(r.value.items.length ? "ready" : "empty");
    },
    [runner, loadRegion, movedOrigin]
  );

  // V12: 도서관 결과 — 지도 모드는 그 좌표로 옮기고 그 핀에 테두리, 목록 모드는 그 도서관의 시군구 목록. 방문 페이지로 가지 않는다
  const focusLibrary = useCallback(
    (lib: LibrarySummary) => {
      if (modeRef.current === "list") {
        if (lib.dtl_region_code) void loadRegion(lib.dtl_region_code);
        return;
      }
      if (lib.latitude == null || lib.longitude == null) {
        if (lib.dtl_region_code) void showRegion(lib.dtl_region_code);
        return;
      }
      void load({ lat: lib.latitude, lng: lib.longitude }, movedOrigin(), radiusKm, lib.id);
    },
    [load, loadRegion, showRegion, movedOrigin, radiusKm]
  );

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
    if (!loc.ok || !aliveRef.current) return;
    currentRef.current = { lat: loc.lat, lng: loc.lng };
    regionRef.current = null;
    await load(currentRef.current, "current", BASE_RADIUS);
  }, [load]);

  return {
    mode,
    center,
    origin,
    libraries,
    status,
    radiusKm,
    selectedId,
    reloadHere,
    backToCurrent,
    widen,
    showRegion: (code: string) => void showRegion(code),
    focusLibrary,
    onMapError,
    retryMap,
    allowLocation,
  };
}
