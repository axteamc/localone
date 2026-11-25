// 2026-11-25 C-92 화면 부품: 모임 날짜·시각 고르기(book-club K1-O2a), 모임 카드 통합(K1-O5a),
// 공통 머리(core K27), 웹 하단 창 칼럼(core APP-0 C4 "웹 하단 창 폭").
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import React, { useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { theme } from "../../../theme";
import { ScreenHeader } from "../../../theme/ScreenHeader";
import { APP_MAX_WIDTH, ModalFrame } from "../../../theme/WebFrame";
import type { ClubItem } from "../api";
import { ClubCard } from "../ClubCard";
import { HOURS, MINUTES, WhenFields, kstToday, monthCells, parseClock, parseDay } from "../WhenFields";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function Harness({ initial = { date: "", start: "", end: "" } }: { initial?: { date: string; start: string; end: string } }) {
  const [v, setV] = useState(initial);
  return (
    <WhenFields
      date={v.date}
      start={v.start}
      end={v.end}
      onDate={(date) => setV((p) => ({ ...p, date }))}
      onStart={(start) => setV((p) => ({ ...p, start }))}
      onEnd={(end) => setV((p) => ({ ...p, end }))}
      placeholders={{ date: "2026-11-28", start: "14:00", end: "16:00 (선택)" }}
      testIDPrefix="t"
    />
  );
}

const value = (id: string) => screen.getByTestId(id).props.value as string;

describe("K1-O2a 날짜·시각 고르기", () => {
  test("helpers parse days and clocks and lay out months", () => {
    expect(parseDay("2026-11-28")).toEqual([2026, 11, 28]);
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("26-11-28")).toBeNull();
    expect(parseClock("14:37")).toEqual([14, 7]); // 가까운 5분 아래
    expect(parseClock("24:00")).toBeNull();
    expect(HOURS).toHaveLength(24);
    expect(MINUTES).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
    const nov = monthCells(2026, 11); // 2026-11-01은 일요일
    expect(nov[0]).toBe(1);
    expect(nov).toHaveLength(30);
    expect(monthCells(2026, 12).slice(0, 3)).toEqual([null, null, 1]); // 12-01은 화요일
    expect(kstToday(Date.parse("2026-11-24T15:30:00Z"))).toEqual([2026, 11, 25]); // 서울 날짜
  });

  test("typing still works and icons open one popover at a time", async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId("t-date"), "2026-11-30");
    expect(value("t-date")).toBe("2026-11-30");
    expect(screen.queryByTestId("t-calendar")).toBeNull();
    await fireEvent.press(screen.getByLabelText("달력 열기"));
    expect(screen.getByTestId("t-calendar")).toBeTruthy();
    expect(screen.getByTestId("t-calendar-month").props.children).toBe("2026년 11월"); // 칸 값의 달
    await fireEvent.press(screen.getByLabelText("시작 시각 고르기"));
    expect(screen.queryByTestId("t-calendar")).toBeNull();
    expect(screen.getByTestId("t-wheel")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("시작 시각 고르기")); // 같은 아이콘 → 닫힘
    expect(screen.queryByTestId("t-wheel")).toBeNull();
  });

  test("calendar pick writes YYYY-MM-DD and closes; month arrows move", async () => {
    await render(<Harness initial={{ date: "2026-12-31", start: "", end: "" }} />);
    await fireEvent.press(screen.getByLabelText("달력 열기"));
    await fireEvent.press(screen.getByLabelText("다음 달"));
    expect(screen.getByTestId("t-calendar-month").props.children).toBe("2027년 1월");
    await fireEvent.press(screen.getByTestId("t-calendar-day-5"));
    expect(value("t-date")).toBe("2027-01-05");
    expect(screen.queryByTestId("t-calendar")).toBeNull();
  });

  test("wheel starts at current value, taps pick hour and minute, ok writes HH:MM", async () => {
    await render(<Harness initial={{ date: "", start: "09:42", end: "" }} />);
    await fireEvent.press(screen.getByLabelText("시작 시각 고르기"));
    expect(screen.getByTestId("t-wheel-h-09").props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId("t-wheel-m-40").props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId("t-wheel-h-19"));
    await fireEvent.press(screen.getByTestId("t-wheel-m-30"));
    await fireEvent.press(screen.getByTestId("t-wheel-ok"));
    expect(value("t-start")).toBe("19:30");
    expect(value("t-end")).toBe("");
    // 스크롤로 멈춘 자리도 값이 된다(한 줄 28)
    await fireEvent.press(screen.getByLabelText("끝나는 시각 고르기"));
    await fireEvent(screen.getByTestId("t-wheel-h"), "momentumScrollEnd", { nativeEvent: { contentOffset: { y: 28 * 21 } } });
    await fireEvent(screen.getByTestId("t-wheel-m"), "momentumScrollEnd", { nativeEvent: { contentOffset: { y: 28 * 3 } } });
    await fireEvent.press(screen.getByTestId("t-wheel-ok"));
    expect(value("t-end")).toBe("21:15");
  });
});

describe("K1-O5a 모임 카드 = 정보 카드", () => {
  const club: ClubItem = {
    id: "c1", library_id: 101, name: "톨스토이 같이 읽기", starts_at: "2026-11-27T14:00:00+09:00", place: "2층 세미나실",
    status: "open", participant_count: 0, capacity: null, published_at: "2026-11-20T10:00:00+09:00",
  };

  test("no arch or orange fill, dot tag like guestbook", async () => {
    await render(<ClubCard club={club} width={160} onOpen={jest.fn()} />);
    const card = StyleSheet.flatten(screen.getByTestId("club-card-c1").props.style);
    expect(card).toEqual(expect.objectContaining({
      backgroundColor: theme.colors.paper, borderRadius: theme.radii.infoCard, borderWidth: 1,
      borderColor: theme.colors.seamHairline,
    }));
    expect(card.backgroundColor).not.toBe(theme.colors.fill2);
    expect(card.borderTopLeftRadius).toBeUndefined();
    const tag = screen.getByTestId("club-card-tag");
    expect(StyleSheet.flatten(tag.props.style)).toEqual(expect.objectContaining({ opacity: 0.7, flexDirection: "row" }));
    expect(within(tag).getByText("모임")).toBeTruthy();
    expect(StyleSheet.flatten(tag.props.style).backgroundColor).toBeUndefined(); // 알약 바탕 없음
  });
});

describe("K27 공통 머리", () => {
  test("drawn chevron, English label, Korean accessible title, right slot", async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader label="CLUB" title="모임" onBack={onBack} right={<Text>⋯</Text>} testID="h" />);
    expect(screen.getByTestId("back-chevron")).toBeTruthy();
    expect(screen.queryByText("‹")).toBeNull();
    expect(screen.getByText("CLUB")).toBeTruthy();
    expect(screen.getByLabelText("모임").props.accessibilityRole).toBe("header");
    expect(StyleSheet.flatten(screen.getByTestId("h").props.style)).toEqual(expect.objectContaining({ alignItems: "center" }));
    await fireEvent.press(screen.getByLabelText("뒤로"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText("⋯")).toBeTruthy();
  });

  test("close kind draws an X", async () => {
    await render(<ScreenHeader label="NEW CLUB" onBack={jest.fn()} backKind="close" />);
    expect(screen.getByTestId("close-mark")).toBeTruthy();
    expect(screen.getByLabelText("닫기")).toBeTruthy();
  });
});

describe("APP-0 C4 웹 하단 창 칼럼", () => {
  const original = Platform.OS;
  const originalMatch = (globalThis as { matchMedia?: unknown }).matchMedia;
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    (globalThis as { matchMedia?: unknown }).matchMedia = originalMatch;
  });

  test("native renders children as is", async () => {
    await render(<ModalFrame><Text>창</Text></ModalFrame>);
    expect(screen.getByText("창")).toBeTruthy();
    expect(screen.queryByTestId("modal-column")).toBeNull();
  });

  test("wide desktop web centers a 480 column", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: true });
    (window as { matchMedia?: unknown }).matchMedia = () => ({ matches: true });
    await render(<ModalFrame><Text>창</Text></ModalFrame>);
    const outer = screen.getByTestId("modal-column");
    const column = StyleSheet.flatten(outer.props.children.props.style);
    expect(column.width).toBe(APP_MAX_WIDTH);
  });
});
