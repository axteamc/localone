// 프로필 수정 화면(/me/edit) — contracts/my-collection.md MY-2 Y2-1~Y2-5, Y2-O1~Y2-O4, C3 문구, C6, P4 앱 저장 흐름.
// 한 화면에 위 가운데 사진(원 72) → 닉네임 칸 → 한 줄 소개 칸 → 맨 아래 "저장" 하나(시안 #el-layout 후보 A).
import { useNavigation, usePreventRemove, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { actionColors, cardSurface, theme, type as typeScale } from "../../theme";
import { UserIcon } from "../../theme/Icons";
import { canUseCamera, pickPostImage, type PickSource } from "../local-feed/imagePicker";
import { ApiCallError, fetchMyProfile, updateMyProfile, uploadAvatar, type MyProfile, type ProfilePatch } from "./api";
import { emitProfileSaved, MY_TEXT } from "./useMyCollection";
import { BackChevron, HeaderTitle } from "../../theme/ScreenHeader";

const C = theme.colors;
const ACT = actionColors(C);
const AVATAR = 72;
export const NICKNAME_MAX = 40; // Y2-2
export const BIO_MAX = 60; // Y2-O2

/** C3 화면 문구 */
export const EDIT_TEXT = {
  title: "프로필 수정",
  back: "뒤로",
  save: "저장",
  saving: "저장 중…",
  resave: "다시 저장하기",
  saveFailed: "저장하지 못했어요",
  saveFailedSub: "인터넷 연결을 확인해 주세요. 고친 내용은 그대로 있어요.",
  nickname: "닉네임",
  bio: "한 줄 소개",
  nicknameEmpty: "닉네임을 1자 이상 써 주세요",
  bioPlaceholder: "나를 한 줄로 소개해 보세요",
  bioTooLong: "한 줄 소개는 60자까지 쓸 수 있어요",
  discardTitle: "저장하지 않고 나갈까요? 고친 내용은 사라져요",
  saveAndLeave: "저장하기",
  leave: "나가기",
  photoMenu: "사진 바꾸기",
  takePhoto: "사진 찍기",
  pickPhoto: "앨범에서 고르기",
  removePhoto: "사진 지우기",
  photoRejected: "이 사진은 올릴 수 없어요. 다른 사진을 골라 주세요.",
  signedOut: "로그인하면 내 프로필을 고칠 수 있어요.",
  login: "로그인하기",
} as const;

/** 사진 칸: 그대로 / 새로 고름(올린 경로는 이 선택에만 묶어 보관) / 지움 */
type Photo =
  | { kind: "keep" }
  | { kind: "new"; uri: string; path: string | null }
  | { kind: "remove" };
type FieldErrors = { nickname?: string; bio?: string; photo?: string };

export function ProfileEditScreen(): React.JSX.Element {
  const { status, userId } = useAuth();
  if (status === "loading") return <View style={styles.screen} testID="profile-edit-loading" />;
  if (status !== "signedIn" || !userId) return <SignedOut />;
  // 계정이 바뀌면 고치던 내용·진행 중 요청을 모두 버리고 새로 연다(MY-1 Y7 계정 격리)
  return <Editor key={userId} userId={userId} />;
}

function Header({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={EDIT_TEXT.back}
        onPress={onBack}
        hitSlop={8}
        style={styles.back}
        testID="profile-edit-back"
      >
        <BackChevron color={C.inkStrong} />
      </Pressable>
      <View style={styles.title}>
        <HeaderTitle label="PROFILE" title={EDIT_TEXT.title} />
      </View>
    </View>
  );
}

function useLeave() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace("/me");
  }, [router]);
}

function SignedOut() {
  const router = useRouter();
  const leave = useLeave();
  return (
    <View style={styles.screen} testID="profile-edit-signed-out">
      <Header onBack={leave} />
      <View style={styles.center}>
        <Text style={styles.centerText}>{EDIT_TEXT.signedOut}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
        >
          <Text style={styles.primaryText} numberOfLines={1}>{EDIT_TEXT.login}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function photoRejected(e: unknown): boolean {
  return e instanceof ApiCallError && (e.status === 413 || (e.status === 422 && e.detail === "file"));
}

function Editor({ userId }: { userId: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const leaveScreen = useLeave();
  const insets = useSafeAreaInsets();

  const [original, setOriginal] = useState<MyProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhotoState] = useState<Photo>({ kind: "keep" });
  const photoRef = useRef<Photo>({ kind: "keep" });
  const setPhoto = (p: Photo) => {
    photoRef.current = p;
    setPhotoState(p);
  };
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const alive = useRef(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; // 이 화면·계정을 떠난 뒤 끝난 응답은 반영하지 않는다
    };
  }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const p = await fetchMyProfile();
      if (!alive.current) return;
      setOriginal(p);
      setNickname(p.nickname);
      setBio(p.bio ?? "");
    } catch {
      if (alive.current) setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = original !== null && (
    nickname !== original.nickname || bio !== (original.bio ?? "") || photo.kind !== "keep"
  );
  const disablePrevention = usePreventRemove(!leaving && (dirty || saving), () => {
    if (!savingRef.current) setConfirmDiscard(true);
  });

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  function allowLeave() {
    setLeaving(true);
    disablePrevention();
  }

  function leave() {
    allowLeave();
    leaveScreen();
  }

  const onBack = () => {
    if (savingRef.current) return;
    if (dirty) setConfirmDiscard(true);
    else leave();
  };

  const shownAvatar =
    photo.kind === "new" ? photo.uri : photo.kind === "remove" ? null : original?.avatar_url ?? null;

  async function choose(source: PickSource) {
    setMenuOpen(false);
    try {
      const picked = await pickPostImage(source);
      if (!picked || !alive.current || savingRef.current) return;
      setPhoto({ kind: "new", uri: picked.uri, path: null });
      setErrors((e) => ({ ...e, photo: undefined }));
    } catch {
      if (alive.current && !savingRef.current) setErrors((e) => ({ ...e, photo: EDIT_TEXT.photoRejected }));
    }
  }

  function removePhoto() {
    setMenuOpen(false);
    setPhoto({ kind: "remove" });
    setErrors((e) => ({ ...e, photo: undefined }));
  }

  async function save() {
    if (savingRef.current || !original) return; // 연타 막기(예외 #3)
    const nick = nickname.trim();
    if (nickname !== original.nickname && nick.length === 0) {
      setErrors((e) => ({ ...e, nickname: EDIT_TEXT.nicknameEmpty })); // 예외 #6, 호출 없음
      return;
    }
    const patch: ProfilePatch = {};
    if (nickname !== original.nickname && nick !== original.nickname) patch.nickname = nick;
    const nextBio = bio.trim() || null; // 공백만이면 null(Y2-3)
    if (bio !== (original.bio ?? "") && nextBio !== original.bio) patch.bio = nextBio;
    const chosen = photoRef.current;
    if (chosen.kind === "remove" && original.avatar_url !== null) patch.avatar_path = null;
    const needsPhoto = chosen.kind === "new";
    if (Object.keys(patch).length === 0 && !needsPhoto) {
      leave(); // 아무것도 안 고침: 부르지 않고 닫는다(예외 #2)
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setMenuOpen(false);
    setConfirmDiscard(false);
    setFailed(false);
    setErrors({});
    try {
      if (chosen.kind === "new") {
        let path = chosen.path;
        if (path === null) {
          try {
            path = (await uploadAvatar({ uri: chosen.uri, mime: "image/jpeg" })).avatar_path;
          } catch (e) {
            if (!alive.current) return;
            if (photoRejected(e)) setErrors({ photo: EDIT_TEXT.photoRejected }); // 예외 #5
            else setFailed(true);
            return;
          }
          if (!alive.current) return; // 앞 계정의 늦은 #39 뒤에 #38을 잇지 않는다
          if (photoRef.current === chosen) {
            const kept: Photo = { ...chosen, path }; // 같은 선택으로 다시 저장하면 이 경로를 다시 쓴다
            setPhoto(kept);
          }
        }
        patch.avatar_path = path;
      }
      let saved: MyProfile;
      try {
        saved = await updateMyProfile(patch);
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof ApiCallError && e.code === "ACCOUNT_WITHDRAWN") {
          allowLeave();
          router.replace("/login"); // C6 탈퇴 경합
          return;
        }
        if (e instanceof ApiCallError && e.status === 422 && e.detail === "nickname") {
          setErrors({ nickname: EDIT_TEXT.nicknameEmpty });
        } else if (e instanceof ApiCallError && e.status === 422 && e.detail === "bio") {
          setErrors({ bio: EDIT_TEXT.bioTooLong });
        } else if (e instanceof ApiCallError && e.status === 422 && e.detail === "avatar_path") {
          if (photoRef.current.kind === "new") setPhoto({ ...photoRef.current, path: null }); // 받은 경로를 버리고 다시 올린다
          setErrors({ photo: EDIT_TEXT.photoRejected });
        } else {
          setFailed(true); // 끊김·결과 불명: 입력값 그대로, 같은 칸·경로로 다시 저장(Y2-5)
        }
        return;
      }
      if (!alive.current) return; // 늦은 #38은 다른 계정 머리·토스트에 반영하지 않는다
      emitProfileSaved(userId, saved);
      leave();
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }

  if (!original) {
    return (
      <View style={styles.screen}>
        <Header onBack={leave} />
        {loadFailed ? (
          <View style={styles.center} testID="profile-edit-error">
            <Text style={styles.centerText}>{MY_TEXT.profileFailed}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText} numberOfLines={1}>{MY_TEXT.reload}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.center} testID="profile-edit-loading" />
        )}
      </View>
    );
  }

  const canRemove = shownAvatar !== null;
  const buttonText = saving ? EDIT_TEXT.saving : failed ? EDIT_TEXT.resave : EDIT_TEXT.save;

  return (
    <View style={styles.screen} testID="profile-edit">
      <Header onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.photoRow}>
          <View style={styles.photoWrap}>
            {shownAvatar ? (
              <Image source={{ uri: shownAvatar }} style={styles.avatar} accessibilityLabel="프로필 사진" />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]} accessibilityLabel="기본 프로필 사진">
                <UserIcon size={30} color={C.inkSoft} />
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={EDIT_TEXT.photoMenu}
              disabled={saving}
              onPress={() => setMenuOpen((o) => !o)}
              style={({ pressed }) => [styles.pencil, pressed && ACT.secondaryPressed]}
              testID="photo-pencil"
            >
              <Text style={styles.pencilText}>✎</Text>
            </Pressable>
            {menuOpen ? (
              <View style={styles.menu} testID="photo-menu">
                {canUseCamera() ? <MenuItem label={EDIT_TEXT.takePhoto} onPress={() => void choose("camera")} /> : null}
                <MenuItem label={EDIT_TEXT.pickPhoto} onPress={() => void choose("library")} />
                {canRemove ? <MenuItem label={EDIT_TEXT.removePhoto} onPress={removePhoto} /> : null}
              </View>
            ) : null}
          </View>
          {errors.photo ? <Text style={styles.fieldError}>{errors.photo}</Text> : null}
        </View>

        <Text style={styles.label}>{EDIT_TEXT.nickname}</Text>
        <TextInput
          editable={!saving}
          value={nickname}
          onChangeText={(t) => {
            setNickname(t);
            if (errors.nickname) setErrors((e) => ({ ...e, nickname: undefined }));
          }}
          maxLength={NICKNAME_MAX}
          style={styles.input}
          accessibilityLabel={EDIT_TEXT.nickname}
          testID="nickname-input"
        />
        <View style={styles.fieldFoot}>
          <Text style={styles.fieldError}>{errors.nickname ?? ""}</Text>
          <Text style={styles.count}>{`${nickname.length}/${NICKNAME_MAX}`}</Text>
        </View>

        <Text style={styles.label}>{EDIT_TEXT.bio}</Text>
        <TextInput
          editable={!saving}
          value={bio}
          onChangeText={(t) => {
            setBio(t);
            if (errors.bio) setErrors((e) => ({ ...e, bio: undefined }));
          }}
          maxLength={BIO_MAX}
          placeholder={EDIT_TEXT.bioPlaceholder}
          placeholderTextColor={C.textSub}
          style={styles.input}
          accessibilityLabel={EDIT_TEXT.bio}
          testID="bio-input"
        />
        <View style={styles.fieldFoot}>
          <Text style={styles.fieldError}>{errors.bio ?? ""}</Text>
          <Text style={styles.count}>{`${bio.length}/${BIO_MAX}`}</Text>
        </View>

        {failed ? (
          <View style={styles.failCard} accessibilityRole="alert" testID="save-failed">
            <Text style={styles.failTitle}>{EDIT_TEXT.saveFailed}</Text>
            <Text style={styles.failSub}>{EDIT_TEXT.saveFailedSub}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          onPress={() => void save()}
          style={({ pressed }) => [styles.primary, styles.saveButton, saving && styles.dim, pressed && !saving && ACT.primaryPressed]}
          testID="profile-save"
        >
          <Text style={styles.primaryText} numberOfLines={1}>{buttonText}</Text>
        </Pressable>
      </View>

      {confirmDiscard ? (
        <DiscardDialog
          onSave={() => {
            setConfirmDiscard(false);
            void save(); // 성공하면 내 정보로, 실패·입력 오류면 이 화면에 남아 안내(Y2-5)
          }}
          onDiscard={() => {
            setConfirmDiscard(false);
            leave();
          }}
        />
      ) : null}
    </View>
  );
}

/** Y2-O3 나가기 확인 — [저장하기]는 "저장"과 같은 흐름, [나가기]는 저장 없이 닫기(2026-11-23 사용자 변경) */
function DiscardDialog({ onSave, onDiscard }: { onSave: () => void; onDiscard: () => void }) {
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={styles.dialog} accessibilityRole="alert">
        <Text style={styles.dialogTitle}>{EDIT_TEXT.discardTitle}</Text>
        <View style={styles.dialogRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onSave}
            style={({ pressed }) => [styles.dialogButton, ACT.secondary, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryText}>{EDIT_TEXT.saveAndLeave}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDiscard}
            style={({ pressed }) => [styles.dialogButton, ACT.primary, pressed && ACT.primaryPressed]}
          >
            <Text style={[styles.primaryText, styles.dangerText]}>{EDIT_TEXT.leave}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && ACT.secondaryPressed]}
    >
      <Text style={styles.menuText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.panelFrosted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.seamHairline,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 26, lineHeight: 28, color: C.inkStrong },
  title: { ...typeScale.title, flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  centerText: { fontSize: 15, color: C.inkStrong, textAlign: "center" },
  body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  photoRow: { alignItems: "center", gap: 8, marginBottom: 20, zIndex: 2 },
  photoWrap: { width: AVATAR, height: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: "50%" }, // 원 모양만 50%(ProfileHeader와 같은 예외)
  avatarEmpty: {
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    alignItems: "center",
    justifyContent: "center",
  },
  pencil: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  pencilText: { fontSize: 14, color: C.inkStrong },
  menu: {
    position: "absolute",
    left: AVATAR + 12,
    top: 0,
    minWidth: 150,
    paddingVertical: 4,
    ...cardSurface(theme, { onPanel: true }),
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  menuText: { fontSize: 14, color: C.inkStrong },
  label: { fontSize: 13, fontWeight: "500", color: C.inkStrong, marginBottom: 6 },
  input: {
    height: 46,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.inkStrong,
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.control,
  },
  fieldFoot: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 4, marginBottom: 14 },
  fieldError: { flex: 1, fontSize: 12, color: C.inkStrong },
  count: { fontSize: 12, color: C.textSub },
  failCard: { padding: 14, gap: 4, ...cardSurface(theme, { onPanel: true }) },
  failTitle: { fontSize: 14, fontWeight: "500", color: C.inkStrong },
  failSub: { fontSize: 13, color: C.textSub },
  footer: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderColor: C.seamHairline },
  primary: {
    height: 48,
    paddingHorizontal: 28,
    borderRadius: theme.radii.control,
    ...ACT.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: { alignSelf: "stretch" },
  primaryText: { fontSize: 15, fontWeight: "500", ...ACT.primaryText },
  dim: { opacity: 0.5 },
  secondary: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  secondaryText: { fontSize: 13, fontWeight: "500", ...ACT.secondaryText },
  scrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    backgroundColor: C.shadowDeep,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: { ...cardSurface(theme, { onPanel: true }), padding: 18, gap: 8, width: "100%", maxWidth: 360 },
  dialogTitle: { fontSize: 16, fontWeight: "500", color: C.inkStrong },
  dialogRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 6 },
  dialogButton: { borderRadius: theme.radii.control, minHeight: 40, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  dangerText: { color: C.loanOut },
});
