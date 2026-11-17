// VISIT-2 방문 페이지 경로 `/libraries/[libraryId]?distanceM=` (core K15, local-feed VISIT-2)
import { Stack, useLocalSearchParams } from "expo-router";
import { VisitScreen } from "../../src/features/local-feed/VisitScreen";
import { parseDistanceM, parseLibraryId } from "../../src/features/local-feed/VisitHeader";
import { theme } from "../../src/theme";

export default function LibraryVisitScreen() {
  const params = useLocalSearchParams<{
    libraryId?: string | string[];
    distanceM?: string | string[];
  }>();
  return (
    <>
      {/* 오른쪽에서 밀려 들어오는 기본 전환, 왼쪽 끝 밀어 돌아가기(G14, C4) */}
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: theme.colors.cream } }}
      />
      <VisitScreen libraryId={parseLibraryId(params.libraryId)} distanceM={parseDistanceM(params.distanceM)} />
    </>
  );
}
