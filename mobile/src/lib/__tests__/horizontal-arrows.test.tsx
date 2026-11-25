// 유리 ‹ › (2026-11-25 P2, 시안 #el-arrows 후보 A): 모바일(jest 기본 ios)에서도 보이고, 끝에서는 그쪽 버튼을 숨긴다
import { describe, expect, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassArrows, useHorizontalScroll } from "../HorizontalArrows";

function Row() {
  const scroll = useHorizontalScroll(true);
  return (
    <View>
      <ScrollView {...scroll.scrollProps} horizontal testID="row">
        <Text>책</Text>
      </ScrollView>
      <GlassArrows label="줄" {...scroll.edges} centerY={66} onMove={scroll.onMove} />
    </View>
  );
}

const scrollTo = (x: number) => ({ nativeEvent: { contentOffset: { x, y: 0 } } });

describe("GlassArrows", () => {
  test("shows on native, hides the side that cannot move, and moves by 85% of the width", async () => {
    expect(Platform.OS).not.toBe("web");
    await render(<Row />);
    const row = screen.getByTestId("row");
    expect(screen.queryByLabelText("줄 다음")).toBeNull(); // 크기를 모르면 아무것도 안 보임
    await fireEvent(row, "layout", { nativeEvent: { layout: { width: 300, height: 140, x: 0, y: 0 } } });
    await fireEvent(row, "contentSizeChange", 900, 140);
    expect(screen.getByLabelText("줄 다음")).toBeTruthy();
    expect(screen.queryByLabelText("줄 이전")).toBeNull(); // 처음에는 왼쪽 없음
    expect(StyleSheet.flatten(screen.getByLabelText("줄 다음").props.style)).toEqual(expect.objectContaining({ top: 66 - 22, right: 2 }));

    await fireEvent(row, "scroll", scrollTo(600));
    expect(screen.getByLabelText("줄 이전")).toBeTruthy();
    expect(screen.queryByLabelText("줄 다음")).toBeNull(); // 끝에 닿음

    await fireEvent.press(screen.getByLabelText("줄 이전")); // 600 - 255 = 345 → 양쪽 다 보임
    expect(screen.getByLabelText("줄 이전")).toBeTruthy();
    expect(screen.getByLabelText("줄 다음")).toBeTruthy();
  });
});
