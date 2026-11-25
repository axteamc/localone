// CLUB-2-P4 알림함 화면 `/inbox` — contracts/book-club.md CLUB-2 K2-11·K2-O8~K2-O10·C3·C6·P4, 명세 결정 6·큰 틀 결정 4
// 머리 → (제한이 있으면) 내 참가 제한 → 최신순 한 줄 목록. 열면 새 안내에만 점을 그리고 곧바로 모두 읽음.
// 기기 알림 권한과 관계없이 동작한다(서버 푸시·기기 구독 없음, K2-11·K2-O9·K2-O10).
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { registerSignOutCleanup, useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { panel, theme, type as T } from "../../theme";
import { fetchInbox, fetchMyRestrictions, markAllRead, type InboxItem, type Restriction } from "./api";
import { RestrictionNotice } from "./RestrictionNotice";
import { SettingsIcon } from "../../theme/Icons";
import { NotificationSettings } from "../settings/NotificationSettings";

const C = theme.colors;
const KEEP_DAYS = 90; // K2-O8 보관 90일
const DAY = 24 * 60 * 60 * 1000;

export const INBOX_TEXT = {
  header: "알림함",
  settings: "알림 설정",
  empty: "아직 받은 안내가 없어요. 모임에 참가하면 일정 안내가 여기에 모여요.",
  loadFailed: "알림함을 불러오지 못했어요.",
  retry: "다시 해 보기",
  signedOut: "로그인하면 받은 안내를 볼 수 있어요",
  login: "로그인하기",
  newDot: "새 안내",
} as const;

/** "방금·n분 전·n시간 전·어제·n일 전·YYYY.MM.DD" (서울 기준 날짜) */
export function inboxWhen(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  const days = Math.floor(diff / DAY);
  if (days < 2) return "어제";
  if (days < 7) return `${days}일 전`;
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function withinDays(items: InboxItem[], days = KEEP_DAYS, now = Date.now()): InboxItem[] {
  return items.filter((i) => now - Date.parse(i.created_at) <= days * DAY);
}

type Load = { state: "loading" } | { state: "ok" } | { state: "error" };

export function InboxScreen() {
  const { status, userId } = useAuth();
  const account = status === "signedIn" ? userId : null;
  // 계정이 바뀌면 화면을 새로 만든다: 바뀐 그 순간부터 이전 계정의 목록·제한 안내·오류가 보이지 않는다(C6 계정 전환)
  return <InboxView key={account ?? "signed-out"} />;
}

function InboxView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, userId } = useAuth();
  const signedIn = status === "signedIn";
  const account = signedIn ? userId : null;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const freshIds = useRef<Set<string>>(new Set()); // 이번에 열었을 때 안 읽었던 안내(점)
  const runner = useMemo(() => createLatestRunner(), []);
  const loadingMore = useRef(false);
  const gen = useRef(0);

  const clear = useCallback(() => {
    gen.current += 1;
    freshIds.current = new Set();
    setItems([]);
    setRestrictions([]);
    setNextCursor(null);
  }, []);

  // 로그아웃하면 화면에 남은 안내를 비운다(C6 계정 전환)
  useEffect(() => registerSignOutCleanup(clear), [clear]);

  const reload = useCallback(async () => {
    gen.current += 1;
    const mine = gen.current; // 이 요청을 보낸 계정·화면. 바뀐 뒤 늦게 온 응답은 화면을 건드리지 않는다
    loadingMore.current = false;
    const res = await runner.run((signal) => fetchInbox(null, signal)); // #48
    if (res.status === "stale" || mine !== gen.current) return; // 계정이 바뀐 뒤 늦게 온 응답은 버린다
    if (res.status === "error") {
      setLoad({ state: "error" });
      return;
    }
    freshIds.current = new Set(res.value.items.filter((i) => !i.read).map((i) => i.id));
    setItems(withinDays(res.value.items)); // 90일 지난 줄 숨김
    setNextCursor(res.value.next_cursor);
    setLoad({ state: "ok" });
    void markAllRead().catch(() => {}); // #49 { all: true }, 실패해도 목록 유지
    fetchMyRestrictions()
      .then((r) => {
        if (mine === gen.current) setRestrictions(r); // 계정 전환·다시 읽기 뒤 늦게 온 제한은 버린다
      })
      .catch(() => {}); // 제한 안내는 못 받아도 알림함은 보인다(실패도 화면을 바꾸지 않는다)
  }, [runner, account]);

  useEffect(() => {
    clear();
    setLoad({ state: "loading" });
    if (signedIn) void reload(); // 로그인 안 했으면 부르지 않는다
    return () => {
      gen.current += 1; // 떠나거나 계정이 바뀌면 보내 둔 요청의 응답을 모두 버린다
      runner.cancel();
    };
  }, [reload, runner, signedIn, clear]);

  async function loadMore() {
    if (!nextCursor || loadingMore.current) return;
    loadingMore.current = true;
    const mine = gen.current;
    try {
      const page = await fetchInbox(nextCursor);
      if (mine !== gen.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...withinDays(page.items).filter((i) => !seen.has(i.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {
      /* 더 불러오기 실패는 그대로 두고 다시 내리면 다시 시도 */
    } finally {
      if (mine === gen.current) loadingMore.current = false;
    }
  }

  function open(item: InboxItem) {
    // 어떤 안내든 모임이면 모임 화면(큰 틀 결정 4), 게시물이면 게시물 화면
    if (item.target.club_id) router.push(`/clubs/${item.target.club_id}`);
    else if (item.target.post_id) router.push(`/posts/${item.target.post_id}`);
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // C-90: ‹는 글자(28/30)라 제목(17)과 기준선이 어긋났다 → 선 두 개로 그린 꺾쇠를 44×44 가운데에.
  // 오른쪽 위 설정 아이콘 → 머리 바로 아래로 내려오는 알림 설정 작은 창(설정 화면 "알림"과 같은 부품)
  const head = (
    <View style={styles.headWrap}>
      <View style={[styles.head, { paddingTop: 4 + insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} style={styles.iconBtn}>
          <View style={styles.chevron} />
        </Pressable>
        <Text style={styles.headTitle} numberOfLines={1}>
          {INBOX_TEXT.header}
        </Text>
        {signedIn ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={INBOX_TEXT.settings}
            accessibilityState={{ expanded: settingsOpen }}
            onPress={() => setSettingsOpen((v) => !v)}
            style={styles.iconBtn}
            testID="inbox-settings"
          >
            <SettingsIcon size={18} color={C.inkStrong} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
      {settingsOpen && signedIn ? (
        <View style={styles.dropdown} testID="inbox-settings-panel">
          <NotificationSettings />
        </View>
      ) : null}
    </View>
  );

  if (!signedIn || load.state !== "ok") {
    return (
      <View style={styles.root}>
        {head}
        <View style={styles.center}>
          {status === "loading" || (signedIn && load.state === "loading") ? <ActivityIndicator color={C.inkStrong} /> : null}
          {status === "signedOut" ? (
            <>
              <Text style={styles.body}>{INBOX_TEXT.signedOut}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/login", params: { returnTo: "/inbox" } })}
                style={styles.button}
              >
                <Text style={styles.buttonText}>{INBOX_TEXT.login}</Text>
              </Pressable>
            </>
          ) : null}
          {signedIn && load.state === "error" ? (
            <>
              <Text style={styles.body}>{INBOX_TEXT.loadFailed}</Text>
              <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.button}>
                <Text style={styles.buttonText}>{INBOX_TEXT.retry}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {head}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        testID="inbox-list"
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        ListHeaderComponent={restrictions.length > 0 ? <RestrictionNotice items={restrictions} /> : undefined}
        ListEmptyComponent={<Text style={styles.empty}>{INBOX_TEXT.empty}</Text>}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => {
          const fresh = freshIds.current.has(item.id);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fresh ? `${INBOX_TEXT.newDot} ${item.title}` : item.title}
              onPress={() => open(item)}
              testID={`inbox-item-${item.id}`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.dotSlot}>{fresh ? <View style={styles.dot} testID={`inbox-dot-${item.id}`} /> : null}</View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.when}>{inboxWhen(item.created_at)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 4,
    backgroundColor: panel.backgroundColor,
    borderBottomWidth: 1,
    borderColor: panel.borderColor,
  },
  headWrap: { zIndex: 2 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  // 꺾쇠: 위·왼쪽 테두리만 있는 사각형을 -45° 돌림(10×10, 굵기 2)
  chevron: {
    width: 11,
    height: 11,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: C.text,
    transform: [{ rotate: "-45deg" }],
    marginLeft: 4,
  },
  headTitle: { ...T.name, flex: 1 },
  // 시안 값: 폭 260, 곡률 9 — 머리 오른쪽 아래에 붙어 내려온다
  dropdown: {
    position: "absolute",
    top: "100%",
    right: 8,
    width: 280,
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    boxShadow: `0 4px 12px 0 ${C.shadowSoft}`,
    overflow: "hidden",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  body: { fontSize: 14, color: C.text, lineHeight: 20, textAlign: "center" },
  button: { borderWidth: 1, borderColor: C.seamHairline, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 14, color: C.text, fontWeight: "500" },
  content: { padding: 16, gap: 4 },
  empty: { fontSize: 14, color: C.textSub, lineHeight: 20, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.seamHairline },
  pressed: { opacity: 0.7 },
  dotSlot: { width: 10, paddingTop: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.fill1 },
  rowTitle: { fontSize: 15, color: C.text, lineHeight: 21 },
  when: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
});
