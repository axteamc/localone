// 피드 카드 한 장(contracts/local-feed.md LOCAL-2 H4·H10·H12·C2·C4). A의 홈 하단 창도 onMenu 없이 쓴다.
// 이미지와 이미지 위 글자만 보인다. 제목·작성자·공감 수 줄은 넣지 않는다(H4).
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { onFill, resolvePostColor, type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import { ON_FILL_LIGHT } from "../../theme/tokens";
import type { FeedPost } from "./api";


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
  showLibraryName?: boolean;
};

export function PostCard({ post, onPress, onMenu, width, showLibraryName }: PostCardProps) {
  const { C, styles } = useLook(makeStyles);
  const [hover, setHover] = useState(false);
  const isColor = post.image_kind === "color";
  const bg = isColor ? resolvePostColor(post.image_color, C) : C.surface3;
  const textColor = isColor && post.image_color ? onFill(bg) : ON_FILL_LIGHT;
  const label = post.overlay_text ?? "게시물";

  const height = Math.round(width * cardHeightRatio(post));
  // 버튼 안 버튼 금지(웹 <button> 중첩 오류, 시연 전 개선 S1): ⋯는 카드 버튼의 형제로 겹쳐 두고,
  // 마우스 올림은 둘을 감싼 상자에서 본다(⋯ 위로 옮겨도 사라지지 않게). 포인터 이벤트는 웹용, 네이티브는 길게 누르기
  return (
    <View
      testID={`post-box-${post.id}`}
      style={{ width, height }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <Pressable
        testID={`post-card-${post.id}`}
        accessibilityRole="button"
        accessibilityLabel={showLibraryName ? `${label}, ${post.library_name}` : label}
        accessibilityHint={onMenu ? "길게 누르면 메뉴가 열려요" : undefined}
        onPress={() => onPress(post.id)}
        onLongPress={onMenu ? () => onMenu(post) : undefined}
        style={[styles.card, { width, height, backgroundColor: bg }]}
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
        {showLibraryName ? (
          <View
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            style={[styles.source, { right: onMenu ? 48 : 6 }]}
          >
            <Text numberOfLines={1} style={styles.sourceText}>{post.library_name}</Text>
          </View>
        ) : null}
      </Pressable>
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
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  return StyleSheet.create({
  card: { borderRadius: theme.radii.card, overflow: "hidden" },
  overlay: { position: "absolute", left: 10, right: 10, textAlign: "center", fontSize: 15, fontWeight: "500" },
  mid: { top: "35%" },
  bottom: { bottom: 10 },
  shadow: { textShadowColor: C.shadowSoft, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  source: {
    position: "absolute",
    top: 6,
    maxWidth: "75%",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: theme.radii.pill,
    backgroundColor: C.paper,
  },
  sourceText: { fontSize: 11, color: C.text },
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
  dotsText: { fontSize: 18, fontWeight: "500", color: C.text },
  });
};
