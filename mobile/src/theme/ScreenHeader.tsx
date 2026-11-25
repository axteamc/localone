// 화면 머리 공통 모양(core K27, 2026-11-25 C-92 사용자 요청 #1 "전 페이지 헤더 `<` 정렬 · 영문 통일").
// 글자 `‹`·`✕`는 글꼴마다 기준선이 달라 제목과 세로로 어긋났다(C-90 알림함에서 먼저 그린 꺾쇠로 바꿈) →
// 선으로 그린 꺾쇠·엑스를 44×44 단추 가운데에 두고, 가운데에는 영어 표찰(HeaderLabel)을 같은 줄 세로 가운데로.
// 알약·원으로 감싸지 않는다. 한글 화면 이름은 접근성 이름으로만 남긴다.
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { panel, theme, type } from "./index";

export const HEADER_MIN_HEIGHT = 52;
export const HEADER_HIT = 44;

/** 위·왼쪽 테두리만 있는 정사각형을 −45° 돌린 꺾쇠(굵기 2). 시각 가운데가 단추 가운데에 오게 오른쪽으로 조금 민다 */
export function BackChevron({ color = theme.colors.text, size = 11 }: { color?: string; size?: number }) {
  return (
    <View
      testID="back-chevron"
      style={{
        width: size,
        height: size,
        borderLeftWidth: 2,
        borderTopWidth: 2,
        borderColor: color,
        transform: [{ rotate: "-45deg" }],
        marginLeft: Math.round(size * 0.35),
      }}
    />
  );
}

/** 선 두 개로 그린 ✕(굵기 2) */
export function CloseMark({ color = theme.colors.text, size = 14 }: { color?: string; size?: number }) {
  const line = { position: "absolute" as const, width: size * 1.2, height: 2, borderRadius: 1, backgroundColor: color };
  return (
    <View testID="close-mark" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[line, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[line, { transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

export type HeaderIconButtonProps = {
  kind?: "back" | "close";
  label?: string;
  onPress(): void;
  color?: string;
  testID?: string;
};

/** 44×44 누르는 자리 가운데에 그린 꺾쇠/엑스 */
export function HeaderIconButton({ kind = "back", label, onPress, color, testID }: HeaderIconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (kind === "close" ? "닫기" : "뒤로")}
      onPress={onPress}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
    >
      {kind === "close" ? <CloseMark color={color} /> : <BackChevron color={color} />}
    </Pressable>
  );
}

/** 영어 표찰(머리 띠와 같은 `type.label`). 한글 이름은 화면 읽기 프로그램용 */
export function HeaderTitle({ label, title, color }: { label: string; title?: string; color?: string }) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel={title ?? label}
      numberOfLines={1}
      style={[styles.label, color ? { color } : null]}
    >
      {label}
    </Text>
  );
}

export type ScreenHeaderProps = {
  /** 영어 대문자 표찰(예 "CLUB") */
  label: string;
  /** 한글 화면 이름(접근성 이름) */
  title?: string;
  onBack(): void;
  backKind?: "back" | "close";
  backLabel?: string;
  right?: ReactNode;
  topInset?: number;
  bordered?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** ‹ LABEL ⋯ 한 줄(세로 가운데 맞춤, 최소 높이 52 + 안전 영역) */
export function ScreenHeader({
  label,
  title,
  onBack,
  backKind = "back",
  backLabel,
  right,
  topInset = 0,
  bordered = true,
  testID,
  style,
}: ScreenHeaderProps) {
  return (
    <View
      testID={testID}
      style={[styles.head, bordered && styles.bordered, { paddingTop: topInset, minHeight: HEADER_MIN_HEIGHT + topInset }, style]}
    >
      <HeaderIconButton kind={backKind} label={backLabel} onPress={onBack} testID={testID ? `${testID}-back` : undefined} />
      <View style={styles.titleWrap}>
        <HeaderTitle label={label} title={title} />
      </View>
      <View style={styles.right}>{right ?? <View style={styles.icon} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: panel.backgroundColor,
  },
  bordered: { borderBottomWidth: 1, borderColor: panel.borderColor },
  icon: { width: HEADER_HIT, height: HEADER_HIT, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  titleWrap: { flex: 1, minHeight: HEADER_HIT, justifyContent: "center" },
  label: { ...type.label, textTransform: "uppercase" },
  right: { minWidth: HEADER_HIT, minHeight: HEADER_HIT, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingRight: 6 },
});
