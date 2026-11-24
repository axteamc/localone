// VISIT-4-P3 도서관 룩(V4-8~V4-10, V4-O5).
// `#11 GET /libraries/{id}`의 `look`(D core M2-0-P3)을 `getTheme(look)`으로 바꿔 방문 페이지와 그 피드에서 연 상세에 입힌다.
// 없거나 모르는 값이면 `warm`(V4-9). 홈·검색·대출·내 정보·글쓰기는 Provider 밖이라 기본 `theme` 그대로(V4-8).
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { actionColors, getTheme, theme as defaultTheme, type LookPreset, type Theme } from "../../theme";

const LOOKS: readonly LookPreset[] = ["modern", "warm", "toffee", "oxford"];

/** `#11`의 `look` 값 → 프리셋. `null`·없음·모르는 값은 `warm`(V4-9) */
export function toLook(value: unknown): LookPreset {
  return typeof value === "string" && (LOOKS as readonly string[]).includes(value) ? (value as LookPreset) : "warm";
}

// 도서관 룩은 한 번 정하면 안 바뀐다(V4-9) → 앱을 켜 둔 동안 도서관마다 한 번만 묻는다.
const lookCache = new Map<number, LookPreset>();
const inflight = new Map<number, Promise<LookPreset>>();

function loadLook(libraryId: number): Promise<LookPreset> {
  const hit = inflight.get(libraryId);
  if (hit) return hit;
  // 공개 API 모듈은 필요할 때 읽는다(동기 require) — 카드 조각만 그리는 화면(홈 하단 창 등)이 로그인 모듈까지 끌어오지 않게
  const { fetchLibrary } = require("../../lib/publicApi") as typeof import("../../lib/publicApi");
  const p = fetchLibrary(libraryId)
    .then((lib) => {
      const look = toLook((lib as { look?: unknown }).look); // TODO(연결): D M2-0-P3 — publicApi `LibraryDetail`에 `look` 타입이 붙으면 캐스트를 뺀다
      lookCache.set(libraryId, look);
      return look;
    })
    .catch(() => "warm" as LookPreset) // 못 읽으면 기본 룩. 다음 방문 때 다시 묻는다(캐시에 넣지 않음)
    .finally(() => inflight.delete(libraryId));
  inflight.set(libraryId, p);
  return p;
}

/** 시험에서 도서관 룩 기억을 비운다 */
export function resetLibraryLookCache(): void {
  lookCache.clear();
  inflight.clear();
}

const themeCache = new Map<LookPreset, Theme>();
/** 같은 룩은 같은 Theme 객체(스타일 기억 키) */
export function themeFor(look: LookPreset): Theme {
  if (look === defaultTheme.look) return defaultTheme;
  let t = themeCache.get(look);
  if (!t) {
    t = getTheme(look);
    themeCache.set(look, t);
  }
  return t;
}

/**
 * 도서관 id → 그 도서관 룩의 Theme. 읽는 동안·실패하면 `warm`.
 * 도서관을 바꾸면 이전 도서관의 늦은 응답은 버린다(AC-RACE).
 */
export function useLibraryLook(libraryId: number): Theme {
  const [state, setState] = useState<{ id: number; look: LookPreset } | null>(() => {
    const cached = lookCache.get(libraryId);
    return cached ? { id: libraryId, look: cached } : null;
  });
  useEffect(() => {
    if (!Number.isFinite(libraryId) || libraryId <= 0) return;
    const cached = lookCache.get(libraryId);
    if (cached) {
      setState({ id: libraryId, look: cached });
      return;
    }
    let alive = true;
    void loadLook(libraryId).then((look) => {
      if (alive) setState({ id: libraryId, look });
    });
    return () => {
      alive = false;
    };
  }, [libraryId]);
  const look = state && state.id === libraryId ? state.look : (lookCache.get(libraryId) ?? "warm");
  return themeFor(look);
}

const LookContext = createContext<Theme>(defaultTheme);

/** 방문 페이지·그 피드에서 연 상세를 감싼다. 밖의 화면은 기본 `theme` */
export function LibraryLookProvider({ value, children }: { value: Theme; children?: ReactNode }) {
  return createElement(LookContext.Provider, { value }, children);
}

/** 지금 화면의 Theme. Provider 밖이면 기본 `theme`(warm) */
export function useCurrentTheme(): Theme {
  return useContext(LookContext);
}

const styleCache = new WeakMap<(t: Theme) => unknown, Map<Theme, unknown>>();
/**
 * 룩에 따라 바뀌는 스타일. `make`는 모듈 수준 함수로 두고(같은 참조) 룩마다 한 번만 만든다.
 * 사용: `const makeStyles = (theme: Theme) => StyleSheet.create({...}); … const styles = useLookStyles(makeStyles);`
 */
export function useLookStyles<S>(make: (t: Theme) => S): S {
  const t = useCurrentTheme();
  let byTheme = styleCache.get(make) as Map<Theme, S> | undefined;
  if (!byTheme) {
    byTheme = new Map();
    styleCache.set(make, byTheme as Map<Theme, unknown>);
  }
  let s = byTheme.get(t);
  if (!s) {
    s = make(t);
    byTheme.set(t, s);
  }
  return s;
}

/** `theme`의 `type`(글자 단계)을 룩 색으로. 크기·굵기는 그대로 */
export function lookType(t: Theme) {
  return {
    pageTitle: { fontSize: 24, fontWeight: "400", letterSpacing: -0.5, color: t.colors.inkSoft },
    title: { fontSize: 22, fontWeight: "400", letterSpacing: -0.4, color: t.colors.inkSoft },
    name: { fontSize: 14, fontWeight: "500", color: t.colors.text },
    gauge: { fontSize: 10, fontWeight: "500", letterSpacing: 1.4, textTransform: "uppercase", color: t.colors.inkMuted },
    label: { fontSize: 11, fontWeight: "500", letterSpacing: 3.5, color: t.colors.inkMuted },
  } as const;
}

/** `theme`의 `panel`(유리판 + 줄눈)을 룩 색으로 */
export function lookPanel(t: Theme) {
  return { backgroundColor: t.colors.panelFrosted, borderColor: t.colors.seamHairline } as const;
}

type LookKit = {
  theme: Theme;
  C: Theme["colors"];
  T: ReturnType<typeof lookType>;
  panel: ReturnType<typeof lookPanel>;
  ACT: ReturnType<typeof actionColors>;
};
const kitCache = new Map<Theme, LookKit>();
/** 룩 하나의 색·글자 단계·판·버튼 재질 묶음(같은 룩이면 같은 객체) */
export function lookKit(t: Theme): LookKit {
  let k = kitCache.get(t);
  if (!k) {
    k = { theme: t, C: t.colors, T: lookType(t), panel: lookPanel(t), ACT: actionColors(t.colors) };
    kitCache.set(t, k);
  }
  return k;
}

/** 방문 페이지 조각이 쓰는 한 줄: `const { C, T, styles } = useLook(makeStyles);` */
export function useLook<S>(make: (t: Theme) => S): LookKit & { styles: S } {
  const styles = useLookStyles(make);
  return { ...lookKit(useCurrentTheme()), styles };
}
