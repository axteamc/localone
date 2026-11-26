export const RECENT_BOOK_LIMIT = 20;
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEBOUNCE_MS = 400;
export const BOOK_REQUEST_TIMEOUT_MS = 10_000;
export const LOCATE_TIMEOUT_MS = 10_000;
/** 반경(km). 서버 policy.NEARBY_RADII_KM과 같다(C-96: 2 추가) */
export type RadiusKm = 2 | 3 | 5;
export const NEARBY_RADII_KM: readonly RadiusKm[] = [2, 3, 5];
/** 검색(책 소장 "주변 찾기") 기본 반경. 설정에서 2·3·5로 바꾼다(C-96, 기기 저장) */
export const NEARBY_DEFAULT_RADIUS_KM = 3;
/** 홈 큐브(주인공 보기) 반경 — 설정과 상관없이 늘 2km(C-96) */
export const HOME_RADIUS_KM = 2;
/** 홈 지도 모드: 화면 가운데에서 가까운 몇 곳(C-96) */
export const MAP_NEAREST_COUNT = 5;
// core K18 / official data4library manual v20260620 p.63.
export const DEFAULT_START = {
  lat: 37.5665, lng: 126.9780, dtlRegion: "11020", label: "서울 중구",
} as const;
export const STORAGE_KEYS = {
  roughStart: "localone:rough_start:v1",
  recentBooks: (userId: string | null) => `recent_books:${userId ?? "guest"}`,
  visits: "localone:visits:v1",
  defaultLibrary: "localone:default_library:v1",
  lastRegion: "localone:last_region:v1",
  searchRadius: "localone:search_radius_km:v1",
} as const;
