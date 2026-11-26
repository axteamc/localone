// 남의 공개 프로필 서버 호출 — contracts/my-collection.md MY-4 C2·C3 (C-97).
// 로그인 없이도 부른다(apiFetch가 로그인했으면 토큰을 붙여 is_me·공감 표시가 맞춰진다).
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";
import type { FeedPost } from "../local-feed/api";

export { ApiCallError };

export type PostOrigin = "post" | "reading_log";

/** #74 `GET /api/v1/users/{profile_id}` */
export type UserProfile = {
  profile_id: string;
  nickname: string;
  bio: string | null;
  avatar_url: string | null;
  post_count: number;
  reading_log_count: number;
  is_me: boolean;
};

/** #75 `GET /api/v1/users/{profile_id}/posts?origin=` */
export type UserPostsPage = { items: FeedPost[]; next_cursor: string | null };

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

export function fetchUserProfile(profileId: string, signal?: AbortSignal): Promise<UserProfile> {
  return get<UserProfile>(`users/${encodeURIComponent(profileId)}`, signal);
}

export function fetchUserPosts(
  profileId: string,
  origin: PostOrigin,
  cursor?: string | null,
  signal?: AbortSignal
): Promise<UserPostsPage> {
  const q = new URLSearchParams({ origin });
  if (cursor) q.set("cursor", cursor);
  return get<UserPostsPage>(`users/${encodeURIComponent(profileId)}/posts?${q.toString()}`, signal);
}

/** M4-4: 처음 탭은 게시물. 게시물 0개이고 독서 기록이 있으면 독서 기록 */
export function firstTab(profile: Pick<UserProfile, "post_count" | "reading_log_count">): PostOrigin {
  return profile.post_count === 0 && profile.reading_log_count > 0 ? "reading_log" : "post";
}
