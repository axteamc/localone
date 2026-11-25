// 내 정보 위쪽: 왼쪽 사진·옆에 이름·소개·"프로필 수정". 종·설정은 2026-11-25 C-90에 탭 머리 오른쪽(MeHeaderActions)으로 옮겼다
// (이전: 프로필 줄 오른쪽 — "프로필 수정"과 같은 자리라 헷갈림) — contracts/my-collection.md MY-1 Y5·Y-O1, 시안 정할 것 1 후보 A.
// 팔로워 수·팔로잉 목록·팔로우 버튼은 두지 않는다(Y5, MY-2 Y2-6). 설정 버튼 바로 왼쪽에 같은 크기 알림 종(MY-2 Y2-O5).
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { actionColors, theme, type as typeScale } from "../../theme";
import { SettingsIcon, UserIcon } from "../../theme/Icons";
import { InboxBell } from "./InboxBell";
import { MY_TEXT, type ProfileState } from "./useMyCollection";

const C = theme.colors;
const ACT = actionColors(C);
const AVATAR = 64;

export type ProfileHeaderProps = {
  state: ProfileState;
  onEdit(): void;
  onRetry(): void;
};

function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={MY_TEXT.settings}
      onPress={onPress}
      style={({ pressed }) => [styles.gear, pressed && ACT.secondaryPressed]}
    >
      <SettingsIcon size={17} color={C.inkStrong} />
    </Pressable>
  );
}

/** "MY" 탭 머리 오른쪽: 종 → 설정 순서(Y2-O5). app/(tabs)/_layout.tsx의 headerRight */
export function MeHeaderActions() {
  const router = useRouter();
  return (
    <View style={styles.actions} testID="profile-actions">
      <InboxBell />
      <SettingsButton onPress={() => router.push("/settings")} />
    </View>
  );
}

export function ProfileHeader({ state, onEdit, onRetry }: ProfileHeaderProps) {
  return (
    <View style={styles.wrap}>
      {state.kind === "loading" ? (
        <View style={styles.topRow} testID="profile-skeleton">
          <View style={styles.rowMain}>
            <View style={[styles.avatar, styles.skeleton]} />
            <View style={styles.info}>
              <View style={[styles.lineLong, styles.skeleton]} />
              <View style={[styles.lineShort, styles.skeleton]} />
            </View>
          </View>
        </View>
      ) : state.kind === "error" ? (
        <View style={styles.errorRow} testID="profile-error">
          <Text style={styles.errorText}>{MY_TEXT.profileFailed}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.reload, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.reloadText} numberOfLines={1}>{MY_TEXT.reload}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.topRow} testID="profile-row">
          <View style={styles.rowMain}>
            {state.profile.avatar_url ? (
              <Image source={{ uri: state.profile.avatar_url }} style={styles.avatar} accessibilityLabel="프로필 사진" />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]} accessibilityLabel="기본 프로필 사진">
                <UserIcon size={26} color={C.inkSoft} />
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.gauge} numberOfLines={1}>MEMBER · PROFILE</Text>
              <Text style={styles.nickname} numberOfLines={1}>
                {state.profile.nickname}
              </Text>
              {state.profile.bio !== null ? (
                <Text style={styles.bio} numberOfLines={2} testID="profile-bio">
                  {state.profile.bio}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={onEdit}
                style={({ pressed }) => [styles.edit, pressed && ACT.secondaryPressed]}
              >
                <Text style={styles.editText} numberOfLines={1}>{MY_TEXT.editProfile}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, backgroundColor: C.panelFrosted },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 14 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginEnd: 12 },
  gear: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: "50%" }, // 원 모양만 50%(LibraryAvailabilityCard 점과 같은 예외)
  avatarEmpty: {
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, minWidth: 0, gap: 4, alignItems: "flex-start" },
  gauge: { ...typeScale.gauge },
  nickname: { ...typeScale.title },
  bio: { fontSize: 13, color: C.textSub },
  edit: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  editText: { fontSize: 13, fontWeight: "500", ...ACT.secondaryText },
  skeleton: { backgroundColor: C.surface2 },
  lineLong: { width: "55%", height: 14, borderRadius: theme.radii.infoCard },
  lineShort: { width: "35%", height: 12, borderRadius: theme.radii.infoCard },
  errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: AVATAR },
  errorText: { flex: 1, fontSize: 14, color: C.textSub },
  reload: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  reloadText: { fontSize: 13, fontWeight: "500", ...ACT.secondaryText },
});
