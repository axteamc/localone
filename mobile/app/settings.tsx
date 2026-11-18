// AUTH-2 G6·G7 설정 화면: 로그아웃(AUTH-2). 문구는 계약 auth.md AUTH-2 C3(기본값(Claude)).
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAccountActions, useAuth } from "../src/auth/AuthProvider";
import { actionColors, theme } from "../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const { signOut } = useAccountActions();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/"); // G7: 끝나면 홈(로그인 안내가 잠깐 보이지 않게 이동 먼저)
    } finally {
      setSigningOut(false);
    }
  };

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  if (status !== "signedIn" && !signingOut) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>로그인하면 설정을 볼 수 있어요</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={[styles.button, ACT.primary]}>
          <Text style={[styles.buttonText, ACT.primaryText]}>로그인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
        disabled={signingOut}
        onPress={() => {
          void onSignOut();
        }}
        style={[styles.button, ACT.primary]}
      >
        {signingOut ? (
          <ActivityIndicator accessibilityLabel="로그아웃하는 중" color={ACT.primaryText.color} />
        ) : (
          <Text style={[styles.buttonText, ACT.primaryText]}>로그아웃</Text>
        )}
      </Pressable>
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
    backgroundColor: theme.colors.bg,
  },
  notice: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    color: theme.colors.text,
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
    fontSize: 16,
    fontWeight: "600",
  },
});
