import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";
import { headerOptions } from "../src/theme/HeaderLabel";
import { WebFrame } from "../src/theme/WebFrame";
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
      {/* 넓은 웹 화면은 폭 480 칼럼(2026-11-18 D 결정). 머리 띠는 파사드와 같은 유리판 + 영어 표찰 */}
      <WebFrame>
        <Stack screenOptions={{ title: "동네한권", ...headerOptions("LOCALONE") }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: "설정", ...headerOptions("SETTINGS") }} />
          <Stack.Screen name="search" options={headerOptions("SEARCH")} />
          <Stack.Screen name="books/[isbn13]" options={headerOptions("BOOK")} />
          <Stack.Screen name="posts/new" options={{ ...headerOptions("POST"), headerBackVisible: false }} />
        </Stack>
      </WebFrame>
    </AuthProvider>
  );
}
