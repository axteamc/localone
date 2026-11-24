// 상세 상단 액션 바의 공감(♡ + 수)·저장 버튼 — contracts/local-feed.md LOCAL-2 H5·H6·H14, C6 H-#5·H-#6.
// 누르는 동안 한 번 더 눌러도 한 번만 보낸다. 로그인 안 했으면 서버에 묻지 않고 onLoginNeeded.
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import { setBookmark, setReaction } from "./api";
import { toggleFailText } from "./PostMenu";


export const SAVE_TEXT = { save: "저장", saved: "저장됨" } as const;

type Common = {
  postId: string;
  signedIn: boolean;
  /** 로그인 복원 중이면 누름을 무시한다(로그인한 사용자에게 로그인 안내가 뜨지 않게, 사후 검토 ①-5) */
  authLoading?: boolean;
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
  const { styles } = useLook(makeStyles);
  const { busy, run } = useOnce();
  const press = () => {
    if (props.authLoading) return;
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
      accessibilityState={{ selected: props.reacted, busy: busy || !!props.authLoading }}
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
  const { C, styles } = useLook(makeStyles);
  const { busy, run } = useOnce();
  const press = () => {
    if (props.authLoading) return;
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
      accessibilityLabel={props.saved ? SAVE_TEXT.saved : SAVE_TEXT.save}
      accessibilityState={{ selected: props.saved, busy: busy || !!props.authLoading }}
      onPress={press}
      style={styles.bookmark}
      testID="save-button"
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
          fill={props.saved ? C.inkStrong : "none"}
          stroke={C.inkStrong}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  return StyleSheet.create({
  action: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 8 },
  heart: { fontSize: 22, color: C.text },
  heartOn: { color: C.inkStrong },
  count: { fontSize: 15, fontWeight: "500", color: C.text },
  bookmark: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.infoCard,
    alignItems: "center",
    justifyContent: "center",
  },
  });
};
