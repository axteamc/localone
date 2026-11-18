// "이 동네 인기 도서" 옆으로 넘기는 한 줄 (계약서 library-visit.md VISIT-1b W1·W2·W7·W10, 예외 #1·#2-d)
import React, { useState } from "react";
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

const COVER_W = 92;
const COVER_H = 132;
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
            : books.map((b) => (
                <Pressable
                  key={b.isbn13}
                  accessibilityRole="button"
                  accessibilityLabel={b.title}
                  testID="popular-book"
                  onPress={() => onPressBook(b)}
                  style={styles.book}
                >
                  <View style={styles.cover}>
                    <BookCover book={b} />
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

// C3: 표지가 없으면 제목 글자 표지(surface2 바탕). 주소는 있는데 그림을 못 받아도(깨진 주소·끊김) 같은 글자 표지로 바꾼다
function BookCover({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false);
  if (book.cover_url && !failed) {
    return (
      <Image
        source={{ uri: book.cover_url }}
        style={styles.coverImage}
        resizeMode="cover"
        testID="popular-book-cover-image"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.coverImage, styles.coverEmpty, styles.coverText]}>
      <Text style={styles.coverTitle} numberOfLines={4}>
        {book.title}
      </Text>
    </View>
  );
}

const c = theme.colors;
const [tl, tr, br, bl] = theme.radii.bookCover;

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 6, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: "700", color: c.text },
  basis: { flexShrink: 1, fontSize: 12, color: c.textSub },
  row: { gap: 12, paddingBottom: 2 },
  book: { width: COVER_W, minHeight: COVER_H + 4 + 36 },
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
  coverText: { padding: 8, justifyContent: "center" },
  coverTitle: { fontSize: 13, lineHeight: 18, color: c.text },
  bookTitle: { marginTop: 4, fontSize: 13, lineHeight: 18, color: c.text },
  message: { alignItems: "flex-start", gap: 8, paddingVertical: 8 },
  messageText: { fontSize: 13, color: c.textSub },
  reload: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radii.pill, backgroundColor: c.surface2 },
  reloadText: { fontSize: 13, color: c.text },
});
