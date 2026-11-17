/**
 * 화면이 쓰는 테마 진입점. `getTheme(look)`이 룩의 기본 색 + 파생 색 + 곡률을 한 객체로 준다.
 * 값의 원본과 "임시값" 사정은 ./tokens.ts 머리 주석을 본다.
 */
import {
  DEFAULT_LOOK,
  DERIVE,
  LOOK_BASE_COLORS,
  LOOK_RADII,
  LookPreset,
  ON_FILL_LIGHT,
  Radii,
  TEXT_COLOR,
  SEMANTIC_COLORS,
  ThemeColors,
} from "./tokens";

export type { LookPreset, Radii } from "./tokens";

export type { ThemeColors } from "./tokens";

export type Theme = {
  look: LookPreset;
  colors: ThemeColors;
  radii: Radii;
};

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match || !match[1]) {
    throw new Error(`#RRGGBB 형식이 아니에요: ${hex}`);
  }
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** 색을 ratio만큼 어둡게(0.5 = 각 채널 절반). 디자인_기준.md §2의 파생 규칙에 쓴다. */
export function darken(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex([r * (1 - ratio), g * (1 - ratio), b * (1 - ratio)]);
}

/** 선형 RGB 혼합: A를 weightA, B를 (1-weightA)만큼 섞는다. 시안 C 파생 색 산식. */
export function mix(hexA: string, hexB: string, weightA: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  return toHex([r1 * w + r2 * (1 - w), g1 * w + g2 * (1 - w), b1 * w + b2 * (1 - w)]);
}

function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 대비비(1~21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** 채움 위 글자색: 흰색과 본문색 중 대비가 큰 쪽(디자인_기준.md §2 "자동으로 고른다"). */
export function onFill(fill: string): string {
  return contrastRatio(fill, ON_FILL_LIGHT) >= contrastRatio(fill, TEXT_COLOR) ? ON_FILL_LIGHT : TEXT_COLOR;
}

export function getTheme(look: LookPreset = DEFAULT_LOOK): Theme {
  const base = LOOK_BASE_COLORS[look];
  return {
    look,
    colors: {
      ...base,
      ...SEMANTIC_COLORS,
      text: TEXT_COLOR,
      textSub: darken(base.bg, DERIVE.textSubDarken),
      divider: darken(base.bg, DERIVE.dividerDarken),
      panelFrosted: mix(base.paper, base.bg, DERIVE.panelFrostedPaperWeight),
      panelLit: mix(base.paper, base.cream, DERIVE.panelLitPaperWeight),
      seamHairline: mix(base.inkStrong, base.bg, DERIVE.seamInkWeight),
      rivetBase: mix(base.inkStrong, base.surface3, DERIVE.rivetInkWeight),
      rivetShine: mix(base.paper, base.bg, DERIVE.rivetShinePaperWeight),
      reliefBottomMid: mix(base.inkStrong, base.surface2, DERIVE.reliefMidInkWeight),
      reliefSideDark: mix(base.inkStrong, base.surface3, DERIVE.reliefDarkInkWeight),
    },
    radii: LOOK_RADII[look],
  };
}

/**
 * 행동 버튼 색(2026-11-18 S4 D 결정 B, DESIGN.md 결정 기록 "주 행동 버튼").
 * 주 행동: 대표색 `fill1` 채움 + 1px 줄눈, 글자는 채움 대비 자동. 보조·카드 안 행동: `cream` 바탕 + `surface3` 테두리.
 * `inkStrong` 채움은 홈 기점·소식 칩 같은 구조에만 쓴다.
 */
export function actionColors(colors: ThemeColors) {
  return {
    primary: { backgroundColor: colors.fill1, borderWidth: 1, borderColor: colors.seamHairline },
    primaryText: { color: onFill(colors.fill1) },
    secondary: { backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.surface3 },
    secondaryText: { color: colors.text },
  } as const;
}

/** M1 기본 룩(warm). 도서관 룩(VISIT-4)이 붙기 전까지 모든 화면이 쓴다. */
export const theme: Theme = getTheme();
