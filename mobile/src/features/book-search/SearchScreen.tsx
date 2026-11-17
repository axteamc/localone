// 책 검색 화면: 검색창 → (입력 전) 진입 화면 / (입력 중) 추천 / (검색 뒤) 결과
// book-search.md LIB-1 B1·B3·B6·B7·B8·B11·B13, S-1~S-3·S-5·S-7·S-8·S-12
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { Book } from "../../lib/publicApi";
import { theme } from "../../theme";
import { SearchEntry } from "./SearchEntry";
import {
  QUERY_MAX_CHARS,
  normalizeQuery,
  useBookSearch,
  useSearchSuggestions,
} from "./useBookSearch";

export const SEARCH_FAILED = "지금은 책을 찾을 수 없어요. 잠시 후 다시 해 주세요.";

/** 책 상세로 한 번만 간다. 이동이 끝나 이 화면을 떠났다 돌아올 때까지 다시 누름은 무시한다(B13·S-8). */
export function useOpenBookOnce(): (isbn13: string) => void {
  const router = useRouter();
  const locked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
    }, [])
  );
  return useCallback(
    (isbn13: string) => {
      if (locked.current) return;
      locked.current = true;
      router.push({ pathname: "/books/[isbn13]", params: { isbn13 } });
    },
    [router]
  );
}

/** 표지. 주소가 없거나 깨지면 글자 표지(surface3 바탕 + inkSoft 글자, B5). */
export function BookCover({
  book,
  style,
  fontSize = 12,
}: {
  book: Pick<Book, "title" | "cover_url">;
  style?: StyleProp<ViewStyle>;
  fontSize?: number;
}) {
  const [broken, setBroken] = useState(false);
  const [topLeft, topRight, bottomRight, bottomLeft] = theme.radii.bookCover;
  const shape = {
    borderTopLeftRadius: topLeft,
    borderTopRightRadius: topRight,
    borderBottomRightRadius: bottomRight,
    borderBottomLeftRadius: bottomLeft,
    overflow: "hidden" as const,
  };
  if (book.cover_url && !broken) {
    return (
      <View style={[shape, style]}>
        <Image
          source={{ uri: book.cover_url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setBroken(true)}
        />
      </View>
    );
  }
  return (
    <View testID="text-cover" style={[shape, styles.textCover, style]}>
      <Text style={[styles.textCoverText, { fontSize }]} numberOfLines={4}>
        {book.title}
      </Text>
    </View>
  );
}

function publisherLine(b: Book): string {
  return [b.publisher, b.pub_year === null ? null : String(b.pub_year)]
    .filter((v): v is string => !!v)
    .join(" · ");
}

export function SearchScreen({ initialQuery }: { initialQuery?: string }) {
  const search = useBookSearch(initialQuery);
  const [input, setInput] = useState(initialQuery ?? "");
  const [editing, setEditing] = useState(!initialQuery);
  const [view, setView] = useState<"grid" | "list">("grid"); // 기억하지 않는다(B11)
  const suggest = useSearchSuggestions(editing ? input : "");
  const openBook = useOpenBookOnce();
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const canSubmit = normalizeQuery(input).length > 0;

  const submit = (raw: string) => {
    const q = normalizeQuery(raw);
    if (!q) return; // S-1
    suggest.cancel(); // 추천 요청은 취소(B7)
    setInput(q);
    setEditing(false);
    search.submit(q);
  };

  const backToInput = () => {
    setEditing(true);
    inputRef.current?.focus();
  };

  const showResults = !editing && search.status !== "idle";

  return (
    <View style={styles.screen}>
      <View style={styles.barRow}>
        <TextInput
          ref={inputRef}
          testID="search-input"
          style={styles.bar}
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setEditing(true);
          }}
          onFocus={() => setEditing(true)}
          onSubmitEditing={() => submit(input)}
          placeholder="책 제목이나 저자를 입력해 주세요"
          placeholderTextColor={theme.colors.textSub}
          maxLength={QUERY_MAX_CHARS}
          autoFocus={!initialQuery}
          returnKeyType="search"
          accessibilityLabel="책 검색"
        />
        <Pressable
          testID="search-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => submit(input)}
          style={[styles.searchBtn, !canSubmit && styles.dim]}
        >
          <Text style={styles.searchBtnText}>검색</Text>
        </Pressable>
      </View>

      {!showResults && suggest.visible && (
        <View testID="suggestions" style={styles.suggest}>
          <Text style={styles.suggestHead}>책 바로 보기</Text>
          {suggest.books.map((b) => (
            <Pressable
              key={b.isbn13}
              accessibilityRole="button"
              onPress={() => openBook(b.isbn13)}
              style={styles.suggestBook}
            >
              <BookCover book={b} style={styles.suggestCover} fontSize={8} />
              <View style={styles.flex}>
                <Text style={styles.suggestTitle} numberOfLines={1}>
                  {b.title}
                </Text>
                {!!b.author && <Text style={styles.sub}>{b.author}</Text>}
              </View>
            </Pressable>
          ))}
          {suggest.queries.length > 0 && <Text style={[styles.suggestHead, styles.mt8]}>검색어</Text>}
          {suggest.queries.map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              onPress={() => submit(q)}
              style={styles.suggestQuery}
            >
              <Text style={styles.suggestQueryText}>🔍  {q}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!showResults && !suggest.visible && <SearchEntry onOpenBook={openBook} />}

      {showResults && <Results search={search} view={view} setView={setView} openBook={openBook} onRetype={backToInput} />}
    </View>
  );
}

function Results({
  search,
  view,
  setView,
  openBook,
  onRetype,
}: {
  search: ReturnType<typeof useBookSearch>;
  view: "grid" | "list";
  setView(v: "grid" | "list"): void;
  openBook(isbn13: string): void;
  onRetype(): void;
}) {
  const { status, items, query } = search;

  if (items.length === 0 && status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="찾는 중" />
      </View>
    );
  }
  if (items.length === 0 && status === "error") {
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateText}>{SEARCH_FAILED}</Text>
        <Pressable accessibilityRole="button" onPress={search.retry} style={styles.stateBtn}>
          <Text style={styles.stateBtnText}>다시 해 보기</Text>
        </Pressable>
      </View>
    );
  }
  if (status === "empty") {
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateText}>
          {`‘${query}’는 찾지 못했어요. 글자를 바꿔서 다시 찾아보세요.`}
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetype} style={styles.stateBtn}>
          <Text style={styles.stateBtnText}>다시 찾기</Text>
        </Pressable>
      </View>
    );
  }

  const footer = (
    <View style={styles.footer}>
      {search.source === "cache" && <Text style={styles.sub}>저장된 정보에서 찾은 결과예요</Text>}
      {status === "loading" && <Text style={styles.more}>책을 더 불러오는 중이에요</Text>}
      {status === "ready" && !search.hasMore && <Text style={styles.more}>여기까지예요</Text>}
      {status === "error" && (
        <View style={styles.moreError}>
          <Text style={styles.more}>{SEARCH_FAILED}</Text>
          <Pressable accessibilityRole="button" onPress={search.retry} style={styles.stateBtn}>
            <Text style={styles.stateBtnText}>다시 해 보기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const grid = view === "grid";
  return (
    <View style={styles.flex}>
      <View style={styles.cntRow}>
        <Text style={styles.cnt} numberOfLines={1}>{`"${query}" 검색 결과`}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setView(grid ? "list" : "grid")}
          style={styles.viewBtn}
        >
          <Text style={styles.viewBtnText}>{grid ? "☰ 목록으로" : "▦ 표지로"}</Text>
        </Pressable>
      </View>
      <FlatList
        testID="results"
        key={view}
        data={items}
        keyExtractor={(b) => b.isbn13}
        numColumns={grid ? 2 : 1}
        columnWrapperStyle={grid ? styles.gridRow : undefined}
        contentContainerStyle={styles.listPad}
        keyboardShouldPersistTaps="handled"
        onEndReached={search.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={footer}
        renderItem={({ item }) =>
          grid ? (
            <Pressable
              testID={`book-${item.isbn13}`}
              accessibilityRole="button"
              onPress={() => openBook(item.isbn13)}
              style={styles.gridCell}
            >
              <BookCover book={item} style={styles.gridCover} fontSize={14} />
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {!!item.author && (
                <Text style={styles.sub} numberOfLines={1}>
                  {item.author}
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              testID={`book-${item.isbn13}`}
              accessibilityRole="button"
              onPress={() => openBook(item.isbn13)}
              style={styles.row}
            >
              <BookCover book={item} style={styles.rowCover} fontSize={9} />
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!item.author && <Text style={styles.sub}>{item.author}</Text>}
                {!!publisherLine(item) && <Text style={styles.sub}>{publisherLine(item)}</Text>}
              </View>
            </Pressable>
          )
        }
      />
    </View>
  );
}

const c = theme.colors;
const GRID_HALF_GAP = 5; // 2열 칸 사이 10의 반
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.cream },
  flex: { flex: 1 },
  mt8: { marginTop: 8 },
  barRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  bar: {
    flex: 1,
    backgroundColor: c.paper,
    borderColor: c.surface3,
    borderWidth: 1,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: c.text,
  },
  searchBtn: {
    justifyContent: "center",
    backgroundColor: c.inkStrong,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 16,
  },
  searchBtnText: { color: c.paper, fontSize: 15, fontWeight: "700" },
  dim: { opacity: 0.4 },
  suggest: { paddingHorizontal: 16, paddingTop: 8 },
  suggestHead: { fontSize: 14, fontWeight: "700", color: c.text, marginTop: 8, marginBottom: 4 },
  suggestBook: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.surface2,
  },
  suggestCover: { width: 34, height: 48 },
  suggestTitle: { fontSize: 15, fontWeight: "700", color: c.text },
  suggestQuery: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.surface2 },
  suggestQueryText: { fontSize: 15, color: c.text },
  center: { paddingTop: 48, alignItems: "center" },
  stateBox: {
    margin: 16,
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 18,
    gap: 12,
    alignItems: "flex-start",
  },
  stateText: { fontSize: 15, color: c.text, lineHeight: 22 },
  stateBtn: {
    backgroundColor: c.inkStrong,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  stateBtnText: { fontSize: 14, color: c.paper, fontWeight: "700" },
  cntRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  cnt: { flex: 1, fontSize: 13, color: c.textSub },
  viewBtn: {
    backgroundColor: c.paper,
    borderColor: c.surface3,
    borderWidth: 1,
    borderRadius: theme.radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  viewBtnText: { fontSize: 13, color: c.text },
  listPad: { paddingHorizontal: 16, paddingBottom: 24 },
  // 칸마다 정확히 반 폭(B11 2열). flex: 1이면 홀수 마지막·한 권 결과가 줄 전체로 늘어난다.
  // 칸 사이 10은 양쪽 안쪽 여백 5로 나누고, 줄을 5씩 밖으로 당겨 바깥 끝은 그대로 둔다.
  gridRow: { marginHorizontal: -GRID_HALF_GAP },
  gridCell: { width: "50%", paddingHorizontal: GRID_HALF_GAP, marginBottom: 14 },
  gridCover: { width: "100%", aspectRatio: 3 / 4, marginBottom: 6 },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.surface2,
  },
  rowCover: { width: 52, height: 74 },
  title: { fontSize: 15, fontWeight: "700", color: c.text },
  sub: { fontSize: 13, color: c.textSub, marginTop: 2 },
  footer: { paddingVertical: 14, alignItems: "center", gap: 6 },
  more: { fontSize: 13, color: c.textSub, textAlign: "center" },
  moreError: { alignItems: "center", gap: 8 },
  textCover: { backgroundColor: c.surface3, padding: 6, justifyContent: "flex-end" },
  textCoverText: { color: c.inkSoft, fontWeight: "700" },
});
