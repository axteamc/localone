// 책 상세의 도서관 소장·대출 가능 조회(book-search.md LIB-2 A1·A3·A7·A10, V-1·V-4·V-6·V-9·V-10)
// 상세(`/books/[isbn13]`)에서만 부른다. 검색 결과 목록은 부르지 않는다(A10).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLatestRunner } from "../../lib/latest";
import { locate, type LocateResult } from "../../lib/platform";
import { NEARBY_DEFAULT_RADIUS_KM } from "../../lib/policy";
import {
  ApiCallError,
  fetchAvailabilityNearby,
  type AvailabilityItem,
  type AvailabilityResponse,
} from "../../lib/publicApi";

export const AVAILABILITY_LIMITED = "지금은 조회가 많아요. 잠시 뒤 다시 시도해 주세요."; // V-4
export const AVAILABILITY_FAILED = "지금은 도서관 정보를 불러오지 못했어요. 다시 시도해 주세요."; // V-9

export type AvailabilityStatus = "locating" | "loading" | "ready" | "empty" | "error" | "need_region";

// TODO(연결): D(AUTH-2) — 로그인했으면 내 설정 반경. 그 전까지 3(A1).
const RADIUS_KM = NEARBY_DEFAULT_RADIUS_KM;

class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

type Outcome = { kind: "need_region" } | { kind: "data"; res: AvailabilityResponse };

/** 소장 `yes`가 한 곳도 없으면 빈 결과(V-2 0곳, V-3 전부 no·unknown). */
function statusOf(items: AvailabilityItem[]): AvailabilityStatus {
  return items.some((i) => i.holding === "yes") ? "ready" : "empty";
}

function errorMessageOf(e: unknown): string {
  return e instanceof ApiCallError && e.status === 429 ? AVAILABILITY_LIMITED : AVAILABILITY_FAILED;
}

export function useAvailability(isbn13: string): {
  scope: "nearby" | "city";
  items: AvailabilityItem[];
  status: AvailabilityStatus;
  checkedAt: string | null;
  searchCity(dtlRegion?: string): void;
  retry(): void;
  chooseRegion(code: string): void;
  selectedRegionLabel?: string | null;
  errorMessage?: string | null;
  reloadNearby?: () => void;
} {
  const runner = useMemo(() => createLatestRunner(), []);
  const [scope, setScope] = useState<"nearby" | "city">("nearby");
  const [items, setItems] = useState<AvailabilityItem[]>([]);
  const [status, setStatus] = useState<AvailabilityStatus>("locating");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 위치는 이 화면 기억에만 둔다. 기기에 저장하지 않는다(A6, NFR-05).
  const lastLoc = useRef<Extract<LocateResult, { ok: true }> | null>(null);

  const apply = useCallback((res: AvailabilityResponse) => {
    setItems(res.items);
    setCheckedAt(res.checked_at);
    setErrorMessage(null);
    setStatus(statusOf(res.items));
  }, []);

  const fail = useCallback((e: unknown) => {
    setErrorMessage(errorMessageOf(e));
    setStatus("error");
  }, []);

  /** 위치를 다시 잡고 내 주변을 조회한다. */
  const loadNearby = useCallback(async () => {
    setScope("nearby");
    setStatus("locating");
    setErrorMessage(null);
    const r = await runner.run<Outcome>(async (sig) => {
      const loc = await locate(sig);
      if (sig.aborted) throw new AbortError();
      if (!loc.ok) return { kind: "need_region" };
      lastLoc.current = loc;
      setStatus("loading");
      return {
        kind: "data",
        res: await fetchAvailabilityNearby(isbn13, loc.lat, loc.lng, RADIUS_KM, sig),
      };
    });
    if (r.status === "stale") return; // 다른 책·언마운트 뒤 늦은 응답·오류는 무시(V-6·V-10)
    if (r.status === "error") return fail(r.error);
    if (r.value.kind === "need_region") {
      setItems([]);
      setStatus("need_region");
      return;
    }
    apply(r.value.res);
  }, [apply, fail, isbn13, runner]);

  /** 같은 위치·같은 반경으로 다시 묻는다(A3 "다시 시도"). 위치가 없으면 위치부터. */
  const retryNearby = useCallback(async () => {
    const loc = lastLoc.current;
    if (!loc) return loadNearby();
    setStatus("loading");
    setErrorMessage(null);
    const r = await runner.run((sig) => fetchAvailabilityNearby(isbn13, loc.lat, loc.lng, RADIUS_KM, sig));
    if (r.status === "stale") return;
    if (r.status === "error") return fail(r.error);
    apply(r.value);
  }, [apply, fail, isbn13, loadNearby, runner]);

  useEffect(() => {
    lastLoc.current = null;
    setItems([]);
    setCheckedAt(null);
    void loadNearby();
    return () => runner.cancel();
    // 책이 바뀔 때만 새로 찾는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn13]);

  const retry = useCallback(() => void retryNearby(), [retryNearby]);

  return {
    scope,
    items,
    status,
    checkedAt,
    // 도시 전체·지역 고르기는 LIB-2-P2
    searchCity: () => undefined,
    retry,
    chooseRegion: () => undefined,
    selectedRegionLabel: null,
    errorMessage,
    reloadNearby: () => void loadNearby(),
  };
}
