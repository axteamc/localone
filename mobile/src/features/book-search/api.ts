// 빌릴 예정 서버 호출(book-search.md LIB-3 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
// 빌릴 예정은 본인만 보는 메모이고 도서관 예약이 아니다(N1).
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";

export { ApiCallError };

export type LoanPlanStatus = "planned" | "released" | "converted";

export type LoanPlan = {
  id: string;
  book: { isbn13: string; title: string; author: string | null; cover_url: string | null };
  library: { id: number; name: string; area_label: string | null };
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

/** #16 `GET /api/v1/me/loan-plans` — 기본 `planned`, 최근 저장이 위 */
export function listLoanPlans(
  page: { cursor: string | null; limit?: number },
  signal?: AbortSignal
): Promise<LoanPlanPage> {
  const params = new URLSearchParams();
  if (page.cursor) params.set("cursor", page.cursor);
  if (page.limit !== undefined) params.set("limit", String(page.limit));
  const query = params.toString();
  return send<LoanPlanPage>(`me/loan-plans${query ? `?${query}` : ""}`, { method: "GET" }, signal);
}

/** #17 `POST /api/v1/me/loan-plans` — 새로 201, 이미 있으면 200(같은 예정) */
export function saveLoanPlan(isbn13: string, libraryId: number): Promise<LoanPlan> {
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
