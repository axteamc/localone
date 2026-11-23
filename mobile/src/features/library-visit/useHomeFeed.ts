// 홈 하단 창의 값 (계약서 library-visit.md VISIT-1b C2·W2·W4·W5·W10, P4 골격)
// P1: 인기 도서 한 줄(기준 도서관 고르기·칸별 실패). P2: 자주 가는·가까운 도서관 소식(게시물·알약 바꾸기·이어 받기).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createLatestRunner,
  fetchLibrary,
  fetchRecommendations,
  getFrequentLibraries,
  type Book,
  type LibrarySummary,
} from "./deps";
// LOCAL-2-P1 #26: B의 실제 게시물 API(contracts/local-feed.md LOCAL-2 C2)
import { fetchLibraryPosts, type FeedPage, type FeedPost } from "../local-feed/api";
import { formatDistance } from "./format";
import { mixPopular } from "./popularMix";

type Origin = "current" | "start" | "moved";
type SectionStatus = "loading" | "ready" | "empty" | "error";

/** 인기 도서는 앞 10권만 보인다(W1) */
export const POPULAR_MAX = 10;
const PILL_MAX = 3;
/** 게시물은 20개씩 받는다(W6) */
export const POSTS_PAGE = 20;
const MIN_HOME_POSTS = 6;

export type NewsPill = { libraryId: number; name: string; caption: string | null };

export type HomeFeed = {
  popular: { status: SectionStatus; basisLabel: string | null; books: Book[] };
  news: {
    kind: "frequent" | "nearby";
    pills: NewsPill[];
    activeId: number | null;
    status: SectionStatus;
    posts: FeedPost[];
    hasMore: boolean;
  };
  selectPill(id: number): void;
  loadMore(): void;
  reloadPopular(): void;
  reloadNews(): void;
};

type NewsBase = { kind: "frequent" | "nearby"; pills: NewsPill[] };

const LOADING_NEWS = { status: "loading" as const, posts: [] as FeedPost[], cursor: null };

function fetchExpandedPosts(libraryId: number, signal: AbortSignal) {
  return fetchLibraryPosts(libraryId, { cursor: null, limit: POSTS_PAGE, expand: "region" }, signal);
}

export function useHomeFeed(
  nearby: LibrarySummary[],
  origin: Origin,
  { locationReady, viewSeq, visitRefresh }: { locationReady: boolean; viewSeq: number; visitRefresh: number }
): HomeFeed {
  const popularRunner = useMemo(() => createLatestRunner(), []);
  const [popular, setPopular] = useState<HomeFeed["popular"]>({ status: "loading", basisLabel: null, books: [] });
  const [base, setBase] = useState<NewsBase | null>(null); // null = 아직 후보를 결정하는 중
  // W2: 단골 첫째 → 가까운 도서관 첫째 → 전국(null).
  const [basisId, setBasisId] = useState<number | null>();
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const newsRunner = useMemo(() => createLatestRunner(), []);
  const pagination = useRef<{ cursor: string | null; pending: boolean } | null>(null);
  const manualSelection = useRef<number | null>(null);
  const [news, setNews] = useState<{ status: SectionStatus; posts: FeedPost[]; cursor: string | null }>(LOADING_NEWS);
  const setActive = useCallback((id: number | null) => {
    activeRef.current = id;
    setActiveId(id);
  }, []);
  const startNews = useCallback(() => {
    pagination.current = null;
    setNews(LOADING_NEWS);
  }, []);
  const showPage = useCallback((page: FeedPage) => {
    pagination.current = { cursor: page.next_cursor, pending: false };
    setNews({ status: page.items.length ? "ready" : "empty", posts: page.items, cursor: page.next_cursor });
  }, []);

  // C2: 단골 알약 이름(#11)은 도서관마다 한 번만 묻는다. 실패(없어진 도서관 등)는 null로 기억해 그 알약을 뺀다
  const namesRef = useRef(new Map<number, Promise<string | null>>());
  const nameOf = useCallback((id: number) => {
    let p = namesRef.current.get(id);
    if (!p) {
      p = fetchLibrary(id).then(
        (l) => l.name,
        () => null
      );
      namesRef.current.set(id, p);
    }
    return p;
  }, []);

  const resolveNews = useCallback(
    async (near: LibrarySummary[], from: Origin): Promise<NewsBase> => {
      const frequent = await getFrequentLibraries(PILL_MAX).catch(() => []); // 기기 방문 기록 (W4)
      if (frequent.length > 0) {
        const named = await Promise.all(frequent.map(async (v) => ({ libraryId: v.libraryId, name: await nameOf(v.libraryId) })));
        const pills = named
          .filter((n): n is { libraryId: number; name: string } => n.name != null)
          .map((n) => ({ libraryId: n.libraryId, name: n.name, caption: null }));
        if (pills.length > 0) return { kind: "frequent", pills };
      }
      const pills = near.slice(0, PILL_MAX).map((l) => ({
        // 대신 가까운 도서관 (W5). 위치를 못 쓰면 거리 대신 동 이름(예외 #5)
        libraryId: l.id,
        name: l.name,
        caption: from === "current" && l.distance_m != null ? formatDistance(l.distance_m) : l.area_label,
      }));
      return { kind: "nearby", pills };
    },
    [nameOf]
  );

  // 보는 위치가 바뀌면 다음 후보를 읽는 동안에도 이전 요청을 폐기한다(W8).
  useLayoutEffect(() => {
    newsRunner.cancel();
    setBase(null);
    setActive(null);
    startNews();
  }, [nearby, origin, viewSeq, newsRunner, setActive, startNews]);

  // 홈 복귀 때 방문 기록을 다시 읽되, 같은 단골 순서에서는 현재 선택을 유지한다.
  useEffect(() => {
    if (!locationReady) return;
    let current = true;
    void resolveNews(nearby, origin).then((next) => {
      if (!current) return;
      setBasisId(next.pills[0]?.libraryId ?? null);
      setBase((previous) =>
        previous?.kind === next.kind &&
        previous.pills.length === next.pills.length &&
        previous.pills.every((p, i) => p.libraryId === next.pills[i]?.libraryId)
          ? previous
          : next
      );
    });
    return () => { current = false; };
  }, [nearby, origin, locationReady, viewSeq, visitRefresh, resolveNews]);

  const loadPopular = useCallback(
    async (basisLibraryId: number | null) => {
      setPopular((p) => ({ ...p, status: "loading" }));
      const r = await popularRunner.run((s) => fetchRecommendations(basisLibraryId ?? undefined, s));
      if (r.status === "stale") return;
      if (r.status === "error") {
        setPopular({ status: "error", basisLabel: null, books: [] }); // W10: 인기 칸만
        return;
      }
      setPopular({
        status: r.value.books.length ? "ready" : "empty",
        basisLabel: r.value.basis_label,
        // 상위 10권을 고른 뒤 순서는 섞는다(순위 번호 없음, 같은 시리즈 벌림 — popularMix.ts)
        books: mixPopular(r.value.books.slice(0, POPULAR_MAX)),
      });
    },
    [popularRunner]
  );

  useEffect(() => {
    if (basisId === undefined) return;
    void loadPopular(basisId);
  }, [basisId, loadPopular]);

  useEffect(
    () => () => {
      popularRunner.cancel();
      newsRunner.cancel();
    },
    [popularRunner, newsRunner]
  );

  const reloadPopular = useCallback(() => {
    if (basisId !== undefined) void loadPopular(basisId);
  }, [basisId, loadPopular]);

  // W6·W8: 알약 하나의 게시물 첫 쪽. 알약을 바꾸면 앞 요청은 러너가 버린다(마지막에 누른 도서관만 보임)
  const selectPill = useCallback(
    async (libraryId: number) => {
      setActive(libraryId);
      startNews();
      const r = await newsRunner.run((s) => fetchExpandedPosts(libraryId, s));
      if (r.status === "stale") return;
      if (r.status === "error") {
        setNews({ status: "error", posts: [], cursor: null }); // W10: 소식 칸만
        return;
      }
      showPage(r.value);
    },
    [newsRunner, setActive, showPage, startNews]
  );

  // W5: 자체 글이 있는 첫 후보를 고른 뒤 보충한다. 모두 비면 첫 후보에서만 보충한다.
  const openNearby = useCallback(
    async (pills: NewsPill[]) => {
      setActive(null);
      startNews();
      const r = await newsRunner.run(async (s) => {
        for (const p of pills) {
          const page = await fetchLibraryPosts(p.libraryId, { cursor: null, limit: POSTS_PAGE }, s);
          if (s.aborted) return null;
          if (!page.items.length) continue;
          setActive(p.libraryId);
          return {
            libraryId: p.libraryId,
            page: page.items.length < MIN_HOME_POSTS ? await fetchExpandedPosts(p.libraryId, s) : page,
          };
        }
        const firstId = pills[0]?.libraryId;
        if (firstId === undefined) return { libraryId: null, page: { items: [], next_cursor: null } };
        const page = await fetchExpandedPosts(firstId, s);
        return { libraryId: page.items.length ? firstId : null, page };
      });
      if (r.status === "stale") return;
      if (r.status === "error") {
        setNews({ status: "error", posts: [], cursor: null });
        return;
      }
      if (r.value === null) return;
      setActive(r.value.libraryId);
      showPage(r.value.page);
    },
    [newsRunner, setActive, showPage, startNews]
  );

  useLayoutEffect(() => {
    if (base === null) return;
    manualSelection.current = null;
    if (base.kind === "frequent") void selectPill(base.pills[0]!.libraryId); // W4: 첫째가 켜짐
    else void openNearby(base.pills);
  }, [base, selectPill, openNearby]);

  // 아래로 끝까지 내리면 next_cursor로 이어 받는다(W6). 알약을 바꾸면 이어 받던 것은 버린다
  const loadMore = useCallback(async () => {
    const libraryId = activeRef.current;
    const paging = pagination.current;
    if (paging == null || paging.pending || paging.cursor == null || libraryId == null) return;
    const cursor = paging.cursor;
    paging.pending = true;
    const r = await newsRunner.run((s) => fetchLibraryPosts(libraryId, { cursor, limit: POSTS_PAGE }, s));
    if (pagination.current !== paging) return;
    paging.pending = false;
    if (r.status !== "ok") return; // 카드와 커서를 유지해 다시 요청할 수 있다(W10).
    paging.cursor = r.value.next_cursor;
    setNews((n) => {
      const seen = new Set(n.posts.map((post) => post.id));
      const added = r.value.items.filter((post) => {
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });
      return { status: "ready", posts: [...n.posts, ...added], cursor: r.value.next_cursor };
    });
  }, [newsRunner]);

  const reloadNews = useCallback(() => {
    if (manualSelection.current != null) void selectPill(manualSelection.current);
    else if (base?.kind === "frequent") void selectPill(base.pills[0]!.libraryId);
    else if (base) void openNearby(base.pills);
  }, [base, selectPill, openNearby]);

  const pressPill = useCallback(
    (id: number) => {
      if (id === activeRef.current && news.status === "ready") return;
      manualSelection.current = id;
      void selectPill(id);
    },
    [news.status, selectPill]
  );

  return {
    popular,
    news: {
      kind: base?.kind ?? "nearby",
      pills: base?.pills ?? [],
      activeId,
      status: base === null ? "loading" : news.status,
      posts: news.posts,
      hasMore: news.cursor != null,
    },
    selectPill: pressPill,
    loadMore: () => void loadMore(),
    reloadPopular,
    reloadNews,
  };
}
