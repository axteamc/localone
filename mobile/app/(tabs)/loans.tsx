// 대출·반납 탭: ① 내 대출(loan-assistant.md LOAN-1 M8) ② 빌릴 예정(book-search.md LIB-3 N9)
// 비로그인이면 두 구역 대신 로그인 안내만 보이고 #16·#19를 부르지 않는다.
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { LoanPlansSection } from "../../src/features/book-search/LoanPlansSection";
import { LoansSection } from "../../src/features/loan-assistant/LoansSection";
import { theme, actionColors, type as T } from "../../src/theme";

export const LOANS_LOGIN = "로그인하면 빌릴 예정과 내 대출을 볼 수 있어요";

export default function LoansTabScreen() {
  const router = useRouter();
  const { status, userId } = useAuth();
  const [loansKey, setLoansKey] = useState(0); // 빌릴 예정에서 "빌렸어요" → 내 대출 다시 읽기(M10 ②)

  if (status === "loading") {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator accessibilityLabel="불러오는 중" />
      </View>
    );
  }

  if (status !== "signedIn") {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.gauge} numberOfLines={1}>SIGN IN REQUIRED</Text>
        <Text style={styles.title} numberOfLines={1}>대출·반납</Text>
        <Text style={styles.text}>{LOANS_LOGIN}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.primaryBtn, pressed && ACT.primaryPressed]}
        >
          <Text style={styles.primaryBtnText} numberOfLines={1}>로그인</Text>
        </Pressable>
      </View>
    );
  }

  const scopeKey = userId ?? "signed-in";
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <LoansSection key={`loans-${scopeKey}`} refreshKey={loansKey} />
      <LoanPlansSection key={`plans-${scopeKey}`} onLoanStarted={() => setLoansKey((k) => k + 1)} />
    </ScrollView>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.panelFrosted },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  pad: { padding: 16, paddingBottom: 32, gap: 24 },
  gauge: { ...T.gauge },
  title: { ...T.pageTitle },
  text: { fontSize: 15, color: c.text, lineHeight: 22, textAlign: "center" },
  primaryBtn: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    height: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontSize: 15, ...ACT.primaryText, fontWeight: "500" },
});
