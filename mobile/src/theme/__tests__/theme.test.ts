import { describe, expect, test } from "@jest/globals";
import { theme, getTheme, onFill, contrastRatio, darken } from "../index";

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
    });
    expect(theme.radii).toEqual({ card: 18, clubCardTop: 70, clubCardBottom: 18,
      libraryIconTop: 23, libraryIconBottom: 6, pill: 18, bookCover: [5, 9, 9, 5], control: 9999, inner: 12 });
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
});
