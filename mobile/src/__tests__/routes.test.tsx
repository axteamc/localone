import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import RootLayout from "../../app/_layout";
import TabsLayout from "../../app/(tabs)/_layout";
import HomeTabScreen from "../../app/(tabs)/index";
import LoansTabScreen from "../../app/(tabs)/loans";
import MeTabScreen from "../../app/(tabs)/me";
import LibraryDetailStubScreen from "../../app/libraries/[libraryId]";
import PostDetailStubScreen from "../../app/posts/[postId]";
import NewPostStubScreen from "../../app/posts/new";
import type { SignInResult } from "../auth/platform";
import { theme } from "../theme";
import { useAuth } from "../auth/AuthProvider";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn<() => Record<string, string | string[] | undefined>>();

const mockRecordedTabScreens: Array<{ name: string; options?: { title?: string } }> = [];
const mockRecordedStackScreens: Array<{ name: string; options?: { headerShown?: boolean } }> = [];
let mockLastStackScreenOptions: { title?: string } | undefined;
let mockLastTabsScreenOptions: Record<string, unknown> | undefined;

// LIB-3: 대출·반납 탭의 빌릴 예정 구역은 plans.test.tsx에서 본다(서버 호출 모듈을 읽지 않게)
jest.mock("../features/book-search/LoanPlansSection", () => ({ LoanPlansSection: () => null }));
// LOAN-1: 내 대출 구역은 loan-assistant loans.test.tsx에서 본다(같은 이유)
jest.mock("../features/loan-assistant/LoansSection", () => ({ LoansSection: () => null }));
// LOAN-3: 루트의 알림 누름 구독은 loan-assistant reminders.test.ts에서 본다(기기 알림 모듈을 읽지 않게)
jest.mock("../features/loan-assistant/notifications.platform", () => ({ subscribeNotificationTap: () => () => undefined }));

const mockComposeScreen = jest.fn<(props: { libraryId: number; isbn13?: string | null }) => void>();
const mockVisitScreen = jest.fn<(props: { libraryId: number | null; distanceM: number | null }) => void>();
const mockPostDetail = jest.fn<(props: { postId: string; visitLibraryId: number | null }) => void>();

// LOCAL-2: 게시물 상세는 실제 화면이 붙었다. 이 시험은 경로가 넘기는 값만 본다(화면은 local-feed 시험에서)
jest.mock("../features/local-feed/PostDetail", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    PostDetail: (props: { postId: string; visitLibraryId: number | null }) => {
      mockPostDetail(props);
      return ReactLib.createElement(View, { testID: "local-feed-post-detail" });
    },
  };
});

// MY-1: 내 정보 탭은 실제 화면이 붙었다. 이 시험은 경로만 본다(화면은 my-collection 시험에서)
jest.mock("../features/my-collection/MyCollectionScreen", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return { MyCollectionScreen: () => ReactLib.createElement(View, { testID: "my-collection-screen" }) };
});

jest.mock("../features/library-visit/HomeScreen", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return { HomeScreen: () => ReactLib.createElement(View, { testID: "library-visit-home" }) };
});

jest.mock("../features/local-feed/ComposeScreen", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    ComposeScreen: (props: { libraryId: number; isbn13?: string | null }) => {
      mockComposeScreen(props);
      return ReactLib.createElement(View, { testID: "local-feed-compose" });
    },
  };
});

jest.mock("../features/local-feed/VisitScreen", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    VisitScreen: (props: { libraryId: number | null; distanceM: number | null }) => {
      mockVisitScreen(props);
      return ReactLib.createElement(View, { testID: "local-feed-visit" });
    },
  };
});

jest.mock("expo-router", () => {
  const ReactLib = require("react");
  const { Text, View } = require("react-native");

  function MockTabs({
    children,
    screenOptions,
  }: {
    children: React.ReactNode;
    screenOptions?: Record<string, unknown>;
  }) {
    mockLastTabsScreenOptions = screenOptions;
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

  // READ-1 P5 `reading tab is second`: 홈 → 독서 기록 → 대출·반납 → 내 정보 (R1-6)
  test("reading tab is second", async () => {
    const view = await render(<TabsLayout />);

    expect(mockRecordedTabScreens.map((s) => s.name)).toEqual([
      "index",
      "reading",
      "loans",
      "me",
    ]);
    expect(mockRecordedTabScreens.map((s) => s.options?.title)).toEqual([
      "홈",
      "독서 기록",
      "대출·반납",
      "내 정보",
    ]);
    expect(view.getByTestId("tab-index").props.children).toBe("홈");
    expect(view.getByTestId("tab-reading").props.children).toBe("독서 기록");
    expect(view.getByTestId("tab-loans").props.children).toBe("대출·반납");
    expect(view.getByTestId("tab-me").props.children).toBe("내 정보");
  });

  test("tabs hide the missing-icon glyph and center labels (#128)", async () => {
    await render(<TabsLayout />);

    expect(mockLastTabsScreenOptions).toMatchObject({
      tabBarIconStyle: { display: "none" },
      tabBarLabelPosition: "beside-icon",
      tabBarLabelStyle: { marginStart: 0, marginEnd: 0 },
    });
    for (const screen of mockRecordedTabScreens) {
      expect(screen.options).not.toHaveProperty("tabBarIcon");
    }
  });

  test("root layout wraps stack in AuthProvider and hides tabs header", async () => {
    const view = await render(<RootLayout />);

    expect(view.getByTestId("auth-provider")).toBeTruthy();
    expect(view.getByTestId("root-stack")).toBeTruthy();
    // 2026-11-18 D 결정: 머리 띠는 파사드와 같은 유리판(panelFrosted) + 영어 표찰
    expect(mockLastStackScreenOptions).toMatchObject({ title: "동네한권", headerStyle: { backgroundColor: theme.colors.panelFrosted } });
    expect(mockRecordedStackScreens).toEqual(
      expect.arrayContaining([
        { name: "(tabs)", options: { headerShown: false } },
        { name: "login", options: { headerShown: false } },
        expect.objectContaining({ name: "settings", options: expect.objectContaining({ title: "설정" }) }), // AUTH-2 G6
      ])
    );
  });

  test("stub routes render params", async () => {
    // 홈 탭은 VISIT-1 지도 홈을 그린다(스텁 아님)
    const home = await render(<HomeTabScreen />);
    expect(home.getByTestId("library-visit-home")).toBeTruthy();

    const loans = await render(<LoansTabScreen />);
    expect(loans.getByText("대출·반납")).toBeTruthy();
    expect(loans.getByText("로그인하면 빌릴 예정과 내 대출을 볼 수 있어요")).toBeTruthy(); // LIB-3 N9

    // MY-1: 내 정보 탭은 MyCollectionScreen을 그린다(비로그인·로그인 화면은 my-collection 시험에서)
    const me = await render(<MeTabScreen />);
    expect(me.getByTestId("my-collection-screen")).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({ libraryId: "101" });
    const lib = await render(<LibraryDetailStubScreen />);
    expect(lib.getByTestId("local-feed-visit")).toBeTruthy();
    expect(mockVisitScreen).toHaveBeenLastCalledWith({
      libraryId: 101,
      distanceM: null,
    });

    mockUseLocalSearchParams.mockReturnValue({ libraryId: "101", distanceM: "420" });
    const libWithDistance = await render(<LibraryDetailStubScreen />);
    expect(libWithDistance.getByTestId("local-feed-visit")).toBeTruthy();
    expect(mockVisitScreen).toHaveBeenLastCalledWith({
      libraryId: 101,
      distanceM: 420,
    });

    for (const invalidDistance of ["-1", "12.5", "abc", ["100", "200"]]) {
      mockUseLocalSearchParams.mockReturnValue({
        libraryId: "101",
        distanceM: invalidDistance,
      });
      const libInvalidDist = await render(<LibraryDetailStubScreen />);
      expect(libInvalidDist.getByTestId("local-feed-visit")).toBeTruthy();
      expect(mockVisitScreen).toHaveBeenLastCalledWith({
        libraryId: 101,
        distanceM: null,
      });
    }

    mockUseLocalSearchParams.mockReturnValue({
      postId: "00000000-0000-4000-8000-000000000001",
    });
    const post = await render(<PostDetailStubScreen />);
    expect(post.getByTestId("local-feed-post-detail")).toBeTruthy();
    expect(mockPostDetail).toHaveBeenLastCalledWith({
      postId: "00000000-0000-4000-8000-000000000001",
      visitLibraryId: null,
    });

    // 방문 중인 도서관(libraryId)이 양의 정수면 함께 넘기고, 아니면 null
    mockUseLocalSearchParams.mockReturnValue({
      postId: "00000000-0000-4000-8000-000000000001",
      libraryId: "101",
    });
    await render(<PostDetailStubScreen />);
    expect(mockPostDetail).toHaveBeenLastCalledWith({
      postId: "00000000-0000-4000-8000-000000000001",
      visitLibraryId: 101,
    });
    mockUseLocalSearchParams.mockReturnValue({
      postId: "00000000-0000-4000-8000-000000000001",
      libraryId: "abc",
    });
    await render(<PostDetailStubScreen />);
    expect(mockPostDetail).toHaveBeenLastCalledWith({
      postId: "00000000-0000-4000-8000-000000000001",
      visitLibraryId: null,
    });

    mockUseLocalSearchParams.mockReturnValue({
      libraryId: "101",
      isbn13: "9788936434120",
    });
    const newPost = await render(<NewPostStubScreen />);
    expect(newPost.getByTestId("local-feed-compose")).toBeTruthy();
    expect(mockComposeScreen).toHaveBeenLastCalledWith({
      libraryId: 101,
      isbn13: "9788936434120",
    });
  });
});
