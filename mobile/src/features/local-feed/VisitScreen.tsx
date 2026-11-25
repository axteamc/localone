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
import { GLASS_PRESSED, GLASS_SURFACE } from "../../lib/HorizontalArrows";
import { actionColors, cardSurface, type Theme } from "../../theme";
import { LibraryLookProvider, lookKit, useLibraryLook, useLook } from "./useLibraryLook";
import { FOLD_AT, VisitHeader, VisitHeaderFolded } from "./VisitHeader";
import { AskDefaultCard } from "./AskDefaultCard";
import {
  feedItemKey,
  fetchLibraryFeedItems,
  onStampChanged,
  onStampNotice,
  type FeedItem,
  type ShelfResponse,
} from "./api";
import { Bookshelf } from "./Bookshelf";
import { ComposeChooser } from "./ComposeChooser";
import { LibraryFeed } from "./LibraryFeed";
import { StampButton } from "./StampButton";
import { VisitMenu } from "./VisitMenu";
import { pickVisitMent } from "./visitMent";

const MENT_DELAY_MS = 300; // 전환 끝나고 0.3초 (G3)
const MENT_SHOW_MS = 2500; // 2.5초 뒤 사라짐 (G3)
const NOTICE_MS = 2000; // ⋯ 메뉴 한 줄 안내 2초 (G4)

export const VISIT_TEXT = {
  notFound: "찾을 수 없어요.",
  home: "홈으로",
  libFailed: "도서관 정보를 불러오지 못했어요.",
  libRetry: "↻ 새로고침",
  feedLoading: "이야기를 불러오는 중…",
  feedFailed: "지금은 이 도서관 이야기를 불러올 수 없어요.",
  feedRetry: "새로고침",
  moreFailed: "다음 이야기를 불러오지 못했어요. 다시 내려 보세요.",
  emptyTitle: "아직 게시물이 없어요",
  emptySub: "이 도서관의 첫 글을 올려 보세요",
  emptyLink: "첫 글 올리기 →",
  loginNeeded: "로그인하면 글을 올릴 수 있어요",
  login: "로그인하기",
  close: "닫기",
} as const;

/** 피드 불러오기(VISIT-3부터 #32 혼합 피드). cursor가 있으면 다음 묶음(LOCAL-2 H2·H13) */
export type FeedLoader = (
  libraryId: number,
  signal: AbortSignal,
  cursor?: string | null
) => Promise<{ items: unknown[]; next_cursor?: string | null }>;

const defaultLoadFeed: FeedLoader = (libraryId, signal, cursor) =>
  fetchLibraryFeedItems(libraryId, { cursor: cursor ?? null }, signal);

/** 같은 항목 판별(혼합 피드는 종류+id, 바꿔 끼운 피드는 id) */
const itemKey = (item: unknown): string | undefined =>
  feedItemKey(item as FeedItem) ?? (item as { id?: string }).id;

const END_REACHED_PX = 600; // 바닥에서 이만큼 남으면 다음 묶음
const FAB_SIZE = 52; // C-92 V3-O3: 유리 원 + (책장 넘김 버튼과 같은 유리, 누르는 자리 52)
export const FAB_BOTTOM = 24; // 책장 인라인 전환 후 화면 우하단 고정 위치
const POP_GAP = 8; // + 와 작은 카드 사이
const TOAST_BOTTOM = FAB_BOTTOM + FAB_SIZE + 16; // 한 줄 안내는 + 위에

type LibState =
  | { kind: "loading" }
  | { kind: "ok"; lib: LibraryDetail }
  | { kind: "error" }
  | { kind: "notFound" };

type FeedState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "items"; items: unknown[]; nextCursor: string | null };

export type VisitScreenProps = {
  libraryId: number | null;
  distanceM: number | null;
  loadFeed?: FeedLoader; // 기본: fetchLibraryFeedItems(#32, VISIT-3)
  renderFeed?: (items: unknown[]) => React.ReactNode; // 기본: LibraryFeed(2열 메이슨리)
  more?: (lib: LibraryDetail) => React.ReactNode; // 기본: VisitMenu (시험에서 바꿔 끼움)
  askCard?: (lib: LibraryDetail, close: () => void) => React.ReactNode; // 기본: AskDefaultCard
  loadShelf?: (libraryId: number, signal: AbortSignal) => Promise<ShelfResponse>; // 기본: fetchShelf(#31, VISIT-3)
};

/** VISIT-4-P3: 방문 중인 도서관 룩(V4-8)을 이 화면 아래 조각 전부에 내려 준다 */
export function VisitScreen(props: VisitScreenProps) {
  const look = useLibraryLook(props.libraryId ?? 0);
  return (
    <LibraryLookProvider value={look}>
      <VisitScreenInner {...props} />
    </LibraryLookProvider>
  );
}

function VisitScreenInner({
  libraryId,
  distanceM,
  loadFeed = defaultLoadFeed,
  renderFeed,
  more,
  askCard,
  loadShelf,
}: VisitScreenProps) {
  const { ACT, styles } = useLook(makeStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const { status, userId } = useAuth();
  const [lib, setLib] = useState<LibState>(libraryId === null ? { kind: "notFound" } : { kind: "loading" });
  const [feed, setFeed] = useState<FeedState>({ kind: "loading" });
  const feedRef = useRef<FeedState>(feed);
  feedRef.current = feed;
  const moreCursor = useRef<string | null>(null); // 지금 받는 중이거나 받은 커서(같은 커서 두 번 요청 금지)
  const [folded, setFolded] = useState(false);
  const [ment, setMent] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [loginSheet, setLoginSheet] = useState(false);
  const [chooser, setChooser] = useState(false); // C-92 V3-O3: "+" → 바로 위 작은 카드(게시물/모임)
  // 한 줄 안내. action이 있으면 오른쪽에 글자 버튼(VISIT-4 V4-O1 "피드에도 남기기")
  const [notice, setNotice] = useState<{ text: string; action?: { label: string; run(): void } } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [libRunner, feedRunner]);

  const showNotice = useCallback((text: string, ms: number = NOTICE_MS, action?: { label: string; run(): void }) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, action });
    noticeTimer.current = setTimeout(() => alive.current && setNotice(null), ms);
  }, []);
  const showText = useCallback((text: string) => showNotice(text), [showNotice]);

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
      moreCursor.current = null;
      setFeed({ kind: "loading" });
      const res = await feedRunner.run((signal) => loadFeed(id, signal, null));
      if (res.status === "stale") return;
      if (res.status === "error") setFeed({ kind: "error" });
      else
        setFeed(
          res.value.items.length
            ? { kind: "items", items: res.value.items, nextCursor: res.value.next_cursor ?? null }
            : { kind: "empty" }
        );
    },
    [feedRunner, loadFeed]
  );

  // 다른 화면(글쓰기·글 상세)에서 돌아오면 첫 묶음을 조용히 다시 받는다(시연 전 개선 S1 ③).
  // 보이던 글은 그대로 두고, 성공하면 바꾼다. 실패하면 보이던 글을 지우지 않는다.
  const refreshFeed = useCallback(
    async (id: number) => {
      const res = await feedRunner.run((signal) => loadFeed(id, signal, null));
      if (res.status !== "ok") return;
      moreCursor.current = null;
      setFeed(
        res.value.items.length
          ? { kind: "items", items: res.value.items, nextCursor: res.value.next_cursor ?? null }
          : { kind: "empty" }
      );
    },
    [feedRunner, loadFeed]
  );

  // 처음 보일 때는 아래 "들어올 때" 효과가 받으므로, 한 번 가려졌다가(blur) 다시 보일 때(focus)만 다시 받는다
  useEffect(() => {
    if (libraryId === null) return;
    const nav = navigation as unknown as { addListener?: (e: string, cb: () => void) => () => void };
    let hidden = false;
    const offBlur = nav.addListener?.("blur", () => {
      hidden = true;
    });
    const offFocus = nav.addListener?.("focus", () => {
      if (!hidden) return;
      hidden = false;
      void refreshFeed(libraryId);
    });
    return () => {
      offBlur?.();
      offFocus?.();
    };
  }, [navigation, libraryId, refreshFeed]);

  // 스크롤 끝: 다음 묶음을 이어 붙인다. 같은 커서는 한 번만(H13 중복 호출 방지)
  const loadMore = useCallback(async () => {
    const current = feedRef.current;
    if (libraryId === null || current.kind !== "items" || current.nextCursor === null) return;
    const cursor = current.nextCursor;
    if (moreCursor.current === cursor) return;
    moreCursor.current = cursor;
    const res = await feedRunner.run((signal) => loadFeed(libraryId, signal, cursor));
    if (res.status === "stale") return;
    if (res.status === "error") {
      moreCursor.current = null; // 다음 스크롤에서 다시 시도
      showNotice(VISIT_TEXT.moreFailed); // 말없이 멈추지 않게(사후 검토 ①-4)
      return;
    }
    setFeed((prev) => {
      if (prev.kind !== "items" || prev.nextCursor !== cursor) return prev;
      const seen = new Set(prev.items.map(itemKey));
      const added = res.value.items.filter((p) => !seen.has(itemKey(p)));
      return { kind: "items", items: [...prev.items, ...added], nextCursor: res.value.next_cursor ?? null };
    });
  }, [feedRunner, libraryId, loadFeed, showNotice]);

  // VISIT-4: 지금 보는 도서관의 스탬프 안내만 받는다
  useEffect(
    () =>
      onStampNotice((n) => {
        if (n.libraryId === libraryId) showNotice(n.text, n.ms, n.action);
      }),
    [libraryId, showNotice]
  );

  // 계정이 바뀌면 앞 사용자의 안내(“피드에도 남기기”)를 남기지 않는다
  useEffect(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }, [userId, status]);

  // VISIT-4 V4-O1·V4-O2: 내 스탬프 공개 여부가 바뀌면 진행 중인 #32 조회·다음 쪽을 무효화하고,
  // 비공개면 그 카드를 바로 뺀 뒤 #32로 조용히 다시 받아 정렬·커서를 따른다(실패하면 보이던 피드 유지, 뺀 카드는 복원 안 함)
  useEffect(
    () =>
      onStampChanged((change) => {
        if (libraryId === null || change.libraryId !== libraryId) return;
        if (status !== "signedIn" || change.userId !== userId) return;
        feedRunner.cancel();
        moreCursor.current = null;
        if (change.visibility === "private") {
          const key = `stamp:${change.stampId}`;
          setFeed((prev) => {
            if (prev.kind !== "items") return prev;
            const items = prev.items.filter((p) => itemKey(p) !== key);
            return items.length ? { ...prev, items } : { kind: "empty" };
          });
        }
        void refreshFeed(libraryId);
      }),
    [libraryId, status, userId, feedRunner, refreshFeed]
  );

  // 들어올 때: #11 → (404가 아니면) 방문 한 번 기록 → 멘트. 피드는 따로.
  useEffect(() => {
    backing.current = false;
    foldedRef.current = false;
    setFolded(false);
    libRunner.cancel();
    feedRunner.cancel();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
      noticeTimer.current = null;
    }
    setNotice(null);
    setMent(null);
    setAsking(false);
    setLoginSheet(false);
    setChooser(false);
    if (libraryId === null) {
      setLib({ kind: "notFound" });
      setFeed({ kind: "empty" }); // 없는 도서관: 피드를 부르지 않는다
      return;
    }
    let current = true;
    void loadFeedOnly(libraryId);
    void (async () => {
      const result = await loadLibrary(libraryId);
      if (result === null || result === "notFound" || !current) return; // 늦은 응답·없는 도서관은 기록하지 않음
      const visit = await recordVisit(libraryId);
      const isDefault = (await getDefaultLibrary()) === libraryId;
      if (!current || !alive.current || typeof result !== "object") return; // #11 실패 시 가짜 이름을 지어내지 않고 멘트·질문 카드 생략
      const picked = pickVisitMent(visit, result.name, isDefault, visit.record.lastVisitedOn);
      if (picked?.kind === "ment") showMent(picked.text);
      else if (picked?.kind === "ask") setAsking(true);
    })();
    return () => {
      current = false;
    };
  }, [libraryId, libRunner, feedRunner, loadFeed, loadLibrary, loadFeedOnly, showMent]);

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

  // CLUB-1 K1-O1: 고르기 창에서 "모임 만들기" → 만들기 화면. 로그인 확인은 고른 뒤(방명록과 같은 순서)
  const openClub = () => {
    setChooser(false);
    if (status !== "signedIn") {
      setLoginSheet(true);
      return;
    }
    router.push({ pathname: "/clubs/new", params: { libraryId: String(libraryId) } });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const y = contentOffset.y;
    if (layoutMeasurement && contentSize && y + layoutMeasurement.height >= contentSize.height - END_REACHED_PX) {
      void loadMore();
    }
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
  const moreNode =
    lib.kind === "ok" ? (
      more ? more(lib.lib) : <VisitMenu library={lib.lib} onNotice={showText} />
    ) : (
      <View style={styles.moreSpace} />
    );
  const renderAsk =
    askCard ??
    ((l: LibraryDetail, close: () => void) => (
      <AskDefaultCard
        libraryId={l.id}
        name={l.name}
        onDone={(yes) => {
          close();
          if (yes) showNotice(`앱을 켜면 ${l.name}부터 열어요`);
        }}
      />
    ));

  const shelfNode =
    libraryId !== null ? (
      <Bookshelf
        libraryId={libraryId}
        load={loadShelf}
        onOpenBook={(isbn13) => router.push({ pathname: "/books/[isbn13]", params: { isbn13 } })}
        onWriteRecord={() => router.push("/reading/new")}
      />
    ) : null;
  const shelfInsideFeed = feed.kind === "items" && !renderFeed;

  return (
    <View style={styles.screen} testID="visit-screen">
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
            folded={folded && lib.kind === "ok"}
            stamp={libraryId !== null ? <StampButton libraryId={libraryId} /> : null}
          />
        )}
        <View style={[styles.feed, feed.kind === "items" && styles.feedItems]} testID="visit-feed">
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
            renderFeed?.(feed.items) ?? (
              <LibraryFeed
                items={feed.items as FeedItem[]}
                onNotice={showText}
                onReload={() => libraryId !== null && void refreshFeed(libraryId)}
                inlineSlot={shelfNode}
              />
            )
          )}
          {!shelfInsideFeed ? shelfNode : null}
        </View>
      </ScrollView>

      {folded && lib.kind === "ok" ? <VisitHeaderFolded name={name} onBack={goBack} more={moreNode} /> : null}

      <ComposeChooser
        visible={chooser}
        bottom={FAB_BOTTOM + FAB_SIZE + POP_GAP}
        onClose={() => setChooser(false)}
        onPost={() => {
          setChooser(false);
          openCompose();
        }}
        onClub={openClub}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="글쓰기"
        accessibilityState={{ expanded: chooser }}
        onPress={() => setChooser((v) => !v)}
        testID="visit-fab"
        style={({ pressed }) => [styles.fab, pressed && GLASS_PRESSED]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {ment ? (
        <View style={styles.ment} pointerEvents="none" testID="visit-ment" accessibilityLiveRegion="polite">
          <Text style={styles.mentText}>{ment}</Text>
        </View>
      ) : null}

      {asking && lib.kind === "ok" ? renderAsk(lib.lib, () => setAsking(false)) : null}

      {notice ? (
        <View
          style={[styles.ment, notice.action && styles.noticeRow]}
          pointerEvents={notice.action ? "box-none" : "none"}
          testID="visit-notice"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.mentText}>{notice.text}</Text>
          {notice.action ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const run = notice.action!.run;
                if (noticeTimer.current) clearTimeout(noticeTimer.current);
                setNotice(null);
                run();
              }}
              style={styles.noticeAction}
            >
              <Text style={styles.noticeActionText}>{notice.action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}


      {loginSheet ? (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet} accessibilityRole="alert" testID="visit-login-sheet">
            <Text style={styles.sheetTitle}>{VISIT_TEXT.loginNeeded}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoginSheet(false);
                router.push({ pathname: "/login" });
              }}
              style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
            >
              <Text style={styles.primaryText}>{VISIT_TEXT.login}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoginSheet(false)}
              style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{VISIT_TEXT.close}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T, ACT, panel } = lookKit(theme);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: panel.backgroundColor },
  content: { paddingBottom: FAB_BOTTOM + FAB_SIZE + 28, minHeight: "100%" },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 6 },
  libError: { minHeight: 115, paddingHorizontal: 16, justifyContent: "flex-end", gap: 4 },
  backText: {
    fontSize: 30,
    fontWeight: "500",
    color: C.inkStrong,
    textShadowColor: C.shadowSoft,
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  moreSpace: { width: 44 },
  feed: { flexGrow: 1, minHeight: 360, justifyContent: "center", paddingHorizontal: 12, paddingTop: 12 },
  feedItems: { justifyContent: "flex-start" },
  pill: {
    alignSelf: "center",
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: { fontSize: 14, color: C.textSub },
  emptyTitle: { ...T.title, textAlign: "center" },
  emptySub: { fontSize: 14, color: C.textSub, textAlign: "center" },
  emptyLink: { fontSize: 15, fontWeight: "500", color: C.inkStrong },
  sub: { fontSize: 14, color: C.textSub, textAlign: "center" },
  textButton: { paddingVertical: 8, paddingHorizontal: 4, minHeight: 44, justifyContent: "center" },
  link: { fontSize: 15, fontWeight: "500", color: C.inkStrong },
  fab: {
    ...GLASS_SURFACE,
    position: "absolute",
    right: 16,
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  fabText: { color: C.inkStrong, fontSize: 28, lineHeight: 30, fontWeight: "400", marginTop: -2 },
  ment: {
    ...cardSurface(theme, { onPanel: true }),
    position: "absolute",
    bottom: TOAST_BOTTOM,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mentText: { fontSize: 16, fontWeight: "500", color: C.text },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  noticeAction: { minHeight: 44, justifyContent: "center" },
  noticeActionText: { fontSize: 15, fontWeight: "500", color: C.inkStrong, textDecorationLine: "underline" },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    backgroundColor: C.shadowDeep,
  },
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
  primary: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "500" },
  });
};
