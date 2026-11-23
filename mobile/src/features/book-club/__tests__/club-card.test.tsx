// CLUB-1-P3 피드 모임 카드 (contracts/book-club.md CLUB-1 P5, K1-2·K1-8·K1-11·K1-O5, 명세 결정 1)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import { feedItemKey } from "../../local-feed/api";
import { FeedItemCard } from "../../local-feed/FeedItemCard";
import { ComposeChooser, GUESTBOOK_TEXT } from "../../local-feed/GuestbookComposer";
import { feedItemHeightRatio } from "../../local-feed/LibraryFeed";
import type { ClubItem } from "../api";
import { CARD_TEXT, ClubCard, formatClubWhen } from "../ClubCard";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function item(extra: Partial<ClubItem> = {}): ClubItem {
  return {
    id: "club-1",
    library_id: 101,
    name: "소년이 온다 같이 읽기",
    starts_at: "2026-11-28T14:00:00+09:00",
    place: "2층 세미나실",
    status: "open",
    participant_count: 3,
    capacity: 6,
    published_at: "2026-11-20T10:00:00+09:00",
    ...extra,
  };
}

const fontSize = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style)?.fontSize as number;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("피드 모임 카드", () => {
  test("club card appears in library feed", async () => {
    await render(<FeedItemCard item={{ kind: "club", club: item() }} width={170} onOpenPost={jest.fn()} />);
    expect(screen.getByText(CARD_TEXT.go)).toBeTruthy();
    expect(screen.getByText(CARD_TEXT.tag)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("club-card-club-1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/clubs/[clubId]", params: { clubId: "club-1" } });
  });

  test("club card shows big date first then time place name count", async () => {
    await render(<ClubCard club={item()} width={170} onOpen={jest.fn()} />);
    const tree = JSON.stringify(screen.toJSON());
    const body = tree.slice(tree.indexOf(`"${CARD_TEXT.tag}"`)); // 접근성 이름(모임 + 이름) 뒤 화면 글자만
    const order = ["11.28 토", "오후 2:00 · 2층 세미나실", "소년이 온다 같이 읽기", "3/6명 참가", CARD_TEXT.go].map((t) =>
      body.indexOf(t)
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const day = fontSize("11.28 토");
    for (const other of ["오후 2:00 · 2층 세미나실", "소년이 온다 같이 읽기", "3/6명 참가", CARD_TEXT.go]) {
      expect(day).toBeGreaterThan(fontSize(other)); // 날짜가 제일 큰 글자(결정 1)
    }
    expect(tree.includes("한강")).toBe(false); // 책 이름은 카드에 없다
  });

  test("undecided and closed cards show labels", async () => {
    const view = await render(<ClubCard club={item({ starts_at: null })} width={170} onOpen={jest.fn()} />);
    expect(screen.getByText(CARD_TEXT.undecidedDay)).toBeTruthy();
    expect(screen.getByText(`${CARD_TEXT.undecidedNote} · 2층 세미나실`)).toBeTruthy();
    await view.rerender(<ClubCard club={item({ place: null, capacity: null })} width={170} onOpen={jest.fn()} />);
    expect(screen.getByText("오후 2:00 · 장소 미정")).toBeTruthy();
    expect(screen.getByText("3명 참가")).toBeTruthy();
    for (const [status, label] of [["closed", "모집 마감"], ["canceled", "취소됨"], ["ended", "끝난 모임"]] as const) {
      await view.rerender(<ClubCard club={item({ status })} width={170} onOpen={jest.fn()} />);
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  test("unknown kinds still render nothing", async () => {
    const view = await render(<FeedItemCard item={{ kind: "stamp", stamp: {} }} width={170} onOpenPost={jest.fn()} />);
    expect(view.toJSON()).toBeNull();
  });

  test("formatClubWhen reads seoul time", () => {
    expect(formatClubWhen("2026-11-28T05:00:00Z", "2026-11-28T07:00:00Z")).toEqual({ day: "11.28 토", time: "오후 2:00 ~ 4:00" });
    expect(formatClubWhen("2026-11-28T10:00:00+09:00", "2026-11-28T13:30:00+09:00")).toEqual({
      day: "11.28 토",
      time: "오전 10:00 ~ 오후 1:30",
    });
    expect(formatClubWhen(null, null)).toBeNull();
  });

  test("club feed key, height ratio, and chooser onClub work together", async () => {
    const entry = { kind: "club" as const, club: item() };
    expect(feedItemKey(entry)).toBe("club:club-1");
    expect(feedItemHeightRatio(entry)).toBe(1.15);
    const onClub = jest.fn();
    await render(<ComposeChooser visible onPost={jest.fn()} onGuestbook={jest.fn()} onClub={onClub} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText(GUESTBOOK_TEXT.chooseClub));
    expect(onClub).toHaveBeenCalledTimes(1);
  });
});
