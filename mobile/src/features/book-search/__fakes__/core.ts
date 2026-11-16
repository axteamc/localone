// TODO(연결): D — core APP-0-P1(`theme/`, `lib/platform.ts`, `lib/latest.ts`)이 머지되면 이 파일을 지우고
// 같은 이름을 그 모듈에서 가져온다. 이름·시그니처·값은 core.md APP-0 C2·P4 그대로다.
// 색 값은 화면 파일이 아니라 여기 한 곳에만 둔다(book-search.md B9, PROJECT §3-14).
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── theme (디자인_기준 §2·§3 warm, 임시 토큰은 book-search.md B9 대응표) ──
export const theme = {
  look: "warm" as const,
  colors: {
    bg: "#E1E1DE",
    surface2: "#D0CEC8",
    surface3: "#BFBCB5",
    fill1: "#E9C970",
    fill2: "#EDC9A9",
    fill3: "#B3BFB5",
    cream: "#EFEFE7",
    paper: "#EFF1F1",
    inkStrong: "#2E333F",
    text: "#1D1D1F",
    textSub: "#70706F",
    divider: "#C4C4C1",
    inkSoft: "#4D4D4B",
    loanAvailable: "#5B8A5B",
    loanOut: "#B27A3D",
    loanUnknown: "#9A9A98",
  },
  radii: {
    card: 18,
    pill: 18,
    control: 9999,
    inner: 12,
    bookCover: { topLeft: 5, topRight: 9, bottomRight: 9, bottomLeft: 5 },
  },
};

// ── deviceStorage (네이티브 AsyncStorage, 웹은 AsyncStorage가 localStorage를 쓴다) ──
export const deviceStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// ── createLatestRunner (core.md APP-0 P4 골격 그대로) ──
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
    cancel() {
      seq += 1;
      current?.abort();
      current = null;
    },
  };
}
