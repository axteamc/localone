// 모임 기록 화면 `/clubs/[clubId]/record` (book-club CLUB-2 C2)
import { Stack, useLocalSearchParams } from "expo-router";
import { ClubRecordScreen } from "../../../src/features/book-club/ClubRecordScreen";
import { panel } from "../../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : "";
}

export default function ClubRecordRoute() {
  const params = useLocalSearchParams<{ clubId?: string | string[] }>();
  const clubId = firstString(params.clubId);
  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: panel.backgroundColor } }}
      />
      <ClubRecordScreen key={clubId} clubId={clubId} />
    </>
  );
}
