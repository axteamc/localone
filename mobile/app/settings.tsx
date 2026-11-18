// AUTH-2 G6·G7 설정 화면: 로그아웃(AUTH-2)·회원 탈퇴(AUTH-3 W4·W5). 문구는 계약 auth.md AUTH-2·AUTH-3 C3(기본값(Claude)).
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAccountActions, useAuth } from "../src/auth/AuthProvider";
import { actionColors, cardSurface, panel, theme, type as T } from "../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const { signOut, withdrawAccount } = useAccountActions();
  const [signingOut, setSigningOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const busy = signingOut || withdrawing;

  const onSignOut = async () => {
    if (busy) return;
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/"); // G7: 끝나면 홈(로그인 안내가 잠깐 보이지 않게 이동 먼저)
    } finally {
      setSigningOut(false);
    }
  };

  const onWithdraw = async () => {
    if (busy) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const result = await withdrawAccount();
      if (result.ok) {
        router.replace("/"); // W5
        return;
      }
      setWithdrawError(result.errorMessage);
    } finally {
      setWithdrawing(false);
    }
  };

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  if (status !== "signedIn" && !busy) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>로그인하면 설정을 볼 수 있어요</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.button, ACT.primary, pressed && ACT.primaryPressed]}
        >
          <Text style={[styles.buttonText, ACT.primaryText]}>로그인</Text>
        </Pressable>
      </View>
    );
  }

  const signOutBtnStyle = confirming ? ACT.secondary : ACT.primary;
  const signOutPressedStyle = confirming ? ACT.secondaryPressed : ACT.primaryPressed;
  const signOutTextStyle = confirming ? ACT.secondaryText : ACT.primaryText;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy: signingOut }}
        disabled={busy}
        onPress={() => {
          void onSignOut();
        }}
        style={({ pressed }) => [styles.button, signOutBtnStyle, pressed && !busy && signOutPressedStyle]}
      >
        {signingOut ? (
          <ActivityIndicator accessibilityLabel="로그아웃하는 중" color={signOutTextStyle.color} />
        ) : (
          <Text style={[styles.buttonText, signOutTextStyle]}>로그아웃</Text>
        )}
      </Pressable>

      {!confirming ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => {
            setWithdrawError(null);
            setConfirming(true);
          }}
          style={({ pressed }) => [styles.button, ACT.secondary, pressed && !busy && ACT.secondaryPressed]}
        >
          <Text style={[styles.buttonText, ACT.secondaryText]}>회원 탈퇴</Text>
        </Pressable>
      ) : (
        <View style={styles.confirm} testID="withdraw-confirm">
          <Text style={styles.confirmTitle}>정말 탈퇴할까요?</Text>
          <Text style={styles.confirmBody}>
            빌릴 예정, 좋아요, 북마크가 지워지고 내가 올린 글은 더 이상 보이지 않아요. 같은 계정으로 다시 가입할 수 없고 되돌릴 수 없어요.
          </Text>
          {withdrawError !== null && <Text style={styles.error}>{withdrawError}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy: withdrawing }}
            disabled={busy}
            onPress={() => {
              void onWithdraw();
            }}
            style={({ pressed }) => [styles.button, ACT.primary, pressed && !busy && ACT.primaryPressed]}
          >
            {withdrawing ? (
              <ActivityIndicator accessibilityLabel="탈퇴하는 중" color={ACT.primaryText.color} />
            ) : (
              <Text style={[styles.buttonText, ACT.primaryText]}>탈퇴하기</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => {
              setConfirming(false);
              setWithdrawError(null);
            }}
            style={({ pressed }) => [styles.button, ACT.secondary, pressed && !busy && ACT.secondaryPressed]}
          >
            <Text style={[styles.buttonText, ACT.secondaryText]}>취소</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: panel.backgroundColor,
  },
  notice: {
    ...T.title,
    textAlign: "center",
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radii.control,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  confirm: {
    ...cardSurface(theme, { onPanel: true }),
    gap: 10,
    padding: 16,
  },
  confirmTitle: {
    ...T.title,
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSub,
  },
  error: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
  },
});
