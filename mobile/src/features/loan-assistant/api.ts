// 내 대출 서버 호출(loan-assistant.md LOAN-1 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
// 대출일·D-day는 서버가 정한다(M2·M4). 앱은 받은 값을 그대로 보여 준다.
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";

export { ApiCallError };

export type LoanStatus = "on_loan" | "returned";

export type Loan = {
  id: string;
  book: { isbn13: string; title: string; author: string | null; cover_url: string | null };
  library: { id: number; name: string } | null;
  plan_id: string | null;
  loaned_on: string;
  due_on: string;
  due_on_assumed: boolean;
  status: LoanStatus;
  returned_on: string | null;
  d_day: number;
  is_overdue: boolean;
};

export type LoanPage = { items: Loan[]; next_cursor: string | null; today: string };

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

/** #19 `GET /api/v1/me/loans` — 빌린 책은 반납 임박 순, 지난 대출은 최근 반납 순 */
export function listLoans(
  status: LoanStatus,
  page: { cursor: string | null; limit?: number },
  signal?: AbortSignal
): Promise<LoanPage> {
  const params = new URLSearchParams({ status });
  if (page.cursor) params.set("cursor", page.cursor);
  if (page.limit !== undefined) params.set("limit", String(page.limit));
  return send<LoanPage>(`me/loans?${params.toString()}`, { method: "GET" }, signal);
}

/** #20 `POST /api/v1/me/loans` — 새로 201, 대출 중인 같은 책이면 있는 대출 200(M5). 날짜는 보내지 않는다(M2) */
export function startLoan(input: { isbn13: string; libraryId?: number; planId?: string }): Promise<Loan> {
  const body: Record<string, string | number> = { isbn13: input.isbn13 };
  if (input.libraryId !== undefined) body.library_id = input.libraryId;
  if (input.planId !== undefined) body.plan_id = input.planId;
  return send<Loan>("me/loans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
