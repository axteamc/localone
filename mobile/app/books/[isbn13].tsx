// `/books/[isbn13]` 책 상세(core.md APP-0 C2, book-search.md LIB-1 B5)
import { useLocalSearchParams } from "expo-router";
import { BookDetailScreen } from "../../src/features/book-search/BookDetailScreen";

export default function BookDetail() {
  const { isbn13 } = useLocalSearchParams<{ isbn13: string }>();
  return <BookDetailScreen isbn13={typeof isbn13 === "string" ? isbn13 : ""} />;
}
