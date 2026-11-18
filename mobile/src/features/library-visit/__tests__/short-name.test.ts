// 큐브 윗면 이름 줄이는 규칙 (VISIT-1 V3, L6 2026-11-19 D 결정 "핵심 이름만")
import { describe, expect, it } from "@jest/globals";
import { coreLibraryName, cubeNames, regionOf } from "../shortName";

const L = (id: number, name: string, address: string | null = null, area_label: string | null = null) => ({ id, name, address, area_label });

describe("coreLibraryName", () => {
  it.each([
    ["서울특별시교육청정독도서관", "정독"],
    ["서울특별시교육청 남산도서관", "남산"],
    ["강남구립 개포도서관", "개포"],
    ["성남시립중원도서관", "중원"],
    ["경기도교육청 화성평생학습관", "화성평생학습관"],
    ["부산광역시립시민도서관", "부산 시민"],
    ["정독도서관", "정독"],
    ["삼청공원숲속도서관", "삼청공원숲속"],
    ["국립중앙도서관", "국립중앙"],
    ["종로", "종로"],
  ])("%s → %s", (name, want) => {
    expect(coreLibraryName(name)).toBe(want);
  });

  it("keeps English, bracketed and too-short names as they are", () => {
    expect(coreLibraryName("Seoul Library")).toBe("Seoul Library");
    expect(coreLibraryName("정독도서관(분관)")).toBe("정독도서관(분관)");
    expect(coreLibraryName("구립도서관")).toBe("구립도서관");
    expect(coreLibraryName("  도서관 ")).toBe("도서관");
  });

  it("adds a region to generic cores and keeps the name when no region is known", () => {
    expect(coreLibraryName("서울특별시교육청어린이도서관")).toBe("서울 어린이");
    expect(coreLibraryName("어린이도서관", { address: "서울특별시 종로구 사직로 1", area_label: "사직동" })).toBe("종로 어린이");
    expect(coreLibraryName("어린이도서관")).toBe("어린이도서관");
  });
});

describe("regionOf", () => {
  it("uses 구·군 from the address, short 구 names stay, falls back to area_label", () => {
    expect(regionOf({ address: "서울특별시 종로구 북촌로5길 48", area_label: "화동" })).toBe("종로");
    expect(regionOf({ address: "서울특별시 중구 세종대로 110", area_label: null })).toBe("중구");
    expect(regionOf({ address: "경기도 성남시 중원구 1", area_label: null })).toBe("중원");
    expect(regionOf({ address: "경기도 성남시 1", area_label: null })).toBe("성남");
    expect(regionOf({ address: null, area_label: "화동" })).toBe("화동");
    expect(regionOf({ address: null, area_label: null })).toBeNull();
  });
});

describe("cubeNames", () => {
  it("shortens each name when they do not collide", () => {
    const m = cubeNames([L(1, "서울특별시교육청정독도서관"), L(2, "남산도서관"), L(3, "Seoul Library")]);
    expect([...m.values()]).toEqual(["정독", "남산", "Seoul Library"]);
  });

  it("adds the region to colliding names only", () => {
    const m = cubeNames([
      L(1, "강남구립 개포도서관", "서울특별시 강남구 개포로 1"),
      L(2, "개포도서관", "서울특별시 서초구 1"),
      L(3, "정독도서관", "서울특별시 종로구 1"),
    ]);
    expect(m.get(1)).toBe("강남 개포");
    expect(m.get(2)).toBe("서초 개포");
    expect(m.get(3)).toBe("정독");
  });

  it("falls back to full names when region does not separate them", () => {
    const m = cubeNames([L(1, "새싹도서관", "서울특별시 종로구 1"), L(2, "새싹공공도서관", "서울특별시 종로구 2"), L(3, "새싹도서관")]);
    expect(m.get(1)).toBe("새싹도서관");
    expect(m.get(2)).toBe("새싹공공도서관");
    expect(m.get(3)).toBe("새싹도서관");
  });
});
