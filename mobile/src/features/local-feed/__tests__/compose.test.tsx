// LOCAL-1-P2 글쓰기·올리기·내리기 (contracts/local-feed.md LOCAL-1 P5, 명세 결정 1~4·예외 #1~#7)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Keyboard, StyleSheet } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import * as publicApi from "../../../lib/publicApi";
import type { Book } from "../../../lib/publicApi";
import { resolvePostColor, theme } from "../../../theme";
import * as api from "../api";
import type { Post, PostCreateInput } from "../api";
import { ComposeScreen, PostMoreMenu, TEXT, titleAuthorText } from "../ComposeScreen";
import * as picker from "../imagePicker";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let setNavOptionsImpl: ((opts: {
  headerLeft?: () => React.ReactNode;
  headerRight?: (() => React.ReactNode) | undefined;
}) => void) | null = null;
const mockNav = {
  setOptions: (opts: {
    headerLeft?: () => React.ReactNode;
    headerRight?: (() => React.ReactNode) | undefined;
  }) => setNavOptionsImpl?.(opts),
};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
  useNavigation: () => mockNav,
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-2222-4333-8444-555555555555" }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  fetchLibrary: jest.fn(),
  fetchBook: jest.fn(),
  searchBooks: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  createPost: jest.fn(),
  uploadPostImage: jest.fn(),
  withdrawPost: jest.fn(),
}));
jest.mock("../imagePicker", () => ({
  pickPostImage: jest.fn(),
  canUseCamera: jest.fn(() => true),
  buildImageFormData: jest.fn(),
}));

const createPost = jest.mocked(api.createPost);
const uploadPostImage = jest.mocked(api.uploadPostImage);
const withdrawPost = jest.mocked(api.withdrawPost);
const pickPostImage = jest.mocked(picker.pickPostImage);
const fetchLibrary = jest.mocked(publicApi.fetchLibrary);
const fetchBook = jest.mocked(publicApi.fetchBook);
const searchBooks = jest.mocked(publicApi.searchBooks);
const mockedUseAuth = jest.mocked(useAuth);

const REQ_ID = "11111111-2222-4333-8444-555555555555";

function book(extra: Partial<Book> = {}): Book {
  return {
    isbn13: "9788936434120",
    title: "작별하지 않는다",
    author: "한강",
    publisher: "문학동네",
    cover_url: "https://img.test/cover.jpg",
    source: "kakao",
    description: null,
    pub_year: 2021,
    ...extra,
  };
}

function postFrom(input: PostCreateInput, extra: Partial<Post> = {}): Post {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    library: { id: input.library_id, name: "정독도서관" },
    book: null,
    image_kind: input.image_kind,
    image_url: input.image_kind === "color" ? null : "https://img.test/p.jpg",
    image_color: input.image_color,
    overlay_text: input.overlay_text,
    body: input.body,
    author: { nickname: "이웃-0000" },
    is_mine: true,
    reaction_count: 0,
    my_reaction: false,
    my_bookmark: false,
    published_at: "2026-11-17T12:00:00+09:00",
    ...extra,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function signedIn() {
  mockedUseAuth.mockReturnValue({
    status: "signedIn",
    userId: "00000000-0000-4000-8000-00000000000a",
  } as unknown as ReturnType<typeof useAuth>);
}

const submitButton = () => screen.getByRole("button", { name: /올리기|올리는 중/ });

function ComposeWithHeader(props: React.ComponentProps<typeof ComposeScreen>) {
  const [headerLeft, setHeaderLeft] = React.useState<(() => React.ReactNode) | null>(null);
  const [headerRight, setHeaderRight] = React.useState<(() => React.ReactNode) | null>(null);
  setNavOptionsImpl = (opts) => {
    if ("headerLeft" in opts) setHeaderLeft(() => opts.headerLeft ?? null);
    if ("headerRight" in opts) setHeaderRight(() => opts.headerRight ?? null);
  };
  return (
    <>
      {headerLeft ? headerLeft() : null}
      {headerRight ? headerRight() : null}
      <ComposeScreen {...props} />
    </>
  );
}

async function openCompose() {
  await render(<ComposeWithHeader libraryId={101} />);
  expect(await screen.findByText("정독도서관 피드에 올라가요")).toBeTruthy();
}

async function openAttachMenu() {
  if (!screen.queryByTestId("attach-menu")) {
    const slot = screen.queryByTestId("image-slot-button");
    if (slot) await fireEvent.press(slot);
    else await fireEvent.press(screen.getByText("이미지 바꾸기"));
  }
  expect(screen.getByTestId("attach-menu")).toBeTruthy();
}

async function chooseColor() {
  await openAttachMenu();
  await fireEvent.press(screen.getByText("단색 배경"));
}

async function chooseBookCover(chosen: Book) {
  searchBooks.mockResolvedValue({ items: [chosen], next_start: null, source: "kakao", fallback_reason: null });
  await openAttachMenu();
  await fireEvent.press(screen.getByText("책 표지"));
  await fireEvent.changeText(screen.getByLabelText("책 제목이나 저자"), "작별");
  await fireEvent.press(screen.getByText("찾기"));
  await fireEvent.press(await screen.findByText(chosen.title));
}

beforeEach(() => {
  jest.clearAllMocks();
  setNavOptionsImpl = null;
  signedIn();
  fetchLibrary.mockResolvedValue({ id: 101, name: "정독도서관" } as Awaited<ReturnType<typeof publicApi.fetchLibrary>>);
  createPost.mockImplementation(async (input) => postFrom(input));
});

describe("올리기 버튼", () => {
  test("compose disables submit until image chosen", async () => {
    await openCompose();
    expect(screen.queryByTestId("attach-menu")).toBeNull();
    expect(submitButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.getByText(TEXT.needImage)).toBeTruthy();
    await fireEvent.press(submitButton());
    expect(createPost).not.toHaveBeenCalled();

    await openAttachMenu();
    await fireEvent.press(screen.getByLabelText("첨부 창 닫기"));
    expect(screen.queryByTestId("attach-menu")).toBeNull();

    await chooseColor();
    expect(submitButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    expect(screen.queryByText(TEXT.needImage)).toBeNull();
  });

  test("double tap on submit sends once with same client_request_id", async () => {
    const pending = deferred<Post>();
    createPost.mockReturnValueOnce(pending.promise);
    await openCompose();
    await chooseColor();
    await fireEvent.press(submitButton());
    await fireEvent.press(submitButton());
    expect(screen.getByText(TEXT.submitting)).toBeTruthy();
    expect(createPost).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(postFrom(createPost.mock.calls[0]![0])));
    expect(await screen.findByText(TEXT.posted)).toBeTruthy();
    expect(createPost.mock.calls[0]![0].client_request_id).toBe(REQ_ID);
  });
});

describe("책 표지", () => {
  test("choosing book cover immediately opens book search and attaches book", async () => {
    await openCompose();
    await chooseBookCover(book());
    // 책을 고르면 바로 글자 단계로 돌아오고, 마지막 단계에 책이 이미 붙어 있다
    expect(screen.getByLabelText("이미지 위 글자")).toBeTruthy();
    expect(screen.getByTestId("attached-book").props.children.join("")).toContain("작별하지 않는다");
    expect(screen.queryByText("책 붙이기")).toBeNull();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ image_kind: "cover", isbn13: "9788936434120", image_path: null, image_color: null })
    );
  });

  test("book without cover shows generated title-author cover and submits as color fill3", async () => {
    await openCompose();
    await chooseBookCover(book({ cover_url: null }));
    expect(screen.getByText(TEXT.switchImage)).toBeTruthy();
    expect(screen.getByText(/표지를 찾지 못해 제목·저자로 만들었어요/)).toBeTruthy();
    expect(screen.getByTestId("compose-preview-text-mid").props.children).toBe("작별하지 않는다\n한강");
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        image_kind: "color",
        image_color: "fill3",
        isbn13: "9788936434120",
        overlay_text: "작별하지 않는다\n한강",
      })
    );
  });

  test("title-author text drops missing author and is cut to 80", () => {
    expect(titleAuthorText({ title: "제목", author: null })).toBe("제목");
    expect(titleAuthorText({ title: "가".repeat(100), author: "저자" })).toHaveLength(80);
  });

  test("switch to photo or color from missing cover keeps book", async () => {
    await openCompose();
    await chooseBookCover(book({ cover_url: null }));
    await fireEvent.press(screen.getByText(TEXT.switchImage));
    expect(screen.getByText("단색 배경")).toBeTruthy();
    expect(screen.getByTestId("attached-book")).toBeTruthy();
  });
});

describe("글자 자리·「표지 설정」 칩 (LOCAL-1b)", () => {
  test("style chip changes position and color for photo; color has tone only", async () => {
    pickPostImage.mockResolvedValue({ uri: "file:///p.jpg" });
    uploadPostImage.mockResolvedValue({ image_path: "u/p.jpg", image_url: "https://img.test/p.jpg", width: 10, height: 10, bytes: 1 });
    await openCompose();
    await openAttachMenu();
    await fireEvent.press(screen.getByText("앨범에서 고르기"));
    await fireEvent.changeText(screen.getByLabelText("이미지 위 글자"), "그 밤은 길었다");
    expect(screen.getByTestId("compose-preview-text-mid")).toBeTruthy();
    // 이전 입력 칸 아래 위치 3칸 줄은 없다 — 칩을 눌러야 보인다
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText("표지 설정"));
    expect(screen.getByText("글자 위치")).toBeTruthy();
    expect(screen.queryByText("표지 맞춤")).toBeNull(); // 사진에는 표지 맞춤 없음
    expect(screen.getAllByRole("radio").filter((r) => r.props.accessibilityState?.checked)).toHaveLength(2); // 가운데·자동
    await fireEvent.press(screen.getByText("위"));
    expect(screen.getByTestId("compose-preview-text-top")).toBeTruthy();
    await fireEvent.press(screen.getByText("아래"));
    expect(screen.getByTestId("compose-preview-text-bot")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("검정 글자"));
    expect(StyleSheet.flatten(screen.getByTestId("compose-preview-text-bot").props.style).color).toBe("#1D1D1F");
    await fireEvent.press(screen.getByText(TEXT.close));
    expect(screen.queryByTestId("style-menu")).toBeNull();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ image_kind: "photo", overlay_pos: "bot", overlay_tone: "dark", image_fit: null })
    );
  });

  test("color post: chip shows tone only and sends no position", async () => {
    await openCompose();
    await chooseColor();
    await fireEvent.changeText(screen.getByLabelText("이미지 위 글자"), "문장");
    await fireEvent.press(screen.getByLabelText("표지 설정"));
    expect(screen.queryByText("글자 위치")).toBeNull();
    expect(screen.getByText("글자 색")).toBeTruthy();
    expect(screen.getByTestId("compose-preview-text-mid")).toBeTruthy();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ image_kind: "color", overlay_pos: null, overlay_tone: "auto", image_fit: null })
    );
  });

  test("cover post: 표지 맞춤 여백 by default, 흐림·확대 change preview and are sent", async () => {
    await openCompose();
    await chooseBookCover(book());
    expect(screen.getByTestId("compose-preview-fit-contain")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("표지 설정"));
    await fireEvent.press(screen.getByText("흐림"));
    expect(screen.getByTestId("compose-preview-fit-blur")).toBeTruthy();
    await fireEvent.press(screen.getByText("확대"));
    expect(screen.getByTestId("compose-preview-fit-cover")).toBeTruthy();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ image_kind: "cover", overlay_pos: "mid", overlay_tone: "auto", image_fit: "cover" })
    );
  });

  test("posted screen shows UPLOADED with 게시물 보기 first and 피드 보기 below", async () => {
    await openCompose();
    await chooseColor();
    await fireEvent.press(submitButton());
    expect(await screen.findByText("UPLOADED")).toBeTruthy();
    expect(screen.getByText("피드 보기")).toBeTruthy();
    await fireEvent.press(screen.getByText("게시물 보기"));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/posts/[postId]", params: { postId: "aaaaaaaa-0000-4000-8000-000000000001" },
    });
  });
});

describe("감상", () => {
  test("body input is collapsed by default and expands on tap", async () => {
    await openCompose();
    await chooseColor();
    expect(screen.queryByLabelText("감상")).toBeNull();
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0].body).toBeNull();
  });

  test("tapping + opens body and sends trimmed text", async () => {
    await openCompose();
    await chooseColor();
    await fireEvent.press(screen.getByText(TEXT.openBody));
    await fireEvent.changeText(screen.getByLabelText("감상"), "  좋았어요  ");
    await fireEvent.press(submitButton());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ body: "좋았어요", image_kind: "color", image_color: "bold", library_id: 101 })
    );
  });
});

describe("막힐 때", () => {
  test("upload or create failure keeps inputs and retries", async () => {
    pickPostImage.mockResolvedValue({ uri: "file:///p.jpg" });
    uploadPostImage.mockRejectedValueOnce(new api.ApiCallError(503, "PROVIDER_UNAVAILABLE", "x", ""));
    uploadPostImage.mockResolvedValue({
      image_path: "u/p.jpg", image_url: "https://img.test/p.jpg", width: 10, height: 10, bytes: 10,
    });
    createPost.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    await openCompose();
    await openAttachMenu();
    await fireEvent.press(screen.getByText("앨범에서 고르기"));
    await fireEvent.changeText(screen.getByLabelText("이미지 위 글자"), "문장");
    await fireEvent.press(screen.getByText(TEXT.openBody));
    await fireEvent.changeText(screen.getByLabelText("감상"), "감상");

    await fireEvent.press(submitButton());
    expect(await screen.findByText(TEXT.failed)).toBeTruthy();
    expect(screen.getByLabelText("이미지 위 글자").props.value).toBe("문장");
    expect(screen.getByLabelText("감상").props.value).toBe("감상");
    expect(createPost).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(TEXT.retry)); // 업로드 성공 → 게시 네트워크 실패
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(TEXT.failed)).toBeTruthy();

    await fireEvent.press(screen.getByText(TEXT.retry)); // 이미 올린 사진은 다시 올리지 않는다
    expect(await screen.findByText(TEXT.posted)).toBeTruthy();
    expect(uploadPostImage).toHaveBeenCalledTimes(2);
    expect(createPost).toHaveBeenCalledTimes(2);
    expect(createPost.mock.calls[0]![0].client_request_id).toBe(createPost.mock.calls[1]![0].client_request_id);
    expect(createPost.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ image_kind: "photo", image_path: "u/p.jpg", overlay_text: "문장", body: "감상" })
    );
  });

  test("413 shows photo too large", async () => {
    pickPostImage.mockResolvedValue({ uri: "file:///p.jpg" });
    uploadPostImage.mockRejectedValueOnce(new api.ApiCallError(413, "PAYLOAD_TOO_LARGE", "사진이 너무 커요.", ""));
    await openCompose();
    await openAttachMenu();
    await fireEvent.press(screen.getByText("앨범에서 고르기"));
    await fireEvent.press(submitButton());
    expect(await screen.findByText(TEXT.tooLarge)).toBeTruthy();
    expect(screen.getByText(TEXT.retry)).toBeTruthy();
  });

  test("404 and 422 show message without retry button", async () => {
    createPost.mockRejectedValueOnce(new api.ApiCallError(404, "NOT_FOUND", "찾을 수 없어요.", "library_id"));
    await openCompose();
    await chooseColor();
    await fireEvent.press(submitButton());
    expect(await screen.findByText("찾을 수 없어요.")).toBeTruthy();
    expect(screen.queryByText(TEXT.retry)).toBeNull();

    createPost.mockRejectedValueOnce(
      new api.ApiCallError(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않아요.", "library_id")
    );
    await fireEvent.press(submitButton());
    expect(await screen.findByText("요청 형식이 올바르지 않아요.")).toBeTruthy();
    expect(screen.queryByText(TEXT.retry)).toBeNull();
  });

  test("pickPostImage failure shows notice", async () => {
    pickPostImage.mockRejectedValueOnce(new Error("permission denied"));
    await openCompose();
    await openAttachMenu();
    await fireEvent.press(screen.getByText("앨범에서 고르기"));
    expect(await screen.findByText(TEXT.pickFailed)).toBeTruthy();
  });

  test("invalid libraryId shows not found and blocks API calls and /libraries/NaN navigation", async () => {
    mockCanGoBack.mockReturnValueOnce(false);
    await render(<ComposeScreen libraryId={Number.NaN} isbn13="9788936434120" />);
    expect(screen.getByText(TEXT.notFound)).toBeTruthy();
    expect(fetchLibrary).not.toHaveBeenCalled();
    expect(fetchBook).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(TEXT.goBack));
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockReplace).not.toHaveBeenCalledWith("/libraries/NaN");
  });

  test("camera unavailable shows album guidance", async () => {
    jest.mocked(picker.canUseCamera).mockReturnValue(false);
    await openCompose();
    await openAttachMenu();
    expect(screen.queryByText("사진 찍기")).toBeNull();
    expect(screen.getByText("앨범에서 고르기")).toBeTruthy();
    jest.mocked(picker.canUseCamera).mockReturnValue(true);
  });
});

describe("닫기", () => {
  test("closing with unsaved input asks confirmation", async () => {
    await openCompose();
    await fireEvent.changeText(screen.getByLabelText("이미지 위 글자"), "쓰던 글");
    await fireEvent.press(screen.getByLabelText("닫기"));
    expect(screen.getByText(TEXT.discardTitle)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(TEXT.keepWriting));
    expect(screen.queryByText(TEXT.discardTitle)).toBeNull();
    expect(screen.getByLabelText("이미지 위 글자").props.value).toBe("쓰던 글");

    await fireEvent.press(screen.getByLabelText("닫기"));
    await fireEvent.press(screen.getByText(TEXT.discard));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("closing empty compose leaves without asking", async () => {
    await openCompose();
    await fireEvent.press(screen.getByLabelText("닫기"));
    expect(screen.queryByText(TEXT.discardTitle)).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe("로그인", () => {
  test("signed out entry shows login prompt without submitting", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedOut", userId: null } as unknown as ReturnType<typeof useAuth>);
    await render(<ComposeScreen libraryId={101} />);
    expect(screen.getByText(TEXT.loginNeeded)).toBeTruthy();
    expect(screen.queryByText("단색 배경")).toBeNull();
    await fireEvent.press(screen.getByText(TEXT.login));
    expect(mockPush).toHaveBeenCalledWith("/login");
    await fireEvent.press(screen.getByText(TEXT.close));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe("내리기", () => {
  test("author more menu withdraws after confirm while other user menu hides withdraw", async () => {
    withdrawPost.mockResolvedValue({ id: "aaaaaaaa-0000-4000-8000-000000000001", status: "withdrawn" });
    await openCompose();
    await chooseColor();
    await fireEvent.press(submitButton());
    expect(await screen.findByTestId("posted-card")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("더 보기"));
    await fireEvent.press(screen.getByText(TEXT.withdrawMenu));
    expect(screen.getByText(TEXT.withdrawTitle)).toBeTruthy();
    expect(withdrawPost).not.toHaveBeenCalled(); // 확인 전에는 내리지 않는다
    await fireEvent.press(screen.getByText(TEXT.withdraw));
    await waitFor(() => expect(withdrawPost).toHaveBeenCalledTimes(1));
    expect(withdrawPost.mock.calls[0]![0]).toBe("aaaaaaaa-0000-4000-8000-000000000001");
    expect(await screen.findByText(TEXT.withdrawn)).toBeTruthy();
    expect(screen.queryByTestId("posted-card")).toBeNull();

    const onWithdrawn = jest.fn();
    await render(<PostMoreMenu post={{ id: "other", is_mine: false }} onWithdrawn={onWithdrawn} />);
    await fireEvent.press(screen.getByLabelText("더 보기"));
    expect(screen.queryByText(TEXT.withdrawMenu)).toBeNull();
  });

  test("cancel in withdraw confirm keeps post", async () => {
    await render(<PostMoreMenu post={{ id: "mine", is_mine: true }} onWithdrawn={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText("더 보기"));
    await fireEvent.press(screen.getByText(TEXT.withdrawMenu));
    await fireEvent.press(screen.getByText(TEXT.cancel));
    expect(screen.queryByText(TEXT.withdrawTitle)).toBeNull();
    expect(withdrawPost).not.toHaveBeenCalled();
  });

  test("keyboard show moves submit button to headerRight and hides dock, keyboard hide restores dock", async () => {
    const listeners: Record<string, (() => void)[]> = {};
    const addSpy = jest.spyOn(Keyboard, "addListener").mockImplementation((event, cb) => {
      const key = String(event);
      listeners[key] = listeners[key] ?? [];
      listeners[key]!.push(cb as () => void);
      return { remove: jest.fn() } as never;
    });

    try {
      await openCompose();
      await chooseColor();
      expect(screen.getAllByRole("button", { name: TEXT.submit })).toHaveLength(1);
      expect(screen.queryByText(TEXT.needImage)).toBeNull();

      await act(async () => {
        for (const fn of [...(listeners.keyboardWillShow ?? []), ...(listeners.keyboardDidShow ?? [])]) fn();
      });

      const headerSubmit = screen.getByRole("button", { name: TEXT.submit });
      expect(headerSubmit).toBeTruthy();

      await act(async () => {
        for (const fn of [...(listeners.keyboardWillHide ?? []), ...(listeners.keyboardDidHide ?? [])]) fn();
      });
      expect(screen.getAllByRole("button", { name: TEXT.submit })).toHaveLength(1);

      await act(async () => {
        for (const fn of [...(listeners.keyboardWillShow ?? []), ...(listeners.keyboardDidShow ?? [])]) fn();
      });
      await fireEvent.press(screen.getByRole("button", { name: TEXT.submit }));
      await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    } finally {
      addSpy.mockRestore();
    }
  });

  test("color picker offers 8 colors without crimsonWhisper; renderer still supports 9 + legacy 6", async () => {
    await openCompose();
    await chooseColor();
    for (const token of api.COMPOSE_COLOR_TOKENS) {
      expect(screen.getByRole("button", { name: `색 ${token}` })).toBeTruthy();
    }
    expect(api.COMPOSE_COLOR_TOKENS).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "색 crimsonWhisper" })).toBeNull(); // LOCAL-1b P1b-7
    expect(api.COLOR_TOKENS).toHaveLength(9);
    expect(resolvePostColor("crimsonWhisper")).toBe("#6B0A00");
    expect(resolvePostColor("bold")).toBe("#EB5324");
    expect(resolvePostColor("fill1")).toBe(theme.colors.fill1);
    expect(resolvePostColor("inkStrong")).toBe(theme.colors.inkStrong);
  });
});
