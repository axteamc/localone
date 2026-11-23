// 내 독서 기록 서버 호출(reading-log.md READ-1 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
// 기록은 본인만 본다(R1-1). 책장 캐시는 로그아웃 때 비운다(C6 계정 전환, registerSignOutCleanup).
import { apiFetch } from "../../auth/apiFetch";
import { registerSignOutCleanup } from "../../auth/AuthProvider";
import { ApiCallError } from "../../lib/publicApi";

export { ApiCallError };

export type ReadingLog = {
  id: string;
  book: { isbn13: string; title: string; author: string | null; cover_url: string | null };
  library: { id: number; name: string } | null;
  read_on: string | null;
  note: string | null;
  quote: string | null;
  loan_id: string | null;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReadingLogPage = { items: ReadingLog[]; next_cursor: string | null };

/** #43 요청 칸. `libraryId`·`loanId`·`readOn`·`note`·`quote`는 null이면 비운다 */
export type ReadingLogInput = {
  isbn13: string;
  libraryId?: number | null;
  readOn?: string | null;
  note?: string | null;
  quote?: string | null;
  loanId?: string | null;
};

export const NOTE_MAX = 2000; // R1-O3
export const QUOTE_MAX = 300; // R1-O3

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
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function toBody(input: Partial<ReadingLogInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.isbn13 !== undefined) body.isbn13 = input.isbn13;
  if (input.libraryId !== undefined) body.library_id = input.libraryId;
  if (input.readOn !== undefined) body.read_on = input.readOn;
  if (input.note !== undefined) body.note = input.note;
  if (input.quote !== undefined) body.quote = input.quote;
  if (input.loanId !== undefined) body.loan_id = input.loanId;
  return body;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const logPath = (logId: string) => `me/reading-logs/${encodeURIComponent(logId)}`;

/** #41 `GET /api/v1/me/reading-logs` — 책장 순서(읽은 날, 없으면 쓴 날 최근 순) */
export function fetchReadingLogs(
  q: { libraryId?: number; cursor?: string | null; limit?: number },
  signal?: AbortSignal
): Promise<ReadingLogPage> {
  const params = new URLSearchParams();
  if (q.libraryId !== undefined) params.set("library_id", String(q.libraryId));
  if (q.cursor) params.set("cursor", q.cursor);
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  const query = params.toString();
  return send<ReadingLogPage>(`me/reading-logs${query ? `?${query}` : ""}`, { method: "GET" }, signal);
}

/** #42 `GET /api/v1/me/reading-logs/{log_id}` — 남의 것·없는 것은 같은 404 */
export function fetchReadingLog(logId: string, signal?: AbortSignal): Promise<ReadingLog> {
  return send<ReadingLog>(logPath(logId), { method: "GET" }, signal);
}

/** #43 `POST /api/v1/me/reading-logs` — 같은 clientRequestId면 같은 기록 200(연타·다시 저장) */
export function createReadingLog(input: ReadingLogInput, clientRequestId: string): Promise<ReadingLog> {
  return send<ReadingLog>("me/reading-logs", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ...toBody(input), client_request_id: clientRequestId }),
  });
}

/** #45 `PATCH /api/v1/me/reading-logs/{log_id}` — 보낸 칸만. 책(isbn13)은 보내지 않는다 */
export function updateReadingLog(logId: string, patch: Partial<ReadingLogInput>): Promise<ReadingLog> {
  const { isbn13: _ignored, ...rest } = patch;
  return send<ReadingLog>(logPath(logId), {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(toBody(rest)),
  });
}

/** #44 `DELETE /api/v1/me/reading-logs/{log_id}` — 204, 이미 없으면 404 */
export function deleteReadingLog(logId: string): Promise<void> {
  return send<void>(logPath(logId), { method: "DELETE" });
}

// ─────────── 책장 캐시: 쓰기·수정·지우기가 책장에 바로 보이게 + 로그아웃 때 비움 ───────────

export type ShelfState = {
  owner: string | null;
  items: ReadingLog[] | null;
  nextCursor: string | null;
  /** 책장으로 돌아왔을 때 한 번 띄울 안내("저장했어요"·"기록을 지웠어요") */
  notice: string | null;
};

const EMPTY: ShelfState = { owner: null, items: null, nextCursor: null, notice: null };
let shelf: ShelfState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: ShelfState) {
  shelf = next;
  for (const fn of Array.from(listeners)) fn();
}

export const shelfStore = {
  get: (): ShelfState => shelf,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** 서버에서 받은 첫 묶음(또는 이어 받은 묶음)을 넣는다. 다른 계정이면 먼저 비운다 */
  setPage(owner: string, page: ReadingLogPage, append: boolean) {
    const base = shelf.owner === owner && append ? shelf.items ?? [] : [];
    const seen = new Set(base.map((l) => l.id));
    emit({
      ...shelf,
      owner,
      items: [...base, ...page.items.filter((l) => !seen.has(l.id))],
      nextCursor: page.next_cursor,
      notice: shelf.owner === owner ? shelf.notice : null,
    });
  },
  /** 새 기록·고친 기록을 넣는다(책장 순서로 다시 정렬) */
  upsert(owner: string, log: ReadingLog, notice: string | null = null) {
    if (shelf.owner !== owner || shelf.items === null) {
      emit({ ...shelf, notice: notice ?? shelf.notice });
      return;
    }
    const rest = shelf.items.filter((l) => l.id !== log.id);
    emit({ ...shelf, items: sortShelf([log, ...rest]), notice: notice ?? shelf.notice });
  },
  remove(owner: string, logId: string, notice: string | null = null) {
    if (shelf.owner !== owner || shelf.items === null) {
      emit({ ...shelf, notice: notice ?? shelf.notice });
      return;
    }
    emit({ ...shelf, items: shelf.items.filter((l) => l.id !== logId), notice: notice ?? shelf.notice });
  },
  takeNotice(): string | null {
    const notice = shelf.notice;
    if (notice !== null) emit({ ...shelf, notice: null });
    return notice;
  },
  clear() {
    emit(EMPTY);
  },
};

registerSignOutCleanup(() => shelfStore.clear());

/** 서울 날짜 "YYYY-MM-DD"(기기 시간대와 무관). 읽은 날 기본값·미래 날짜 막기에 쓴다 */
export function seoulToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 책장 위치 날짜: 읽은 날, 없으면 쓴 날(서버 #41 정렬과 같다) */
export function shelfDate(log: ReadingLog): string {
  return log.read_on ?? seoulToday(new Date(log.created_at));
}

export function sortShelf(items: ReadingLog[]): ReadingLog[] {
  return [...items].sort((a, b) => {
    const d = shelfDate(b).localeCompare(shelfDate(a));
    if (d !== 0) return d;
    const c = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (c !== 0) return c;
    return b.id.localeCompare(a.id);
  });
}
