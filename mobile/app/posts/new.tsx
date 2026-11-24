// LOCAL-1-P2 글쓰기 경로 `/posts/new?libraryId=&isbn13=` (core K15, local-feed LOCAL-1)
import { useLocalSearchParams } from "expo-router";
import { ComposeScreen } from "../../src/features/local-feed/ComposeScreen";

function firstString(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw : "";
}

export default function NewPostScreen() {
  const params = useLocalSearchParams<{
    libraryId?: string | string[];
    isbn13?: string | string[];
    fromLog?: string | string[];
  }>();
  const raw = firstString(params.libraryId);
  const libraryId = /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
  const isbn13 = firstString(params.isbn13) || null;
  return <ComposeScreen libraryId={libraryId} isbn13={isbn13} fromLog={firstString(params.fromLog) || undefined} />;
}
