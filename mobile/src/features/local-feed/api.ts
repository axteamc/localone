// local-feed 서버 호출(contracts/local-feed.md LOCAL-1 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";
import { buildImageFormData } from "./imagePicker";

export { ApiCallError };

export type ImageKind = "photo" | "cover" | "color";
export const COLOR_TOKENS = ["fill1", "fill2", "fill3", "cream", "paper", "inkStrong"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const OVERLAY_MAX = 80;
export const BODY_MAX = 2000;

export type UploadedImage = {
  image_path: string;
  image_url: string;
  width: number;
  height: number;
  bytes: number;
};

export type PostCreateInput = {
  client_request_id: string;
  library_id: number;
  isbn13: string | null;
  image_kind: ImageKind;
  image_path: string | null;
  image_color: ColorToken | null;
  overlay_text: string | null;
  body: string | null;
};

export type Post = {
  id: string;
  library: { id: number; name: string };
  book: { isbn13: string; title: string; author: string | null; cover_url: string | null } | null;
  image_kind: ImageKind;
  image_url: string | null;
  image_color: ColorToken | null;
  overlay_text: string | null;
  body: string | null;
  author: { nickname: string };
  is_mine: boolean;
  reaction_count: number;
  my_reaction: boolean;
  my_bookmark: boolean;
  published_at: string;
};

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

/** #23 `POST /api/v1/uploads/post-images` */
export async function uploadPostImage(fileUri: string, signal?: AbortSignal): Promise<UploadedImage> {
  const form = await buildImageFormData(fileUri);
  return send<UploadedImage>("uploads/post-images", { method: "POST", body: form }, signal);
}

/** #24 `POST /api/v1/posts` — 같은 client_request_id면 서버가 첫 게시물을 돌려준다(F9) */
export function createPost(input: PostCreateInput, signal?: AbortSignal): Promise<Post> {
  return send<Post>(
    "posts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    signal
  );
}

/** #25 `POST /api/v1/posts/{post_id}/withdraw` */
export function withdrawPost(
  postId: string,
  signal?: AbortSignal
): Promise<{ id: string; status: "withdrawn" }> {
  return send(`posts/${encodeURIComponent(postId)}/withdraw`, { method: "POST" }, signal);
}

// ─────────── LOCAL-2 (contracts/local-feed.md LOCAL-2 C2·C3) ───────────

/** 피드 카드 한 장(#26·#28). 작성자·공감 수·본문은 없다(H4) */
export type FeedPost = {
  id: string;
  library_id: number;
  library_name: string;
  image_kind: ImageKind;
  image_url: string | null;
  image_color: ColorToken | null;
  overlay_text: string | null;
  book: { isbn13: string; title: string; author: string | null } | null;
  published_at: string;
  my_reaction: boolean;
  my_bookmark: boolean;
};

export type FeedPage = { items: FeedPost[]; next_cursor: string | null };
export type ReactionState = { post_id: string; reacted: boolean; reaction_count: number };
export type BookmarkState = { post_id: string; bookmarked: boolean };

function pageQuery(page: { cursor: string | null; limit?: number; exclude?: string }): string {
  const q = new URLSearchParams();
  if (page.cursor) q.set("cursor", page.cursor);
  if (page.limit !== undefined) q.set("limit", String(page.limit));
  if (page.exclude) q.set("exclude", page.exclude);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** #26 `GET /api/v1/libraries/{library_id}/posts` — 최신순만(H1) */
export function fetchLibraryPosts(
  libraryId: number,
  page: { cursor: string | null; limit?: number },
  signal?: AbortSignal
): Promise<FeedPage> {
  return send<FeedPage>(`libraries/${libraryId}/posts${pageQuery(page)}`, { method: "GET" }, signal);
}

/** #29 `PUT|DELETE /api/v1/posts/{post_id}/reaction` — 몇 번 보내도 결과가 같다(H5) */
export function setReaction(postId: string, on: boolean): Promise<ReactionState> {
  return send<ReactionState>(`posts/${encodeURIComponent(postId)}/reaction`, { method: on ? "PUT" : "DELETE" });
}

/** #30 `PUT|DELETE /api/v1/posts/{post_id}/bookmark` — 해제는 확인 창 없이(H6) */
export function setBookmark(postId: string, on: boolean): Promise<BookmarkState> {
  return send<BookmarkState>(`posts/${encodeURIComponent(postId)}/bookmark`, { method: on ? "PUT" : "DELETE" });
}

/** #27 `GET /api/v1/posts/{post_id}` — 철회·숨김은 404 POST_NOT_AVAILABLE(H3) */
export function fetchPost(postId: string, signal?: AbortSignal): Promise<Post> {
  return send<Post>(`posts/${encodeURIComponent(postId)}`, { method: "GET" }, signal);
}

/** #28 `GET /api/v1/books/{isbn13}/posts` — 같은 책, 다른 도서관 포함(H7) */
export function fetchBookPosts(
  isbn13: string,
  page: { cursor: string | null; exclude?: string; limit?: number },
  signal?: AbortSignal
): Promise<FeedPage> {
  return send<FeedPage>(`books/${encodeURIComponent(isbn13)}/posts${pageQuery(page)}`, { method: "GET" }, signal);
}

// ─────────── 상세에서 내린 글을 피드에서 바로 감추기(LOCAL-1 F16 "피드로 돌아가 카드를 감추고 '내렸어요'") ───────────

type WithdrawnListener = (postId: string) => void;
const withdrawnListeners = new Set<WithdrawnListener>();

export function onPostWithdrawn(listener: WithdrawnListener): () => void {
  withdrawnListeners.add(listener);
  return () => {
    withdrawnListeners.delete(listener);
  };
}

export function emitPostWithdrawn(postId: string): void {
  withdrawnListeners.forEach((l) => l(postId));
}

// ─────────── 상세에서 바꾼 공감·북마크를 마운트된 피드 카드 메뉴에 맞추기(PR #141 사후 검토 ①-2) ───────────
// 바뀐 필드만 보낸다. 피드가 언마운트돼 있던 동안의 변경은 다시 마운트될 때 서버 목록으로 새로 받는다.

export type PostReactionPatch = Partial<Pick<FeedPost, "my_reaction" | "my_bookmark">>;
type ReactionListener = (postId: string, patch: PostReactionPatch) => void;
const reactionListeners = new Set<ReactionListener>();

export function onPostReaction(listener: ReactionListener): () => void {
  reactionListeners.add(listener);
  return () => {
    reactionListeners.delete(listener);
  };
}

export function emitPostReaction(postId: string, patch: PostReactionPatch): void {
  reactionListeners.forEach((l) => l(postId, patch));
}

// ─────────── VISIT-3 책장(contracts/local-feed.md VISIT-3 C2·C3) ───────────

export type ShelfKind = "recent_reads" | "popular" | "theme";
export type ShelfBook = { isbn13: string; title: string; author: string | null; cover_url: string | null };
export type ShelfPage = { kind: ShelfKind; title: string; basis_label: string | null; books: ShelfBook[] };
export type ShelfResponse = { pages: ShelfPage[] };

/** #31 `GET /api/v1/libraries/{library_id}/shelf` (D core M2-0-P3) — 빈 페이지는 서버가 빼서 준다 */
export function fetchShelf(libraryId: number, signal?: AbortSignal): Promise<ShelfResponse> {
  return send<ShelfResponse>(`libraries/${libraryId}/shelf`, { method: "GET" }, signal);
}
