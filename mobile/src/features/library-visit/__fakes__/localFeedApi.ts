// TODO(연결): B LOCAL-2-P1·P3 — `mobile/src/features/local-feed/api.ts`가 머지되기 전까지 쓰는 가짜 값.
// 모양은 contracts/local-feed.md LOCAL-2 C2·C3 그대로, 값은 library-visit.md VISIT-1b C7 그대로.
// 머지되면 useHomeFeed의 import만 `../local-feed/api`로 바꾸고 이 파일은 시험용 가짜 응답만 남긴다.

export type FeedPost = {
  id: string;
  library_id: number;
  library_name: string;
  image_kind: "photo" | "cover" | "color";
  image_url: string | null;
  /** 토큰 이름(예: "fill2") */
  image_color: string | null;
  overlay_text: string | null;
  book: { isbn13: string; title: string; author: string | null } | null;
  published_at: string;
  my_reaction: boolean;
  my_bookmark: boolean;
};

export type FeedPage = { items: FeedPost[]; next_cursor: string | null };

/** VISIT-1b C7 #26 가짜 응답 */
export const FAKE_FEED_PAGE: FeedPage = {
  items: [
    {
      id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      library_id: 101,
      library_name: "정독도서관",
      image_kind: "color",
      image_url: null,
      image_color: "fill2",
      overlay_text: "마음에 남은 문장",
      book: { isbn13: "9788936434120", title: "소년이 온다", author: "한강" },
      published_at: "2026-11-15T19:20:00+09:00",
      my_reaction: false,
      my_bookmark: false,
    },
  ],
  next_cursor: null,
};

/** #26 `GET /api/v1/libraries/{library_id}/posts?sort=latest&cursor=&limit=` (B `fetchLibraryPosts` 시그니처 그대로) */
export async function fetchLibraryPosts(
  libraryId: number,
  _page: { cursor: string | null; limit?: number },
  _signal?: AbortSignal
): Promise<FeedPage> {
  return libraryId === 101 ? FAKE_FEED_PAGE : { items: [], next_cursor: null };
}
