// MY-2-P2 프로필 수정 화면 — contracts/my-collection.md MY-2 P5 (MY-2-P2 행), C3 문구, C6, P4 앱 저장 흐름
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { ApiCallError } from "../../../lib/publicApi";
import * as picker from "../../local-feed/imagePicker";
import * as api from "../api";
import type { MyProfile } from "../api";
import { FAKE_PROFILE } from "../__fakes__/myCollectionApi";
import { EDIT_TEXT, ProfileEditScreen } from "../ProfileEditScreen";
import * as my from "../useMyCollection";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockBeforeRemove: ((ev: { preventDefault: () => void }) => void) | null = null;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useNavigation: () => mockNavigation,
  useFocusEffect: () => undefined,
}));
const mockNavigation = {
  setOptions: jest.fn(),
  addListener: (event: string, cb: (ev: { preventDefault: () => void }) => void) => {
    if (event === "beforeRemove") mockBeforeRemove = cb;
    return () => {
      mockBeforeRemove = null;
    };
  },
};
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../../auth/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../api", () => ({
  ...jest.requireActual<object>("../api"),
  fetchMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
  uploadAvatar: jest.fn(),
}));
jest.mock("../../local-feed/imagePicker", () => ({
  ...jest.requireActual<object>("../../local-feed/imagePicker"),
  pickPostImage: jest.fn(),
  canUseCamera: jest.fn(),
}));
jest.mock("../useMyCollection", () => ({
  ...jest.requireActual<object>("../useMyCollection"),
  emitProfileSaved: jest.fn(),
}));

const fetchMyProfile = jest.mocked(api.fetchMyProfile);
const updateMyProfile = jest.mocked(api.updateMyProfile);
const uploadAvatar = jest.mocked(api.uploadAvatar);
const pickPostImage = jest.mocked(picker.pickPostImage);
const canUseCamera = jest.mocked(picker.canUseCamera);
const emitProfileSaved = jest.mocked(my.emitProfileSaved);
const mockedUseAuth = jest.mocked(useAuth);

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
const PATH = `avatars/${USER_A}/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg`;
const WITH_PHOTO: MyProfile = { ...FAKE_PROFILE, avatar_url: "https://img.example/a.jpg" };

function setAuth(status: "signedIn" | "signedOut" | "loading", userId: string | null = USER_A) {
  mockedUseAuth.mockReturnValue({
    status,
    userId: status === "signedIn" ? userId : null,
  } as unknown as ReturnType<typeof useAuth>);
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

const network = () => new ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
const unavailable = () => new ApiCallError(503, "DB_UNAVAILABLE", "데이터베이스에 연결하지 못했어요.", "");

async function show() {
  const view = await render(<ProfileEditScreen />);
  await waitFor(() => expect(screen.getByTestId("profile-edit")).toBeTruthy());
  return view;
}

async function type(testID: "nickname-input" | "bio-input", text: string) {
  await fireEvent.changeText(screen.getByTestId(testID), text);
}

async function save() {
  await fireEvent.press(screen.getByTestId("profile-save"));
  await act(async () => undefined);
}

async function pickFromAlbum(uri = "file:///new.jpg") {
  pickPostImage.mockResolvedValueOnce({ uri });
  await fireEvent.press(screen.getByLabelText(EDIT_TEXT.photoMenu));
  await fireEvent.press(screen.getByText(EDIT_TEXT.pickPhoto));
  await act(async () => undefined);
}

const valueOf = (testID: string) => screen.getByTestId(testID).props.value;

beforeEach(() => {
  jest.clearAllMocks();
  mockBeforeRemove = null;
  setAuth("signedIn");
  fetchMyProfile.mockResolvedValue(FAKE_PROFILE);
  updateMyProfile.mockImplementation(async (patch) => ({ ...FAKE_PROFILE, ...patch }) as MyProfile);
  uploadAvatar.mockResolvedValue({ avatar_path: PATH });
  canUseCamera.mockReturnValue(true);
});

describe("MY-2-P2 프로필 수정 화면", () => {
  test("unchanged save closes without call", async () => {
    await show();
    await save();
    expect(updateMyProfile).not.toHaveBeenCalled();
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("double save sends once", async () => {
    const pending = deferred<MyProfile>();
    updateMyProfile.mockReturnValue(pending.promise);
    await show();
    await type("nickname-input", "새이름");
    await fireEvent.press(screen.getByTestId("profile-save"));
    await fireEvent.press(screen.getByTestId("profile-save"));
    expect(updateMyProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText(EDIT_TEXT.saving)).toBeTruthy();
    await act(async () => pending.resolve({ ...FAKE_PROFILE, nickname: "새이름" }));
  });

  test("save sends only changed fields", async () => {
    await show();
    await type("bio-input", "  책 좋아해요  ");
    await save();
    expect(updateMyProfile).toHaveBeenCalledTimes(1);
    expect(updateMyProfile.mock.calls[0]?.[0]).toEqual({ bio: "책 좋아해요" });
  });

  test("blank bio is sent as null", async () => {
    await show();
    await type("bio-input", "   ");
    await save();
    expect(updateMyProfile.mock.calls[0]?.[0]).toEqual({ bio: null });
  });

  test("empty nickname is blocked", async () => {
    await show();
    await type("nickname-input", "   ");
    await save();
    expect(screen.getByText(EDIT_TEXT.nicknameEmpty)).toBeTruthy();
    expect(updateMyProfile).not.toHaveBeenCalled();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  test("counters and length limits", async () => {
    await show();
    expect(screen.getByText(`${FAKE_PROFILE.nickname.length}/40`)).toBeTruthy();
    expect(screen.getByText(`${FAKE_PROFILE.bio!.length}/60`)).toBeTruthy();
    expect(screen.getByTestId("nickname-input").props.maxLength).toBe(40);
    expect(screen.getByTestId("bio-input").props.maxLength).toBe(60);
  });

  test("leaving dirty edit asks before discarding", async () => {
    await show();
    await type("bio-input", "고친 소개");
    await fireEvent.press(screen.getByTestId("profile-edit-back"));
    expect(screen.getByText(EDIT_TEXT.discardTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(EDIT_TEXT.keepEditing));
    expect(screen.queryByText(EDIT_TEXT.discardTitle)).toBeNull();
    expect(valueOf("bio-input")).toBe("고친 소개");
    expect(mockBack).not.toHaveBeenCalled();

    // 기기 뒤로 가기도 같은 확인창
    const ev = { preventDefault: jest.fn() };
    await act(async () => mockBeforeRemove!(ev));
    expect(ev.preventDefault).toHaveBeenCalled();
    await fireEvent.press(screen.getByText(EDIT_TEXT.discard));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("leaving unchanged edit closes at once", async () => {
    await show();
    await fireEvent.press(screen.getByTestId("profile-edit-back"));
    expect(screen.queryByText(EDIT_TEXT.discardTitle)).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("photo menu from pencil", async () => {
    fetchMyProfile.mockResolvedValue(WITH_PHOTO);
    const view = await show();
    expect(screen.queryByText(/눌러/)).toBeNull(); // 사진 밑 안내 글자 없음
    await fireEvent.press(screen.getByLabelText(EDIT_TEXT.photoMenu));
    expect(screen.getByText(EDIT_TEXT.takePhoto)).toBeTruthy();
    expect(screen.getByText(EDIT_TEXT.pickPhoto)).toBeTruthy();
    expect(screen.getByText(EDIT_TEXT.removePhoto)).toBeTruthy();
    await view.unmount();

    fetchMyProfile.mockResolvedValue(FAKE_PROFILE); // 사진 없음, 카메라 없음(웹)
    canUseCamera.mockReturnValue(false);
    await show();
    await fireEvent.press(screen.getByLabelText(EDIT_TEXT.photoMenu));
    expect(screen.getByText(EDIT_TEXT.pickPhoto)).toBeTruthy();
    expect(screen.queryByText(EDIT_TEXT.removePhoto)).toBeNull();
    expect(screen.queryByText(EDIT_TEXT.takePhoto)).toBeNull();
  });

  test("removing photo sends avatar_path null only", async () => {
    fetchMyProfile.mockResolvedValue(WITH_PHOTO);
    await show();
    await fireEvent.press(screen.getByLabelText(EDIT_TEXT.photoMenu));
    await fireEvent.press(screen.getByText(EDIT_TEXT.removePhoto));
    expect(screen.getByLabelText("기본 프로필 사진")).toBeTruthy();
    await save();
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(updateMyProfile.mock.calls[0]?.[0]).toEqual({ avatar_path: null });
  });

  test("retry after failed profile save reuses uploaded path", async () => {
    updateMyProfile.mockRejectedValueOnce(network());
    await show();
    await type("nickname-input", "새이름");
    await pickFromAlbum();
    await save();
    expect(screen.getByText(EDIT_TEXT.resave)).toBeTruthy();
    await save();
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    expect(updateMyProfile).toHaveBeenCalledTimes(2);
    expect(updateMyProfile.mock.calls[0]?.[0]).toEqual({ nickname: "새이름", avatar_path: PATH });
    expect(updateMyProfile.mock.calls[1]?.[0]).toEqual({ nickname: "새이름", avatar_path: PATH });
  });

  test("picking another photo drops the uploaded path", async () => {
    updateMyProfile.mockRejectedValueOnce(network());
    uploadAvatar.mockResolvedValueOnce({ avatar_path: PATH }).mockResolvedValueOnce({ avatar_path: PATH.replace("7c9e", "aaaa") });
    await show();
    await pickFromAlbum("file:///one.jpg");
    await save();
    await pickFromAlbum("file:///two.jpg");
    await save();
    expect(uploadAvatar).toHaveBeenCalledTimes(2);
    expect(updateMyProfile.mock.calls[1]?.[0]).toEqual({ avatar_path: PATH.replace("7c9e", "aaaa") });
  });

  test("rejected photo keeps other fields", async () => {
    for (const err of [
      new ApiCallError(413, "PAYLOAD_TOO_LARGE", "too large", ""),
      new ApiCallError(422, "VALIDATION_ERROR", "bad", "file"),
    ]) {
      uploadAvatar.mockRejectedValueOnce(err);
      const view = await show();
      await type("nickname-input", "새이름");
      await type("bio-input", "새 소개");
      await pickFromAlbum();
      await save();
      expect(screen.getByText(EDIT_TEXT.photoRejected)).toBeTruthy();
      expect(valueOf("nickname-input")).toBe("새이름");
      expect(valueOf("bio-input")).toBe("새 소개");
      expect(screen.getByLabelText("프로필 사진").props.source).toEqual({ uri: "file:///new.jpg" });
      expect(updateMyProfile).not.toHaveBeenCalled();
      await view.unmount();
    }
  });

  test("failed save keeps typed values", async () => {
    updateMyProfile.mockRejectedValueOnce(unavailable());
    await show();
    await type("nickname-input", "새이름");
    await type("bio-input", "새 소개");
    await save();
    expect(screen.getByText(EDIT_TEXT.saveFailed)).toBeTruthy();
    expect(screen.getByText(EDIT_TEXT.saveFailedSub)).toBeTruthy();
    expect(screen.getByText(EDIT_TEXT.resave)).toBeTruthy();
    expect(valueOf("nickname-input")).toBe("새이름");
    expect(valueOf("bio-input")).toBe("새 소개");
    expect(emitProfileSaved).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("server field errors show under the field", async () => {
    updateMyProfile.mockRejectedValueOnce(new ApiCallError(422, "VALIDATION_ERROR", "x", "bio"));
    await show();
    await type("bio-input", "새 소개");
    await save();
    expect(screen.getByText(EDIT_TEXT.bioTooLong)).toBeTruthy();
    expect(valueOf("bio-input")).toBe("새 소개");
  });

  test("successful save hands profile to my page and goes back", async () => {
    await show();
    await type("nickname-input", "새이름");
    await save();
    expect(emitProfileSaved).toHaveBeenCalledWith(USER_A, expect.objectContaining({ nickname: "새이름" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("signed out edit shows login prompt", async () => {
    setAuth("signedOut");
    const view = await render(<ProfileEditScreen />);
    expect(screen.getByText(EDIT_TEXT.signedOut)).toBeTruthy();
    await fireEvent.press(screen.getByText(EDIT_TEXT.login));
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(fetchMyProfile).not.toHaveBeenCalled();
    await view.unmount();

    // 고치는 중 로그아웃되면 같은 안내로 바뀐다
    setAuth("signedIn");
    const view2 = await show();
    await type("bio-input", "고친 소개");
    setAuth("signedOut");
    await view2.rerender(<ProfileEditScreen />);
    expect(screen.getByText(EDIT_TEXT.signedOut)).toBeTruthy();
    expect(screen.queryByTestId("bio-input")).toBeNull();
  });

  test("old account save is ignored", async () => {
    // A의 #39가 늦게 끝나면 #38을 잇지 않는다
    const lateUpload = deferred<{ avatar_path: string }>();
    uploadAvatar.mockReturnValueOnce(lateUpload.promise);
    const view = await show();
    await pickFromAlbum();
    await fireEvent.press(screen.getByTestId("profile-save"));
    setAuth("signedIn", USER_B);
    await view.rerender(<ProfileEditScreen />);
    await act(async () => lateUpload.resolve({ avatar_path: PATH }));
    expect(updateMyProfile).not.toHaveBeenCalled();
    await view.unmount();

    // A의 #38이 늦게 끝나면 B 머리·토스트에 반영하지 않는다
    setAuth("signedIn", USER_A);
    const lateSave = deferred<MyProfile>();
    updateMyProfile.mockReturnValueOnce(lateSave.promise);
    const view2 = await show();
    await type("nickname-input", "A의 새이름");
    await fireEvent.press(screen.getByTestId("profile-save"));
    setAuth("signedIn", USER_B);
    await view2.rerender(<ProfileEditScreen />);
    await act(async () => lateSave.resolve({ ...FAKE_PROFILE, nickname: "A의 새이름" }));
    expect(emitProfileSaved).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
