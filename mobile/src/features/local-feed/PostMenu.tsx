// 피드 카드 길게 누르기(웹 호버 ⋯) 작은 창 — contracts/local-feed.md LOCAL-2 H10(#el-card-menu 후보 A)·C3.
// 위: 아이콘 3개 한 줄(좋아요·북마크·공유). 아래: 책 줄(책 제목 검색·저자의 다른 책) 또는 도서 없음(예스24, M2).
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { actionColors, cardSurface, type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import { ApiCallError, fetchPost, setBookmark, setReaction, type FeedPost, type PostReactionPatch } from "./api";
import { REPORT_TEXT, ReportSheet } from "./ReportSheet";
import { shareNotice, sharePost } from "./share";
import { ModalFrame } from "../../theme/WebFrame";


export const MENU_TEXT = {
  like: "좋아요",
  liked: "좋아요됨",
  bookmark: "북마크",
  bookmarked: "저장됨",
  share: "공유",
  bookless: "🛒 도서 없음 (예스24 구매 ↗)",
  preparing: "준비 중이에요",
  failed: "지금은 처리하지 못했어요. 다시 시도해 주세요.",
  loginNeeded: "로그인하면 공감·북마크를 남길 수 있어요",
  login: "로그인하기",
  close: "닫기",
} as const;

export const searchTitleLabel = (title: string) => `📖 ${title} 검색`;
export const searchAuthorLabel = (author: string) => `${author}의 다른 책`;

/** 공감·북마크 실패 안내 한 줄(H-#4·H-#7 서버 문구 우선) */
export function toggleFailText(e: unknown): string {
  return e instanceof ApiCallError && e.status !== 0 && e.status !== 503 && e.message ? e.message : MENU_TEXT.failed;
}

/** 비로그인 공감·북마크 안내 창(H-#6). 서버에 묻지 않는다 */
export function LoginPrompt({ onClose }: { onClose: () => void }) {
  const { ACT, styles } = useLook(makeStyles);
  const router = useRouter();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}><ModalFrame>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet} accessibilityRole="alert" testID="login-prompt">
          <Text style={styles.sheetTitle}>{MENU_TEXT.loginNeeded}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push({ pathname: "/login" });
            }}
            style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
          >
            <Text style={styles.primaryText}>{MENU_TEXT.login}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryText}>{MENU_TEXT.close}</Text>
          </Pressable>
        </View>
      </View>
    </ModalFrame></Modal>
  );
}

export type PostMenuProps = {
  post: FeedPost;
  signedIn: boolean;
  /** 로그인 복원 중이면 공감·북마크 누름을 무시한다(①-5) */
  authLoading?: boolean;
  onClose(): void;
  onChange(postId: string, patch: PostReactionPatch): void;
  onNotice(text: string): void;
  onLoginNeeded(): void;
  /** 선택: 실패 안내 문구를 바꾼다(my-collection MY-1 Y-O4). 없으면 toggleFailText(e) — 홈·방문 페이지 동작 그대로 */
  failText?(kind: "reaction" | "bookmark", e: unknown): string;
};

export function PostMenu({
  post,
  signedIn,
  authLoading,
  onClose,
  onChange,
  onNotice,
  onLoginNeeded,
  failText,
}: PostMenuProps) {
  const { styles } = useLook(makeStyles);
  const router = useRouter();
  const { userId } = useAuth();
  const identity = JSON.stringify([post.id, signedIn, userId]);
  const [ownership, setOwnership] = useState<{ identity: string; mine: boolean } | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn || authLoading) return;
    const ctrl = new AbortController();
    // FeedPost omits ownership. The existing detail response provides the viewer-specific flag.
    async function loadOwner() {
      try {
        const detail = await fetchPost(post.id, ctrl.signal);
        if (!ctrl.signal.aborted) setOwnership({ identity, mine: detail.is_mine });
      } catch {
        // A failed ownership lookup cannot reveal a report action on the viewer's own post.
      }
    }
    void loadOwner();
    return () => ctrl.abort();
  }, [identity, post.id, signedIn, authLoading]);

  const busy = useRef({ reaction: false, bookmark: false, share: false });
  const [, rerender] = useState(0);

  const toggle = async (kind: "reaction" | "bookmark") => {
    if (authLoading) return;
    if (!signedIn) {
      onClose();
      onLoginNeeded(); // 서버 요청 0번
      return;
    }
    if (busy.current[kind]) return; // 연타 막기(H-#5)
    busy.current[kind] = true;
    rerender((n) => n + 1);
    try {
      // 응답이 온 필드만 넘긴다. 누른 시점의 post 전체를 넘기면 동시에 보낸 다른 쪽 결과를 덮는다(①-1)
      if (kind === "reaction") {
        const res = await setReaction(post.id, !post.my_reaction);
        onChange(post.id, { my_reaction: res.reacted });
      } else {
        const res = await setBookmark(post.id, !post.my_bookmark);
        onChange(post.id, { my_bookmark: res.bookmarked });
      }
    } catch (e) {
      onNotice(failText ? failText(kind, e) : toggleFailText(e));
    } finally {
      busy.current[kind] = false;
      rerender((n) => n + 1);
    }
  };

  const share = async () => {
    if (busy.current.share) return;
    busy.current.share = true;
    try {
      const text = shareNotice(await sharePost(post.id));
      if (text) onNotice(text);
      onClose();
    } finally {
      busy.current.share = false;
    }
  };

  const search = (q: string) => {
    onClose();
    router.push({ pathname: "/search", params: { q } });
  };

  if (reportFor === identity) {
    return <ReportSheet target={{ kind: "post", id: post.id }} onClose={onClose} onDone={() => {
      onNotice(REPORT_TEXT.done);
      onClose();
    }} />;
  }

  const canReport = !authLoading && (!signedIn || (ownership?.identity === identity && !ownership.mine));
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}><ModalFrame>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="메뉴 닫기">
        {/* 창 안을 눌러도 닫히지 않게 한 겹 더 감싼다 */}
        <Pressable style={styles.menu} onPress={() => {}} testID="post-menu" accessibilityViewIsModal>
          <View style={styles.iconRow}>
            <IconButton
              icon={post.my_reaction ? "♥" : "♡"}
              label={post.my_reaction ? MENU_TEXT.liked : MENU_TEXT.like}
              on={post.my_reaction}
              onPress={() => void toggle("reaction")}
            />
            <IconButton
              icon="🔖"
              label={post.my_bookmark ? MENU_TEXT.bookmarked : MENU_TEXT.bookmark}
              on={post.my_bookmark}
              onPress={() => void toggle("bookmark")}
            />
            <IconButton icon="↗" label={MENU_TEXT.share} on={false} onPress={() => void share()} />
          </View>
          <View style={styles.divider} />
          {post.book ? (
            <>
              <Row label={searchTitleLabel(post.book.title)} onPress={() => search(post.book!.title)} />
              {post.book.author ? (
                <Row label={searchAuthorLabel(post.book.author)} onPress={() => search(post.book!.author!)} />
              ) : null}
            </>
          ) : (
            // TODO(연결): M2 예스24 API — M1은 버튼만, 누르면 안내(API 호출 0번)
            <Row
              label={MENU_TEXT.bookless}
              onPress={() => {
                onClose();
                onNotice(MENU_TEXT.preparing);
              }}
            />
          )}
          {canReport ? (
            <Row label={REPORT_TEXT.open} onPress={() => setReportFor(identity)} />
          ) : null}
        </Pressable>
      </Pressable>
    </ModalFrame></Modal>
  );
}

function IconButton(props: { icon: string; label: string; on: boolean; onPress: () => void }) {
  const { styles } = useLook(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.on }}
      onPress={props.onPress}
      style={styles.iconButton}
    >
      <Text style={[styles.icon, props.on && styles.iconOn]}>{props.icon}</Text>
      <Text style={styles.iconLabel}>{props.label}</Text>
    </Pressable>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  const { styles } = useLook(makeStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text style={styles.rowText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T, ACT } = lookKit(theme);
  return StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.shadowDeep, alignItems: "center", justifyContent: "center", padding: 24 },
  menu: {
    ...cardSurface(theme, { onPanel: true }),
    width: "100%",
    maxWidth: 260,
    paddingVertical: 8,
  },
  iconRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 4 },
  iconButton: { alignItems: "center", justifyContent: "center", minWidth: 64, minHeight: 56, paddingVertical: 6 },
  icon: { fontSize: 20, color: C.inkMuted },
  iconOn: { color: C.inkStrong },
  iconLabel: { fontSize: 11, fontWeight: "500", color: C.inkMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.seamHairline, marginVertical: 4 },
  row: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  rowText: { fontSize: 14, color: C.text, fontWeight: "500" },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: C.shadowDeep },
  sheet: {
    backgroundColor: C.panelLit,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
    borderTopLeftRadius: theme.radii.infoCard,
    borderTopRightRadius: theme.radii.infoCard,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  sheetTitle: { ...T.title },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center" },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center" },
  secondaryText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "500" },
  });
};
