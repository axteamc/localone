import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { apiFetch } from "../apiFetch";
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
