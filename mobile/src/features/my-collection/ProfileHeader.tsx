// 내 정보 위쪽: 제목 줄(⚙) + 왼쪽 사진·옆에 이름·소개·"프로필 수정" — contracts/my-collection.md MY-1 Y5·Y-O1, 시안 정할 것 1 후보 A.
// 팔로워 수·팔로잉 목록·팔로우 버튼은 두지 않는다(Y5).
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { actionColors, theme, type as typeScale } from "../../theme";
import { MY_TEXT, type ProfileState } from "./useMyCollection";

const C = theme.colors;
const ACT = actionColors(C);
const AVATAR = 64;

export type ProfileHeaderProps = {
  state: ProfileState;
  onEdit(): void;
  onRetry(): void;
  onSettings(): void;
};

export function ProfileHeader({ state, onEdit, onRetry, onSettings }: ProfileHeaderProps) {
  return (
    <View style={styles.wrap}>
      {/* 제목 "내 정보"는 탭 머리 띠가 이미 보여 준다(구현 중 변경: 두 번 보이지 않게). ⚙만 오른쪽 위에 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={MY_TEXT.settings}
        onPress={onSettings}
        style={({ pressed }) => [styles.gear, pressed && ACT.secondaryPressed]}
      >
        <Text style={styles.gearText}>⚙</Text>
      </Pressable>
      {state.kind === "loading" ? (
        <View style={styles.row} testID="profile-skeleton">
          <View style={[styles.avatar, styles.skeleton]} />
          <View style={styles.info}>
            <View style={[styles.lineLong, styles.skeleton]} />
            <View style={[styles.lineShort, styles.skeleton]} />
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
        <View style={styles.row} testID="profile-row">
          {state.profile.avatar_url ? (
            <Image source={{ uri: state.profile.avatar_url }} style={styles.avatar} accessibilityLabel="프로필 사진" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]} accessibilityLabel="기본 프로필 사진">
              <Text style={styles.avatarIcon}>👤</Text>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, backgroundColor: C.panelFrosted },
  gear: {
    position: "absolute",
    top: 10,
    right: 12,
    zIndex: 1,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  gearText: { fontSize: 15, ...ACT.secondaryText },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingRight: 34 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: "50%" }, // 원 모양만 50%(LibraryAvailabilityCard 점과 같은 예외)
  avatarEmpty: {
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarIcon: { fontSize: 28, color: C.textSub },
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
  errorRow: { paddingRight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: AVATAR },
  errorText: { flex: 1, fontSize: 14, color: C.textSub },
  reload: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...ACT.secondary,
    borderRadius: theme.radii.control,
  },
  reloadText: { fontSize: 13, fontWeight: "500", ...ACT.secondaryText },
});
