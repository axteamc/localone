// "도서관 찾기" 창의 찾기 상태 (계약서 library-visit.md VISIT-1 C2·V11·V14, 예외 #3, C6 31자 이상)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// TODO(연결): D — core APP-0-P1(`lib/regions`·`lib/latest`)·LIB-0-P1(#10 `q`) 머지 뒤 `../../lib/*`로 바꾼다
import {
  createLatestRunner,
  searchLibrariesByName,
  searchRegions,
  type LibrarySummary,
  type Region,
} from "./__fakes__/publicApi";

/** 입력이 멈추고 이만큼 지나면 찾는다(기본값(Claude), V11) */
export const FIND_DELAY_MS = 300;
/** 서버가 31자 이상을 막으므로(422) 앱이 먼저 자른다(C6) */
export const MAX_QUERY = 30;
const MAX_REGIONS = 5;
const MAX_LIBRARIES = 20;

export type FindStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type FindLibrary = {
  query: string;
  setQuery(q: string): void;
  regions: Region[];
  libraries: LibrarySummary[];
  status: FindStatus;
};

export function useFindLibrary(): FindLibrary {
  const runner = useMemo(() => createLatestRunner(), []); // 찾기 창에 하나 (늦은 응답 폐기)
  const [query, setQueryState] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [status, setStatus] = useState<FindStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const find = useCallback(
    async (q: string) => {
      const t = q.trim();
      if (!t) {
        runner.cancel();
        setRegions([]);
        setLibraries([]);
        setStatus("idle");
        return;
      }
      setStatus("loading");
      const foundRegions = searchRegions(t, MAX_REGIONS);
      const r = await runner.run((s) => searchLibrariesByName(t, s));
      if (r.status === "stale") return; // 예외 #3: 늦게 온 앞 글자 결과는 버린다
      if (r.status === "error") {
        setRegions(foundRegions);
        setLibraries([]);
        setStatus("error");
        return;
      }
      const libs = r.value.items.slice(0, MAX_LIBRARIES);
      setRegions(foundRegions);
      setLibraries(libs);
      setStatus(foundRegions.length + libs.length === 0 ? "empty" : "ready");
    },
    [runner]
  );

  const setQuery = useCallback(
    (raw: string) => {
      const q = raw.slice(0, MAX_QUERY);
      setQueryState(q);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void find(q), FIND_DELAY_MS); // 매 글자마다 묻지 않는다
    },
    [find]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      runner.cancel();
    },
    [runner]
  );

  // 잘 안 될 때 "새로고침"은 창이 setQuery(query)로 지금 글자를 다시 찾는다
  return { query, setQuery, regions, libraries, status };
}
