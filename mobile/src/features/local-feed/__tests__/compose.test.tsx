import { expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { ComposeScreen, MSG, PostMoreMenu, once } from "../ComposeScreen";
import { FAKE_BOOKS, PostApiError, PostsApi, createFakePostsApi } from "../api";

jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("../../../auth/apiFetch", () => ({ apiFetch: jest.fn() }));

const styleOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

const COVER_BOOK = FAKE_BOOKS[0]!;
const NO_COVER_BOOK = FAKE_BOOKS[1]!;

async function setup(over: Partial<React.ComponentProps<typeof ComposeScreen>> = {}) {
  const api = createFakePostsApi({ libraryName: () => "정독도서관" });
  const props = {
    libraryId: 101,
    libraryName: "정독도서관",
    api: api as PostsApi,
    signedIn: true,
    pickImage: jest.fn(async (_s: "camera" | "library") => ({ uri: "file:///photo.jpg" }) as { uri: string } | null),
    pickBook: jest.fn(async () => COVER_BOOK as typeof COVER_BOOK | null),
    onClose: jest.fn(),
    onPosted: jest.fn(),
    onLogin: jest.fn(),
    ...over,
  };
  await render(<ComposeScreen {...props} />);
  return { api, props };
}

test("이미지를 안 고르면 올리기가 눌리지 않고 안내가 보인다 (예외 2)", async () => {
  const { api, props } = await setup();
  expect(screen.getByText(MSG.needImage)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("compose-submit"));
  await act(async () => {});
  expect(props.onPosted).not.toHaveBeenCalled();
  expect(api.posts.size).toBe(0);
});

test("단색만 골라도 올라가고 글자·감상은 없어도 된다", async () => {
  const { api, props } = await setup();
  await fireEvent.press(screen.getByTestId("pick-color"));
  await fireEvent.press(screen.getByTestId("color-fill2"));
  await fireEvent.press(screen.getByTestId("compose-submit"));
  await waitFor(() => expect(props.onPosted).toHaveBeenCalledTimes(1));
  const post = [...api.posts.values()][0]!;
  expect(post.image_kind).toBe("color");
  expect(post.image_color).toBe("fill2");
  expect(post.overlay_text).toBeNull();
  expect(post.body).toBeNull();
  expect(post.library.id).toBe(101);
});

test("책 표지를 누르면 바로 책을 찾고, 그 책이 마지막 단계에 이미 붙어 있다 (결정 2)", async () => {
  const { api, props } = await setup();
  await fireEvent.press(screen.getByTestId("pick-cover"));
  await waitFor(() => expect(screen.getByTestId("canvas")).toBeTruthy());
  expect(props.pickBook).toHaveBeenCalledTimes(1);
  expect(screen.getByText(`📖 ${COVER_BOOK.title} · ${COVER_BOOK.author}`)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("compose-submit"));
  await waitFor(() => expect(props.onPosted).toHaveBeenCalled());
  const post = [...api.posts.values()][0]!;
  expect(post.image_kind).toBe("cover");
  expect(post.book?.isbn13).toBe(COVER_BOOK.isbn13);
  expect(props.pickBook).toHaveBeenCalledTimes(1); // 마지막에 다시 찾지 않는다
});

test("표지가 없는 책이면 제목·저자 표지와 안내를 보여 주고 단색으로 올린다 (예외 5)", async () => {
  const { api, props } = await setup({ pickBook: jest.fn(async () => NO_COVER_BOOK as typeof NO_COVER_BOOK | null) });
  await fireEvent.press(screen.getByTestId("pick-cover"));
  await waitFor(() => expect(screen.getByTestId("no-cover")).toBeTruthy());
  expect(screen.getByText(new RegExp(MSG.noCover))).toBeTruthy();
  expect(screen.getByText(NO_COVER_BOOK.title)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("compose-submit"));
  await waitFor(() => expect(props.onPosted).toHaveBeenCalled());
  const post = [...api.posts.values()][0]!;
  expect(post.image_kind).toBe("color");
  expect(post.image_color).toBe("fill3");
  expect(post.overlay_text).toBe(`${NO_COVER_BOOK.title} · ${NO_COVER_BOOK.author}`);
});

test("사진 위 글자는 가운데에서 시작하고 위·아래 버튼 한 번으로 옮긴다 (결정 3)", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("pick-photo"));
  await waitFor(() => expect(screen.getByTestId("pos-seg")).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId("overlay-input"), "그 밤은 길었다");
  expect(styleOf("overlay").top).toBe("45%");
  await fireEvent.press(screen.getByTestId("pos-top"));
  expect(styleOf("overlay").top).toBe("10%");
  await fireEvent.press(screen.getByTestId("pos-bot"));
  expect(styleOf("overlay").bottom).toBe(16);
  expect(styleOf("overlay").top).toBeUndefined();
});

test("단색 배경에는 자리 버튼이 없고 글자는 늘 가운데", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("pick-color"));
  await fireEvent.changeText(screen.getByTestId("overlay-input"), "좋은 문장");
  expect(screen.queryByTestId("pos-seg")).toBeNull();
  expect(styleOf("overlay").top).toBe("45%");
});

test("감상 칸은 접혀 있고 '+ 감상 쓰기'를 누르면 펼쳐진다", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("pick-color"));
  expect(screen.queryByTestId("body-input")).toBeNull();
  await fireEvent.press(screen.getByTestId("open-body"));
  expect(screen.getByTestId("body-input")).toBeTruthy();
});

test("연타 막기: 진행 중에 다시 부르면 무시한다 (예외 3)", async () => {
  let release!: () => void;
  const fn = jest.fn(() => new Promise<void>((r) => { release = r; }));
  const guarded = once(fn);
  const a = guarded();
  const b = guarded();
  expect(fn).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([a, b]);
  const c = guarded();
  expect(fn).toHaveBeenCalledTimes(2); // 끝난 뒤에는 다시 부를 수 있다(다시 올리기)
  release();
  await c;
});

test("올리기를 두 번 눌러도 같은 요청 번호라 게시물은 하나 (예외 3)", async () => {
  const api = createFakePostsApi();
  const createSpy = jest.fn((input: Parameters<PostsApi["createPost"]>[0]) => api.createPost(input));
  await setup({ api: { ...api, createPost: createSpy } });
  await fireEvent.press(screen.getByTestId("pick-color"));
  await fireEvent.press(screen.getByTestId("compose-submit"));
  await fireEvent.press(screen.getByTestId("compose-submit"));
  await waitFor(() => expect(createSpy).toHaveBeenCalled());
  const ids = new Set(createSpy.mock.calls.map((c) => c[0].client_request_id));
  expect(ids.size).toBe(1);
  expect(api.posts.size).toBe(1);
});

test("올리다 막히면 쓴 내용이 남고 '다시 올리기'로 다시 올린다 (예외 1)", async () => {
  const api = createFakePostsApi();
  let fail = true;
  const upload = jest.fn(async (uri: string) => {
    if (fail) throw new PostApiError(0, "NETWORK", "x", "");
    return api.uploadPostImage(uri);
  });
  const { props } = await setup({ api: { ...api, uploadPostImage: upload } });
  await fireEvent.press(screen.getByTestId("pick-photo"));
  await waitFor(() => expect(screen.getByTestId("overlay-input")).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId("overlay-input"), "남아 있어야 하는 글자");
  await fireEvent.press(screen.getByTestId("compose-submit"));
  expect(await screen.findByText(MSG.failed)).toBeTruthy();
  expect(api.posts.size).toBe(0);
  expect(screen.getByTestId("overlay-input").props.value).toBe("남아 있어야 하는 글자");
  fail = false;
  await fireEvent.press(screen.getByTestId("retry"));
  await waitFor(() => expect(props.onPosted).toHaveBeenCalledTimes(1));
  expect(api.posts.size).toBe(1);
  expect([...api.posts.values()][0]!.overlay_text).toBe("남아 있어야 하는 글자");
});

test("사진이 너무 크면 '사진이 너무 커요.'", async () => {
  const api = createFakePostsApi();
  await setup({ api: { ...api, uploadPostImage: async () => { throw new PostApiError(413, "PAYLOAD_TOO_LARGE", "x", ""); } } });
  await fireEvent.press(screen.getByTestId("pick-photo"));
  await waitFor(() => expect(screen.getByTestId("compose-submit")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("compose-submit"));
  expect(await screen.findByText(MSG.tooBig)).toBeTruthy();
  expect(api.posts.size).toBe(0);
});

test("로그인 안 한 사람이 들어오면 로그인 안내가 뜨고 아무것도 올라가지 않는다 (예외 4)", async () => {
  const { api, props } = await setup({ signedIn: false });
  expect(screen.getByText(MSG.loginTitle)).toBeTruthy();
  expect(screen.getByText(MSG.loginSub)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("login"));
  expect(props.onLogin).toHaveBeenCalled();
  expect(api.posts.size).toBe(0);
});

test("쓰던 글을 닫으려 하면 버릴지 묻는다 (예외 7)", async () => {
  const { props } = await setup();
  await fireEvent.press(screen.getByTestId("pick-color"));
  await fireEvent.press(screen.getByTestId("compose-close"));
  expect(screen.getByText(MSG.discardTitle)).toBeTruthy();
  expect(props.onClose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("keep-writing"));
  expect(screen.queryByText(MSG.discardTitle)).toBeNull();
  await fireEvent.press(screen.getByTestId("compose-close"));
  await fireEvent.press(screen.getByTestId("discard"));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test("아무것도 안 썼으면 묻지 않고 닫힌다", async () => {
  const { props } = await setup();
  await fireEvent.press(screen.getByTestId("compose-close"));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test("내 게시물은 ⋯ → 게시물 내리기 → 확인으로 내리고, 화면에서 사라진다 (결정 4)", async () => {
  const api = createFakePostsApi();
  const post = await api.createPost({ client_request_id: "r", library_id: 101, isbn13: null, image_kind: "color", image_path: null, image_color: "fill1", overlay_text: null, body: null });
  const onWithdrawn = jest.fn();
  await render(<PostMoreMenu post={post} api={api} onWithdrawn={onWithdrawn} />);
  await fireEvent.press(screen.getByTestId("more"));
  await fireEvent.press(screen.getByTestId("withdraw-open"));
  expect(screen.getByText("이 게시물을 내릴까요?")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("withdraw-cancel"));
  expect(api.posts.get(post.id)!.status).toBe("published");
  await fireEvent.press(screen.getByTestId("more"));
  await fireEvent.press(screen.getByTestId("withdraw-open"));
  await fireEvent.press(screen.getByTestId("withdraw-confirm"));
  await waitFor(() => expect(onWithdrawn).toHaveBeenCalledWith(post.id));
  expect(api.posts.get(post.id)!.status).toBe("withdrawn");
});

test("남의 게시물 ⋯ 메뉴에는 '게시물 내리기'가 없다", async () => {
  const api = createFakePostsApi();
  const post = { ...(await api.createPost({ client_request_id: "r", library_id: 101, isbn13: null, image_kind: "color", image_path: null, image_color: "fill1", overlay_text: null, body: null })), is_mine: false };
  await render(<PostMoreMenu post={post} api={api} onWithdrawn={jest.fn()} />);
  await fireEvent.press(screen.getByTestId("more"));
  expect(screen.getByTestId("more-sheet")).toBeTruthy();
  expect(screen.queryByTestId("withdraw-open")).toBeNull();
});

test("같은 요청 번호로 다시 보내면 가짜 서버도 첫 게시물을 돌려준다 (F9 모양)", async () => {
  const api = createFakePostsApi();
  const input = { client_request_id: "r1", library_id: 101, isbn13: null, image_kind: "color" as const, image_path: null, image_color: "fill1" as const, overlay_text: null, body: null };
  const a = await api.createPost(input);
  const b = await api.createPost(input);
  expect(b.id).toBe(a.id);
  expect(api.posts.size).toBe(1);
});
