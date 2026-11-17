// TODO(연결): C
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : "";
}

export default function BookDetailStubScreen() {
  const params = useLocalSearchParams<{ isbn13?: string | string[] }>();
  const isbn13 = firstString(params.isbn13);

  return (
    <View style={styles.container}>
      <Text style={styles.params}>{`isbn13: ${isbn13}`}</Text>
      <Text style={styles.subtitle}>준비 중이에요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
    backgroundColor: theme.colors.bg,
  },
  params: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSub,
  },
});
