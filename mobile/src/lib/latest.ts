export type LatestResult<T> =
  | { status: "ok"; value: T }
  | { status: "stale" }
  | { status: "error"; error: unknown };

export function createLatestRunner() {
  let seq = 0;
  let current: AbortController | null = null;
  return {
    async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<LatestResult<T>> {
      current?.abort();
      const mine = ++seq;
      const ctrl = new AbortController();
      current = ctrl;
      try {
        const value = await task(ctrl.signal);
        return mine === seq ? { status: "ok", value } : { status: "stale" };
      } catch (error) {
        if (mine !== seq || ctrl.signal.aborted) return { status: "stale" };
        return { status: "error", error };
      }
    },
    cancel() { seq += 1; current?.abort(); current = null; },
  };
}
