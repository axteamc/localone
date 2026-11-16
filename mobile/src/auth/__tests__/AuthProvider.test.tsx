import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "../AuthProvider";
import { rawRegisterSession } from "../apiFetch";
import { startGoogleSignIn, watchAppForeground } from "../platform";
import { supabase } from "../supabase";

jest.mock("../apiFetch", () => ({
  rawRegisterSession: jest.fn(),
}));

jest.mock("../platform", () => ({
  startGoogleSignIn: jest.fn(),
  startAppleSignIn: jest.fn(),
  watchAppForeground: jest.fn(() => jest.fn()),
}));

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));

const mockedRawRegisterSession = jest.mocked(rawRegisterSession);
const mockedStartGoogleSignIn = jest.mocked(startGoogleSignIn);
const mockedWatchAppForeground = jest.mocked(watchAppForeground);
const mockedGetSession = jest.mocked(supabase.auth.getSession);
const mockedOnAuthStateChange = jest.mocked(supabase.auth.onAuthStateChange);

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function Probe({
  onReady,
}: {
  onReady?: (ctx: ReturnType<typeof useAuth>) => void;
}) {
  const ctx = useAuth();
  React.useEffect(() => {
    onReady?.(ctx);
  }, [ctx, onReady]);
  return <Text testID="probe">{`${ctx.status}:${ctx.userId ?? "none"}`}</Text>;
}

describe("AuthProvider registration gate (AUTH-1-P5)", () => {
  const unsubscribeMock = jest.fn();
  const stopForegroundMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedWatchAppForeground.mockReturnValue(stopForegroundMock);
    mockedOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } as never },
    });
  });

  test("provider_registration_gate", async () => {
    const uid = "00000000-0000-4000-8000-00000000000a";

    // 1. 초기 세션 있음 + POST /auth/session 200 -> signedIn
    mockedGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok-1" } as never },
      error: null,
    });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(200, {
        user_id: uid,
        status: "active",
        is_new: false,
        created_at: "2026-11-15T00:00:00+09:00",
      })
    );

    const view1 = await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(view1.getByTestId("probe").props.children).toBe(
        `signedIn:${uid}`
      );
    });
    await view1.unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(stopForegroundMock).toHaveBeenCalledTimes(1);

    // 2. Supabase 세션은 있으나 POST /auth/session이 503 실패 -> signedIn 금지(signedOut)
    mockedGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok-2" } as never },
      error: null,
    });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(503, {
        error: {
          code: "DB_UNAVAILABLE",
          message: "데이터베이스에 연결하지 못했어요.",
          detail: "",
        },
      })
    );

    const view2 = await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(view2.getByTestId("probe").props.children).toBe("signedOut:none");
    });
    await view2.unmount();

    // 3. POST /auth/session이 403(탈퇴 계정) -> signedIn 금지(signedOut)
    mockedGetSession.mockResolvedValue({
      data: { session: { access_token: "tok-3" } as never },
      error: null,
    });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(403, {
        error: {
          code: "ACCOUNT_WITHDRAWN",
          message: "탈퇴한 계정이에요.",
          detail: "",
        },
      })
    );

    let capturedCtx: ReturnType<typeof useAuth> | null = null;
    const view3 = await render(
      <AuthProvider>
        <Probe
          onReady={(ctx) => {
            capturedCtx = ctx;
          }}
        />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(view3.getByTestId("probe").props.children).toBe("signedOut:none");
    });

    // 로그인 시도 시 등록 403이면 ok:false 반환 및 signedOut 유지
    mockedStartGoogleSignIn.mockResolvedValueOnce({ ok: true });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(403, {
        error: {
          code: "ACCOUNT_WITHDRAWN",
          message: "탈퇴한 계정이에요.",
          detail: "",
        },
      })
    );

    let loginRes:
      | Awaited<ReturnType<ReturnType<typeof useAuth>["signInWithGoogle"]>>
      | undefined;
    await act(async () => {
      loginRes = await capturedCtx!.signInWithGoogle();
    });
    expect(loginRes?.ok).toBe(false);
    expect(view3.getByTestId("probe").props.children).toBe("signedOut:none");
    await view3.unmount();
  });

  test("token_refresh_keeps_signed_in_without_reregistering (DEF-018)", async () => {
    const uid = "00000000-0000-4000-8000-00000000000a";
    let emit: ((event: string, session: unknown) => void) | undefined;
    mockedOnAuthStateChange.mockImplementation(((cb: (e: string, s: unknown) => void) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: unsubscribeMock } } };
    }) as never);
    mockedGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok-1", user: { id: uid } } as never },
      error: null,
    });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(200, { user_id: uid, status: "active", is_new: false })
    );

    const screen = await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").props.children).toBe(`signedIn:${uid}`)
    );
    expect(mockedRawRegisterSession).toHaveBeenCalledTimes(1);

    // 갱신 직후 서버가 일시적으로 실패하더라도(등록을 다시 부르면 503) 로그인 상태 유지
    mockedRawRegisterSession.mockResolvedValue(
      makeJsonResponse(503, { error: { code: "DB_UNAVAILABLE", message: "x", detail: "" } })
    );
    await act(async () => {
      emit?.("TOKEN_REFRESHED", { access_token: "tok-2", user: { id: uid } });
    });
    expect(mockedRawRegisterSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("probe").props.children).toBe(`signedIn:${uid}`);

    // 다른 사용자로 바뀐 세션은 다시 등록을 거친다(실패하면 signedOut)
    await act(async () => {
      emit?.("SIGNED_IN", { access_token: "tok-b", user: { id: "other" } });
    });
    await waitFor(() =>
      expect(screen.getByTestId("probe").props.children).toBe("signedOut:none")
    );
    expect(mockedRawRegisterSession).toHaveBeenCalledTimes(2);
  });

  test("provider_sign_in_succeeds_when_sdk_emits_signed_in_first (DEF-019)", async () => {
    const uid = "00000000-0000-4000-8000-00000000000a";
    let emit: ((event: string, session: unknown) => void) | undefined;
    mockedOnAuthStateChange.mockImplementation(((cb: (e: string, s: unknown) => void) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: unsubscribeMock } } };
    }) as never);
    mockedGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    let capturedCtx: ReturnType<typeof useAuth> | null = null;
    const screen = await render(
      <AuthProvider>
        <Probe
          onReady={(ctx) => {
            capturedCtx = ctx;
          }}
        />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").props.children).toBe("signedOut:none")
    );

    const session = { access_token: "tok-new", user: { id: uid } };
    // supabase-js처럼 exchangeCodeForSession 안에서 SIGNED_IN 구독자를 부른 뒤 반환한다.
    mockedStartGoogleSignIn.mockImplementationOnce(async () => {
      emit?.("SIGNED_IN", session);
      return { ok: true };
    });
    mockedGetSession.mockResolvedValue({ data: { session: session as never }, error: null });
    mockedRawRegisterSession.mockResolvedValue(
      makeJsonResponse(200, { user_id: uid, status: "active", is_new: true })
    );

    let loginRes:
      | Awaited<ReturnType<ReturnType<typeof useAuth>["signInWithGoogle"]>>
      | undefined;
    await act(async () => {
      loginRes = await capturedCtx!.signInWithGoogle();
    });
    expect(loginRes).toEqual({ ok: true });
    expect(screen.getByTestId("probe").props.children).toBe(`signedIn:${uid}`);
    expect(mockedRawRegisterSession).toHaveBeenCalledTimes(1);
  });
});
