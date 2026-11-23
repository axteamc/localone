// 알림함 종 — contracts/my-collection.md MY-2 Y2-7·Y2-O5·Y2-O6, C6 예외 #7, C7.
// 읽지 않음은 계정마다 하나의 공유 상태다. 종이 여러 개(내 정보 머리, 추후 홈 머리 띠)여도 같은 #47 값을 본다.
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, theme } from "../../theme";
import { fetchInboxUnread } from "./api";

const C = theme.colors;
const ACT = actionColors(C);

export const INBOX_TEXT = { bell: "알림함" } as const;

/**
 * `/inbox` 화면(C CLUB-2-P4)이 연결됐는지. 연결 전에는 종을 그리지 않는다(C7: 빈 화면을 만들지 않음).
 * TODO(연결): C CLUB-2-P4 — `/inbox`가 머지되면 true로 바꾼다. 홈 머리 띠 종도 그때 D가 연결한다(Y2-O6).
 */
export const inboxLink = { ready: false };

// ─────────── 계정별 공유 상태 ───────────

type UnreadState = { owner: string | null; hasUnread: boolean };
let unread: UnreadState = { owner: null, hasUnread: false };
const listeners = new Set<(s: UnreadState) => void>();
const runner = createLatestRunner();

function setUnread(next: UnreadState) {
  if (next.owner === unread.owner && next.hasUnread === unread.hasUnread) return;
  unread = next;
  for (const l of [...listeners]) l(unread);
}

/** 계정이 바뀌면(로그아웃 포함) 진행 중 조회를 버리고 앞 계정의 점을 지운다 */
function useOwner(owner: string | null) {
  if (unread.owner !== owner) {
    runner.cancel();
    unread = { owner, hasUnread: false }; // 렌더 중에는 알리지 않는다. 구독자는 각자 owner로 거른다
  }
}

async function refreshUnread(owner: string) {
  const r = await runner.run((signal) => fetchInboxUnread(signal));
  if (r.status === "stale" || unread.owner !== owner) return; // 앞 계정 응답은 버린다
  // 실패·끊김이면 점 없이(예외 #7, 안내 없음). 앞에 켜진 점도 지운다
  setUnread({ owner, hasUnread: r.status === "ok" && r.value.has_unread === true });
}

/** 지금 계정의 읽지 않음. 화면이 보일 때마다(알림함에서 돌아올 때 포함) 다시 묻는다. 비로그인은 #47을 부르지 않는다 */
export function useInboxUnread(): boolean {
  const { status, userId } = useAuth();
  const owner = status === "signedIn" && userId ? userId : null;
  useOwner(owner);
  const [snap, setSnap] = useState<UnreadState>(unread);
  useEffect(() => {
    listeners.add(setSnap);
    setSnap(unread);
    return () => {
      listeners.delete(setSnap);
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (owner) void refreshUnread(owner);
    }, [owner])
  );
  return snap.owner === owner && owner !== null && snap.hasUnread;
}

/** 시험용: 공유 상태를 처음으로 */
export function resetInboxUnreadForTest() {
  runner.cancel();
  unread = { owner: null, hasUnread: false };
  listeners.clear();
}

// ─────────── 종 ───────────

function BellIcon({ size = 17, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function Bell() {
  const router = useRouter();
  const hasUnread = useInboxUnread();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={INBOX_TEXT.bell}
      onPress={() => router.push("/inbox" as never)}
      style={({ pressed }) => [styles.bell, pressed && ACT.secondaryPressed]}
      testID="inbox-bell"
    >
      <BellIcon color={C.inkStrong} />
      {hasUnread ? <View style={styles.dot} testID="inbox-dot" /> : null}
    </Pressable>
  );
}

export function InboxBell(): React.JSX.Element {
  return inboxLink.ready ? <Bell /> : <></>;
}

const styles = StyleSheet.create({
  bell: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  // 숫자 없는 점 하나(Y2-7). 원 모양만 50%(ProfileHeader 아바타와 같은 예외)
  dot: { position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: "50%", backgroundColor: C.fill1 },
});
