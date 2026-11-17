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
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="loans" options={{ title: "대출·반납" }} />
      <Tabs.Screen name="me" options={{ title: "내 정보" }} />
    </Tabs>
  );
}
