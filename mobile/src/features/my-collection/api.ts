// 내 정보 모음 서버 호출 — contracts/my-collection.md MY-1 C2·C3. 오류는 core `ApiCallError` 모양 그대로 던진다.
// local-feed의 send()는 내보내지 않아(B 파일 수정 금지) 같은 규칙을 여기 짧게 둔다.
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";
import type { FeedPost, StampItem } from "../local-feed/api";
import { buildImageFormData } from "../local-feed/imagePicker";

export { ApiCallError };

/** `GET /api/v1/me/profile` */
export type MyProfile = {
  user_id: string;
  nickname: string;
  bio: string | null;
  avatar_url: string | null;
  updated_at: string;
};

/** `FeedPost` 호환 + 모은 시각 */
export type MyCollectionPost = FeedPost & {
  item_kind: "post";
  collected_at: string;
};

/** `StampItem` 호환 + 도서관 이름·모은 시각(MY-3 C3) */
export type MyCollectionStamp = StampItem & {
  item_kind: "stamp";
  library_name: string;
  collected_at: string;
};

export type MyCollectionItem = MyCollectionPost | MyCollectionStamp;
export type MyCollectionPage<T = MyCollectionPost> = { items: T[]; next_cursor: string | null };

export type VisitedLibrary = {
  library: { id: number; name: string; address: string | null; area_label: string | null };
  stamp_days: number;
  guestbook_count: number;
  first_on: string;
  last_on: string;
};
export type VisitedLibrariesPage = { items: VisitedLibrary[]; next_cursor: string | null };

export type PageArgs = { cursor?: string | null; limit?: number };

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return send<T>(path, { method: "GET" }, signal);
}

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

export function fetchMyBookmarks(page?: PageArgs, signal?: AbortSignal): Promise<MyCollectionPage<MyCollectionItem>> {
  return get<MyCollectionPage<MyCollectionItem>>(`me/bookmarks${pageQuery(page)}`, signal);
}

/** #40 `GET /api/v1/me/visited-libraries` (MY-3-P1) */
export function fetchVisitedLibraries(cursor?: string | null, signal?: AbortSignal): Promise<VisitedLibrariesPage> {
  return get<VisitedLibrariesPage>(`me/visited-libraries${pageQuery({ cursor })}`, signal);
}

// ─────────── MY-2 (C2) ───────────

export type ProfilePatch = { nickname?: string; bio?: string | null; avatar_path?: string | null };

/** #38 `PATCH /api/v1/me/profile` — 보낸 칸만 바뀐다(Y2-5) */
export function updateMyProfile(patch: ProfilePatch): Promise<MyProfile> {
  return send<MyProfile>("me/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** #39 `POST /api/v1/uploads/avatar` — LOCAL-1 묶음(`image`)을 `file` 칸으로 옮겨 보낸다(플랫폼 분기는 imagePicker에만) */
export async function uploadAvatar(file: { uri: string; mime: string }): Promise<{ avatar_path: string }> {
  const [part] = (await buildImageFormData(file.uri)).getAll("image");
  const form = new FormData();
  form.append("file", part as Blob, "avatar.jpg");
  return send<{ avatar_path: string }>("uploads/avatar", { method: "POST", body: form });
}

/** #47 `GET /api/v1/me/inbox/unread` (D M2-0-P1) */
export function fetchInboxUnread(signal?: AbortSignal): Promise<{ has_unread: boolean }> {
  return get<{ has_unread: boolean }>("me/inbox/unread", signal);
}
