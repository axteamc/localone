import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";

export type TemplateKey = "minimal" | "ink";

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  minimal: "미니멀",
  ink: "잉크 손글씨",
};

type TemplateCardProps = {
  template: TemplateKey;
  overlayText: string | null;
  book: { title: string; author: string | null } | null;
  width: number;
};

export function TemplateCard({ template, overlayText, book, width }: TemplateCardProps) {
  const { T, styles } = useLook(makeStyles);
  const ink = template === "ink";
  const fontSize = Math.max(9, Math.min(T.title.fontSize, width / 11));
  return (
    <View
      testID={`template-card-${template}`}
      style={[styles.card, { width, padding: width / 10 }, ink && styles.ink]}
    >
      {overlayText ? (
        <Text numberOfLines={6} style={[T.title, { fontSize }, ink && styles.handwriting]}>
          {overlayText}
        </Text>
      ) : null}
      {book ? (
        <Text numberOfLines={2} style={[styles.book, { fontSize: Math.min(14, fontSize) }]}>
          {book.title}{book.author ? ` · ${book.author}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  return StyleSheet.create({
    card: {
      aspectRatio: 1, alignSelf: "center", justifyContent: "center", gap: 8,
      borderRadius: theme.radii.card, backgroundColor: C.paper, overflow: "hidden",
    },
    ink: { backgroundColor: C.cream },
    handwriting: { fontStyle: "italic", color: C.inkStrong },
    book: { color: C.inkMuted },
  });
};
