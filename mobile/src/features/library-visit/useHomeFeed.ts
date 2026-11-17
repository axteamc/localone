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
import { formatDistance } from "./format";

type Origin = "current" | "start" | "moved";
type SectionStatus = "loading" | "ready" | "empty" | "error";

/** 인기 도서는 앞 10권만 보인다(W1) */
export const POPULAR_MAX = 10;
const PILL_MAX = 3;

export type NewsPill = { libraryId: number; name: string; caption: string | null };

// TODO(연결): B LOCAL-2-P1 — `FeedPost`는 P2에서 B `local-feed` 모양으로 바꾼다
type FeedPost = { id: string };

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
      setActiveId((cur) => (cur != null && next.pills.some((p) => p.libraryId === cur) ? cur : next.pills[0]?.libraryId ?? null));
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

  useEffect(() => () => popularRunner.cancel(), [popularRunner]);

  const reloadPopular = useCallback(() => {
    if (basisId !== undefined) void loadPopular(basisId);
  }, [basisId, loadPopular]);

  // TODO(VISIT-1b-P2): 게시물(#26)·알약 바꾸기·이어 받기·소식 새로고침
  const selectPill = useCallback((id: number) => setActiveId(id), []);
  const loadMore = useCallback(() => {}, []);
  const reloadNews = useCallback(() => {}, []);

  return {
    popular,
    news: {
      kind: base?.kind ?? "nearby",
      pills: base?.pills ?? [],
      activeId,
      status: "loading",
      posts: [],
      hasMore: false,
    },
    selectPill,
    loadMore,
    reloadPopular,
    reloadNews,
  };
}
