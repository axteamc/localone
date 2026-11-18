import { supabase } from "./supabase";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveUrl(path: string): string {
  // DEF-017: 토큰을 붙이므로 API 서버 밖의 절대 주소는 받지 않는다(제3자에게 access token 유출 방지)
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    const apiBase = API_URL.replace(/\/+$/, "");
    if (path === apiBase || path.startsWith(`${apiBase}/`)) return path;
    throw new Error("apiFetch는 API 서버 경로만 받아요.");
  }
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

// AUTH-2 G1 ①: 로그아웃 순간 진행 중인 요청을 모두 끊는다(이전 사용자의 응답이 화면에 쓰이지 않게).
const inFlight = new Set<AbortController>();

export function abortInFlightRequests(): void {
  for (const controller of Array.from(inFlight)) controller.abort();
}

function signedOutAbortError(): Error {
  const error = new Error("로그아웃해서 요청을 멈췄어요.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signedOutAbortError();
}

async function send(url: string, init: RequestInit | undefined, signal: AbortSignal): Promise<Response> {
  const initialToken = await getAccessToken();
  throwIfAborted(signal);
  const firstResponse = await fetch(url, {
    ...init,
    signal,
    headers: buildAuthHeaders(init?.headers, initialToken),
  });

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const errorCode = await readErrorCode(firstResponse);

  if (errorCode === "AUTH_EXPIRED") {
    const { data, error } = await supabase.auth.refreshSession();
    throwIfAborted(signal);
    const refreshedToken = data?.session?.access_token ?? null;
    if (error || !refreshedToken) {
      return firstResponse;
    }
    return fetch(url, {
      ...init,
      signal,
      headers: buildAuthHeaders(init?.headers, refreshedToken),
    });
  }

  if (errorCode === "AUTH_NOT_REGISTERED") {
    if (!initialToken) {
      return firstResponse;
    }
    const regResponse = await rawRegisterSession(initialToken);
    throwIfAborted(signal);
    if (!regResponse.ok) {
      return regResponse;
    }
    return fetch(url, {
      ...init,
      signal,
      headers: buildAuthHeaders(init?.headers, initialToken),
    });
  }

  return firstResponse;
}

/**
 * 인증 헤더를 붙여 서버 API를 호출한다.
 * - 401 AUTH_EXPIRED: refreshSession() 1회 후 원 요청 1회 재전송
 * - 401 AUTH_NOT_REGISTERED: POST /api/v1/auth/session(raw) 1회 후 원 요청 1회 재전송
 * - 복구 실패 시 원 요청을 다시 보내지 않고 실패 응답을 그대로 반환한다.
 * - 전체 복구·재전송은 요청당 최대 1회만 수행한다.
 * - 로그아웃(abortInFlightRequests)이나 호출자의 init.signal로 끊기면 AbortError를 던진다(AUTH-2 #14).
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = resolveUrl(path);
  const controller = new AbortController();
  const callerSignal = init?.signal ?? null;
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", onCallerAbort);
  inFlight.add(controller);
  try {
    const response = await send(url, init, controller.signal);
    // 응답이 먼저 도착했어도 그사이 로그아웃했으면 이전 사용자의 응답을 넘기지 않는다
    throwIfAborted(controller.signal);
    return response;
  } finally {
    inFlight.delete(controller);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
