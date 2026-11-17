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

/** 본문 글자색(디자인_기준.md §2 "본문 글자 #1D1D1F"). 룩과 무관. */
export const TEXT_COLOR = "#1D1D1F";
/** 채움 위 글자 후보 중 밝은 쪽(채움 위 글자는 대비로 자동 선택, 디자인_기준.md §2). */
export const ON_FILL_LIGHT = "#FFFFFF";

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
};

export const LOOK_RADII: Record<LookPreset, Radii> = {
  modern: SQUARE_RADII,
  warm: ARCH_RADII,
  toffee: ARCH_RADII,
  oxford: ARCH_RADII,
};

export const DEFAULT_LOOK: LookPreset = "warm";
