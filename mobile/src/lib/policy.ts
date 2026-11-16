export const RECENT_BOOK_LIMIT = 20;
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEBOUNCE_MS = 400;
export const BOOK_REQUEST_TIMEOUT_MS = 10_000;
export const LOCATE_TIMEOUT_MS = 10_000;
export const NEARBY_DEFAULT_RADIUS_KM = 3;
// core K18 / official data4library manual v20260620 p.63.
export const DEFAULT_START = {
  lat: 37.5665, lng: 126.9780, dtlRegion: "11020", label: "서울 중구",
} as const;
export const STORAGE_KEYS = {
  recentBooks: (userId: string | null) => `recent_books:${userId ?? "guest"}`,
  visits: "localone:visits:v1",
  defaultLibrary: "localone:default_library:v1",
} as const;
