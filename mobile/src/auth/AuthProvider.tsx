import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { abortInFlightRequests, apiFetch, onAccountWithdrawn, rawRegisterSession } from "./apiFetch";
import {
  SignInResult,
  startAppleSignIn,
  startGoogleSignIn,
  watchAppForeground,
} from "./platform";
import { supabase } from "./supabase";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export interface AuthContextValue {
  status: AuthStatus;
  userId: string | null;
  signInWithGoogle: () => Promise<SignInResult>;
  signInWithApple: () => Promise<SignInResult>;
}

/** AUTH-2 G9: useAuth() 모양은 그대로 두고, 로그아웃·탈퇴는 별도 컨텍스트로 낸다. */
export interface AccountActionsValue {
  signOut: () => Promise<void>;
  /** AUTH-3: DELETE /api/v1/me → 성공(또는 이미 탈퇴)이면 이 기기 로그아웃 */
  withdrawAccount: () => Promise<WithdrawResult>;
}

export type WithdrawResult = { ok: true } | { ok: false; errorMessage: string };

export type SignOutCleanup = () => void | Promise<void>;

export interface SignInErrorContextValue {
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AccountActionsContext = createContext<AccountActionsValue | null>(null);
const SignInErrorContext = createContext<SignInErrorContextValue | null>(null);

// AUTH-2 G5: 기기 예약 알림 취소·화면 밖 캐시 비우기. 모듈 단위라 화면이 언마운트될 때 해제한다.
const signOutCleanups = new Set<SignOutCleanup>();

export function registerSignOutCleanup(fn: SignOutCleanup): () => void {
  signOutCleanups.add(fn);
  return () => {
    signOutCleanups.delete(fn);
  };
}

async function runSignOutCleanups(): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(signOutCleanups).map(async (fn) => fn())
  );
  for (const result of results) {
    // C6 #16: 하나가 실패해도 나머지는 돌고, 실패는 숨기지 않고 남긴다
    if (result.status === "rejected") console.warn("[signOut cleanup]", result.reason);
  }
}

async function parseErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.clone().json();
    const error = (body as { error?: { code?: unknown } } | null)?.error;
    return typeof error?.code === "string" ? error.code : undefined;
  } catch {
    return undefined; // 본문이 JSON이 아니면 코드 없음으로 본다
  }
}

async function parseErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.clone().json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "object" &&
      (body as { error: unknown }).error !== null
    ) {
      const msg = (body as { error: { message?: unknown } }).error.message;
      if (typeof msg === "string" && msg) return msg;
    }
  } catch {
    // ignore JSON parse failure
  }
  return undefined;
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const clearSignInError = useCallback(() => setSignInError(null), []);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<AuthStatus>("loading");
  const userIdRef = useRef<string | null>(null);
  // 제공자 로그인(signInWithGoogle/Apple)이 진행 중인 동안 true.
  const providerSignInRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
    userIdRef.current = userId;
  }, [status, userId]);

  const syncWithServer = useCallback(
    async (
      accessToken: string | null | undefined,
      gen: number
    ): Promise<SignInResult> => {
      if (!accessToken) {
        if (mountedRef.current && generationRef.current === gen) {
          setUserId(null);
          setStatus("signedOut");
        }
        return { ok: false, reason: "failed" };
      }

      try {
        const res = await rawRegisterSession(accessToken);
        if (!mountedRef.current || generationRef.current !== gen) {
          return { ok: false, reason: "cancelled" };
        }
        if (res.ok) {
          const body = (await res.json()) as { user_id?: string };
          if (!mountedRef.current || generationRef.current !== gen) {
            return { ok: false, reason: "cancelled" };
          }
          const resolvedId =
            typeof body.user_id === "string" && body.user_id
              ? body.user_id
              : null;
          if (resolvedId) {
            setSignInError(null);
            setUserId(resolvedId);
            setStatus("signedIn");
            return { ok: true };
          }
        }
        const errorCode = await parseErrorCode(res);
        const errorMessage = await parseErrorMessage(res);
        if (!mountedRef.current || generationRef.current !== gen) {
          return { ok: false, reason: "cancelled" };
        }
        setUserId(null);
        setStatus("signedOut");
        if (errorCode === "ACCOUNT_WITHDRAWN") {
          const withdrawnMessage = errorMessage ?? "탈퇴한 계정이에요.";
          setSignInError(withdrawnMessage);
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch (error) {
            console.warn("[signOut withdrawn]", error);
          }
          return {
            ok: false,
            reason: "failed",
            errorMessage: withdrawnMessage,
          };
        }
        return {
          ok: false,
          reason: "failed",
          errorMessage,
        };
      } catch {
        if (mountedRef.current && generationRef.current === gen) {
          setUserId(null);
          setStatus("signedOut");
        }
        return {
          ok: false,
          reason: "network",
          errorMessage: "서버에 연결하지 못했어요.",
        };
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    const initialGen = ++generationRef.current;

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mountedRef.current || generationRef.current !== initialGen) return;
        const token = data.session?.access_token;
        if (!token) {
          setUserId(null);
          setStatus("signedOut");
          return;
        }
        await syncWithServer(token, initialGen);
      } catch {
        if (mountedRef.current && generationRef.current === initialGen) {
          setUserId(null);
          setStatus("signedOut");
        }
      }
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // DEF-018: 같은 사용자의 토큰 갱신·정보 변경은 서버 등록을 다시 하지 않는다.
        // 다시 하면 갱신 때마다 POST가 나가고, 그 요청이 일시적으로 실패하면 세션이
        // 살아 있는데도 signedOut으로 바뀐다.
        if (
          (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") &&
          statusRef.current === "signedIn" &&
          session?.user?.id != null &&
          session.user.id === userIdRef.current
        ) {
          return;
        }
        // DEF-019: supabase-js는 exchangeCodeForSession·signInWithIdToken 안에서 SIGNED_IN
        // 구독자를 await한 뒤 반환한다. 여기서 세대를 올리면 진행 중인 제공자 로그인이
        // 성공인데도 cancelled로 끝난다. 그 SIGNED_IN은 completeProviderSignIn이 등록한다.
        if (event === "SIGNED_IN" && providerSignInRef.current) {
          return;
        }
        const eventGen = ++generationRef.current;
        if (!session?.access_token) {
          if (mountedRef.current) {
            setUserId(null);
            setStatus("signedOut");
          }
          return;
        }
        void syncWithServer(session.access_token, eventGen);
      }
    );

    const stopWatchForeground = watchAppForeground(supabase);

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      authSub.subscription.unsubscribe();
      stopWatchForeground();
    };
  }, [syncWithServer]);

  const completeProviderSignIn = useCallback(
    async (
      runner: () => Promise<SignInResult>
    ): Promise<SignInResult> => {
      const myGen = ++generationRef.current;
      providerSignInRef.current = true;
      let result: SignInResult;
      try {
        result = await runner();
      } finally {
        providerSignInRef.current = false;
      }
      if (!mountedRef.current || generationRef.current !== myGen) {
        return result.ok ? { ok: false, reason: "cancelled" } : result;
      }
      if (!result.ok) {
        return result;
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (!mountedRef.current || generationRef.current !== myGen) {
          return { ok: false, reason: "cancelled" };
        }
        const token = data.session?.access_token;
        if (!token) {
          // 웹 OAuth 전체 페이지 리디렉트 직전에는 아직 세션이 없을 수 있다.
          return { ok: true };
        }
        return await syncWithServer(token, myGen);
      } catch {
        if (mountedRef.current && generationRef.current === myGen) {
          setUserId(null);
          setStatus("signedOut");
        }
        return { ok: false, reason: "network" };
      }
    },
    [syncWithServer]
  );

  const signInWithGoogle = useCallback(
    () => completeProviderSignIn(() => startGoogleSignIn(supabase)),
    [completeProviderSignIn]
  );

  const signInWithApple = useCallback(
    () => completeProviderSignIn(() => startAppleSignIn(supabase)),
    [completeProviderSignIn]
  );

  const signOutRef = useRef<Promise<void> | null>(null);

  // AUTH-2 G1 순서(계약 P4 골격): ① 진행 요청 중단 ② 세대·상태 비움 ③ 이 기기 세션 삭제 ④ 정화
  const signOut = useCallback((): Promise<void> => {
    if (signOutRef.current) return signOutRef.current; // #17 연타 1회
    const run = (async () => {
      abortInFlightRequests();
      generationRef.current += 1;
      if (mountedRef.current) {
        setUserId(null);
        setStatus("signedOut");
      }
      try {
        // G2: local은 네트워크 요청 전에 기기 세션을 지운다(supabase-js 2.119.0)
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) console.warn("[signOut]", error); // #15
      } catch (error) {
        console.warn("[signOut]", error);
      }
      await runSignOutCleanups();
    })().finally(() => {
      signOutRef.current = null;
    });
    signOutRef.current = run;
    return run;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      userId,
      signInWithGoogle,
      signInWithApple,
    }),
    [status, userId, signInWithGoogle, signInWithApple]
  );

  // AUTH-3 W2: 다른 기기에서 탈퇴한 계정의 응답(403 ACCOUNT_WITHDRAWN)이 오면 이 기기도 로그아웃
  useEffect(() => onAccountWithdrawn(() => void signOut()), [signOut]);

  const withdrawRef = useRef<Promise<WithdrawResult> | null>(null);

  // AUTH-3 계약 P4 골격
  const withdrawAccount = useCallback((): Promise<WithdrawResult> => {
    if (withdrawRef.current) return withdrawRef.current; // #22 연타 1회
    const run = (async (): Promise<WithdrawResult> => {
      try {
        const res = await apiFetch("/api/v1/me", { method: "DELETE" });
        if (res.ok || (res.status === 403 && (await parseErrorCode(res)) === "ACCOUNT_WITHDRAWN")) {
          await signOut(); // W5
          return { ok: true };
        }
        return {
          ok: false,
          errorMessage: (await parseErrorMessage(res)) ?? "탈퇴하지 못했어요. 다시 시도해 주세요.",
        };
      } catch {
        return { ok: false, errorMessage: "서버에 연결하지 못했어요." };
      }
    })().finally(() => {
      withdrawRef.current = null;
    });
    withdrawRef.current = run;
    return run;
  }, [signOut]);

  const actions = useMemo<AccountActionsValue>(
    () => ({ signOut, withdrawAccount }),
    [signOut, withdrawAccount]
  );

  const signInErrorValue = useMemo<SignInErrorContextValue>(
    () => ({ error: signInError, clearError: clearSignInError }),
    [signInError, clearSignInError]
  );

  return (
    <AuthContext.Provider value={value}>
      <AccountActionsContext.Provider value={actions}>
        <SignInErrorContext.Provider value={signInErrorValue}>{children}</SignInErrorContext.Provider>
      </AccountActionsContext.Provider>
    </AuthContext.Provider>
  );
}

const NOOP_SIGN_IN_ERROR: SignInErrorContextValue = { error: null, clearError: () => {} };

export function useSignInError(): SignInErrorContextValue {
  return useContext(SignInErrorContext) ?? NOOP_SIGN_IN_ERROR;
}

export function useAccountActions(): AccountActionsValue {
  const ctx = useContext(AccountActionsContext);
  if (!ctx) {
    throw new Error("useAccountActions는 AuthProvider 안에서만 쓸 수 있어요.");
  }
  return ctx;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있어요.");
  }
  return ctx;
}
