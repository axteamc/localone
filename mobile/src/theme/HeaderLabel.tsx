// 머리 띠 영어 표찰(2026-11-18 D 결정 "머리 띠 표찰" ①: 영어만). 한글 화면 이름은 탭·본문 제목이 맡는다.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { panel, theme, type } from "./index";

export function HeaderLabel({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={type.label}>
      {children}
    </Text>
  );
}

/** expo-router 머리 띠 공통 옵션: 파사드와 같은 유리판 + 아래 줄눈, 영어 표찰 */
export function headerOptions(label: string) {
  return {
    headerStyle: { backgroundColor: panel.backgroundColor },
    headerShadowVisible: false,
    headerTintColor: theme.colors.inkStrong,
    headerTitleAlign: "left" as const,
    headerTitle: () => <HeaderLabel>{label}</HeaderLabel>,
    headerBackground: () => <View style={styles.bg} />,
  };
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: panel.backgroundColor, borderBottomWidth: 1, borderColor: panel.borderColor },
});
