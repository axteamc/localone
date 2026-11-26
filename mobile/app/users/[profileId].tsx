// 남의 공개 프로필 경로 `/users/[profileId]` (contracts/my-collection.md MY-4, C-97). 화면은 user-profile 기능 폴더에 있다.
import { Stack, useLocalSearchParams } from "expo-router";
import { UserProfileScreen } from "../../src/features/user-profile/UserProfileScreen";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : "";
}

export default function UserProfileRoute() {
  const params = useLocalSearchParams<{ profileId?: string | string[] }>();
  const profileId = firstString(params.profileId);
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <UserProfileScreen key={profileId} profileId={profileId} />
    </>
  );
}
