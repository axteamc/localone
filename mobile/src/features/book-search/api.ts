// 빌릴 예정 서버 호출(book-search.md LIB-3 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
// 빌릴 예정은 본인만 보는 메모이고 도서관 예약이 아니다(N1).
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";

export { ApiCallError };

export type LoanPlanStatus = "planned" | "released" | "converted";

export type LoanPlan = {
  id: string;
  book: { isbn13: string; title: string; author: string | null; cover_url: string | null };
  /** 도서관 미지정 예정이면 `null`(LIB-3b U1·U5, `includeUnassigned: true`로 읽을 때만 섞인다) */
  library: { id: number; name: string; area_label: string | null } | null;
  status: LoanPlanStatus;
  created_at: string;
};

export type LoanPlanPage = { items: LoanPlan[]; next_cursor: string | null };

async function send<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(`/api/v1/${path}`, { ...init, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
  }
  if (!response.ok) {
    let body: { error?: { code?: string; message?: string; detail?: string } } = {};
    try {
      body = await response.json();
    } catch {
      /* 본문이 없어도 실패는 실패로 던진다 */
    }
    throw new ApiCallError(
      response.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? "요청을 처리하지 못했어요.",
      body?.error?.detail ?? ""
    );
  }
  return response.json() as Promise<T>;
}

/** #16 `GET /api/v1/me/loan-plans` — 기본 `planned`, 최근 저장이 위. `includeUnassigned`면 미지정 예정도(U5) */
export function listLoanPlans(
  page: { cursor: string | null; limit?: number; includeUnassigned?: boolean },
  signal?: AbortSignal
): Promise<LoanPlanPage> {
  const params = new URLSearchParams();
  if (page.includeUnassigned) params.set("include_unassigned", "true");
  if (page.cursor) params.set("cursor", page.cursor);
  if (page.limit !== undefined) params.set("limit", String(page.limit));
  const query = params.toString();
  return send<LoanPlanPage>(`me/loan-plans${query ? `?${query}` : ""}`, { method: "GET" }, signal);
}

/** #17 `POST /api/v1/me/loan-plans` — 새로 201, 이미 있으면 200(같은 예정). `libraryId = null`이면 미지정 예정(U4·U6) */
export function saveLoanPlan(isbn13: string, libraryId: number | null): Promise<LoanPlan> {
  return send<LoanPlan>("me/loan-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isbn13, library_id: libraryId }),
  });
}

/** #18 `DELETE /api/v1/me/loan-plans/{plan_id}` — 두 번째도 200 */
export function releaseLoanPlan(planId: string): Promise<{ id: string; status: "released" }> {
  return send(`me/loan-plans/${encodeURIComponent(planId)}`, { method: "DELETE" });
}

// ── #70 여러 권 소장 조회(LIB-3b §2) ──

export type BatchFallbackCounts = { limit: number; provider_error: number; not_configured: number };

export type BatchCandidate = {
  library: {
    id: number;
    name: string;
    address: string | null;
    area_label: string | null;
    distance_m: number | null;
    today: { date: string; is_closed: boolean | null; hours_text: string | null; holiday_unchecked: boolean };
    tel: string | null;
    homepage: string | null;
  };
  holding_count: number;
  loanable_count: number;
  held_isbn13s: string[];
  loanable_isbn13s: string[];
  link: { url: string; kind: "homepage" } | null;
};

export type BatchAvailabilityResponse = {
  checked_at: string;
  radius_km: number;
  complete: boolean;
  unknown_pairs: number;
  fallback_counts: BatchFallbackCounts;
  books: { isbn13: string; plan_ids: string[]; status: "held" | "not_held" | "unknown" }[];
  candidates: BatchCandidate[];
};

/** #70 `POST /api/v1/me/loan-plans/availability` — `planIds = null`이면 내 활성 예정 전체(미지정 포함) */
export function fetchPlansAvailability(
  input: { planIds: string[] | null; lat: number; lng: number; radiusKm: number },
  signal?: AbortSignal
): Promise<BatchAvailabilityResponse> {
  const body: Record<string, unknown> = { lat: input.lat, lng: input.lng, radius_km: input.radiusKm };
  if (input.planIds !== null) body.plan_ids = input.planIds;
  return send<BatchAvailabilityResponse>(
    "me/loan-plans/availability",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    signal
  );
}
