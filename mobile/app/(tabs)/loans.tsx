// 대출·반납 탭: ① 내 대출 ② 빌릴 예정(book-search.md LIB-3 N9)
// 비로그인이면 두 구역 대신 로그인 안내만 보이고 #16을 부르지 않는다.
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { LoanPlansSection } from "../../src/features/book-search/LoanPlansSection";
import { theme } from "../../src/theme";

export const LOANS_LOGIN = "로그인하면 빌릴 예정과 내 대출을 볼 수 있어요";
export const LOANS_SLOT = "빌린 책은 곧 여기에 표시돼요";

export default function LoansTabScreen() {
  const router = useRouter();
  const { status } = useAuth();

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
        <Text style={styles.title}>대출·반납</Text>
        <Text style={styles.text}>{LOANS_LOGIN}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={styles.darkBtn}>
          <Text style={styles.darkBtnText}>로그인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <View testID="my-loans" style={styles.section}>
        <Text style={styles.sectionTitle}>내 대출</Text>
        {/* TODO(연결): C LOAN-1-P2 — 내 대출 목록 */}
        <View style={styles.box}>
          <Text style={styles.text}>{LOANS_SLOT}</Text>
        </View>
      </View>
      <LoanPlansSection />
    </ScrollView>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  pad: { padding: 16, paddingBottom: 32, gap: 24 },
  title: { fontSize: 18, fontWeight: "600", color: c.text },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: c.text },
  box: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 16 },
  text: { fontSize: 15, color: c.text, lineHeight: 22, textAlign: "center" },
  darkBtn: {
    backgroundColor: c.inkStrong,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, color: c.paper, fontWeight: "700" },
});
