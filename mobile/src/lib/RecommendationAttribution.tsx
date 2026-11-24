import { StyleSheet, Text } from "react-native";
import { theme } from "../theme";

export function RecommendationAttribution({ basisLabel }: { basisLabel: string | null }) {
  // #9의 추천 기준은 순위 제공자를 나타낸다. Book.source는 ISBN별로 보존된 서지의 출처다.
  if (!basisLabel || !/^YES24 (스테디셀러|베스트셀러) · /.test(basisLabel)) return null;

  return <Text style={styles.source}>출처: YES24</Text>;
}

const styles = StyleSheet.create({
  source: { fontSize: 12, color: theme.colors.textSub },
});
