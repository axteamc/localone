// 시험 전용 가짜. 앱은 `../deps.ts`(core 모듈)를 쓰고, 시험은 `jest.mock("../deps")`로 이 파일을 끼운다.
// 모양은 contracts/core.md APP-0 C2·C7, LIB-0 C3·C7 그대로.
import React, { useEffect } from "react";

// ── 타입 (core `lib/publicApi.ts`와 같은 이름) ──────────────────────────
export type Today = {
  date: string;
  is_closed: boolean | null;
  hours_text: string | null;
  holiday_unchecked: boolean;
};

export type LibrarySummary = {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  dtl_region_code: string | null;
  area_label: string | null;
  distance_m: number | null;
  today: Today;
};

export type LibraryListResponse = {
  mode: "nearby" | "region" | "search";
  radius_km: number | null;
  dtl_region: string | null;
  q: string | null;
  items: LibrarySummary[];
};

export type LibraryDetail = LibrarySummary & {
  tel: string | null;
  homepage: string | null;
  operating_time_text: string | null;
  closed_text: string | null;
};

export class ApiCallError extends Error {
  status: number;
  code: string;
  detail: string;
  constructor(status: number, code: string, message: string, detail = "") {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// ── 가짜 #10 응답 (core LIB-0 C7) ──────────────────────────────────────
export const FAKE_LIBRARIES: LibrarySummary[] = [
  {
    id: 101,
    name: "정독도서관",
    address: "서울특별시 종로구 북촌로5길 48 (화동)",
    latitude: 37.5815,
    longitude: 126.9831,
    dtl_region_code: "11010",
    area_label: "화동",
    distance_m: 420,
    today: { date: "2026-11-16", is_closed: false, hours_text: "09:00~22:00", holiday_unchecked: false },
  },
  {
    id: 102,
    name: "종로도서관",
    address: "서울특별시 종로구 사직로9길 15-14 (사직동)",
    latitude: 37.5762,
    longitude: 126.9667,
    dtl_region_code: "11010",
    area_label: "사직동",
    distance_m: 1310,
    today: { date: "2026-11-16", is_closed: true, hours_text: null, holiday_unchecked: false },
  },
  {
    id: 103,
    name: "남산도서관",
    address: "서울특별시 용산구 소월로 109",
    latitude: 37.5531,
    longitude: 126.9817,
    dtl_region_code: "11030",
    area_label: null,
    distance_m: 2890,
    today: { date: "2026-11-16", is_closed: null, hours_text: null, holiday_unchecked: true },
  },
];

// ── publicApi (core APP-0 C2) ─────────────────────────────────────────
export async function fetchLibrariesNearby(
  _lat: number,
  _lng: number,
  radiusKm: 3 | 5 = 3,
  _signal?: AbortSignal
): Promise<LibraryListResponse> {
  return { mode: "nearby", radius_km: radiusKm, dtl_region: null, q: null, items: FAKE_LIBRARIES };
}

export async function fetchLibrariesInRegion(
  dtlRegion: string,
  _signal?: AbortSignal
): Promise<LibraryListResponse> {
  const items = FAKE_LIBRARIES.filter((l) => l.dtl_region_code === dtlRegion).map((l) => ({
    ...l,
    distance_m: null,
  }));
  return { mode: "region", radius_km: null, dtl_region: dtlRegion, q: null, items };
}

export async function searchLibrariesByName(q: string, _signal?: AbortSignal): Promise<LibraryListResponse> {
  const items = FAKE_LIBRARIES.filter((l) => l.name.includes(q)).map((l) => ({ ...l, distance_m: null }));
  return { mode: "search", radius_km: null, dtl_region: null, q, items };
}

export async function fetchLibrary(libraryId: number, _signal?: AbortSignal): Promise<LibraryDetail> {
  const base = FAKE_LIBRARIES.find((l) => l.id === libraryId);
  if (!base) throw new ApiCallError(404, "NOT_FOUND", "not found");
  return {
    ...base,
    distance_m: null,
    tel: "02-2011-5799",
    homepage: "https://jdlib.sen.go.kr",
    operating_time_text: "평일 09:00~22:00 / 주말 09:00~17:00",
    closed_text: "매월 첫째·셋째 수요일",
  };
}

// ── lib/platform (core APP-0 C2·C7) ───────────────────────────────────
export type LocateResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "aborted" };

export async function locate(_signal: AbortSignal): Promise<LocateResult> {
  return { ok: true, lat: 37.5815, lng: 126.9831 };
}

export async function requestLocationPermission(): Promise<"granted" | "denied"> {
  return "granted";
}

// ── lib/visits (core APP-0 C2) ────────────────────────────────────────
export async function getDefaultLibrary(): Promise<number | null> {
  return null;
}

export type VisitRecord = {
  libraryId: number;
  count: number;
  firstVisitedOn: string;
  lastVisitedOn: string;
  streakDays: number;
  defaultAsked: boolean;
};

/** 방문 기록 가짜 (library-visit.md VISIT-1b C7). 많이 간 순 */
export const FAKE_VISITS: VisitRecord[] = [
  { libraryId: 101, count: 5, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-15", streakDays: 1, defaultAsked: true },
  { libraryId: 102, count: 2, firstVisitedOn: "2026-11-10", lastVisitedOn: "2026-11-12", streakDays: 1, defaultAsked: false },
];

export async function getFrequentLibraries(limit = 3): Promise<VisitRecord[]> {
  return FAKE_VISITS.slice(0, Math.max(0, limit));
}

// ── 가짜 #9 응답 (core LIB-0 C7, VISIT-1b C7) ──────────────────────────
export type Book = {
  isbn13: string;
  title: string;
  author: string | null;
  publisher: string | null;
  cover_url: string | null;
  source: "kakao" | "naver" | "data4library" | "manual";
  description: string | null;
  pub_year: number | null;
};

export type RecommendationResponse = {
  kind: "popular";
  scope: "national" | "library";
  library_id: number | null;
  basis_label: string;
  theme: null;
  books: Book[];
  fetched_at: string | null;
  stale: boolean;
  fallback_reason: "not_configured" | "limit" | "provider_error" | "no_data" | null;
};

export const FAKE_RECOMMENDATIONS: RecommendationResponse = {
  kind: "popular",
  scope: "library",
  library_id: 101,
  basis_label: "정독도서관 · 최근 30일 대출",
  theme: null,
  books: [
    {
      isbn13: "9788936434120",
      title: "소년이 온다",
      author: "한강",
      publisher: "창비",
      cover_url: "https://example.invalid/cover/9788936434120.jpg",
      source: "data4library",
      description: "1980년 5월 광주를 겪은 사람들의 이야기.",
      pub_year: 2014,
    },
    {
      isbn13: "9788954682152",
      title: "불편한 편의점",
      author: "김호연",
      publisher: "나무옆의자",
      cover_url: null,
      source: "data4library",
      description: null,
      pub_year: null,
    },
  ],
  fetched_at: "2026-11-16T06:00:00+09:00",
  stale: false,
  fallback_reason: null,
};

export async function fetchRecommendations(_libraryId?: number, _signal?: AbortSignal): Promise<RecommendationResponse> {
  return FAKE_RECOMMENDATIONS;
}

// ── lib/regions (core APP-0 C2, K20 / 지역 표 가짜는 library-visit.md C7) ─────
export type Region = { code: string; sido: string; sigungu: string; label: string };

export const REGIONS: readonly Region[] = [
  { code: "11010", sido: "서울", sigungu: "종로구", label: "서울 종로구" },
  { code: "11030", sido: "서울", sigungu: "용산구", label: "서울 용산구" },
];

/** label·sigungu 부분 일치, 앞에서 일치가 먼저, 기본 10개 */
export function searchRegions(q: string, limit = 10): Region[] {
  const t = q.trim();
  if (!t) return [];
  const hits = REGIONS.filter((r) => r.label.includes(t) || r.sigungu.includes(t));
  const front = (r: Region) => (r.sigungu.startsWith(t) || r.label.startsWith(t) ? 0 : 1);
  return [...hits].sort((a, b) => front(a) - front(b)).slice(0, limit);
}

// ── lib/policy (core APP-0 C2, K18) ───────────────────────────────────
export const NEARBY_DEFAULT_RADIUS_KM = 3;
export const DEFAULT_START = { lat: 37.5665, lng: 126.978, dtlRegion: "11020", label: "서울 중구" } as const;

// ── lib/latest (core APP-0 P4 골격 그대로) ─────────────────────────────
export type LatestResult<T> = { status: "ok"; value: T } | { status: "stale" } | { status: "error"; error: unknown };

export function createLatestRunner() {
  let seq = 0;
  let current: AbortController | null = null;
  return {
    async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<LatestResult<T>> {
      current?.abort();
      const mine = ++seq;
      const ctrl = new AbortController();
      current = ctrl;
      try {
        const value = await task(ctrl.signal);
        return mine === seq ? { status: "ok", value } : { status: "stale" };
      } catch (error) {
        if (mine !== seq || ctrl.signal.aborted) return { status: "stale" };
        return { status: "error", error };
      }
    },
    cancel() {
      seq += 1;
      current?.abort();
      current = null;
    },
  };
}

// ── lib/map/KakaoMap (core APP-0 C2·C7) ───────────────────────────────
export type LatLng = { lat: number; lng: number };
export type MapMarker = {
  id: number;
  lat: number;
  lng: number;
  title: string;
  subtitle: string | null;
  tone: "normal" | "closed";
};
export type KakaoMapProps = {
  center: LatLng;
  level?: number;
  markers: MapMarker[];
  selectedId?: number | null;
  cluster?: boolean;
  onMarkerPress(id: number): void;
  onClusterPress?(center: LatLng): void;
  onRegionChange?(center: LatLng): void;
  onReady?(): void;
  onError(reason: "no_key" | "load_failed" | "timeout"): void;
};

/** core C7: 바로 onError("no_key")를 부른다 → 목록 화면이 먼저 보인다 */
export function KakaoMap(props: KakaoMapProps) {
  const { onError } = props;
  useEffect(() => {
    onError("no_key");
  }, [onError]);
  return React.createElement(React.Fragment);
}
