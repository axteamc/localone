// VISIT-4-P2 "다녀왔어요" 버튼·스탬프 카드 — contracts/local-feed.md VISIT-4 P5 (VISIT-4-P2 행), V4-O1~V4-O4, 명세 결정 1~3·예외 #1~#4
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import * as api from "../api";
import type { FeedItem, FeedItemPage, FeedPost, StampItem, TodayStamp } from "../api";
import { FeedItemCard } from "../FeedItemCard";
import { STAMP_TEXT } from "../StampButton";
import { STAMP_CARD_TEXT } from "../StampCard";
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
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn(), registerSignOutCleanup: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchShelf: jest.fn(async () => ({ pages: [] })),
  fetchLibraryFeedItems: jest.fn(),
  fetchTodayStamp: jest.fn(),
  putTodayStamp: jest.fn(),
  setStampBookmark: jest.fn(),
  reportTarget: jest.fn(),
}));
jest.mock("../../../lib/visits", () => ({ recordVisit: jest.fn(), getDefaultLibrary: jest.fn() }));

const fetchItems = jest.mocked(api.fetchLibraryFeedItems);
const fetchToday = jest.mocked(api.fetchTodayStamp);
const putToday = jest.mocked(api.putTodayStamp);
const setStampBookmark = jest.mocked(api.setStampBookmark);

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const STAMP_ID = "aaaaaaaa-0000-4000-8000-000000000001";

function lib(id: number): LibraryDetail {
  return {
    id, name: id === 101 ? "정독도서관" : "종로도서관", address: null, latitude: null, longitude: null,
    dtl_region_code: null, area_label: null, distance_m: null, tel: null, homepage: null, operating_time_text: null,
    closed_text: null, today: { date: "2026-11-24", is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false },
  };
}

function post(id: string, publishedAt = "2026-11-24T09:00:00+09:00"): FeedPost {
  return {
    id, library_id: 101, library_name: "정독도서관", image_kind: "color", image_url: null, image_color: "fill2",
    overlay_text: `글자 ${id}`, book: null, published_at: publishedAt, my_reaction: false, my_bookmark: false,
  };
}

function stampItem(id: string, extra: Partial<StampItem> = {}): StampItem {
  return {
    id, library_id: 101, stamped_on: "2026-11-24", author_nickname: "책벌레", published_at: "2026-11-24T10:00:00+09:00",
    mine: false, my_bookmark: false, ...extra,
  };
}

const postItem = (p: FeedPost): FeedItem => ({ kind: "post", post: p });
const stampFeed = (s: StampItem): FeedItem => ({ kind: "stamp", stamp: s });
const page = (items: FeedItem[]): FeedItemPage => ({ items, next_cursor: null });

const none: TodayStamp = { stamped: false, stamp: null };
const today = (visibility: "private" | "public", id = STAMP_ID, body: string | null = null): TodayStamp => ({
  stamped: true, stamp: { id, stamped_on: "2026-11-24", visibility, body },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setAuth(status: "signedIn" | "signedOut", userId: string | null = status === "signedIn" ? USER_A : null) {
  jest.mocked(useAuth).mockReturnValue({ status, userId } as unknown as ReturnType<typeof useAuth>);
}

async function enter(items: FeedItem[] = [postItem(post("p1"))], libraryId = 101) {
  fetchItems.mockResolvedValue(page(items));
  const view = await render(<VisitScreen libraryId={libraryId} distanceM={null} />);
  await screen.findByText(libraryId === 101 ? "정독도서관" : "종로도서관");
  return view;
}

const shownStampIds = () => screen.queryAllByTestId(/^stamp-card-/).map((n) => String(n.props.testID).slice(11));
const noticeText = () => screen.queryByTestId("visit-notice");
const network = () => new publicApi.ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
const serverDown = () => new publicApi.ApiCallError(503, "UPSTREAM_UNAVAILABLE", "잠시 후 다시 시도해 주세요.", "");

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setAuth("signedIn");
  jest.mocked(publicApi.fetchLibrary).mockImplementation(async (id) => lib(id));
  jest.mocked(visits.recordVisit).mockResolvedValue({
    counted: false, isFirst: false, previousVisitedOn: null,
    record: { libraryId: 101, count: 2, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-24", streakDays: 1,
      defaultAsked: true },
  });
  jest.mocked(visits.getDefaultLibrary).mockResolvedValue(null);
  fetchToday.mockResolvedValue(none);
});

describe("VISIT-4-P2 다녀왔어요 버튼", () => {
  test("stamp press saves private at once and toast switches to public", async () => {
    putToday.mockResolvedValueOnce(today("private")).mockResolvedValueOnce(today("public"));
    await enter();
    expect(fetchToday).toHaveBeenCalledWith(101, expect.anything());
    await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
    expect(putToday).toHaveBeenNthCalledWith(1, 101, "private", undefined, undefined);
    expect(screen.queryByTestId("stamp-menu")).toBeNull(); // 고르는 창 없음
    expect(await screen.findByText(STAMP_TEXT.privateNotice)).toBeTruthy();
    expect(screen.getByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
    expect(screen.queryByText(STAMP_TEXT.button)).toBeNull();

    fetchItems.mockResolvedValue(page([stampFeed(stampItem(STAMP_ID, { mine: true, published_at: "2026-11-24T10:00:00+09:00" })), postItem(post("p1"))]));
    await fireEvent.press(screen.getByText(STAMP_TEXT.toPublic));
    expect(putToday).toHaveBeenNthCalledWith(2, 101, "public", STAMP_ID, undefined);
    expect(await screen.findByText(STAMP_TEXT.savedPublic)).toBeTruthy();
    await waitFor(() => expect(shownStampIds()).toEqual([STAMP_ID]));
    expect(screen.getByText(STAMP_TEXT.labelPublic)).toBeTruthy();
    expect(putToday).toHaveBeenCalledTimes(2);
  });

  test("stamp button press sets visibility once", async () => {
    const pending = deferred<TodayStamp>();
    putToday.mockReturnValueOnce(pending.promise);
    await enter();
    const button = await screen.findByText(STAMP_TEXT.button);
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(putToday).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(today("private")));
    expect(await screen.findByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
    expect(putToday).toHaveBeenCalledTimes(1);
  });

  test("rapid double tap on toast public keeps one public card", async () => {
    putToday.mockResolvedValueOnce(today("private"));
    await enter();
    await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
    const pending = deferred<TodayStamp>();
    putToday.mockReturnValueOnce(pending.promise);
    fetchItems.mockResolvedValue(page([stampFeed(stampItem(STAMP_ID, { mine: true })), postItem(post("p1"))]));
    const action = await screen.findByText(STAMP_TEXT.toPublic);
    await fireEvent.press(action);
    // 안내는 누르면 닫히므로 두 번째 누름은 ⋯ 메뉴 쪽에서 들어와도 진행 중이면 무시된다
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPublic));
    expect(putToday).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(today("public")));
    await waitFor(() => expect(shownStampIds()).toEqual([STAMP_ID]));
    expect(screen.getByText(STAMP_TEXT.labelPublic)).toBeTruthy();
  });

  test("stamped today shows label and menu flips visibility", async () => {
    fetchToday.mockResolvedValue(today("private"));
    await enter();
    expect(await screen.findByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
    expect(screen.queryByText(STAMP_TEXT.button)).toBeNull();
    // C-89: 상태 글자 자체가 버튼(▾), 옆 ⋯ 없음. 누르면 아래 작은 메뉴에 항목 하나(시트·닫기 버튼 없음)
    const control = within(screen.getByTestId("stamp-control"));
    expect(control.getByText("▾")).toBeTruthy();
    expect(control.queryByText("⋯")).toBeNull();
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.menuLabel));
    // C-92 V4-O6: 공개 범위 + 한마디 두 항목
    expect(within(screen.getByTestId("stamp-menu")).getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.queryByText(STAMP_TEXT.close, { exact: true })).toBeNull();
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.close)); // 바깥 누르면 닫힘
    expect(screen.queryByTestId("stamp-menu")).toBeNull();

    putToday.mockResolvedValueOnce(today("public"));
    fetchItems.mockResolvedValue(page([stampFeed(stampItem(STAMP_ID, { mine: true })), postItem(post("p1"))]));
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPublic));
    expect(putToday).toHaveBeenLastCalledWith(101, "public", STAMP_ID, undefined);
    expect(await screen.findByText(STAMP_TEXT.labelPublic)).toBeTruthy();
    await waitFor(() => expect(shownStampIds()).toEqual([STAMP_ID]));

    putToday.mockResolvedValueOnce(today("private"));
    const slow = deferred<FeedItemPage>();
    fetchItems.mockReturnValueOnce(slow.promise);
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPrivate));
    expect(putToday).toHaveBeenLastCalledWith(101, "private", STAMP_ID, undefined);
    expect(await screen.findByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
    expect(shownStampIds()).toEqual([]); // 다시 받기 전에 바로 빠진다
    expect(screen.getByText(STAMP_TEXT.changedPrivate)).toBeTruthy();
    await act(async () => slow.resolve(page([postItem(post("p1"))])));
    expect(shownStampIds()).toEqual([]);
  });

  test("signed out stamp shows login sheet without request", async () => {
    setAuth("signedOut");
    await enter([stampFeed(stampItem("s-other")), postItem(post("p1"))]);
    await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
    expect(screen.getByTestId("stamp-login-sheet")).toBeTruthy();
    expect(screen.getByText(STAMP_TEXT.loginNeeded)).toBeTruthy();
    expect(screen.getByText(STAMP_TEXT.loginSub)).toBeTruthy();
    await fireEvent.press(screen.getByText(STAMP_TEXT.close));
    await fireEvent.press(screen.getByTestId("stamp-bookmark-s-other"));
    expect(screen.getByText(STAMP_CARD_TEXT.loginNeeded)).toBeTruthy();
    await fireEvent.press(screen.getByText(STAMP_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login" });
    expect(fetchToday).not.toHaveBeenCalled();
    expect(putToday).not.toHaveBeenCalled();
    expect(setStampBookmark).not.toHaveBeenCalled();
  });

  test("stamp failure keeps button and shows retry notice", async () => {
    putToday.mockRejectedValueOnce(serverDown());
    await enter();
    await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
    expect(await screen.findByText(STAMP_TEXT.failed)).toBeTruthy();
    expect(screen.getByText(STAMP_TEXT.button)).toBeTruthy();
    expect(screen.queryByText(STAMP_TEXT.labelPrivate)).toBeNull();
    expect(shownStampIds()).toEqual([]);
    expect(screen.getByTestId("post-card-p1")).toBeTruthy(); // 피드 그대로
    putToday.mockResolvedValueOnce(today("private"));
    await fireEvent.press(screen.getByText(STAMP_TEXT.button)); // 다시 누르면 다시 시도
    expect(await screen.findByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
  });

  test("visibility change failure keeps label and shows change notice", async () => {
    fetchToday.mockResolvedValue(today("private"));
    putToday.mockRejectedValueOnce(network());
    await enter();
    await fireEvent.press(await screen.findByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPublic));
    expect(await screen.findByText(STAMP_TEXT.changeFailed)).toBeTruthy();
    expect(screen.getByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
    expect(shownStampIds()).toEqual([]);
  });

  test("stamp waits for today read before accepting press", async () => {
    const read = deferred<TodayStamp>();
    fetchToday.mockReturnValueOnce(read.promise);
    await enter();
    await fireEvent.press(screen.getByText(STAMP_TEXT.button));
    expect(putToday).not.toHaveBeenCalled(); // 조회 완료 전 누름은 받지 않는다(이미 공개한 것을 덮지 않게)
    await act(async () => read.resolve(today("public")));
    expect(await screen.findByText(STAMP_TEXT.labelPublic)).toBeTruthy();
    expect(putToday).not.toHaveBeenCalled();
  });

  test("stamp does not touch device visit record", async () => {
    const saved = JSON.stringify({ 101: { libraryId: 101, count: 3 } });
    await AsyncStorage.setItem("localone:visits:v1", saved);
    putToday.mockResolvedValueOnce(today("private")).mockResolvedValueOnce(today("public"));
    await enter();
    const visitsBefore = jest.mocked(visits.recordVisit).mock.calls.length;
    await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
    await fireEvent.press(await screen.findByText(STAMP_TEXT.toPublic));
    await screen.findByText(STAMP_TEXT.labelPublic);
    expect(jest.mocked(visits.recordVisit).mock.calls.length).toBe(visitsBefore);
    expect(await AsyncStorage.getItem("localone:visits:v1")).toBe(saved);
  });

  test("stale visibility change 409 reloads today stamp and shows date notice", async () => {
    putToday
      .mockResolvedValueOnce(today("private"))
      .mockRejectedValueOnce(new publicApi.ApiCallError(409, "STAMP_DATE_CHANGED", "날짜가 바뀌었어요. 다시 확인해 주세요", ""));
    await enter();
    await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
    fetchToday.mockResolvedValue(none); // 자정이 지나 새 날짜
    await fireEvent.press(await screen.findByText(STAMP_TEXT.toPublic));
    expect(putToday).toHaveBeenLastCalledWith(101, "public", STAMP_ID, undefined);
    expect(await screen.findByText(STAMP_TEXT.dateChanged)).toBeTruthy();
    expect(await screen.findByText(STAMP_TEXT.button)).toBeTruthy();
    expect(fetchToday).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(STAMP_TEXT.labelPrivate)).toBeNull();
  });

  test("stale 409 from menu also reloads today stamp", async () => {
    fetchToday.mockResolvedValueOnce(today("public"));
    putToday.mockRejectedValueOnce(new publicApi.ApiCallError(409, "STAMP_DATE_CHANGED", "", ""));
    await enter();
    fetchToday.mockResolvedValue(none);
    await fireEvent.press(await screen.findByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPrivate));
    expect(putToday).toHaveBeenLastCalledWith(101, "private", STAMP_ID, undefined);
    expect(await screen.findByText(STAMP_TEXT.dateChanged)).toBeTruthy();
    expect(await screen.findByText(STAMP_TEXT.button)).toBeTruthy();
  });

  test("old scope cannot change current stamp or feed", async () => {
    const notices: api.StampNotice[] = [];
    const off = api.onStampNotice((n) => notices.push(n));
    try {
      // ① A의 "피드에도 남기기"가 날아가는 사이 B로 바뀌면, 늦게 온 A의 응답은 B의 표시·피드·문구를 바꾸지 못한다
      putToday.mockResolvedValueOnce(today("private"));
      const view = await enter();
      await fireEvent.press(await screen.findByText(STAMP_TEXT.button));
      const lateA = deferred<TodayStamp>();
      putToday.mockReturnValueOnce(lateA.promise);
      await fireEvent.press(await screen.findByText(STAMP_TEXT.toPublic));
      setAuth("signedIn", USER_B);
      fetchToday.mockResolvedValue(none);
      await view.rerender(<VisitScreen libraryId={101} distanceM={null} />);
      expect(await screen.findByText(STAMP_TEXT.button)).toBeTruthy();
      const feedCalls = fetchItems.mock.calls.length;
      await act(async () => lateA.resolve(today("public")));
      expect(screen.getByText(STAMP_TEXT.button)).toBeTruthy(); // B는 아직 안 찍음
      expect(screen.queryByText(STAMP_TEXT.labelPublic)).toBeNull();
      expect(noticeText()).toBeNull();
      expect(fetchItems.mock.calls.length).toBe(feedCalls); // A의 변경으로 B의 피드를 다시 받지 않음

      // ② B가 찍은 뒤 다른 도서관으로 옮기면, 이전 도서관의 안내를 실행해도 #36을 더 부르지 않는다
      putToday.mockResolvedValueOnce(today("private", "bbbbbbbb-0000-4000-8000-000000000002"));
      await fireEvent.press(screen.getByText(STAMP_TEXT.button));
      await screen.findByText(STAMP_TEXT.privateNotice);
      const stale = notices[notices.length - 1]!;
      expect(stale.action).toBeTruthy();
      await view.rerender(<VisitScreen libraryId={102} distanceM={null} />);
      await screen.findByText("종로도서관");
      await waitFor(() => expect(fetchToday).toHaveBeenLastCalledWith(102, expect.anything()));
      expect(noticeText()).toBeNull();
      const callsBefore = putToday.mock.calls.length;
      await act(async () => stale.action!.run());
      expect(putToday.mock.calls.length).toBe(callsBefore);
      expect(screen.getByText(STAMP_TEXT.button)).toBeTruthy();
    } finally {
      off();
    }
  });

  test("stamp change from another account or library leaves feed alone", async () => {
    const view = await enter([stampFeed(stampItem(STAMP_ID, { mine: true })), postItem(post("p1"))]);
    await screen.findByTestId(`stamp-card-${STAMP_ID}`);
    const calls = fetchItems.mock.calls.length;
    await act(async () => {
      api.emitStampChanged({ libraryId: 101, userId: USER_B, stampId: STAMP_ID, visibility: "private" });
      api.emitStampChanged({ libraryId: 102, userId: USER_A, stampId: STAMP_ID, visibility: "private" });
    });
    expect(fetchItems.mock.calls.length).toBe(calls);
    expect(screen.getByTestId("post-card-p1")).toBeTruthy();
    expect(screen.getByTestId(`stamp-card-${STAMP_ID}`)).toBeTruthy();
    setAuth("signedOut");
    await view.rerender(<VisitScreen libraryId={101} distanceM={null} />);
    await act(async () => {
      api.emitStampChanged({ libraryId: 101, userId: USER_A, stampId: STAMP_ID, visibility: "public" });
    });
    expect(fetchItems.mock.calls.length).toBe(calls);
  });

  test("library switch drops late today read", async () => {
    const first = deferred<TodayStamp>();
    fetchToday.mockReturnValueOnce(first.promise).mockResolvedValueOnce(none);
    const view = await enter();
    await view.rerender(<VisitScreen libraryId={102} distanceM={null} />);
    await screen.findByText("종로도서관");
    await act(async () => first.resolve(today("public")));
    expect(screen.getByText(STAMP_TEXT.button)).toBeTruthy();
    expect(screen.queryByText(STAMP_TEXT.labelPublic)).toBeNull();
  });

  test("visibility change refreshes sorted feed and hides private stamp immediately", async () => {
    fetchToday.mockResolvedValue(today("private"));
    fetchItems.mockResolvedValue(page([postItem(post("p-new", "2026-11-24T11:00:00+09:00")), postItem(post("p-old", "2026-11-24T08:00:00+09:00"))]));
    // 받은 순서를 그대로 글자로 그려 #32 순서를 본다
    const order = () => screen.getByTestId("order").props.children as string;
    await render(
      <VisitScreen
        libraryId={101}
        distanceM={null}
        renderFeed={(items) => <Text testID="order">{(items as FeedItem[]).map((i) => api.feedItemKey(i)).join(",")}</Text>}
      />
    );
    await screen.findByText("정독도서관");
    // 공개: #32 순서(더 최신 게시물 뒤)에 내 카드
    putToday.mockResolvedValueOnce(today("public"));
    fetchItems.mockResolvedValue(page([
      postItem(post("p-new", "2026-11-24T11:00:00+09:00")),
      stampFeed(stampItem(STAMP_ID, { mine: true })),
      postItem(post("p-old", "2026-11-24T08:00:00+09:00")),
    ]));
    await fireEvent.press(await screen.findByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPublic));
    await waitFor(() => expect(order()).toBe(`post:p-new,stamp:${STAMP_ID},post:p-old`));
    expect(fetchItems).toHaveBeenLastCalledWith(101, { cursor: null }, expect.anything());

    // 비공개: 앞서 시작한 조회는 늦게 와도 덮지 못하고, 최신 조회가 실패해도 카드가 다시 나오지 않는다
    const earlier = deferred<FeedItemPage>();
    fetchItems.mockReturnValueOnce(earlier.promise);
    await act(async () => {
      api.emitStampChanged({ libraryId: 101, userId: USER_A, stampId: "not-mine-refresh", visibility: "public" });
    });
    putToday.mockResolvedValueOnce(today("private"));
    fetchItems.mockRejectedValueOnce(network());
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.menuToPrivate));
    expect(await screen.findByText(STAMP_TEXT.labelPrivate)).toBeTruthy();
    expect(order()).toBe("post:p-new,post:p-old"); // 비공개 성공 직후 바로 빠짐
    await act(async () => earlier.resolve(page([stampFeed(stampItem(STAMP_ID, { mine: true })), postItem(post("p-new"))])));
    await waitFor(() => expect(fetchItems.mock.results.length).toBeGreaterThan(0));
    expect(order()).toBe("post:p-new,post:p-old"); // 이전 응답·조회 실패로 다시 나오지 않고 보이던 피드 유지
  });
});

describe("C-92 스탬프 한마디(V4-12·V4-O6·V4-O7)", () => {
  test("stamp sits on the distance row and feed head title is gone", async () => {
    await enter();
    const row = within(screen.getByTestId("visit-header-info-row"));
    expect(row.getByTestId("stamp-control")).toBeTruthy();
    expect(screen.queryByText("이 도서관 이야기")).toBeNull();
    expect(screen.queryByTestId("visit-feed-head")).toBeNull();
  });

  test("menu adds a note with current visibility and expected id", async () => {
    fetchToday.mockResolvedValue(today("private"));
    putToday.mockResolvedValueOnce(today("private", STAMP_ID, "창가 햇살 좋아요"));
    await enter();
    await fireEvent.press(await screen.findByLabelText(STAMP_TEXT.menuLabel));
    expect(screen.getByText(STAMP_TEXT.noteSub)).toBeTruthy();
    await fireEvent.press(screen.getByText(STAMP_TEXT.noteAdd));
    expect(screen.queryByTestId("stamp-menu")).toBeNull();
    const sheet = within(screen.getByTestId("stamp-note-sheet"));
    expect(sheet.getByText(STAMP_TEXT.noteGuide)).toBeTruthy();
    expect(screen.getByTestId("stamp-note-input").props.maxLength).toBe(140);
    expect(screen.getByTestId("stamp-note-save").props.accessibilityState).toMatchObject({ disabled: true }); // 바뀐 것 없음
    await fireEvent.changeText(screen.getByTestId("stamp-note-input"), "  창가 햇살 좋아요  ");
    expect(screen.getByText("9/140")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("stamp-note-save"));
    expect(putToday).toHaveBeenLastCalledWith(101, "private", STAMP_ID, { body: "창가 햇살 좋아요" });
    expect(await screen.findByText(STAMP_TEXT.noteAdded)).toBeTruthy();
    expect(screen.queryByTestId("stamp-note-sheet")).toBeNull();
    await fireEvent.press(screen.getByLabelText(STAMP_TEXT.menuLabel));
    expect(screen.getByText(STAMP_TEXT.noteEdit)).toBeTruthy(); // 본문 있음 → "수정"
  });

  test("edit prefills, clearing deletes, and failure keeps the sheet and text", async () => {
    fetchToday.mockResolvedValue(today("public", STAMP_ID, "원래 한마디"));
    await enter();
    await fireEvent.press(await screen.findByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.noteEdit));
    expect(screen.getByTestId("stamp-note-input").props.value).toBe("원래 한마디");
    putToday.mockRejectedValueOnce(network());
    await fireEvent.changeText(screen.getByTestId("stamp-note-input"), "고친 한마디");
    await fireEvent.press(screen.getByTestId("stamp-note-save"));
    expect(await screen.findByTestId("stamp-note-failed")).toBeTruthy();
    expect(screen.getByTestId("stamp-note-input").props.value).toBe("고친 한마디");
    putToday.mockResolvedValueOnce(today("public", STAMP_ID, null));
    await fireEvent.changeText(screen.getByTestId("stamp-note-input"), "   ");
    await fireEvent.press(screen.getByTestId("stamp-note-save"));
    expect(putToday).toHaveBeenLastCalledWith(101, "public", STAMP_ID, { body: null });
    expect(await screen.findByText(STAMP_TEXT.noteCleared)).toBeTruthy();
    expect(screen.queryByTestId("stamp-note-sheet")).toBeNull();
  });

  test("note save after midnight closes the sheet and reloads today", async () => {
    fetchToday.mockResolvedValueOnce(today("private")).mockResolvedValue(none);
    await enter();
    await fireEvent.press(await screen.findByLabelText(STAMP_TEXT.menuLabel));
    await fireEvent.press(screen.getByText(STAMP_TEXT.noteAdd));
    putToday.mockRejectedValueOnce(new publicApi.ApiCallError(409, "STAMP_DATE_CHANGED", "x", ""));
    await fireEvent.changeText(screen.getByTestId("stamp-note-input"), "늦은 한마디");
    await fireEvent.press(screen.getByTestId("stamp-note-save"));
    expect(await screen.findByText(STAMP_TEXT.dateChanged)).toBeTruthy();
    expect(screen.queryByTestId("stamp-note-sheet")).toBeNull();
    expect(await screen.findByText(STAMP_TEXT.button)).toBeTruthy();
  });

  test("others' public stamp can be reported like a post, mine has no menu", async () => {
    jest.mocked(api.reportTarget).mockResolvedValueOnce(undefined);
    await enter([stampFeed(stampItem("s-other", { body: "광고 글" })), stampFeed(stampItem("s-mine", { mine: true }))]);
    expect(screen.queryByTestId("stamp-menu-s-mine")).toBeNull(); // 내 것은 ▾ 메뉴에서 바꾼다
    await fireEvent.press(await screen.findByTestId("stamp-menu-s-other"));
    await fireEvent.press(screen.getByText("스팸 또는 광고"));
    await fireEvent.press(screen.getByText("신고 보내기"));
    await waitFor(() => expect(api.reportTarget).toHaveBeenCalledWith({ kind: "stamp", id: "s-other" }, "spam", null));
    expect(await screen.findByText("신고한 글")).toBeTruthy(); // 신고한 카드는 접힌다(게시물과 같음)
    expect(screen.queryByTestId("stamp-card-s-other")).toBeNull();
    expect(screen.getByTestId("stamp-card-s-mine")).toBeTruthy();
  });

  test("public stamp card shows its note", async () => {
    await enter([stampFeed(stampItem("s-note", { body: "오늘 서가 좋았어요" })), stampFeed(stampItem("s-empty"))]);
    expect(await screen.findByTestId("stamp-body-s-note")).toBeTruthy();
    expect(screen.getByText("오늘 서가 좋았어요")).toBeTruthy();
    expect(screen.queryByTestId("stamp-body-s-empty")).toBeNull();
  });
});

describe("VISIT-4-P2 스탬프 카드", () => {
  test("stamp card is one cell with seal nickname time; only others' card has the report menu (C-92)", async () => {
    for (const mine of [true, false]) {
      const view = await render(
        <FeedItemCard item={stampFeed(stampItem(`s-${mine}`, { mine }))} width={160} onOpenPost={jest.fn()} onMenu={jest.fn()} />
      );
      expect(screen.getByText("11.24")).toBeTruthy();
      expect(screen.getByText(`책벌레 · ${STAMP_CARD_TEXT.visited}`)).toBeTruthy();
      // 내 카드: 북마크 하나(바꾸기는 ▾). 남의 카드: 북마크 + 신고 ⋯(게시물과 같음)
      expect(screen.getAllByRole("button")).toHaveLength(mine ? 1 : 2);
      expect(screen.getByLabelText(STAMP_CARD_TEXT.bookmark)).toBeTruthy();
      expect(screen.queryByText("⋯") === null).toBe(mine);
      expect(screen.queryByText(/인증|확인됨/)).toBeNull();
      expect(screen.getByTestId(`stamp-card-s-${mine}`).props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 160 })])
      );
      await view.unmount();
    }
  });

  test("stamp card bookmark toggle blocks rapid double tap", async () => {
    const pending = deferred<{ bookmarked: boolean }>();
    setStampBookmark.mockReturnValueOnce(pending.promise);
    await enter([stampFeed(stampItem("s1")), postItem(post("p1"))]);
    const mark = await screen.findByTestId("stamp-bookmark-s1");
    await fireEvent.press(mark);
    await fireEvent.press(mark);
    expect(setStampBookmark).toHaveBeenCalledTimes(1);
    expect(setStampBookmark).toHaveBeenCalledWith("s1", true);
    await act(async () => pending.resolve({ bookmarked: true }));
    expect(await screen.findByText(STAMP_CARD_TEXT.saved)).toBeTruthy();
    expect(screen.getByLabelText(STAMP_CARD_TEXT.bookmarked)).toBeTruthy();
    setStampBookmark.mockResolvedValueOnce({ bookmarked: false });
    await fireEvent.press(screen.getByTestId("stamp-bookmark-s1"));
    expect(setStampBookmark).toHaveBeenLastCalledWith("s1", false);
    expect(await screen.findByText(STAMP_CARD_TEXT.unsaved)).toBeTruthy();
  });

  test("stamp card bookmark failure keeps icon", async () => {
    setStampBookmark.mockRejectedValueOnce(network());
    await enter([stampFeed(stampItem("s1")), postItem(post("p1"))]);
    await fireEvent.press(await screen.findByTestId("stamp-bookmark-s1"));
    expect(await screen.findByText(STAMP_CARD_TEXT.saveFailed)).toBeTruthy();
    expect(screen.getByLabelText(STAMP_CARD_TEXT.bookmark)).toBeTruthy();
  });

  test("empty feed still shows stamp button", async () => {
    await enter([]);
    expect(await screen.findByTestId("empty-feed")).toBeTruthy();
    expect(screen.getByText(STAMP_TEXT.button)).toBeTruthy();
  });

  test("account switch clears stamp bookmark overrides and drops late bookmark response", async () => {
    const pending = deferred<{ bookmarked: boolean }>();
    setStampBookmark.mockReturnValueOnce(pending.promise);
    const view = await enter([stampFeed(stampItem("s1", { my_bookmark: false })), postItem(post("p1"))]);
    await fireEvent.press(await screen.findByTestId("stamp-bookmark-s1"));
    expect(setStampBookmark).toHaveBeenCalledTimes(1);

    // A의 북마크 응답이 오기 전에 B로 계정 전환(status는 그대로 signedIn, userId만 변경)
    setAuth("signedIn", USER_B);
    await view.rerender(<VisitScreen libraryId={101} distanceM={null} />);

    // 늦게 도착한 A의 응답이 B의 화면 북마크 상태나 안내를 덮어쓰지 않아야 한다
    await act(async () => pending.resolve({ bookmarked: true }));
    expect(screen.getByLabelText(STAMP_CARD_TEXT.bookmark)).toBeTruthy();
    expect(screen.queryByText(STAMP_CARD_TEXT.saved)).toBeNull();

    // B가 저장한 뒤 다시 A로 전환하면 B의 로컬 오버라이드도 초기화된다
    setStampBookmark.mockResolvedValueOnce({ bookmarked: true });
    await fireEvent.press(screen.getByTestId("stamp-bookmark-s1"));
    expect(await screen.findByLabelText(STAMP_CARD_TEXT.bookmarked)).toBeTruthy();

    setAuth("signedIn", USER_A);
    await view.rerender(<VisitScreen libraryId={101} distanceM={null} />);
    expect(screen.getByLabelText(STAMP_CARD_TEXT.bookmark)).toBeTruthy();
  });
});
