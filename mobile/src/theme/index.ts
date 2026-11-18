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
 * 아래 2px 받침(번짐 0인 그림자). `boxShadow`는 웹 규격과 같아 레이아웃 크기에 들어가지 않으므로
 * `borderBottomWidth`·바깥 View처럼 버튼 높이·글자 위치를 밀지 않는다(RN 0.76+ New Architecture: iOS·Android 9+, 웹은 CSS 그대로).
 * 주의: 부모가 `overflow: "hidden"`이면 받침이 잘린다.
 */
export function ledge(color: string, depth = 2): string {
  return `0 ${depth}px 0 0 ${color}`;
}
/** 받침을 없앤 값(누름 상태). "none" 대신 투명 그림자로 써서 네이티브 파서와 웹 모두 같은 형식을 쓴다. */
const NO_LEDGE = "0 0 0 0 transparent";

/**
 * 행동 버튼 재질(2026-11-18 D 결정 "주 버튼 색(앱 전체)" B 무광 판, DESIGN.md "페이지 적용 레시피").
 * - 주(primary): `panelLit` 판 + 1px `seamHairline` + 아래 2px `reliefBottomMid` 받침, 글자 `inkStrong`. 화면에 하나.
 * - 보조(secondary): 받침 없는 평평한 `panelFrosted` + 1px `seamHairline`, 글자 `text`. 주보다 한 단 어둡고 평평.
 * - 누름(primaryPressed): 받침이 사라지며 1px 내려앉음. `style={({ pressed }) => [s.btn, pressed && ACT.primaryPressed]}`.
 * 곡률은 화면 스타일이 `radii.control`(완전한 필)로 준다. 노랑 `fill1` 채움은 버튼에 쓰지 않는다(색은 창 안에만, 규칙 5).
 * 반환 모양(primary·primaryText·secondary·secondaryText)은 사용처가 펼쳐 쓰므로 유지한다.
 */
export function actionColors(colors: ThemeColors) {
  return {
    primary: {
      backgroundColor: colors.panelLit,
      borderWidth: 1,
      borderColor: colors.seamHairline,
      boxShadow: ledge(colors.reliefBottomMid),
    },
    primaryText: { color: colors.inkStrong },
    primaryPressed: { boxShadow: NO_LEDGE, transform: [{ translateY: 1 }] },
    secondary: { backgroundColor: colors.panelFrosted, borderWidth: 1, borderColor: colors.seamHairline },
    secondaryText: { color: colors.text },
    /** 보조 누름: 받침이 없으니 판을 한 단 어둡게(`seamHairline` 쪽으로 30%). */
    secondaryPressed: { backgroundColor: mix(colors.seamHairline, colors.panelFrosted, 0.3) },
  } as const;
}

/**
 * 정보·목록 카드 무광 면(DESIGN.md 결정 기록 "정보 카드 질감" D, 레시피 "카드(정보·목록)").
 * 책 상세 소장 카드(`LibraryAvailabilityCard`)의 값을 뽑았다: 바탕 `panelFrosted`, 1px `seamHairline`,
 * 아래 2px `reliefBottomMid` 받침, 곡률 `radii.infoCard`(아치 9 · modern 6), 그림자·하이라이트 없음.
 * 화면 바탕이 유리판(`panelFrosted`)이면 `{ onPanel: true }`로 카드를 `panelLit`으로 한 단 밝힌다.
 * 받침은 `ledge`(boxShadow)라 카드 높이에 들어가지 않는다 — 카드 사이 여백(12)에 받침 2px가 보인다.
 * 사용: `card: { ...cardSurface(), padding: 12, gap: 6 }`
 */
export function cardSurface(t: Theme = theme, opts: { onPanel?: boolean } = {}) {
  const c = t.colors;
  return {
    backgroundColor: opts.onPanel ? c.panelLit : c.panelFrosted,
    borderWidth: 1,
    borderColor: c.seamHairline,
    borderRadius: t.radii.infoCard,
    boxShadow: ledge(c.reliefBottomMid),
  } as const;
}

/** M1 기본 룩(warm). 도서관 룩(VISIT-4)이 붙기 전까지 모든 화면이 쓴다. */
export const theme: Theme = getTheme();

/**
 * 글자 단계(2026-11-18 D 결정 "글자와 공간 규칙" 2단계, DESIGN.md 결정 기록).
 * - 700은 쓰지 않는다. 강조는 크기로, 무게는 400·500 두 가지뿐.
 * - 제목: 크게·가볍게(400, `inkSoft`), 한 줄 전체 같은 굵기.
 * - 계기판 목소리: 방위·거리·날짜·개수·영문 표찰(작게, 자간 넓게, 대문자, `inkMuted`). 한글 문장과 한 줄에 섞지 않는다.
 */
export const type = {
  pageTitle: { fontSize: 24, fontWeight: "400", letterSpacing: -0.5, color: theme.colors.inkSoft },
  title: { fontSize: 22, fontWeight: "400", letterSpacing: -0.4, color: theme.colors.inkSoft },
  name: { fontSize: 14, fontWeight: "500", color: theme.colors.text },
  gauge: { fontSize: 10, fontWeight: "500", letterSpacing: 1.4, textTransform: "uppercase", color: theme.colors.inkMuted },
  /** 머리 띠 영어 표찰(HOME · LOANS · BOOK …) */
  label: { fontSize: 11, fontWeight: "500", letterSpacing: 3.5, color: theme.colors.inkMuted },
} as const;

/** 앱 공통 판 재질(머리 띠·탭·검색 띠·아래 창): 파사드와 같은 유리판 + 1px 줄눈 (D 결정 "머리·검색·탭 재질" A) */
export const panel = {
  backgroundColor: theme.colors.panelFrosted,
  borderColor: theme.colors.seamHairline,
} as const;
