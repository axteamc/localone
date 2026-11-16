import { supabase } from "./supabase";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalized}`;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function buildAuthHeaders(
  initHeaders: HeadersInit | undefined,
  token: string | null
): Headers {
  const headers = new Headers(initHeaders);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.clone().json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "object" &&
      (body as { error: unknown }).error !== null
    ) {
      const code = (body as { error: { code?: unknown } }).error.code;
      return typeof code === "string" ? code : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function rawRegisterSession(accessToken: string): Promise<Response> {
  return fetch(`${API_URL}/api/v1/auth/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * 인증 헤더를 붙여 서버 API를 호출한다.
 * - 401 AUTH_EXPIRED: refreshSession() 1회 후 원 요청 1회 재전송
 * - 401 AUTH_NOT_REGISTERED: POST /api/v1/auth/session(raw) 1회 후 원 요청 1회 재전송
 * - 복구 실패 시 원 요청을 다시 보내지 않고 실패 응답을 그대로 반환한다.
 * - 전체 복구·재전송은 요청당 최대 1회만 수행한다.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = resolveUrl(path);
  const initialToken = await getAccessToken();
  const firstResponse = await fetch(url, {
    ...init,
    headers: buildAuthHeaders(init?.headers, initialToken),
  });

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const errorCode = await readErrorCode(firstResponse);

  if (errorCode === "AUTH_EXPIRED") {
    const { data, error } = await supabase.auth.refreshSession();
    const refreshedToken = data?.session?.access_token ?? null;
    if (error || !refreshedToken) {
      return firstResponse;
    }
    return fetch(url, {
      ...init,
      headers: buildAuthHeaders(init?.headers, refreshedToken),
    });
  }

  if (errorCode === "AUTH_NOT_REGISTERED") {
    if (!initialToken) {
      return firstResponse;
    }
    const regResponse = await rawRegisterSession(initialToken);
    if (!regResponse.ok) {
      return regResponse;
    }
    return fetch(url, {
      ...init,
      headers: buildAuthHeaders(init?.headers, initialToken),
    });
  }

  return firstResponse;
}
