// VISIT-3-P3 방명록 카드·쓰기·혼합 피드 — contracts/local-feed.md VISIT-3 P5 (VISIT-3-P3 행), 명세 결정 2·3·예외 #1~#4
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import * as api from "../api";
import type { FeedItem, FeedPost, GuestbookItem } from "../api";
import { FeedItemCard } from "../FeedItemCard";
import { GUESTBOOK_CARD_TEXT, guestbookTime } from "../GuestbookCard";
import { COMPOSE_TEXT } from "../ComposeChooser";
import { VisitScreen } from "../VisitScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush, canGoBack: () => true }),
  useNavigation: () => ({ addListener: () => () => undefined }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
let mockUuid = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, "0")}` }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchShelf: jest.fn(async () => ({ pages: [] })),
  fetchLibraryFeedItems: jest.fn(),
  withdrawGuestbook: jest.fn(),
}));
jest.mock("../../../lib/visits", () => ({ recordVisit: jest.fn(), getDefaultLibrary: jest.fn() }));

const fetchItems = jest.mocked(api.fetchLibraryFeedItems);
const withdrawGuestbook = jest.mocked(api.withdrawGuestbook);

function lib(id: number): LibraryDetail {
  return {
    id, name: id === 101 ? "정독도서관" : "종로도서관", address: null, latitude: null, longitude: null,
    dtl_region_code: null, area_label: null, distance_m: null, tel: null, homepage: null, operating_time_text: null,
    closed_text: null, today: { date: "2026-11-19", is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false },
  };
}

function gb(id: string, extra: Partial<GuestbookItem> = {}): GuestbookItem {
  return {
    id, library_id: 101, body: `한마디 ${id}`, author_nickname: "책벌레", published_at: "2026-11-19T10:00:00+09:00",
    mine: false, ...extra,
  };
}

function post(id: string): FeedPost {
  return {
    id, library_id: 101, library_name: "정독도서관", image_kind: "color", image_url: null, image_color: "fill2",
    overlay_text: `글자 ${id}`, book: null, published_at: "2026-11-19T09:00:00+09:00", my_reaction: false,
    my_bookmark: false,
  };
}

const gbItem = (g: GuestbookItem): FeedItem => ({ kind: "guestbook", guestbook: g });
const postItem = (p: FeedPost): FeedItem => ({ kind: "post", post: p });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setAuth(status: "signedIn" | "signedOut") {
  jest.mocked(useAuth).mockReturnValue({ status } as unknown as ReturnType<typeof useAuth>);
}

async function enter(items: FeedItem[] = []) {
  fetchItems.mockResolvedValue({ items, next_cursor: null });
  await render(<VisitScreen libraryId={101} distanceM={null} />);
  await screen.findByText("정독도서관");
}

const network = () => new publicApi.ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");

beforeEach(() => {
  jest.clearAllMocks();
  setAuth("signedIn");
  jest.mocked(publicApi.fetchLibrary).mockImplementation(async (id) => lib(id));
  jest.mocked(visits.recordVisit).mockResolvedValue({
    counted: false, isFirst: false, previousVisitedOn: null,
    record: { libraryId: 101, count: 2, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-19", streakDays: 1,
      defaultAsked: true },
  });
  jest.mocked(visits.getDefaultLibrary).mockResolvedValue(null);
});

describe("VISIT-3-P3 혼합 피드", () => {
  test("feed item card ignores unknown kinds", async () => {
    const view = await render(
      <FeedItemCard item={{ kind: "club", club: { id: "c1" } }} width={160} onOpenPost={jest.fn()} />
    );
    expect(view.toJSON()).toBeNull();
    await enter([{ kind: "club", club: { id: "c1" } }, gbItem(gb("g1")), postItem(post("p1"))]);
    expect(await screen.findByTestId("guestbook-card-g1")).toBeTruthy();
    expect(screen.getByTestId("post-card-p1")).toBeTruthy();
  });

  test("visit feed loads #32 and mixes guestbook cards with posts", async () => {
    await enter([gbItem(gb("g1")), postItem(post("p1"))]);
    expect(fetchItems).toHaveBeenCalledWith(101, { cursor: null }, expect.anything());
    expect(await screen.findByText("한마디 g1")).toBeTruthy();
    expect(screen.getByText(GUESTBOOK_CARD_TEXT.tag)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("post-card-p1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: "p1", libraryId: "101" } });
  });

  test("visit feed keeps a valid club card and opens its detail", async () => {
    await enter([
      { kind: "club", club: {
        id: "c1", library_id: 101, name: "[시연] 동네 책 이야기", starts_at: null, place: null,
        status: "open", participant_count: 0, capacity: null, published_at: "2026-11-19T10:00:00+09:00",
      } },
      gbItem(gb("g1")),
      postItem(post("p1")),
    ]);
    const clubCard = await screen.findByTestId("club-card-c1");
    expect(screen.getByTestId("guestbook-card-g1")).toBeTruthy();
    expect(screen.getByTestId("post-card-p1")).toBeTruthy();
    await fireEvent.press(clubCard);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/clubs/[clubId]", params: { clubId: "c1" } });
  });

  test("library switch drops late feed response", async () => {
    const first = deferred<api.FeedItemPage>();
    const second = deferred<api.FeedItemPage>();
    fetchItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await render(<VisitScreen libraryId={101} distanceM={null} />);
    await view.rerender(<VisitScreen libraryId={102} distanceM={null} />);
    await act(async () => second.resolve({ items: [gbItem(gb("g102", { library_id: 102 }))], next_cursor: null }));
    await act(async () => first.resolve({ items: [gbItem(gb("g101"))], next_cursor: null }));
    expect(await screen.findByTestId("guestbook-card-g102")).toBeTruthy();
    expect(screen.queryByTestId("guestbook-card-g101")).toBeNull();
  });
});

describe("C-92 + 작은 카드(게시물·모임)", () => {
  test("plus opens a two-item popover without guestbook and routes post/club", async () => {
    await enter();
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    const pop = screen.getByTestId("compose-chooser");
    expect(within(pop).getByText(COMPOSE_TEXT.choosePost)).toBeTruthy();
    expect(within(pop).getByText(COMPOSE_TEXT.chooseClub)).toBeTruthy();
    expect(screen.queryByText("방명록 남기기")).toBeNull(); // 한마디는 스탬프 ▾ 메뉴로(V4-O6)
    await fireEvent.press(within(pop).getByText(COMPOSE_TEXT.choosePost));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/new", params: { libraryId: "101" } });
    expect(screen.queryByTestId("compose-chooser")).toBeNull();
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    await fireEvent.press(screen.getByText(COMPOSE_TEXT.chooseClub));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/clubs/new", params: { libraryId: "101" } });
  });

  test("tapping outside or plus again closes the popover", async () => {
    await enter();
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    await fireEvent.press(screen.getByTestId("compose-scrim"));
    expect(screen.queryByTestId("compose-chooser")).toBeNull();
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    expect(screen.getByLabelText("글쓰기").props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    expect(screen.queryByTestId("compose-chooser")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("signed out picks show the login sheet without moving", async () => {
    setAuth("signedOut");
    await enter();
    await fireEvent.press(screen.getByLabelText("글쓰기"));
    await fireEvent.press(screen.getByText(COMPOSE_TEXT.chooseClub));
    expect(screen.getByTestId("visit-login-sheet")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("VISIT-3-P3 방명록 카드", () => {
  test("guestbook menus are visible on both cards and my withdrawal asks first", async () => {
    await enter([gbItem(gb("mine", { mine: true })), gbItem(gb("other"))]);
    await screen.findByTestId("guestbook-card-other");
    expect(screen.getAllByLabelText(GUESTBOOK_CARD_TEXT.menuLabel)).toHaveLength(2);
    withdrawGuestbook.mockResolvedValue(undefined);
    const ownMenu = within(screen.getByTestId("guestbook-card-mine")).getByLabelText(GUESTBOOK_CARD_TEXT.menuLabel);
    await fireEvent.press(ownMenu);
    expect(screen.getByText(GUESTBOOK_CARD_TEXT.menuTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
    expect(screen.getByText(GUESTBOOK_CARD_TEXT.confirmTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.cancel));
    expect(withdrawGuestbook).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
    const pending = deferred<void>();
    withdrawGuestbook.mockReturnValueOnce(pending.promise);
    const confirm = screen.getByText(GUESTBOOK_CARD_TEXT.withdraw);
    await fireEvent.press(confirm);
    await fireEvent.press(confirm); // 지우는 중에 또 눌러도 한 번
    expect(withdrawGuestbook).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(withdrawGuestbook).toHaveBeenCalledWith("mine");
    expect(await screen.findByText(GUESTBOOK_CARD_TEXT.withdrawn)).toBeTruthy();
    expect(screen.queryByTestId("guestbook-card-mine")).toBeNull();
    expect(screen.getByTestId("guestbook-card-other")).toBeTruthy();
  });

  test("withdraw failure keeps card and missing entry reloads feed", async () => {
    await enter([gbItem(gb("mine", { mine: true }))]);
    await screen.findByTestId("guestbook-card-mine");
    const calls = fetchItems.mock.calls.length;
    withdrawGuestbook.mockRejectedValueOnce(network());
    await fireEvent.press(screen.getByLabelText(GUESTBOOK_CARD_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
    expect(await screen.findByText(GUESTBOOK_CARD_TEXT.withdrawFailed)).toBeTruthy();
    expect(screen.getByTestId("guestbook-card-mine")).toBeTruthy();
    expect(fetchItems.mock.calls.length).toBe(calls); // 끊김은 다시 받지 않는다
    withdrawGuestbook.mockRejectedValueOnce(new publicApi.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", "entry_id"));
    fetchItems.mockResolvedValueOnce({ items: [], next_cursor: null });
    await fireEvent.press(screen.getByLabelText(GUESTBOOK_CARD_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
    await fireEvent.press(screen.getByText(GUESTBOOK_CARD_TEXT.withdraw));
    await waitFor(() => expect(fetchItems.mock.calls.length).toBe(calls + 1));
  });

  test("guestbook card shows full body and relative time", async () => {
    const now = Date.parse("2026-11-19T15:00:00+09:00");
    expect(guestbookTime("2026-11-19T14:59:30+09:00", now)).toBe("방금");
    expect(guestbookTime("2026-11-19T14:35:00+09:00", now)).toBe("25분 전");
    expect(guestbookTime("2026-11-19T12:00:00+09:00", now)).toBe("3시간 전");
    expect(guestbookTime("2026-11-18T23:30:00+09:00", now)).toBe("어제");
    expect(guestbookTime("2026-11-16T10:00:00+09:00", now)).toBe("3일 전");
    expect(guestbookTime("2026-11-11T10:00:00+09:00", now)).toBe("2026.11.11");
    // 자정 넘김: 어제 23시 → 오늘 0시 10분은 "어제"(시간 차가 아니라 KST 날짜로)
    expect(guestbookTime("2026-11-18T23:00:00+09:00", Date.parse("2026-11-19T00:10:00+09:00"))).toBe("어제");
    const body = "가".repeat(140);
    await render(
      <FeedItemCard item={gbItem(gb("long", { body }))} width={160} onOpenPost={jest.fn()} />
    );
    expect(screen.getByText(body)).toBeTruthy(); // 자르지 않는다
    expect(screen.getByText(body).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(/^책벌레 · /)).toBeTruthy();
  });
});
