/**
 * LOCAL-1 게시물 API (contracts/local-feed.md LOCAL-1 C2·C3).
 * - 진짜 함수: uploadPostImage(#23) · createPost(#24) · withdrawPost(#25)
 * - 서버 파트(LOCAL-1-P1)가 머지되기 전에는 화면이 fakePostsApi를 쓴다.
 *   TODO(연결): B LOCAL-1-P1 — 머지되면 defaultPostsApi를 realPostsApi로 바꾼다.
 */
import { apiFetch } from "../../auth/apiFetch";

export type ImageKind = "photo" | "cover" | "color";
/** 단색 후보 = 계약서 F7 목록(색 토큰 이름). */
export const POST_COLORS = ["fill1", "fill2", "fill3", "cream", "paper", "inkStrong"] as const;
export type PostColor = (typeof POST_COLORS)[number];
/** 계약서 C3 임시 길이(세부 명세 기본값과 같음). */
export const OVERLAY_MAX = 80;
export const BODY_MAX = 2000;

export type UploadedImage = { image_path: string; image_url: string; width: number; height: number; bytes: number };
export type PostBook = { isbn13: string; title: string; author: string | null; cover_url: string | null };
export type Post = {
  id: string;
  library: { id: number; name: string };
  book: PostBook | null;
  image_kind: ImageKind;
  image_url: string | null;
  image_color: PostColor | null;
  overlay_text: string | null;
  body: string | null;
  author: { nickname: string };
  is_mine: boolean;
  reaction_count: number;
  my_reaction: boolean;
  my_bookmark: boolean;
  published_at: string;
};
export type PostCreateInput = {
  client_request_id: string;
  library_id: number;
  isbn13: string | null;
  image_kind: ImageKind;
  image_path: string | null;
  image_color: PostColor | null;
  overlay_text: string | null;
  body: string | null;
};

export class PostApiError extends Error {
  constructor(public status: number, public code: string, message: string, public detail: string) {
    super(message);
    this.name = "PostApiError";
  }
}

async function call<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, { ...init, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PostApiError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; detail?: string } } = {};
    try { body = await res.json(); } catch { /* 실패 응답은 본문이 없어도 거부한다 */ }
    throw new PostApiError(res.status, body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? "요청을 처리하지 못했어요.", body?.error?.detail ?? "");
  }
  return (await res.json()) as T;
}

export function uploadPostImage(fileUri: string, signal?: AbortSignal): Promise<UploadedImage> {
  const form = new FormData();
  // React Native의 FormData 파일 모양. 웹은 imagePicker가 blob: 주소를 준다.
  form.append("image", { uri: fileUri, name: "post.jpg", type: "image/jpeg" } as unknown as Blob);
  return call("/api/v1/uploads/post-images", { method: "POST", body: form }, signal);
}

export function createPost(input: PostCreateInput, signal?: AbortSignal): Promise<Post> {
  return call("/api/v1/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }, signal);
}

export function withdrawPost(postId: string, signal?: AbortSignal): Promise<{ id: string; status: "withdrawn" }> {
  return call(`/api/v1/posts/${encodeURIComponent(postId)}/withdraw`, { method: "POST" }, signal);
}

export type PostsApi = {
  uploadPostImage: typeof uploadPostImage;
  createPost: typeof createPost;
  withdrawPost: typeof withdrawPost;
};

export const realPostsApi: PostsApi = { uploadPostImage, createPost, withdrawPost };

/**
 * 서버 머지 전 가짜 API. 계약서 C3 응답 모양 그대로, 같은 client_request_id는 첫 게시물을 돌려준다(F9).
 * TODO(연결): B LOCAL-1-P1
 */
export function createFakePostsApi(opts: { libraryName?: (id: number) => string; delayMs?: number } = {}): PostsApi & { posts: Map<string, Post & { status: "published" | "withdrawn" }> } {
  const posts = new Map<string, Post & { status: "published" | "withdrawn" }>();
  const byRequest = new Map<string, string>();
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  let seq = 0;
  return {
    posts,
    async uploadPostImage(fileUri) {
      await wait();
      seq += 1;
      return { image_path: `00000000-0000-4000-8000-000000000001/fake-${seq}.jpg`, image_url: fileUri, width: 1080, height: 1350, bytes: 1 };
    },
    async createPost(input) {
      await wait();
      const existing = byRequest.get(input.client_request_id);
      if (existing) return posts.get(existing)!;
      seq += 1;
      const id = `fake-post-${seq}`;
      const post: Post & { status: "published" } = {
        id,
        library: { id: input.library_id, name: opts.libraryName?.(input.library_id) ?? "도서관" },
        book: input.isbn13 ? FAKE_BOOKS.find((b) => b.isbn13 === input.isbn13) ?? null : null,
        image_kind: input.image_kind,
        image_url: input.image_kind === "color" ? null : input.image_kind === "cover"
          ? FAKE_BOOKS.find((b) => b.isbn13 === input.isbn13)?.cover_url ?? null : `fake://${input.image_path}`,
        image_color: input.image_color,
        overlay_text: input.overlay_text,
        body: input.body,
        author: { nickname: "이웃-a1b2" },
        is_mine: true,
        reaction_count: 0,
        my_reaction: false,
        my_bookmark: false,
        published_at: new Date().toISOString(),
        status: "published",
      };
      posts.set(id, post);
      byRequest.set(input.client_request_id, id);
      return post;
    },
    async withdrawPost(postId) {
      await wait();
      const post = posts.get(postId);
      if (!post) throw new PostApiError(404, "NOT_FOUND", "찾을 수 없어요.", "");
      post.status = "withdrawn";
      return { id: postId, status: "withdrawn" };
    },
  };
}

/** 책 찾기 화면(C) 머지 전 가짜 책. TODO(연결): C 책 찾기 화면 */
export const FAKE_BOOKS: PostBook[] = [
  { isbn13: "9788954682152", title: "작별하지 않는다", author: "한강", cover_url: "https://example.invalid/cover/9788954682152.jpg" },
  { isbn13: "9791161571188", title: "불편한 편의점", author: "김호연", cover_url: null },
];

/** 화면이 기본으로 쓰는 API. TODO(연결): B LOCAL-1-P1 머지 뒤 realPostsApi */
export const defaultPostsApi: PostsApi = createFakePostsApi({ delayMs: 400 });
