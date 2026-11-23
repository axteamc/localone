// READ-1-P2 독서 기록 탭·쓰기·기록 화면 (reading-log.md READ-1 P5, specs/reading-log/세부/READ-1.md)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { registerSignOutCleanup, useAuth } from "../../../auth/AuthProvider";
import * as lib from "../../../lib/publicApi";
import type { Book } from "../../../lib/publicApi";
import * as loanApi from "../../loan-assistant/api";
import type { Loan } from "../../loan-assistant/api";
import * as api from "../api";
import type { ReadingLog } from "../api";
import { ReadingLogDetail, TEXT as DETAIL } from "../ReadingLogDetail";
import { ReadingLogEditor, TEXT as EDITOR } from "../ReadingLogEditor";
import { ReadingLogScreen, TEXT as SHELF } from "../ReadingLogScreen";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockUuid = 0;

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useNavigation: () => ({ setOptions: () => undefined, addListener: () => () => undefined }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-crypto", () => ({ randomUUID: () => `req-${++mockUuid}` }));

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(),
  registerSignOutCleanup: jest.fn(() => () => undefined),
}));

jest.mock("../../../lib/publicApi", () => {
  const actual = jest.requireActual<typeof import("../../../lib/publicApi")>("../../../lib/publicApi");
  return { ...actual, searchBooks: jest.fn(), searchLibrariesByName: jest.fn() };
});

jest.mock("../../loan-assistant/api", () => {
  const actual = jest.requireActual<typeof import("../../loan-assistant/api")>("../../loan-assistant/api");
  return { ...actual, listLoans: jest.fn() };
});

jest.mock("../api", () => {
  const actual = jest.requireActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchReadingLogs: jest.fn(),
    fetchReadingLog: jest.fn(),
    createReadingLog: jest.fn(),
    updateReadingLog: jest.fn(),
    deleteReadingLog: jest.fn(),
  };
});

const mockedUseAuth = jest.mocked(useAuth);
// api.ts가 읽힐 때 등록한 로그아웃 정리 함수(beforeEach의 clearAllMocks 전에 잡아 둔다)
const signOutCleanups = jest.mocked(registerSignOutCleanup).mock.calls.map((c) => c[0]);
const searchBooks = jest.mocked(lib.searchBooks);
const listLoans = jest.mocked(loanApi.listLoans);
const fetchReadingLogs = jest.mocked(api.fetchReadingLogs);
const fetchReadingLog = jest.mocked(api.fetchReadingLog);
const createReadingLog = jest.mocked(api.createReadingLog);
const updateReadingLog = jest.mocked(api.updateReadingLog);
const deleteReadingLog = jest.mocked(api.deleteReadingLog);

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

const BOY: Book = {
  isbn13: "9788936434120",
  title: "소년이 온다",
  author: "한강",
  publisher: "창비",
  cover_url: null,
  source: "kakao",
  description: null,
  pub_year: 2014,
};

function makeLog(over: Partial<ReadingLog> = {}): ReadingLog {
  return {
    id: "3f1c2b9e-0d4a-4c1e-9b7a-2a6f5e8d1c40",
    book: { isbn13: BOY.isbn13, title: BOY.title, author: BOY.author, cover_url: null },
    library: { id: 101, name: "정독도서관" },
    read_on: "2026-11-15",
    note: "오래 남는 책",
    quote: "마음에 남은 문장",
    loan_id: null,
    published_post_id: null,
    created_at: "2026-11-15T21:00:00+09:00",
    updated_at: "2026-11-15T21:00:00+09:00",
    ...over,
  };
}

function makeLoan(id: string, loanedOn: string, library: { id: number; name: string } | null, isbn13 = BOY.isbn13): Loan {
  return {
    id,
    book: { isbn13, title: isbn13 === BOY.isbn13 ? BOY.title : "다른 책", author: null, cover_url: null },
    library,
    plan_id: null,
    loaned_on: loanedOn,
    due_on: loanedOn,
    due_on_assumed: true,
    status: "returned",
    returned_on: loanedOn,
    d_day: 0,
    is_overdue: false,
  };
}

function signedIn(userId = USER_A) {
  mockedUseAuth.mockReturnValue({
    status: "signedIn",
    userId,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

function loansAre(items: Loan[]) {
  listLoans.mockImplementation(async (status) => ({
    items: items.filter((l) => l.status === status),
    next_cursor: null,
    today: "2026-11-19",
  }));
}

async function pickBook(book: Book = BOY) {
  await fireEvent.press(screen.getByTestId("book-field"));
  searchBooks.mockResolvedValue({ items: [book], next_start: null, source: "kakao", fallback_reason: null });
  await fireEvent.changeText(screen.getByTestId("book-search"), book.title);
  await fireEvent(screen.getByTestId("book-search"), "submitEditing");
  await fireEvent.press(await screen.findByTestId(`book-${book.isbn13}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  api.shelfStore.clear();
  mockUuid = 0;
  signedIn();
  loansAre([]);
});

describe("쓰기 화면 (R1-O2·R1-O6·R1-O7)", () => {
  test("saving without book shows must pick book", async () => {
    await render(<ReadingLogEditor mode="new" />);
    await fireEvent.changeText(screen.getByTestId("note-input"), "책 고르기 전에 쓴 감상");
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    expect(screen.getAllByText(EDITOR.needBook).length).toBeGreaterThan(0);
    expect(createReadingLog).not.toHaveBeenCalled();
    expect(screen.getByTestId("note-input").props.value).toBe("책 고르기 전에 쓴 감상");
  });

  test("picking a borrowed book asks before linking loan — 아니요", async () => {
    loansAre([
      makeLoan("loan-oct", "2026-10-01", { id: 102, name: "종로도서관" }),
      makeLoan("loan-nov", "2026-11-03", { id: 101, name: "정독도서관" }),
    ]);
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    expect(await screen.findByText("정독도서관에서 11월 3일에 빌린 책이에요")).toBeTruthy();
    // 누르기 전에는 연결하지 않는다
    expect(screen.getByLabelText(`${EDITOR.loan} ${EDITOR.notChosen}`)).toBeTruthy();
    expect(screen.getByLabelText(`${EDITOR.library} ${EDITOR.notChosen}`)).toBeTruthy();
    await fireEvent.press(screen.getByText(EDITOR.loanNo));
    expect(screen.queryByTestId("loan-ask-card")).toBeNull();
    expect(screen.getByLabelText(`${EDITOR.loan} ${EDITOR.notChosen}`)).toBeTruthy();
    expect(screen.getByLabelText(`${EDITOR.library} ${EDITOR.notChosen}`)).toBeTruthy();
    // 같은 책을 다시 골라도 다시 묻지 않는다
    await pickBook();
    await waitFor(() => expect(screen.queryByTestId("book-finder")).toBeNull());
    expect(screen.queryByTestId("loan-ask-card")).toBeNull();
    createReadingLog.mockResolvedValue(makeLog());
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await waitFor(() => expect(createReadingLog).toHaveBeenCalledTimes(1));
    expect(createReadingLog.mock.calls[0]![0]).toMatchObject({ isbn13: BOY.isbn13, loanId: null, libraryId: null });
  });

  test("picking a borrowed book asks before linking loan — 연결하기", async () => {
    loansAre([
      makeLoan("loan-oct", "2026-10-01", { id: 102, name: "종로도서관" }),
      makeLoan("loan-nov", "2026-11-03", { id: 101, name: "정독도서관" }),
    ]);
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await fireEvent.press(await screen.findByText(EDITOR.loanLink));
    expect(screen.getByLabelText(`${EDITOR.library} 정독도서관`)).toBeTruthy();
    createReadingLog.mockResolvedValue(makeLog({ loan_id: "loan-nov" }));
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await waitFor(() => expect(createReadingLog).toHaveBeenCalledTimes(1));
    expect(createReadingLog.mock.calls[0]![0]).toMatchObject({ loanId: "loan-nov", libraryId: 101 });
  });

  test("book without loan shows no loan card", async () => {
    loansAre([makeLoan("loan-other", "2026-11-03", { id: 101, name: "정독도서관" }, "9791190090018")]);
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await waitFor(() => expect(listLoans).toHaveBeenCalled());
    expect(screen.queryByTestId("loan-ask-card")).toBeNull();
  });

  test("book with failing loan list still saves", async () => {
    listLoans.mockRejectedValue(new api.ApiCallError(0, "NETWORK", "x", ""));
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await waitFor(() => expect(listLoans).toHaveBeenCalled());
    expect(screen.queryByTestId("loan-ask-card")).toBeNull();
    createReadingLog.mockResolvedValue(makeLog());
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await waitFor(() => expect(createReadingLog).toHaveBeenCalledTimes(1));
    expect(mockBack).toHaveBeenCalled();
  });

  test("library sheet allows no library", async () => {
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await fireEvent.press(screen.getByLabelText(`${EDITOR.library} ${EDITOR.notChosen}`));
    await fireEvent.press(await screen.findByText(EDITOR.noLibrary));
    createReadingLog.mockResolvedValue(makeLog({ library: null }));
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await waitFor(() => expect(createReadingLog).toHaveBeenCalledTimes(1));
    expect(createReadingLog.mock.calls[0]![0].libraryId).toBeNull();
  });

  test("double save creates one log", async () => {
    let finish: (log: ReadingLog) => void = () => undefined;
    createReadingLog.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    expect(createReadingLog).toHaveBeenCalledTimes(1);
    await act(async () => finish(makeLog()));
    expect(createReadingLog.mock.calls[0]![1]).toBe("req-1");
    expect(api.shelfStore.get().notice).toBe(EDITOR.saved);
  });

  test("failed save keeps typed values", async () => {
    createReadingLog.mockRejectedValue(new api.ApiCallError(503, "DB_UNAVAILABLE", "x", ""));
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await fireEvent.changeText(screen.getByTestId("note-input"), "끊겨도 남아야 할 감상");
    await fireEvent.changeText(screen.getByTestId("quote-input"), "좋았던 문장 하나");
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    expect(await screen.findByText(EDITOR.saveFailedTitle)).toBeTruthy();
    expect(screen.getByText(EDITOR.saveFailedBody)).toBeTruthy();
    expect(screen.getByTestId("note-input").props.value).toBe("끊겨도 남아야 할 감상");
    expect(screen.getByTestId("quote-input").props.value).toBe("좋았던 문장 하나");
    expect(screen.getAllByText(BOY.title).length).toBeGreaterThan(0); // 고른 책도 그대로
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("retry after failed save reuses request id", async () => {
    createReadingLog
      .mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""))
      .mockResolvedValueOnce(makeLog());
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await fireEvent.changeText(screen.getByTestId("note-input"), "다시 저장할 감상");
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await fireEvent.press(await screen.findByText(EDITOR.retry));
    await waitFor(() => expect(createReadingLog).toHaveBeenCalledTimes(2));
    const [first, second] = createReadingLog.mock.calls;
    expect(first![1]).toBe(second![1]);
    expect(second![0]).toMatchObject({ isbn13: BOY.isbn13, note: "다시 저장할 감상" });
  });

  test("leaving dirty editor asks before discarding", async () => {
    await render(<ReadingLogEditor mode="new" />);
    await fireEvent.changeText(screen.getByTestId("note-input"), "쓰던 감상");
    await fireEvent.press(screen.getByLabelText(EDITOR.close));
    expect(screen.getByText(EDITOR.discardTitle)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(EDITOR.keepWriting));
    expect(screen.getByTestId("note-input").props.value).toBe("쓰던 감상");
    await fireEvent.press(screen.getByLabelText(EDITOR.close));
    await fireEvent.press(screen.getByText(EDITOR.discard));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("leaving empty editor closes right away", async () => {
    await render(<ReadingLogEditor mode="new" />);
    await fireEvent.press(screen.getByLabelText(EDITOR.close));
    expect(screen.queryByText(EDITOR.discardTitle)).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("too long note is blocked with field message", async () => {
    await render(<ReadingLogEditor mode="new" />);
    await pickBook();
    await fireEvent.changeText(screen.getByTestId("note-input"), "가".repeat(api.NOTE_MAX + 1));
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    expect(screen.getByText(EDITOR.noteTooLong)).toBeTruthy();
    expect(createReadingLog).not.toHaveBeenCalled();
  });
});

describe("기록 화면 (R1-O4·R1-O5)", () => {
  test("publish button goes to compose with fromLog", async () => {
    fetchReadingLog.mockResolvedValue(makeLog());
    await render(<ReadingLogDetail logId={makeLog().id} />);
    await fireEvent.press(await screen.findByText(DETAIL.publish));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/new", params: { fromLog: makeLog().id } });
  });

  test("already published log opens the post", async () => {
    fetchReadingLog.mockResolvedValue(makeLog({ published_post_id: "post-1" }));
    await render(<ReadingLogDetail logId={makeLog().id} />);
    await fireEvent.press(await screen.findByText(DETAIL.viewPost));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/posts/[postId]", params: { postId: "post-1" } });
  });

  test("detail menu has 수정 and 지우기 and edit cannot change book", async () => {
    const log = makeLog();
    fetchReadingLog.mockResolvedValue(log);
    updateReadingLog.mockResolvedValue({ ...log, note: "고친 감상" });
    await render(<ReadingLogDetail logId={log.id} />);
    await fireEvent.press(await screen.findByLabelText(DETAIL.more));
    expect(screen.getByText(DETAIL.edit)).toBeTruthy();
    expect(screen.getByText(DETAIL.remove)).toBeTruthy();
    await fireEvent.press(screen.getByText(DETAIL.edit));
    expect(screen.getByText(EDITOR.editTitle)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("book-field"));
    expect(screen.queryByTestId("book-finder")).toBeNull();
    expect(screen.getByText(EDITOR.bookLocked)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("note-input"), "고친 감상");
    await fireEvent.press(screen.getByLabelText(EDITOR.save));
    await waitFor(() => expect(updateReadingLog).toHaveBeenCalledTimes(1));
    const [logId, patch] = updateReadingLog.mock.calls[0]!;
    expect(logId).toBe(log.id);
    expect(patch).toEqual({ note: "고친 감상" });
    expect(patch).not.toHaveProperty("isbn13");
    expect(await screen.findByText("고친 감상")).toBeTruthy();
    expect(screen.getByText(DETAIL.title)).toBeTruthy();
  });

  test("delete asks first and removes from shelf", async () => {
    const log = makeLog({ published_post_id: "post-1" });
    const other = makeLog({ id: "11111111-1111-4111-8111-111111111111", read_on: "2026-11-01" });
    api.shelfStore.setPage(USER_A, { items: [log, other], next_cursor: null }, false);
    fetchReadingLog.mockResolvedValue(log);
    deleteReadingLog.mockResolvedValue(undefined);
    const view = await render(<ReadingLogDetail logId={log.id} />);
    await fireEvent.press(await screen.findByLabelText(DETAIL.more));
    await fireEvent.press(screen.getByText(DETAIL.remove));
    expect(screen.getByText(DETAIL.deleteTitle)).toBeTruthy();
    expect(screen.getByText(DETAIL.deleteKeepsPost)).toBeTruthy();
    await fireEvent.press(screen.getByText(DETAIL.cancel));
    expect(deleteReadingLog).not.toHaveBeenCalled();
    expect(screen.queryByText(DETAIL.deleteTitle)).toBeNull();

    await fireEvent.press(screen.getByLabelText(DETAIL.more));
    await fireEvent.press(screen.getByText(DETAIL.remove));
    await fireEvent.press(screen.getAllByText(DETAIL.remove).at(-1)!);
    await waitFor(() => expect(deleteReadingLog).toHaveBeenCalledTimes(1));
    expect(deleteReadingLog).toHaveBeenCalledWith(log.id);
    expect(mockBack).toHaveBeenCalled();
    expect(api.shelfStore.get().items!.map((l) => l.id)).toEqual([other.id]);
    await view.unmount();

    // 책장으로 돌아오면 그 책이 빠져 있고 "기록을 지웠어요"
    fetchReadingLogs.mockReturnValue(new Promise(() => undefined));
    await render(<ReadingLogScreen />);
    expect(screen.queryByTestId(`shelf-book-${log.id}`)).toBeNull();
    expect(screen.getByTestId(`shelf-book-${other.id}`)).toBeTruthy();
    expect(screen.getByText(DETAIL.deleted)).toBeTruthy();
  });

  test("delete without published post has no keeps-post line", async () => {
    fetchReadingLog.mockResolvedValue(makeLog());
    await render(<ReadingLogDetail logId={makeLog().id} />);
    await fireEvent.press(await screen.findByLabelText(DETAIL.more));
    await fireEvent.press(screen.getByText(DETAIL.remove));
    expect(screen.getByText(DETAIL.deleteTitle)).toBeTruthy();
    expect(screen.queryByText(DETAIL.deleteKeepsPost)).toBeNull();
  });

  test("missing or others log shows not found", async () => {
    fetchReadingLog.mockRejectedValue(new api.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", ""));
    await render(<ReadingLogDetail logId="00000000-0000-4000-8000-000000000999" />);
    expect(await screen.findByText(DETAIL.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(DETAIL.more)).toBeNull();
    expect(screen.queryByText(DETAIL.edit)).toBeNull();
    expect(screen.queryByText(DETAIL.publish)).toBeNull();
  });
});

describe("책장 탭 (C3·C6)", () => {
  test("empty shelf shows first book message", async () => {
    fetchReadingLogs.mockResolvedValue({ items: [], next_cursor: null });
    await render(<ReadingLogScreen />);
    expect(await screen.findByText(SHELF.emptyTitle)).toBeTruthy();
    expect(screen.getByText(SHELF.emptyBody)).toBeTruthy();
    expect(screen.getByLabelText(SHELF.write)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(SHELF.write));
    expect(mockPush).toHaveBeenCalledWith("/reading/new");
  });

  test("signed out tab shows login prompt without api call", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
    await render(<ReadingLogScreen />);
    expect(screen.getByText(EDITOR.loginNeeded)).toBeTruthy();
    await fireEvent.press(screen.getByText(EDITOR.login));
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(fetchReadingLogs).not.toHaveBeenCalled();
  });

  test("shelf card shows note first line and opens the log", async () => {
    const log = makeLog({ note: "첫 줄\n둘째 줄" });
    fetchReadingLogs.mockResolvedValue({ items: [log], next_cursor: null });
    await render(<ReadingLogScreen />);
    await fireEvent.press(await screen.findByTestId(`shelf-book-${log.id}`));
    expect(screen.getByTestId("shelf-card")).toBeTruthy();
    expect(screen.getByText("첫 줄")).toBeTruthy();
    expect(screen.queryByText(/둘째 줄/)).toBeNull();
    expect(screen.getByText("읽은 날 · 11월 15일")).toBeTruthy();
    expect(screen.getByText("어디서 · 정독도서관")).toBeTruthy();
    await fireEvent.press(screen.getByText(SHELF.open));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/reading/[logId]", params: { logId: log.id } });
  });

  test("failed shelf load offers retry", async () => {
    fetchReadingLogs
      .mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""))
      .mockResolvedValueOnce({ items: [], next_cursor: null });
    await render(<ReadingLogScreen />);
    await fireEvent.press(await screen.findByText(SHELF.retry));
    expect(await screen.findByText(SHELF.emptyTitle)).toBeTruthy();
    expect(fetchReadingLogs).toHaveBeenCalledTimes(2);
  });

  test("sign out clears cached logs", async () => {
    const log = makeLog();
    fetchReadingLogs.mockResolvedValue({ items: [log], next_cursor: null });
    const view = await render(<ReadingLogScreen />);
    expect(await screen.findByTestId(`shelf-book-${log.id}`)).toBeTruthy();

    // 로그아웃: 등록된 정리 함수가 책장 캐시를 비운다
    expect(signOutCleanups.length).toBeGreaterThan(0);
    await act(async () => {
      for (const fn of signOutCleanups) await fn();
    });
    expect(api.shelfStore.get().items).toBeNull();
    mockedUseAuth.mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
    await view.rerender(<ReadingLogScreen />);
    expect(screen.queryByTestId(`shelf-book-${log.id}`)).toBeNull();

    // 다른 계정으로 로그인: 옛 기록이 한 권도 보이지 않는다(새 응답을 기다리는 동안에도)
    signedIn(USER_B);
    fetchReadingLogs.mockReturnValue(new Promise(() => undefined));
    await view.rerender(<ReadingLogScreen />);
    expect(screen.queryByTestId(`shelf-book-${log.id}`)).toBeNull();
    expect(screen.queryByTestId("shelf")).toBeNull();
  });

  test("other account cache is never shown", async () => {
    api.shelfStore.setPage(USER_A, { items: [makeLog()], next_cursor: null }, false);
    signedIn(USER_B);
    fetchReadingLogs.mockReturnValue(new Promise(() => undefined));
    await render(<ReadingLogScreen />);
    expect(screen.queryByTestId(`shelf-book-${makeLog().id}`)).toBeNull();
  });
});
