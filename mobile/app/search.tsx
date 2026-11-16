// `/search` 책 검색(core.md APP-0 C2, book-search.md LIB-1 B1). 쿼리 `q`를 받으면 그 검색어로 바로 결과를 보인다.
// `libraryId`는 M1에서 쓰지 않는다(VISIT_LOCAL_D결정 결정 10 영향).
import { Stack, useLocalSearchParams } from "expo-router";
import { SearchScreen } from "../src/features/book-search/SearchScreen";

export default function Search() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const initial = typeof q === "string" && q.trim() ? q : undefined;
  return (
    <>
      <Stack.Screen options={{ title: "책 검색" }} />
      <SearchScreen initialQuery={initial} />
    </>
  );
}
