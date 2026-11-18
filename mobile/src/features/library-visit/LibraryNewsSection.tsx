// 자주 가는·가까운 도서관 소식 칸 (계약서 library-visit.md VISIT-1b W1·W4~W6·W10, 결정 1·3, 예외 #1·#2·#5)
// 칸 제목 → 도서관 이름 알약(최대 3개) → 그 도서관 게시물 2열. 카드는 B의 PostCard를 그대로 쓴다.
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { theme, type as T } from "../../theme";
import type { FeedPost } from "../local-feed/api";
import { PostCard } from "../local-feed/PostCard";
import type { HomeFeed } from "./useHomeFeed";

const TEXT = {
  frequent: "자주 가는 도서관 소식",
  nearby: "가까운 도서관 소식",
  nearbyHint: "자주 가는 곳이 생기면 바뀌어요",
  areaBased: "지금 보는 지역 기준",
  noPosts: (name: string) => `${name}에는 아직 게시물이 없어요.`,
  nearbyNoPosts: "가까운 도서관에도 아직 게시물이 없어요.",
  error: "소식을 불러오지 못했어요.",
  reload: "↻ 새로고침",
};

const GAP = 8;

export type LibraryNewsSectionProps = {
  news: HomeFeed["news"];
  /** 위치를 못 써서 지금 보는 지역 기준으로 고른 가까운 도서관인지(예외 #5) */
  areaBased: boolean;
  onSelectPill(libraryId: number): void;
  onPressPost(postId: string): void;
  onReload(): void;
};

export function LibraryNewsSection(props: LibraryNewsSectionProps) {
  const { news, areaBased, onSelectPill, onPressPost, onReload } = props;
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  const cardWidth = Math.max(0, Math.floor((width - GAP) / 2));

  // 2열: 차례대로 왼쪽·오른쪽에 번갈아 놓는다(최신순 유지)
  const columns: [FeedPost[], FeedPost[]] = [[], []];
  news.posts.forEach((p, i) => columns[i % 2]!.push(p));

  const active = news.pills.find((p) => p.libraryId === news.activeId) ?? null;

  let message: React.ReactNode = null;
  if (news.status === "error") {
    message = (
      <View style={styles.message}>
        <Text style={styles.messageText}>{TEXT.error}</Text>
        <Pressable accessibilityRole="button" onPress={onReload} style={styles.reload}>
          <Text style={styles.reloadText}>{TEXT.reload}</Text>
        </Pressable>
      </View>
    );
  } else if (news.status === "empty") {
    // 켜진 알약이 있으면 그 도서관 이름(예외 #2-b), 가까운 곳이 모두 비었으면 켜진 알약 없이 #2-c
    message = (
      <View style={styles.message}>
        <Text style={styles.messageText}>{active ? TEXT.noPosts(active.name) : TEXT.nearbyNoPosts}</Text>
      </View>
    );
  }

  return (
    <View testID="library-news" onLayout={onLayout}>
      <View style={styles.head}>
        <Text style={styles.title}>{news.kind === "frequent" ? TEXT.frequent : TEXT.nearby}</Text>
        {news.kind === "nearby" && areaBased ? <Text style={styles.sub}>{TEXT.areaBased}</Text> : null}
      </View>
      {news.kind === "nearby" ? <Text style={styles.hint}>{TEXT.nearbyHint}</Text> : null}

      {news.pills.length > 0 ? (
        <View style={styles.pills}>
          {news.pills.map((p) => {
            const on = p.libraryId === news.activeId;
            return (
              <Pressable
                key={p.libraryId}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={`news-pill-${p.libraryId}`}
                onPress={() => onSelectPill(p.libraryId)}
                style={[styles.pill, on ? styles.pillOn : null]}
              >
                <Text style={[styles.pillText, on ? styles.pillTextOn : null]}>{p.name}</Text>
                {p.caption ? <Text style={[styles.pillCaption, on ? styles.pillTextOn : null]}>{p.caption}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {message ??
        (news.status === "loading" ? (
          <View style={styles.columns} testID="news-loading">
            {[0, 1].map((c) => (
              <View key={c} style={[styles.column, { width: cardWidth }]}>
                <View style={[styles.placeholder, { height: Math.round(cardWidth * 1.25) }]} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.columns}>
            {columns.map((col, c) => (
              <View key={c} style={[styles.column, { width: cardWidth }]}>
                {col.map((post) => (
                  <PostCard key={post.id} post={post} width={cardWidth} onPress={onPressPost} />
                ))}
              </View>
            ))}
          </View>
        ))}
    </View>
  );
}

const c = theme.colors;

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 18 },
  title: { ...T.title },
  sub: { fontSize: 12, color: c.textSub },
  hint: { fontSize: 12, color: c.textSub, marginTop: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: theme.radii.pill,
    backgroundColor: c.surface2,
  },
  pillOn: { backgroundColor: c.inkStrong },
  pillText: { fontSize: 13, color: c.text },
  pillCaption: { fontSize: 11, color: c.textSub },
  pillTextOn: { color: c.paper },
  columns: { flexDirection: "row", gap: GAP, alignItems: "flex-start" },
  column: { gap: GAP },
  placeholder: { borderRadius: theme.radii.card, backgroundColor: c.surface2 },
  message: { alignItems: "flex-start", gap: 8, paddingVertical: 8 },
  messageText: { fontSize: 13, color: c.textSub },
  reload: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radii.pill, backgroundColor: c.surface2 },
  reloadText: { fontSize: 13, color: c.text },
});
