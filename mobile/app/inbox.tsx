// 알림함 `/inbox` (book-club CLUB-2 C2, 서버 D core M2-0-P1)
import { Stack } from "expo-router";
import { InboxScreen } from "../src/features/book-club/InboxScreen";
import { panel } from "../src/theme";

export default function InboxRoute() {
  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: panel.backgroundColor } }}
      />
      <InboxScreen />
    </>
  );
}
