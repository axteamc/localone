// TODO(연결): C
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/theme";

export default function LoansTabScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>대출·반납</Text>
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
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSub,
  },
});
