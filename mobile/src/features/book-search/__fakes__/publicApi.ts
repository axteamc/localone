// TODO(연결): D LIB-0-P2 — 서버 #7·#8·#9가 머지되면 이 파일을 지우고 `../../../lib/publicApi`의 같은 함수를 쓴다.
// 타입·오류는 이미 `lib/publicApi`(APP-0-P1)의 것을 쓴다. 함수 시그니처는 core.md APP-0 C2 그대로다.
// 응답 값은 core.md LIB-0 C7 가짜 값(Book 2개)에서 시작하고, 화면 확인용 책 몇 권을 같은 모양으로 더했다.

import { ApiCallError } from "../../../lib/publicApi";
import type {
  Book,
  BookSearchResponse,
  RecommendationResponse,
} from "../../../lib/publicApi";

export { ApiCallError };
export type { Book, BookSearchResponse, RecommendationResponse };

// core.md LIB-0 C7의 Book 2개(원문 그대로)
const CANONICAL: Book[] = [
  {
    isbn13: "9788936434120",
    title: "소년이 온다",
    author: "한강",
    publisher: "창비",
    cover_url: "https://example.invalid/cover/9788936434120.jpg",
    source: "data4library",
    description: "1980년 5월 광주를 겪은 사람들의 이야기.",
    pub_year: 2014,
  },
  {
    isbn13: "9788954682152",
    title: "불편한 편의점",
    author: "김호연",
    publisher: "나무옆의자",
    cover_url: null,
    source: "data4library",
    description: null,
    pub_year: null,
  },
];

// 화면 확인용(같은 모양). 표지 주소는 모두 null — 글자 표지로 보인다.
const EXTRA: Array<[string, string, string, string, number | null]> = [
  ["9788983920775", "해리 포터와 마법사의 돌 (1)", "J.K. 롤링", "문학수첩", 2019],
  ["9788983920782", "해리 포터와 비밀의 방 (2)", "J.K. 롤링", "문학수첩", 2019],
  ["9788954692533", "스페어: 해리 왕자 자서전", "해리 왕자", "문학동네", 2023],
  ["9788925552385", "해리 쿼버트 사건의 진실 - 상", "조엘 디케르", "영림카디널", 2013],
  ["9791190000017", "해리의 모험", "김해리", "가나출판", 2020],
  ["9791190000024", "해리 이야기", "박해리", "다산", 2018],
  ["9791190000031", "해리와 도서관", "이도서", "책마을", 2021],
  ["9788934972464", "세이노의 가르침", "세이노", "데이원", 2023],
  ["9788936438838", "작별하지 않는다", "한강", "문학동네", 2021],
  ["9791191056556", "도둑맞은 집중력", "요한 하리", "어크로스", 2023],
];

const CATALOG: Book[] = [
  ...CANONICAL,
  ...EXTRA.map(([isbn13, title, author, publisher, pub_year]) => ({
    isbn13,
    title,
    author,
    publisher,
    cover_url: null,
    source: "naver" as const,
    description: null,
    pub_year,
  })),
];

const PAGE = 20;

function delay<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(value), 300);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ApiCallError(0, "NETWORK", "aborted", ""));
    });
  });
}

export async function searchBooks(
  q: string,
  start = 1,
  signal?: AbortSignal
): Promise<BookSearchResponse> {
  const key = q.trim();
  const hits = CATALOG.filter(
    (b) => b.title.includes(key) || (b.author ?? "").includes(key)
  );
  const items = hits.slice(start - 1, start - 1 + PAGE);
  const next = start - 1 + PAGE < hits.length ? start + PAGE : null;
  return delay({ items, next_start: next, source: "naver", fallback_reason: null }, signal);
}

export async function fetchBook(isbn13: string, signal?: AbortSignal): Promise<Book> {
  const book = CATALOG.find((b) => b.isbn13 === isbn13);
  if (!book) {
    await delay(null, signal);
    throw new ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", "");
  }
  return delay(book, signal);
}

export async function fetchRecommendations(
  _libraryId?: number,
  signal?: AbortSignal
): Promise<RecommendationResponse> {
  return delay(
    {
      kind: "popular",
      scope: "national",
      library_id: null,
      basis_label: "전국 · 최근 30일 대출",
      theme: null,
      books: [CANONICAL[1]!, CATALOG[9]!, CANONICAL[0]!, CATALOG[11]!, CATALOG[10]!, CATALOG[2]!],
      fetched_at: "2026-11-16T06:00:00+09:00",
      stale: false,
      fallback_reason: null,
    },
    signal
  );
}

// LIB-2에서 쓰는 소장 조회. LIB-1 화면은 부르지 않는다(B6). 테스트가 "0번 불렸음"을 확인하는 데 쓴다.
export async function fetchAvailabilityNearby(): Promise<never> {
  throw new ApiCallError(0, "NETWORK", "LIB-1에서는 부르지 않는다", "");
}
