// TODO(연결): B
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : "";
}

export default function PostDetailStubScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const postId = firstString(params.postId);

  return (
    <View style={styles.container}>
      <Text style={styles.params}>{`postId: ${postId}`}</Text>
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
