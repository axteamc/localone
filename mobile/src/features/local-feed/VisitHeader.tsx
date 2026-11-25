// 방문 페이지 머리 (contracts/local-feed.md VISIT-2 G11·G12, 명세 결정 1·2)
// 2026-11-25 C-92(G11b·core K27): 그린 꺾쇠 + "LIBRARY" 표찰, 스탬프 조각을 거리·운영 줄 오른쪽으로("이 도서관 이야기" 줄 없앰).
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Today } from "../../lib/publicApi";
import { type Theme } from "../../theme";
import { BackChevron, HeaderTitle } from "../../theme/ScreenHeader";
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

/** 그린 꺾쇠(core K27). 글자 `‹`는 기준선이 제목과 어긋났다 */
function BackButton({ onBack }: { onBack: () => void }) {
  const { C, styles } = useLook(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="지도 홈으로 돌아가기"
      onPress={onBack}
      hitSlop={6}
      style={styles.back}
      testID="visit-back"
    >
      <BackChevron color={C.inkStrong} />
    </Pressable>
  );
}

export const VISIT_HEADER_LABEL = "LIBRARY";

export type VisitHeaderProps = {
  name: string;
  distanceM: number | null;
  today: Today | null;
  onBack: () => void;
  more: React.ReactNode; // ⋯ 버튼(메뉴는 VISIT-2-P2 VisitMenu)
  folded?: boolean;
  /** 거리·운영 줄 오른쪽 끝에 붙는 스탬프 조각(VISIT-4 StampButton, C-92 G11b) */
  stamp?: React.ReactNode;
};

/** 두 줄 머리: ‹ … ⋯(같은 줄, 2026-11-25 C-89 — 이전: ⋯는 거리 줄 오른쪽이라 긴 이름에서 아래로 밀림) / 이름 / "거리 · 오늘 운영시간" */
export function VisitHeader({ name, distanceM, today, onBack, more, folded = false, stamp = null }: VisitHeaderProps) {
  const { styles } = useLook(makeStyles);
  const insets = useSafeAreaInsets();
  const closed = today?.is_closed === true;
  const hours = today?.hours_text ?? "정보 없음";
  return (
    <View
      style={[styles.two, { paddingTop: Math.max(4, insets.top), minHeight: HEADER_TWO_LINES + insets.top }]}
      testID="visit-header-two"
    >
      <View style={styles.topRow} testID="visit-header-top-row">
        {folded ? <View style={styles.back} /> : <BackButton onBack={onBack} />}
        <View style={styles.labelWrap}>{folded ? null : <HeaderTitle label={VISIT_HEADER_LABEL} title="도서관" />}</View>
        {folded ? <View style={styles.moreSpace} /> : more}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.infoRow} testID="visit-header-info-row">
        <Text style={styles.info} numberOfLines={1} testID="visit-header-info">
          {distanceM !== null ? `${formatDistance(distanceM)} · ` : ""}
          {closed ? <Text style={styles.closed}>오늘 휴관</Text> : hours}
        </Text>
        {stamp}
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
      <BackButton onBack={onBack} />
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
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  back: { width: 44, height: 44, marginLeft: -12, alignItems: "center", justifyContent: "center" },
  labelWrap: { flex: 1, justifyContent: "center" },
  name: { ...T.pageTitle },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
  info: { flexShrink: 1, ...T.gauge },
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
