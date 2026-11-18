import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import {
  AuthProvider,
  registerSignOutCleanup,
  useAccountActions,
  useAuth,
} from "../AuthProvider";
import {
  abortInFlightRequests,
  apiFetch,
  onAccountWithdrawn,
  rawRegisterSession,
} from "../apiFetch";
import { startGoogleSignIn, watchAppForeground } from "../platform";
import { supabase } from "../supabase";

jest.mock("../apiFetch", () => ({
  rawRegisterSession: jest.fn(),
  abortInFlightRequests: jest.fn(),
  apiFetch: jest.fn(),
  onAccountWithdrawn: jest.fn(() => jest.fn()),
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
      signOut: jest.fn(),
    },
  },
}));

const mockedRawRegisterSession = jest.mocked(rawRegisterSession);
const mockedStartGoogleSignIn = jest.mocked(startGoogleSignIn);
const mockedWatchAppForeground = jest.mocked(watchAppForeground);
const mockedGetSession = jest.mocked(supabase.auth.getSession);
const mockedOnAuthStateChange = jest.mocked(supabase.auth.onAuthStateChange);
const mockedSignOut = jest.mocked(supabase.auth.signOut);
const mockedAbortInFlight = jest.mocked(abortInFlightRequests);
const mockedApiFetch = jest.mocked(apiFetch);
const mockedOnAccountWithdrawn = jest.mocked(onAccountWithdrawn);

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

describe("AuthProvider signOut (AUTH-2-P2)", () => {
  const uid = "00000000-0000-4000-8000-00000000000a";
  const unsubscribeMock = jest.fn();

  type Captured = { auth: ReturnType<typeof useAuth>; actions: ReturnType<typeof useAccountActions> };

  function ActionsProbe({ onReady }: { onReady: (c: Captured) => void }) {
    const auth = useAuth();
    const actions = useAccountActions();
    React.useEffect(() => {
      onReady({ auth, actions });
    }, [auth, actions, onReady]);
    return <Text testID="probe">{`${auth.status}:${auth.userId ?? "none"}`}</Text>;
  }

  async function renderSignedIn() {
    let captured: Captured | null = null;
    mockedGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok-1", user: { id: uid } } as never },
      error: null,
    });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(200, { user_id: uid, status: "active", is_new: false })
    );
    const view = await render(
      <AuthProvider>
        <ActionsProbe onReady={(c) => { captured = c; }} />
      </AuthProvider>
    );
    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe(`signedIn:${uid}`));
    return { view, get: () => captured! };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockedWatchAppForeground.mockReturnValue(jest.fn());
    mockedOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } as never },
    });
  });

  test("signOut_clears_state_before_network", async () => {
    let finish!: () => void;
    mockedSignOut.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ error: null });
      })
    );
    const { view, get } = await renderSignedIn();
    let done: Promise<void> | undefined;
    await act(async () => {
      done = get().actions.signOut();
    });
    // 네트워크(signOut)가 끝나기 전에 진행 요청 중단 + 상태 비움(G1 ①②)
    expect(mockedAbortInFlight).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("probe").props.children).toBe("signedOut:none");
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).toHaveBeenCalledWith({ scope: "local" });
    await act(async () => {
      finish();
      await done;
    });
    expect(view.getByTestId("probe").props.children).toBe("signedOut:none");
  });

  test("signOut_runs_cleanups_isolated", async () => {
    mockedSignOut.mockResolvedValue({ error: null });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = jest.fn<() => void>();
    const failing = jest.fn<() => Promise<void>>(async () => {
      throw new Error("알림 취소 실패");
    });
    const last = jest.fn<() => void>();
    const removed = jest.fn<() => void>();
    const offs = [
      registerSignOutCleanup(first),
      registerSignOutCleanup(failing),
      registerSignOutCleanup(last),
    ];
    registerSignOutCleanup(removed)();
    try {
      const { get } = await renderSignedIn();
      await act(async () => {
        await get().actions.signOut();
      });
      expect(first).toHaveBeenCalledTimes(1);
      expect(failing).toHaveBeenCalledTimes(1);
      expect(last).toHaveBeenCalledTimes(1);
      expect(removed).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe("[signOut cleanup]");
    } finally {
      offs.forEach((off) => off());
      warn.mockRestore();
    }
  });

  test("signOut_twice_signs_out_once", async () => {
    let finish!: () => void;
    mockedSignOut.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ error: null });
      })
    );
    const cleanup = jest.fn<() => void>();
    const off = registerSignOutCleanup(cleanup);
    try {
      const { get } = await renderSignedIn();
      let a: Promise<void> | undefined;
      let b: Promise<void> | undefined;
      await act(async () => {
        a = get().actions.signOut();
        b = get().actions.signOut();
      });
      expect(a).toBe(b);
      await act(async () => {
        finish();
        await a;
      });
      expect(mockedSignOut).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  test("signOut_error_still_signed_out", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const cleanup = jest.fn<() => void>();
    const off = registerSignOutCleanup(cleanup);
    try {
      for (const behave of ["error", "throw"] as const) {
        if (behave === "error") {
          mockedSignOut.mockResolvedValueOnce({ error: new Error("network") as never });
        } else {
          mockedSignOut.mockRejectedValueOnce(new Error("subscriber threw"));
        }
        const { view, get } = await renderSignedIn();
        await act(async () => {
          await get().actions.signOut();
        });
        expect(view.getByTestId("probe").props.children).toBe("signedOut:none");
        await view.unmount();
      }
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      off();
      warn.mockRestore();
    }
  });

  test("useAccountActions_outside_provider_throws", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => undefined);
    function Bare() {
      useAccountActions();
      return null;
    }
    try {
      await expect(render(<Bare />)).rejects.toThrow("useAccountActions는 AuthProvider 안에서만");
    } finally {
      err.mockRestore();
    }
  });
});

describe("AuthProvider withdrawAccount (AUTH-3-P2)", () => {
  const uid = "00000000-0000-4000-8000-00000000000a";
  type Captured = { auth: ReturnType<typeof useAuth>; actions: ReturnType<typeof useAccountActions> };

  function ActionsProbe({ onReady }: { onReady: (c: Captured) => void }) {
    const auth = useAuth();
    const actions = useAccountActions();
    React.useEffect(() => {
      onReady({ auth, actions });
    }, [auth, actions, onReady]);
    return <Text testID="probe">{`${auth.status}:${auth.userId ?? "none"}`}</Text>;
  }

  async function renderSignedIn() {
    let captured: Captured | null = null;
    mockedGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok-1", user: { id: uid } } as never },
      error: null,
    });
    mockedRawRegisterSession.mockResolvedValueOnce(
      makeJsonResponse(200, { user_id: uid, status: "active", is_new: false })
    );
    const view = await render(
      <AuthProvider>
        <ActionsProbe onReady={(c) => { captured = c; }} />
      </AuthProvider>
    );
    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe(`signedIn:${uid}`));
    return { view, get: () => captured! };
  }

  const withdrawnBody = { error: { code: "ACCOUNT_WITHDRAWN", message: "탈퇴한 계정이에요.", detail: "" } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedWatchAppForeground.mockReturnValue(jest.fn());
    mockedOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } as never },
    });
    mockedOnAccountWithdrawn.mockImplementation(() => jest.fn());
    mockedSignOut.mockResolvedValue({ error: null });
  });

  test("withdraw_success_signs_out", async () => {
    mockedApiFetch.mockResolvedValueOnce(
      makeJsonResponse(200, { user_id: uid, status: "withdrawn", withdrawn_at: "2026-11-18T10:00:00+09:00" })
    );
    const { view, get } = await renderSignedIn();
    let res: unknown;
    await act(async () => {
      res = await get().actions.withdrawAccount();
    });
    expect(res).toEqual({ ok: true });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/v1/me", { method: "DELETE" });
    expect(mockedAbortInFlight).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(view.getByTestId("probe").props.children).toBe("signedOut:none");
  });

  test("withdraw_already_withdrawn_counts_as_success", async () => {
    mockedApiFetch.mockResolvedValueOnce(makeJsonResponse(403, withdrawnBody));
    const { view, get } = await renderSignedIn();
    let res: unknown;
    await act(async () => {
      res = await get().actions.withdrawAccount();
    });
    expect(res).toEqual({ ok: true });
    expect(view.getByTestId("probe").props.children).toBe("signedOut:none");
  });

  test("withdraw_failure_keeps_session", async () => {
    const { view, get } = await renderSignedIn();
    const cases: Array<[() => void, string]> = [
      [
        () =>
          mockedApiFetch.mockResolvedValueOnce(
            makeJsonResponse(503, {
              error: { code: "DB_UNAVAILABLE", message: "데이터베이스에 연결하지 못했어요.", detail: "" },
            })
          ),
        "데이터베이스에 연결하지 못했어요.",
      ],
      [
        () => mockedApiFetch.mockResolvedValueOnce(new Response("oops", { status: 500 })),
        "탈퇴하지 못했어요. 다시 시도해 주세요.",
      ],
      [
        () => mockedApiFetch.mockRejectedValueOnce(new TypeError("Network request failed")),
        "서버에 연결하지 못했어요.",
      ],
      [
        () =>
          mockedApiFetch.mockResolvedValueOnce(
            makeJsonResponse(403, { error: { code: "FORBIDDEN", message: "", detail: "" } })
          ),
        "탈퇴하지 못했어요. 다시 시도해 주세요.",
      ],
    ];
    for (const [arrange, message] of cases) {
      arrange();
      let res: unknown;
      await act(async () => {
        res = await get().actions.withdrawAccount();
      });
      expect(res).toEqual({ ok: false, errorMessage: message });
    }
    expect(mockedSignOut).not.toHaveBeenCalled();
    expect(view.getByTestId("probe").props.children).toBe(`signedIn:${uid}`);
  });

  test("withdraw_twice_sends_once", async () => {
    let finish!: (r: Response) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
    );
    const { get } = await renderSignedIn();
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    await act(async () => {
      a = get().actions.withdrawAccount();
      b = get().actions.withdrawAccount();
    });
    expect(a).toBe(b);
    await act(async () => {
      finish(makeJsonResponse(200, { user_id: uid, status: "withdrawn", withdrawn_at: "x" }));
      await a;
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });

  test("account_withdrawn_signal_signs_out (#23)", async () => {
    let listener: (() => void) | undefined;
    const unsubscribe = jest.fn<() => void>();
    mockedOnAccountWithdrawn.mockImplementation((fn: () => void) => {
      listener = fn;
      return unsubscribe;
    });
    const { view } = await renderSignedIn();
    expect(listener).toBeDefined();
    await act(async () => {
      listener!();
    });
    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("signedOut:none"));
    expect(mockedSignOut).toHaveBeenCalledWith({ scope: "local" });
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
