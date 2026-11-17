// 피드 카드 한 장(contracts/local-feed.md LOCAL-2 H4·H10·H12·C2·C4). A의 홈 하단 창도 onMenu 없이 쓴다.
// 이미지와 이미지 위 글자만 보인다. 제목·작성자·공감 수 줄은 넣지 않는다(H4).
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { onFill, theme } from "../../theme";
import { ON_FILL_LIGHT } from "../../theme/tokens";
import type { FeedPost } from "./api";

const C = theme.colors;

/** 너비 대비 높이. 응답에 사진 크기가 없어 고정 비율로 엇갈리게 쌓는다(세부 명세 0절 기본값) */
export function cardHeightRatio(post: Pick<FeedPost, "image_kind" | "overlay_text">): number {
  if (post.image_kind !== "color") return 4 / 3;
  return post.overlay_text ? 5 / 4 : 1;
}

export type PostCardProps = {
  post: FeedPost;
  onPress(postId: string): void;
  onMenu?(post: FeedPost): void;
  width: number;
};

export function PostCard({ post, onPress, onMenu, width }: PostCardProps) {
  const [hover, setHover] = useState(false);
  const isColor = post.image_kind === "color";
  const bg = isColor && post.image_color ? C[post.image_color] : C.surface3;
  const textColor = isColor && post.image_color ? onFill(C[post.image_color]) : ON_FILL_LIGHT;

  return (
    <Pressable
      testID={`post-card-${post.id}`}
      accessibilityRole="button"
      accessibilityLabel={post.overlay_text ?? "게시물"}
      accessibilityHint={onMenu ? "길게 누르면 메뉴가 열려요" : undefined}
      onPress={() => onPress(post.id)}
      onLongPress={onMenu ? () => onMenu(post) : undefined}
      // 웹: 마우스를 올리면 ⋯ (RN Pressable 공통 API, C4)
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.card, { width, height: Math.round(width * cardHeightRatio(post)), backgroundColor: bg }]}
    >
      {!isColor && post.image_url ? (
        <Image source={{ uri: post.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {post.overlay_text ? (
        <Text
          numberOfLines={6}
          style={[styles.overlay, { color: textColor }, isColor ? styles.mid : [styles.bottom, styles.shadow]]}
        >
          {post.overlay_text}
        </Text>
      ) : null}
      {onMenu && hover ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="카드 메뉴"
          onPress={() => onMenu(post)}
          style={styles.dots}
        >
          <Text style={styles.dotsText}>⋯</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: theme.radii.card, overflow: "hidden" },
  overlay: { position: "absolute", left: 10, right: 10, textAlign: "center", fontSize: 15, fontWeight: "700" },
  mid: { top: "35%" },
  bottom: { bottom: 10 },
  shadow: { textShadowColor: C.shadowSoft, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  dots: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 36,
    height: 36,
    borderRadius: theme.radii.control,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsText: { fontSize: 18, fontWeight: "800", color: C.text },
});
