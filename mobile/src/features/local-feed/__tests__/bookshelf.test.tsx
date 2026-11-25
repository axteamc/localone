// VISIT-3-P2 오늘의 서가(책장) — contracts/local-feed.md VISIT-3 P5 (VISIT-3-P2 행), 명세 결정 1·예외 #1~#3
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as publicApi from "../../../lib/publicApi";
import type { LibraryDetail } from "../../../lib/publicApi";
import * as visits from "../../../lib/visits";
import type { ShelfResponse } from "../api";
import { Bookshelf, SHELF_TEXT } from "../Bookshelf";
import { VisitScreen } from "../VisitScreen";
import { POPULAR_PAGE, RECENT_PAGE, SHELF_C7, THEME_PAGE } from "../__fakes__/shelf";

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
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchShelf: jest.fn(async () => ({ pages: [] })),
  fetchLibraryPosts: jest.fn(async () => ({ items: [], next_cursor: null })),
}));
jest.mock("../../../lib/visits", () => ({ recordVisit: jest.fn(), getDefaultLibrary: jest.fn() }));

const fetchLibrary = jest.mocked(publicApi.fetchLibrary);

function lib(id: number): LibraryDetail {
  return {
    id, name: "정독도서관", address: null, latitude: null, longitude: null, dtl_region_code: null, area_label: null,
    distance_m: null, tel: null, homepage: null, operating_time_text: null, closed_text: null,
    today: { date: "2026-11-19", is_closed: false, hours_text: "09:00–18:00", holiday_unchecked: false },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const unavailable = () => new publicApi.ApiCallError(503, "PROVIDER_UNAVAILABLE", "잠시 뒤에 다시 해 주세요.", "");

/** 피드는 글 하나가 보이게 바꿔 끼운다(피드 자리가 그대로인지 보기 위함) */
const feedOk = jest.fn(async () => ({ items: [{ id: "p1" }], next_cursor: null }));
const renderFeed = (items: unknown[]) => <Text testID="feed-ok">{`글 ${items.length}개`}</Text>;

async function enter(loadShelf: (id: number, signal: AbortSignal) => Promise<ShelfResponse>) {
  await render(
    <VisitScreen libraryId={101} distanceM={null} loadFeed={feedOk} renderFeed={renderFeed} loadShelf={loadShelf} />
  );
}

function shelfTitle() {
  return screen.getByTestId("shelf-title").props.children as string;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
  fetchLibrary.mockImplementation(async (id) => lib(id));
  jest.mocked(visits.recordVisit).mockResolvedValue({
    counted: false, isFirst: false, previousVisitedOn: null,
    record: { libraryId: 101, count: 2, firstVisitedOn: "2026-11-01", lastVisitedOn: "2026-11-19", streakDays: 1,
      defaultAsked: true },
  });
  jest.mocked(visits.getDefaultLibrary).mockResolvedValue(null);
});

describe("VISIT-3-P2 책장", () => {
  test("four covers fit a narrow shelf and the last one opens", async () => {
    const onOpen = jest.fn();
    const fourth = { isbn13: "9780000000100", title: "네 번째 책", author: null, cover_url: null };
    const page = { ...POPULAR_PAGE, books: [...POPULAR_PAGE.books, fourth] };
    await render(<Bookshelf libraryId={101} onOpenBook={onOpen} load={async () => ({ pages: [page] })} />);
    await screen.findByText("화제의 책");
    await fireEvent(screen.getByTestId("bookshelf"), "layout", { nativeEvent: { layout: { width: 320 } } });
    const books = screen.getAllByLabelText(/책 화면 열기$/);
    expect(books).toHaveLength(4);
    for (const book of books) {
      expect(book).toHaveStyle({ width: 60, aspectRatio: 104 / 150 });
    }
    await fireEvent.press(screen.getByLabelText("네 번째 책 책 화면 열기"));
    expect(onOpen).toHaveBeenCalledWith(fourth.isbn13);
  });

  test("shelf hides missing pages and never says loanable", async () => {
    await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={async () => SHELF_C7} />);
    expect(await screen.findByText("화제의 책")).toBeTruthy();
    expect(screen.getByText("YES24 베스트셀러")).toBeTruthy();
    expect(screen.getAllByLabelText(/책 화면 열기$/)).toHaveLength(3);
    expect(screen.queryByTestId("shelf-dots")).toBeNull(); // 장이 1개면 점을 그리지 않음
    expect(screen.queryByText(/대출 가능/)).toBeNull();
    expect(screen.queryByText(/실시간/)).toBeNull();
  });

  test("shelf shows popular then theme then recent loans (C-92)", async () => {
    // 서버 순서를 섞어 준다: 서버 순서 그대로 그리면 실패
    const load = async () => ({ pages: [RECENT_PAGE, THEME_PAGE, POPULAR_PAGE] });
    await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={load} />);
    await waitFor(() => expect(shelfTitle()).toBe("화제의 책"));
    expect(screen.getByText("YES24 베스트셀러")).toBeTruthy();
    expect(screen.getAllByTestId(/^shelf-dot-/)).toHaveLength(3);
    expect(screen.getByTestId("shelf-dot-0").props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId("shelf-dot-1"));
    expect(shelfTitle()).toBe("비 오는 날 읽기 좋은 책");
    expect(screen.getByTestId("shelf-dot-1").props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId("shelf-dot-2"));
    expect(shelfTitle()).toBe("요즘 사람들이 읽고 간 책");
    expect(screen.getByText("정독도서관 · 최근 30일 대출")).toBeTruthy();
  });

  test("shelf without popular starts at theme", async () => {
    const load = async () => ({ pages: [RECENT_PAGE, THEME_PAGE] });
    await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={load} />);
    await waitFor(() => expect(shelfTitle()).toBe("비 오는 날 읽기 좋은 책"));
    expect(screen.getAllByTestId(/^shelf-dot-/)).toHaveLength(2);
    expect(screen.queryByText("YES24 베스트셀러")).toBeNull(); // 테마는 basis_label이 없어 비움
    await fireEvent.press(screen.getByTestId("shelf-dot-1"));
    expect(shelfTitle()).toBe("요즘 사람들이 읽고 간 책");
  });

  test("empty shelf points to the reading log (C-92)", async () => {
    const onWriteRecord = jest.fn();
    await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={async () => ({ pages: [] })} onWriteRecord={onWriteRecord} />);
    expect(await screen.findByText("읽은 책은 독서 기록에 남겨 보세요")).toBeTruthy();
    expect(screen.queryByText("빌린 책을 반납하면 여기에 쌓여요")).toBeNull();
    await fireEvent.press(screen.getByTestId("shelf-empty-record"));
    expect(onWriteRecord).toHaveBeenCalledTimes(1);
  });

  test("book without cover shows author and title text cover", async () => {
    await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={async () => SHELF_C7} />);
    expect(await screen.findByText("소년이 온다")).toBeTruthy();
    expect(screen.getAllByText("한강")).toHaveLength(2);
    expect(screen.getByText("손원평")).toBeTruthy();
  });

  test("shelf book opens book detail", async () => {
    await enter(async () => SHELF_C7);
    const book = await screen.findByLabelText("소년이 온다 책 화면 열기");
    await fireEvent.press(book);
    await fireEvent.press(book); // 연타해도 한 번(예외 #3)
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/books/[isbn13]", params: { isbn13: "9788936434120" } });
  });

  test("shelf failure only affects shelf", async () => {
    await enter(async () => {
      throw unavailable();
    });
    expect(await screen.findByText(SHELF_TEXT.failed)).toBeTruthy();
    expect(screen.getByText(SHELF_TEXT.retry)).toBeTruthy();
    expect(await screen.findByTestId("feed-ok")).toBeTruthy();
    expect(screen.getByLabelText("글쓰기")).toBeTruthy();
  });

  test("empty shelf keeps shelf area with message", async () => {
    await enter(async () => ({ pages: [] }));
    expect(await screen.findByText(SHELF_TEXT.emptyTitle)).toBeTruthy();
    expect(screen.getByText(SHELF_TEXT.emptySub)).toBeTruthy();
    expect(screen.getByTestId("bookshelf")).toBeTruthy(); // 책장을 숨기면 실패
    expect(screen.queryByTestId("shelf-dots")).toBeNull();
    expect(screen.queryByTestId("shelf-title")).toBeNull();
    expect(await screen.findByTestId("feed-ok")).toBeTruthy();
  });

  test("shelf retry reloads only shelf", async () => {
    const load = jest
      .fn<(id: number, signal: AbortSignal) => Promise<ShelfResponse>>()
      .mockRejectedValueOnce(unavailable())
      .mockResolvedValueOnce(SHELF_C7);
    await enter(load);
    await fireEvent.press(await screen.findByText(SHELF_TEXT.retry));
    expect(await screen.findAllByLabelText(/책 화면 열기$/)).toHaveLength(3);
    expect(load).toHaveBeenCalledTimes(2);
    expect(feedOk).toHaveBeenCalledTimes(1); // 전체 새로고침이면 실패
  });

  test("library switch drops late shelf response and starts at first page", async () => {
    const late = deferred<ShelfResponse>();
    const load = jest.fn(async (id: number) => (id === 101 ? late.promise : { pages: [RECENT_PAGE, THEME_PAGE] }));
    const view = await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={load} />);
    await view.rerender(<Bookshelf libraryId={102} onOpenBook={jest.fn()} load={load} />);
    await waitFor(() => expect(shelfTitle()).toBe("비 오는 날 읽기 좋은 책"));
    await act(async () => late.resolve({ pages: [POPULAR_PAGE] }));
    expect(shelfTitle()).toBe("비 오는 날 읽기 좋은 책"); // 늦게 온 101 응답이 덮지 않음
    expect(screen.getAllByTestId(/^shelf-dot-/)).toHaveLength(2);
  });

  test("switching library goes back to the first page", async () => {
    const load = async () => ({ pages: [RECENT_PAGE, THEME_PAGE, POPULAR_PAGE] });
    const view = await render(<Bookshelf libraryId={101} onOpenBook={jest.fn()} load={load} />);
    await waitFor(() => expect(shelfTitle()).toBe("화제의 책"));
    await fireEvent.press(screen.getByTestId("shelf-dot-2"));
    expect(shelfTitle()).toBe("요즘 사람들이 읽고 간 책");
    await view.rerender(<Bookshelf libraryId={102} onOpenBook={jest.fn()} load={load} />);
    await waitFor(() => expect(shelfTitle()).toBe("화제의 책")); // 처음 열 때 늘 첫 장(V3-O1)
    expect(screen.getByTestId("shelf-dot-0").props.accessibilityState).toEqual({ selected: true });
  });
});
