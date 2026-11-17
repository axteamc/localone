// 방문 페이지 2열 메이슨리 피드(contracts/local-feed.md LOCAL-2 H1·H4·H10·H13).
// 페이지 넘기기(next_cursor)는 VisitScreen이 스크롤 끝에서 한다. 여기서는 그리기·카드 메뉴만.
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { onPostReaction, onPostWithdrawn, type FeedPost, type PostReactionPatch } from "./api";
import { cardHeightRatio, PostCard } from "./PostCard";
import { LoginPrompt, PostMenu } from "./PostMenu";

export const COLUMN_GAP = 12; // H13
const WITHDRAWN_TEXT = "내렸어요"; // LOCAL-1 ComposeScreen TEXT.withdrawn과 같은 문구

/** 짧은 쪽 열에 차례로 쌓는다(H13). 같은 입력이면 늘 같은 배치 */
export function splitColumns<T extends Pick<FeedPost, "image_kind" | "overlay_text">>(items: T[]): [T[], T[]] {
  const cols: [T[], T[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const i = heights[1]! < heights[0]! ? 1 : 0;
    cols[i].push(item);
    heights[i]! += cardHeightRatio(item);
  }
  return cols;
}

export type MasonryGridProps = {
  items: FeedPost[];
  onPress(postId: string): void;
  onMenu?(post: FeedPost): void;
  testID?: string;
};

/** 2열 메이슨리. 상세 아래 이어지는 묶음(P4)도 같이 쓴다 */
export function MasonryGrid({ items, onPress, onMenu, testID }: MasonryGridProps) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  const total = width ?? Math.max(0, window.width - 24); // 첫 그리기: 화면 폭 - 좌우 여백 12
  const cardWidth = Math.max(0, Math.floor((total - COLUMN_GAP) / 2));
  const [left, right] = useMemo(() => splitColumns(items), [items]);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };
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

export type LibraryFeedProps = {
  items: FeedPost[];
  onNotice(text: string): void;
};

export function LibraryFeed({ items, onNotice }: LibraryFeedProps) {
  const router = useRouter();
  const { status } = useAuth();
  // 메뉴·상세에서 바꾼 좋아요·북마크. 필드 단위로 최신 상태에 합친다(①-1: 늦은 응답이 다른 필드를 덮지 않게)
  const [changed, setChanged] = useState<Record<string, PostReactionPatch>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const shown = useMemo(
    () => items.filter((p) => !hidden.has(p.id)).map((p) => (changed[p.id] ? { ...p, ...changed[p.id] } : p)),
    [items, changed, hidden]
  );
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
  const menuPost = menuFor ? shown.find((p) => p.id === menuFor) ?? null : null;

  return (
    <View testID="library-feed">
      <MasonryGrid
        items={shown}
        onPress={(id) =>
          router.push({
            pathname: "/posts/[postId]",
            params: { postId: id, libraryId: String(shown.find((p) => p.id === id)?.library_id ?? "") },
          })
        }
        onMenu={(post) => setMenuFor(post.id)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  column: { gap: COLUMN_GAP },
});
