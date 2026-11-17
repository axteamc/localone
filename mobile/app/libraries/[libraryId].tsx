// TODO(연결): B
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : "";
}

function parseDistanceMeters(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string" || !/^(0|[1-9][0-9]*)$/.test(raw)) {
    return null;
  }
  return Number.isSafeInteger(Number(raw)) ? raw : null;
}

export default function LibraryDetailStubScreen() {
  const params = useLocalSearchParams<{
    libraryId?: string | string[];
    distanceM?: string | string[];
  }>();
  const libraryId = firstString(params.libraryId);
  const distanceM = parseDistanceMeters(params.distanceM);
  const summary =
    distanceM !== null
      ? `libraryId: ${libraryId} · distanceM: ${distanceM}`
      : `libraryId: ${libraryId}`;

  return (
    <View style={styles.container}>
      <Text style={styles.params}>{summary}</Text>
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
