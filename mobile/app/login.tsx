import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useAuth, useSignInError } from "../src/auth/AuthProvider";
import { isAppleSignInAvailable, SignInResult } from "../src/auth/platform";
import { actionColors, panel, theme, type as T } from "../src/theme";
import { Logo } from "../src/theme/Logo";

// 로그인 파사드(개발산출물/시안/로그인_파사드_시안.html 채택안: 격자 1단계 .30 · 관계 C 아래 창 · 주 버튼 무광 판 · 로고 I4)
// 색·곡률·글자 단계는 테마 토큰에서만 가져온다(룩 전환 대응, DEF-019).
const C = theme.colors;
const R = theme.radii;
const ACT = actionColors(C);
const BAY = 120;

function LoginGrid({ width, height }: { width: number; height: number }): React.JSX.Element {
  const cols = Math.ceil(width / BAY / 2) + 1;
  const rows = Math.ceil(height / BAY) + 1;
  const mid = width / 2;
  const lines: React.ReactNode[] = [];
  for (let i = -cols; i <= cols; i++) {
    lines.push(<View key={`v${i}`} style={[styles.gridV, { left: mid + i * BAY }]} />);
  }
  for (let j = 0; j < rows; j++) {
    lines.push(<View key={`h${j}`} style={[styles.gridH, { top: j * BAY }]} />);
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="login-grid">
      {lines}
    </View>
  );
}

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
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [boardSize, setBoardSize] = useState<{ width: number; height: number } | null>(null);
  const { status, signInWithGoogle, signInWithApple } = useAuth();
  const { error: signInError, clearError: clearSignInError } =
    useSignInError?.() ?? { error: null, clearError: () => {} };
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCopy, setErrorCopy] = useState("");
  const displayedError = errorCopy || signInError || "";
  const busyRef = useRef(false);
  const navigatedRef = useRef(false);

  const onBoardLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBoardSize((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, []);

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
      clearSignInError();

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
    [clearSignInError, goHome, signInWithApple, signInWithGoogle]
  );

  const gridWidth = boardSize?.width ?? winWidth;
  const gridHeight = boardSize?.height ?? winHeight;

  return (
    <View style={styles.screen} onLayout={onBoardLayout}>
      <LoginGrid width={gridWidth} height={gridHeight} />

      <View style={styles.topHeader}>
        <Logo size={64} />
        <Text style={styles.brand}>동네한권</Text>
        <Text style={styles.title}>동네한권에 로그인</Text>
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.gauge}>SIGN IN</Text>

        {busy && (
          <ActivityIndicator
            accessibilityLabel="로그인하는 중"
            color={C.inkStrong}
            style={styles.spinner}
          />
        )}

        {displayedError ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorCopy}>
            {displayedError}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void handleSignIn("google")}
          style={({ pressed }) => [
            styles.oauthButton,
            ACT.primary,
            pressed && !busy && ACT.primaryPressed,
            busy && styles.disabledButton,
          ]}
        >
          <Text style={[styles.googleButtonText, ACT.primaryText]}>
            Google로 계속하기
          </Text>
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
              cornerRadius={R.control}
              style={styles.appleButton}
              onPress={() => void handleSignIn("apple")}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: panel.backgroundColor,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: C.seamHairline,
    opacity: 0.3,
  },
  gridH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.seamHairline,
    opacity: 0.3,
  },
  topHeader: {
    paddingTop: 56,
    paddingHorizontal: 24,
    alignItems: "flex-start",
  },
  brand: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1,
    color: C.text,
    marginTop: 12,
  },
  title: {
    ...T.pageTitle,
    lineHeight: 34,
    marginTop: 4,
  },
  bottomSheet: {
    marginTop: "auto",
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.seamHairline,
    borderTopLeftRadius: R.block,
    borderTopRightRadius: R.block,
    paddingTop: 18,
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 12,
    boxShadow: `0 -1px 0 0 ${C.seamHighlight}, 0 -4px 10px 0 ${C.shadowCast}`,
  },
  gauge: {
    ...T.gauge,
    marginBottom: 2,
  },
  spinner: {
    marginBottom: 4,
  },
  oauthButton: {
    minHeight: 48,
    borderRadius: R.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: "500",
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
    fontSize: 14,
    color: C.text,
    textAlign: "left",
  },
});
