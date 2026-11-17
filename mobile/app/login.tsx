import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { theme } from "../src/theme";
import { isAppleSignInAvailable, SignInResult } from "../src/auth/platform";

// 개발산출물/시안/AUTH-1_로그인_시안.html 채택 후보 B (위 소개·책 모양 로고 방향, 아래 제공자 버튼)
// 색·곡률은 테마 토큰에서만 가져온다(룩 전환 대응, 2026-11-18 S4 — 이전엔 warm 값을 직접 복사했음).
const TOKENS = {
  cream: theme.colors.cream,
  paper: theme.colors.paper,
  surface3: theme.colors.surface3,
  fill1: theme.colors.fill1,
  fill2: theme.colors.fill2,
  fill3: theme.colors.fill3,
  inkStrong: theme.colors.inkStrong,
  text: theme.colors.text,
  sub: theme.colors.textSub,
  rCard: theme.radii.card,
  rPill: theme.radii.control,
};

function messageForFailure(result: Extract<SignInResult, { ok: false }>): string {
  if (result.reason === "cancelled") {
    return "";
  }
  if (result.errorMessage) {
    return result.errorMessage;
  }
  if (result.reason === "network") {
    return "서버에 연결하지 못했어요.";
  }
  return "로그인하지 못했어요. 다시 시도해 주세요.";
}

export default function LoginScreen(): React.JSX.Element {
  const router = useRouter();
  const { status, signInWithGoogle, signInWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCopy, setErrorCopy] = useState("");
  const busyRef = useRef(false);
  const navigatedRef = useRef(false);

  const goHome = useCallback(() => {
    if (navigatedRef.current) {
      return;
    }
    navigatedRef.current = true;
    router.replace("/");
  }, [router]);

  // DEF-019: 웹은 제공자에서 /login으로 돌아온 뒤 세션이 복원되므로 상태를 보고 넘어간다.
  useEffect(() => {
    if (status === "signedIn") {
      goHome();
    }
  }, [status, goHome]);

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then((avail) => {
      if (active) {
        setAppleAvailable(avail);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSignIn = useCallback(
    async (provider: "google" | "apple") => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setErrorCopy("");

      try {
        const result =
          provider === "google"
            ? await signInWithGoogle()
            : await signInWithApple();
        if (result.ok) {
          goHome();
          return;
        }
        setErrorCopy(messageForFailure(result));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [goHome, signInWithApple, signInWithGoogle]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <Text style={styles.brand}>동네한권</Text>
        <Text style={styles.title}>동네한권에 로그인</Text>
        <View
          accessibilityRole="image"
          accessibilityLabel="주요 컬러의 책 모양 로고 시안"
          style={styles.bookArt}
        >
          <View style={[styles.bookBlock, styles.bookLeft]} />
          <View style={[styles.bookBlock, styles.bookMiddle]} />
          <View style={[styles.bookBlock, styles.bookRight]} />
        </View>
      </View>

      <View style={styles.bottomActions}>
        {busy && (
          <ActivityIndicator
            accessibilityLabel="로그인하는 중"
            color={TOKENS.inkStrong}
            style={styles.spinner}
          />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void handleSignIn("google")}
          style={[styles.oauthButton, styles.googleButton, busy && styles.disabledButton]}
        >
          <Text style={styles.googleButtonText}>Google로 계속하기</Text>
        </Pressable>

        {appleAvailable && (
          <View
            pointerEvents={busy ? "none" : "auto"}
            style={[styles.appleContainer, busy && styles.disabledButton]}
          >
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={TOKENS.rPill}
              style={styles.appleButton}
              onPress={() => void handleSignIn("apple")}
            />
          </View>
        )}

        {errorCopy ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorCopy}>
            {errorCopy}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TOKENS.cream,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 36,
    justifyContent: "space-between",
  },
  topHeader: {
    marginTop: 24,
  },
  brand: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    color: TOKENS.text,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 34,
    color: TOKENS.text,
    marginTop: 12,
    marginBottom: 24,
  },
  bookArt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 10,
    marginVertical: 20,
  },
  bookBlock: {
    width: 44,
    borderRadius: TOKENS.rCard,
  },
  bookLeft: {
    height: 72,
    backgroundColor: TOKENS.fill2,
  },
  bookMiddle: {
    height: 90,
    backgroundColor: TOKENS.fill3,
  },
  bookRight: {
    height: 72,
    backgroundColor: TOKENS.fill1,
  },
  bottomActions: {
    gap: 12,
  },
  spinner: {
    marginBottom: 4,
  },
  oauthButton: {
    minHeight: 48,
    borderRadius: TOKENS.rPill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  googleButton: {
    backgroundColor: TOKENS.paper,
    borderWidth: 1,
    borderColor: TOKENS.surface3,
  },
  googleButtonText: {
    color: TOKENS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  appleContainer: {
    minHeight: 48,
  },
  appleButton: {
    width: "100%",
    height: 48,
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorCopy: {
    marginTop: 4,
    fontSize: 14,
    color: TOKENS.text,
    textAlign: "center",
  },
});
