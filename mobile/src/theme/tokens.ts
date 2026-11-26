/**
 * 디자인 토큰 원본(앱 코드). 화면은 색·곡률 값을 직접 쓰지 않고 여기서만 가져온다(CLAUDE.md 불변 조건 10, DEF-019).
 *
 * 기준: 개발산출물/디자인_기준.md §2·§3 및 core APP-0 C2.
 * 캘리브레이션된 모니터에서 최종 조정할 예정이다. 값을 바꿀 때는 이 파일과 디자인_기준.md §2(·DESIGN.md 색 표)를
 * 같은 커밋에서 함께 고친다. 파생 색(보조 글자·구분선)은 규칙으로 계산하므로 `bg`만 바꾸면 따라온다.
 */

/** DB `libraries.look_preset`(05 §10.1)과 같은 이름. M1 기본은 warm. */
export type LookPreset = "warm" | "toffee" | "oxford" | "modern";

export type BaseColors = {
  /** 배경 */
  bg: string;
  /** 선반·시트 */
  surface2: string;
  /** 선반 진한색 */
  surface3: string;
  /** 채움1(대표색) */
  fill1: string;
  fill2: string;
  fill3: string;
  cream: string;
  /** 카드(순백 아님) */
  paper: string;
  /** 진한색(버튼·받침) */
  inkStrong: string;
};

/** 디자인_기준.md §2 "색 토큰(룩 4종)" 표. 열 순서: 모던 · warm · toffee · Oxford. */
export const LOOK_BASE_COLORS: Record<LookPreset, BaseColors> = {
  modern: {
    bg: "#CDCDCB",
    surface2: "#BDBDBA",
    surface3: "#A8A8A5",
    fill1: "#FB5102",
    fill2: "#F2F2EF",
    fill3: "#9AA0B4",
    cream: "#E9E9E6",
    paper: "#E6E6E4",
    inkStrong: "#1C1E2A",
  },
  warm: {
    bg: "#E1E1DE",
    surface2: "#D0CEC8",
    surface3: "#BFBCB5",
    fill1: "#E9C970",
    fill2: "#EDC9A9",
    fill3: "#B3BFB5",
    cream: "#EFEFE7",
    paper: "#EFF1F1",
    inkStrong: "#2E333F",
  },
  toffee: {
    bg: "#E4E2DB",
    surface2: "#D5CFC4",
    surface3: "#C2BBAD",
    fill1: "#6E5140",
    fill2: "#C88A56", // 캐러멜 앰버(2026-11-17 확정, surface2와 겹침 해소)
    fill3: "#7E8C7D", // 올리브 세이지(2026-11-17 확정, surface3와 겹침 해소)
    cream: "#EEEFED",
    paper: "#EEEFED",
    inkStrong: "#332A27",
  },
  // 배경·표면·백색은 modern과 동일한 무채색으로 통일(2026-11-17 확정). 네이비·탄 포인트 대비를 살린다.
  oxford: {
    bg: "#CDCDCB",
    surface2: "#BDBDBA",
    surface3: "#A8A8A5",
    fill1: "#35557F",
    fill2: "#D2B48C",
    fill3: "#7A93AC",
    cream: "#E9E9E6",
    paper: "#E6E6E4",
    inkStrong: "#002147",
  },
};

/** 채움 위 글자 후보 중 밝은 쪽(채움 위 글자는 대비로 자동 선택, 디자인_기준.md §2). */
export const ON_FILL_LIGHT = "#FFFFFF";
export const CLOSED_CUBE_LID_INK = ON_FILL_LIGHT;

/**
 * 홈 큐브 윗면 색(2026-11-20 H6, D가 고른 20색). 룩과 무관한 고정값이고 휴관은 이 목록이 아니라 `pinClosed`.
 * 도서관 id로 한 색을 고르고 판에 같이 보이는 곳끼리는 겹치지 않게 한다(`direction.ts` `assignSpineTones`).
 * 뚜껑 글자는 D안 고정색을 쓴다(큰·작은 이름 공통).
 * 순서를 바꾸면 도서관마다 색이 바뀌므로 새 색은 끝에 붙인다.
 */
export const CUBE_PALETTE = [
  { name: "bold", hex: "#EB5324", ink: ON_FILL_LIGHT },
  { name: "coral", hex: "#FF7850", ink: ON_FILL_LIGHT },
  { name: "marshmallow", hex: "#F4F1DE", ink: "#51504D" },
  { name: "neutral", hex: "#FFF6EE", ink: "#535151" },
  { name: "porcelain", hex: "#F0F0F5", ink: "#505052" },
  { name: "eggshell", hex: "#F0E6DC", ink: "#504D4C" },
  { name: "vanillaCanvas", hex: "#EBE4D1", ink: "#4E4D4A" },
  { name: "vanilla", hex: "#CDBEA0", ink: ON_FILL_LIGHT },
  { name: "indigoDrift", hex: "#232747", ink: ON_FILL_LIGHT },
  { name: "dark", hex: "#27324A", ink: ON_FILL_LIGHT },
  { name: "darkNavy", hex: "#001428", ink: ON_FILL_LIGHT },
  { name: "atlanticBlue", hex: "#26577C", ink: ON_FILL_LIGHT },
  { name: "ultramarine", hex: "#3778FF", ink: ON_FILL_LIGHT },
  { name: "light", hex: "#59BABD", ink: ON_FILL_LIGHT },
  { name: "complementary", hex: "#BFDAD3", ink: ON_FILL_LIGHT },
  { name: "lemonZest", hex: "#F5AF3D", ink: ON_FILL_LIGHT },
  { name: "citrusYellow", hex: "#FFC300", ink: ON_FILL_LIGHT },
  { name: "crimsonWhisper", hex: "#6B0A00", ink: ON_FILL_LIGHT },
  { name: "shuttleGray", hex: "#646E7D", ink: ON_FILL_LIGHT },
  { name: "ghostGray", hex: "#C8C8D2", ink: ON_FILL_LIGHT },
  { name: "vermilionRed", hex: "#D83A2E", ink: ON_FILL_LIGHT },
  { name: "cobaltBlue", hex: "#2F6DB5", ink: ON_FILL_LIGHT },
  { name: "sunflowerGold", hex: "#F2C230", ink: ON_FILL_LIGHT },
  { name: "obsidianBlack", hex: "#111111", ink: ON_FILL_LIGHT },
  { name: "warmAlabaster", hex: "#F7F2E8", ink: "#514F4B" },
  { name: "sageLeaf", hex: "#88A170", ink: ON_FILL_LIGHT },
  { name: "oatmealPaper", hex: "#F0E9D3", ink: "#51504B" },
  { name: "mossGreen", hex: "#7A9E55", ink: ON_FILL_LIGHT },
  { name: "pistachioSoft", hex: "#B5C98A", ink: ON_FILL_LIGHT },
  { name: "parchmentCream", hex: "#F3E8CF", ink: "#51504B" },
  { name: "softPeriwinkle", hex: "#D2C7FF", ink: ON_FILL_LIGHT },
  { name: "terracottaClay", hex: "#D35B2F", ink: ON_FILL_LIGHT },
  { name: "warmCharcoal", hex: "#221E1C", ink: ON_FILL_LIGHT },
  { name: "espressoInk", hex: "#34251E", ink: ON_FILL_LIGHT },
  { name: "warmUmber", hex: "#5F4F40", ink: ON_FILL_LIGHT },
  { name: "pewterGray", hex: "#7F8790", ink: ON_FILL_LIGHT },
  { name: "warmSand", hex: "#B7A992", ink: ON_FILL_LIGHT },
  { name: "silverMist", hex: "#AFB9BF", ink: ON_FILL_LIGHT },
  { name: "crimson_ink", hex: "#3A1317", ink: ON_FILL_LIGHT },
  { name: "mustard_ink", hex: "#2D1F00", ink: ON_FILL_LIGHT },
  { name: "moss_ink", hex: "#162704", ink: ON_FILL_LIGHT },
  { name: "teal_ink", hex: "#002924", ink: ON_FILL_LIGHT },
  { name: "cobalt_ink", hex: "#01243D", ink: ON_FILL_LIGHT },
  { name: "plum_ink", hex: "#2E1735", ink: ON_FILL_LIGHT },
  { name: "crimson_deep", hex: "#62272E", ink: ON_FILL_LIGHT },
  { name: "terracotta_deep", hex: "#602C11", ink: ON_FILL_LIGHT },
  { name: "mustard_deep", hex: "#4D3A00", ink: ON_FILL_LIGHT },
  { name: "moss_deep", hex: "#2C4610", ink: ON_FILL_LIGHT },
  { name: "teal_deep", hex: "#004841", ink: ON_FILL_LIGHT },
  { name: "cobalt_deep", hex: "#084066", ink: ON_FILL_LIGHT },
  { name: "periwinkle_deep", hex: "#3D3466", ink: ON_FILL_LIGHT },
  { name: "mauve_deep", hex: "#5A2949", ink: ON_FILL_LIGHT },
  { name: "crimson_rich", hex: "#933E47", ink: ON_FILL_LIGHT },
  { name: "terracotta_rich", hex: "#91451C", ink: ON_FILL_LIGHT },
  { name: "mustard_rich", hex: "#745A07", ink: ON_FILL_LIGHT },
  { name: "moss_rich", hex: "#446A1C", ink: ON_FILL_LIGHT },
  { name: "forest_rich", hex: "#047041", ink: ON_FILL_LIGHT },
  { name: "teal_rich", hex: "#036D63", ink: ON_FILL_LIGHT },
  { name: "cerulean_rich", hex: "#02697B", ink: ON_FILL_LIGHT },
  { name: "cobalt_rich", hex: "#0E629A", ink: ON_FILL_LIGHT },
  { name: "indigo_rich", hex: "#42599E", ink: ON_FILL_LIGHT },
  { name: "periwinkle_rich", hex: "#5E5099", ink: ON_FILL_LIGHT },
  { name: "plum_rich", hex: "#784687", ink: ON_FILL_LIGHT },
  { name: "mauve_rich", hex: "#884070", ink: ON_FILL_LIGHT },
  { name: "crimson_muted", hex: "#976567", ink: ON_FILL_LIGHT },
  { name: "amber_muted", hex: "#8E6D4A", ink: ON_FILL_LIGHT },
  { name: "olive_muted", hex: "#75794B", ink: ON_FILL_LIGHT },
  { name: "forest_muted", hex: "#548064", ink: ON_FILL_LIGHT },
  { name: "cerulean_muted", hex: "#437E8C", ink: ON_FILL_LIGHT },
  { name: "indigo_muted", hex: "#64739B", ink: ON_FILL_LIGHT },
  { name: "plum_muted", hex: "#85698D", ink: ON_FILL_LIGHT },
  { name: "crimson_mid", hex: "#C77E82", ink: ON_FILL_LIGHT },
  { name: "terracotta_mid", hex: "#C48364", ink: ON_FILL_LIGHT },
  { name: "mustard_mid", hex: "#AD924F", ink: ON_FILL_LIGHT },
  { name: "teal_mid", hex: "#48A89C", ink: ON_FILL_LIGHT },
  { name: "cerulean_mid", hex: "#47A4B9", ink: ON_FILL_LIGHT },
  { name: "cobalt_mid", hex: "#639BCA", ink: ON_FILL_LIGHT },
  { name: "periwinkle_mid", hex: "#948CCA", ink: ON_FILL_LIGHT },
  { name: "plum_mid", hex: "#AD83BA", ink: ON_FILL_LIGHT },
  { name: "crimson_vivid", hex: "#DF5869", ink: ON_FILL_LIGHT },
  { name: "amber_vivid", hex: "#C37904", ink: ON_FILL_LIGHT },
  { name: "olive_vivid", hex: "#BAC044", ink: ON_FILL_LIGHT },
  { name: "moss_vivid", hex: "#5E8934", ink: ON_FILL_LIGHT },
  { name: "forest_vivid", hex: "#27905A", ink: ON_FILL_LIGHT },
  { name: "cobalt_vivid", hex: "#0E93E5", ink: ON_FILL_LIGHT },
  { name: "indigo_vivid", hex: "#6184F1", ink: ON_FILL_LIGHT },
  { name: "periwinkle_vivid", hex: "#7562C2", ink: ON_FILL_LIGHT },
  { name: "plum_vivid", hex: "#9755AB", ink: ON_FILL_LIGHT },
  { name: "mauve_vivid", hex: "#CE5CA8", ink: ON_FILL_LIGHT },
  { name: "crimson_pastel", hex: "#E79DA1", ink: ON_FILL_LIGHT },
  { name: "terracotta_pastel", hex: "#E4A385", ink: ON_FILL_LIGHT },
  { name: "mustard_pastel", hex: "#CCB171", ink: ON_FILL_LIGHT },
  { name: "forest_pastel", hex: "#85C59D", ink: ON_FILL_LIGHT },
  { name: "cerulean_pastel", hex: "#6DC3D7", ink: ON_FILL_LIGHT },
  { name: "cobalt_pastel", hex: "#84BBE9", ink: ON_FILL_LIGHT },
  { name: "periwinkle_pastel", hex: "#B3ABE9", ink: ON_FILL_LIGHT },
  { name: "mauve_pastel", hex: "#DC9EC4", ink: ON_FILL_LIGHT },
  { name: "crimson_soft", hex: "#EBBDBF", ink: ON_FILL_LIGHT },
  { name: "moss_soft", hex: "#BED2AF", ink: ON_FILL_LIGHT },
] as const;

/** MY-3 M3-O4 방문 모음 큐브 윗면 색. 순서가 도서관별 색을 결정한다. */
export const VISIT_COLLECTION_PALETTE = [
  "#E9B7AA", "#F0D6A1", "#C9DBAC", "#A9D4CC",
  "#AFC9E8", "#CFBCE4", "#E6C4D7", "#D6CCBC",
] as const;

/** 본문 글자색(디자인_기준.md §2 "본문 글자 #1D1D1F"). 룩과 무관. */
export const TEXT_COLOR = "#1D1D1F";

/** 파생 규칙(디자인_기준.md §2): 보조 글자 = bg 50% 어둡게, 구분선 = bg 13% 어둡게. */
export const DERIVE = {
  textSubDarken: 0.5,
  dividerDarken: 0.13,
  /** 시안 C 파사드·릴리프 파생: mix(A, B, w) = A*w + B*(1-w). 가중치는 앞 색(A)의 비율이다. */
  panelFrostedPaperWeight: 0.58, // mix(paper, bg)
  panelLitPaperWeight: 0.84, // mix(paper, cream)
  seamInkWeight: 0.14, // mix(inkStrong, bg)
  rivetInkWeight: 0.34, // mix(inkStrong, surface3)
  rivetShinePaperWeight: 0.9, // mix(paper, bg)
  reliefMidInkWeight: 0.15, // mix(inkStrong, surface2)
  reliefDarkInkWeight: 0.26, // mix(inkStrong, surface3)
} as const;

/** core C2 의미별 임시색. D 최종 색 보정은 이 정의에서 한다. */
export const SEMANTIC_COLORS = {
  pinClosed: "#78736C", inkMuted: "#6B6B66", loanAvailable: "#5B8A5B",
  loanOut: "#B27A3D", loanUnknown: "#9A9A98", inkSoft: "#4D4D4B",
  shadowSoft: "rgba(0,0,0,.15)", shadowFloat: "rgba(0,0,0,.18)",
  /** 시안 C 조명·그림자(룩 무관 고정). */
  seamHighlight: "rgba(255,255,255,.68)",
  shadowAmbient: "rgba(28,30,36,.14)",
  shadowCast: "rgba(28,30,36,.22)",
  shadowDeep: "rgba(20,22,28,.30)",
};
export type DerivedColors = {
  text: string; textSub: string; divider: string;
  /** 파사드 무광 유리 면 */ panelFrosted: string;
  /** 기점 주변 확산 면 */ panelLit: string;
  /** 1px 줄눈·블록 외곽선 */ seamHairline: string;
  /** 리벳 도트 본체 */ rivetBase: string;
  /** 리벳 도트 반사광 */ rivetShine: string;
  /** 3D 블록 5번째 단차면 */ reliefBottomMid: string;
  /** 3D 블록 우측·최하단 마감 두께면 */ reliefSideDark: string;
};
export type ThemeColors = BaseColors & typeof SEMANTIC_COLORS & DerivedColors;

export type Radii = {
  card: number;
  clubCardTop: number;
  clubCardBottom: number;
  libraryIconTop: number;
  libraryIconBottom: number;
  /** 알약(칩·모임 태그) */
  pill: number;
  /** 책 표지 [왼위, 오른위, 오른아래, 왼아래] */
  bookCover: readonly [number, number, number, number];
  /** 컨트롤(스탬프 버튼·"열기 ↗"·로그인 버튼)은 완전한 필 */
  control: number;
  inner: number;
  /** 3D 돌출 블록 외곽. 모든 룩에서 3으로 같다(직육면체 매스감). */
  block: number;
  /** 정보 카드(책 상세 소장 카드) 곡률. 2026-11-18 S4 D 결정(C-70): 아치 룩 9, modern 6. */
  infoCard: number;
};

/** 디자인_기준.md §3 "형태 토큰". 모던은 직각 계열, 나머지 3룩은 아치 계열. */
const ARCH_RADII: Radii = {
  card: 18,
  clubCardTop: 70,
  clubCardBottom: 18,
  libraryIconTop: 23,
  libraryIconBottom: 6,
  pill: 18,
  bookCover: [5, 9, 9, 5],
  control: 9999,
  inner: 12,
  block: 3,
  infoCard: 9,
};

const SQUARE_RADII: Radii = {
  card: 6,
  clubCardTop: 6,
  clubCardBottom: 6,
  libraryIconTop: 3,
  libraryIconBottom: 3,
  pill: 6,
  bookCover: [2, 4, 4, 2],
  control: 9999,
  inner: 12,
  block: 3,
  infoCard: 6,
};

export const LOOK_RADII: Record<LookPreset, Radii> = {
  modern: SQUARE_RADII,
  warm: ARCH_RADII,
  toffee: ARCH_RADII,
  oxford: ARCH_RADII,
};

export const DEFAULT_LOOK: LookPreset = "warm";
