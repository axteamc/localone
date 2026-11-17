// "이 동네 인기 도서" 옆으로 넘기는 한 줄 (계약서 library-visit.md VISIT-1b W1·W2·W7·W10, 예외 #1·#2-d)
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";
import type { Book } from "./deps";

const TEXT = {
  title: "이 동네 인기 도서",
  empty: "이 동네 인기 도서를 아직 모으지 못했어요.",
  error: "인기 도서를 불러오지 못했어요.",
  reload: "↻ 새로고침",
};

export type PopularBooksRowProps = {
  status: "loading" | "ready" | "empty" | "error";
  basisLabel: string | null;
  books: Book[];
  onPressBook(book: Book): void;
  onReload(): void;
};

const COVER_W = 58;
const COVER_H = 82;
const LOADING_SLOTS = 5;

export function PopularBooksRow(props: PopularBooksRowProps) {
  const { status, basisLabel, books, onPressBook, onReload } = props;

  return (
    <View testID="popular-books">
      <View style={styles.head}>
        <Text style={styles.title}>{TEXT.title}</Text>
        {/* W2: 서버가 준 기준을 그대로(전국으로 대체되면 그 기준이 보임) */}
        {basisLabel ? (
          <Text style={styles.basis} numberOfLines={1}>
            {basisLabel}
          </Text>
        ) : null}
      </View>

      {status === "error" ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{TEXT.error}</Text>
          <Pressable accessibilityRole="button" onPress={onReload} style={styles.reload}>
            <Text style={styles.reloadText}>{TEXT.reload}</Text>
          </Pressable>
        </View>
      ) : status === "empty" ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{TEXT.empty}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {status === "loading"
            ? Array.from({ length: LOADING_SLOTS }, (_, i) => (
                <View key={i} style={styles.book} testID="popular-book-loading">
                  <View style={[styles.cover, styles.coverEmpty]} />
                </View>
              ))
            : books.map((b, i) => (
                <Pressable
                  key={b.isbn13}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}위 ${b.title}`}
                  testID="popular-book"
                  onPress={() => onPressBook(b)}
                  style={styles.book}
                >
                  <View style={styles.cover}>
                    {b.cover_url ? (
                      <Image source={{ uri: b.cover_url }} style={styles.coverImage} resizeMode="cover" />
                    ) : (
                      // C3: 표지가 없으면 제목 글자 표지(surface2 바탕)
                      <View style={[styles.coverImage, styles.coverEmpty, styles.coverText]}>
                        <Text style={styles.coverTitle} numberOfLines={4}>
                          {b.title}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.rank}>{i + 1}</Text>
                  </View>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {b.title}
                  </Text>
                </Pressable>
              ))}
        </ScrollView>
      )}
    </View>
  );
}

const c = theme.colors;
const [tl, tr, br, bl] = theme.radii.bookCover;

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 10, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: "700", color: c.text },
  basis: { flexShrink: 1, fontSize: 12, color: c.textSub },
  row: { gap: 10, paddingBottom: 4 },
  book: { width: COVER_W },
  cover: {
    width: COVER_W,
    height: COVER_H,
    borderTopLeftRadius: tl,
    borderTopRightRadius: tr,
    borderBottomRightRadius: br,
    borderBottomLeftRadius: bl,
    overflow: "hidden",
  },
  coverImage: { width: "100%", height: "100%" },
  coverEmpty: { backgroundColor: c.surface2 },
  coverText: { padding: 5, justifyContent: "center" },
  coverTitle: { fontSize: 10, color: c.text },
  rank: { position: "absolute", left: 4, top: 2, fontSize: 13, fontWeight: "700", color: c.text },
  bookTitle: { marginTop: 4, fontSize: 11, lineHeight: 14, color: c.text },
  message: { alignItems: "flex-start", gap: 8, paddingVertical: 8 },
  messageText: { fontSize: 13, color: c.textSub },
  reload: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radii.pill, backgroundColor: c.surface2 },
  reloadText: { fontSize: 13, color: c.text },
});
