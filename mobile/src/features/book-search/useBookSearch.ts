// 검색·더 내리기·입력 중 추천(book-search.md LIB-1 B3·B7·B8, C2)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLatestRunner } from "../../lib/latest";
import { SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_CHARS } from "../../lib/policy";
import type { Book } from "../../lib/publicApi";
import { searchBooks } from "./__fakes__/publicApi"; // TODO(연결): D LIB-0-P2 — lib/publicApi

export const QUERY_MAX_CHARS = 100; // 06 #7 q 1~100자(S-2)

export type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

/** 검색창 글자를 서버에 보낼 검색어로 바꾼다: 앞뒤 공백 제거, 100자에서 자름(S-1·S-2). */
export function normalizeQuery(input: string): string {
  return input.trim().slice(0, QUERY_MAX_CHARS).trim();
}

/**
 * 검색 상태.
 * - `status`가 "loading"이고 `items`가 있으면 더 내리기 중, "error"이고 `items`가 있으면 더 내리기 실패다.
 * - `source`는 C3 "저장된 정보에서 찾은 결과예요" 표시용으로 더했다(검토 메모 [계약 보완 필요]).
 */
export function useBookSearch(initialQuery?: string): {
  query: string;
  submit(q: string): void;
  items: Book[];
  status: SearchStatus;
  loadMore(): void;
  hasMore: boolean;
  retry(): void;
  source: "naver" | "cache" | null;
} {
  const runner = useMemo(() => createLatestRunner(), []);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Book[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [nextStart, setNextStart] = useState<number | null>(null);
  const [source, setSource] = useState<"naver" | "cache" | null>(null);
  // 같은 요청을 두 번 보내지 않게 하는 표시(S-8, "같은 start 두 번 금지")
  const inflight = useRef<string | null>(null);
  const lastStart = useRef(1);
  const shown = useRef<string | null>(null);

  useEffect(() => () => runner.cancel(), [runner]);

  const fetchPage = useCallback(
    async (q: string, start: number) => {
      const key = `${q}\u0000${start}`;
      if (inflight.current === key) return;
      inflight.current = key;
      lastStart.current = start;
      setStatus("loading");
      if (start === 1) {
        setItems([]);
        setNextStart(null);
        setSource(null);
      }
      const r = await runner.run((signal) => searchBooks(q, start, signal));
      if (r.status === "stale") return; // 늦은 응답은 화면을 바꾸지 않는다(B8)
      inflight.current = null;
      if (r.status === "error") {
        if (start === 1) shown.current = null; // 같은 검색어로 다시 검색할 수 있게
        setStatus("error");
        return;
      }
      const res = r.value;
      setItems((prev) => (start === 1 ? res.items : [...prev, ...res.items]));
      setNextStart(res.next_start);
      setSource(res.source);
      setStatus(start === 1 && res.items.length === 0 ? "empty" : "ready");
    },
    [runner]
  );

  const submit = useCallback(
    (raw: string) => {
      const q = normalizeQuery(raw);
      if (!q) return; // S-1
      // 이미 보이는(또는 받는 중인) 같은 검색어면 다시 부르지 않는다(S-8). 실패했을 때만 다시 부른다.
      if (shown.current === q) return;
      shown.current = q;
      setQuery(q);
      void fetchPage(q, 1);
    },
    [fetchPage]
  );

  const loadMore = useCallback(() => {
    if (status !== "ready" || nextStart === null) return;
    void fetchPage(query, nextStart);
  }, [status, nextStart, query, fetchPage]);

  const retry = useCallback(() => {
    if (status !== "error" || !query) return;
    inflight.current = null;
    void fetchPage(query, lastStart.current); // 같은 검색어·같은 start(S-3)
  }, [status, query, fetchPage]);

  useEffect(() => {
    if (initialQuery) submit(initialQuery);
    // 처음 열 때 한 번만(B1 `?q=`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    query,
    submit,
    items,
    status,
    loadMore,
    hasMore: nextStart !== null,
    retry,
    source,
  };
}

/** 입력 중 추천의 '검색어 3개'(B7). 앞 2권은 '책 2권' 칸이라 뺀다. */
export function suggestionQueries(items: Book[], input: string, limit = 3): string[] {
  const typed = input.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of items.slice(2)) {
    const q = (b.title.split(/\(|:| - /)[0] ?? "").trim(); // 부제 앞까지
    if (!q || q === typed || seen.has(q)) continue;
    seen.add(q);
    out.push(q);
    if (out.length === limit) break;
  }
  return out;
}

/** 입력 중 추천: 2글자 이상, 400ms 동안 안 바뀌면 한 번 부른다(B7). 실패·0건은 숨김(S-12). */
export function useSearchSuggestions(input: string): {
  books: Book[];
  queries: string[];
  visible: boolean;
  cancel(): void;
} {
  const runner = useMemo(() => createLatestRunner(), []);
  const [books, setBooks] = useState<Book[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    const typed = input.trim();
    clearTimer();
    runner.cancel();
    setVisible(false);
    if (typed.length < SUGGEST_MIN_CHARS) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void (async () => {
        const r = await runner.run((signal) => searchBooks(typed, 1, signal));
        if (r.status !== "ok") return; // stale은 화면 그대로, error는 숨김 그대로
        const its = r.value.items;
        setBooks(its.slice(0, 2));
        setQueries(suggestionQueries(its, typed));
        setVisible(its.length > 0);
      })();
    }, SUGGEST_DEBOUNCE_MS);
    return clearTimer;
  }, [input, runner]);

  useEffect(() => () => runner.cancel(), [runner]);

  const cancel = useCallback(() => {
    clearTimer();
    runner.cancel();
    setVisible(false);
  }, [runner]);

  return { books, queries, visible, cancel };
}
