import { Stack } from "expo-router";
import { AuthProvider } from "../src/auth/AuthProvider";
import { theme } from "../src/theme";

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* 머리 띠는 탭 화면과 같은 cream(순백 금지, 2026-11-18 S4 기본값) */}
      <Stack screenOptions={{ title: "동네한권", headerStyle: { backgroundColor: theme.colors.cream } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "" }} />
        <Stack.Screen name="settings" options={{ title: "설정" }} />
      </Stack>
    </AuthProvider>
  );
}
