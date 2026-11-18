// 내 정보 모음 상태 — contracts/my-collection.md MY-1 P4 골격(이중 러너 + 비로그인/계정 전환 정화), Y-O2·Y-O4·Y-O5, C6.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import {
  ApiCallError,
  emitPostReaction,
  onPostReaction,
  onPostWithdrawn,
  setBookmark,
  setReaction,
  type PostReactionPatch,
} from "../local-feed/api";
import { toggleFailText } from "../local-feed/PostMenu";
import {
  fetchMyBookmarks,
  fetchMyPosts,
  fetchMyProfile,
  fetchMyReactions,
  type MyCollectionPage,
  type MyCollectionPost,
  type MyProfile,
  type PageArgs,
} from "./api";

export type CollectionTab = "posts" | "reactions" | "bookmarks";
export const TABS: readonly CollectionTab[] = ["posts", "reactions", "bookmarks"]; // Y1 순서

/** 화면 문구(C3 잠금·열린 문구) */
export const MY_TEXT = {
  tabs: { posts: "내 게시물", reactions: "좋아요", bookmarks: "북마크" } as Record<CollectionTab, string>,
  login: "로그인",
  loginTitle: "로그인하면 내 정보를 볼 수 있어요",
  loginSub: "내가 올린 게시물과 좋아요·북마크한 게시물을 모아 봐요",
  editProfile: "프로필 수정",
  editSoon: "프로필 수정은 곧 열려요",
  settings: "설정",
  profileFailed: "내 정보를 불러오지 못했어요",
  listFailed: "게시물을 불러오지 못했어요",
  reload: "↻ 새로고침",
  moreLoading: "불러오는 중…",
  moreFailed: "더 불러오지 못했어요",
  end: "모두 봤어요",
  empty: {
    posts: { icon: "✎", title: "아직 올린 게시물이 없어요", sub: "도서관 방문 페이지에서 첫 글을 올려 보세요" },
    reactions: { icon: "♡", title: "아직 좋아요한 게시물이 없어요", sub: "마음에 드는 게시물에 ♡를 누르면 여기 모여요" },
    bookmarks: { icon: "🔖", title: "아직 북마크한 게시물이 없어요", sub: "다시 보고 싶은 게시물을 북마크하면 여기 모여요" },
  } as Record<CollectionTab, { icon: string; title: string; sub: string }>,
  browse: "가까운 도서관 둘러보기",
  unliked: "좋아요를 취소했어요",
  unbookmarked: "북마크를 해제했어요",
  undo: "되돌리기",
  dimmed: "취소함",
  unlikeFailed: "좋아요를 취소하지 못했어요. 다시 해 주세요",
  unbookmarkFailed: "북마크를 해제하지 못했어요. 다시 해 주세요",
  undoFailed: "되돌리지 못했어요",
} as const;

export const UNDO_MS = 4000; // Y-O4 기본값(Claude)
export const NOTICE_MS = 2000;

type Field = "my_reaction" | "my_bookmark";
/** 그 필드가 꺼지면 목록에서 빠지는 수집 탭 */
const COLLECTION_FIELD: Partial<Record<CollectionTab, Field>> = { reactions: "my_reaction", bookmarks: "my_bookmark" };
const FETCHERS: Record<CollectionTab, (page: PageArgs, signal?: AbortSignal) => Promise<MyCollectionPage>> = {
  posts: fetchMyPosts,
  reactions: fetchMyReactions,
  bookmarks: fetchMyBookmarks,
};

export type ProfileState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; profile: MyProfile };
export type TabState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: MyCollectionPost[]; nextCursor: string | null; more: "idle" | "loading" | "error" };
type Cache = Partial<Record<CollectionTab, TabState>>;
export type Notice = { id: number; text: string; undo: boolean };
export type Dim = { tab: CollectionTab; postId: string };

/** 응답을 못 받았거나 5xx: 서버가 처리했는지 기기 혼자 알 수 없다(C6 예외 #5 결과 불명) */
function resultUnknown(e: unknown): boolean {
  return !(e instanceof ApiCallError) || e.status === 0 || e.status >= 500;
}

function withoutPost(state: TabState | undefined, postId: string): TabState | undefined {
  if (state?.kind !== "ready") return state;
  return { ...state, items: state.items.filter((p) => p.id !== postId) };
}

export function useMyCollection() {
  const { status, userId } = useAuth();
  const signedIn = status === "signedIn" && !!userId;
  const profileRunner = useMemo(() => createLatestRunner(), []);
  const listRunner = useMemo(() => createLatestRunner(), []);

  const [profile, setProfile] = useState<ProfileState>({ kind: "loading" });
  const [cache, setCacheState] = useState<Cache>({});
  const cacheRef = useRef<Cache>({});
  const setCache = useCallback((fn: (c: Cache) => Cache) => {
    cacheRef.current = fn(cacheRef.current);
    setCacheState(cacheRef.current);
  }, []);
  const [activeTab, setActiveTabState] = useState<CollectionTab>("posts");
  const activeRef = useRef<CollectionTab>("posts");
  const setActiveTab = (tab: CollectionTab) => {
    activeRef.current = tab;
    setActiveTabState(tab);
  };
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dim, setDimState] = useState<Dim | null>(null);
  const dimRef = useRef<Dim | null>(null);
  const setDim = (d: Dim | null) => {
    dimRef.current = d;
    setDimState(d);
  };
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const session = useRef(0); // 계정 전환·로그아웃마다 올린다. 앞 계정의 늦은 결과·타이머를 버린다
  const inFlight = useRef<CollectionTab | null>(null); // listRunner가 지금 부르는 탭
  const refreshSeq = useRef(0);
  const noticeSeq = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoBusy = useRef(false);

  const clearTimers = () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (dimTimer.current) clearTimeout(dimTimer.current);
    noticeTimer.current = dimTimer.current = null;
  };

  const showNotice = useCallback((text: string, opts: { undo?: boolean; ms?: number } = {}) => {
    const id = ++noticeSeq.current;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ id, text, undo: !!opts.undo });
    noticeTimer.current = setTimeout(() => {
      setNotice((n) => (n?.id === id ? null : n));
    }, opts.ms ?? NOTICE_MS);
  }, []);
  const hideUndoNotice = () => setNotice((n) => (n?.undo ? null : n));

  const removeFromTab = useCallback(
    (tab: CollectionTab, postId: string) => setCache((c) => ({ ...c, [tab]: withoutPost(c[tab], postId) })),
    [setCache]
  );

  // ─────────── 불러오기 ───────────

  const loadProfile = async (keep = false) => {
    const sess = session.current;
    if (!keep) setProfile({ kind: "loading" });
    const r = await profileRunner.run((signal) => fetchMyProfile(signal));
    if (r.status === "stale" || sess !== session.current) return;
    setProfile(r.status === "ok" ? { kind: "ready", profile: r.value } : { kind: "error" });
  };

  /** 첫 페이지. fresh: 스켈레톤부터 / silent: 받을 때까지 지금 카드 유지(당겨서 새로고침·상세 복귀·결과 불명 맞추기) */
  const loadFirst = async (tab: CollectionTab, mode: "fresh" | "silent") => {
    const sess = session.current;
    inFlight.current = tab;
    if (mode === "fresh" || !cacheRef.current[tab]) setCache((c) => ({ ...c, [tab]: { kind: "loading" } }));
    const r = await listRunner.run((signal) => FETCHERS[tab]({ cursor: null }, signal));
    if (sess !== session.current) return;
    if (r.status === "stale") {
      // 다른 탭 요청에 밀려 버려진 첫 조회는 다음에 누를 때 다시 부른다(M-#6)
      if (inFlight.current !== tab && cacheRef.current[tab]?.kind === "loading") {
        setCache((c) => {
          const next = { ...c };
          delete next[tab];
          return next;
        });
      }
      return;
    }
    inFlight.current = null;
    setCache((c) => ({
      ...c,
      [tab]:
        r.status === "ok"
          ? { kind: "ready", items: r.value.items, nextCursor: r.value.next_cursor, more: "idle" }
          : { kind: "error" },
    }));
    // 다시 받은 목록이 기준이다. 그 탭의 흐린 카드·되돌리기는 끝낸다
    if (mode === "silent" && dimRef.current?.tab === tab) {
      if (dimTimer.current) clearTimeout(dimTimer.current);
      setDim(null);
      hideUndoNotice();
    }
  };

  const loadMore = async (tab: CollectionTab) => {
    const st = cacheRef.current[tab];
    if (st?.kind !== "ready" || st.nextCursor === null || st.more === "loading") return;
    const sess = session.current;
    const cursor = st.nextCursor;
    const setMore = (more: "idle" | "loading" | "error") =>
      setCache((c) => {
        const cur = c[tab];
        return cur?.kind === "ready" ? { ...c, [tab]: { ...cur, more } } : c;
      });
    setMore("loading");
    inFlight.current = tab;
    const r = await listRunner.run((signal) => FETCHERS[tab]({ cursor }, signal));
    if (sess !== session.current) return;
    if (r.status === "stale") {
      setCache((c) => {
        const cur = c[tab];
        return cur?.kind === "ready" && cur.more === "loading" ? { ...c, [tab]: { ...cur, more: "idle" } } : c;
      });
      return;
    }
    inFlight.current = null;
    if (r.status === "error") {
      setMore("error"); // 보이던 카드·커서 그대로(예외 #1)
      return;
    }
    setCache((c) => {
      const cur = c[tab];
      if (cur?.kind !== "ready" || cur.nextCursor !== cursor) return c; // 그사이 새로 받은 목록이면 붙이지 않는다
      const seen = new Set(cur.items.map((p) => p.id));
      return {
        ...c,
        [tab]: {
          kind: "ready",
          items: [...cur.items, ...r.value.items.filter((p) => !seen.has(p.id))],
          nextCursor: r.value.next_cursor,
          more: "idle",
        },
      };
    });
  };

  // ─────────── 계정 전환·로그아웃 정화(Y7) ───────────
  // 계정 데이터는 이 훅 상태에만 둔다 → useAuth().userId 변화로 비운다(auth.md AUTH-2 C7: registerSignOutCleanup 불필요)

  useEffect(() => {
    profileRunner.cancel();
    listRunner.cancel();
    session.current += 1;
    clearTimers();
    cacheRef.current = {};
    setCacheState({});
    setProfile({ kind: "loading" });
    setActiveTab("posts");
    setDim(null);
    setNotice(null);
    setMenuFor(null);
    setRefreshing(false);
    inFlight.current = null;
    undoBusy.current = false;
    if (!signedIn) return; // 비로그인: /me/* 호출 0번(M-#1)
    void loadProfile();
    void loadFirst("posts", "fresh"); // 처음 탭은 늘 "내 게시물"(Y1)
    return () => {
      profileRunner.cancel();
      listRunner.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, userId]);

  useEffect(() => () => clearTimers(), []);

  // ─────────── 캐시 맞추기(Y-O2 [D 보완]) ───────────

  const applyPatch = useCallback(
    (postId: string, patch: PostReactionPatch) => {
      setCache((c) => {
        const next: Cache = { ...c };
        for (const tab of TABS) {
          const st = next[tab];
          if (st?.kind === "ready" && st.items.some((p) => p.id === postId)) {
            next[tab] = { ...st, items: st.items.map((p) => (p.id === postId ? { ...p, ...patch } : p)) };
          }
        }
        // 모음이 달라진 수집 탭은 지금 보는 탭이 아니면 버린다(다음에 누를 때 첫 페이지부터)
        if (patch.my_reaction !== undefined && activeRef.current !== "reactions") delete next.reactions;
        if (patch.my_bookmark !== undefined && activeRef.current !== "bookmarks") delete next.bookmarks;
        return next;
      });
    },
    [setCache]
  );

  useEffect(() => onPostReaction(applyPatch), [applyPatch]);
  useEffect(
    () =>
      onPostWithdrawn((postId) =>
        setCache((c) => {
          const next: Cache = { ...c };
          for (const tab of TABS) next[tab] = withoutPost(next[tab], postId);
          return next;
        })
      ),
    [setCache]
  );

  // ─────────── 탭·새로고침·상세 복귀 ───────────

  const selectTab = (tab: CollectionTab) => {
    setActiveTab(tab);
    const st = cacheRef.current[tab];
    if (st?.kind === "ready") return; // 이미 읽은 탭은 재조회 0(Y-O2)
    if (st?.kind === "loading" && inFlight.current === tab) return;
    void loadFirst(tab, "fresh");
  };

  const refresh = async () => {
    if (!signedIn) return;
    const seq = ++refreshSeq.current;
    setRefreshing(true);
    void loadProfile(true);
    await loadFirst(activeRef.current, "silent");
    if (seq === refreshSeq.current) setRefreshing(false);
  };

  // 상세에서 돌아와 화면이 다시 보이면 지금 탭만 조용히 다시 부른다. 첫 포커스는 처음 불러오기와 겹치므로 건너뛴다
  const focusedOnce = useRef(false);
  const focusRef = useRef<() => void>(() => undefined);
  focusRef.current = () => {
    if (!focusedOnce.current) {
      focusedOnce.current = true;
      return;
    }
    if (!signedIn) return;
    const st = cacheRef.current[activeRef.current];
    if (st && st.kind !== "loading") void loadFirst(activeRef.current, "silent");
  };
  useFocusEffect(useCallback(() => focusRef.current(), []));

  // ─────────── 카드 메뉴: 해제 → 흐림 + 되돌리기(Y-O4) ───────────

  const startDim = (tab: CollectionTab, postId: string, field: Field) => {
    const prev = dimRef.current;
    if (dimTimer.current) clearTimeout(dimTimer.current);
    if (prev && !(prev.tab === tab && prev.postId === postId)) removeFromTab(prev.tab, prev.postId); // 흐린 카드는 하나만
    setDim({ tab, postId });
    showNotice(field === "my_reaction" ? MY_TEXT.unliked : MY_TEXT.unbookmarked, { undo: true, ms: UNDO_MS });
    dimTimer.current = setTimeout(() => {
      removeFromTab(tab, postId);
      setDim(null);
    }, UNDO_MS);
  };

  /** B `PostMenu` onChange: 응답이 온 필드만 온다 */
  const onMenuChange = (postId: string, patch: PostReactionPatch) => {
    const tab = activeRef.current;
    const field = COLLECTION_FIELD[tab];
    if (field && patch[field] === false) {
      setMenuFor(null);
      startDim(tab, postId, field);
    }
    emitPostReaction(postId, patch); // 이 화면(applyPatch)과 다른 피드에 함께 알린다
  };

  /** B `PostMenu` failText: 수집 탭의 해제 실패만 MY 문구, 결과 불명이면 지금 탭을 조용히 다시 불러 맞춘다 */
  const failText = (kind: "reaction" | "bookmark", e: unknown): string => {
    const tab = activeRef.current;
    const field = COLLECTION_FIELD[tab];
    const unset = field !== undefined && (kind === "reaction") === (field === "my_reaction");
    if (!unset) return toggleFailText(e);
    if (resultUnknown(e)) void loadFirst(tab, "silent");
    return kind === "reaction" ? MY_TEXT.unlikeFailed : MY_TEXT.unbookmarkFailed;
  };

  const undo = async () => {
    const d = dimRef.current;
    if (!d || undoBusy.current) return; // 연타 막기(예외 #3)
    const field = COLLECTION_FIELD[d.tab];
    if (!field) return;
    undoBusy.current = true;
    if (dimTimer.current) clearTimeout(dimTimer.current); // 4초 타이머는 누르는 즉시 끈다
    dimTimer.current = null;
    const sess = session.current;
    try {
      if (field === "my_reaction") await setReaction(d.postId, true);
      else await setBookmark(d.postId, true);
      if (sess !== session.current) return;
      setDim(null);
      hideUndoNotice();
      emitPostReaction(d.postId, { [field]: true }); // 같은 자리 원래 모습
    } catch (e) {
      if (sess !== session.current) return;
      showNotice(MY_TEXT.undoFailed);
      if (resultUnknown(e)) {
        setDim(null); // 기기 혼자 정하지 않고 서버 목록으로 맞춘다
        if (d.tab === activeRef.current) void loadFirst(d.tab, "silent");
        else
          setCache((c) => {
            const next = { ...c };
            delete next[d.tab];
            return next;
          });
      } else {
        // 확정 실패: 서버는 해제 상태라 안내 뒤 카드를 뺀다
        dimTimer.current = setTimeout(() => {
          removeFromTab(d.tab, d.postId);
          if (dimRef.current?.postId === d.postId) setDim(null);
        }, NOTICE_MS);
      }
    } finally {
      undoBusy.current = false;
    }
  };

  const tabState = cache[activeTab];
  const menuPost =
    menuFor && tabState?.kind === "ready" ? tabState.items.find((p) => p.id === menuFor) ?? null : null;

  return {
    status,
    signedIn,
    profile,
    activeTab,
    tabState,
    refreshing,
    notice,
    dim,
    menuPost,
    selectTab,
    refresh,
    retryProfile: () => void loadProfile(),
    retryTab: () => void loadFirst(activeRef.current, "fresh"),
    loadMore: () => void loadMore(activeRef.current),
    showNotice,
    openMenu: (postId: string) => setMenuFor(postId),
    closeMenu: () => setMenuFor(null),
    onMenuChange,
    failText,
    undo: () => void undo(),
  };
}
