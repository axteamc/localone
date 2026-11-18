// 홈 인기 도서 순서 섞기(2026-11-18 D 지적 ③): 순위 번호 없음, 같은 시리즈 다른 권은 붙지 않게
import { describe, expect, test } from "@jest/globals";
import { mixPopular, seriesKey } from "../popularMix";
import type { Book } from "../deps";

const book = (title: string, i: number) => ({ isbn13: `978000000000${i}`, title, cover_url: null }) as unknown as Book;

describe("popularMix", () => {
  test("series key drops trailing volume marks", () => {
    expect(seriesKey("화산귀환 9")).toBe("화산귀환");
    expect(seriesKey("화산귀환 10")).toBe("화산귀환");
    expect(seriesKey("토지 3권")).toBe("토지");
    expect(seriesKey("트렌드 코리아 2027")).toBe("트렌드 코리아");
    expect(seriesKey("모순")).toBe("모순");
  });

  test("keeps every book once", () => {
    const books = ["가", "나", "다", "라", "마"].map(book);
    const out = mixPopular(books, () => 0.3);
    expect(out.map((b) => b.title).sort()).toEqual(["가", "나", "다", "라", "마"]);
  });

  test("same-series volumes are not placed next to each other", () => {
    const books = ["모순", "화산귀환 9", "화산귀환 10", "렛뎀 이론", "화산귀환 11"].map(book);
    for (const seed of [0, 0.2, 0.5, 0.8, 0.99]) {
      const out = mixPopular(books, () => seed);
      for (let i = 1; i < out.length; i++) {
        expect(seriesKey(out[i]!.title)).not.toBe(seriesKey(out[i - 1]!.title));
      }
    }
  });
});
