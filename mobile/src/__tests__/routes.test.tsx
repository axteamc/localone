import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import RootLayout from "../../app/_layout";
import TabsLayout from "../../app/(tabs)/_layout";
import HomeTabScreen from "../../app/(tabs)/index";
import LoansTabScreen from "../../app/(tabs)/loans";
import MeTabScreen from "../../app/(tabs)/me";
import BookDetailStubScreen from "../../app/books/[isbn13]";
import LibraryDetailStubScreen from "../../app/libraries/[libraryId]";
import PostDetailStubScreen from "../../app/posts/[postId]";
import NewPostStubScreen from "../../app/posts/new";
import SearchStubScreen from "../../app/search";
import type { SignInResult } from "../auth/platform";
import { useAuth } from "../auth/AuthProvider";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn<() => Record<string, string | string[] | undefined>>();

const mockRecordedTabScreens: Array<{ name: string; options?: { title?: string } }> = [];
const mockRecordedStackScreens: Array<{ name: string; options?: { headerShown?: boolean } }> = [];
let mockLastStackScreenOptions: { title?: string } | undefined;

jest.mock("expo-router", () => {
  const ReactLib = require("react");
  const { Text, View } = require("react-native");

  function MockTabs({ children }: { children: React.ReactNode }) {
    return ReactLib.createElement(View, { testID: "tabs-container" }, children);
  }
  MockTabs.Screen = function MockTabsScreen(props: {
    name: string;
    options?: { title?: string };
  }) {
    mockRecordedTabScreens.push({ name: props.name, options: props.options });
    return ReactLib.createElement(
      Text,
      { testID: `tab-${props.name}` },
      props.options?.title ?? props.name
    );
  };

  function MockStack({
    children,
    screenOptions,
  }: {
    children?: React.ReactNode;
    screenOptions?: { title?: string };
  }) {
    mockLastStackScreenOptions = screenOptions;
    return ReactLib.createElement(View, { testID: "root-stack" }, children);
  }
  MockStack.Screen = function MockStackScreen(props: {
    name: string;
    options?: { headerShown?: boolean };
  }) {
    mockRecordedStackScreens.push({ name: props.name, options: props.options });
    return ReactLib.createElement(View, { testID: `stack-${props.name}` });
  };

  return {
    Tabs: MockTabs,
    Stack: MockStack,
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
    }),
    useLocalSearchParams: () => mockUseLocalSearchParams(),
  };
});

jest.mock("../auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => {
    const ReactLib = require("react");
    const { View } = require("react-native");
    return ReactLib.createElement(View, { testID: "auth-provider" }, children);
  },
  useAuth: jest.fn(),
}));

const mockedUseAuth = jest.mocked(useAuth);

describe("APP-0-P2 routes and tabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordedTabScreens.length = 0;
    mockRecordedStackScreens.length = 0;
    mockLastStackScreenOptions = undefined;
    mockUseLocalSearchParams.mockReturnValue({});
    mockedUseAuth.mockReturnValue({
      status: "signedOut",
      userId: null,
      signInWithGoogle: jest.fn<() => Promise<SignInResult>>(),
      signInWithApple: jest.fn<() => Promise<SignInResult>>(),
    });
  });

  test("tabs show home loans me in order", async () => {
    const view = await render(<TabsLayout />);

    expect(mockRecordedTabScreens.map((s) => s.name)).toEqual([
      "index",
      "loans",
      "me",
    ]);
    expect(mockRecordedTabScreens.map((s) => s.options?.title)).toEqual([
      "홈",
      "대출·반납",
      "내 정보",
    ]);
    expect(view.getByTestId("tab-index").props.children).toBe("홈");
    expect(view.getByTestId("tab-loans").props.children).toBe("대출·반납");
    expect(view.getByTestId("tab-me").props.children).toBe("내 정보");
    expect(view.queryByText(/독서\s*기록/)).toBeNull();
  });

  test("root layout wraps stack in AuthProvider and hides tabs header", async () => {
    const view = await render(<RootLayout />);

    expect(view.getByTestId("auth-provider")).toBeTruthy();
    expect(view.getByTestId("root-stack")).toBeTruthy();
    expect(mockLastStackScreenOptions).toEqual({ title: "동네한권" });
    expect(mockRecordedStackScreens).toEqual([
      { name: "(tabs)", options: { headerShown: false } },
    ]);
  });

  test("stub routes render params", async () => {
    const home = await render(<HomeTabScreen />);
    expect(home.getByText("홈")).toBeTruthy();
    expect(home.getByText("준비 중이에요")).toBeTruthy();

    const loans = await render(<LoansTabScreen />);
    expect(loans.getByText("대출·반납")).toBeTruthy();
    expect(loans.getByText("준비 중이에요")).toBeTruthy();

    const meSignedOut = await render(<MeTabScreen />);
    expect(meSignedOut.getByText("내 정보")).toBeTruthy();
    expect(meSignedOut.getByText("준비 중이에요")).toBeTruthy();
    expect(meSignedOut.getByText("로그인 안 함")).toBeTruthy();
    await fireEvent.press(meSignedOut.getByText("로그인"));
    expect(mockPush).toHaveBeenCalledWith("/login");

    mockedUseAuth.mockReturnValue({
      status: "signedIn",
      userId: "00000000-0000-4000-8000-00000000000a",
      signInWithGoogle: jest.fn<() => Promise<SignInResult>>(),
      signInWithApple: jest.fn<() => Promise<SignInResult>>(),
    });
    const meSignedIn = await render(<MeTabScreen />);
    expect(meSignedIn.getByText("로그인함")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({ libraryId: "101" });
    const lib = await render(<LibraryDetailStubScreen />);
    expect(lib.getByText("libraryId: 101")).toBeTruthy();
    expect(lib.getByText("준비 중이에요")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({ libraryId: "101", distanceM: "420" });
    const libWithDistance = await render(<LibraryDetailStubScreen />);
    expect(libWithDistance.getByText("libraryId: 101 · distanceM: 420")).toBeTruthy();

    for (const invalidDistance of ["-1", "12.5", "abc", ["100", "200"]]) {
      mockUseLocalSearchParams.mockReturnValue({
        libraryId: "101",
        distanceM: invalidDistance,
      });
      const libInvalidDist = await render(<LibraryDetailStubScreen />);
      expect(libInvalidDist.getByText("libraryId: 101")).toBeTruthy();
      expect(libInvalidDist.queryByText(/distanceM/)).toBeNull();
    }

    mockUseLocalSearchParams.mockReturnValue({
      postId: "00000000-0000-4000-8000-000000000001",
    });
    const post = await render(<PostDetailStubScreen />);
    expect(post.getByText("postId: 00000000-0000-4000-8000-000000000001")).toBeTruthy();
    expect(post.getByText("준비 중이에요")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({
      libraryId: "101",
      isbn13: "9788936434120",
    });
    const newPost = await render(<NewPostStubScreen />);
    expect(newPost.getByText("libraryId: 101 · isbn13: 9788936434120")).toBeTruthy();
    expect(newPost.getByText("준비 중이에요")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({ q: "한강", libraryId: "101" });
    const search = await render(<SearchStubScreen />);
    expect(search.getByText("q: 한강 · libraryId: 101")).toBeTruthy();
    expect(search.getByText("준비 중이에요")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({});
    const searchEmpty = await render(<SearchStubScreen />);
    expect(searchEmpty.getByText("검색 조건 없음")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({ isbn13: "9788936434120" });
    const book = await render(<BookDetailStubScreen />);
    expect(book.getByText("isbn13: 9788936434120")).toBeTruthy();
    expect(book.getByText("준비 중이에요")).toBeTruthy();
  });
});
