// 지도 홈 상태 — 위치 → 주변 조회, 지도 실패는 목록 모드, 늦은 응답 폐기 (계약서 VISIT-1 C2·P4)
// P1: 시작·위치 허용·목록 모드·새로고침(C-96: 반경 2km, 비면 가장 가까운 곳 — "더 넓게 찾기" 없앰). P3: 보는 위치 바꾸기(reloadHere·backToCurrent·showRegion·focusLibrary).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLatestRunner,
  DEFAULT_START,
  fetchLibrariesInRegion,
  fetchLibrariesNearby,
  fetchLibrary,
  getDefaultLibrary,
  getLastRegion,
  HOME_RADIUS_KM,
  locate,
  requestLocationPermission,
  setLastRegion,
  type LatLng,
  type LibrarySummary,
} from "./deps";

import { readRoughStart, subscribeRoughStart } from "../../lib/roughStart";

export type HomeMode = "map" | "list";
export type Origin = "current" | "start" | "moved";
export type HomeStatus = "loading" | "ready" | "empty" | "error";

export type HomeLibraries = {
  roughLabel?: string | null;
  mode: HomeMode;
  center: LatLng;
  /** center를 다시 정할 때마다 바뀐다(같은 좌표여도). 지도는 이 값이 바뀌면 center로 옮긴다 */
  viewSeq: number;
  origin: Origin;
  libraries: LibrarySummary[];
  status: HomeStatus;
  radiusKm: number;
  selectedId: number | null;
  /** stillHere: 응답이 왔을 때 false면(그 사이 지도를 또 옮김) 지도를 그 자리로 되돌리지 않는다 */
  reloadHere(center: LatLng, stillHere?: () => boolean): void;
  backToCurrent(): void;
  showRegion(code: string): void;
  focusLibrary(lib: LibrarySummary): void;
  onMapError(): void;
  retryMap(): void;
  allowLocation(): Promise<void>;
};

// C-96(2026-11-26): 홈 큐브는 설정과 상관없이 늘 2km. 검색 반경 설정(2·3·5)은 책 "주변 찾기"에만 쓴다
const BASE_RADIUS = HOME_RADIUS_KM as 2;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** V12 지역 결과: 좌표가 있는 도서관들의 가운데 자리(위도·경도 각각 중앙값). 하나도 없으면 null.
 *  평균은 좌표가 잘못 들어간 도서관 하나(예: 광주 북구인데 서울 좌표)에 기점이 수십 km 끌려가서 중앙값을 쓴다(C-68) */
export function averageCenter(libs: LibrarySummary[]): LatLng | null {
  const pts = libs.filter((l) => l.latitude != null && l.longitude != null);
  if (pts.length === 0) return null;
  return { lat: median(pts.map((l) => l.latitude as number)), lng: median(pts.map((l) => l.longitude as number)) };
}

export function useHomeLibraries(): HomeLibraries {
  const runner = useMemo(() => createLatestRunner(), []); // 한 화면에 하나
  const [mode, setMode] = useState<HomeMode>("map");
  const [center, setCenterState] = useState<LatLng>({ lat: DEFAULT_START.lat, lng: DEFAULT_START.lng });
  // 보는 위치를 정할 때마다 는다. 끌어 옮긴 뒤 같은 좌표로 돌아갈 때(현재 위치로 등)도 지도가 다시 옮겨지게 한다
  const [viewSeq, setViewSeq] = useState(0);
  const setCenter = useCallback((at: LatLng) => {
    setCenterState(at);
    setViewSeq((n) => n + 1);
  }, []);
  const [roughLabel, setRoughLabel] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin>("start");
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [status, setStatus] = useState<HomeStatus>("loading");
  const [radiusKm, setRadiusKm] = useState<2 | 3 | 5>(BASE_RADIUS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const modeRef = useRef<HomeMode>("map");
  const nearbyRef = useRef<LibrarySummary[]>([]); // 목록 모드 시군구를 고르는 데 쓰는 마지막 주변 결과
  const regionRef = useRef<string | null>(null); // 찾기 결과로 고른 시군구(목록 모드에서 그대로 유지)
  const currentRef = useRef<LatLng | null>(null); // 이번에 켠 뒤 알게 된 현재 위치(기기에 저장하지 않음, V1)
  const startingRef = useRef(true); // 첫 주변 조회가 끝나기 전에 지도가 실패하면 끝난 뒤 목록으로
  const aliveRef = useRef(true);
  const startAbort = useRef<AbortController | null>(null);

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
      radius: 2 | 3 | 5,
      select: number | null = null,
      applyView: () => boolean = () => true
    ) => {
      setStatus("loading");
      const r = await runner.run((signal) => fetchLibrariesNearby(at.lat, at.lng, radius, signal));
      if (r.status === "stale") return; // 예외 #3: 화면 무변경
      startingRef.current = false;
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
      // C-96: 반경 안이 비면 안내 없이 가장 가까운 곳(서버 nearest)을 주인공으로. 예전 서버(칸 없음)면 지금처럼 비어 있음
      const items = r.value.items.length === 0 && r.value.nearest ? [r.value.nearest] : r.value.items;
      setLibraries(items);
      setStatus(items.length === 0 ? "empty" : "ready"); // 예외 #2
    },
    [runner, loadRegion, setCenter]
  );

  const start = useCallback(
    async (signal: AbortSignal) => {
      const loc = await locate(signal);
      if (signal.aborted) return;
      setRoughLabel(null);
      if (loc.ok) {
        currentRef.current = { lat: loc.lat, lng: loc.lng };
        return load(currentRef.current, "current", BASE_RADIUS);
      }
      currentRef.current = null;
      const rough = await readRoughStart();
      if (signal.aborted) return;
      if (rough) {
        setRoughLabel(rough.area_label);
        return load(rough, "start", BASE_RADIUS);
      }
      // V7: ① 기본 도서관 좌표 ② 마지막으로 고른 지역(좌표 평균, C-68) ③ 임시 시작 위치
      const defId = await getDefaultLibrary();
      const def = defId != null ? await fetchLibrary(defId).catch(() => null) : null;
      if (signal.aborted) return;
      if (def?.latitude != null && def.longitude != null) {
        return load({ lat: def.latitude, lng: def.longitude }, "start", BASE_RADIUS);
      }
      const lastRegion = await getLastRegion();
      if (signal.aborted) return;
      if (lastRegion) {
        setStatus("loading");
        const r = await runner.run((s) => fetchLibrariesInRegion(lastRegion, s));
        if (signal.aborted || r.status === "stale") return;
        const mid = r.status === "ok" ? averageCenter(r.value.items) : null;
        if (r.status === "ok" && mid) {
          startingRef.current = false;
          setCenter(mid);
          setOrigin("start");
          setLibraries(r.value.items);
          setStatus("ready");
          return;
        }
      }
      return load({ lat: DEFAULT_START.lat, lng: DEFAULT_START.lng }, "start", BASE_RADIUS);
    },
    [load, runner, setCenter]
  );

  useEffect(() => {
    aliveRef.current = true;
    const restart = () => {
      startAbort.current?.abort();
      runner.cancel();
      regionRef.current = null;
      startAbort.current = new AbortController();
      void start(startAbort.current.signal);
    };
    const unsubscribe = subscribeRoughStart(restart);
    restart(); // V1: 켤 때마다 현재 위치 한 번, 보는 위치는 저장하지 않음
    return () => {
      unsubscribe();
      aliveRef.current = false;
      startAbort.current?.abort();
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

  // V12: 지역 결과 — 지도 모드는 그 지역 도서관 평균 자리로 옮기고 핀을 그 결과로, 목록 모드는 그 지역 목록
  const showRegion = useCallback(
    async (code: string) => {
      setRoughLabel(null);
      setSelectedId(null);
      void setLastRegion(code); // V7(C-68): 위치를 못 쓸 때 다음 시작점. 코드만 둔다
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
    [runner, loadRegion, movedOrigin, setCenter]
  );

  // V12: 도서관 결과 — 지도 모드는 그 좌표로 옮기고 그 핀에 테두리, 목록 모드는 그 도서관의 시군구 목록. 방문 페이지로 가지 않는다
  const focusLibrary = useCallback(
    (lib: LibrarySummary) => {
      setRoughLabel(null);
      if (lib.dtl_region_code) void setLastRegion(lib.dtl_region_code); // V7(C-68)
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
    startAbort.current?.abort();
    const abort = new AbortController();
    startAbort.current = abort;
    await start(abort.signal);
  }, [start]);

  return {
    mode,
    roughLabel,
    center,
    viewSeq,
    origin,
    libraries,
    status,
    radiusKm,
    selectedId,
    reloadHere,
    backToCurrent,
    showRegion: (code: string) => void showRegion(code),
    focusLibrary,
    onMapError,
    retryMap,
    allowLocation,
  };
}
