import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { abortInFlightRequests, apiFetch, onAccountWithdrawn } from "../apiFetch";
import { supabase } from "../supabase";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
  },
}));

const mockedGetSession = jest.mocked(supabase.auth.getSession);
const mockedRefreshSession = jest.mocked(supabase.auth.refreshSession);

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch (AUTH-1-P5)", () => {
  const fetchMock =
    jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    mockedGetSession.mockResolvedValue({
      data: { session: { access_token: "token-initial" } as never },
      error: null,
    });
  });

  test("apiFetch_retries_once_on_expired", async () => {
    // 시나리오 1: 첫 응답 401 AUTH_EXPIRED -> 갱신 성공 -> 둘째 200
    mockedRefreshSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "token-refreshed" } as never,
        user: null,
      },
      error: null,
    });
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_EXPIRED", message: "만료", detail: "" },
        })
      )
      .mockResolvedValueOnce(makeJsonResponse(200, { user_id: "u1" }));

    const res1 = await apiFetch("/api/v1/me");
    expect(res1.status).toBe(200);
    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(secondHeaders.get("Authorization")).toBe("Bearer token-refreshed");

    // 시나리오 2: 둘 다 401 AUTH_EXPIRED -> 갱신 1번, 요청 정확히 2번(무한 재시도 없음)
    fetchMock.mockClear();
    mockedRefreshSession.mockClear();
    mockedRefreshSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "token-refreshed-2" } as never,
        user: null,
      },
      error: null,
    });
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_EXPIRED", message: "만료", detail: "" },
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_EXPIRED", message: "여전히 만료", detail: "" },
        })
      );

    const res2 = await apiFetch("/api/v1/me");
    expect(res2.status).toBe(401);
    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("apiFetch_recovery_failure_and_changed_code", async () => {
    // 1. 갱신 실패 시 원 요청 재전송 0회
    mockedRefreshSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new Error("refresh failed") as never,
    });
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(401, {
        error: { code: "AUTH_EXPIRED", message: "만료", detail: "" },
      })
    );

    const expiredFailRes = await apiFetch("/api/v1/me");
    expect(expiredFailRes.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. AUTH_NOT_REGISTERED 등록 요청이 503으로 실패하면 원 요청 재전송 0회, 복구 실패 응답 반환
    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_NOT_REGISTERED", message: "미등록", detail: "" },
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(503, {
          error: { code: "DB_UNAVAILABLE", message: "DB 오류", detail: "" },
        })
      );

    const regFailRes = await apiFetch("/api/v1/me");
    expect(regFailRes.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 3. 갱신 후 재전송이 다른 401 코드(AUTH_NOT_REGISTERED)를 반환해도 추가 복구 없이 종료
    fetchMock.mockClear();
    mockedRefreshSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "token-after-refresh" } as never,
        user: null,
      },
      error: null,
    });
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_EXPIRED", message: "만료", detail: "" },
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_NOT_REGISTERED", message: "미등록", detail: "" },
        })
      );

    const changedCodeRes = await apiFetch("/api/v1/me");
    expect(changedCodeRes.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("apiFetch_registers_once_on_not_registered", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: "AUTH_NOT_REGISTERED", message: "미등록", detail: "" },
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          user_id: "00000000-0000-4000-8000-00000000000a",
          status: "active",
          is_new: true,
          created_at: "2026-11-15T00:00:00+09:00",
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          user_id: "00000000-0000-4000-8000-00000000000a",
          status: "active",
          created_at: "2026-11-15T00:00:00+09:00",
        })
      );

    const res = await apiFetch("/api/v1/me");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/api/v1/auth/session"
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
  });

  test("apiFetch_refuses_foreign_absolute_url_without_sending_token (DEF-017)", async () => {
    for (const url of [
      "https://evil.example/collect",
      "http://localhost:8000.evil.example/api/v1/me",
      "javascript:alert(1)",
    ]) {
      await expect(apiFetch(url)).rejects.toThrow("API 서버 경로만");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedGetSession).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    const res = await apiFetch("http://localhost:8000/api/v1/me");
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8000/api/v1/me");
  });
});

describe("apiFetch abort on sign-out (AUTH-2-P2)", () => {
  const fetchMock =
    jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  // 신호가 끊기면 거부하고, 아니면 resolveNext로 응답을 준다(실제 fetch 모양)
  let resolveNext: ((res: Response) => void) | null = null;
  function hangingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      resolveNext = resolve;
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resolveNext = null;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    mockedGetSession.mockResolvedValue({
      data: { session: { access_token: "token-initial" } as never },
      error: null,
    });
  });

  test("apiFetch_aborts_in_flight_on_signout", async () => {
    fetchMock.mockImplementationOnce(hangingFetch);
    const pending = apiFetch("/api/v1/me/loan-plans");
    await new Promise<void>((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    abortInFlightRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockedRefreshSession).not.toHaveBeenCalled();

    // 이후 새 요청은 정상
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    const after = await apiFetch("/api/v1/me");
    expect(after.status).toBe(200);
  });

  test("apiFetch_drops_response_that_arrived_after_signout", async () => {
    // 갱신 중 로그아웃: 갱신이 끝나도 원 요청을 다시 보내지 않는다
    let finishRefresh!: () => void;
    mockedRefreshSession.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRefresh = () =>
          resolve({ data: { session: { access_token: "t2" } as never, user: null }, error: null });
      }) as never
    );
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(401, { error: { code: "AUTH_EXPIRED", message: "x", detail: "" } })
    );
    const pending = apiFetch("/api/v1/me");
    await new Promise<void>((r) => setImmediate(r));
    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    abortInFlightRequests();
    finishRefresh();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("apiFetch_respects_caller_signal", async () => {
    fetchMock.mockImplementationOnce(hangingFetch);
    const callerA = new AbortController();
    const a = apiFetch("/api/v1/a", { signal: callerA.signal });
    await new Promise<void>((r) => setImmediate(r));
    const resolveA = resolveNext;
    fetchMock.mockImplementationOnce(hangingFetch);
    const b = apiFetch("/api/v1/b");
    await new Promise<void>((r) => setImmediate(r));
    const resolveB = resolveNext!;

    callerA.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    resolveB(makeJsonResponse(200, { ok: true }));
    await expect(b).resolves.toMatchObject({ status: 200 });
    expect(resolveA).not.toBeNull();

    // 이미 끊긴 신호로 부르면 보내지도 않는다
    const already = new AbortController();
    already.abort();
    await expect(apiFetch("/api/v1/c", { signal: already.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("apiFetch account withdrawn signal (AUTH-3-P2)", () => {
  const fetchMock =
    jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    mockedGetSession.mockResolvedValue({
      data: { session: { access_token: "token-initial" } as never },
      error: null,
    });
  });

  test("apiFetch_account_withdrawn_signs_out", async () => {
    const listener = jest.fn<() => void>();
    const off = onAccountWithdrawn(listener);
    try {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(403, { error: { code: "ACCOUNT_WITHDRAWN", message: "탈퇴한 계정이에요.", detail: "" } })
      );
      const res = await apiFetch("/api/v1/me/loan-plans");
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "ACCOUNT_WITHDRAWN" } }); // 본문은 그대로
      expect(listener).toHaveBeenCalledTimes(1);

      // 다른 403·성공은 알리지 않는다
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(403, { error: { code: "FORBIDDEN", message: "x", detail: "" } })
      );
      fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
      await apiFetch("/api/v1/a");
      await apiFetch("/api/v1/b");
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
    // 해제 뒤에는 불리지 않는다
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(403, { error: { code: "ACCOUNT_WITHDRAWN", message: "x", detail: "" } })
    );
    await apiFetch("/api/v1/c");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
