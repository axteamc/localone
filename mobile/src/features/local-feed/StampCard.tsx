// VISIT-4-P2 피드의 공개 스탬프 카드 — contracts/local-feed.md VISIT-4 V4-4·V4-6·V4-11, V4-O3, 명세 결정 3
// 2열 메이슨리 한 칸짜리 작은 카드: 동그란 도장(MM.DD) · "{닉네임} · 다녀왔어요" · 언제 · 오른쪽 아래 북마크.
// 카드를 눌러도 이동하지 않고, 내 카드여도 메뉴가 없다(바꾸기는 StampButton의 ⋯).
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import type { StampItem } from "./api";
import { guestbookTime } from "./GuestbookCard";


export const STAMP_CARD_TEXT = {
  visited: "다녀왔어요",
  bookmark: "북마크",
  bookmarked: "저장됨",
  saved: "저장했어요",
  unsaved: "저장을 풀었어요",
  saveFailed: "저장하지 못했어요. 다시 해 주세요",
  loginNeeded: "로그인하면 저장할 수 있어요",
} as const;

/** `stamped_on`(YYYY-MM-DD) → 도장 안 `MM.DD` */
export function stampSealDate(stampedOn: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(stampedOn);
  return m ? `${m[1]}.${m[2]}` : "";
}

/** 메이슨리 높이 어림(너비 대비) */
export const STAMP_HEIGHT_RATIO = 0.75;

export type StampCardProps = {
  stamp: StampItem;
  width: number;
  onToggleBookmark?(stampId: string, next: boolean): void;
};

export function StampCard({ stamp, width, onToggleBookmark }: StampCardProps) {
  const { C, styles } = useLook(makeStyles);
  const on = stamp.my_bookmark;
  return (
    <View style={[styles.card, { width }]} testID={`stamp-card-${stamp.id}`}>
      <View style={styles.seal} testID="stamp-seal">
        <Text style={styles.sealText}>{stampSealDate(stamp.stamped_on)}</Text>
      </View>
      <Text style={styles.name} numberOfLines={2}>{`${stamp.author_nickname} · ${STAMP_CARD_TEXT.visited}`}</Text>
      <View style={styles.bottom}>
        <Text style={styles.meta} numberOfLines={1}>
          {guestbookTime(stamp.published_at)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={on ? STAMP_CARD_TEXT.bookmarked : STAMP_CARD_TEXT.bookmark}
          accessibilityState={{ selected: on }}
          testID={`stamp-bookmark-${stamp.id}`}
          onPress={() => onToggleBookmark?.(stamp.id, !on)}
          style={styles.mark}
        >
          <View style={[styles.ribbon, { backgroundColor: on ? C.inkStrong : C.surface3 }]} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  return StyleSheet.create({
  card: {
    backgroundColor: C.paper,
    borderRadius: theme.radii.infoCard,
    borderWidth: 1,
    borderColor: C.seamHairline,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 4,
    gap: 6,
  },
  seal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: C.inkStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  sealText: { fontSize: 12, fontWeight: "700", color: C.inkStrong },
  name: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: C.text },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { fontSize: 11, color: C.inkMuted, flexShrink: 1 },
  mark: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  ribbon: { width: 12, height: 16, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  });
};
