import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";
import { theme } from "../src/theme";
// ── [loan-assistant-C] ──
import { subscribeNotificationTap } from "../src/features/loan-assistant/notifications.platform";
// ── [/loan-assistant-C] ──

export default function RootLayout() {
  // ── [loan-assistant-C] ── 반납 알림을 누르면 대출·반납 탭으로(LOAN-3 T8)
  const router = useRouter();
  useEffect(() => subscribeNotificationTap(() => router.push("/loans")), [router]);
  // ── [/loan-assistant-C] ──
  return (
    <AuthProvider>
      {/* 머리 띠는 탭 화면과 같은 cream(순백 금지, 2026-11-18 S4 기본값) */}
      <Stack screenOptions={{ title: "동네한권", headerStyle: { backgroundColor: theme.colors.cream } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "" }} />
      </Stack>
    </AuthProvider>
  );
}
