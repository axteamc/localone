// 기록 화면 `/reading/[logId]` (reading-log.md READ-1 R1-O4)
import { useLocalSearchParams } from "expo-router";
import { ReadingLogDetail } from "../../src/features/reading-log/ReadingLogDetail";

export default function ReadingLogDetailScreen() {
  const params = useLocalSearchParams<{ logId?: string | string[]; edit?: string | string[] }>();
  const logId = typeof params.logId === "string" ? params.logId : "";
  const initialEdit = params.edit === "1";
  return <ReadingLogDetail key={`${logId}-${initialEdit ? "edit" : "view"}`} logId={logId} initialEdit={initialEdit} />;
}
