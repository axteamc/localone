// VISIT-4-P3 도서관 룩 — contracts/local-feed.md VISIT-4 P5 (VISIT-4-P3 행), V4-8~V4-10, V4-O5, 명세 결정 4
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { StyleSheet, Text } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import { contrastRatio, getTheme, theme, type LookPreset } from "../../../theme";
import * as api from "../api";
import type { FeedItem, FeedPost, Post } from "../api";
import { PostCard } from "../PostCard";
import { PostDetail } from "../PostDetail";
import { resetLibraryLookCache, toLook, useCurrentTheme, useLibraryLook } from "../useLibraryLook";
import { VisitScreen } from "../VisitScreen";

declare const __dirname: string;
const fs = require("fs") as { existsSync(f: string): boolean; readFileSync(f: string, enc: "utf8"): string };
const path = require("path") as { join(...p: string[]): string };

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({ addListener: () => () => undefined }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
jest.mock("../imagePicker", () => ({ pickPostImage: jest.fn(), canUseCamera: jest.fn(() => true), buildImageFormData: jest.fn() }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
  fetchAvailabilityAt: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchShelf: jest.fn(),
  fetchLibraryFeedItems: jest.fn(),
  fetchTodayStamp: jest.fn(),
  fetchPost: jest.fn(),
  fetchBookPosts: jest.fn(),
  fetchLibraryPosts: jest.fn(),
}));
jest.mock("../../../lib/visits", () => ({ recordVisit: jest.fn(), getDefaultLibrary: jest.fn() }));

const fetchLibrary = jest.mocked(publicApi.fetchLibrary);
const LOOKS: LookPreset[] = ["modern", "warm", "toffee", "oxford"];
const LOOK_OF: Record<number, unknown> = { 101: "oxford", 102: "toffee", 103: "modern" };

function lib(id: number, look: unknown = LOOK_OF[id]): LibraryDetail {
  return {
    id, name: `도서관${id}`, address: null, latitude: null, longitude: null, dtl_region_code: null, area_label: null,
    distance_m: null, tel: null, homepage: null, operating_time_text: null, closed_text: null,
    today: { date: "2026-11-24", is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false },
    ...({ look } as object),
  } as LibraryDetail;
}

function feedPost(id: string, libraryId = 103): FeedPost {
  return {
    id, library_id: libraryId, library_name: `도서관${libraryId}`, image_kind: "color", image_url: null,
    image_color: "fill2", overlay_text: `글자 ${id}`, book: null, published_at: "2026-11-24T09:00:00+09:00",
    my_reaction: false, my_bookmark: false,
  };
}

function detailPost(libraryId: number): Post {
  return {
    id: "p9", library: { id: libraryId, name: `도서관${libraryId}` }, book: null, image_kind: "color", image_url: null,
    image_color: "fill2", overlay_text: "이어 읽기 글", body: "본문", author: { nickname: "이웃" }, is_mine: false,
    reaction_count: 0, my_reaction: false, my_bookmark: false, published_at: "2026-11-17T12:00:00+09:00",
  };
}

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

beforeEach(async () => {
  jest.clearAllMocks();
  resetLibraryLookCache();
  await AsyncStorage.clear();
  jest.mocked(useAuth).mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
  fetchLibrary.mockImplementation(async (id) => lib(id));
  jest.mocked(visits.recordVisit).mockResolvedValue({
    counted: false, isFirst: false, previousVisitedOn: null,
    record: { libraryId: 103, count: 2, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-24", streakDays: 1, defaultAsked: true },
  });
  jest.mocked(visits.getDefaultLibrary).mockResolvedValue(null);
  jest.mocked(api.fetchTodayStamp).mockResolvedValue({ stamped: false, stamp: null });
  jest.mocked(api.fetchShelf).mockResolvedValue({ pages: [] });
  jest.mocked(publicApi.fetchAvailabilityAt).mockResolvedValue({ items: [] } as never);
  jest.mocked(api.fetchBookPosts).mockResolvedValue({ items: [], next_cursor: null } as never);
  jest.mocked(api.fetchLibraryPosts).mockResolvedValue({ items: [], next_cursor: null } as never);
});

function LookProbe({ libraryId }: { libraryId: number }) {
  const t = useLibraryLook(libraryId);
  return <Text testID="look">{t.look}</Text>;
}

describe("VISIT-4-P3 도서관 룩", () => {
  test("unknown or null look falls back to warm", async () => {
    expect(toLook(null)).toBe("warm");
    expect(toLook("neon")).toBe("warm");
    expect(toLook(undefined)).toBe("warm");
    expect(toLook("oxford")).toBe("oxford");
    for (const look of [null, "neon"]) {
      resetLibraryLookCache();
      fetchLibrary.mockResolvedValueOnce(lib(201, look));
      const view = await render(<LookProbe libraryId={201} />);
      await waitFor(() => expect(fetchLibrary).toHaveBeenCalled());
      expect(screen.getByTestId("look").props.children).toBe("warm");
      await view.unmount();
    }
    // 못 읽어도 warm
    resetLibraryLookCache();
    fetchLibrary.mockRejectedValueOnce(new Error("down"));
    await render(<LookProbe libraryId={202} />);
    await waitFor(() => expect(fetchLibrary).toHaveBeenCalledWith(202));
    expect(screen.getByTestId("look").props.children).toBe("warm");
  });

  test("library switch drops late look response", async () => {
    let resolveOld!: (v: LibraryDetail) => void;
    fetchLibrary.mockImplementationOnce(() => new Promise((res) => (resolveOld = res)));
    const view = await render(<LookProbe libraryId={101} />);
    await view.rerender(<LookProbe libraryId={103} />);
    await waitFor(() => expect(screen.getByTestId("look").props.children).toBe("modern"));
    await act(async () => {
      resolveOld(lib(101));
      await Promise.resolve();
    });
    expect(screen.getByTestId("look").props.children).toBe("modern");
  });

  test("continue reading keeps visiting library look", async () => {
    // 방문 101(oxford)에서 102(toffee) 글을 이어 읽기로 연다 → 상세는 oxford 토큰
    jest.mocked(api.fetchPost).mockResolvedValue(detailPost(102));
    await render(<PostDetail postId="p9" visitLibraryId={101} />);
    await screen.findByText("이어 읽기 글");
    const oxford = getTheme("oxford");
    await waitFor(() => expect(flat(screen.getByTestId("post-detail")).backgroundColor).toBe(oxford.colors.panelFrosted));
    expect(fetchLibrary).toHaveBeenCalledWith(101);
    expect(fetchLibrary).not.toHaveBeenCalledWith(102);
  });

  test("all looks keep body text contrast", () => {
    // 본문 글자(text·inkStrong·inkSoft)는 방문 페이지의 판·카드·바탕 어디서나 4.5:1 이상(V4-10)
    for (const look of LOOKS) {
      const c = getTheme(look).colors;
      for (const fg of [c.text, c.inkStrong, c.inkSoft]) {
        for (const bg of [c.bg, c.paper, c.panelFrosted, c.panelLit, c.cream]) {
          expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  test("visit page uses look tokens for cards radii and shelf", async () => {
    const items: FeedItem[] = [
      { kind: "post", post: feedPost("p1") },
      { kind: "guestbook", guestbook: { id: "g1", library_id: 103, body: "다녀가요", author_nickname: "이웃", published_at: "2026-11-24T08:00:00+09:00", mine: false } },
      { kind: "stamp", stamp: { id: "s1", library_id: 103, stamped_on: "2026-11-24", author_nickname: "책벌레", published_at: "2026-11-24T07:00:00+09:00", mine: false, my_bookmark: false } },
    ];
    jest.mocked(api.fetchLibraryFeedItems).mockResolvedValue({ items, next_cursor: null });
    jest.mocked(api.fetchShelf).mockResolvedValue({
      pages: [{ kind: "popular", title: "인기", basis_label: null, books: [{ isbn13: "9788936434120", title: "소년이 온다", author: "한강", cover_url: null }] }],
    });
    await render(<VisitScreen libraryId={103} distanceM={null} />);
    await screen.findByTestId("stamp-card-s1");
    const m = getTheme("modern");
    await waitFor(() => expect(flat(screen.getByTestId("visit-screen")).backgroundColor).toBe(m.colors.panelFrosted));
    expect(flat(screen.getByTestId("post-card-p1")).borderRadius).toBe(m.radii.card);
    expect(m.radii.card).toBe(6);
    const guest = flat(screen.getByTestId("guestbook-card-g1"));
    const stamp = flat(screen.getByTestId("stamp-card-s1"));
    expect(guest.borderRadius).toBe(m.radii.infoCard);
    expect(stamp.borderRadius).toBe(m.radii.infoCard);
    expect(stamp.backgroundColor).toBe(m.colors.paper);
    expect(flat(screen.getByTestId("stamp-seal")).borderColor).toBe(m.colors.inkStrong);
    expect(flat(screen.getByTestId("bookshelf")).backgroundColor).toBe(m.colors.surface2);
    expect(flat(screen.getByTestId("stamp-button")).backgroundColor).toBe(m.colors.panelLit);
    // 기본 룩과 실제로 다른 값인지(일부만 바꾸면 실패)
    expect(m.colors.inkStrong).not.toBe(theme.colors.inkStrong);
    expect(m.radii.infoCard).not.toBe(theme.radii.infoCard);
  });

  test("home and compose keep default look", async () => {
    jest.mocked(api.fetchLibraryFeedItems).mockResolvedValue({ items: [], next_cursor: null });
    const visit = await render(<VisitScreen libraryId={101} distanceM={null} />);
    await waitFor(() => expect(flat(screen.getByTestId("visit-screen")).backgroundColor).toBe(getTheme("oxford").colors.panelFrosted));
    await visit.unmount();
    // 홈 하단 창은 B의 PostCard를 Provider 밖에서 쓴다 → 기본 룩
    function Outside() {
      return (
        <>
          <Text testID="outside-look">{useCurrentTheme().look}</Text>
          <PostCard post={feedPost("h1", 101)} onPress={() => undefined} width={160} />
        </>
      );
    }
    await render(<Outside />);
    expect(screen.getByTestId("outside-look").props.children).toBe(theme.look);
    expect(flat(screen.getByTestId("post-card-h1")).borderRadius).toBe(theme.radii.card);
    // 글쓰기·홈 화면 코드는 룩을 읽지 않는다(V4-8)
    const root = path.join(__dirname, "..", "..");
    for (const f of ["local-feed/ComposeScreen.tsx", "library-visit/HomeScreen.tsx", "library-visit/HomeSheet.tsx"]) {
      const file = path.join(root, f);
      if (fs.existsSync(file)) expect(fs.readFileSync(file, "utf8")).not.toMatch(/useLibraryLook|LibraryLookProvider/);
    }
  });
});
