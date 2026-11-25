// 설정 화면(C-90, 시안 실기기개선_P2-P4 #el-settings 후보 A): 계정(로그아웃 AUTH-2·회원 탈퇴 AUTH-3 W4·W5) /
// 화면(처음 크게 보일 도서관 → 다음 화면, 다크 모드 준비 중) / 알림(반납 알림·모임 안내). 문구는 auth.md C3(기본값(Claude)).
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getHeroRule } from "../src/features/library-visit/heroPref";
import { HERO_MENU_TEXT } from "../src/features/library-visit/heroText";
import type { HeroRule } from "../src/features/library-visit/direction";
import { NotificationSettings } from "../src/features/settings/NotificationSettings";
import { useAccountActions, useAuth } from "../src/auth/AuthProvider";
import { actionColors, cardSurface, panel, theme, type as T } from "../src/theme";

import { writeRoughStart } from "../src/lib/roughStart";

function ClearRoughStart() {
  const [message, setMessage] = useState("");
  const clear = async () => {
    try {
      await writeRoughStart(null);
      setMessage("대략적인 위치를 지웠어요.");
    } catch {
      setMessage("위치를 지우지 못했어요. 다시 시도해 주세요.");
    }
  };
  return <View>
    <Pressable accessibilityRole="button" onPress={() => void clear()} style={styles.row}>
      <Text style={styles.rowText}>대략적인 위치 지우기</Text>
    </Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.rowText}>{message}</Text>}
  </View>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const { signOut, withdrawAccount } = useAccountActions();
  const [signingOut, setSigningOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const busy = signingOut || withdrawing;
  const [heroRule, setHeroRule] = useState<HeroRule | null>(null);
  // 다음 화면에서 고르고 돌아오면 값이 바뀌어 있게 화면에 올 때마다 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getHeroRule().then((r) => alive && setHeroRule(r));
      return () => {
        alive = false;
      };
    }, [])
  );

  const onSignOut = async () => {
    if (busy) return;
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/"); // G7: 끝나면 홈(로그인 안내가 잠깐 보이지 않게 이동 먼저)
    } finally {
      setSigningOut(false);
    }
  };

  const onWithdraw = async () => {
    if (busy) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const result = await withdrawAccount();
      if (result.ok) {
        router.replace("/"); // W5
        return;
      }
      setWithdrawError(result.errorMessage);
    } finally {
      setWithdrawing(false);
    }
  };

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  if (status !== "signedIn" && !busy) {
    return (
      <View style={styles.container}>
        <ClearRoughStart />
        <Text style={styles.notice}>로그인하면 설정을 볼 수 있어요</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.button, ACT.primary, pressed && ACT.primaryPressed]}
        >
          <Text style={[styles.buttonText, ACT.primaryText]}>로그인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
      {/* 시안 실기기개선_P2-P4 #el-settings 후보 A(C-90): 회색 소제목 + 묶음 목록, 고를 값은 오른쪽 값 + › → 다음 화면 */}
      <Text style={styles.groupTitle}>계정</Text>
      <View style={styles.group}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy: signingOut }}
          disabled={busy}
          onPress={() => {
            void onSignOut();
          }}
          style={({ pressed }) => [styles.row, styles.rowLine, pressed && !busy && styles.rowPressed]}
        >
          {signingOut ? (
            <ActivityIndicator accessibilityLabel="로그아웃하는 중" color={theme.colors.text} />
          ) : (
            <Text style={styles.rowText}>로그아웃</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, expanded: confirming }}
          disabled={busy}
          onPress={() => {
            setWithdrawError(null);
            setConfirming((v) => !v);
          }}
          style={({ pressed }) => [styles.row, pressed && !busy && styles.rowPressed]}
        >
          <Text style={styles.rowText}>회원 탈퇴</Text>
          <Text style={styles.rowValue}>{confirming ? "⌃" : "›"}</Text>
        </Pressable>
      </View>
      {confirming && (
        <View style={styles.confirm} testID="withdraw-confirm">
          <Text style={styles.confirmTitle}>정말 탈퇴할까요?</Text>
          <Text style={styles.confirmBody}>
            빌릴 예정, 좋아요, 북마크가 지워지고 내가 올린 글은 더 이상 보이지 않아요. 같은 계정으로 다시 가입할 수 없고 되돌릴 수 없어요.
          </Text>
          {withdrawError !== null && <Text style={styles.error}>{withdrawError}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy: withdrawing }}
            disabled={busy}
            onPress={() => {
              void onWithdraw();
            }}
            style={({ pressed }) => [styles.button, ACT.primary, pressed && !busy && ACT.primaryPressed]}
          >
            {withdrawing ? (
              <ActivityIndicator accessibilityLabel="탈퇴하는 중" color={ACT.primaryText.color} />
            ) : (
              <Text style={[styles.buttonText, ACT.primaryText]}>탈퇴하기</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => {
              setConfirming(false);
              setWithdrawError(null);
            }}
            style={({ pressed }) => [styles.button, ACT.secondary, pressed && !busy && ACT.secondaryPressed]}
          >
            <Text style={[styles.buttonText, ACT.secondaryText]}>취소</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.groupTitle}>화면</Text>
      <View style={styles.group}>
        <Pressable
          accessibilityRole="button"
          testID="settings-first-library"
          onPress={() => router.push("/settings-first-library")}
          style={({ pressed }) => [styles.row, styles.rowLine, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowText}>{HERO_MENU_TEXT.menuTitle}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {heroRule === null ? "" : `${heroRule === "recent" ? HERO_MENU_TEXT.recent : HERO_MENU_TEXT.nearest} ›`}
          </Text>
        </Pressable>
        <ClearRoughStart />
        <View style={styles.row} testID="settings-dark-mode">
          <Text style={[styles.rowText, styles.dim]}>다크 모드</Text>
          <Text style={styles.rowValue}>준비 중</Text>
        </View>
      </View>

      <Text style={styles.groupTitle}>알림</Text>
      <View style={styles.group}>
        <NotificationSettings />
      </View>
    </ScrollView>
  );
}

const ACT = actionColors(theme.colors);
const c = theme.colors;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: panel.backgroundColor },
  list: { padding: 16, paddingBottom: 40 },
  // 시안 값: 소제목 12 textSub, 줄 높이 48, 묶음 곡률 9
  groupTitle: { fontSize: 12, color: c.textSub, marginTop: 18, marginBottom: 6, marginHorizontal: 4 },
  group: { ...cardSurface(theme, { onPanel: true }), paddingVertical: 0, overflow: "hidden" },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.seamHairline },
  rowPressed: { backgroundColor: c.surface2 },
  rowText: { fontSize: 15, color: c.text, flexShrink: 1 },
  rowValue: { fontSize: 14, color: c.textSub, flexShrink: 1 },
  dim: { color: c.textSub },
  container: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: panel.backgroundColor,
  },
  notice: {
    ...T.title,
    textAlign: "center",
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radii.control,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  confirm: {
    ...cardSurface(theme, { onPanel: true }),
    gap: 10,
    padding: 16,
    marginTop: 8,
  },
  confirmTitle: {
    ...T.title,
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSub,
  },
  error: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
  },
});
