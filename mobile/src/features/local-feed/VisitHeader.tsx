// 방문 페이지 머리 (contracts/local-feed.md VISIT-2 G11·G12, 명세 결정 1·2)
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Today } from "../../lib/publicApi";
import { type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";

export const HEADER_TWO_LINES = 115; // 앱 값(시안 86 ÷ 0.75)
export const HEADER_ONE_LINE = 52; // 앱 값(시안 40 ÷ 0.75)
export const FOLD_AT = HEADER_TWO_LINES - HEADER_ONE_LINE;

/** 1,000m 미만 `320m`, 이상 소수 한 자리 `1.3km` (C3) */
export function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

/** 경로 값 distanceM: 0 이상 안전한 정수 문자열 한 값만, 나머지는 null (C3) */
export function parseDistanceM(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** 경로 값 libraryId: 양의 안전한 정수 문자열 한 값만 (C3) */
export function parseLibraryId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

function BackButton({ onBack, size }: { onBack: () => void; size: number }) {
  const { styles } = useLook(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="지도 홈으로 돌아가기"
      onPress={onBack}
      hitSlop={10}
      style={styles.back}
    >
      <Text style={[styles.backText, { fontSize: size }]}>‹</Text>
    </Pressable>
  );
}

export type VisitHeaderProps = {
  name: string;
  distanceM: number | null;
  today: Today | null;
  onBack: () => void;
  more: React.ReactNode; // ⋯ 버튼(메뉴는 VISIT-2-P2 VisitMenu)
  folded?: boolean;
};

/** 두 줄 머리: ‹ / 이름 / "거리 · 오늘 운영시간" + ⋯ */
export function VisitHeader({ name, distanceM, today, onBack, more, folded = false }: VisitHeaderProps) {
  const { styles } = useLook(makeStyles);
  const insets = useSafeAreaInsets();
  const closed = today?.is_closed === true;
  const hours = today?.hours_text ?? "정보 없음";
  return (
    <View
      style={[styles.two, { paddingTop: Math.max(4, insets.top), minHeight: HEADER_TWO_LINES + insets.top }]}
      testID="visit-header-two"
    >
      {folded ? <View style={styles.back} /> : <BackButton onBack={onBack} size={30} />}
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.infoRow} testID="visit-header-info-row">
        <Text style={styles.info} numberOfLines={1} testID="visit-header-info">
          {distanceM !== null ? `${formatDistance(distanceM)} · ` : ""}
          {closed ? <Text style={styles.closed}>오늘 휴관</Text> : hours}
        </Text>
        {folded ? <View style={styles.moreSpace} /> : more}
      </View>
    </View>
  );
}

/** 접힌 한 줄 머리: ‹ 이름 ⋯ (G12) */
export function VisitHeaderFolded({ name, onBack, more }: Pick<VisitHeaderProps, "name" | "onBack" | "more">) {
  const { styles } = useLook(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.one, { paddingTop: insets.top, minHeight: HEADER_ONE_LINE + insets.top }]}
      testID="visit-header-one"
    >
      <BackButton onBack={onBack} size={24} />
      <Text style={styles.nameSmall} numberOfLines={1}>
        {name}
      </Text>
      {more}
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T, panel } = lookKit(theme);
  return StyleSheet.create({
  two: { minHeight: HEADER_TWO_LINES, paddingHorizontal: 16, paddingTop: 4, justifyContent: "flex-end" },
  back: { alignSelf: "flex-start", minWidth: 44, minHeight: 36, justifyContent: "center" },
  backText: {
    color: C.inkStrong,
    fontWeight: "500",
    textShadowColor: C.shadowSoft,
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  name: { ...T.pageTitle },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 },
  info: { flex: 1, ...T.gauge },
  closed: { fontWeight: "500", color: C.text },
  moreSpace: { minWidth: 44, minHeight: 36 },
  one: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_ONE_LINE,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    backgroundColor: panel.backgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: panel.borderColor,
    zIndex: 5,
  },
  nameSmall: { flex: 1, ...T.name },
  });
};
