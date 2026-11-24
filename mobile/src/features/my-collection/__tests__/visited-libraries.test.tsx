import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { apiFetch } from "../../../auth/apiFetch";
import { useAuth } from "../../../auth/AuthProvider";
import { CUBE_PALETTE } from "../../../theme/tokens";
import { cubeNames } from "../../library-visit/shortName";
import { fakePost } from "../__fakes__/myCollectionApi";
import { fetchVisitedLibraries, type MyCollectionStamp, type VisitedLibrariesPage, type VisitedLibrary } from "../api";
import { MyCollectionScreen } from "../MyCollectionScreen";
import { VisitedLibraries } from "../VisitedLibraries";
import { collectionTone, VISIT_PALETTE } from "../visitPalette";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../auth/apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchVisitedLibraries: jest.fn(),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const fetchVisits = jest.mocked(fetchVisitedLibraries);
const request = jest.mocked(apiFetch);
const auth = jest.mocked(useAuth);

const jeongdok: VisitedLibrary = {
  library: { id: 101, name: "정독도서관", address: "서울특별시 종로구 북촌로5길 48 (화동)", area_label: "화동" },
  stamp_days: 3,
  guestbook_count: 0,
  first_on: "2026-11-02",
  last_on: "2026-11-18",
};
const namsan: VisitedLibrary = {
  library: { id: 103, name: "남산도서관", address: "서울특별시 용산구 소월로 109", area_label: null },
  stamp_days: 0,
  guestbook_count: 1,
  first_on: "2026-11-10",
  last_on: "2026-11-10",
};
const page = (items: VisitedLibrary[], next_cursor: string | null = null): VisitedLibrariesPage => ({ items, next_cursor });
const response = (body: unknown): Response => ({ ok: true, json: async () => body }) as Response;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setAuth(userId: string | null) {
  auth.mockReturnValue({ status: userId ? "signedIn" : "signedOut", userId } as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  jest.resetAllMocks();
  fetchVisits.mockResolvedValue(page([jeongdok, namsan]));
  setAuth("owner");
  request.mockImplementation(async (path) => {
    if (path === "/api/v1/me/profile") {
      return response({ user_id: "owner", nickname: "책친구", bio: null, avatar_url: null });
    }
    if (path === "/api/v1/me/inbox/unread") return response({ has_unread: false });
    return response({ items: [], next_cursor: null });
  });
});

test("collection palette is stable per library and independent of home fill", async () => {
  expect(collectionTone(101, VISIT_PALETTE)).toBe(collectionTone(109, VISIT_PALETTE));
  const homeFills: string[] = CUBE_PALETTE.map(({ hex }) => hex);
  expect(homeFills).not.toContain(collectionTone(101, VISIT_PALETTE));
  await render(<VisitedLibraries onOpenLibrary={jest.fn()} />);
  const cube = await screen.findByRole("button", { name: jeongdok.library.name });
  const lid = within(cube).getByTestId("cube-lid");
  expect(StyleSheet.flatten(lid.props.style).backgroundColor).toBe(collectionTone(101, VISIT_PALETTE));
});

test("collection cubes use short names", async () => {
  const openLibrary = jest.fn();
  await render(<VisitedLibraries onOpenLibrary={openLibrary} />);
  const cube = await screen.findByRole("button", { name: jeongdok.library.name });
  const top = within(cube).getByTestId("facade-top-name");
  const shortName = cubeNames([jeongdok.library, namsan.library]).get(101)!;
  expect(within(top).getByText(shortName.big)).toBeTruthy();
  expect(within(top).queryByText(jeongdok.library.name)).toBeNull();
  expect(within(cube).getByText("2026-11-02")).toBeTruthy();
  expect(within(cube).getByText("STAMP 3")).toBeTruthy();
  expect(screen.getByText("STAMP 0")).toBeTruthy();
  await fireEvent.press(cube);
  expect(openLibrary).toHaveBeenCalledWith(101);
});

test("late response after retry is dropped", async () => {
  const older = deferred<VisitedLibrariesPage>();
  const latest = deferred<VisitedLibrariesPage>();
  fetchVisits.mockRejectedValueOnce(new Error("offline"))
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(latest.promise);
  await render(<VisitedLibraries onOpenLibrary={jest.fn()} />);
  const retry = await screen.findByRole("button", { name: "↻ 다시 시도" });
  await fireEvent.press(retry);
  await fireEvent.press(retry);
  expect(fetchVisits.mock.calls[1]?.[1]?.aborted).toBe(true);
  await act(() => latest.resolve(page([namsan])));
  await act(() => older.resolve(page([jeongdok])));
  expect(screen.getByRole("button", { name: namsan.library.name })).toBeTruthy();
  expect(screen.queryByRole("button", { name: jeongdok.library.name })).toBeNull();
});

test("all visits load the next page, retain cards on failure, and retry the same cursor", async () => {
  fetchVisits.mockResolvedValueOnce(page([jeongdok], "page-2"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(page([jeongdok, namsan]));
  await render(<VisitedLibraries onOpenLibrary={jest.fn()} />);
  await fireEvent.press(await screen.findByRole("button", { name: "모두 보기" }));
  const grid = screen.getByTestId("visited-libraries-grid");
  await fireEvent(grid, "endReached");
  expect(await within(grid).findByRole("button", { name: jeongdok.library.name })).toBeTruthy();
  await fireEvent.press(await screen.findByRole("button", { name: "↻ 다시 시도" }));
  expect(await within(grid).findByRole("button", { name: namsan.library.name })).toBeTruthy();
  expect(within(grid).getAllByRole("button", { name: jeongdok.library.name })).toHaveLength(1);
  expect(fetchVisits.mock.calls.map(([cursor]) => cursor)).toEqual([null, "page-2", "page-2"]);
  await fireEvent.press(screen.getByRole("button", { name: "닫기" }));
  expect(screen.queryByTestId("visited-libraries-grid")).toBeNull();
  expect(screen.getAllByRole("button", { name: namsan.library.name })).toHaveLength(1);
});

test("signed-out and switched accounts cannot see visits from the previous request", async () => {
  const old = deferred<VisitedLibrariesPage>();
  fetchVisits.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([]));
  setAuth(null);
  const view = await render(<MyCollectionScreen />);
  expect(fetchVisits).not.toHaveBeenCalled();
  setAuth("owner");
  await view.rerender(<MyCollectionScreen />);
  setAuth("other");
  await view.rerender(<MyCollectionScreen />);
  expect(fetchVisits.mock.calls[0]?.[1]?.aborted).toBe(true);
  await act(() => old.resolve(page([jeongdok])));
  expect(screen.getByText("“다녀왔어요”를 누르면 방문한 도서관이 여기에 모여요")).toBeTruthy();
  expect(screen.queryByRole("button", { name: jeongdok.library.name })).toBeNull();
});

test("bookmark tab renders stamp card and unbookmark uses stamp endpoint", async () => {
  const stamp: MyCollectionStamp = {
    item_kind: "stamp",
    id: "same-id",
    library_id: 101,
    library_name: "정독도서관",
    author_nickname: "책친구",
    stamped_on: "2026-11-18",
    published_at: "2026-11-18T14:00:00+09:00",
    collected_at: "2026-11-18T14:05:00+09:00",
    mine: false,
    my_bookmark: true,
  };
  const original = request.getMockImplementation()!;
  const removal = deferred<Response>();
  request.mockImplementation((path, init) => {
    if (path === "/api/v1/me/bookmarks") return Promise.resolve(response({
      items: [stamp, fakePost(stamp.id, { my_bookmark: true })], next_cursor: null,
    }));
    if (path === "/api/v1/stamps/same-id/bookmark") {
      return init?.method === "DELETE" ? removal.promise : Promise.resolve(response({ bookmarked: true }));
    }
    return original(path, init);
  });
  await render(<MyCollectionScreen />);
  await fireEvent.press(screen.getByTestId("tab-bookmarks"));
  const card = await screen.findByTestId("stamp-card-same-id");
  expect(within(card).getByTestId("stamp-seal")).toBeTruthy();
  expect(within(card).getByText("11.18")).toBeTruthy();
  expect(within(card).getByText("책친구 · 다녀왔어요")).toBeTruthy();
  expect(screen.getByTestId("post-card-same-id")).toBeTruthy();
  const bookmark = within(card).getByTestId("stamp-bookmark-same-id");
  await fireEvent.press(bookmark);
  await fireEvent.press(bookmark);
  await act(() => removal.resolve(response({ bookmarked: false })));
  const dimmed = await screen.findByTestId("dimmed-same-id");
  expect(within(dimmed).queryByTestId("post-card-same-id")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "되돌리기" }));
  await waitFor(() => expect(screen.queryByTestId("dimmed-same-id")).toBeNull());
  expect(screen.getByTestId("stamp-card-same-id")).toBeTruthy();
  const writes = request.mock.calls
    .filter(([, init]) => init?.method === "DELETE" || init?.method === "PUT")
    .map(([path, init]) => [path, init?.method]);
  expect(writes).toEqual([
    ["/api/v1/stamps/same-id/bookmark", "DELETE"],
    ["/api/v1/stamps/same-id/bookmark", "PUT"],
  ]);
});

test("fetchVisitedLibraries calls real /api/v1/me/visited-libraries endpoint", async () => {
  const actualApi = jest.requireActual<typeof import("../api")>("../api");
  request.mockResolvedValueOnce(response(page([jeongdok], "next-cur")));
  const res = await actualApi.fetchVisitedLibraries("prev-cur");
  expect(res.items).toEqual([jeongdok]);
  expect(res.next_cursor).toBe("next-cur");
  expect(request).toHaveBeenCalledWith(
    "/api/v1/me/visited-libraries?cursor=prev-cur",
    expect.objectContaining({ method: "GET" })
  );
});
