// 방문 페이지 2열 메이슨리 피드(contracts/local-feed.md LOCAL-2 H1·H4·H10·H13).
// VISIT-3-P3부터 #32 혼합 피드(게시물 + 방명록, FeedItem)를 그린다(V3-8). 불러오기·다음 쪽은 VisitScreen이 하고
// 여기서는 받은 목록 그리기·카드 메뉴(게시물 메뉴 / 내 방명록 지우기)만 한다.
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import {
  ApiCallError,
  feedItemKey,
  isGuestbookItem,
  isPostItem,
  onPostReaction,
  onPostWithdrawn,
  withdrawGuestbook,
  type FeedItem,
  type FeedPost,
  type GuestbookItem,
  type PostReactionPatch,
} from "./api";
import { FeedItemCard } from "./FeedItemCard";
import { GUESTBOOK_CARD_TEXT, GuestbookMenu, guestbookHeightRatio } from "./GuestbookCard";
import { cardHeightRatio, PostCard } from "./PostCard";
import { LoginPrompt, PostMenu } from "./PostMenu";

export const COLUMN_GAP = 12; // H13
const WITHDRAWN_TEXT = "내렸어요"; // LOCAL-1 ComposeScreen TEXT.withdrawn과 같은 문구

/** 짧은 쪽 열에 차례로 쌓는다(H13). 같은 입력이면 늘 같은 배치 */
export function splitColumns<T extends Pick<FeedPost, "image_kind" | "overlay_text">>(items: T[]): [T[], T[]] {
  return splitColumnsBy(items, cardHeightRatio);
}

function splitColumnsBy<T>(items: T[], ratio: (item: T) => number): [T[], T[]] {
  const cols: [T[], T[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const i = heights[1]! < heights[0]! ? 1 : 0;
    cols[i].push(item);
    heights[i]! += ratio(item);
  }
  return cols;
}

/** 혼합 피드 카드 높이 어림(너비 대비) */
export function feedItemHeightRatio(item: FeedItem): number {
  if (isPostItem(item)) return cardHeightRatio(item.post);
  if (isGuestbookItem(item)) return guestbookHeightRatio(item.guestbook);
  if (item.kind === "club") return 1.15;
  return 0;
}

function useCardWidth() {
  const window = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  const total = width ?? Math.max(0, window.width - 24); // 첫 그리기: 화면 폭 - 좌우 여백 12
  const cardWidth = Math.max(0, Math.floor((total - COLUMN_GAP) / 2));
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };
  return { cardWidth, onLayout };
}

export type MasonryGridProps = {
  items: FeedPost[];
  onPress(postId: string): void;
  onMenu?(post: FeedPost): void;
  testID?: string;
};

/** 2열 메이슨리. 상세 아래 이어지는 묶음(P4)도 같이 쓴다 */
export function MasonryGrid({ items, onPress, onMenu, testID }: MasonryGridProps) {
  const { cardWidth, onLayout } = useCardWidth();
  const [left, right] = useMemo(() => splitColumns(items), [items]);
  return (
    <View style={styles.grid} onLayout={onLayout} testID={testID}>
      {[left, right].map((col, i) => (
        <View key={i} style={[styles.column, { width: cardWidth }]}>
          {col.map((post) => (
            <PostCard key={post.id} post={post} width={cardWidth} onPress={onPress} onMenu={onMenu} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** 혼합 피드 2열 메이슨리(V3-O4: 방명록도 게시물과 같은 한 칸) */
function FeedItemGrid({
  items,
  onOpenPost,
  onMenu,
}: {
  items: FeedItem[];
  onOpenPost(postId: string): void;
  onMenu(item: FeedItem): void;
}) {
  const { cardWidth, onLayout } = useCardWidth();
  const [left, right] = useMemo(() => splitColumnsBy(items, feedItemHeightRatio), [items]);
  return (
    <View style={styles.grid} onLayout={onLayout}>
      {[left, right].map((col, i) => (
        <View key={i} style={[styles.column, { width: cardWidth }]}>
          {col.map((item) => (
            <FeedItemCard
              key={feedItemKey(item)}
              item={item}
              width={cardWidth}
              onOpenPost={onOpenPost}
              onMenu={onMenu}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export type LibraryFeedProps = {
  items: FeedItem[];
  onNotice(text: string): void;
  /** 이미 사라진 방명록을 지우려 했을 때 첫 묶음을 다시 받는다(C6 타인·없는 글) */
  onReload?(): void;
};

export function LibraryFeed({ items, onNotice, onReload }: LibraryFeedProps) {
  const router = useRouter();
  const { status } = useAuth();
  // 메뉴·상세에서 바꾼 좋아요·북마크. 필드 단위로 최신 상태에 합친다(①-1: 늦은 응답이 다른 필드를 덮지 않게)
  const [changed, setChanged] = useState<Record<string, PostReactionPatch>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set()); // 게시물 id(상세에서 내림)
  const [gone, setGone] = useState<Set<string>>(() => new Set()); // 지운 방명록 id
  const [gbMenu, setGbMenu] = useState<GuestbookItem | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const withdrawingRef = useRef(false);
  const shown = useMemo(
    () =>
      items.flatMap((item): FeedItem[] => {
        if (isPostItem(item)) {
          const p = item.post;
          if (hidden.has(p.id)) return [];
          return [changed[p.id] ? { kind: "post", post: { ...p, ...changed[p.id] } } : item];
        }
        if (isGuestbookItem(item)) return gone.has(item.guestbook.id) ? [] : [item];
        return []; // 모르는 종류는 그리지 않는다
      }),
    [items, changed, hidden, gone]
  );
  const posts = useMemo(() => shown.flatMap((i) => (isPostItem(i) ? [i.post] : [])), [shown]);
  const patch = useCallback(
    (id: string, next: PostReactionPatch) => setChanged((m) => ({ ...m, [id]: { ...m[id], ...next } })),
    []
  );

  // 상세에서 바꾼 공감·북마크를 돌아왔을 때 메뉴에 그대로 보인다(①-2)
  useEffect(() => onPostReaction(patch), [patch]);
  // 로그인 상태가 바뀌면 앞 사용자의 변경을 남기지 않는다
  useEffect(() => setChanged({}), [status]);

  // 상세에서 내린 글은 돌아왔을 때 바로 감추고 "내렸어요"(LOCAL-1 F16)
  useEffect(
    () =>
      onPostWithdrawn((id) => {
        setHidden((h) => new Set(h).add(id));
        onNotice(WITHDRAWN_TEXT);
      }),
    [onNotice]
  );
  const menuPost = menuFor ? posts.find((p) => p.id === menuFor) ?? null : null;

  // 내 방명록 지우기(V3-O6): 확인 뒤 한 번만. 실패하면 카드 그대로 + 한 줄 안내
  const withdraw = async (entry: GuestbookItem) => {
    if (withdrawingRef.current) return; // 연타: 한 번만 지운다(예외 #3)
    withdrawingRef.current = true;
    setWithdrawing(true);
    try {
      await withdrawGuestbook(entry.id);
      setGone((g) => new Set(g).add(entry.id));
      setGbMenu(null);
      onNotice(GUESTBOOK_CARD_TEXT.withdrawn);
    } catch (e) {
      setGbMenu(null);
      onNotice(GUESTBOOK_CARD_TEXT.withdrawFailed);
      if (e instanceof ApiCallError && e.status === 404) onReload?.(); // 이미 사라진 글: 첫 묶음 다시 받기
    } finally {
      withdrawingRef.current = false;
      setWithdrawing(false);
    }
  };

  return (
    <View testID="library-feed">
      <FeedItemGrid
        items={shown}
        onOpenPost={(id) =>
          router.push({
            pathname: "/posts/[postId]",
            params: { postId: id, libraryId: String(posts.find((p) => p.id === id)?.library_id ?? "") },
          })
        }
        onMenu={(item) => {
          if (isPostItem(item)) setMenuFor(item.post.id);
          else if (isGuestbookItem(item) && item.guestbook.mine) setGbMenu(item.guestbook);
        }}
      />
      {menuPost ? (
        <PostMenu
          post={menuPost}
          signedIn={status === "signedIn"}
          authLoading={status === "loading"}
          onClose={() => setMenuFor(null)}
          onChange={patch}
          onNotice={onNotice}
          onLoginNeeded={() => setLogin(true)}
        />
      ) : null}
      {login ? <LoginPrompt onClose={() => setLogin(false)} /> : null}
      {gbMenu ? (
        <GuestbookMenu
          entry={gbMenu}
          busy={withdrawing}
          onClose={() => setGbMenu(null)}
          onWithdraw={(entry) => void withdraw(entry)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  column: { gap: COLUMN_GAP },
});
