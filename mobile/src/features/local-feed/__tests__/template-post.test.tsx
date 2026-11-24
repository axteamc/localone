import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import NewPostScreen from "../../../../app/posts/new";
import { useAuth } from "../../../auth/AuthProvider";
import { searchLibrariesByName } from "../../../lib/publicApi";
import { ReadingLogDetail } from "../../reading-log/ReadingLogDetail";
import { fetchReadingLog, type ReadingLog } from "../../reading-log/api";
import { ApiCallError, createPost, uploadPostImage, type Post, type PostCreateInput } from "../api";
import { cardHeightRatio, PostCard } from "../PostCard";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { fromLog?: string } = {};
const mockListeners = new Map<string, () => void>();
const mockNavigation = {
  addListener: (name: string, callback: () => void) => {
    mockListeners.set(name, callback);
    return () => { mockListeners.delete(name); };
  },
  isFocused: () => true,
};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "template-request" }));
jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(), registerSignOutCleanup: jest.fn(() => () => undefined),
}));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  searchLibrariesByName: jest.fn(),
}));
jest.mock("../../reading-log/api", () => ({
  ...jest.requireActual<object>("../../reading-log/api"),
  fetchReadingLog: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  createPost: jest.fn(), uploadPostImage: jest.fn(),
}));

const load = jest.mocked(fetchReadingLog);
const publish = jest.mocked(createPost);
const search = jest.mocked(searchLibrariesByName);
const upload = jest.mocked(uploadPostImage);

function auth(userId = "reader-A") {
  jest.mocked(useAuth).mockReturnValue({ status: "signedIn", userId } as ReturnType<typeof useAuth>);
}

const library = { id: 101, name: "기록의 도서관" };
const book = { isbn13: "9788936434120", title: "읽은 책", author: "저자", cover_url: null };
function record(extra: Partial<ReadingLog> = {}): ReadingLog {
  return {
    id: "log-A", book, library,
    read_on: "2020-02-03", loan_id: "private-loan",
    note: "선택하지 않은 감상", quote: "좋았던 문장", published_post_id: null,
    created_at: "2020-02-03T00:00:00+09:00", updated_at: "2020-02-03T00:00:00+09:00",
    ...extra,
  };
}

function post(input: PostCreateInput): Post {
  return {
    id: "post-A", library: { id: input.library_id, name: "게시할 도서관" },
    book: input.isbn13 ? book : null,
    image_kind: input.image_kind, image_value: input.image_value,
    image_url: null, image_color: null, overlay_text: input.overlay_text, body: input.body,
    author: { nickname: "독자" }, is_mine: true, reaction_count: 0, my_reaction: false, my_bookmark: false,
    published_at: "2026-11-24T10:00:00+09:00",
  };
}

function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function pickLibrary() {
  search.mockResolvedValue({
    mode: "search", radius_km: null, dtl_region: null, q: "바꿀",
    items: [{ id: 202, name: "바꿀 도서관", address: "서울", latitude: null, longitude: null,
      dtl_region_code: null, area_label: null, distance_m: null,
      today: { date: "2026-11-24", is_closed: null, hours_text: null, holiday_unchecked: true } }],
  });
  await fireEvent.changeText(screen.getByLabelText("도서관 이름"), "바꿀");
  await fireEvent.press(screen.getByText("도서관 찾기"));
  await fireEvent.press(await screen.findByText("바꿀 도서관"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockParams = { fromLog: "log-A" };
  auth();
  load.mockReset().mockResolvedValue(record());
  publish.mockReset().mockImplementation(async (input) => post(input));
});

test("template post renders without image upload and only selected public fields are submitted", async () => {
  await render(<NewPostScreen />);
  await screen.findByText("게시할 내용 미리보기");
  expect(load.mock.calls[0]?.[0]).toBe("log-A");
  expect(screen.getByText("기록의 도서관")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("잉크 손글씨"));
  await fireEvent.changeText(screen.getByLabelText("공개할 문장"), "  공개할 문장만  ");
  await fireEvent.press(screen.getByRole("checkbox"));
  await fireEvent.press(screen.getByText("도서관 변경"));
  await pickLibrary();
  expect(publish).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("올리기"));
  await screen.findByText("올렸어요");
  expect(screen.getByTestId("template-card-ink")).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
  expect(publish.mock.calls[0]?.[0]).toEqual({
    client_request_id: "template-request", reading_log_id: "log-A", library_id: 202, isbn13: null,
    image_kind: "template", image_value: "ink", image_path: null, image_color: null,
    overlay_text: "공개할 문장만", body: null,
  });
});

test("missing library requires a manual selection and load failure offers retry", async () => {
  load.mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(record({ library: null, quote: null }));
  await render(<NewPostScreen />);
  await fireEvent.press(await screen.findByText("다시 시도"));
  await screen.findByText("도서관 선택");
  expect(screen.getByLabelText("공개할 문장").props.value).toBe("");
  expect(screen.getByRole("button", { name: "올리기" }).props.accessibilityState?.disabled).toBe(true);
  await fireEvent.press(screen.getByText("도서관 선택"));
  await pickLibrary();
  await fireEvent.press(screen.getByText("올리기"));
  expect(publish.mock.calls[0]?.[0]).toMatchObject({ library_id: 202, overlay_text: null });
});

test("return from publish and withdrawal refreshes the link", async () => {
  load.mockResolvedValueOnce(record())
    .mockResolvedValueOnce(record({ published_post_id: "post-A" }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(record());
  await render(<ReadingLogDetail logId="log-A" />);
  await fireEvent.press(await screen.findByText("게시물로 올리기"));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/posts/new", params: { fromLog: "log-A" } });
  await act(async () => mockListeners.get("focus")?.());
  await fireEvent.press(await screen.findByText("올린 게시물 보기"));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/posts/[postId]", params: { postId: "post-A" } });
  await act(async () => mockListeners.get("focus")?.());
  expect(await screen.findByText("기록을 불러오지 못했어요.")).toBeTruthy();
  expect(screen.queryByText("게시물로 올리기")).toBeNull();
  await fireEvent.press(screen.getByText("다시 해 보기"));
  expect(await screen.findByText("게시물로 올리기")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(4);
});

test("stale record and publication responses never replace a new record draft", async () => {
  const oldRecord = deferred<ReadingLog>();
  const oldPost = deferred<Post>();
  load.mockReturnValueOnce(oldRecord.promise)
    .mockResolvedValueOnce(record({ id: "log-B", quote: "B의 문장" }))
    .mockResolvedValueOnce(record({ id: "log-C", quote: "C의 문장" }));
  publish.mockReturnValueOnce(oldPost.promise);
  const rendered = await render(<NewPostScreen />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  mockParams = { fromLog: "log-B" };
  await rendered.rerender(<NewPostScreen />);
  await screen.findByDisplayValue("B의 문장");
  await act(async () => oldRecord.resolve(record({ published_post_id: "stale-post" })));
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("B의 문장")).toBeTruthy();

  await fireEvent.press(screen.getByText("올리기"));
  auth("reader-B");
  mockParams = { fromLog: "log-C" };
  await rendered.rerender(<NewPostScreen />);
  await screen.findByDisplayValue("C의 문장");
  await fireEvent.changeText(screen.getByLabelText("공개할 문장"), "C의 새 초안");
  await act(async () => oldPost.resolve(post(publish.mock.calls[0]![0])));
  expect(screen.queryByText("올렸어요")).toBeNull();
  expect(screen.getByDisplayValue("C의 새 초안")).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(publish).toHaveBeenCalledTimes(1);
});

test("retries preserve the request key and conflicts open the verified public post", async () => {
  publish.mockRejectedValueOnce(new Error("lost response"))
    .mockRejectedValueOnce(new ApiCallError(409, "ALREADY_PUBLISHED", "이미 올렸어요", ""));
  load.mockResolvedValueOnce(record()).mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(record({ published_post_id: "verified" }));
  await render(<NewPostScreen />);
  await screen.findByText("게시할 내용 미리보기");
  await fireEvent.changeText(screen.getByLabelText("공개할 문장"), "보존할 초안");
  await fireEvent.press(screen.getByText("올리기"));
  await fireEvent.press(await screen.findByText("다시 올리기"));
  await screen.findByText("이미 올린 게시물을 확인하지 못했어요. 다시 시도해 주세요.");
  expect(publish.mock.calls[0]?.[0]).toEqual(publish.mock.calls[1]?.[0]);
  expect(screen.getByDisplayValue("보존할 초안")).toBeTruthy();
  await fireEvent.press(screen.getByText("다시 시도"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: "/posts/[postId]", params: { postId: "verified", notice: "already-published" },
  }));
  expect(publish).toHaveBeenCalledTimes(2);
});

test("feed card uses the same square template component", async () => {
  const item = {
    id: "post-A", library_id: 101, library_name: library.name, image_kind: "template" as const,
    image_value: "minimal" as const, image_url: null, image_color: null, book,
    overlay_text: "공개 문장", published_at: "2026-11-24T12:00:00+09:00", my_reaction: false, my_bookmark: false,
  };
  await render(<PostCard post={item} width={160} onPress={() => undefined} />);
  expect(cardHeightRatio(item)).toBe(1);
  expect(screen.getByTestId("template-card-minimal")).toBeTruthy();
  expect(screen.getByText("공개 문장")).toBeTruthy();
});
