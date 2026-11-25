import { Tabs } from "expo-router";
import { InboxBell } from "../../src/features/my-collection/InboxBell";
import { MeHeaderActions } from "../../src/features/my-collection/ProfileHeader";
import { StyleSheet, Text, View } from "react-native";
import { panel, theme } from "../../src/theme";
import { headerOptions } from "../../src/theme/HeaderLabel";

// 2026-11-18 D 결정: 머리 띠·탭 띠는 파사드와 같은 유리판 + 줄눈(A), 머리 띠 글자는 영어 표찰.
// 탭 칸 사이는 줄눈, 지금 탭은 위에 2px 진한 눈금. 탭 글자는 한글 그대로.
function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  return (
    <View style={styles.label}>
      <View style={[styles.tick, focused ? styles.tickOn : null]} />
      <Text style={[styles.text, focused ? styles.textOn : null]}>{children}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: panel.backgroundColor,
          borderTopColor: panel.borderColor,
          borderTopWidth: 1,
        },
        tabBarItemStyle: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: panel.borderColor },
        // #128: 탭 아이콘은 아직 정하지 않았다. 아이콘을 주지 않으면 expo-router가
        // 대신 그리는 "⏷" 글자가 Android 기본 글꼴에 없어 네모로 깨진다. 아이콘 자리를 없앤다.
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
        tabBarLabelStyle: { marginStart: 0, marginEnd: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "홈", ...headerOptions("HOME"), headerRight: () => <View style={styles.bell}><InboxBell /></View>, tabBarLabel: ({ focused }) => <TabLabel focused={focused}>홈</TabLabel> }}
      />
      <Tabs.Screen
        name="reading"
        options={{ title: "독서 기록", ...headerOptions("READING"), tabBarLabel: ({ focused }) => <TabLabel focused={focused}>독서 기록</TabLabel> }}
      />
      <Tabs.Screen
        name="loans"
        options={{ title: "대출·반납", ...headerOptions("LOANS"), tabBarLabel: ({ focused }) => <TabLabel focused={focused}>대출·반납</TabLabel> }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: "내 정보", ...headerOptions("MY"), headerRight: () => <MeHeaderActions />, tabBarLabel: ({ focused }) => <TabLabel focused={focused}>내 정보</TabLabel> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bell: { marginEnd: 12 },
  label: { alignItems: "center", justifyContent: "center", alignSelf: "stretch", flex: 1 },
  tick: { position: "absolute", top: 0, width: 28, height: 2, backgroundColor: "transparent" },
  tickOn: { backgroundColor: theme.colors.inkStrong },
  text: { fontSize: 12, color: theme.colors.inkMuted },
  textOn: { color: theme.colors.inkStrong, fontWeight: "500" },
});
