// 내 정보 모음 서버 호출 — contracts/my-collection.md MY-1 C2·C3. 오류는 core `ApiCallError` 모양 그대로 던진다.
// local-feed의 send()는 내보내지 않아(B 파일 수정 금지) 같은 규칙을 여기 짧게 둔다.
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";
import type { FeedPost } from "../local-feed/api";

export { ApiCallError };

/** `GET /api/v1/me/profile` */
export type MyProfile = {
  user_id: string;
  nickname: string;
  bio: string | null;
  avatar_url: string | null;
  updated_at: string;
};

/** `FeedPost` 호환 + 모은 시각. MY-1은 게시물만(`item_kind: "post"`, TODO(연결): VISIT-4 D3) */
export type MyCollectionPost = FeedPost & {
  item_kind: "post";
  collected_at: string;
};

export type MyCollectionPage = { items: MyCollectionPost[]; next_cursor: string | null };

export type PageArgs = { cursor?: string | null; limit?: number };

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(`/api/v1/${path}`, { method: "GET", signal });
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

function pageQuery(page?: PageArgs): string {
  const q = new URLSearchParams();
  if (page?.cursor) q.set("cursor", page.cursor);
  if (page?.limit !== undefined) q.set("limit", String(page.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fetchMyProfile(signal?: AbortSignal): Promise<MyProfile> {
  return get<MyProfile>("me/profile", signal);
}

export function fetchMyPosts(page?: PageArgs, signal?: AbortSignal): Promise<MyCollectionPage> {
  return get<MyCollectionPage>(`me/posts${pageQuery(page)}`, signal);
}

export function fetchMyReactions(page?: PageArgs, signal?: AbortSignal): Promise<MyCollectionPage> {
  return get<MyCollectionPage>(`me/reactions${pageQuery(page)}`, signal);
}

export function fetchMyBookmarks(page?: PageArgs, signal?: AbortSignal): Promise<MyCollectionPage> {
  return get<MyCollectionPage>(`me/bookmarks${pageQuery(page)}`, signal);
}
