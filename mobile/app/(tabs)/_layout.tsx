import { Tabs } from "expo-router";
import { theme } from "../../src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.cream },
        headerTintColor: theme.colors.text,
        tabBarActiveTintColor: theme.colors.inkStrong,
        tabBarInactiveTintColor: theme.colors.inkMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.cream,
          borderTopColor: theme.colors.divider,
        },
        // #128: 탭 아이콘은 아직 정하지 않았다. 아이콘을 주지 않으면 expo-router가
        // 대신 그리는 "⏷" 글자가 Android 기본 글꼴에 없어 네모로 깨진다.
        // 아이콘 자리를 없애고, 글자는 탭 칸 가운데(beside-icon 배치)에 둔다.
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
        tabBarLabelStyle: { marginStart: 0, marginEnd: 0 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="loans" options={{ title: "대출·반납" }} />
      <Tabs.Screen name="me" options={{ title: "내 정보" }} />
    </Tabs>
  );
}
