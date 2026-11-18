// 하단 "내 정보" 탭 화면 — contracts/my-collection.md MY-1 (Y1~Y8, Y-O1~Y-O5, C6).
// 위 프로필(내리면 사라짐) → 3탭 바(맨 위에 붙음) → B PostCard 2열 메이슨리. 카드 메뉴는 B PostMenu 그대로.
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { onFill, theme } from "../../theme";
import { COLUMN_GAP, splitColumns } from "../local-feed/LibraryFeed";
import { PostCard } from "../local-feed/PostCard";
import { PostMenu } from "../local-feed/PostMenu";
import type { MyCollectionPost } from "./api";
import { CollectionTabs } from "./CollectionTabs";
import { ProfileHeader } from "./ProfileHeader";
import { MY_TEXT, useMyCollection, type CollectionTab, type Dim, type TabState } from "./useMyCollection";

const C = theme.colors;
const SIDE = 12; // 좌우 여백(Y4)
const END_THRESHOLD = 200; // 끝에서 이만큼 남으면 다음 묶음
const DIM_OPACITY = 0.45; // Y-O4 기본값(Claude)

export function MyCollectionScreen() {
  const router = useRouter();
  const my = useMyCollection();
  const atEnd = useRef(false);

  if (my.status === "loading") {
    // 로그인 복원 중: 아무것도 부르지 않고 빈 모양만
    return (
      <View style={styles.screen}>
        <ProfileHeader state={{ kind: "loading" }} onEdit={() => undefined} onRetry={() => undefined} onSettings={() => undefined} />
        <CardSkeleton />
      </View>
    );
  }

  if (!my.signedIn) {
    return (
      <View style={[styles.screen, styles.center]} testID="my-collection-signed-out">
        <Text style={styles.loginTitle}>{MY_TEXT.loginTitle}</Text>
        <Text style={styles.loginSub}>{MY_TEXT.loginSub}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={styles.fillButton}>
          <Text style={styles.fillButtonText}>{MY_TEXT.login}</Text>
        </Pressable>
      </View>
    );
  }

  const onEndReached = () => {
    const st = my.tabState;
    if (st?.kind === "ready" && st.nextCursor !== null && st.more !== "loading") my.loadMore();
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const now = layoutMeasurement.height + contentOffset.y >= contentSize.height - END_THRESHOLD;
    if (now && !atEnd.current) onEndReached(); // 끝에 닿는 순간 한 번
    atEnd.current = now;
  };
  // 맨 아래에서 한 번 더 끌어내리면 실패한 다음 묶음을 다시 부른다(예외 #1)
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - END_THRESHOLD && my.tabState?.kind === "ready" && my.tabState.more === "error") {
      onEndReached();
    }
  };

  const dimmedId = my.dim?.tab === my.activeTab ? my.dim.postId : null;

  return (
    <View style={styles.screen} testID="my-collection">
      <ScrollView
        testID="my-collection-scroll"
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl testID="my-collection-refresh" refreshing={my.refreshing} onRefresh={() => void my.refresh()} />
        }
        contentContainerStyle={styles.content}
      >
        <ProfileHeader
          state={my.profile}
          onEdit={() => my.showNotice(MY_TEXT.editSoon)}
          onRetry={my.retryProfile}
          // ⚙ → 설정·로그아웃(auth.md AUTH-2 G6). 이 머리는 로그인했을 때만 보인다
          onSettings={() => router.push("/settings")}
        />
        <CollectionTabs active={my.activeTab} onSelect={my.selectTab} />
        <TabBody
          tab={my.activeTab}
          state={my.tabState}
          dimmedId={dimmedId}
          onPress={(postId) => router.push({ pathname: "/posts/[postId]", params: { postId } })}
          onMenu={(post) => my.openMenu(post.id)}
          onRetry={my.retryTab}
          onRetryMore={my.loadMore}
          onBrowse={() => router.navigate("/")}
        />
      </ScrollView>
      {my.notice ? (
        <View style={styles.notice} accessibilityRole="alert" testID="my-notice">
          <Text style={styles.noticeText}>{my.notice.text}</Text>
          {my.notice.undo ? (
            <Pressable accessibilityRole="button" onPress={my.undo} style={styles.undo}>
              <Text style={styles.undoText}>{MY_TEXT.undo}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {my.menuPost ? (
        <PostMenu
          post={my.menuPost}
          signedIn
          onClose={my.closeMenu}
          onChange={my.onMenuChange}
          onNotice={my.onMenuNotice}
          onLoginNeeded={() => undefined}
          failText={my.failText}
        />
      ) : null}
    </View>
  );
}

type TabBodyProps = {
  tab: CollectionTab;
  state: TabState | undefined;
  dimmedId: Dim["postId"] | null;
  onPress(postId: string): void;
  onMenu(post: MyCollectionPost): void;
  onRetry(): void;
  onRetryMore(): void;
  onBrowse(): void;
};

function TabBody({ tab, state, dimmedId, onPress, onMenu, onRetry, onRetryMore, onBrowse }: TabBodyProps) {
  if (!state || state.kind === "loading") return <CardSkeleton />;
  if (state.kind === "error") {
    return (
      <View style={styles.message} testID="list-error">
        <Text style={styles.messageText}>{MY_TEXT.listFailed}</Text>
        <ReloadButton onPress={onRetry} />
      </View>
    );
  }
  if (state.items.length === 0) {
    const empty = MY_TEXT.empty[tab];
    return (
      <View style={styles.empty} testID={`empty-${tab}`}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>{empty.icon}</Text>
        </View>
        <Text style={styles.emptyTitle}>{empty.title}</Text>
        <Text style={styles.emptySub}>{empty.sub}</Text>
        <Pressable accessibilityRole="button" onPress={onBrowse} style={styles.fillButton}>
          <Text style={styles.fillButtonText}>{MY_TEXT.browse}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View>
      <Grid items={state.items} dimmedId={dimmedId} onPress={onPress} onMenu={onMenu} />
      <View style={styles.footer} testID="list-footer">
        {state.more === "loading" ? (
          <Text style={styles.footerText}>{MY_TEXT.moreLoading}</Text>
        ) : state.more === "error" ? (
          <>
            <Text style={styles.footerText}>{MY_TEXT.moreFailed}</Text>
            <ReloadButton onPress={onRetryMore} />
          </>
        ) : state.nextCursor === null ? (
          <Text style={styles.footerText}>{MY_TEXT.end}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Grid(props: {
  items: MyCollectionPost[];
  dimmedId: string | null;
  onPress(postId: string): void;
  onMenu(post: MyCollectionPost): void;
}) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  const total = width ?? Math.max(0, window.width - SIDE * 2);
  const cardWidth = Math.max(0, Math.floor((total - COLUMN_GAP) / 2));
  const [left, right] = splitColumns(props.items);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };
  return (
    <View style={styles.grid} onLayout={onLayout} testID="my-grid">
      {[left, right].map((col, i) => (
        <View key={i} style={[styles.column, { width: cardWidth }]}>
          {col.map((post) => {
            const dimmed = post.id === props.dimmedId;
            return (
              <View key={post.id} style={dimmed ? styles.dimmed : undefined} testID={dimmed ? `dimmed-${post.id}` : undefined}>
                <PostCard
                  post={post}
                  width={cardWidth}
                  onPress={props.onPress}
                  // 흐린 카드는 메뉴를 다시 열지 않는다(되돌리기는 아래 안내에서)
                  onMenu={dimmed ? undefined : (p) => props.onMenu(p as MyCollectionPost)}
                />
                {dimmed ? (
                  <View style={styles.dimTag} pointerEvents="none">
                    <Text style={styles.dimTagText}>{MY_TEXT.dimmed}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function CardSkeleton() {
  return (
    <View style={styles.grid} testID="card-skeleton">
      {[0, 1].map((col) => (
        <View key={col} style={[styles.column, styles.skeletonColumn]}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.skeletonCard, { height: (col + i) % 2 ? 150 : 200 }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ReloadButton({ onPress }: { onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.reload}>
      <Text style={styles.reloadText}>{MY_TEXT.reload}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  content: { paddingBottom: 80 },
  loginTitle: { fontSize: 17, fontWeight: "500", color: C.text, textAlign: "center" },
  loginSub: { fontSize: 14, color: C.textSub, textAlign: "center", marginBottom: 8 },
  fillButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radii.control,
    backgroundColor: C.inkStrong,
  },
  fillButtonText: { fontSize: 15, fontWeight: "500", color: onFill(C.inkStrong) },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: SIDE,
    paddingTop: SIDE,
  },
  column: { gap: COLUMN_GAP },
  skeletonColumn: { flex: 1, marginHorizontal: COLUMN_GAP / 4 },
  skeletonCard: { backgroundColor: C.surface2, borderRadius: theme.radii.card },
  dimmed: { opacity: DIM_OPACITY },
  dimTag: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: theme.radii.pill,
    backgroundColor: C.inkStrong,
  },
  dimTagText: { fontSize: 12, fontWeight: "500", color: onFill(C.inkStrong) },
  message: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  messageText: { fontSize: 14, color: C.textSub, textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 6 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyIconText: { fontSize: 24, color: C.text },
  emptyTitle: { fontSize: 15, fontWeight: "500", color: C.text, textAlign: "center" },
  emptySub: { fontSize: 13, color: C.textSub, textAlign: "center" },
  footer: { alignItems: "center", gap: 8, paddingVertical: 20 },
  footerText: { fontSize: 13, color: C.textSub },
  reload: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.divider,
    borderRadius: theme.radii.control,
  },
  reloadText: { fontSize: 13, color: C.text },
  notice: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radii.control,
    backgroundColor: C.inkStrong,
  },
  noticeText: { flex: 1, fontSize: 14, color: onFill(C.inkStrong) },
  undo: { paddingVertical: 4, paddingHorizontal: 4, minHeight: 32, justifyContent: "center" },
  undoText: { fontSize: 14, fontWeight: "500", color: onFill(C.inkStrong) },
});
