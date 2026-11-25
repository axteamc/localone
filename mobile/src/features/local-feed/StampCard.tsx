// VISIT-4-P2 피드의 공개 스탬프 카드 — contracts/local-feed.md VISIT-4 V4-4·V4-6·V4-11, V4-O3, 명세 결정 3
// 2열 메이슨리 한 칸짜리 작은 카드: 동그란 도장(MM.DD) · "{닉네임} · 다녀왔어요" · 언제 · 오른쪽 아래 북마크.
// 카드를 눌러도 이동하지 않고, 내 카드여도 메뉴가 없다(바꾸기는 StampButton의 ▾).
// 2026-11-25 C-92(V4-O7): 한마디(`body`)가 있으면 이름 줄 아래에 방명록 카드처럼 글 15 전부.
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
  menuLabel: "방문 기록 메뉴",
} as const;

/** `stamped_on`(YYYY-MM-DD) → 도장 안 `MM.DD` */
export function stampSealDate(stampedOn: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(stampedOn);
  return m ? `${m[1]}.${m[2]}` : "";
}

/** 메이슨리 높이 어림(너비 대비). 한마디가 있으면 방명록 카드처럼 글 길이만큼 늘린다 */
export const STAMP_HEIGHT_RATIO = 0.75;
export function stampHeightRatio(stamp: Pick<StampItem, "body">): number {
  const body = stamp.body ?? "";
  return body ? STAMP_HEIGHT_RATIO + Math.max(1, Math.ceil(body.length / 10)) * 0.13 : STAMP_HEIGHT_RATIO;
}

export type StampCardProps = {
  stamp: StampItem;
  width: number;
  onToggleBookmark?(stampId: string, next: boolean): void;
  /** 남의 공개 스탬프 ⋯ → 신고(C-92, 게시물과 같은 길). 내 것은 ▾ 메뉴에서 바꾼다 */
  onMenu?(stamp: StampItem): void;
};

export function StampCard({ stamp, width, onToggleBookmark, onMenu }: StampCardProps) {
  const { C, styles } = useLook(makeStyles);
  const on = stamp.my_bookmark;
  return (
    <View style={[styles.card, { width }]} testID={`stamp-card-${stamp.id}`}>
      <View style={styles.top}>
        <View style={styles.seal} testID="stamp-seal">
          <Text style={styles.sealText}>{stampSealDate(stamp.stamped_on)}</Text>
        </View>
        {onMenu && !stamp.mine ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STAMP_CARD_TEXT.menuLabel}
            hitSlop={10}
            onPress={() => onMenu(stamp)}
            style={styles.more}
            testID={`stamp-menu-${stamp.id}`}
          >
            <Text style={styles.moreText}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>{`${stamp.author_nickname} · ${STAMP_CARD_TEXT.visited}`}</Text>
      {stamp.body ? (
        <Text style={styles.body} testID={`stamp-body-${stamp.id}`}>
          {stamp.body}
        </Text>
      ) : null}
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
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  more: { minWidth: 32, minHeight: 32, alignItems: "flex-end" },
  moreText: { fontSize: 18, lineHeight: 20, color: C.inkMuted },
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
  body: { fontSize: 15, lineHeight: 22, color: C.text },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { fontSize: 11, color: C.inkMuted, flexShrink: 1 },
  mark: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  ribbon: { width: 12, height: 16, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  });
};
