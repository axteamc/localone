import { apiFetch } from "../auth/apiFetch";
import { NEARBY_DEFAULT_RADIUS_KM } from "./policy";

export type Book = {
  isbn13: string; title: string; author: string | null; publisher: string | null;
  cover_url: string | null; source: "kakao" | "naver" | "data4library" | "yes24" | "manual";
  description: string | null; pub_year: number | null;
};
export type Today = { date: string; is_closed: boolean | null; hours_text: string | null; holiday_unchecked: boolean };
export type LibrarySummary = {
  id: number; name: string; address: string | null; latitude: number | null; longitude: number | null;
  dtl_region_code: string | null; area_label: string | null; distance_m: number | null; today: Today;
};
export type LibraryDetail = LibrarySummary & {
  tel: string | null; homepage: string | null; operating_time_text: string | null; closed_text: string | null;
};
export type LiveCheck = { url: string; kind: "isbn_search" | "homepage" };
type FallbackReason = "not_configured" | "limit" | "provider_error" | "no_data" | null;
export type BookSearchResponse = {
  items: Book[]; next_start: number | null; source: "kakao" | "cache"; fallback_reason: FallbackReason;
};
export type RecommendationResponse = {
  kind: "popular"; scope: "national" | "library"; library_id: number | null; basis_label: string;
  theme: null; books: Book[]; fetched_at: string | null; stale: boolean; fallback_reason: FallbackReason;
};
export type LibraryListResponse = {
  mode: "nearby" | "region" | "search"; radius_km: number | null;
  dtl_region: string | null; q: string | null; items: LibrarySummary[];
};
export type AvailabilityItem = {
  library: Pick<LibrarySummary, "id" | "name" | "address" | "area_label" | "distance_m" | "today"> & { tel: string | null };
  holding: "yes" | "no" | "unknown"; loanable: "yes" | "no" | "unknown";
  basis: "today" | "stale" | "none"; source: string | null; observed_at: string | null;
  data_date: string | null; data_date_assumed: boolean; fallback_reason: FallbackReason; live_check: LiveCheck | null;
};
export type AvailabilityResponse = {
  isbn13: string; scope: "nearby" | "city" | "library"; radius_km: number | null;
  dtl_region: string | null; checked_at: string; items: AvailabilityItem[];
};
export type PurchaseLink = { isbn13: string; provider: "yes24"; kind: "product" | "search"; url: string };
export class ApiCallError extends Error {
  constructor(public status: number, public code: string, message: string, public detail: string) {
    super(message); this.name = "ApiCallError";
  }
}
function pathWithQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = Object.entries(params).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return `/api/v1/${path}${query ? `?${query}` : ""}`;
}
async function get<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  return request<T>(pathWithQuery(path, params), { signal });
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response;
  try { response = await apiFetch(path, options); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
  }
  if (!response.ok) {
    let body: { error?: { code?: string; message?: string; detail?: string } } = {};
    try { body = await response.json(); } catch { /* HTTP failure must still reject. */ }
    throw new ApiCallError(response.status, body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? "요청을 처리하지 못했어요.", body?.error?.detail ?? "");
  }
  return response.json() as Promise<T>;
}
export type Place = { id: string; name: string; area_label: string; lat: number; lng: number };

export function searchPlaces(query: string, signal: AbortSignal) {
  return request<{ items: Place[] }>("/api/v1/places/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal,
  });
}

const bookPath = (isbn13: string) => `books/${encodeURIComponent(isbn13)}`;
export function searchBooks(q: string, start = 1, signal?: AbortSignal): Promise<BookSearchResponse> {
  return get("books/search", { q, start }, signal);
}
export function fetchBook(isbn13: string, signal?: AbortSignal): Promise<Book> { return get(bookPath(isbn13), {}, signal); }
export function fetchRecommendations(libraryId?: number, signal?: AbortSignal): Promise<RecommendationResponse> {
  return get("books/recommendations", { library_id: libraryId }, signal);
}
export function fetchLibrariesNearby(lat: number, lng: number, radiusKm: 3 | 5 = NEARBY_DEFAULT_RADIUS_KM, signal?: AbortSignal): Promise<LibraryListResponse> {
  return get("libraries", { lat, lng, radius_km: radiusKm }, signal);
}
export function fetchLibrariesInRegion(dtlRegion: string, signal?: AbortSignal): Promise<LibraryListResponse> {
  return get("libraries", { dtl_region: dtlRegion }, signal);
}
export function searchLibrariesByName(q: string, signal?: AbortSignal): Promise<LibraryListResponse> { return get("libraries", { q }, signal); }
export function fetchLibrary(libraryId: number, signal?: AbortSignal): Promise<LibraryDetail> { return get(`libraries/${libraryId}`, {}, signal); }
export function fetchAvailabilityNearby(isbn13: string, lat: number, lng: number, radiusKm: 3 | 5 = NEARBY_DEFAULT_RADIUS_KM, signal?: AbortSignal): Promise<AvailabilityResponse> {
  return get(`${bookPath(isbn13)}/availability`, { scope: "nearby", lat, lng, radius_km: radiusKm }, signal);
}
export function fetchAvailabilityInCity(isbn13: string, dtlRegion: string, signal?: AbortSignal): Promise<AvailabilityResponse> {
  return get(`${bookPath(isbn13)}/availability`, { scope: "city", dtl_region: dtlRegion }, signal);
}
export function fetchAvailabilityAt(isbn13: string, libraryId: number, signal?: AbortSignal): Promise<AvailabilityResponse> {
  return get(`${bookPath(isbn13)}/availability`, { library_id: libraryId }, signal);
}
export function fetchPurchaseLink(isbn13: string, signal?: AbortSignal): Promise<PurchaseLink> {
  return get(`${bookPath(isbn13)}/purchase-link`, {}, signal);
}
