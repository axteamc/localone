// 게시물 상세 경로 `/posts/[postId]?libraryId=` (core K15, local-feed LOCAL-2 H14)
import { Stack, useLocalSearchParams } from "expo-router";
import { PostDetail } from "../../src/features/local-feed/PostDetail";
import { theme } from "../../src/theme";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : "";
}

/** 방문 중인 도서관 번호(양의 정수만) */
function parseVisitLibraryId(raw: string | string[] | undefined): number | null {
  const value = firstString(raw);
  return /^[1-9][0-9]{0,15}$/.test(value) ? Number(value) : null;
}

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[]; libraryId?: string | string[] }>();
  const postId = firstString(params.postId);
  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: theme.colors.cream } }}
      />
      <PostDetail key={postId} postId={postId} visitLibraryId={parseVisitLibraryId(params.libraryId)} />
    </>
  );
}
