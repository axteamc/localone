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
import { theme, actionColors, cardSurface, type } from "../../theme";
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

/** 출간 연도 글자. `null`이면 숨긴다(B11). 출판사와 한 줄에 섞지 않는다(C-74). */
function yearText(b: Book): string | null {
  return b.pub_year === null ? null : String(b.pub_year);
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
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.barRow}>
        <TextInput
          ref={inputRef}
          testID="search-input"
          style={[styles.bar, focused && styles.barFocus]}
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setEditing(true);
          }}
          onFocus={() => {
            setEditing(true);
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
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
          style={({ pressed }) => [styles.searchBtn, pressed && canSubmit && ACT.primaryPressed, !canSubmit && styles.dim]}
        >
          <Text style={styles.searchBtnText} numberOfLines={1}>
            검색
          </Text>
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
        <Pressable accessibilityRole="button" onPress={search.retry} style={stateBtnStyle}>
          <Text style={styles.stateBtnText} numberOfLines={1}>다시 해 보기</Text>
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
        <Pressable accessibilityRole="button" onPress={onRetype} style={stateBtnStyle}>
          <Text style={styles.stateBtnText} numberOfLines={1}>다시 찾기</Text>
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
          <Pressable accessibilityRole="button" onPress={search.retry} style={stateBtnStyle}>
            <Text style={styles.stateBtnText} numberOfLines={1}>다시 해 보기</Text>
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
          style={({ pressed }) => [styles.viewBtn, pressed && ACT.secondaryPressed]}
        >
          <Text style={styles.viewBtnText} numberOfLines={1}>
            {grid ? "☰ 목록으로" : "▦ 표지로"}
          </Text>
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
              {/* 저자(왼쪽) · 연도(오른쪽 계기판). C-74 B11 */}
              <View style={styles.gridFoot}>
                <Text style={[styles.sub, styles.shrink]} numberOfLines={1}>
                  {item.author ?? ""}
                </Text>
                {!!yearText(item) && (
                  <Text style={styles.gauge} numberOfLines={1}>
                    {yearText(item)}
                  </Text>
                )}
              </View>
            </Pressable>
          ) : (
            <Pressable
              testID={`book-${item.isbn13}`}
              accessibilityRole="button"
              onPress={() => openBook(item.isbn13)}
              style={styles.row}
            >
              <BookCover book={item} style={styles.rowCover} fontSize={9} />
              {/* C + A의 오른쪽 계기판 연도, 점선 없음(DESIGN.md 결정 기록 "책 검색 결과 줄 모양", C-74 B11) */}
              <View style={styles.rowMain}>
                <View style={styles.rowTop}>
                  <View style={styles.shrink}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {!!item.author && (
                      <Text style={styles.sub} numberOfLines={1}>
                        {item.author}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowRight}>
                    {!!yearText(item) && (
                      <Text style={styles.gauge} numberOfLines={1}>
                        {yearText(item)}
                      </Text>
                    )}
                    <Text style={styles.gauge} numberOfLines={1}>
                      {item.isbn13}
                    </Text>
                  </View>
                </View>
                <View style={styles.rowStrip}>
                  <Text style={[styles.sub, styles.shrink]} numberOfLines={1}>
                    {item.publisher ?? ""}
                  </Text>
                  {!!yearText(item) && (
                    <Text style={styles.gauge} numberOfLines={1}>
                      {`PUB ${yearText(item)} · →`}
                    </Text>
                  )}
                </View>
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
const ACT = actionColors(theme.colors);
const stateBtnStyle = ({ pressed }: { pressed: boolean }) => [styles.stateBtn, pressed && ACT.secondaryPressed];
// DESIGN.md "페이지 적용 레시피": 바탕 유리판, 줄눈 `seamHairline`, 입력 칸 곡률 9, 주 버튼 무광 판, 보조 버튼 평면
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.panelFrosted },
  flex: { flex: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
  mt8: { marginTop: 8 },
  barRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  bar: {
    flex: 1,
    backgroundColor: c.paper,
    borderColor: c.seamHairline,
    borderWidth: 1,
    borderRadius: theme.radii.infoCard,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: c.text,
    outlineWidth: 0, // 웹 기본 파란 포커스 테두리 제거(파랑 금지, S4 기본값)
  },
  barFocus: { borderColor: c.inkStrong, borderWidth: 1.5 },
  searchBtn: {
    justifyContent: "center",
    ...ACT.primary,
    borderRadius: theme.radii.control,
    paddingHorizontal: 18,
    minHeight: 48,
    flexShrink: 0,
  },
  searchBtnText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  dim: { opacity: 0.4 },
  suggest: { paddingHorizontal: 16, paddingTop: 8 },
  suggestHead: { fontSize: 14, fontWeight: "500", color: c.text, marginTop: 8, marginBottom: 4 },
  suggestBook: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.seamHairline,
  },
  suggestCover: { width: 34, height: 48 },
  suggestTitle: { ...type.name, fontSize: 15 },
  suggestQuery: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.seamHairline },
  suggestQueryText: { fontSize: 15, color: c.text },
  center: { paddingTop: 48, alignItems: "center" },
  stateBox: {
    ...cardSurface(theme, { onPanel: true }),
    margin: 16,
    padding: 18,
    gap: 12,
    alignItems: "flex-start",
  },
  stateText: { fontSize: 15, color: c.text, lineHeight: 22 },
  stateBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  stateBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
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
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 5,
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  viewBtnText: { fontSize: 13, ...ACT.secondaryText },
  listPad: { paddingHorizontal: 16, paddingBottom: 24 },
  // 칸마다 정확히 반 폭(B11 2열). flex: 1이면 홀수 마지막·한 권 결과가 줄 전체로 늘어난다.
  // 칸 사이 10은 양쪽 안쪽 여백 5로 나누고, 줄을 5씩 밖으로 당겨 바깥 끝은 그대로 둔다.
  gridRow: { marginHorizontal: -GRID_HALF_GAP },
  gridCell: { width: "50%", paddingHorizontal: GRID_HALF_GAP, marginBottom: 14 },
  gridCover: { width: "100%", aspectRatio: 3 / 4, marginBottom: 6 },
  gridFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 },
  // 1열 목록 줄: 카드 아님 — 유리판 위 평면 + 아래 1px 줄눈
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.seamHairline,
  },
  rowCover: { width: 52, height: 74 },
  rowMain: { flex: 1, minWidth: 0, justifyContent: "space-between", gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  rowRight: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
  rowStrip: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { ...type.name },
  sub: { fontSize: 13, color: c.textSub, marginTop: 2 },
  gauge: { ...type.gauge, flexShrink: 0 },
  footer: { paddingVertical: 14, alignItems: "center", gap: 6 },
  more: { fontSize: 13, color: c.textSub, textAlign: "center" },
  moreError: { alignItems: "center", gap: 8 },
  textCover: { backgroundColor: c.surface3, padding: 6, justifyContent: "flex-end" },
  textCoverText: { color: c.inkSoft, fontWeight: "500" },
});
