// 상세 상단 액션 바의 공감(♡ + 수)·저장 버튼 — contracts/local-feed.md LOCAL-2 H5·H6·H14, C6 H-#5·H-#6.
// 누르는 동안 한 번 더 눌러도 한 번만 보낸다. 로그인 안 했으면 서버에 묻지 않고 onLoginNeeded.
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { onFill, theme } from "../../theme";
import { setBookmark, setReaction } from "./api";
import { toggleFailText } from "./PostMenu";

const C = theme.colors;

export const SAVE_TEXT = { save: "저장", saved: "저장됨" } as const;

type Common = {
  postId: string;
  signedIn: boolean;
  onLoginNeeded(): void;
  onNotice(text: string): void;
};

function useOnce() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>) => {
    if (running.current) return; // 연타 막기(H-#5)
    running.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}

export function ReactionButton(
  props: Common & { reacted: boolean; count: number; onChange(reacted: boolean, count: number): void }
) {
  const { busy, run } = useOnce();
  const press = () => {
    if (!props.signedIn) {
      props.onLoginNeeded();
      return;
    }
    void run(async () => {
      try {
        const res = await setReaction(props.postId, !props.reacted);
        props.onChange(res.reacted, res.reaction_count);
      } catch (e) {
        props.onNotice(toggleFailText(e));
      }
    });
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.reacted ? `공감 취소, 공감 ${props.count}개` : `공감하기, 공감 ${props.count}개`}
      accessibilityState={{ selected: props.reacted, busy }}
      onPress={press}
      style={styles.action}
      testID="reaction-button"
    >
      <Text style={[styles.heart, props.reacted && styles.heartOn]}>{props.reacted ? "♥" : "♡"}</Text>
      <Text style={styles.count}>{props.count}</Text>
    </Pressable>
  );
}

export function SaveButton(props: Common & { saved: boolean; onChange(saved: boolean): void }) {
  const { busy, run } = useOnce();
  const press = () => {
    if (!props.signedIn) {
      props.onLoginNeeded();
      return;
    }
    void run(async () => {
      try {
        const res = await setBookmark(props.postId, !props.saved); // 해제도 확인 창 없이(H6)
        props.onChange(res.bookmarked);
      } catch (e) {
        props.onNotice(toggleFailText(e));
      }
    });
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.saved, busy }}
      onPress={press}
      style={[styles.save, props.saved && styles.saveOn]}
      testID="save-button"
    >
      <Text style={[styles.saveText, props.saved && styles.saveTextOn]}>
        {props.saved ? SAVE_TEXT.saved : SAVE_TEXT.save}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 8 },
  heart: { fontSize: 22, color: C.text },
  heartOn: { color: C.fill1 },
  count: { fontSize: 15, fontWeight: "700", color: C.text },
  save: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: theme.radii.control,
    backgroundColor: C.fill1,
    alignItems: "center",
    justifyContent: "center",
  },
  saveOn: { backgroundColor: C.inkStrong },
  saveText: { fontSize: 15, fontWeight: "800", color: onFill(C.fill1) },
  saveTextOn: { color: onFill(C.inkStrong) },
});
