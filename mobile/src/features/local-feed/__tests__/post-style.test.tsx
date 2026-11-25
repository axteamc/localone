// LOCAL-1b(C-94): 피드 카드·이미지가 저장된 글자 자리·색·표지 맞춤으로 그리고, 값 없는 옛 게시물은 옛 모양 그대로.
import { describe, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { theme } from "../../../theme";
import type { FeedPost } from "../api";
import { PostCard } from "../PostCard";
import { PostImage } from "../ComposeScreen";
import { imageFitOf, overlayColorOf, overlayPosOf } from "../postLook";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({ addListener: () => () => undefined, setOptions: () => undefined, isFocused: () => true }),
}));

function feedPost(extra: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "p1", library_id: 1, library_name: "정독도서관", image_kind: "cover", image_url: "https://img.test/c.jpg",
    image_color: null, overlay_text: "문장", book: null, published_at: "2026-11-25T10:00:00+09:00",
    my_reaction: false, my_bookmark: false, ...extra,
  };
}

describe("postLook 해석", () => {
  test("null means legacy look: photo·cover bottom, auto tone, cover contain", () => {
    expect(overlayPosOf("cover", null)).toBe("bot");
    expect(overlayPosOf("color", "top")).toBe("mid");
    expect(imageFitOf("cover", null)).toBe("contain");
    expect(imageFitOf("photo", "blur")).toBe("cover");
    expect(overlayColorOf("photo", null, null, theme.colors)).toEqual({ color: "#FFFFFF", shadow: true });
    expect(overlayColorOf("color", "vanillaCanvas", "auto", theme.colors).shadow).toBe(false);
    expect(overlayColorOf("cover", null, "dark", theme.colors)).toEqual({ color: "#1D1D1F", shadow: false });
  });
});

describe("feed card and detail image draw saved style", () => {
  test("card uses saved top·dark·blur", async () => {
    await render(<PostCard post={feedPost({ overlay_pos: "top", overlay_tone: "dark", image_fit: "blur" })}
      onPress={() => undefined} width={160} />);
    expect(screen.getByTestId("post-image-p1-fit-blur")).toBeTruthy();
    const text = screen.getByTestId("post-text-p1-top");
    expect(StyleSheet.flatten(text.props.style).color).toBe("#1D1D1F");
  });

  test("old card without style stays bottom and shows the whole cover", async () => {
    await render(<PostCard post={feedPost()} onPress={() => undefined} width={160} />);
    expect(screen.getByTestId("post-text-p1-bot")).toBeTruthy();
    expect(screen.getByTestId("post-image-p1-fit-contain")).toBeTruthy();
  });

  test("detail image (PostImage) follows saved position and fit", async () => {
    await render(<PostImage testID="d" kind="cover" imageUrl="https://img.test/c.jpg" color={null} text="문장"
      pos="mid" tone="light" fit="cover" />);
    expect(screen.getByTestId("d-text-mid")).toBeTruthy();
    expect(screen.getByTestId("d-fit-cover")).toBeTruthy();
  });
});
