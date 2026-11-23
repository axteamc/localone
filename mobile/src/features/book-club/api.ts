// book-club 서버 호출(contracts/book-club.md CLUB-1 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError, type Book } from "../../lib/publicApi";

export { ApiCallError };

// K1-O3 (서버 clubs.py·0018과 같은 값, 앞뒤 공백을 뺀 글자 수)
export const NAME_MAX = 40;
export const INTRO_MAX = 500;
export const PLACE_MAX = 100;
export const COMMENT_MAX = 300;
export const REASON_MAX = 200;
export const REVIEW_MAX = 2000; // CLUB-2 K2-O7

export type ClubStatus = "open" | "closed" | "canceled" | "ended";

export type Club = {
  id: string;
  library: { id: number; name: string };
  name: string;
  intro: string | null;
  book: Book | null;
  place: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  status: ClubStatus;
  cancel_reason: string | null;
  host_nickname: string;
  is_host: boolean;
  participant_count: number;
  participants: { nickname: string; is_me: boolean }[];
  my_participation: "none" | "joined" | "left";
  previous_club_id: string | null;
};

/** 피드 카드(#32 `kind="club"`) */
export type ClubItem = {
  id: string;
  library_id: number;
  name: string;
  starts_at: string | null;
  place: string | null;
  status: ClubStatus;
  participant_count: number;
  capacity: number | null;
  published_at: string;
};

export type ClubInput = {
  name: string;
  intro: string | null;
  isbn13: string | null;
  place: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
};

export type ClubComment = { id: string; body: string; author_nickname: string; created_at: string; mine: boolean };
export type ClubCommentPage = { items: ClubComment[]; next_cursor: string | null };

async function send<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const response = await request(path, init, signal);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** 성공 응답(2xx)을 그대로 돌려준다. 실패는 `ApiCallError`로 던진다 */
async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
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
  return response;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const club = (clubId: string) => `clubs/${encodeURIComponent(clubId)}`;

/** #50 — 같은 clientRequestId면 서버가 처음 만든 모임을 돌려준다 */
export function createClub(libraryId: number, input: ClubInput, clientRequestId: string): Promise<Club> {
  return send<Club>(`libraries/${libraryId}/clubs`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ...input, client_request_id: clientRequestId }),
  });
}

/** #51 */
export function fetchClub(clubId: string, signal?: AbortSignal): Promise<Club> {
  return send<Club>(club(clubId), { method: "GET" }, signal);
}

/** #52 — 보낸 칸만 바뀐다 */
export function updateClub(clubId: string, patch: Partial<ClubInput>): Promise<Club> {
  return send<Club>(club(clubId), { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) });
}

/** #53 */
export function closeClub(clubId: string): Promise<Club> {
  return send<Club>(`${club(clubId)}/close`, { method: "POST" });
}

/** #54 */
export function cancelClub(clubId: string, reason: string): Promise<Club> {
  return send<Club>(`${club(clubId)}/cancel`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ reason }) });
}

/** #55 */
export function joinClub(clubId: string): Promise<Club> {
  return send<Club>(`${club(clubId)}/participation`, { method: "PUT" });
}

/** #56 */
export function leaveClub(clubId: string): Promise<Club> {
  return send<Club>(`${club(clubId)}/participation`, { method: "DELETE" });
}

/** #57 오래된 순 */
export function fetchClubComments(clubId: string, cursor: string | null, signal?: AbortSignal): Promise<ClubCommentPage> {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return send<ClubCommentPage>(`${club(clubId)}/comments${q}`, { method: "GET" }, signal);
}

/** #58 */
export function postClubComment(clubId: string, body: string, clientRequestId: string): Promise<ClubComment> {
  return send<ClubComment>(`${club(clubId)}/comments`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ body, client_request_id: clientRequestId }),
  });
}

/** #59 */
export function deleteClubComment(commentId: string): Promise<void> {
  return send<void>(`club-comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
}

// ─────────── CLUB-2 기록·후기·다음 모임·출석·운영 요청·제한 (C2·C3) ───────────

export type ClubRecord = {
  club: Club;
  my_participation: "joined" | "left" | "removed" | "none";
  my_attendance: "attended" | "no_show" | null;
  review: { body: string; updated_at: string } | null;
  shared_post_id: string | null;
  can_create_next: boolean;
  suggest_next: boolean;
};

/** #63 — 이름·소개·책·도서관은 서버가 복사한다. place를 빼면 이전 장소 */
export type NextClubInput = { place?: string | null; starts_at: string | null; ends_at: string | null };

/** #65 — 불참자만, `Club.participants`의 0부터 센 자리 */
export type AttendanceMark = { participant_index: number };

export type Restriction = {
  id: string;
  reason_kind: "comment" | "no_show";
  ends_at: string | null; // null = 운영자가 풀 때까지
  reason_text: string;
  review_requested: boolean;
};

/** #60 */
export function fetchClubRecord(clubId: string, signal?: AbortSignal): Promise<ClubRecord> {
  return send<ClubRecord>(`${club(clubId)}/record`, { method: "GET" }, signal);
}

/** #61 — 마지막 값으로 저장(나만 보기) */
export function putClubReview(clubId: string, body: string): Promise<ClubRecord> {
  return send<ClubRecord>(`${club(clubId)}/review`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ body }) });
}

/** #62 — 같은 clientRequestId·이미 올린 후기면 처음 게시물 그대로 */
export function shareClubReview(clubId: string, clientRequestId: string): Promise<ClubRecord> {
  return send<ClubRecord>(`${club(clubId)}/review/share`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ client_request_id: clientRequestId }),
  });
}

/** #63 */
export function createNextClub(clubId: string, input: NextClubInput, clientRequestId: string): Promise<Club> {
  return send<Club>(`${club(clubId)}/next`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ...input, client_request_id: clientRequestId }),
  });
}

/** #64 만든 순서 */
export async function fetchNextClubs(clubId: string, signal?: AbortSignal): Promise<ClubItem[]> {
  const page = await send<{ items: ClubItem[] }>(`${club(clubId)}/next`, { method: "GET" }, signal);
  return page.items;
}

/** #65 만든 사람 출석 확인 — 보낸 사람은 바로 불참·제한 */
export function putAttendance(clubId: string, marks: AttendanceMark[]): Promise<ClubRecord> {
  return send<ClubRecord>(`${club(clubId)}/attendance`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ marks }) });
}

/** #66 — 처음 요청 201, 이미 요청한 댓글 200 */
export async function requestCommentModeration(commentId: string, reason: string): Promise<{ alreadyRequested: boolean }> {
  const response = await request(`club-comments/${encodeURIComponent(commentId)}/moderation-request`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ reason }),
  });
  return { alreadyRequested: response.status === 200 };
}

/** #68 최근순 */
export async function fetchMyRestrictions(signal?: AbortSignal): Promise<Restriction[]> {
  const page = await send<{ items: Restriction[] }>("me/restrictions", { method: "GET" }, signal);
  return page.items;
}

/** #67 — 한 번만(이미 요청이면 그대로) */
export function requestRestrictionReview(restrictionId: string, text: string): Promise<Restriction> {
  return send<Restriction>(`me/restrictions/${encodeURIComponent(restrictionId)}/review-request`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ text }),
  });
}

/** 지금 걸린 제한: 없으면 null, 기간 없으면 "", 아니면 가장 늦은 만료 시각 */
export function activeRestrictionUntil(items: Restriction[], now = Date.now()): string | null {
  const active = items.filter((r) => r.ends_at === null || Date.parse(r.ends_at) > now);
  if (active.length === 0) return null;
  if (active.some((r) => r.ends_at === null)) return "";
  return active.reduce((a, b) => (Date.parse(b.ends_at!) > Date.parse(a.ends_at!) ? b : a)).ends_at;
}
