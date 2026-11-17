// TODO(연결): B LOCAL-2-P3 — B의 `mobile/src/features/local-feed/PostCard.tsx`가 머지되면 import만 바꾼다.
// 가짜 카드: 같은 props로 이미지(또는 image_color 토큰 바탕 + overlay_text)만 그린다(library-visit.md VISIT-1b C7).
// 제목·작성자 줄 없음(local-feed H4). 카드 비율·간격은 B의 세부 명세에서 정하므로 여기 값은 자리 잡기용이다.
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme, type ThemeColors } from "../../../theme";
import type { FeedPost } from "./localFeedApi";

export type PostCardProps = {
  post: FeedPost;
  onPress(postId: string): void;
  onMenu?(post: FeedPost): void;
  width: number;
};

const RATIO = 1.25;

function tokenColor(name: string | null): string {
  const colors = theme.colors as Record<string, string>;
  return (name && colors[name as keyof ThemeColors]) || theme.colors.surface2;
}

export function PostCard(props: PostCardProps) {
  const { post, onPress, width } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.overlay_text ?? post.book?.title ?? "게시물"}
      testID="post-card"
      onPress={() => onPress(post.id)}
      style={[styles.card, { width, height: Math.round(width * RATIO) }]}
    >
      {post.image_url ? (
        <Image source={{ uri: post.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tokenColor(post.image_color) }]} />
      )}
      {post.overlay_text ? <Text style={styles.overlay}>{post.overlay_text}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: theme.radii.card, overflow: "hidden", justifyContent: "flex-end", padding: 10 },
  overlay: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
});
