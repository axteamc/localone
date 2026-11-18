// 세 번째 방문 질문 카드 (contracts/local-feed.md VISIT-2 G5, C-58)
import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { markDefaultAsked, setDefaultLibrary } from "../../lib/visits";
import { actionColors, cardSurface, theme, type as T } from "../../theme";

const C = theme.colors;

export const ASK_TEXT = {
  title: "세 번째 방문이에요",
  body: (name: string) => `앱을 켜면 ${name}부터 열까요?`,
  yes: "네, 여기부터",
  no: "아니요",
} as const;

export function AskDefaultCard({
  libraryId,
  name,
  onDone,
}: {
  libraryId: number;
  name: string;
  onDone: (madeDefault: boolean) => void;
}) {
  const busy = useRef(false);
  const answer = async (yes: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (yes) await setDefaultLibrary(libraryId);
      await markDefaultAsked(libraryId); // 어느 쪽이든 다시 묻지 않는다
    } finally {
      onDone(yes);
    }
  };
  return (
    <View style={styles.card} accessibilityRole="alert" testID="ask-default-card">
      <Text style={styles.title}>{ASK_TEXT.title}</Text>
      <Text style={styles.body}>{ASK_TEXT.body(name)}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void answer(false)}
          style={({ pressed }) => [styles.no, pressed && ACT.secondaryPressed]}
        >
          <Text style={styles.noText}>{ASK_TEXT.no}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void answer(true)}
          style={({ pressed }) => [styles.yes, pressed && ACT.primaryPressed]}
        >
          <Text style={styles.yesText}>{ASK_TEXT.yes}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  card: {
    ...cardSurface(theme, { onPanel: true }),
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 112,
    padding: 16,
    gap: 6,
  },
  title: { ...T.title },
  body: { fontSize: 14, lineHeight: 20, color: C.textSub },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  no: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  noText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  yes: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  yesText: { ...ACT.primaryText, fontSize: 14, fontWeight: "500" },
});
