// 남의 공개 프로필 `/users/[profileId]` — contracts/my-collection.md MY-4 M4-3·M4-4·M4-7~M4-12 (C-97).
// 시안 작성자_프로필_시안.html 2-B(가운데 큰 사진 + 개수) · 3-A(밑줄 탭 2개: 게시물 / 독서 기록).
// 머리 ‹ PROFILE ⋯(프로필 공유·사용자 신고). 한 게시물은 출처(origin)에 따라 한 탭에만 나온다(M4-5).
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, cardSurface, theme, type as typeScale } from "../../theme";
import { UserIcon } from "../../theme/Icons";
import { ScreenHeader } from "../../theme/ScreenHeader";
import type { FeedPost } from "../local-feed/api";
import { COLUMN_GAP } from "../local-feed/LibraryFeed";
import { cardHeightRatio, PostCard } from "../local-feed/PostCard";
import { REPORT_TEXT, ReportSheet } from "../local-feed/ReportSheet";
import { shareNotice, shareProfile } from "../local-feed/share";
import { ApiCallError, fetchUserPosts, fetchUserProfile, firstTab, type PostOrigin, type UserProfile } from "./api";

const C = theme.colors;
const ACT = actionColors(C);
const SIDE = 12;
const AVATAR = 72;
const END_THRESHOLD = 400;
const NOTICE_MS = 2000;

export const PROFILE_TEXT = {
  label: "PROFILE",
  menu: "프로필 메뉴",
  share: "프로필 공유",
  report: "사용자 신고",
  tabs: { post: "게시물", reading_log: "독서 기록" } as Record<PostOrigin, string>,
  emptyPost: "아직 올린 게시물이 없어요",
  emptyLog: "아직 공개한 독서 기록이 없어요",
  notFound: "찾을 수 없는 사용자예요",
  failed: "불러오지 못했어요",
  retry: "↻ 다시 시도",
} as const;

type ProfileState = { kind: "loading" } | { kind: "ok"; profile: UserProfile } | { kind: "notFound" } | { kind: "error" };
type TabState =
  | { kind: "loading" }
  | { kind: "ready"; items: FeedPost[]; nextCursor: string | null; more: "idle" | "loading" | "error" }
  | { kind: "error" };

export function UserProfileScreen({ profileId }: { profileId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, userId } = useAuth();
  const [profile, setProfile] = useState<ProfileState>({ kind: "loading" });
  const [tab, setTab] = useState<PostOrigin>("post");
  const [tabs, setTabs] = useState<Partial<Record<PostOrigin, TabState>>>({});
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const profileRunner = useRef(createLatestRunner()).current;
  const tabRunner = useRef(createLatestRunner()).current;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atEnd = useRef(false);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const loadTab = useCallback(
    async (origin: PostOrigin) => {
      setTabs((cur) => ({ ...cur, [origin]: { kind: "loading" } }));
      const res = await tabRunner.run((signal) => fetchUserPosts(profileId, origin, null, signal));
      if (res.status === "stale") return; // 예외 #6: 탭을 빨리 오가면 마지막 것만
      setTabs((cur) => ({
        ...cur,
        [origin]:
          res.status === "ok"
            ? { kind: "ready", items: res.value.items, nextCursor: res.value.next_cursor, more: "idle" }
            : { kind: "error" },
      }));
    },
    [profileId, tabRunner]
  );

  const loadProfile = useCallback(async () => {
    tabRunner.cancel();
    atEnd.current = false;
    setProfile({ kind: "loading" });
    setTabs({});
    const res = await profileRunner.run((signal) => fetchUserProfile(profileId, signal));
    if (res.status === "stale") return;
    if (res.status === "error") {
      const e = res.error;
      setProfile({ kind: e instanceof ApiCallError && e.status === 404 ? "notFound" : "error" });
      return;
    }
    if (res.value.is_me) {
      router.replace("/me"); // M4-11
      return;
    }
    const first = firstTab(res.value); // M4-4
    setProfile({ kind: "ok", profile: res.value });
    setTab(first);
    void loadTab(first);
  }, [profileId, profileRunner, router, loadTab, tabRunner]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, status, userId]);

  useEffect(
    () => () => {
      profileRunner.cancel();
      tabRunner.cancel();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [profileRunner, tabRunner]
  );

  const selectTab = (origin: PostOrigin) => {
    if (origin === tab) return;
    atEnd.current = false;
    const previous = tabs[tab];
    if (previous?.kind === "ready" && previous.more === "loading") {
      setTabs((cur) => ({ ...cur, [tab]: { ...previous, more: "idle" } }));
    }
    setTab(origin);
    if (tabs[origin]?.kind === "ready") tabRunner.cancel();
    else void loadTab(origin);
  };

  const loadMore = async () => {
    const st = tabs[tab];
    if (st?.kind !== "ready" || st.nextCursor === null || st.more === "loading") return;
    const origin = tab;
    setTabs((cur) => ({ ...cur, [origin]: { ...st, more: "loading" } }));
    const res = await tabRunner.run((signal) => fetchUserPosts(profileId, origin, st.nextCursor, signal));
    if (res.status === "stale") return;
    setTabs((cur) => {
      const now = cur[origin];
      if (now?.kind !== "ready") return cur;
      return {
        ...cur,
        [origin]:
          res.status === "ok"
            ? { kind: "ready", items: [...now.items, ...res.value.items], nextCursor: res.value.next_cursor, more: "idle" }
            : { ...now, more: "error" },
      };
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const now = layoutMeasurement.height + contentOffset.y >= contentSize.height - END_THRESHOLD;
    if (now && !atEnd.current) void loadMore();
    atEnd.current = now;
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const share = async () => {
    setMenu(false);
    const text = shareNotice(await shareProfile(profileId));
    if (text) showNotice(text);
  };

  const ok = profile.kind === "ok" ? profile.profile : null;
  const headerRight = ok ? (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PROFILE_TEXT.menu}
        onPress={() => setMenu((v) => !v)}
        style={styles.dots}
        testID="profile-menu"
      >
        <Text style={styles.dotsText}>⋯</Text>
      </Pressable>
      {menu ? (
        <View style={styles.menu}>
          <Pressable accessibilityRole="button" onPress={() => void share()} style={styles.menuItem}>
            <Text style={styles.menuText}>{PROFILE_TEXT.share}</Text>
          </Pressable>
          {status !== "loading" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenu(false);
                setReporting(true);
              }}
              style={styles.menuItem}
            >
              <Text style={styles.menuText}>{PROFILE_TEXT.report}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : undefined;

  return (
    <View style={styles.screen} testID="user-profile">
      <ScreenHeader
        label={PROFILE_TEXT.label}
        title={ok?.nickname}
        onBack={goBack}
        right={headerRight}
        topInset={insets.top}
        style={styles.header}
      />
      {profile.kind === "loading" ? (
        <View style={styles.center} testID="profile-loading">
          <View style={[styles.avatar, styles.skeleton]} />
        </View>
      ) : profile.kind === "notFound" ? (
        <View style={styles.center}>
          <Text style={styles.message}>{PROFILE_TEXT.notFound}</Text>
        </View>
      ) : profile.kind === "error" ? (
        <View style={styles.center}>
          <Text style={styles.message}>{PROFILE_TEXT.failed}</Text>
          <ReloadButton onPress={() => void loadProfile()} />
        </View>
      ) : (
        <ScrollView
          testID="user-profile-scroll"
          stickyHeaderIndices={[1]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.content}
        >
          <ProfileTop profile={profile.profile} onSelect={selectTab} />
          <OriginTabs active={tab} onSelect={selectTab} />
          <TabBody origin={tab} state={tabs[tab]} onRetry={() => void loadTab(tab)} onRetryMore={() => void loadMore()}
            onOpen={(postId) => router.push({ pathname: "/posts/[postId]", params: { postId } })} />
        </ScrollView>
      )}
      {notice ? (
        <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite" testID="profile-notice">
          <Text style={styles.toastText}>{notice}</Text>
        </View>
      ) : null}
      {reporting ? (
        <ReportSheet
          target={{ kind: "user", id: profileId }}
          onClose={() => setReporting(false)}
          onDone={() => {
            setReporting(false);
            showNotice(REPORT_TEXT.done);
          }}
        />
      ) : null}
    </View>
  );
}

function ProfileTop({ profile, onSelect }: { profile: UserProfile; onSelect(origin: PostOrigin): void }) {
  return (
    <View style={styles.top} testID="profile-top">
      {profile.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} accessibilityLabel="프로필 사진" />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]} accessibilityLabel="기본 프로필 사진">
          <UserIcon size={30} color={C.inkSoft} />
        </View>
      )}
      <Text style={styles.nickname} numberOfLines={1}>{profile.nickname}</Text>
      {profile.bio ? <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text> : null}
      <View style={styles.counts}>
        <Pressable accessibilityRole="button" onPress={() => onSelect("post")} testID="count-post">
          <Text style={styles.countText}><Text style={styles.countNum}>{profile.post_count}</Text> {PROFILE_TEXT.tabs.post}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onSelect("reading_log")} testID="count-reading_log">
          <Text style={styles.countText}><Text style={styles.countNum}>{profile.reading_log_count}</Text> {PROFILE_TEXT.tabs.reading_log}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OriginTabs({ active, onSelect }: { active: PostOrigin; onSelect(origin: PostOrigin): void }) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist" testID="origin-tabs">
      {(["post", "reading_log"] as const).map((origin) => {
        const on = origin === active;
        return (
          <Pressable
            key={origin}
            testID={`tab-${origin}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(origin)}
            style={styles.tab}
          >
            <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>{PROFILE_TEXT.tabs[origin]}</Text>
            <View style={[styles.underline, on && styles.underlineOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function TabBody(props: {
  origin: PostOrigin;
  state: TabState | undefined;
  onOpen(postId: string): void;
  onRetry(): void;
  onRetryMore(): void;
}) {
  const { state } = props;
  if (!state || state.kind === "loading") return <View style={styles.messageBox} testID="tab-loading" />;
  if (state.kind === "error") {
    return (
      <View style={styles.messageBox}>
        <Text style={styles.message}>{PROFILE_TEXT.failed}</Text>
        <ReloadButton onPress={props.onRetry} />
      </View>
    );
  }
  if (state.items.length === 0) {
    return (
      <View style={styles.messageBox} testID="tab-empty">
        <Text style={styles.message}>{props.origin === "post" ? PROFILE_TEXT.emptyPost : PROFILE_TEXT.emptyLog}</Text>
      </View>
    );
  }
  return (
    <>
      <Grid items={state.items} onOpen={props.onOpen} />
      {state.more === "error" ? (
        <View style={styles.messageBox}>
          <ReloadButton onPress={props.onRetryMore} />
        </View>
      ) : null}
    </>
  );
}

function Grid({ items, onOpen }: { items: FeedPost[]; onOpen(postId: string): void }) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  const total = width ?? Math.max(0, window.width - SIDE * 2);
  const cardWidth = Math.max(0, Math.floor((total - COLUMN_GAP) / 2));
  const columns: [FeedPost[], FeedPost[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const column = heights[1]! < heights[0]! ? 1 : 0;
    columns[column].push(item);
    heights[column]! += cardHeightRatio(item);
  }
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - SIDE * 2;
    if (w > 0 && w !== width) setWidth(w);
  };
  return (
    <View style={styles.grid} onLayout={onLayout} testID="profile-grid">
      {columns.map((col, i) => (
        <View key={i} style={[styles.column, { width: cardWidth }]}>
          {col.map((item) => (
            <PostCard key={item.id} post={item} width={cardWidth} onPress={onOpen} showLibraryName />
          ))}
        </View>
      ))}
    </View>
  );
}

function ReloadButton({ onPress }: { onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.reload, pressed && ACT.secondaryPressed]}>
      <Text style={styles.reloadText} numberOfLines={1}>{PROFILE_TEXT.retry}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.panelFrosted },
  header: { zIndex: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  content: { paddingBottom: 80 },
  top: { alignItems: "center", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 14, gap: 6 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: "50%" }, // 원 모양만 50%(ProfileHeader와 같은 예외)
  avatarEmpty: {
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    alignItems: "center",
    justifyContent: "center",
  },
  skeleton: { backgroundColor: C.surface2 },
  nickname: { ...typeScale.title, marginTop: 4 },
  bio: { fontSize: 13, color: C.textSub, textAlign: "center" },
  counts: { flexDirection: "row", gap: 16, marginTop: 4 },
  countText: { fontSize: 13, color: C.textSub, paddingVertical: 6 },
  countNum: { fontSize: 14, fontWeight: "700", color: C.text },
  tabBar: { flexDirection: "row", backgroundColor: C.panelFrosted, borderBottomWidth: 1, borderColor: C.seamHairline },
  tab: { flex: 1, alignItems: "center", paddingTop: 10, minHeight: 44 },
  tabLabel: { fontSize: 14, color: C.textSub, paddingBottom: 8 },
  tabLabelOn: { color: C.text, fontWeight: "700" },
  underline: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  underlineOn: { backgroundColor: C.inkStrong },
  grid: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: SIDE, paddingTop: SIDE },
  column: { gap: COLUMN_GAP },
  messageBox: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  message: { fontSize: 14, color: C.textSub, textAlign: "center" },
  reload: { paddingVertical: 6, paddingHorizontal: 12, ...ACT.secondary, borderRadius: theme.radii.control },
  reloadText: { fontSize: 13, fontWeight: "500", ...ACT.secondaryText },
  dots: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  dotsText: { fontSize: 20, fontWeight: "500", color: C.text },
  menu: { ...cardSurface(theme, { onPanel: true }), position: "absolute", top: 44, right: 0, paddingVertical: 4, minWidth: 132 },
  menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  menuText: { fontSize: 14, color: C.text, fontWeight: "500" },
  toast: { ...cardSurface(theme, { onPanel: true }), position: "absolute", bottom: 32, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10 },
  toastText: { fontSize: 14, fontWeight: "500", color: C.inkStrong },
});
