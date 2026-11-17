import { describe, expect, test } from "@jest/globals";
import { theme, getTheme, onFill, contrastRatio, darken, mix } from "../index";

describe("APP-0-P1 theme", () => {
  test("theme warm tokens match 디자인_기준", () => {
    expect(theme).toEqual(getTheme());
    expect(theme.look).toBe("warm");
    expect(theme.colors).toEqual({
      bg: "#E1E1DE", surface2: "#D0CEC8", surface3: "#BFBCB5", fill1: "#E9C970",
      fill2: "#EDC9A9", fill3: "#B3BFB5", cream: "#EFEFE7", paper: "#EFF1F1", inkStrong: "#2E333F",
      text: "#1D1D1F", textSub: "#71716F", divider: "#C4C4C1",
      pinClosed: "#78736C", inkMuted: "#6B6B66", loanAvailable: "#5B8A5B",
      loanOut: "#B27A3D", loanUnknown: "#9A9A98", inkSoft: "#4D4D4B",
      shadowSoft: "rgba(0,0,0,.15)", shadowFloat: "rgba(0,0,0,.18)",
      seamHighlight: "rgba(255,255,255,.68)", shadowAmbient: "rgba(28,30,36,.14)",
      shadowCast: "rgba(28,30,36,.22)", shadowDeep: "rgba(20,22,28,.30)",
      panelFrosted: "#E9EAE9", panelLit: "#EFF1EF", seamHairline: "#C8C9C8", rivetBase: "#8E8D8D",
      rivetShine: "#EEEFEF", reliefBottomMid: "#B8B7B3", reliefSideDark: "#999896",
    });
    expect(theme.radii).toEqual({ card: 18, clubCardTop: 70, clubCardBottom: 18,
      libraryIconTop: 23, libraryIconBottom: 6, pill: 18, bookCover: [5, 9, 9, 5], control: 9999, inner: 12, block: 3 });
  });
  test("onFill picks higher contrast", () => {
    expect(onFill(theme.colors.fill1)).toBe("#1D1D1F");
    expect(onFill(theme.colors.inkStrong)).toBe("#FFFFFF");
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(darken("#808080", 0.5)).toBe("#404040");
    expect(() => darken("red", 0.5)).toThrow();
  });
  test("all four looks retain their base and radii", () => {
    expect(getTheme("modern").colors.fill1).toBe("#FB5102");
    expect(getTheme("modern").radii.bookCover).toEqual([2, 4, 4, 2]);
    expect(getTheme("toffee").colors.fill1).toBe("#6E5140");
    expect(getTheme("oxford").colors.inkStrong).toBe("#002147");
  });
  test("all themes expose visit shadow tokens", () => {
    const expected = {
      warm: { bg: "#E1E1DE", fill1: "#E9C970", inkStrong: "#2E333F", card: 18 },
      toffee: { bg: "#E4E2DB", fill1: "#6E5140", inkStrong: "#332A27", card: 18 },
      oxford: { bg: "#CDCDCB", fill1: "#35557F", inkStrong: "#002147", card: 18 },
      modern: { bg: "#CDCDCB", fill1: "#FB5102", inkStrong: "#1C1E2A", card: 6 },
    } as const;
    for (const look of ["warm", "toffee", "oxford", "modern"] as const) {
      const t = getTheme(look);
      expect(typeof t.colors.shadowSoft).toBe("string");
      expect(typeof t.colors.shadowFloat).toBe("string");
      expect(t.colors.shadowSoft).toBe("rgba(0,0,0,.15)");
      expect(t.colors.shadowFloat).toBe("rgba(0,0,0,.18)");
      expect(t.colors.bg).toBe(expected[look].bg);
      expect(t.colors.fill1).toBe(expected[look].fill1);
      expect(t.colors.inkStrong).toBe(expected[look].inkStrong);
      expect(t.colors.pinClosed).toBe("#78736C");
      expect(t.radii.card).toBe(expected[look].card);
    }
  });
  test("mix blends linearly and clamps the weight", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#102030", "#FFFFFF", 1)).toBe("#102030");
    expect(mix("#102030", "#FFFFFF", 0)).toBe("#FFFFFF");
    expect(mix("#102030", "#FFFFFF", 2)).toBe("#102030");
  });
  test("2026-11-17 confirmed palettes: toffee accents split, oxford neutrals match modern", () => {
    const toffee = getTheme("toffee").colors;
    expect([toffee.fill1, toffee.fill2, toffee.fill3]).toEqual(["#6E5140", "#C88A56", "#7E8C7D"]);
    const modern = getTheme("modern").colors;
    const oxford = getTheme("oxford").colors;
    for (const k of ["bg", "surface2", "surface3", "cream", "paper"] as const) expect(oxford[k]).toBe(modern[k]);
    expect(oxford.fill3).toBe("#7A93AC");
  });
  test("facade and relief derived colors per look follow the mix formulas", () => {
    const expected = {
      modern: ["#DCDCDA", "#E6E6E4", "#B4B5B4", "#78797B", "#E4E4E2", "#A5A5A4", "#848485"],
      warm: ["#E9EAE9", "#EFF1EF", "#C8C9C8", "#8E8D8D", "#EEEFEF", "#B8B7B3", "#999896"],
      toffee: ["#EAEAE5", "#EEEFED", "#CBC8C2", "#918A7F", "#EDEEEB", "#BDB6AC", "#9D958A"],
      oxford: ["#DCDCDA", "#E6E6E4", "#B0B5B9", "#6F7A85", "#E4E4E2", "#A1A6A9", "#7C858D"],
    } as const;
    for (const look of ["modern", "warm", "toffee", "oxford"] as const) {
      const c = getTheme(look).colors;
      expect([c.panelFrosted, c.panelLit, c.seamHairline, c.rivetBase, c.rivetShine, c.reliefBottomMid, c.reliefSideDark])
        .toEqual(expected[look]);
      expect(getTheme(look).radii.block).toBe(3);
    }
  });
});
