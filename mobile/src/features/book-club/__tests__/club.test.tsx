// CLUB-1-P2 모임 화면·만들기 (contracts/book-club.md CLUB-1 P5, 명세 결정 2·3·예외 #1~#6, K1-O4·K1-O7·K1-O8)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import * as api from "../api";
import type { Club, ClubComment } from "../api";
import { ClubEditor, EDITOR_TEXT, toKstIso } from "../ClubEditor";
import { CLUB_TEXT, ClubScreen } from "../ClubScreen";

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockFocus: (() => void) | null = null;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  // 화면에 다시 돌아올 때를 시험이 직접 부른다(첫 포커스도 한 번 부른다)
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(() => {
      mockFocus = cb;
      cb();
    }, [cb]);
  },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-2222-4333-8444-555555555555" }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../../lib/publicApi", () => ({
  ...jest.requireActual<object>("../../../lib/publicApi"),
  searchBooks: jest.fn(),
}));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  createClub: jest.fn(),
  fetchClub: jest.fn(),
  updateClub: jest.fn(),
  closeClub: jest.fn(),
  cancelClub: jest.fn(),
  joinClub: jest.fn(),
  leaveClub: jest.fn(),
  fetchClubComments: jest.fn(),
  postClubComment: jest.fn(),
  deleteClubComment: jest.fn(),
}));

const m = {
  createClub: jest.mocked(api.createClub),
  fetchClub: jest.mocked(api.fetchClub),
  cancelClub: jest.mocked(api.cancelClub),
  joinClub: jest.mocked(api.joinClub),
  leaveClub: jest.mocked(api.leaveClub),
  fetchClubComments: jest.mocked(api.fetchClubComments),
  postClubComment: jest.mocked(api.postClubComment),
  deleteClubComment: jest.mocked(api.deleteClubComment),
};
const mockedUseAuth = jest.mocked(useAuth);
const REQ_ID = "11111111-2222-4333-8444-555555555555";
const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

function club(extra: Partial<Club> = {}): Club {
  return {
    id: "club-1",
    library: { id: 101, name: "정독도서관" },
    name: "소년이 온다 같이 읽기",
    intro: null,
    book: null,
    place: "2층 세미나실",
    starts_at: FUTURE,
    ends_at: null,
    capacity: 6,
    status: "open",
    cancel_reason: null,
    host_nickname: "책읽는곰",
    is_host: false,
    participant_count: 2,
    participants: [
      { nickname: "해바라기", is_me: false },
      { nickname: "민트", is_me: false },
    ],
    my_participation: "none",
    previous_club_id: null,
    ...extra,
  };
}

function comment(extra: Partial<ClubComment> = {}): ClubComment {
  return { id: "c1", body: "2층 세미나실 맞죠?", author_nickname: "해바라기", created_at: FUTURE, mine: false, ...extra };
}

function signed(status: "signedIn" | "signedOut", userId: string | null = status === "signedIn" ? "user-a" : null) {
  mockedUseAuth.mockReturnValue({ status, userId } as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  jest.clearAllMocks();
  signed("signedIn");
  m.fetchClub.mockResolvedValue(club());
  m.fetchClubComments.mockResolvedValue({ items: [comment()], next_cursor: null });
});

async function openClub() {
  await render(<ClubScreen clubId="club-1" />);
  await screen.findByTestId("club-info");
}

describe("모임 화면", () => {
  test("club screen order is info then main button then participants then comments", async () => {
    await openClub();
    const tree = JSON.stringify(screen.toJSON());
    const order = ["소년이 온다 같이 읽기", CLUB_TEXT.join, CLUB_TEXT.participants(2), CLUB_TEXT.comments(1)].map((t) =>
      tree.indexOf(t)
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("join button sends once", async () => {
    let resolve!: (c: Club) => void;
    m.joinClub.mockReturnValue(new Promise<Club>((r) => (resolve = r)));
    await openClub();
    await fireEvent.press(screen.getByText(CLUB_TEXT.join));
    await fireEvent.press(screen.getByText(CLUB_TEXT.joining));
    await fireEvent.press(screen.getByText(CLUB_TEXT.joining));
    expect(m.joinClub).toHaveBeenCalledTimes(1);
    await act(async () => resolve(club({ my_participation: "joined", participant_count: 3 })));
    expect(screen.getByText(CLUB_TEXT.leave)).toBeTruthy();
  });

  test("join failure shows retry and keeps screen", async () => {
    m.joinClub.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    await openClub();
    await fireEvent.press(screen.getByText(CLUB_TEXT.join));
    expect(await screen.findByText(CLUB_TEXT.joinFailed)).toBeTruthy();
    expect(screen.getByText("소년이 온다 같이 읽기")).toBeTruthy();
    expect(screen.getAllByText("해바라기").length).toBeGreaterThan(0);
    expect(screen.getByText("민트")).toBeTruthy();
    expect(screen.queryByText(CLUB_TEXT.me)).toBeNull();
    m.joinClub.mockResolvedValueOnce(club({ my_participation: "joined", participant_count: 3 }));
    await fireEvent.press(screen.getByText(CLUB_TEXT.retry));
    await waitFor(() => expect(m.joinClub).toHaveBeenCalledTimes(2));
  });

  test("undecided schedule shows undecided label", async () => {
    m.fetchClub.mockResolvedValue(club({ starts_at: null, place: null }));
    await openClub();
    expect(screen.getByText(`${CLUB_TEXT.undecidedDay} · ${CLUB_TEXT.undecidedNote}`)).toBeTruthy();
    expect(screen.getByText(CLUB_TEXT.undecidedPlace)).toBeTruthy();
  });

  test("empty participants and comments show guidance", async () => {
    m.fetchClub.mockResolvedValue(club({ participants: [], participant_count: 0 }));
    m.fetchClubComments.mockResolvedValue({ items: [], next_cursor: null });
    await openClub();
    expect(screen.getByText(CLUB_TEXT.emptyParticipants)).toBeTruthy();
    expect(screen.getByText(CLUB_TEXT.emptyComments)).toBeTruthy();
  });

  test("signed out sees login prompt instead of joining", async () => {
    signed("signedOut");
    await openClub();
    await fireEvent.press(screen.getByText(CLUB_TEXT.loginToJoin));
    expect(screen.getByText(CLUB_TEXT.loginBody)).toBeTruthy();
    await fireEvent.press(screen.getByText(CLUB_TEXT.close));
    await fireEvent.press(screen.getByText(CLUB_TEXT.loginToComment));
    expect(screen.getByText(CLUB_TEXT.loginTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(CLUB_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login", params: { returnTo: "/clubs/club-1" } });
    expect(m.joinClub).not.toHaveBeenCalled();
    expect(m.postClubComment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("club-host-menu")).toBeNull();
  });

  test("full closed canceled states disable join with labels", async () => {
    m.fetchClub.mockResolvedValueOnce(club({ capacity: 2 }));
    const { unmount } = await render(<ClubScreen clubId="club-1" />);
    await screen.findByText(CLUB_TEXT.full);
    expect(screen.getByText(CLUB_TEXT.fullNote)).toBeTruthy();
    await fireEvent.press(screen.getByText(CLUB_TEXT.full));
    await unmount();

    m.fetchClub.mockResolvedValueOnce(club({ status: "closed" }));
    const second = await render(<ClubScreen clubId="club-1" />);
    await screen.findByText(CLUB_TEXT.closed);
    await second.unmount();

    m.fetchClub.mockResolvedValueOnce(club({ status: "canceled", cancel_reason: "사정이 생겼어요" }));
    await render(<ClubScreen clubId="club-1" />);
    await screen.findByText(CLUB_TEXT.canceled);
    expect(within(screen.getByTestId("club-cancel-reason")).getByText("사정이 생겼어요")).toBeTruthy();
    await fireEvent.press(screen.getByText(CLUB_TEXT.canceled));
    expect(m.joinClub).not.toHaveBeenCalled();
  });

  test("leave and cancel ask before acting", async () => {
    m.fetchClub.mockResolvedValueOnce(club({ my_participation: "joined" }));
    const first = await render(<ClubScreen clubId="club-1" />);
    await fireEvent.press(await screen.findByText(CLUB_TEXT.leave));
    expect(screen.getByText(CLUB_TEXT.leaveConfirm)).toBeTruthy();
    expect(m.leaveClub).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(CLUB_TEXT.leaveKeep));
    expect(m.leaveClub).not.toHaveBeenCalled();
    await first.unmount();

    m.fetchClub.mockResolvedValue(club({ is_host: true }));
    await openClub();

    await fireEvent.press(screen.getByTestId("club-host-menu"));
    await fireEvent.press(screen.getByText(CLUB_TEXT.menuCancel));
    const dialog = screen.getByTestId("club-dialog-cancel");
    await fireEvent.press(within(dialog).getByText(CLUB_TEXT.cancelDo)); // 이유가 비어 눌리지 않음
    expect(m.cancelClub).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId("club-cancel-reason-input"), "사정이 생겼어요");
    m.cancelClub.mockResolvedValue(club({ status: "canceled", cancel_reason: "사정이 생겼어요", is_host: true }));
    await fireEvent.press(within(screen.getByTestId("club-dialog-cancel")).getByText(CLUB_TEXT.cancelDo));
    await waitFor(() => expect(m.cancelClub).toHaveBeenCalledWith("club-1", "사정이 생겼어요"));
  });

  test("started club keeps participant and shows no-leave label", async () => {
    m.fetchClub.mockResolvedValue(
      club({ my_participation: "joined", starts_at: new Date(Date.now() - 60000).toISOString(), status: "closed" })
    );
    await openClub();
    await fireEvent.press(screen.getByText(CLUB_TEXT.startedNoLeave));
    expect(m.leaveClub).not.toHaveBeenCalled();
  });

  test("only my comments have delete menu", async () => {
    m.fetchClubComments.mockResolvedValue({
      items: [comment(), comment({ id: "c2", body: "네, 엘리베이터 옆이에요", mine: true, author_nickname: "나의닉" })],
      next_cursor: null,
    });
    m.deleteClubComment.mockResolvedValue(undefined);
    await openClub();
    expect(screen.queryByTestId("club-comment-menu-c1")).toBeNull();
    await fireEvent.press(screen.getByTestId("club-comment-menu-c2"));
    expect(m.deleteClubComment).not.toHaveBeenCalled();
    await fireEvent.press(within(screen.getByTestId("club-dialog-deleteComment")).getByText(CLUB_TEXT.commentDelete));
    await waitFor(() => expect(screen.queryByText("네, 엘리베이터 옆이에요")).toBeNull());
    expect(m.deleteClubComment).toHaveBeenCalledTimes(1);
    expect(m.deleteClubComment).toHaveBeenCalledWith("c2");
  });

  test("comment failure keeps text", async () => {
    m.postClubComment.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    await openClub();
    await fireEvent.changeText(screen.getByTestId("club-comment-input"), "토요일 어때요?");
    await fireEvent.press(screen.getByText(CLUB_TEXT.commentSend));
    expect(await screen.findByText(CLUB_TEXT.commentFailed)).toBeTruthy();
    expect(screen.getByTestId("club-comment-input").props.value).toBe("토요일 어때요?");
  });

  test("restricted join shows label with until", async () => {
    m.joinClub.mockRejectedValueOnce(new api.ApiCallError(403, "PARTICIPATION_RESTRICTED", "x", "2026-11-30T18:00:00+09:00"));
    await openClub();
    await fireEvent.press(screen.getByText(CLUB_TEXT.join));
    const label = `${CLUB_TEXT.restricted} (11월 30일 18:00까지)`;
    await waitFor(() => expect(screen.getAllByText(label)).toHaveLength(2)); // 버튼 자리 + 댓글 칸
    expect(screen.queryByTestId("club-comment-input")).toBeNull();
  });

  test("late club response is discarded", async () => {
    let resolveA!: (c: Club) => void;
    m.fetchClub.mockImplementation((id: string) =>
      id === "club-a" ? new Promise<Club>((r) => (resolveA = r)) : Promise.resolve(club({ id: "club-b", name: "모임 B" }))
    );
    const view = await render(<ClubScreen clubId="club-a" />);
    await view.rerender(<ClubScreen clubId="club-b" />);
    expect(await screen.findByText("모임 B")).toBeTruthy();
    await act(async () => resolveA(club({ id: "club-a", name: "모임 A" })));
    expect(screen.queryByText("모임 A")).toBeNull();
    expect(screen.getByText("모임 B")).toBeTruthy();
  });

  test("host sees own label and cannot take a seat", async () => {
    m.fetchClub.mockResolvedValue(club({ is_host: true }));
    await openClub();
    await fireEvent.press(screen.getByText(CLUB_TEXT.hostOwn));
    expect(m.joinClub).not.toHaveBeenCalled();
    expect(screen.queryByText(CLUB_TEXT.join)).toBeNull();
  });

  test("account switch refetches and drops previous menus", async () => {
    m.fetchClub.mockResolvedValueOnce(club({ is_host: true }));
    const view = await render(<ClubScreen clubId="club-1" />);
    await screen.findByTestId("club-host-menu");
    await fireEvent.press(screen.getByTestId("club-host-menu"));
    expect(screen.getByTestId("club-dialog-menu")).toBeTruthy();
    signed("signedIn", "user-b");
    m.fetchClub.mockResolvedValueOnce(club({ is_host: false }));
    await view.rerender(<ClubScreen clubId="club-1" />);
    await waitFor(() => expect(screen.queryByTestId("club-host-menu")).toBeNull());
    expect(screen.queryByTestId("club-dialog-menu")).toBeNull();
    expect(m.fetchClub).toHaveBeenCalledTimes(2);
    expect(screen.getByText(CLUB_TEXT.join)).toBeTruthy();
  });

  test("returning from edit reloads new time and place", async () => {
    await openClub();
    m.fetchClub.mockResolvedValueOnce(club({ place: "3층 열람실" }));
    await act(async () => mockFocus?.());
    expect(await screen.findByText("3층 열람실")).toBeTruthy();
  });

  test("more comments loads a page once and late page after reload is dropped", async () => {
    m.fetchClubComments.mockResolvedValueOnce({ items: [comment()], next_cursor: "cur-1" });
    await openClub();
    let resolveMore!: (p: api.ClubCommentPage) => void;
    m.fetchClubComments.mockReturnValueOnce(new Promise((r) => (resolveMore = r)));
    await fireEvent.press(screen.getByText(CLUB_TEXT.moreComments));
    await fireEvent.press(screen.getByText(CLUB_TEXT.moreComments));
    expect(m.fetchClubComments.mock.calls.filter((c) => c[1] === "cur-1")).toHaveLength(1);
    await act(async () => resolveMore({ items: [comment(), comment({ id: "c2", body: "둘째 댓글" })], next_cursor: null }));
    expect(screen.getAllByText("2층 세미나실 맞죠?")).toHaveLength(1); // 같은 댓글은 한 번만
    expect(screen.getByText("둘째 댓글")).toBeTruthy();

    // 더 보기 중 다시 읽으면 늦게 온 앞 페이지는 버린다
    m.fetchClubComments.mockResolvedValueOnce({ items: [comment()], next_cursor: "cur-2" });
    await act(async () => mockFocus?.());
    await screen.findByText(CLUB_TEXT.moreComments);
    let resolveLate!: (p: api.ClubCommentPage) => void;
    m.fetchClubComments.mockReturnValueOnce(new Promise((r) => (resolveLate = r)));
    await fireEvent.press(screen.getByText(CLUB_TEXT.moreComments));
    m.fetchClubComments.mockResolvedValueOnce({ items: [comment({ id: "c9", body: "새 목록" })], next_cursor: null });
    await act(async () => mockFocus?.());
    await screen.findByText("새 목록");
    await act(async () => resolveLate({ items: [comment({ id: "c8", body: "늦은 페이지" })], next_cursor: null }));
    expect(screen.queryByText("늦은 페이지")).toBeNull();
  });

  test("missing club shows not found", async () => {
    m.fetchClub.mockRejectedValue(new api.ApiCallError(404, "NOT_FOUND", "x", "club_id"));
    await render(<ClubScreen clubId="club-1" />);
    expect(await screen.findByText(CLUB_TEXT.notFound)).toBeTruthy();
  });
});

describe("모임 만들기", () => {
  test("editor shows name and schedule first and expands rest on demand", async () => {
    await render(<ClubEditor libraryId={101} />);
    expect(screen.getByText(EDITOR_TEXT.nameLabel)).toBeTruthy();
    expect(screen.getByText(EDITOR_TEXT.whenLabel)).toBeTruthy();
    expect(screen.queryByText(EDITOR_TEXT.placeLabel)).toBeNull();
    expect(screen.getByTestId("club-editor-submit").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByText(EDITOR_TEXT.more));
    const tree = JSON.stringify(screen.toJSON());
    const order = [EDITOR_TEXT.placeLabel, EDITOR_TEXT.bookLabel, EDITOR_TEXT.capacityLabel, EDITOR_TEXT.introLabel].map((t) =>
      tree.indexOf(t)
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.getAllByText(/필수/)).toHaveLength(1);
    expect(screen.getByText(EDITOR_TEXT.nameLabel)).toBeTruthy();
  });

  test("undecided switch sends null schedule", async () => {
    m.createClub.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", "")).mockResolvedValueOnce(club());
    await render(<ClubEditor libraryId={101} />);
    await fireEvent.changeText(screen.getByTestId("club-editor-name"), "소년이 온다 같이 읽기");
    await fireEvent(screen.getByTestId("club-editor-undecided"), "valueChange", true);
    expect(screen.getByText(EDITOR_TEXT.undecidedNote)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("club-editor-submit"));
    await screen.findByText(EDITOR_TEXT.createFailed);
    await fireEvent.press(screen.getByTestId("club-editor-submit"));
    await waitFor(() => expect(m.createClub).toHaveBeenCalledTimes(2));
    for (const call of m.createClub.mock.calls) {
      expect(call[0]).toBe(101);
      expect(call[1]).toMatchObject({ name: "소년이 온다 같이 읽기", starts_at: null, ends_at: null });
      expect(call[2]).toBe(REQ_ID);
    }
    expect(mockBack).toHaveBeenCalled();
  });

  test("create failure keeps input and retries with same request id", async () => {
    m.createClub.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    await render(<ClubEditor libraryId={101} />);
    await fireEvent.changeText(screen.getByTestId("club-editor-name"), "모임");
    await fireEvent.changeText(screen.getByTestId("club-editor-date"), "2026-11-28");
    await fireEvent.changeText(screen.getByTestId("club-editor-start"), "14:00");
    await fireEvent.changeText(screen.getByTestId("club-editor-end"), "16:00");
    await fireEvent.press(screen.getByTestId("club-editor-submit"));
    expect(await screen.findByText(EDITOR_TEXT.createFailed)).toBeTruthy();
    expect(screen.getByTestId("club-editor-name").props.value).toBe("모임");
    expect(screen.getByTestId("club-editor-date").props.value).toBe("2026-11-28");
    expect(m.createClub.mock.calls[0]![1]).toMatchObject({
      starts_at: "2026-11-28T14:00:00+09:00",
      ends_at: "2026-11-28T16:00:00+09:00",
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("end before start is refused without sending", async () => {
    await render(<ClubEditor libraryId={101} />);
    await fireEvent.changeText(screen.getByTestId("club-editor-name"), "모임");
    await fireEvent.changeText(screen.getByTestId("club-editor-date"), "2026-11-28");
    await fireEvent.changeText(screen.getByTestId("club-editor-start"), "16:00");
    await fireEvent.changeText(screen.getByTestId("club-editor-end"), "14:00");
    await fireEvent.press(screen.getByTestId("club-editor-submit"));
    expect(screen.getByText(EDITOR_TEXT.timeOrder)).toBeTruthy();
    expect(m.createClub).not.toHaveBeenCalled();
  });

  test("toKstIso builds seoul time", () => {
    expect(toKstIso("2026-11-28", "9:05")).toBe("2026-11-28T09:05:00+09:00");
    expect(toKstIso("2026-02-30", "10:00")).toBeNull();
    expect(toKstIso("2026-11-28", "25:00")).toBeNull();
  });
});
