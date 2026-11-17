// TODO(연결): D(AUTH-2)
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { onFill, theme } from "../../src/theme";

export default function MeTabScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const authLabel = status === "signedIn" ? "로그인함" : "로그인 안 함";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>내 정보</Text>
      <Text style={styles.subtitle}>준비 중이에요</Text>
      <View style={styles.authSection}>
        <Text style={styles.authStatus}>{authLabel}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/login")}
          style={styles.button}
        >
          <Text style={styles.buttonText}>로그인</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: theme.colors.bg,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSub,
  },
  authSection: {
    marginTop: 12,
    alignItems: "center",
    gap: 8,
  },
  authStatus: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radii.control,
    backgroundColor: theme.colors.inkStrong,
  },
  buttonText: {
    color: onFill(theme.colors.inkStrong),
    fontSize: 16,
    fontWeight: "600",
  },
});
