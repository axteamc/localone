// 홈 하단 창의 값 (계약서 library-visit.md VISIT-1b C2·W2·W4·W5·W10, P4 골격)
// P1: 인기 도서 한 줄(기준 도서관 고르기·칸별 실패). P2: 자주 가는·가까운 도서관 소식(게시물·알약 바꾸기·이어 받기).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLatestRunner,
  fetchLibrary,
  fetchRecommendations,
  getFrequentLibraries,
  type Book,
  type LibrarySummary,
} from "./deps";
// LOCAL-2-P1 #26: B의 실제 게시물 API(contracts/local-feed.md LOCAL-2 C2)
import { fetchLibraryPosts, type FeedPost } from "../local-feed/api";
import { formatDistance } from "./format";

type Origin = "current" | "start" | "moved";
type SectionStatus = "loading" | "ready" | "empty" | "error";

/** 인기 도서는 앞 10권만 보인다(W1) */
export const POPULAR_MAX = 10;
const PILL_MAX = 3;
/** 게시물은 20개씩 받는다(W6) */
export const POSTS_PAGE = 20;

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

export function useHomeFeed(nearby: LibrarySummary[], origin: Origin): HomeFeed {
  const popularRunner = useMemo(() => createLatestRunner(), []);
  const [popular, setPopular] = useState<HomeFeed["popular"]>({ status: "loading", basisLabel: null, books: [] });
  const [base, setBase] = useState<NewsBase | null>(null); // null = 아직 방문 기록을 읽는 중
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const newsRunner = useMemo(() => createLatestRunner(), []);
  const [news, setNews] = useState<{ status: SectionStatus; posts: FeedPost[]; cursor: string | null }>({
    status: "loading",
    posts: [],
    cursor: null,
  });
  const setActive = useCallback((id: number | null) => {
    activeRef.current = id;
    setActiveId(id);
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

  // 주변 도서관·보는 위치가 바뀌면 알약을 다시 고른다. 늦게 끝난 앞 계산은 버린다
  const resolveSeq = useRef(0);
  useEffect(() => {
    const mine = ++resolveSeq.current;
    void resolveNews(nearby, origin).then((next) => {
      if (mine !== resolveSeq.current) return;
      setBase(next);
    });
  }, [nearby, origin, resolveNews]);

  // W2: 인기 도서 기준 = 단골 첫째 → 가까운 도서관 첫째 → 전국(null). 방문 기록을 읽기 전에는 묻지 않는다
  const basisId: number | null | undefined = base === null ? undefined : base.pills[0]?.libraryId ?? null;

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
        books: r.value.books.slice(0, POPULAR_MAX),
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
      setNews({ status: "loading", posts: [], cursor: null });
      const r = await newsRunner.run((s) => fetchLibraryPosts(libraryId, { cursor: null, limit: POSTS_PAGE }, s));
      if (r.status === "stale") return;
      if (r.status === "error") {
        setNews({ status: "error", posts: [], cursor: null }); // W10: 소식 칸만
        return;
      }
      setNews({ status: r.value.items.length ? "ready" : "empty", posts: r.value.items, cursor: r.value.next_cursor });
    },
    [newsRunner, setActive]
  );

  // W5·결정 3: 가까운 도서관은 앞에서부터 게시물이 있는 곳을 켠다. 셋 다 없으면 알약은 그대로, 켜진 알약 없이 예외 #2-c
  const openNearby = useCallback(
    async (pills: NewsPill[]) => {
      setNews({ status: "loading", posts: [], cursor: null });
      const r = await newsRunner.run(async (s) => {
        for (const p of pills) {
          const page = await fetchLibraryPosts(p.libraryId, { cursor: null, limit: POSTS_PAGE }, s);
          if (page.items.length > 0) return { libraryId: p.libraryId as number | null, page };
        }
        return { libraryId: null, page: { items: [] as FeedPost[], next_cursor: null } };
      });
      if (r.status === "stale") return;
      if (r.status === "error") {
        setActive(pills[0]?.libraryId ?? null);
        setNews({ status: "error", posts: [], cursor: null });
        return;
      }
      setActive(r.value.libraryId);
      const { items, next_cursor } = r.value.page;
      setNews({ status: items.length ? "ready" : "empty", posts: items, cursor: next_cursor });
    },
    [newsRunner, setActive]
  );

  // 알약 목록이 정해지거나 바뀌면 소식을 연다. 켜진 알약이 그대로 남아 있으면 다시 부르지 않는다
  const baseKindRef = useRef<NewsBase["kind"] | null>(null);
  useEffect(() => {
    if (base === null) return;
    const sameKind = baseKindRef.current === base.kind;
    baseKindRef.current = base.kind;
    const cur = activeRef.current;
    if (sameKind && cur != null && base.pills.some((p) => p.libraryId === cur)) return;
    if (base.kind === "frequent") void selectPill(base.pills[0]!.libraryId); // W4: 첫째가 켜짐
    else void openNearby(base.pills);
  }, [base, selectPill, openNearby]);

  // 아래로 끝까지 내리면 next_cursor로 이어 받는다(W6). 알약을 바꾸면 이어 받던 것은 버린다
  const loadingMore = useRef(false);
  const loadMore = useCallback(async () => {
    const libraryId = activeRef.current;
    const cursor = news.cursor;
    if (news.status !== "ready" || cursor == null || libraryId == null || loadingMore.current) return;
    loadingMore.current = true;
    const r = await newsRunner.run((s) => fetchLibraryPosts(libraryId, { cursor, limit: POSTS_PAGE }, s));
    loadingMore.current = false;
    if (r.status !== "ok" || activeRef.current !== libraryId) return; // 이어 받기 실패는 보던 게시물을 지우지 않는다
    setNews((n) => ({ status: "ready", posts: [...n.posts, ...r.value.items], cursor: r.value.next_cursor }));
  }, [news.cursor, news.status, newsRunner]);

  const reloadNews = useCallback(() => {
    const cur = activeRef.current;
    if (cur != null) void selectPill(cur);
    else if (base) void openNearby(base.pills);
  }, [base, selectPill, openNearby]);

  const pressPill = useCallback(
    (id: number) => {
      if (id === activeRef.current && news.status === "ready") return;
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
