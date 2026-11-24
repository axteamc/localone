// local-feed 서버 호출(contracts/local-feed.md LOCAL-1 C2·C3). 오류는 core `ApiCallError` 모양 그대로 던진다.
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";
import { buildImageFormData } from "./imagePicker";

export { ApiCallError };

export type ImageKind = "photo" | "cover" | "color";
/** H6 선정 피드 단색 9개(글쓰기 선택지). 값은 CUBE_PALETTE 이름과 같다. */
export const COLOR_TOKENS = [
  "bold",
  "coral",
  "lemonZest",
  "vanillaCanvas",
  "vanilla",
  "complementary",
  "atlanticBlue",
  "indigoDrift",
  "crimsonWhisper",
] as const;
/** 옛 6개 토큰 호환(기존 게시물·표지 없는 책 fallback "fill3" 등). */
export const LEGACY_COLOR_TOKENS = ["fill1", "fill2", "fill3", "cream", "paper", "inkStrong"] as const;
export type LegacyColorToken = (typeof LEGACY_COLOR_TOKENS)[number];
export type ColorToken = (typeof COLOR_TOKENS)[number] | LegacyColorToken;

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

function pageQuery(page: { cursor: string | null; limit?: number; exclude?: string; expand?: "region" }): string {
  const q = new URLSearchParams();
  if (page.cursor) q.set("cursor", page.cursor);
  if (page.limit !== undefined) q.set("limit", String(page.limit));
  if (page.exclude) q.set("exclude", page.exclude);
  if (page.expand) q.set("expand", page.expand);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** #26 `GET /api/v1/libraries/{library_id}/posts` — 최신순만(H1) */
export function fetchLibraryPosts(
  libraryId: number,
  page: { cursor: string | null; limit?: number; expand?: "region" },
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

// ─────────── VISIT-3 방명록·혼합 피드(contracts/local-feed.md VISIT-3 C2·C3) ───────────

export const GUESTBOOK_MAX = 140; // V3-O5

export type GuestbookItem = {
  id: string;
  library_id: number;
  body: string;
  author_nickname: string;
  published_at: string;
  mine: boolean;
};

// ─────────── VISIT-4 방문 스탬프(contracts/local-feed.md VISIT-4 C2·C3) ───────────

export type StampVisibility = "private" | "public";
export type MyStamp = { id: string; stamped_on: string; visibility: StampVisibility };
export type TodayStamp = { stamped: boolean; stamp: MyStamp | null };

/** 피드의 공개 스탬프 카드(C3). user_id는 없다 */
export type StampItem = {
  id: string;
  library_id: number;
  stamped_on: string;
  author_nickname: string;
  published_at: string;
  mine: boolean;
  my_bookmark: boolean;
};

/** #32 항목. VISIT-4 `stamp`, CLUB-1 `club`이 종류를 더한다 — 모르는 종류는 그리지 않는다 */
export type FeedItem =
  | { kind: "post"; post: FeedPost }
  | { kind: "guestbook"; guestbook: GuestbookItem }
  | { kind: "stamp"; stamp: StampItem }
  | { kind: string; [key: string]: unknown };

export type FeedItemPage = { items: FeedItem[]; next_cursor: string | null };

export function isPostItem(item: FeedItem): item is { kind: "post"; post: FeedPost } {
  return item.kind === "post" && typeof item.post === "object" && item.post !== null;
}

export function isGuestbookItem(item: FeedItem): item is { kind: "guestbook"; guestbook: GuestbookItem } {
  return item.kind === "guestbook" && typeof item.guestbook === "object" && item.guestbook !== null;
}

export function isStampItem(item: FeedItem): item is { kind: "stamp"; stamp: StampItem } {
  const stamp = (item as { stamp?: unknown }).stamp as Partial<StampItem> | null | undefined;
  return item.kind === "stamp" && typeof stamp === "object" && stamp !== null && typeof stamp.id === "string";
}

/** 같은 항목 판별용 열쇠(종류 + id). 모르는 종류는 null */
export function feedItemKey(item: FeedItem): string | null {
  if (isPostItem(item)) return `post:${item.post.id}`;
  if (isGuestbookItem(item)) return `guestbook:${item.guestbook.id}`;
  if (isStampItem(item)) return `stamp:${item.stamp.id}`;
  if (item.kind === "club" && typeof item.club === "object" && item.club !== null) {
    const id = (item.club as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return `club:${id}`;
  }
  return null;
}

/** #32 `GET /api/v1/libraries/{library_id}/feed` — 게시물·방명록 혼합, 최신순(V3-8) */
export function fetchLibraryFeedItems(
  libraryId: number,
  page: { cursor: string | null; limit?: number },
  signal?: AbortSignal
): Promise<FeedItemPage> {
  return send<FeedItemPage>(`libraries/${libraryId}/feed${pageQuery(page)}`, { method: "GET" }, signal);
}

/** #33 `POST /api/v1/libraries/{library_id}/guestbook` — 같은 clientRequestId면 같은 글(200, V3-9) */
export function postGuestbook(libraryId: number, body: string, clientRequestId: string): Promise<GuestbookItem> {
  return send<GuestbookItem>(`libraries/${libraryId}/guestbook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, client_request_id: clientRequestId }),
  });
}

/** #34 `POST /api/v1/guestbook/{entry_id}/withdraw` — 이미 지운 글도 200 */
export async function withdrawGuestbook(entryId: string): Promise<void> {
  await send<{ ok: boolean }>(`guestbook/${encodeURIComponent(entryId)}/withdraw`, { method: "POST" });
}

/** #35 `GET /api/v1/libraries/{library_id}/stamps/today` — 로그인 필수 */
export function fetchTodayStamp(libraryId: number, signal?: AbortSignal): Promise<TodayStamp> {
  return send<TodayStamp>(`libraries/${libraryId}/stamps/today`, { method: "GET" }, signal);
}

/** #36 `PUT /api/v1/libraries/{library_id}/stamps/today` — 멱등. 공개 바꾸기는 expectedStampId(어긋나면 409 STAMP_DATE_CHANGED) */
export function putTodayStamp(
  libraryId: number,
  visibility: StampVisibility,
  expectedStampId?: string
): Promise<TodayStamp> {
  const body: { visibility: StampVisibility; expected_stamp_id?: string } = { visibility };
  if (expectedStampId) body.expected_stamp_id = expectedStampId;
  return send<TodayStamp>(`libraries/${libraryId}/stamps/today`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** #69 `PUT|DELETE /api/v1/stamps/{stamp_id}/bookmark` — 멱등(V4-11) */
export function setStampBookmark(stampId: string, bookmarked: boolean): Promise<{ bookmarked: boolean }> {
  return send<{ bookmarked: boolean }>(`stamps/${encodeURIComponent(stampId)}/bookmark`, {
    method: bookmarked ? "PUT" : "DELETE",
  });
}

// 스탬프 버튼(StampButton) → 방문 페이지(VisitScreen)·피드(LibraryFeed). 범위(도서관·사용자)를 같이 보내
// 받는 쪽이 지금 보고 있는 범위의 것만 쓴다(P4 emitStampChanged).
export type StampChange = { libraryId: number; userId: string; stampId: string; visibility: StampVisibility };
/** 한 줄 안내. action이 있으면 글자 버튼을 붙인다(V4-O1 "피드에도 남기기"). ms 동안 보인다 */
export type StampNotice = { libraryId: number; text: string; ms?: number; action?: { label: string; run(): void } };

const stampChangeListeners = new Set<(change: StampChange) => void>();
const stampNoticeListeners = new Set<(notice: StampNotice) => void>();

export function onStampChanged(listener: (change: StampChange) => void): () => void {
  stampChangeListeners.add(listener);
  return () => {
    stampChangeListeners.delete(listener);
  };
}

export function emitStampChanged(change: StampChange): void {
  stampChangeListeners.forEach((l) => l(change));
}

export function onStampNotice(listener: (notice: StampNotice) => void): () => void {
  stampNoticeListeners.add(listener);
  return () => {
    stampNoticeListeners.delete(listener);
  };
}

export function emitStampNotice(notice: StampNotice): void {
  stampNoticeListeners.forEach((l) => l(notice));
}
