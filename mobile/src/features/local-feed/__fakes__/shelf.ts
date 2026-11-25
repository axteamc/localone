// VISIT-3 책장 시험용 가짜 값(contracts/local-feed.md VISIT-3 C7 `#31` 가짜 값 + 세 장 묶음, 2026-11-25 C-92 3장 체제)
import type { ShelfPage, ShelfResponse } from "../api";

export const POPULAR_PAGE: ShelfPage = {
  kind: "popular",
  title: "인기 도서",
  basis_label: "YES24 베스트셀러",
  books: [
    { isbn13: "9788936434120", title: "소년이 온다", author: "한강", cover_url: null },
    { isbn13: "9788954682152", title: "작별하지 않는다", author: "한강", cover_url: null },
    { isbn13: "9791190090018", title: "아몬드", author: "손원평", cover_url: null },
  ],
};

export const RECENT_PAGE: ShelfPage = {
  kind: "recent_reads",
  title: "최근 대출 도서",
  basis_label: "정독도서관 · 최근 30일 대출",
  books: [
    { isbn13: "9788937460449", title: "데미안", author: "헤르만 헤세", cover_url: "https://img.test/demian.jpg" },
    { isbn13: "9788954651134", title: "채식주의자", author: "한강", cover_url: null },
  ],
};

export const THEME_PAGE: ShelfPage = {
  kind: "theme",
  title: "비 오는 날 읽기 좋은 책",
  basis_label: null,
  books: [
    { isbn13: "9788954677158", title: "밝은 밤", author: "최은영", cover_url: null },
    { isbn13: "9788954672214", title: "시선으로부터,", author: "정세랑", cover_url: null },
    { isbn13: "9788954632089", title: "쇼코의 미소", author: "최은영", cover_url: null },
  ],
};

/** C7 가짜 값 그대로(인기 도서 한 장) */
export const SHELF_C7: ShelfResponse = { pages: [POPULAR_PAGE] };
