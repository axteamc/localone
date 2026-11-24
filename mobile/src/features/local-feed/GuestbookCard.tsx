// VISIT-3-P3 방명록 카드·내 방명록 메뉴 — contracts/local-feed.md VISIT-3 V3-6·V3-10, V3-O4·V3-O6, 명세 결정 3
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { actionColors, type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import type { GuestbookItem } from "./api";


/**
 * 방명록 카드 바탕 색 후보(2026-11-19 D 결정, 구현 후 D가 화면에서 확인해 확정 — 명세 결정 3 `미확인(임시)`).
 * 바꿔 보려면 아래 GUESTBOOK_CARD_COLOR의 키 하나만 바꾼다.
 * sRGB/HEX 값은 이슈 #230에서 Pantone TCX 공식 값으로 확인 완료(2026-11-19):
 * 11-0602 #F2F0EB, 11-0701 #EDE6DB, 12-4302 #DFDDD7.
 */
export const GUESTBOOK_CARD_COLORS = {
  "PANTONE 11-0602 TCX Snow White": "#F2F0EB",
  "PANTONE 11-0701 TCX Whisper White": "#EDE6DB",
  "PANTONE 12-4302 TCX Vaporous Gray": "#DFDDD7",
} as const;
export const GUESTBOOK_CARD_COLOR = GUESTBOOK_CARD_COLORS["PANTONE 11-0602 TCX Snow White"]; // 확정 전 기본: 첫 후보

export const GUESTBOOK_CARD_TEXT = {
  tag: "방명록",
  menuLabel: "방명록 메뉴",
  menuTitle: "내 방명록",
  withdraw: "지우기",
  withdrawSub: "피드에서 내려요",
  close: "닫기",
  confirmTitle: "이 방명록을 지울까요?",
  confirmSub: "지우면 피드에서 사라지고 되돌릴 수 없어요.",
  cancel: "취소",
  withdrawn: "방명록을 지웠어요",
  withdrawFailed: "방명록을 지우지 못했어요. 다시 해 주세요",
} as const;

const KST_MS = 9 * 60 * 60 * 1000;
const kstDate = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 10);

/** V3-O4 "언제": 방금 · n분 전 · n시간 전(오늘) · 어제 · n일 전(2~6일) · YYYY.MM.DD (KST) */
export function guestbookTime(publishedAt: string, now: number = Date.now()): string {
  const at = Date.parse(publishedAt);
  if (Number.isNaN(at)) return "";
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  const today = kstDate(now);
  const day = kstDate(at);
  if (day === today) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const days = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  if (days === 1) return "어제";
  if (days >= 2 && days <= 6) return `${days}일 전`;
  return day.replace(/-/g, ".");
}

export type GuestbookCardProps = {
  entry: GuestbookItem;
  width: number;
  onMenu?(entry: GuestbookItem): void;
};

/** 2열 메이슨리 한 칸짜리 글 카드. 눌러도 다른 화면으로 가지 않는다(V3-O4) */
export function GuestbookCard({ entry, width, onMenu }: GuestbookCardProps) {
  const { styles } = useLook(makeStyles);
  return (
    <View style={[styles.card, { width }]} testID={`guestbook-card-${entry.id}`}>
      <View style={styles.tagRow}>
        <View style={styles.tag}>
          <View style={styles.tagDot} />
          <Text style={styles.tagText}>{GUESTBOOK_CARD_TEXT.tag}</Text>
        </View>
        {entry.mine && onMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={GUESTBOOK_CARD_TEXT.menuLabel}
            hitSlop={10}
            onPress={() => onMenu(entry)}
            style={styles.more}
          >
            <Text style={styles.moreText}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.body}>{entry.body}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {`${entry.author_nickname} · ${guestbookTime(entry.published_at)}`}
      </Text>
    </View>
  );
}

/** 메이슨리 높이 어림(너비 대비). 글 길이만큼 길어진다 */
export function guestbookHeightRatio(entry: Pick<GuestbookItem, "body">): number {
  const lines = Math.max(1, Math.ceil(entry.body.length / 10));
  return 0.45 + lines * 0.13;
}

export type GuestbookMenuProps = {
  entry: GuestbookItem;
  busy: boolean;
  onClose(): void;
  onWithdraw(entry: GuestbookItem): void;
};

/** 내 카드 ⋯ → "지우기" → 확인창 → "지우기"(V3-O6). 되돌리기 없음 */
export function GuestbookMenu({ entry, busy, onClose, onWithdraw }: GuestbookMenuProps) {
  const { ACT, styles } = useLook(makeStyles);
  const [confirming, setConfirming] = useState(false);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {confirming ? (
          <View style={styles.sheet} accessibilityRole="alert" testID="guestbook-confirm">
            <Text style={styles.sheetTitle}>{GUESTBOOK_CARD_TEXT.confirmTitle}</Text>
            <Text style={styles.sheetSub}>{GUESTBOOK_CARD_TEXT.confirmSub}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onWithdraw(entry)}
              style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
            >
              <Text style={styles.primaryText}>{GUESTBOOK_CARD_TEXT.withdraw}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirming(false)}
              style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{GUESTBOOK_CARD_TEXT.cancel}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.sheet} testID="guestbook-menu">
            <Text style={styles.sheetTitle}>{GUESTBOOK_CARD_TEXT.menuTitle}</Text>
            <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.row}>
              <Text style={styles.rowText}>{GUESTBOOK_CARD_TEXT.withdraw}</Text>
              <Text style={styles.rowSub}>{GUESTBOOK_CARD_TEXT.withdrawSub}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{GUESTBOOK_CARD_TEXT.close}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T, ACT } = lookKit(theme);
  return StyleSheet.create({
  card: {
    backgroundColor: GUESTBOOK_CARD_COLOR,
    borderRadius: theme.radii.infoCard,
    borderWidth: 1,
    borderColor: C.seamHairline,
    padding: 14,
    gap: 8,
  },
  tagRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, opacity: 0.7 },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.inkStrong },
  tagText: { fontSize: 11, fontWeight: "500", color: C.text },
  more: { minWidth: 32, alignItems: "flex-end" },
  moreText: { fontSize: 18, lineHeight: 20, color: C.inkMuted },
  body: { fontSize: 15, lineHeight: 22, color: C.text },
  meta: { fontSize: 11, color: C.inkMuted },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: C.shadowDeep },
  sheet: {
    backgroundColor: C.panelLit,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
    borderTopLeftRadius: theme.radii.infoCard,
    borderTopRightRadius: theme.radii.infoCard,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  sheetTitle: { ...T.title },
  sheetSub: { fontSize: 14, color: C.textSub },
  row: { minHeight: 52, justifyContent: "center" },
  rowText: { fontSize: 16, fontWeight: "500", color: C.text },
  rowSub: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center" },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center" },
  secondaryText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "500" },
  });
};
