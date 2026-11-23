// 모임 화면 `/clubs/[clubId]` (book-club CLUB-1 C2)
import { Stack, useLocalSearchParams } from "expo-router";
import { ClubScreen } from "../../src/features/book-club/ClubScreen";
import { panel } from "../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : "";
}

export default function ClubRoute() {
  const params = useLocalSearchParams<{ clubId?: string | string[] }>();
  const clubId = firstString(params.clubId);
  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: panel.backgroundColor } }}
      />
      <ClubScreen key={clubId} clubId={clubId} />
    </>
  );
}
