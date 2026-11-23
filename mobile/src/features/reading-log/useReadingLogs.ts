// READ-2-P1 책장 목록·도서관 거르기·기초 통계 (reading-log.md READ-2 C2·C6·P4)
// - 전체 책장: READ-1 `shelfStore`(owner 확인, 로그아웃 때 비움)를 그대로 쓴다.
// - 한 도서관 책장(filter.libraryId): `#41 ?library_id=`를 최신 응답만 받는 러너로 부른다(C6 연타 이름표).
// - 통계(#46): owner가 바뀌면 비우고 늦은 응답은 버린다(C6 계정 바뀜). 탭으로 돌아오면 다시 받는다(쓰기·지우기 뒤 R2-O3 재적용).
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { fetchReadingLogs, fetchReadingStats, shelfStore, type ReadingLog, type ReadingStats } from "./api";

export type ReadingLogsStatus = "loading" | "ready" | "empty" | "error";

type LibShelf = { owner: string; libraryId: number; items: ReadingLog[] | null; nextCursor: string | null; failed: boolean };
type StatsSlot = { owner: string; stats: ReadingStats | null; failed: boolean };

export function useReadingLogs(): {
  filter: { libraryId: number | null };
  setFilter(libraryId: number | null): void;
  items: ReadingLog[];
  status: ReadingLogsStatus;
  hasMore: boolean;
  loadMore(): void;
  stats: ReadingStats | null;
  reload(): void;
  /** 통계만 실패(숫자 줄 자리에 실패 문구 + 새로고침, 책장은 그대로 — 예외 #1) */
  statsFailed: boolean;
  /** 다음 묶음을 받는 중(책장 아래 작은 기다림 표시) */
  moreLoading: boolean;
} {
  const navigation = useNavigation();
  const { status: authStatus, userId } = useAuth();
  const owner = authStatus === "signedIn" && userId ? userId : null;
  const shelf = useSyncExternalStore(shelfStore.subscribe, shelfStore.get, shelfStore.get);

  // ── 거르기: 계정이 바뀌면 전체로 돌아간다 ──
  const [filterState, setFilterState] = useState<{ owner: string | null; libraryId: number | null }>({ owner: null, libraryId: null });
  const libraryId = filterState.owner === owner ? filterState.libraryId : null;
  const setFilter = useCallback((id: number | null) => setFilterState({ owner, libraryId: id }), [owner]);

  // ── 전체 책장(READ-1 그대로) ──
  const [allLoading, setAllLoading] = useState(false);
  const [allFailed, setAllFailed] = useState(false);
  const [allTick, setAllTick] = useState(0);
  const [moreLoading, setMoreLoading] = useState(false);
  const genRef = useRef(0);
  const moreCtrlRef = useRef<AbortController | null>(null);
  const loadingCursorRef = useRef<string | null>(null);

  useEffect(() => {
    genRef.current += 1;
    moreCtrlRef.current?.abort();
    moreCtrlRef.current = null;
    loadingCursorRef.current = null;
    setMoreLoading(false);
    if (!owner) {
      setAllFailed(false);
      setAllLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setAllLoading(true);
    setAllFailed(false);
    fetchReadingLogs({ cursor: null }, ctrl.signal)
      .then((page) => {
        if (!ctrl.signal.aborted) shelfStore.setPage(owner, page, false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAllFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setAllLoading(false);
      });
    return () => {
      ctrl.abort();
      moreCtrlRef.current?.abort();
    };
  }, [owner, allTick]);

  // ── 한 도서관 책장: 마지막으로 연 도서관 응답만(러너 stale = 버림) ──
  const runnerRef = useRef(createLatestRunner());
  const [lib, setLib] = useState<LibShelf | null>(null);
  const [libTick, setLibTick] = useState(0);

  useEffect(() => {
    const runner = runnerRef.current;
    genRef.current += 1;
    if (!owner || libraryId === null) {
      runner.cancel();
      setLib(null);
      return;
    }
    setLib({ owner, libraryId, items: null, nextCursor: null, failed: false });
    void runner.run((signal) => fetchReadingLogs({ libraryId, cursor: null }, signal)).then((result) => {
      if (result.status === "stale") return; // C6 연타(이름표): 늦게 온 앞 도서관 응답은 버린다
      if (result.status === "error") {
        setLib({ owner, libraryId, items: null, nextCursor: null, failed: true });
        return;
      }
      setLib({ owner, libraryId, items: result.value.items, nextCursor: result.value.next_cursor, failed: false });
    });
  }, [owner, libraryId, libTick]);

  useEffect(() => () => runnerRef.current.cancel(), []);

  // ── 통계(#46) ──
  const [statsSlot, setStatsSlot] = useState<StatsSlot | null>(null);
  const [statsTick, setStatsTick] = useState(0);
  const statsSettledRef = useRef(false);

  useEffect(() => {
    if (!owner) {
      statsSettledRef.current = false;
      setStatsSlot(null);
      return;
    }
    const ctrl = new AbortController();
    // 다시 받는 동안 같은 계정의 숫자는 그대로 둔다(깜빡임 없음). 다른 계정 것은 바로 비운다
    setStatsSlot((prev) => (prev && prev.owner === owner && prev.stats ? { ...prev, failed: false } : { owner, stats: null, failed: false }));
    fetchReadingStats(ctrl.signal)
      .then((stats) => {
        if (ctrl.signal.aborted) return; // 로그아웃·계정 전환 뒤 늦은 응답(C6)
        setStatsSlot({ owner, stats, failed: false });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setStatsSlot({ owner, stats: null, failed: true });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) statsSettledRef.current = true;
      });
    return () => ctrl.abort();
  }, [owner, statsTick]);

  // 탭으로 돌아오면(쓰기·지우기 뒤) 숫자와 도서관 순서를 다시 받는다. 첫 응답 전의 focus는 무시
  useEffect(
    () =>
      navigation.addListener("focus", () => {
        if (statsSettledRef.current) setStatsTick((n) => n + 1);
      }),
    [navigation]
  );

  const stats = owner && statsSlot?.owner === owner ? statsSlot.stats : null;
  const statsFailed = Boolean(owner && statsSlot?.owner === owner && statsSlot.failed);

  // ── 보이는 목록 ──
  const allItems = owner && shelf.owner === owner ? shelf.items : null;
  const libShelf = owner && libraryId !== null && lib?.owner === owner && lib.libraryId === libraryId ? lib : null;

  let items: ReadingLog[];
  let status: ReadingLogsStatus;
  let hasMore: boolean;
  if (libraryId !== null) {
    items = libShelf?.items ?? [];
    status = libShelf?.failed ? "error" : !libShelf || libShelf.items === null ? "loading" : items.length === 0 ? "empty" : "ready";
    hasMore = Boolean(libShelf?.nextCursor);
  } else {
    items = allItems ?? [];
    status = allFailed ? "error" : allItems === null || (allLoading && items.length === 0) ? "loading" : items.length === 0 ? "empty" : "ready";
    hasMore = Boolean(allItems !== null && shelf.nextCursor);
  }

  const loadMore = () => {
    if (!owner || moreLoading) return;
    const cursor = libraryId !== null ? libShelf?.nextCursor ?? null : shelf.owner === owner ? shelf.nextCursor : null;
    if (!cursor || loadingCursorRef.current === cursor) return;
    const reqGen = genRef.current;
    const reqOwner = owner;
    const reqLib = libraryId;
    const ctrl = new AbortController();
    moreCtrlRef.current = ctrl;
    loadingCursorRef.current = cursor;
    setMoreLoading(true);
    fetchReadingLogs(reqLib !== null ? { libraryId: reqLib, cursor } : { cursor }, ctrl.signal)
      .then((page) => {
        if (ctrl.signal.aborted || genRef.current !== reqGen) return;
        if (reqLib === null) {
          shelfStore.setPage(reqOwner, page, true);
          return;
        }
        setLib((prev) => {
          if (!prev || prev.owner !== reqOwner || prev.libraryId !== reqLib || prev.nextCursor !== cursor) return prev;
          const seen = new Set((prev.items ?? []).map((l) => l.id));
          return { ...prev, items: [...(prev.items ?? []), ...page.items.filter((l) => !seen.has(l.id))], nextCursor: page.next_cursor };
        });
      })
      .catch(() => undefined) // 다음 묶음 실패는 다음 스크롤 때 다시 한다
      .finally(() => {
        if (genRef.current === reqGen) {
          loadingCursorRef.current = null;
          setMoreLoading(false);
        }
      });
  };

  /** 실패한 것만 다시 받는다: 숫자 줄 새로고침은 #46만, 책장 다시 해 보기는 그 책장 #41만(+ 실패한 숫자) */
  const reload = useCallback(() => {
    if (statsFailed) setStatsTick((n) => n + 1);
    if (libraryId !== null) {
      if (libShelf?.failed) setLibTick((n) => n + 1);
    } else if (allFailed) {
      setAllTick((n) => n + 1);
    }
  }, [statsFailed, libraryId, libShelf?.failed, allFailed]);

  return { filter: { libraryId }, setFilter, items, status, hasMore, loadMore, stats, reload, statsFailed, moreLoading };
}
