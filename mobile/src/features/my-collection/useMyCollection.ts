// 내 정보 모음 상태 — contracts/my-collection.md MY-1 P4 골격(이중 러너 + 비로그인/계정 전환 정화), Y-O2·Y-O4·Y-O5, C6.
// MY-2: 프로필 수정 화면이 저장하면 emitProfileSaved로 이 머리를 응답값으로 바꾸고 "저장했어요"(Y2-O1).
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
  setStampBookmark,
  type PostReactionPatch,
} from "../local-feed/api";
import { toggleFailText } from "../local-feed/PostMenu";
import {
  fetchMyBookmarks,
  fetchMyPosts,
  fetchMyProfile,
  fetchMyReactions,
  type MyCollectionItem,
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
  saved: "저장했어요",
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
const FETCHERS: Record<CollectionTab, (page: PageArgs, signal?: AbortSignal) => Promise<MyCollectionPage<MyCollectionItem>>> = {
  posts: fetchMyPosts,
  reactions: fetchMyReactions,
  bookmarks: fetchMyBookmarks,
};

/** MY-2 저장 알림: 수정 화면(다른 경로)이 저장 응답을 내 정보 머리로 넘긴다. 같은 계정일 때만 받는다(Y7) */
type ProfileSavedListener = (userId: string, profile: MyProfile) => void;
const profileSavedListeners = new Set<ProfileSavedListener>();
export function emitProfileSaved(userId: string, profile: MyProfile): void {
  for (const l of [...profileSavedListeners]) l(userId, profile);
}

export type ProfileState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; profile: MyProfile };
export type TabState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: MyCollectionItem[]; nextCursor: string | null; more: "idle" | "loading" | "error" };
type Cache = Partial<Record<CollectionTab, TabState>>;
export type Notice = { id: number; text: string; undo: boolean };
type ItemKind = MyCollectionItem["item_kind"];
export type Dim = { id: number; tab: CollectionTab; postId: string; itemKind: ItemKind };
type MenuTarget = { postId: string; session: number };

/** 응답을 못 받았거나 5xx: 서버가 처리했는지 기기 혼자 알 수 없다(C6 예외 #5 결과 불명) */
function resultUnknown(e: unknown): boolean {
  return !(e instanceof ApiCallError) || e.status === 0 || e.status >= 500;
}

function withoutItem(state: TabState | undefined, id: string, kind: ItemKind): TabState | undefined {
  if (state?.kind !== "ready") return state;
  return { ...state, items: state.items.filter((item) => item.id !== id || item.item_kind !== kind) };
}

export function collectionItemKey(item: MyCollectionItem): string {
  return `${item.item_kind}:${item.id}`;
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
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  const session = useRef(0); // 계정 전환·로그아웃마다 올린다. 앞 계정의 늦은 결과·타이머를 버린다
  const inFlight = useRef<CollectionTab | null>(null); // listRunner가 지금 부르는 탭
  const refreshSeq = useRef(0);
  const noticeSeq = useRef(0);
  const dimSeq = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoing = useRef(new Set<string>());
  const stampRemoving = useRef(new Set<string>());

  const undoKey = (tab: CollectionTab, postId: string, kind: ItemKind) => `${tab}:${kind}:${postId}`;

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
    (tab: CollectionTab, postId: string, kind: ItemKind) =>
      setCache((c) => ({ ...c, [tab]: withoutItem(c[tab], postId, kind) })),
    [setCache]
  );

  /** 결과 불명 시 영향받는 수집 탭과 같은 게시물이 캐시된 다른 탭 캐시를 비워 다음 진입 때 서버와 맞춘다 */
  const invalidateTabsWithPost = useCallback(
    (postId: string, exceptTab?: CollectionTab, extraTabs: readonly CollectionTab[] = []) => {
      setCache((c) => {
        let changed = false;
        const next: Cache = { ...c };
        for (const t of TABS) {
          if (t === exceptTab) continue;
          const st = next[t];
          const hasPost = st?.kind === "ready" && st.items.some((p) => p.item_kind === "post" && p.id === postId);
          if ((hasPost || extraTabs.includes(t)) && t in next) {
            delete next[t];
            changed = true;
          }
        }
        return changed ? next : c;
      });
    },
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
      const seen = new Set(cur.items.map(collectionItemKey));
      return {
        ...c,
        [tab]: {
          kind: "ready",
          items: [...cur.items, ...r.value.items.filter((p) => !seen.has(collectionItemKey(p)))],
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
    setMenu(null);
    setRefreshing(false);
    inFlight.current = null;
    undoing.current.clear();
    stampRemoving.current.clear();
    if (!signedIn) return; // 비로그인: /me/* 호출 0번(M-#1)
    void loadProfile();
    void loadFirst("posts", "fresh"); // 처음 탭은 늘 "내 게시물"(Y1)
    return () => {
      session.current += 1;
      profileRunner.cancel();
      listRunner.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, userId]);

  useEffect(() => () => clearTimers(), []);

  const ownerRef = useRef<string | null>(null);
  ownerRef.current = signedIn ? userId : null;
  useEffect(() => {
    const onSaved: ProfileSavedListener = (uid, saved) => {
      if (uid !== ownerRef.current) return; // 앞 계정의 늦은 저장은 버린다
      profileRunner.cancel();
      setProfile({ kind: "ready", profile: saved });
      showNotice(MY_TEXT.saved);
    };
    profileSavedListeners.add(onSaved);
    return () => {
      profileSavedListeners.delete(onSaved);
    };
  }, [profileRunner, showNotice]);

  // ─────────── 캐시 맞추기(Y-O2 [D 보완]) ───────────

  const applyPatch = useCallback(
    (postId: string, patch: PostReactionPatch) => {
      setCache((c) => {
        const next: Cache = { ...c };
        for (const tab of TABS) {
          const st = next[tab];
          if (st?.kind === "ready" && st.items.some((p) => p.item_kind === "post" && p.id === postId)) {
            next[tab] = { ...st, items: st.items.map((p) => (p.item_kind === "post" && p.id === postId ? { ...p, ...patch } : p)) };
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
          for (const tab of TABS) next[tab] = withoutItem(next[tab], postId, "post");
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

  const startDim = (tab: CollectionTab, postId: string, field: Field, itemKind: ItemKind = "post") => {
    const prev = dimRef.current;
    if (dimTimer.current) clearTimeout(dimTimer.current);
    // 복구(undo) 요청이 진행 중인 카드는 목록에서 미리 빼지 않는다(완료 결과로 유지·제거)
    if (prev && undoKey(prev.tab, prev.postId, prev.itemKind) !== undoKey(tab, postId, itemKind)
      && !undoing.current.has(undoKey(prev.tab, prev.postId, prev.itemKind))) {
      removeFromTab(prev.tab, prev.postId, prev.itemKind); // 흐린 카드는 하나만
    }
    const id = ++dimSeq.current;
    setDim({ id, tab, postId, itemKind });
    showNotice(field === "my_reaction" ? MY_TEXT.unliked : MY_TEXT.unbookmarked, { undo: true, ms: UNDO_MS });
    dimTimer.current = setTimeout(() => {
      removeFromTab(tab, postId, itemKind);
      if (dimRef.current?.id === id) setDim(null);
    }, UNDO_MS);
  };

  const menuSession = menu?.session ?? null;
  const menuPostId = menu?.postId ?? null;

  /** B `PostMenu` onChange: 메뉴를 연 계정 세대와 같을 때만 적용한다 */
  const onMenuChange = (postId: string, patch: PostReactionPatch) => {
    if (menuSession === null || menuSession !== session.current) return;
    const tab = activeRef.current;
    const field = COLLECTION_FIELD[tab];
    if (field && patch[field] === false) {
      setMenu(null);
      startDim(tab, postId, field);
    }
    emitPostReaction(postId, patch); // 이 화면(applyPatch)과 다른 피드에 함께 알린다
  };

  const onMenuNotice = (text: string) => {
    if (menuSession === null || menuSession !== session.current) return;
    showNotice(text);
  };

  const closeMenu = () => {
    if (menuSession === null || menuSession !== session.current) return;
    setMenu(null);
  };

  /** B `PostMenu` failText: 메뉴를 연 계정 세대에 한정해 실패 문구와 결과 불명 캐시 수렴을 처리한다 */
  const failText = (kind: "reaction" | "bookmark", e: unknown): string => {
    if (menuSession === null || menuSession !== session.current) return toggleFailText(e);
    const tab = activeRef.current;
    const field = COLLECTION_FIELD[tab];
    const unset = field !== undefined && (kind === "reaction") === (field === "my_reaction");
    if (resultUnknown(e)) {
      const extra: CollectionTab[] = [kind === "reaction" ? "reactions" : "bookmarks"];
      if (unset) void loadFirst(tab, "silent");
      if (menuPostId) invalidateTabsWithPost(menuPostId, tab, extra);
    }
    if (!unset) return toggleFailText(e);
    return kind === "reaction" ? MY_TEXT.unlikeFailed : MY_TEXT.unbookmarkFailed;
  };

  const unbookmarkStamp = async (stampId: string) => {
    const sess = session.current;
    const owner = ownerRef.current;
    const key = `${sess}:${stampId}`;
    if (!owner || stampRemoving.current.has(key)) return;
    stampRemoving.current.add(key);
    try {
      await setStampBookmark(stampId, false);
      if (sess !== session.current || owner !== ownerRef.current) return;
      startDim("bookmarks", stampId, "my_bookmark", "stamp");
    } catch (e) {
      if (sess !== session.current || owner !== ownerRef.current) return;
      showNotice(MY_TEXT.unbookmarkFailed);
      if (resultUnknown(e)) {
        if (activeRef.current === "bookmarks") void loadFirst("bookmarks", "silent");
        else setCache(({ bookmarks, ...rest }) => rest);
      }
    } finally {
      stampRemoving.current.delete(key);
    }
  };

  const undo = async () => {
    const d = dimRef.current;
    if (!d) return;
    const key = undoKey(d.tab, d.postId, d.itemKind);
    if (undoing.current.has(key)) return; // 같은 카드 연타 막기(예외 #3)
    const field = COLLECTION_FIELD[d.tab];
    if (!field) return;
    undoing.current.add(key);
    if (dimTimer.current) clearTimeout(dimTimer.current); // 4초 타이머는 누르는 즉시 끈다
    dimTimer.current = null;
    const sess = session.current;
    const owner = ownerRef.current;
    try {
      if (d.itemKind === "stamp") await setStampBookmark(d.postId, true);
      else if (field === "my_reaction") await setReaction(d.postId, true);
      else await setBookmark(d.postId, true);
      if (sess !== session.current || owner !== ownerRef.current) return;
      if (dimRef.current?.id === d.id) {
        setDim(null);
        hideUndoNotice();
      }
      if (d.itemKind === "post") emitPostReaction(d.postId, { [field]: true }); // 같은 자리 원래 모습
    } catch (e) {
      if (sess !== session.current || owner !== ownerRef.current) return;
      const isCurrentDim = dimRef.current?.id === d.id;
      if (isCurrentDim || !dimRef.current) showNotice(MY_TEXT.undoFailed);
      if (resultUnknown(e)) {
        if (isCurrentDim) setDim(null); // 기기 혼자 정하지 않고 서버 목록으로 맞춘다
        const extra: CollectionTab[] = [field === "my_reaction" ? "reactions" : "bookmarks"];
        if (d.itemKind === "stamp") {
          if (activeRef.current === "bookmarks") void loadFirst("bookmarks", "silent");
          else setCache(({ bookmarks, ...rest }) => rest);
        } else if (d.tab === activeRef.current) {
          void loadFirst(d.tab, "silent");
          invalidateTabsWithPost(d.postId, d.tab, extra);
        } else {
          invalidateTabsWithPost(d.postId, undefined, [d.tab, ...extra]);
        }
      } else if (isCurrentDim) {
        // 확정 실패: 서버는 해제 상태라 안내 뒤 카드를 뺀다
        dimTimer.current = setTimeout(() => {
          removeFromTab(d.tab, d.postId, d.itemKind);
          if (dimRef.current?.id === d.id) setDim(null);
        }, NOTICE_MS);
      } else {
        removeFromTab(d.tab, d.postId, d.itemKind);
      }
    } finally {
      if (sess === session.current) undoing.current.delete(key);
    }
  };

  const tabState = cache[activeTab];
  const menuPost =
    menu && tabState?.kind === "ready"
      ? tabState.items.find((p): p is MyCollectionPost => p.item_kind === "post" && p.id === menu.postId) ?? null
      : null;

  return {
    status,
    userId,
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
    openMenu: (postId: string) => setMenu({ postId, session: session.current }),
    closeMenu,
    onMenuChange,
    onMenuNotice,
    failText,
    unbookmarkStamp: (stampId: string) => void unbookmarkStamp(stampId),
    undo: () => void undo(),
  };
}
