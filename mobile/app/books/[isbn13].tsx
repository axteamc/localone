// `/books/[isbn13]` 책 상세(core.md APP-0 C2, book-search.md LIB-1 B5)
// 선택 값 `lookup=1`: 도서관 확인 창을 바로 연다. `library=<id>`: 그 창 맨 위에 둘 도서관(SNS 도서 카드, C-87).
import { useLocalSearchParams } from "expo-router";
import { BookDetailScreen } from "../../src/features/book-search/BookDetailScreen";

export default function BookDetail() {
  const { isbn13, lookup, library } = useLocalSearchParams<{ isbn13: string; lookup?: string; library?: string }>();
  const pin = typeof library === "string" && /^[1-9]\d{0,15}$/.test(library) ? Number(library) : null;
  return (
    <BookDetailScreen
      isbn13={typeof isbn13 === "string" ? isbn13 : ""}
      openLookup={lookup === "1"}
      pinLibraryId={pin}
    />
  );
}
