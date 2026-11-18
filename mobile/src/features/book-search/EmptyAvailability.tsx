// 반경·지역 안에서 소장 도서관을 못 찾았을 때 안내(book-search.md LIB-2 A5·A12, V-2·V-3)
// "없어요"라고 단정하지 않고 "찾지 못했어요"라고 쓴다(02 LIB-07).
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme, actionColors } from "../../theme";

export const EMPTY_NEARBY =
  "내 주변 도서관에서 소장 도서를 찾지 못했어요. 시군구 전체 도서관에서 다시 찾아보거나 나중에 빌릴 책으로 저장해 보세요.";
export const EMPTY_CITY = "이 지역의 도서관에서도 찾지 못했어요.";

export function EmptyAvailability({
  scope,
  onSearchCity,
  onSaveForLater,
  onPickRegion,
}: {
  scope: "nearby" | "city";
  onSearchCity(): void;
  onSaveForLater(): void;
  onPickRegion(): void;
}) {
  if (scope === "city") {
    return (
      <View testID="empty-availability" style={styles.box}>
        <Text style={styles.text}>{EMPTY_CITY}</Text>
        <Pressable accessibilityRole="button" onPress={onPickRegion} style={styles.primary}>
          <Text style={styles.primaryText}>지역 다시 고르기</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View testID="empty-availability" style={styles.box}>
      <Text style={styles.text}>{EMPTY_NEARBY}</Text>
      <Pressable accessibilityRole="button" onPress={onSearchCity} style={styles.primary}>
        <Text style={styles.primaryText}>도시 전체 도서관에서 다시 찾기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onSaveForLater} style={styles.secondary}>
        <Text style={styles.secondaryText}>나중에 빌릴 책으로 저장</Text>
      </Pressable>
    </View>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  box: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 16, gap: 10 },
  text: { fontSize: 15, color: c.text, lineHeight: 22 },
  primary: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { ...ACT.primaryText, fontSize: 16, fontWeight: "500" },
  secondary: {
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: theme.radii.inner,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { color: c.text, fontSize: 15, fontWeight: "500" },
});
