// 모임 만들기 `/clubs/new?libraryId=` · 고치기 `/clubs/new?clubId=` (book-club CLUB-1 C2·K1-O1·K1-O2)
import { Stack, useLocalSearchParams } from "expo-router";
import { ClubEditor } from "../../src/features/book-club/ClubEditor";
import { panel } from "../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : "";
}

export default function NewClubRoute() {
  const params = useLocalSearchParams<{ libraryId?: string | string[]; clubId?: string | string[] }>();
  const lib = firstString(params.libraryId);
  const clubId = firstString(params.clubId);
  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, presentation: "modal", contentStyle: { backgroundColor: panel.backgroundColor } }}
      />
      <ClubEditor libraryId={/^[1-9][0-9]{0,15}$/.test(lib) ? Number(lib) : null} clubId={clubId || null} />
    </>
  );
}
