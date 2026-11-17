// VISIT-2 도서관 방문 페이지의 틀 (contracts/local-feed.md VISIT-2 G1~G14, 명세 specs/local-feed/세부/VISIT-2.md)
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { ApiCallError, fetchLibrary, type LibraryDetail } from "../../lib/publicApi";
import { getDefaultLibrary, recordVisit } from "../../lib/visits";
import { onFill, theme } from "../../theme";
import { FOLD_AT, VisitHeader, VisitHeaderFolded } from "./VisitHeader";
import { pickVisitMent } from "./visitMent";

const C = theme.colors;
const MENT_DELAY_MS = 300; // 전환 끝나고 0.3초 (G3)
const MENT_SHOW_MS = 2500; // 2.5초 뒤 사라짐 (G3)

export const VISIT_TEXT = {
  notFound: "찾을 수 없어요.",
  home: "홈으로",
  libFailed: "도서관 정보를 불러오지 못했어요.",
  libRetry: "↻ 새로고침",
  feedLoading: "이야기를 불러오는 중…",
  feedFailed: "지금은 이 도서관 이야기를 불러올 수 없어요.",
  feedRetry: "새로고침",
  emptyTitle: "아직 게시물이 없어요",
  emptySub: "이 도서관의 첫 글을 올려 보세요",
  emptyLink: "첫 글 올리기 →",
  loginNeeded: "로그인하면 글을 올릴 수 있어요",
  login: "로그인하기",
  close: "닫기",
} as const;

/** 피드 불러오기(#26). LOCAL-2 전에는 없음 → 빈 피드 안내(G9·V-#2) */
export type FeedLoader = (libraryId: number, signal: AbortSignal) => Promise<{ items: unknown[] }>;

type LibState =
  | { kind: "loading" }
  | { kind: "ok"; lib: LibraryDetail }
  | { kind: "error" }
  | { kind: "notFound" };

type FeedState = { kind: "loading" } | { kind: "error" } | { kind: "empty" } | { kind: "items"; items: unknown[] };

export type VisitScreenProps = {
  libraryId: number | null;
  distanceM: number | null;
  loadFeed?: FeedLoader; // TODO(연결): B LOCAL-2 fetchLibraryPosts
  renderFeed?: (items: unknown[]) => React.ReactNode;
  more?: (lib: LibraryDetail) => React.ReactNode; // ⋯ 메뉴(VISIT-2-P2)
  askCard?: (lib: LibraryDetail, close: () => void) => React.ReactNode; // 세 번째 방문 질문(VISIT-2-P2)
};

export function VisitScreen({ libraryId, distanceM, loadFeed, renderFeed, more, askCard }: VisitScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const { status } = useAuth();
  const [lib, setLib] = useState<LibState>(libraryId === null ? { kind: "notFound" } : { kind: "loading" });
  const [feed, setFeed] = useState<FeedState>(loadFeed ? { kind: "loading" } : { kind: "empty" });
  const [folded, setFolded] = useState(false);
  const [ment, setMent] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [loginSheet, setLoginSheet] = useState(false);
  const libRunner = useRef(createLatestRunner()).current;
  const feedRunner = useRef(createLatestRunner()).current;
  const backing = useRef(false);
  const foldedRef = useRef(false);
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      libRunner.cancel();
      feedRunner.cancel();
      timers.current.forEach(clearTimeout);
    };
  }, [libRunner, feedRunner]);

  // 화면 왼쪽 끝 밀기(Stack 제스처)로 나가는 중이면 ‹를 더 받지 않는다(V-#3)
  useEffect(() => {
    const nav = navigation as unknown as { addListener?: (e: string, cb: () => void) => () => void };
    return nav.addListener?.("beforeRemove", () => {
      backing.current = true;
    });
  }, [navigation]);

  const showMent = useCallback((text: string) => {
    timers.current.push(
      setTimeout(() => {
        if (!alive.current) return;
        setMent(text);
        timers.current.push(setTimeout(() => alive.current && setMent(null), MENT_SHOW_MS));
      }, MENT_DELAY_MS)
    );
  }, []);

  const loadLibrary = useCallback(
    async (id: number) => {
      setLib({ kind: "loading" });
      const res = await libRunner.run((signal) => fetchLibrary(id, signal));
      if (res.status === "stale") return null;
      if (res.status === "ok") {
        setLib({ kind: "ok", lib: res.value });
        return res.value;
      }
      if (res.error instanceof ApiCallError && res.error.status === 404) {
        setLib({ kind: "notFound" });
        return "notFound" as const;
      }
      setLib({ kind: "error" });
      return "error" as const;
    },
    [libRunner]
  );

  const loadFeedOnly = useCallback(
    async (id: number) => {
      if (!loadFeed) {
        setFeed({ kind: "empty" });
        return;
      }
      setFeed({ kind: "loading" });
      const res = await feedRunner.run((signal) => loadFeed(id, signal));
      if (res.status === "stale") return;
      if (res.status === "error") setFeed({ kind: "error" });
      else setFeed(res.value.items.length ? { kind: "items", items: res.value.items } : { kind: "empty" });
    },
    [feedRunner, loadFeed]
  );

  // 들어올 때: #11 → (404가 아니면) 방문 한 번 기록 → 멘트. 피드는 따로.
  useEffect(() => {
    if (libraryId === null) return;
    backing.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMent(null);
    setAsking(false);
    let current = true;
    void loadFeedOnly(libraryId);
    void (async () => {
      const result = await loadLibrary(libraryId);
      if (result === null || result === "notFound" || !current) return; // 늦은 응답·없는 도서관은 기록하지 않음
      const visit = await recordVisit(libraryId);
      const isDefault = (await getDefaultLibrary()) === libraryId;
      if (!current || !alive.current) return;
      const name = typeof result === "object" ? result.name : "이 도서관";
      const picked = pickVisitMent(visit, name, isDefault, visit.record.lastVisitedOn);
      if (picked?.kind === "ment") showMent(picked.text);
      else if (picked?.kind === "ask") setAsking(true);
    })();
    return () => {
      current = false;
    };
  }, [libraryId, loadLibrary, loadFeedOnly, showMent]);

  const goBack = () => {
    if (backing.current) return; // ‹ 연타·밀기 겹침 (V-#3)
    backing.current = true;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const openCompose = () => {
    if (status !== "signedIn") {
      setLoginSheet(true); // 이동 0번 (V-#4)
      return;
    }
    router.push({ pathname: "/posts/new", params: { libraryId: String(libraryId) } });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const next = foldedRef.current ? y > 0 : y > FOLD_AT; // 접힌 뒤에는 맨 위에서만 펼침
    if (next !== foldedRef.current) {
      foldedRef.current = next;
      setFolded(next);
    }
  };

  if (lib.kind === "notFound") {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyTitle}>{VISIT_TEXT.notFound}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.textButton}>
          <Text style={styles.link}>{VISIT_TEXT.home}</Text>
        </Pressable>
      </View>
    );
  }

  const name = lib.kind === "ok" ? lib.lib.name : "";
  const moreNode = lib.kind === "ok" && more ? more(lib.lib) : <View style={styles.moreSpace} />;

  return (
    <View style={styles.screen}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} testID="visit-scroll" contentContainerStyle={styles.content}>
        {lib.kind === "error" ? (
          <View style={styles.libError}>
            <Pressable accessibilityRole="button" accessibilityLabel="지도 홈으로 돌아가기" onPress={goBack} style={styles.textButton}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <Text style={styles.sub}>{VISIT_TEXT.libFailed}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => libraryId !== null && void loadLibrary(libraryId)}
              style={styles.textButton}
            >
              <Text style={styles.link}>{VISIT_TEXT.libRetry}</Text>
            </Pressable>
          </View>
        ) : (
          <VisitHeader
            name={name}
            distanceM={distanceM}
            today={lib.kind === "ok" ? lib.lib.today : null}
            onBack={goBack}
            more={moreNode}
          />
        )}
        <View style={styles.feed} testID="visit-feed">
          {feed.kind === "loading" ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{VISIT_TEXT.feedLoading}</Text>
            </View>
          ) : feed.kind === "error" ? (
            <View style={styles.center}>
              <Text style={styles.sub}>{VISIT_TEXT.feedFailed}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => libraryId !== null && void loadFeedOnly(libraryId)}
                style={styles.textButton}
              >
                <Text style={styles.link}>{VISIT_TEXT.feedRetry}</Text>
              </Pressable>
            </View>
          ) : feed.kind === "empty" ? (
            <View style={styles.center} testID="empty-feed">
              <Text style={styles.emptyTitle}>{VISIT_TEXT.emptyTitle}</Text>
              <Text style={styles.emptySub}>{VISIT_TEXT.emptySub}</Text>
              <Pressable accessibilityRole="link" onPress={openCompose} style={styles.textButton}>
                <Text style={styles.emptyLink}>{VISIT_TEXT.emptyLink}</Text>
              </Pressable>
            </View>
          ) : (
            renderFeed?.(feed.items) ?? null
          )}
        </View>
        {/* M2 책장(오늘의 서가)이 이 아래에 붙는다(G9). 지금은 아무것도 그리지 않는다 */}
      </ScrollView>

      {folded && lib.kind === "ok" ? <VisitHeaderFolded name={name} onBack={goBack} more={moreNode} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="글쓰기"
        onPress={openCompose}
        style={styles.fab}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {ment ? (
        <View style={styles.ment} pointerEvents="none" testID="visit-ment" accessibilityLiveRegion="polite">
          <Text style={styles.mentText}>{ment}</Text>
        </View>
      ) : null}

      {asking && lib.kind === "ok" && askCard ? askCard(lib.lib, () => setAsking(false)) : null}

      {loginSheet ? (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet} accessibilityRole="alert">
            <Text style={styles.sheetTitle}>{VISIT_TEXT.loginNeeded}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoginSheet(false);
                router.push({ pathname: "/login" });
              }}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{VISIT_TEXT.login}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setLoginSheet(false)} style={styles.textButton}>
              <Text style={styles.sub}>{VISIT_TEXT.close}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.cream },
  content: { paddingBottom: 120, minHeight: "100%" },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 6 },
  libError: { minHeight: 115, paddingHorizontal: 16, justifyContent: "flex-end", gap: 4 },
  backText: { fontSize: 30, fontWeight: "800", color: C.text },
  moreSpace: { width: 44 },
  feed: { flexGrow: 1, minHeight: 360, justifyContent: "center", paddingHorizontal: 12, paddingTop: 12 },
  pill: {
    alignSelf: "center",
    backgroundColor: C.paper,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: { fontSize: 13, color: C.textSub },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: C.text },
  emptySub: { fontSize: 18, color: C.textSub },
  emptyLink: { fontSize: 18, fontWeight: "800", color: C.text },
  sub: { fontSize: 15, color: C.textSub, textAlign: "center" },
  textButton: { paddingVertical: 8, paddingHorizontal: 4, minHeight: 44, justifyContent: "center" },
  link: { fontSize: 15, fontWeight: "800", color: C.text },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: theme.radii.control,
    backgroundColor: C.fill1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.shadowFloat,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { fontSize: 32, lineHeight: 36, fontWeight: "600", color: onFill(C.fill1) },
  ment: {
    position: "absolute",
    bottom: 112,
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
  mentText: { fontSize: 16, fontWeight: "700", color: C.text },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    backgroundColor: C.shadowSoft,
  },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  primary: { backgroundColor: C.inkStrong, borderRadius: theme.radii.control, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: onFill(C.inkStrong), fontWeight: "700" },
});
