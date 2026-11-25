// 방문 화면 "+" 바로 위 작은 카드(contracts/local-feed.md VISIT-3 V3-O3, 2026-11-25 C-92, 시안 #el-compose A).
// 이전 GuestbookComposer.tsx(고르기 창·방명록 쓰는 창·방명록 로그인 창)에서 고르기만 남겼다 —
// 방명록은 스탬프 한마디(V4-12)로 합쳐 쓰는 창과 #33을 없앴다(사용자 2026-11-25 "제거").
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";

export const COMPOSE_TEXT = {
  choosePost: "게시물 올리기",
  choosePostSub: "사진·표지와 글",
  chooseClub: "모임 만들기",
  chooseClubSub: "같은 도서관 이웃과 만날 약속을 잡아요",
  close: "닫기",
} as const;

export type ComposeChooserProps = {
  visible: boolean;
  onPost(): void;
  onClub(): void;
  onClose(): void;
  /** `+` 버튼 윗변의 화면 아래로부터 거리(카드는 그 바로 위에 붙는다) */
  bottom: number;
};

/**
 * "+"를 누르면 그 바로 위에 뜨는 작은 카드(2026-11-25 C-92 V3-O3, 시안 #el-compose A). 두 항목만 — 방명록은
 * 스탬프 ▾ 메뉴의 "한마디"로 옮겼다. Modal이 아니라 방문 화면 안에 그려 넓은 웹에서도 앱 칼럼 안에 있다.
 * 바깥(화면 전체 투명 막)을 누르면 닫힌다.
 */
export function ComposeChooser({ visible, onPost, onClub, onClose, bottom }: ComposeChooserProps) {
  const { styles } = useLook(makeStyles);
  if (!visible) return null;
  return (
    <>
      <Pressable accessibilityLabel={COMPOSE_TEXT.close} onPress={onClose} style={styles.popScrim} testID="compose-scrim" />
      <View style={[styles.pop, { bottom }]} testID="compose-chooser" accessibilityRole="menu">
        <Pressable accessibilityRole="menuitem" onPress={onPost} style={({ pressed }) => [styles.popItem, pressed && styles.popPressed]}>
          <Text style={styles.rowText}>{COMPOSE_TEXT.choosePost}</Text>
          <Text style={styles.rowSub}>{COMPOSE_TEXT.choosePostSub}</Text>
        </Pressable>
        <View style={styles.popDivider} />
        <Pressable accessibilityRole="menuitem" onPress={onClub} style={({ pressed }) => [styles.popItem, pressed && styles.popPressed]}>
          <Text style={styles.rowText}>{COMPOSE_TEXT.chooseClub}</Text>
          <Text style={styles.rowSub}>{COMPOSE_TEXT.chooseClubSub}</Text>
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  return StyleSheet.create({
  rowText: { fontSize: 16, fontWeight: "500", color: C.text },
  rowSub: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  popScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 8 },
  // C-92 V3-O3: + 바로 위 오른쪽 맞춤 카드(최소 폭 220, 곡률 infoCard, 항목 52)
  pop: {
    position: "absolute",
    right: 16,
    minWidth: 220,
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    paddingVertical: 4,
    boxShadow: `0 4px 14px 0 ${C.shadowSoft}`,
    zIndex: 9,
  },
  popItem: { minHeight: 52, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 6 },
  popPressed: { opacity: 0.6 },
  popDivider: { height: 1, backgroundColor: C.seamHairline, marginHorizontal: 12 },
  });
};
