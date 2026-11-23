// 기록 쓰기 `/reading/new` (reading-log.md READ-1 R1-O1·R1-O2)
import { ReadingLogEditor } from "../../src/features/reading-log/ReadingLogEditor";

export default function NewReadingLogScreen() {
  return <ReadingLogEditor mode="new" />;
}
