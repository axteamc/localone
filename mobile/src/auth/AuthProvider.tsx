import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { rawRegisterSession } from "./apiFetch";
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

const AuthContext = createContext<AuthContextValue | null>(null);

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
            setUserId(resolvedId);
            setStatus("signedIn");
            return { ok: true };
          }
        }
        const errorMessage = await parseErrorMessage(res);
        if (mountedRef.current && generationRef.current === gen) {
          setUserId(null);
          setStatus("signedOut");
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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      userId,
      signInWithGoogle,
      signInWithApple,
    }),
    [status, userId, signInWithGoogle, signInWithApple]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있어요.");
  }
  return ctx;
}
