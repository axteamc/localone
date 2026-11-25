// 게시물 이미지 꾸미기 해석(contracts/local-feed.md LOCAL-1b P1b-2~P1b-6, C-94).
// 글쓰기 미리보기·올린 뒤·상세(`PostImage`)와 피드 카드(`PostCard`)가 같은 규칙으로 그린다.
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { onFill, resolvePostColor, type ThemeColors } from "../../theme";
import { ON_FILL_LIGHT, TEXT_COLOR } from "../../theme/tokens";
import type { ImageFit, ImageKind, OverlayPos, OverlayTone } from "./api";

export type { ImageFit, OverlayPos, OverlayTone } from "./api";

/** 글자 자리: 단색은 늘 가운데, 값 없는 옛 사진·표지는 아래(P1b-3) */
export function overlayPosOf(kind: ImageKind, pos: OverlayPos | null | undefined): OverlayPos {
  if (kind === "color") return "mid";
  return pos ?? "bot";
}

/** 글자 색(P1b-4): light = 흰 글자 + 그림자, dark = 짙은 글자, auto = 단색은 배경 밝기, 사진·표지는 light */
export function overlayColorOf(
  kind: ImageKind,
  colorToken: string | null,
  tone: OverlayTone | null | undefined,
  C: ThemeColors
): { color: string; shadow: boolean } {
  const t = tone ?? "auto";
  if (t === "dark") return { color: TEXT_COLOR, shadow: false };
  if (t === "light") return { color: ON_FILL_LIGHT, shadow: true };
  if (kind === "color") {
    return { color: colorToken ? onFill(resolvePostColor(colorToken, C)) : ON_FILL_LIGHT, shadow: false };
  }
  return { color: ON_FILL_LIGHT, shadow: true };
}

/** 표지 맞춤(P1b-5): 사진은 늘 꽉 채움, 표지는 값 없으면 여백(contain) */
export function imageFitOf(kind: ImageKind, fit: ImageFit | null | undefined): ImageFit {
  if (kind !== "cover") return "cover";
  return fit ?? "contain";
}

export const BLUR_RADIUS = 18;

/** 이미지 칸을 채우는 그림(부모가 크기·곡률·바탕을 정한다) */
export function PostImageFill({
  uri,
  kind,
  fit,
  testID,
}: {
  uri: string;
  kind: ImageKind;
  fit: ImageFit | null | undefined;
  testID?: string;
}) {
  const mode = imageFitOf(kind, fit);
  if (mode === "blur") {
    return (
      <View style={StyleSheet.absoluteFill} testID={testID ? `${testID}-fit-blur` : undefined}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={BLUR_RADIUS} />
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      </View>
    );
  }
  return (
    <Image
      testID={testID ? `${testID}-fit-${mode}` : undefined}
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      resizeMode={mode}
    />
  );
}
