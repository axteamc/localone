// 게시물 상세(핀터레스트형) — contracts/local-feed.md LOCAL-2 H3·H9·H14·H15, C3·C6.
// 좁은 화면: 이미지 → 상단 액션 바 → 작성자·도서관 → 대여/구매 박스 → 본문 → 이어지는 글 2묶음.
// 넓은 화면(>= 768): 왼쪽 큰 이미지 + 오른쪽 정보 2단, 그 아래 이어지는 글.
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { openExternalUrl } from "../../lib/platform";
import { fetchAvailabilityAt, type AvailabilityItem } from "../../lib/publicApi";
import { onFill, theme } from "../../theme";
import { ApiCallError, emitPostReaction, emitPostWithdrawn, fetchPost, type Post } from "./api";
import { PostImage, PostMoreMenu } from "./ComposeScreen";
import { LoginPrompt, MENU_TEXT } from "./PostMenu";
import { ReactionButton, SaveButton } from "./ReactionButton";
import { LibraryOtherPosts, SameBookPosts } from "./SameBookPosts";
import { shareNotice, sharePost } from "./share";

const C = theme.colors;
const WIDE_AT = 768; // H14
const NOTICE_MS = 2000;

export const DETAIL_TEXT = {
  loading: "게시물을 불러오는 중…",
  notFound: "찾을 수 없어요.",
  unavailable: "더 이상 공개되지 않는 게시물이에요.",
  toFeed: "피드 보기",
  home: "홈으로",
  failed: "지금은 게시물을 불러올 수 없어요.",
  retry: "새로고침",
  liveCheck: "실시간 확인 ↗",
  bookDetail: "책 정보 보기",
  buy: "예스24에서 구매 ↗",
  preparing: MENU_TEXT.preparing,
  checking: "확인 중…",
  unknown: "알 수 없음",
  notHeld: "소장 없음",
} as const;

type State =
  | { kind: "loading" }
  | { kind: "ok"; post: Post }
  | { kind: "notFound" }
  | { kind: "unavailable" }
  | { kind: "error" };

/** 서울 날짜 YYYY-MM-DD */
function seoulDate(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 자료 기준일 → "오늘 기준" / "어제 기준" / "M월 D일 기준" (실시간으로 단정하지 않는다) */
export function basisLabel(dataDate: string | null, now = new Date()): string | null {
  if (!dataDate) return null;
  const today = seoulDate(now);
  const yesterday = seoulDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (dataDate === today) return "오늘 기준";
  if (dataDate === yesterday) return "어제 기준";
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dataDate);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일 기준` : null;
}

/** 대여 버튼 상태 줄(H9). 실패·모름은 "알 수 없음"(H-#9, 대출 불가로 단정 금지) */
export function loanLine(libraryName: string, item: AvailabilityItem | null | "failed", now = new Date()): string {
  if (item === null) return `${libraryName} · ${DETAIL_TEXT.checking}`;
  if (item === "failed") return `${libraryName} · ${DETAIL_TEXT.unknown}`;
  const name = item.library.name || libraryName;
  if (item.holding === "no") return `${name} · ${DETAIL_TEXT.notHeld}`;
  const basis = basisLabel(item.data_date, now);
  if (item.loanable === "yes" && basis) return `${name} · ${basis} 대출 가능`;
  if (item.loanable === "no" && basis) return `${name} · ${basis} · 대출 중`;
  return `${name} · ${DETAIL_TEXT.unknown}`;
}

export type PostDetailProps = {
  postId: string;
  /** 방문 중인 도서관(없으면 게시물의 도서관). #14 소장 조회·"피드 보기"에 쓴다 */
  visitLibraryId: number | null;
};

export function PostDetail({ postId, visitLibraryId }: PostDetailProps) {
  const router = useRouter();
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_AT;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loan, setLoan] = useState<AvailabilityItem | null | "failed">(null);
  const [login, setLogin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [othersMenu, setOthersMenu] = useState(false);
  const postRunner = useRef(createLatestRunner()).current;
  const loanRunner = useRef(createLatestRunner()).current;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backing = useRef(false);

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useEffect(
    () => () => {
      postRunner.cancel();
      loanRunner.cancel();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [postRunner, loanRunner]
  );

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setLoan(null);
    loanRunner.cancel();
    const res = await postRunner.run((signal) => fetchPost(postId, signal));
    if (res.status === "stale") return;
    if (res.status === "error") {
      const e = res.error;
      if (e instanceof ApiCallError && e.status === 404) {
        setState({ kind: e.code === "POST_NOT_AVAILABLE" ? "unavailable" : "notFound" });
      } else setState({ kind: "error" });
      return;
    }
    const post = res.value;
    setState({ kind: "ok", post });
    if (post.book) {
      const libId = visitLibraryId ?? post.library.id;
      const isbn = post.book.isbn13;
      const avail = await loanRunner.run((signal) => fetchAvailabilityAt(isbn, libId, signal));
      if (avail.status === "stale") return;
      setLoan(avail.status === "ok" ? avail.value.items[0] ?? "failed" : "failed");
    }
  }, [postId, visitLibraryId, postRunner, loanRunner]);

  useEffect(() => {
    backing.current = false;
    void load();
  }, [load]);

  const goBack = () => {
    if (backing.current) return;
    backing.current = true;
    if (router.canGoBack()) router.back();
    else if (visitLibraryId !== null) router.replace({ pathname: "/libraries/[libraryId]", params: { libraryId: String(visitLibraryId) } });
    else router.replace("/");
  };

  const openPost = (id: string) => {
    const params: Record<string, string> = { postId: id };
    if (visitLibraryId !== null) params.libraryId = String(visitLibraryId);
    router.push({ pathname: "/posts/[postId]", params });
  };

  const share = async () => {
    const text = shareNotice(await sharePost(postId));
    if (text) showNotice(text);
  };

  if (state.kind !== "ok") {
    return (
      <View style={[styles.screen, styles.center]}>
        <Pressable accessibilityRole="button" accessibilityLabel="돌아가기" onPress={goBack} style={styles.backFloating}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        {state.kind === "loading" ? (
          <Text style={styles.sub}>{DETAIL_TEXT.loading}</Text>
        ) : state.kind === "unavailable" ? (
          <>
            <Text style={styles.message}>{DETAIL_TEXT.unavailable}</Text>
            <Pressable accessibilityRole="button" onPress={goBack} style={styles.textButton}>
              <Text style={styles.link}>{DETAIL_TEXT.toFeed}</Text>
            </Pressable>
          </>
        ) : state.kind === "notFound" ? (
          <>
            <Text style={styles.message}>{DETAIL_TEXT.notFound}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.textButton}>
              <Text style={styles.link}>{DETAIL_TEXT.home}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.message}>{DETAIL_TEXT.failed}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.textButton}>
              <Text style={styles.link}>{DETAIL_TEXT.retry}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const post = state.post;
  const update = (patch: Partial<Post>) =>
    setState((s) => (s.kind === "ok" && s.post.id === post.id ? { kind: "ok", post: { ...s.post, ...patch } } : s));

  const image = (
    <View style={wide ? styles.imageWide : styles.imageNarrow} testID="detail-image">
      <PostImage
        kind={post.image_kind}
        imageUrl={post.image_url}
        color={post.image_color}
        text={post.overlay_text}
        pos="bot"
      />
      {/* 이미지 위에는 ‹만 둔다. 사이트 방문·이미지 검색·확대 버튼은 두지 않는다(H9) */}
      <Pressable accessibilityRole="button" accessibilityLabel="돌아가기" onPress={goBack} style={styles.backOnImage}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>
    </View>
  );

  const info = (
    <View style={styles.info}>
      <View style={styles.actionBar} testID="detail-action-bar">
        <View style={styles.actionLeft}>
          <ReactionButton
            postId={post.id}
            signedIn={signedIn}
            reacted={post.my_reaction}
            count={post.reaction_count}
            onChange={(reacted, count) => {
              update({ my_reaction: reacted, reaction_count: count });
              emitPostReaction(post.id, { my_reaction: reacted }); // 돌아갈 피드 카드 메뉴도 맞춘다(①-2)
            }}
            onLoginNeeded={() => setLogin(true)}
            onNotice={showNotice}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="공유" onPress={() => void share()} style={styles.iconAction}>
            <Text style={styles.iconText}>↑</Text>
          </Pressable>
          {post.is_mine ? (
            <PostMoreMenu
              post={post}
              onWithdrawn={() => {
                emitPostWithdrawn(post.id); // 피드가 카드를 감추고 "내렸어요"(F16)
                goBack();
              }}
            />
          ) : (
            <View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="더 보기"
                onPress={() => setOthersMenu((v) => !v)}
                style={styles.iconAction}
              >
                <Text style={styles.iconText}>⋯</Text>
              </Pressable>
              {othersMenu ? (
                <View style={styles.smallMenu}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setOthersMenu(false);
                      void share();
                    }}
                    style={styles.smallMenuItem}
                  >
                    <Text style={styles.smallMenuText}>{MENU_TEXT.share}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </View>
        <SaveButton
          postId={post.id}
          signedIn={signedIn}
          saved={post.my_bookmark}
          onChange={(saved) => {
            update({ my_bookmark: saved });
            emitPostReaction(post.id, { my_bookmark: saved });
          }}
          onLoginNeeded={() => setLogin(true)}
          onNotice={showNotice}
        />
      </View>

      <Text style={styles.byline}>{`${post.author.nickname} · ${post.library.name}`}</Text>

      {post.book ? (
        <View style={styles.loanBox} testID="loan-box">
          <Pressable
            accessibilityRole="button"
            testID="loan-button"
            onPress={() => {
              const live = loan !== null && loan !== "failed" ? loan.live_check : null;
              if (live) void openExternalUrl(live.url);
              else router.push({ pathname: "/books/[isbn13]", params: { isbn13: post.book!.isbn13 } });
            }}
            style={styles.loanButton}
          >
            <Text style={styles.loanTitle} numberOfLines={2}>
              {post.book.author ? `${post.book.title} · ${post.book.author}` : post.book.title}
            </Text>
            <Text style={styles.loanStatus}>{loanLine(post.library.name, loan)}</Text>
            <Text style={styles.loanCta}>
              {loan !== null && loan !== "failed" && loan.live_check ? DETAIL_TEXT.liveCheck : DETAIL_TEXT.bookDetail}
            </Text>
          </Pressable>
          {/* TODO(연결): M2 예스24 구매 연결 — M1은 버튼만, 누르면 안내(#15 호출·외부 이동 없음) */}
          <Pressable
            accessibilityRole="button"
            testID="buy-button"
            onPress={() => showNotice(DETAIL_TEXT.preparing)}
            style={styles.buyButton}
          >
            <Text style={styles.buyText}>{DETAIL_TEXT.buy}</Text>
          </Pressable>
        </View>
      ) : null}

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="detail-scroll">
        {wide ? (
          <View style={styles.wideRow}>
            {image}
            {info}
          </View>
        ) : (
          <>
            {image}
            {info}
          </>
        )}
        <SameBookPosts postId={post.id} isbn13={post.book?.isbn13 ?? null} onOpen={openPost} />
        <LibraryOtherPosts postId={post.id} libraryId={visitLibraryId ?? post.library.id} onOpen={openPost} />
      </ScrollView>
      {notice ? (
        <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite" testID="detail-notice">
          <Text style={styles.toastText}>{notice}</Text>
        </View>
      ) : null}
      {login ? <LoginPrompt onClose={() => setLogin(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 다른 도서관 글이어도 방문 중 테마(M1 warm 하나)를 그대로 쓴다(H14)
  screen: { flex: 1, backgroundColor: C.cream },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  content: { paddingBottom: 48 },
  wideRow: { flexDirection: "row", gap: 24, padding: 24, alignItems: "flex-start" },
  imageNarrow: { paddingHorizontal: 12, paddingTop: 12 },
  imageWide: { flex: 1 },
  info: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  backOnImage: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: theme.radii.control,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.shadowSoft,
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  backFloating: { position: "absolute", top: 16, left: 16, width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  backText: { fontSize: 28, fontWeight: "800", color: C.text, lineHeight: 32 },
  actionBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 2 },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconAction: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 22, fontWeight: "800", color: C.text },
  smallMenu: {
    position: "absolute",
    top: 44,
    left: 0,
    backgroundColor: C.paper,
    borderRadius: theme.radii.inner,
    paddingVertical: 4,
    minWidth: 120,
    shadowColor: C.shadowFloat,
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  smallMenuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  smallMenuText: { fontSize: 15, color: C.text, fontWeight: "600" },
  byline: { fontSize: 15, color: C.textSub, fontWeight: "600" },
  loanBox: { gap: 8 },
  loanButton: { backgroundColor: C.paper, borderRadius: theme.radii.card, padding: 16, gap: 4 },
  loanTitle: { fontSize: 16, fontWeight: "800", color: C.text },
  loanStatus: { fontSize: 15, color: C.text },
  loanCta: { fontSize: 14, fontWeight: "800", color: C.inkStrong, marginTop: 4 },
  buyButton: {
    alignSelf: "flex-start",
    borderRadius: theme.radii.control,
    borderWidth: 1,
    borderColor: C.divider,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
  },
  buyText: { fontSize: 14, color: C.textSub, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24, color: C.text },
  message: { fontSize: 17, fontWeight: "700", color: C.text, textAlign: "center" },
  sub: { fontSize: 15, color: C.textSub },
  textButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { fontSize: 15, fontWeight: "800", color: C.text },
  toast: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    backgroundColor: C.paper,
    borderRadius: theme.radii.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: C.shadowFloat,
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  toastText: { fontSize: 15, fontWeight: "700", color: onFill(C.paper) },
});
