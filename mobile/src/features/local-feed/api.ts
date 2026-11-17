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
