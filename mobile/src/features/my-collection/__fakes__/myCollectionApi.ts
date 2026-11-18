// 계약 MY-1 C7의 가짜 응답(앱 시험·서버 없이 화면 보기용). 서버 MY-1-P1은 같은 브랜치에 있다.
import type { MyCollectionPage, MyCollectionPost, MyProfile } from "../api";

export const FAKE_PROFILE: MyProfile = {
  user_id: "00000000-0000-4000-8000-00000000000a",
  nickname: "이웃-0000",
  bio: "동네 도서관 산책을 좋아해요",
  avatar_url: null,
  updated_at: "2026-11-17T09:00:00+09:00",
};

export const FAKE_POST: MyCollectionPost = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  library_id: 101,
  library_name: "정독도서관",
  image_kind: "color",
  image_url: null,
  image_color: "fill2",
  overlay_text: "마음에 남은 문장",
  book: { isbn13: "9788936434120", title: "소년이 온다", author: "한강" },
  published_at: "2026-11-15T19:20:00+09:00",
  my_reaction: true,
  my_bookmark: false,
  item_kind: "post",
  collected_at: "2026-11-16T10:00:00+09:00",
};

export const FAKE_PAGE: MyCollectionPage = { items: [FAKE_POST], next_cursor: null };

/** 시험용: id만 바꾼 카드 */
export function fakePost(id: string, extra: Partial<MyCollectionPost> = {}): MyCollectionPost {
  return { ...FAKE_POST, id, overlay_text: `글자 ${id}`, ...extra };
}

export function fakePage(items: MyCollectionPost[], next_cursor: string | null = null): MyCollectionPage {
  return { items, next_cursor };
}
