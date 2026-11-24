// CLUB-2-P3 기록 화면·다음 모임·출석 확인·모임 화면 연결 (contracts/book-club.md CLUB-2 P5, 명세 결정 1·예외 #1~#6, K2-2·K2-O1·K2-O6·K2-O7)
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import * as api from "../api";
import type { Club, ClubRecord } from "../api";
import { ATTEND_TEXT } from "../AttendanceSheet";
import { RECORD_TEXT, ClubRecordScreen } from "../ClubRecordScreen";
import { CLUB_TEXT, ClubScreen } from "../ClubScreen";
import { NEXT_TEXT } from "../NextClubSheet";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(() => cb(), [cb]);
  },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-2222-4333-8444-555555555555" }));
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchClub: jest.fn(),
  fetchClubComments: jest.fn(),
  fetchClubRecord: jest.fn(),
  fetchNextClubs: jest.fn(),
  putClubReview: jest.fn(),
  shareClubReview: jest.fn(),
  createNextClub: jest.fn(),
  putAttendance: jest.fn(),
  requestCommentModeration: jest.fn(),
  fetchMyRestrictions: jest.fn(),
}));

const m = {
  fetchClub: jest.mocked(api.fetchClub),
  fetchClubComments: jest.mocked(api.fetchClubComments),
  fetchClubRecord: jest.mocked(api.fetchClubRecord),
  fetchNextClubs: jest.mocked(api.fetchNextClubs),
  putClubReview: jest.mocked(api.putClubReview),
  shareClubReview: jest.mocked(api.shareClubReview),
  createNextClub: jest.mocked(api.createNextClub),
  putAttendance: jest.mocked(api.putAttendance),
  requestCommentModeration: jest.mocked(api.requestCommentModeration),
  fetchMyRestrictions: jest.mocked(api.fetchMyRestrictions),
};
const mockedUseAuth = jest.mocked(useAuth);
const REQ_ID = "11111111-2222-4333-8444-555555555555";
const PAST_START = "2026-11-20T19:00:00+09:00";
const PAST_END = "2026-11-20T21:00:00+09:00";

function club(extra: Partial<Club> = {}): Club {
  return {
    id: "club-1",
    library: { id: 101, name: "정독도서관" },
    name: "소년이 온다 같이 읽기",
    intro: "같이 읽어요",
    book: null,
    place: "2층 세미나실",
    starts_at: PAST_START,
    ends_at: PAST_END,
    capacity: 6,
    status: "ended",
    cancel_reason: null,
    host_nickname: "책읽는곰",
    is_host: false,
    participant_count: 3,
    participants: [
      { nickname: "해바라기", is_me: false },
      { nickname: "민트", is_me: true },
      { nickname: "달", is_me: false },
    ],
    my_participation: "joined",
    previous_club_id: null,
    ...extra,
  };
}

function rec(extra: Partial<ClubRecord> = {}, clubExtra: Partial<Club> = {}): ClubRecord {
  return {
    club: club(clubExtra),
    my_participation: "joined",
    my_attendance: "attended",
    review: null,
    shared_post_id: null,
    can_create_next: true,
    suggest_next: false,
    attendance_roster_version: null,
    ...extra,
  };
}

const ROSTER_V1 = "a".repeat(64);
const ROSTER_V2 = "b".repeat(64);
const HOST = { suggest_next: true, my_participation: "none" as const, my_attendance: null, attendance_roster_version: ROSTER_V1 };

function signed(status: "signedIn" | "signedOut", userId = "user-a") {
  mockedUseAuth.mockReturnValue({ status, userId: status === "signedIn" ? userId : null } as ReturnType<typeof useAuth>);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(m).forEach((fn) => fn.mockReset()); // 앞 시험의 지연 응답·한 번만 값이 남지 않게
  signed("signedIn");
  m.fetchClubRecord.mockResolvedValue(rec());
  m.fetchNextClubs.mockResolvedValue([]);
  m.fetchMyRestrictions.mockResolvedValue([]);
});

async function openRecord() {
  await render(<ClubRecordScreen clubId="club-1" />);
  await screen.findByTestId("record-card");
}

type Json = { props?: Record<string, unknown>; children?: (Json | string)[] | null } | string | null;

/** 화면 위에서 아래 순서로 testID를 모은다 */
function testIdsInOrder(node: Json | Json[] = screen.toJSON() as Json, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => testIdsInOrder(n, out));
  else if (node && typeof node === "object") {
    const id = node.props?.testID;
    if (typeof id === "string" && !out.includes(id)) out.push(id);
    (node.children ?? []).forEach((c) => testIdsInOrder(c as Json, out));
  }
  return out;
}

function sectionOrder(): string[] {
  const ids = ["record-card", "record-review", "record-next", "record-attendance"];
  return testIdsInOrder().filter((id) => ids.includes(id));
}

describe("기록 화면", () => {
  test("record screen order is record then review then next", async () => {
    await openRecord();
    expect(sectionOrder()).toEqual(["record-card", "record-review", "record-next"]); // 참가자: 출석 확인 없음
    expect(screen.getByText(RECORD_TEXT.mine.attended)).toBeTruthy();
    expect(screen.getByText(/끝난 모임/)).toBeTruthy();
    expect(screen.getByText(RECORD_TEXT.count(3))).toBeTruthy();
    expect(screen.getByText(RECORD_TEXT.reviewTitle)).toBeTruthy();
    expect(screen.getByText(RECORD_TEXT.noNext)).toBeTruthy(); // 빈 상태(예외 #2)
  });

  test("host sees attendance at the very bottom", async () => {
    m.fetchClubRecord.mockResolvedValue(rec(HOST, { is_host: true, my_participation: "none" }));
    await openRecord();
    expect(sectionOrder()).toEqual(["record-card", "record-review", "record-next", "record-attendance"]);
    expect(screen.getByText(RECORD_TEXT.mine.host)).toBeTruthy();
  });

  test("next suggestion only for host", async () => {
    m.fetchClubRecord.mockResolvedValue(rec(HOST, { is_host: true }));
    await openRecord();
    expect(screen.getByTestId("record-next-suggest")).toBeTruthy();
    expect(screen.getByText(RECORD_TEXT.suggestTitle)).toBeTruthy();
    expect(screen.getByText(RECORD_TEXT.suggestBody)).toBeTruthy();
  });

  test("participant gets only the separate next button", async () => {
    await openRecord();
    expect(screen.queryByTestId("record-next-suggest")).toBeNull();
    expect(screen.queryByText(RECORD_TEXT.suggestTitle)).toBeNull();
    expect(screen.getByTestId("record-next-create")).toBeTruthy();
  });

  test("existing next clubs are shown first", async () => {
    m.fetchNextClubs.mockResolvedValue([
      { id: "n1", library_id: 101, name: "2회차", starts_at: null, place: "1층", status: "open", participant_count: 0, capacity: null, published_at: PAST_END },
    ]);
    m.fetchClubRecord.mockResolvedValue(rec(HOST, { is_host: true }));
    await openRecord();
    expect(screen.getByText(RECORD_TEXT.existingNext)).toBeTruthy();
    const order = testIdsInOrder().filter((id) => id === "record-next-n1" || id === "record-next-suggest");
    expect(order).toEqual(["record-next-n1", "record-next-suggest"]);
    await fireEvent.press(screen.getByTestId("record-next-n1"));
    expect(mockPush).toHaveBeenCalledWith("/clubs/n1");
  });

  test("my no show is shown on the card", async () => {
    m.fetchClubRecord.mockResolvedValue(rec({ my_attendance: "no_show" }));
    await openRecord();
    expect(screen.getByText(RECORD_TEXT.mine.no_show)).toBeTruthy();
  });
});

describe("후기", () => {
  test("review save failure keeps text and retries", async () => {
    m.putClubReview.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    m.putClubReview.mockResolvedValueOnce(rec({ review: { body: "좋았어요", updated_at: PAST_END } }));
    await openRecord();
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "좋았어요");
    await fireEvent.press(screen.getByTestId("record-review-save"));
    expect(await screen.findByText(RECORD_TEXT.saveFailed)).toBeTruthy();
    expect(screen.getByTestId("record-review-input").props.value).toBe("좋았어요");
    await fireEvent.press(screen.getByText(RECORD_TEXT.retry));
    expect(await screen.findByText(RECORD_TEXT.saved)).toBeTruthy();
    expect(m.putClubReview).toHaveBeenNthCalledWith(2, "club-1", "좋았어요");
    expect(screen.getByTestId("record-review-share")).toBeTruthy(); // 저장 뒤 "게시물로 올리기"
  });

  test("empty or too long review cannot be saved", async () => {
    await openRecord();
    expect(screen.getByTestId("record-review-save").props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "   ");
    expect(screen.getByTestId("record-review-save").props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "가".repeat(2001));
    expect(screen.getByText(RECORD_TEXT.reviewTooLong)).toBeTruthy();
    expect(screen.getByText("2001/2000")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("record-review-save"));
    expect(m.putClubReview).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "가".repeat(2000));
    expect(screen.getByTestId("record-review-save").props.accessibilityState.disabled).toBe(false);
  });

  test("share and next buttons send once", async () => {
    m.fetchClubRecord.mockResolvedValue(rec({ review: { body: "좋았어요", updated_at: PAST_END } }));
    const shared = deferred<ClubRecord>();
    m.shareClubReview.mockReturnValue(shared.promise);
    await openRecord();
    const share = screen.getByTestId("record-review-share");
    await fireEvent.press(share);
    await fireEvent.press(share);
    expect(screen.getByText(RECORD_TEXT.sharing)).toBeTruthy();
    expect(m.shareClubReview).toHaveBeenCalledTimes(1);
    expect(m.shareClubReview).toHaveBeenCalledWith("club-1", REQ_ID);
    shared.resolve(rec({ review: { body: "좋았어요", updated_at: PAST_END }, shared_post_id: "post-9" }));
    expect(await screen.findByText(RECORD_TEXT.sharedNow)).toBeTruthy();
    await fireEvent.press(screen.getByText(RECORD_TEXT.shared));
    expect(mockPush).toHaveBeenCalledWith("/posts/post-9");

    const created = deferred<Club>();
    m.createNextClub.mockReturnValue(created.promise);
    await fireEvent.press(screen.getByTestId("record-next-create"));
    expect(screen.getByTestId("next-club-place").props.value).toBe("2층 세미나실"); // 이전 장소로 채움
    const submit = screen.getByTestId("next-club-submit");
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    expect(screen.getByText(NEXT_TEXT.sending)).toBeTruthy();
    expect(m.createNextClub).toHaveBeenCalledTimes(1);
    expect(m.createNextClub).toHaveBeenCalledWith("club-1", { place: "2층 세미나실", starts_at: null, ends_at: null }, REQ_ID);
    created.resolve(club({ id: "club-2", status: "open", previous_club_id: "club-1" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/clubs/club-2"));
  });

  test("next club sheet checks time order before sending", async () => {
    await openRecord();
    await fireEvent.press(screen.getByTestId("record-next-create"));
    await fireEvent.changeText(screen.getByTestId("next-club-date"), "2026-12-05");
    await fireEvent.changeText(screen.getByTestId("next-club-start"), "16:00");
    await fireEvent.changeText(screen.getByTestId("next-club-end"), "14:00");
    await fireEvent.press(screen.getByTestId("next-club-submit"));
    expect(screen.getByText("끝나는 시각은 시작보다 늦어야 해요")).toBeTruthy();
    expect(m.createNextClub).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId("next-club-end"), "18:00");
    m.createNextClub.mockResolvedValue(club({ id: "club-2" }));
    await fireEvent.press(screen.getByTestId("next-club-submit"));
    expect(m.createNextClub).toHaveBeenCalledWith(
      "club-1",
      { place: "2층 세미나실", starts_at: "2026-12-05T16:00:00+09:00", ends_at: "2026-12-05T18:00:00+09:00" },
      REQ_ID
    );
  });
});

describe("출석 확인", () => {
  test("attendance sheet asks before recording no shows", async () => {
    m.fetchClubRecord.mockResolvedValue(rec(HOST, { is_host: true, participants: [
      { nickname: "해바라기", is_me: false },
      { nickname: "민트", is_me: false },
      { nickname: "달", is_me: false },
    ] }));
    m.putAttendance.mockResolvedValue(rec(HOST, { is_host: true }));
    await openRecord();
    expect(screen.getByText(ATTEND_TEXT.note(3))).toBeTruthy();
    expect(screen.getByTestId("attend-send").props.accessibilityState.disabled).toBe(true); // 기본은 모두 왔어요
    await fireEvent.press(screen.getByTestId("attend-missed-2"));
    await fireEvent.press(screen.getByTestId("attend-send"));
    expect(screen.getByText(ATTEND_TEXT.confirm(1))).toBeTruthy();
    expect(m.putAttendance).not.toHaveBeenCalled(); // 확인창 전에는 보내지 않는다
    await fireEvent.press(screen.getByTestId("attend-confirm-do"));
    await waitFor(() => expect(m.putAttendance).toHaveBeenCalledTimes(1));
    expect(m.putAttendance).toHaveBeenCalledWith("club-1", ROSTER_V1, [{ participant_index: 2 }]); // 받은 명단 버전과 함께
    expect(await screen.findByText(ATTEND_TEXT.recorded)).toBeTruthy();
    expect(screen.queryByTestId("attend-missed-2")).toBeNull(); // 되돌리기 없음
  });

  test("roster changed clears selection and reloads the new roster", async () => {
    m.fetchClubRecord.mockResolvedValueOnce(rec(HOST, { is_host: true, participants: [
      { nickname: "해바라기", is_me: false },
      { nickname: "민트", is_me: false },
      { nickname: "달", is_me: false },
    ] }));
    // 그 사이 앞 순서 "해바라기"가 빠졌다: 같은 자리 1번이 이제 다른 사람("달")을 가리킨다
    m.fetchClubRecord.mockResolvedValueOnce(rec({ ...HOST, attendance_roster_version: ROSTER_V2 }, { is_host: true, participants: [
      { nickname: "민트", is_me: false },
      { nickname: "달", is_me: false },
    ] }));
    m.putAttendance.mockRejectedValueOnce(
      new api.ApiCallError(409, "CLUB_ATTENDANCE_ROSTER_CHANGED", "참가 명단이 바뀌었어요. 다시 확인해 주세요.", "")
    );
    await openRecord();
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "아직 저장하지 않은 후기");
    await fireEvent.press(screen.getByTestId("attend-missed-1")); // "민트"
    await fireEvent.press(screen.getByTestId("attend-send"));
    await fireEvent.press(screen.getByTestId("attend-confirm-do"));
    expect(await screen.findByText(ATTEND_TEXT.rosterChanged)).toBeTruthy();
    await waitFor(() => expect(m.fetchClubRecord).toHaveBeenCalledTimes(2)); // 같은 화면에서 새 명단을 다시 읽는다
    expect(await screen.findByText(ATTEND_TEXT.note(2))).toBeTruthy();
    expect(screen.getByTestId("record-review-input").props.value).toBe("아직 저장하지 않은 후기");
    expect(screen.queryByText("해바라기")).toBeNull();
    expect(screen.getByTestId("attend-missed-0").props.accessibilityState.selected).toBe(false); // 선택이 비었다
    expect(screen.getByTestId("attend-missed-1").props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId("attend-send").props.accessibilityState.disabled).toBe(true);
    expect(m.putAttendance).toHaveBeenCalledTimes(1);

    m.putAttendance.mockResolvedValueOnce(rec({ ...HOST, attendance_roster_version: ROSTER_V2 }, { is_host: true }));
    await fireEvent.press(screen.getByTestId("attend-missed-0")); // 새 명단에서 "민트"를 다시 고른다
    await fireEvent.press(screen.getByTestId("attend-send"));
    await fireEvent.press(screen.getByTestId("attend-confirm-do"));
    await waitFor(() => expect(m.putAttendance).toHaveBeenCalledTimes(2));
    expect(m.putAttendance).toHaveBeenLastCalledWith("club-1", ROSTER_V2, [{ participant_index: 0 }]);
  });

  test("a changed roster returned by attendance does not transfer recorded indexes", async () => {
    m.fetchClubRecord.mockResolvedValueOnce(rec(HOST, { is_host: true }));
    const participants = club().participants.slice(1);
    m.putAttendance.mockResolvedValueOnce(rec(
      { ...HOST, attendance_roster_version: ROSTER_V2 },
      { is_host: true, participants, participant_count: 2 },
    ));
    await openRecord();
    await fireEvent.press(screen.getByTestId("attend-missed-1"));
    await fireEvent.press(screen.getByTestId("attend-send"));
    await fireEvent.press(screen.getByTestId("attend-confirm-do"));
    expect(await screen.findByText(ATTEND_TEXT.note(2))).toBeTruthy();
    expect(screen.queryByText(ATTEND_TEXT.recorded)).toBeNull();
    expect(screen.getByTestId("attend-missed-1").props.accessibilityState.disabled).toBe(false);
  });

  test("a failed roster refresh blocks stale marks and can retry without losing the review draft", async () => {
    m.fetchClubRecord
      .mockResolvedValueOnce(rec(HOST, { is_host: true }))
      .mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""))
      .mockResolvedValueOnce(rec({ ...HOST, attendance_roster_version: ROSTER_V2 }, { is_host: true }));
    m.putAttendance.mockRejectedValueOnce(new api.ApiCallError(409, "CLUB_ATTENDANCE_ROSTER_CHANGED", "x", ""));
    await openRecord();
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "쓰던 후기");
    await fireEvent.press(screen.getByTestId("attend-missed-1"));
    await fireEvent.press(screen.getByTestId("attend-send"));
    await fireEvent.press(screen.getByTestId("attend-confirm-do"));
    expect(await screen.findByText(ATTEND_TEXT.reloadFailed)).toBeTruthy();
    expect(screen.getByTestId("attend-missed-1").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("record-review-input").props.value).toBe("쓰던 후기");
    await fireEvent.press(screen.getByText(ATTEND_TEXT.reload));
    expect(await screen.findByText(ATTEND_TEXT.rosterChanged)).toBeTruthy();
    expect(screen.getByTestId("attend-missed-1").props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId("attend-send").props.accessibilityState.disabled).toBe(true);
    expect(m.putAttendance).toHaveBeenCalledTimes(1);
  });

  test("a late review save cannot restore the previous attendance roster", async () => {
    m.fetchClubRecord.mockResolvedValueOnce(rec(HOST, { is_host: true }));
    const saved = deferred<ClubRecord>();
    m.putClubReview.mockReturnValueOnce(saved.promise);
    m.putAttendance.mockResolvedValueOnce(rec(
      { ...HOST, attendance_roster_version: ROSTER_V2 },
      { is_host: true, participants: club().participants.slice(1), participant_count: 2 },
    ));
    await openRecord();
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "후기");
    await fireEvent.press(screen.getByTestId("record-review-save"));
    await fireEvent.press(screen.getByTestId("attend-missed-1"));
    await fireEvent.press(screen.getByTestId("attend-send"));
    await fireEvent.press(screen.getByTestId("attend-confirm-do"));
    expect(await screen.findByText(ATTEND_TEXT.note(2))).toBeTruthy();
    await act(async () => saved.resolve(rec({ ...HOST, review: { body: "후기", updated_at: PAST_END } }, { is_host: true })));
    expect(await screen.findByText(RECORD_TEXT.saved)).toBeTruthy();
    expect(screen.getByText(ATTEND_TEXT.note(2))).toBeTruthy();
  });

  test("closing the confirm sends nothing", async () => {
    m.fetchClubRecord.mockResolvedValue(rec(HOST, { is_host: true }));
    await openRecord();
    await fireEvent.press(screen.getByTestId("attend-missed-0"));
    await fireEvent.press(screen.getByTestId("attend-send"));
    await fireEvent.press(screen.getByText(ATTEND_TEXT.close));
    expect(screen.queryByTestId("attend-confirm")).toBeNull();
    expect(m.putAttendance).not.toHaveBeenCalled();
  });
});

describe("계정·모임 전환", () => {
  const MINE = { review: { body: "A가 쓴 후기", updated_at: PAST_END } };

  /** 이전 요청을 보류한 채 계정 또는 모임을 바꾼다. 바뀐 쪽 기록도 늦게 와서 그 사이 화면도 본다 */
  async function switchWhilePending(view: { rerender(el: React.ReactElement): unknown }, kind: "account" | "club") {
    const nextRecord = deferred<ClubRecord>();
    m.fetchClubRecord.mockReturnValueOnce(nextRecord.promise);
    if (kind === "account") {
      signed("signedIn", "user-b");
      await view.rerender(<ClubRecordScreen clubId="club-1" />);
    } else {
      await view.rerender(<ClubRecordScreen clubId="club-2" />);
    }
    expect(screen.queryByTestId("record-card")).toBeNull(); // 바뀐 즉시 이전 기록·초안·안내를 보여 주지 않는다
    expect(screen.queryByTestId("record-notice")).toBeNull();
    expect(screen.queryByText(RECORD_TEXT.saving)).toBeNull();
    expect(screen.queryByText(RECORD_TEXT.sharing)).toBeNull();
    await act(async () => nextRecord.resolve(rec({}, { id: kind === "club" ? "club-2" : "club-1", name: "새 화면 모임" })));
    await screen.findByText("새 화면 모임");
  }

  function expectCleanNewScreen() {
    expect(screen.getByText("새 화면 모임")).toBeTruthy();
    expect(screen.getByTestId("record-review-input").props.value).toBe(""); // 이전 기록·초안 없음
    expect(screen.queryByTestId("record-notice")).toBeNull(); // 저장·공유 안내, 오류, 다시 해 보기 없음
    expect(screen.queryByText(RECORD_TEXT.retry)).toBeNull();
    expect(screen.queryByText(RECORD_TEXT.saving)).toBeNull(); // 버튼 진행 상태 없음
    expect(screen.queryByText(RECORD_TEXT.sharing)).toBeNull();
    expect(screen.queryByTestId("record-review-shared")).toBeNull();
    expect(screen.queryByTestId("record-review-share")).toBeNull();
    expect(screen.getByTestId("record-review-save").props.accessibilityState.disabled).toBe(true);
  }

  test.each(["account", "club"] as const)("late next club creation does not navigate after %s switch", async (kind) => {
    const created = deferred<Club>();
    m.createNextClub.mockReturnValueOnce(created.promise);
    const view = await render(<ClubRecordScreen clubId="club-1" />);
    await screen.findByTestId("record-card");
    await fireEvent.press(screen.getByTestId("record-next-create"));
    await fireEvent.press(screen.getByTestId("next-club-submit"));
    expect(m.createNextClub).toHaveBeenCalledTimes(1);
    await switchWhilePending(view, kind);
    await act(async () => created.resolve(club({ id: "old-account-next-club" })));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("새 화면 모임")).toBeTruthy();
  });

  test.each([
    ["account", "success"],
    ["account", "failure"],
    ["club", "success"],
    ["club", "failure"],
  ] as const)("late review save after %s switch (%s) does not touch the new screen", async (kind, result) => {
    const saved = deferred<ClubRecord>();
    m.putClubReview.mockReturnValueOnce(saved.promise);
    const view = await render(<ClubRecordScreen clubId="club-1" />);
    await screen.findByTestId("record-card");
    await fireEvent.changeText(screen.getByTestId("record-review-input"), "A가 쓴 후기");
    await fireEvent.press(screen.getByTestId("record-review-save"));
    expect(screen.getByText(RECORD_TEXT.saving)).toBeTruthy();
    await switchWhilePending(view, kind);
    await act(async () => {
      if (result === "success") saved.resolve(rec({ ...MINE, shared_post_id: "post-a" }));
      else saved.reject(new api.ApiCallError(0, "NETWORK", "x", ""));
    });
    expectCleanNewScreen();
  });

  test.each([
    ["account", "success"],
    ["account", "failure"],
    ["club", "success"],
    ["club", "failure"],
  ] as const)("late review share after %s switch (%s) does not touch the new screen", async (kind, result) => {
    m.fetchClubRecord.mockResolvedValueOnce(rec(MINE));
    const shared = deferred<ClubRecord>();
    m.shareClubReview.mockReturnValueOnce(shared.promise);
    const view = await render(<ClubRecordScreen clubId="club-1" />);
    await screen.findByTestId("record-card");
    await fireEvent.press(screen.getByTestId("record-review-share"));
    expect(screen.getByText(RECORD_TEXT.sharing)).toBeTruthy();
    await switchWhilePending(view, kind);
    await act(async () => {
      if (result === "success") shared.resolve(rec({ ...MINE, shared_post_id: "post-a" }));
      else shared.reject(new api.ApiCallError(0, "NETWORK", "x", ""));
    });
    expectCleanNewScreen();
  });

  test.each(["success", "failure"] as const)(
    "late attendance %s after account switch does not touch the new screen",
    async (result) => {
      m.fetchClubRecord.mockResolvedValueOnce(rec(HOST, { is_host: true }));
      const sent = deferred<ClubRecord>();
      m.putAttendance.mockReturnValueOnce(sent.promise);
      const view = await render(<ClubRecordScreen clubId="club-1" />);
      await screen.findByTestId("record-card");
      await fireEvent.press(screen.getByTestId("attend-missed-0"));
      await fireEvent.press(screen.getByTestId("attend-send"));
      await fireEvent.press(screen.getByTestId("attend-confirm-do"));
      await switchWhilePending(view, "account");
      await act(async () => {
        if (result === "success") sent.resolve(rec(HOST, { is_host: true, name: "A의 모임" }));
        else sent.reject(new api.ApiCallError(409, "CLUB_ATTENDANCE_ROSTER_CHANGED", "x", ""));
      });
      expectCleanNewScreen();
      expect(screen.queryByText("A의 모임")).toBeNull();
      expect(screen.queryByTestId("record-attendance")).toBeNull();
      expect(screen.queryByText(ATTEND_TEXT.rosterChanged)).toBeNull();
      expect(m.fetchClubRecord).toHaveBeenCalledTimes(2); // 이전 응답이 다시 읽기를 부르지 않는다
    }
  );
});

describe("기록 화면 상태", () => {
  test("record load failure and retry", async () => {
    m.fetchClubRecord.mockRejectedValueOnce(new api.ApiCallError(0, "NETWORK", "x", ""));
    await render(<ClubRecordScreen clubId="club-1" />);
    expect(await screen.findByText(RECORD_TEXT.loadFailed)).toBeTruthy();
    await fireEvent.press(screen.getByText(RECORD_TEXT.retry));
    await screen.findByTestId("record-card");
  });

  test("signed out record shows login first", async () => {
    signed("signedOut");
    await render(<ClubRecordScreen clubId="club-1" />);
    expect(screen.getByText(RECORD_TEXT.signedOut)).toBeTruthy();
    expect(screen.getByText(RECORD_TEXT.loginBody)).toBeTruthy();
    expect(m.fetchClubRecord).not.toHaveBeenCalled(); // 로그인 안 했으면 부르지 않는다
    await fireEvent.press(screen.getAllByText(RECORD_TEXT.login).at(-1)!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login", params: { returnTo: "/clubs/club-1/record" } });
  });

  test("outsider record state", async () => {
    m.fetchClubRecord.mockRejectedValueOnce(new api.ApiCallError(404, "NOT_FOUND", "x", "club_id"));
    await render(<ClubRecordScreen clubId="club-1" />);
    expect(await screen.findByText(RECORD_TEXT.notMine)).toBeTruthy();
    await fireEvent.press(screen.getByText(RECORD_TEXT.toClub));
    expect(mockReplace).toHaveBeenCalledWith("/clubs/club-1");
  });

  test("not ended record state", async () => {
    m.fetchClubRecord.mockRejectedValueOnce(new api.ApiCallError(409, "CLUB_NOT_ENDED", "x", ""));
    await render(<ClubRecordScreen clubId="club-1" />);
    expect(await screen.findByText(RECORD_TEXT.notEnded)).toBeTruthy();
  });
});

describe("모임 화면 연결", () => {
  beforeEach(() => {
    m.fetchClubComments.mockResolvedValue({
      items: [{ id: "c1", body: "광고입니다", author_nickname: "달", created_at: PAST_END, mine: false }],
      next_cursor: null,
    });
  });

  test("ended club main button opens record for participant", async () => {
    m.fetchClub.mockResolvedValue(club());
    await render(<ClubScreen clubId="club-1" />);
    await fireEvent.press(await screen.findByText(CLUB_TEXT.writeRecord));
    expect(mockPush).toHaveBeenCalledWith("/clubs/club-1/record");
  });

  test("ended club main button opens record for host", async () => {
    m.fetchClub.mockResolvedValue(club({ is_host: true, my_participation: "none" }));
    await render(<ClubScreen clubId="club-1" />);
    await fireEvent.press(await screen.findByText(CLUB_TEXT.writeRecord));
    expect(mockPush).toHaveBeenCalledWith("/clubs/club-1/record");
  });

  test("ended club for non participant stays dim", async () => {
    m.fetchClub.mockResolvedValue(club({ my_participation: "none" }));
    await render(<ClubScreen clubId="club-1" />);
    expect(await screen.findByText(CLUB_TEXT.ended)).toBeTruthy();
    expect(screen.queryByText(CLUB_TEXT.writeRecord)).toBeNull();
  });

  test("host requests comment moderation and comment stays", async () => {
    m.fetchClub.mockResolvedValue(club({ status: "open", ends_at: null, starts_at: null, is_host: true, my_participation: "none" }));
    m.requestCommentModeration.mockResolvedValueOnce({ alreadyRequested: false }).mockResolvedValueOnce({ alreadyRequested: true });
    await render(<ClubScreen clubId="club-1" />);
    await fireEvent.press(await screen.findByTestId("club-comment-menu-c1"));
    expect(screen.getByText(CLUB_TEXT.moderationTitle)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("club-moderation-reason-input"), "광고예요");
    await fireEvent.press(screen.getByText(CLUB_TEXT.moderationSend));
    expect(await screen.findByText(CLUB_TEXT.moderationDone)).toBeTruthy();
    expect(m.requestCommentModeration).toHaveBeenCalledWith("c1", "광고예요");
    expect(screen.getByText("광고입니다")).toBeTruthy(); // 승인 전 댓글은 그대로
    await fireEvent.press(screen.getByTestId("club-comment-menu-c1"));
    await fireEvent.changeText(screen.getByTestId("club-moderation-reason-input"), "또");
    await fireEvent.press(screen.getByText(CLUB_TEXT.moderationSend));
    expect(await screen.findByText(CLUB_TEXT.moderationAgain)).toBeTruthy();
  });

  test("participant has no moderation menu on others comments", async () => {
    m.fetchClub.mockResolvedValue(club({ status: "open", ends_at: null, starts_at: null }));
    await render(<ClubScreen clubId="club-1" />);
    await screen.findByText("광고입니다");
    expect(screen.queryByTestId("club-comment-menu-c1")).toBeNull();
  });

  test("restriction shows on open for join and comment", async () => {
    m.fetchClub.mockResolvedValue(club({ status: "open", ends_at: null, starts_at: null, my_participation: "none" }));
    m.fetchMyRestrictions.mockResolvedValue([
      { id: "r1", reason_kind: "no_show", ends_at: "2026-11-01T18:00:00+09:00", reason_text: "x", review_requested: false },
      { id: "r2", reason_kind: "no_show", ends_at: "2099-12-05T18:00:00+09:00", reason_text: "x", review_requested: false },
    ]);
    await render(<ClubScreen clubId="club-1" />);
    expect(await screen.findByText(`${CLUB_TEXT.restricted} (12월 5일 18:00까지)`)).toBeTruthy();
    expect(screen.getByText(`${CLUB_TEXT.commentRestricted} (12월 5일 18:00까지)`)).toBeTruthy();
    expect(screen.queryByTestId("club-comment-input")).toBeNull();
  });

  test("permanent restriction has no until text", async () => {
    m.fetchClub.mockResolvedValue(club({ status: "open", ends_at: null, starts_at: null, my_participation: "none" }));
    m.fetchMyRestrictions.mockResolvedValue([
      { id: "r1", reason_kind: "comment", ends_at: null, reason_text: "x", review_requested: false },
    ]);
    await render(<ClubScreen clubId="club-1" />);
    expect(await screen.findByText(CLUB_TEXT.restricted)).toBeTruthy();
    expect(screen.getByText(CLUB_TEXT.commentRestricted)).toBeTruthy();
  });
});
