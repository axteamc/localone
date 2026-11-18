import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PostDetail } from "../features/local-feed/PostDetail";
import { VisitHeader, VisitHeaderFolded } from "../features/local-feed/VisitHeader";
import { ProfileHeader } from "../features/my-collection/ProfileHeader";
import * as feedApi from "../features/local-feed/api";
import LoginScreen from "../../app/login";

declare const require: (id: string) => {
  readdirSync(dir: string, opts: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
  readFileSync(file: string, enc: string): string;
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
};
declare const __dirname: string;

const fs = require("fs");
const path = require("path");

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

jest.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "signedOut",
    userId: null,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  }),
  useSignInError: () => ({ error: null, clearError: jest.fn() }),
}));

jest.mock("../auth/platform", () => ({
  ...(jest.requireActual("../auth/platform") as Record<string, unknown>),
  isAppleSignInAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
}));

jest.mock("../features/local-feed/api", () => ({
  fetchPost: jest.fn(),
  emitPostReaction: jest.fn(),
  emitPostWithdrawn: jest.fn(),
}));

const NOTCH = { top: 59, bottom: 34, left: 0, right: 0 };

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("iOS SafeArea 가드 & 스큐어모픽 이모지 금지", () => {
  beforeEach(() => {
    jest.mocked(useSafeAreaInsets).mockReturnValue(NOTCH);
  });

  afterEach(() => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("PostDetail 로딩·정상 화면이 insets.top(59) 아래에서 시작한다", async () => {
    const mockedFetch = jest.mocked(feedApi.fetchPost);
    mockedFetch.mockReturnValueOnce(new Promise(() => {}));

    const loadingScreen = await render(<PostDetail postId="p1" visitLibraryId={null} />);
    const backBtn = loadingScreen.getByLabelText("돌아가기");
    expect(StyleSheet.flatten(backBtn.props.style).top).toBeGreaterThanOrEqual(NOTCH.top);

    mockedFetch.mockResolvedValueOnce({
      id: "p1",
      library: { id: 30, name: "무등도서관" },
      author: { nickname: "이웃" },
      image_kind: "color",
      image_url: null,
      image_color: "inkStrong",
      overlay_text: "test",
      body: "본문",
      book: null,
      published_at: "2026-11-18T00:00:00Z",
      reaction_count: 0,
      my_reaction: false,
      my_bookmark: false,
      is_mine: false,
    });

    const okScreen = await render(<PostDetail postId="p1" visitLibraryId={null} />);
    await waitFor(() => expect(okScreen.getByTestId("detail-scroll")).toBeTruthy());
    const scroll = okScreen.getByTestId("detail-scroll");
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBeGreaterThanOrEqual(NOTCH.top);
  });

  it("VisitHeader와 VisitHeaderFolded가 insets.top(59) 여백을 확보한다", async () => {
    const { getByTestId } = await render(
      <>
        <VisitHeader name="무등도서관" distanceM={120} today={null} onBack={jest.fn()} more={<></>} />
        <VisitHeaderFolded name="무등도서관" onBack={jest.fn()} more={<></>} />
      </>
    );
    expect(StyleSheet.flatten(getByTestId("visit-header-two").props.style).paddingTop).toBeGreaterThanOrEqual(NOTCH.top);
    expect(StyleSheet.flatten(getByTestId("visit-header-one").props.style).paddingTop).toBeGreaterThanOrEqual(NOTCH.top);
  });

  it("LoginScreen 상단 로고 영역이 insets.top(59) 이상 여백을 가진다", async () => {
    const { getByText } = await render(<LoginScreen />);
    const title = getByText("동네한권에 로그인");
    const header = title.parent;
    expect(StyleSheet.flatten(header?.props.style).paddingTop).toBeGreaterThanOrEqual(NOTCH.top);
  });

  it("ProfileHeader 오류 상태에서도 설정 버튼이 errorRow 안에 나란히 배치되고 이모지가 없다", async () => {
    const { getByTestId, getByLabelText, queryByText } = await render(
      <ProfileHeader state={{ kind: "error" }} onEdit={jest.fn()} onRetry={jest.fn()} onSettings={jest.fn()} />
    );
    const errorRow = getByTestId("profile-error");
    const settingsBtn = getByLabelText("설정");
    expect(errorRow).toContainElement(settingsBtn);
    expect(queryByText("⚙")).toBeNull();
    expect(queryByText("👤")).toBeNull();
  });

  it("앱 소스 코드에 스큐어모픽 이모지(⚙·👤·🔄·📍·📚·🏠·💬)가 없다", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      ...collectSourceFiles(path.join(root, "src")),
      ...collectSourceFiles(path.join(root, "app")),
    ];
    const forbidden = /[⚙👤🔄📍📚🏠💬]/u;
    const violations = files.filter((f) => forbidden.test(fs.readFileSync(f, "utf8")));
    expect(violations).toEqual([]);
  });
});
