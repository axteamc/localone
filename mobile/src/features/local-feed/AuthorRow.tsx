// 게시물 상세 작성자 줄 — contracts/my-collection.md MY-4 M4-1·M4-2·M4-6 (C-97, 시안 작성자_프로필_시안.html 1-B).
// [사진 28 원] 닉네임 / 아래 작게 "도서관 · YYYY.MM.DD" (+ 독서 기록에서 올렸으면 표찰).
// 사진·닉네임 = 바로 프로필. 줄 끝 ⋯ = "프로필 보기"·"사용자 신고". 내 글은 내 정보 탭으로 가고 ⋯ 없음.
// profile_id가 null(탈퇴 등)이면 누를 수 없다.
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { cardSurface, type Theme } from "../../theme";
import { UserIcon } from "../../theme/Icons";
import type { Post } from "./api";
import { lookKit, useLook } from "./useLibraryLook";

export const AUTHOR_TEXT = {
  menu: "작성자 메뉴",
  profile: "프로필 보기",
  report: "사용자 신고",
  fromLog: "독서 기록",
} as const;

const AVATAR = 28;

export function postDateLabel(publishedAt: string): string {
  return publishedAt.slice(0, 10).replace(/-/g, ".");
}

export type AuthorRowProps = {
  post: Post;
  onReport(): void;
};

export function AuthorRow({ post, onReport }: AuthorRowProps) {
  const { C, styles } = useLook(makeStyles);
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const profileId = post.author.profile_id ?? null;
  const canOpen = post.is_mine || profileId !== null;

  const openProfile = () => {
    setMenu(false);
    if (post.is_mine) router.navigate("/me");
    else if (profileId) router.push({ pathname: "/users/[profileId]", params: { profileId } });
  };

  const avatar = post.author.avatar_url ? (
    <Image source={{ uri: post.author.avatar_url }} style={styles.avatar} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.avatar, styles.avatarEmpty]}>
      <UserIcon size={15} color={C.inkSoft} />
    </View>
  );

  const main = (
    <>
      {avatar}
      <View style={styles.names}>
        <Text style={styles.nickname} numberOfLines={1}>{post.author.nickname}</Text>
        <View style={styles.subRow}>
          <Text style={styles.sub} numberOfLines={1}>{`${post.library.name} · ${postDateLabel(post.published_at)}`}</Text>
          {post.from_reading_log ? (
            <View style={styles.badge} testID="from-log-badge">
              <Text style={styles.badgeText}>{AUTHOR_TEXT.fromLog}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.row} testID="author-row">
      {canOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${post.author.nickname} ${AUTHOR_TEXT.profile}`}
          onPress={openProfile}
          style={styles.main}
          testID="author-open"
        >
          {main}
        </Pressable>
      ) : (
        <View style={styles.main}>{main}</View>
      )}
      {!post.is_mine && profileId !== null ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={AUTHOR_TEXT.menu}
            onPress={() => setMenu((v) => !v)}
            style={styles.dots}
            testID="author-menu"
          >
            <Text style={styles.dotsText}>⋯</Text>
          </Pressable>
          {menu ? (
            <View style={styles.menu}>
              <Pressable accessibilityRole="button" onPress={openProfile} style={styles.menuItem}>
                <Text style={styles.menuText}>{AUTHOR_TEXT.profile}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenu(false);
                  onReport();
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuText}>{AUTHOR_TEXT.report}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T } = lookKit(theme);
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 4, zIndex: 1 },
    main: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
    avatar: { width: AVATAR, height: AVATAR, borderRadius: "50%" }, // 원 모양만 50%(ProfileHeader와 같은 예외)
    avatarEmpty: {
      backgroundColor: C.panelLit,
      borderWidth: 1,
      borderColor: C.seamHairline,
      alignItems: "center",
      justifyContent: "center",
    },
    names: { flex: 1, minWidth: 0, gap: 1 },
    nickname: { ...T.name, color: C.text },
    subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    sub: { fontSize: 12, color: C.textSub, flexShrink: 1 },
    badge: {
      borderWidth: 1,
      borderColor: C.seamHairline,
      borderRadius: theme.radii.control,
      paddingHorizontal: 6,
    },
    badgeText: { fontSize: 11, fontWeight: "500", color: C.inkStrong },
    dots: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    dotsText: { fontSize: 18, fontWeight: "500", color: C.text },
    menu: {
      ...cardSurface(theme, { onPanel: true }),
      position: "absolute",
      top: 44,
      right: 0,
      paddingVertical: 4,
      minWidth: 132,
    },
    menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
    menuText: { fontSize: 14, color: C.text, fontWeight: "500" },
  });
};
