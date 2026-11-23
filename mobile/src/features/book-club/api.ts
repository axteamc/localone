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
