// 상세 아래 이어지는 글 두 묶음 — contracts/local-feed.md LOCAL-2 H7·H15.
// ① "같은 책의 다른 글"(#28, 다른 도서관 포함, 없으면 묶음 전체 숨김) ② "이 도서관의 다른 글"(#26, 지금 글 제외).
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { theme, type as T } from "../../theme";
import { fetchBookPosts, fetchLibraryPosts, type FeedPost } from "./api";
import { MasonryGrid } from "./LibraryFeed";

const C = theme.colors;

export const RELATED_TEXT = {
  sameBook: "같은 책의 다른 글",
  library: "이 도서관의 다른 글",
} as const;

function useRelated(key: string | null, load: (signal: AbortSignal) => Promise<FeedPost[]>): FeedPost[] {
  const [items, setItems] = useState<FeedPost[]>([]);
  const runner = useRef(createLatestRunner()).current;
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    setItems([]);
    if (key === null) {
      runner.cancel();
      return;
    }
    void runner.run((signal) => loadRef.current(signal)).then((res) => {
      if (res.status === "ok") setItems(res.value); // 실패하면 묶음을 숨긴 그대로 둔다
    });
    return () => runner.cancel();
  }, [key, runner]);
  return items;
}

type Props = { postId: string; onOpen(postId: string): void };

export function SameBookPosts({ postId, isbn13, onOpen }: Props & { isbn13: string | null }) {
  const items = useRelated(isbn13 ? `${isbn13}:${postId}` : null, async (signal) =>
    (await fetchBookPosts(isbn13!, { cursor: null, exclude: postId }, signal)).items.filter((p) => p.id !== postId)
  );
  if (items.length === 0) return null; // 책이 없거나 0개면 묶음 전체 숨김(H15)
  return (
    <View style={styles.section} testID="same-book-posts">
      <View style={styles.head}>
        <Text style={T.gauge}>RELATED · SAME BOOK</Text>
        <Text style={styles.title}>{RELATED_TEXT.sameBook}</Text>
      </View>
      <MasonryGrid items={items} onPress={onOpen} />
    </View>
  );
}

export function LibraryOtherPosts({ postId, libraryId, onOpen }: Props & { libraryId: number }) {
  const items = useRelated(`${libraryId}:${postId}`, async (signal) =>
    (await fetchLibraryPosts(libraryId, { cursor: null }, signal)).items.filter((p) => p.id !== postId)
  );
  if (items.length === 0) return null;
  return (
    <View style={styles.section} testID="library-other-posts">
      <View style={styles.head}>
        <Text style={T.gauge}>RELATED · LIBRARY</Text>
        <Text style={styles.title}>{RELATED_TEXT.library}</Text>
      </View>
      <MasonryGrid items={items} onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 16,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.seamHairline,
  },
  head: { gap: 2 },
  title: { ...T.title },
});
