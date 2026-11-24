import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { reportTarget } from "../../local-feed/api";
import { REPORT_TEXT } from "../../local-feed/ReportSheet";
import { fetchClub, fetchClubComments, fetchMyRestrictions, requestCommentModeration, type Club } from "../api";
import { CLUB_TEXT, ClubScreen } from "../ClubScreen";

const mockNav = { addListener: () => () => undefined };
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter, useNavigation: () => mockNav, useFocusEffect: () => undefined,
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "new-request" }));
jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(), registerSignOutCleanup: jest.fn(() => () => undefined),
}));
jest.mock("../../local-feed/api", () => ({
  ...jest.requireActual<object>("../../local-feed/api"),
  reportTarget: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchClub: jest.fn(), fetchClubComments: jest.fn(), fetchMyRestrictions: jest.fn(), requestCommentModeration: jest.fn(),
}));

const report = jest.mocked(reportTarget);
const moderate = jest.mocked(requestCommentModeration);

function club(host: boolean, id: string): Club {
  return {
    id, library: { id: 101, name: "정독도서관" }, name: "독서 모임",
    intro: "같이 읽어요", book: null, place: "세미나실", starts_at: null, ends_at: null,
    capacity: 8, status: "open", cancel_reason: null, host_nickname: "모임장", is_host: host,
    participant_count: 1, participants: [], my_participation: "none", previous_club_id: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({ status: "signedIn", userId: "me" } as ReturnType<typeof useAuth>);
  jest.mocked(fetchMyRestrictions).mockResolvedValue([]);
  jest.mocked(fetchClub).mockImplementation(async (id) => club(id === "my-club", id));
  jest.mocked(fetchClubComments).mockResolvedValue({
    items: [
      { id: "own-comment", body: "내 댓글", author_nickname: "나", mine: true, created_at: "2026-11-24T12:00:00+09:00" },
      { id: "other-comment", body: "다른 사람 댓글", author_nickname: "이웃", mine: false, created_at: "2026-11-24T12:00:00+09:00" },
    ], next_cursor: null,
  });
  report.mockResolvedValue(undefined);
  moderate.mockResolvedValue({ alreadyRequested: false });
});

async function submitSpam() {
  await fireEvent.press(screen.getByText("스팸 또는 광고"));
  await fireEvent.press(screen.getByText("신고 보내기"));
  expect(await screen.findByText(REPORT_TEXT.done)).toBeTruthy();
}

test("non-host reports a club and cannot report their own comment", async () => {
  await render(<ClubScreen clubId="other-club" />);
  await fireEvent.press(await screen.findByLabelText("모임 신고하기"));
  await submitSpam();
  expect(report).toHaveBeenCalledWith({ kind: "club", id: "other-club" }, "spam", null);
  expect(screen.getByText(REPORT_TEXT.collapsed)).toBeTruthy();
  const own = within(screen.getByTestId("club-comment-own-comment"));
  expect(own.queryByLabelText("댓글 신고하기")).toBeNull();
  expect(own.getByLabelText("댓글 메뉴")).toBeTruthy();
  const other = within(screen.getByTestId("club-comment-other-comment"));
  expect(other.queryByLabelText("댓글 메뉴")).toBeNull();
  expect(other.getByLabelText("댓글 신고하기")).toBeTruthy();
  expect(moderate).not.toHaveBeenCalled();
});

test("host comment report is distinct from the existing #66 moderation request", async () => {
  await render(<ClubScreen clubId="my-club" />);
  const other = within(await screen.findByTestId("club-comment-other-comment"));
  expect(screen.queryByLabelText("모임 신고하기")).toBeNull();
  await fireEvent.press(other.getByLabelText("댓글 메뉴"));
  await fireEvent.changeText(screen.getByLabelText(CLUB_TEXT.moderationPlaceholder), "운영자에게 검토 요청");
  await fireEvent.press(screen.getByText(CLUB_TEXT.moderationSend));
  expect(moderate).toHaveBeenCalledWith("other-comment", "운영자에게 검토 요청");
  expect(report).not.toHaveBeenCalled();
  expect(screen.getByText("다른 사람 댓글")).toBeTruthy();

  await fireEvent.press(other.getByLabelText("댓글 신고하기"));
  await submitSpam();
  expect(report).toHaveBeenCalledWith({ kind: "club_comment", id: "other-comment" }, "spam", null);
  expect(moderate).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("다른 사람 댓글")).toBeNull();
  expect(screen.getByText("내 댓글")).toBeTruthy();
});
