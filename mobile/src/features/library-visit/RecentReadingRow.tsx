// 홈 하단 창 "내 최근 독서 기록" (reading-log.md READ-2 R2-5·R2-6·R2-O4·C6, 명세 결정 4)
// 인기 도서 바로 아래, 소식 위. 내 기록 최근 순 표지 최대 5권 가로 줄(인기 도서와 같은 표지 크기).
// 비로그인·기록 0개·불러오기 실패면 칸 자체를 그리지 않는다(빈 자리·안내·가짜 카드 없음).
// 로그아웃·계정 전환이면 늦은 응답을 버리고 비운다. 홈에 돌아올 때(focus) 다시 받는다.
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { GlassArrows, useHorizontalScroll } from "../../lib/HorizontalArrows";
import { theme, type as T } from "../../theme";
import { fetchReadingLogs, type ReadingLog } from "./deps";

export const RECENT_TEXT = { title: "내 최근 독서 기록" } as const;
export const RECENT_LIMIT = 5; // R2-O4

export function RecentReadingRow(props: { onOpenLog(logId: string): void }): React.JSX.Element | null {
  const { status, userId } = useAuth();
  const owner = status === "signedIn" && userId ? userId : null;
  if (!owner) return null; // R2-5: 비로그인이면 묻지도 않고 칸 없음
  // 계정마다 새로 그린다: 계정이 바뀌면 앞 계정 요청은 끊기고(abort) 늦은 응답은 버려진다(C6)
  return <OwnRecentRow key={owner} onOpenLog={props.onOpenLog} />;
}

function OwnRecentRow({ onOpenLog }: { onOpenLog(logId: string): void }): React.JSX.Element | null {
  const [items, setItems] = useState<ReadingLog[]>([]);
  const scroll = useHorizontalScroll(items.length > 0);

  useFocusEffect(
    useCallback(() => {
      const ctrl = new AbortController();
      fetchReadingLogs({ limit: RECENT_LIMIT }, ctrl.signal)
        .then((page) => {
          if (ctrl.signal.aborted) return; // 로그아웃·계정 전환 뒤 늦은 응답(C6)
          setItems(page.items.slice(0, RECENT_LIMIT));
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setItems([]); // C6 홈 칸 실패: 칸을 그리지 않는다
        });
      return () => ctrl.abort();
    }, [])
  );

  if (items.length === 0) return null;

  return (
    <View testID="recent-reading" style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{RECENT_TEXT.title}</Text>
      </View>
      <View>
      <ScrollView {...scroll.scrollProps} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((log) => (
          <Pressable
            key={log.id}
            accessibilityRole="button"
            accessibilityLabel={log.book.title}
            testID={`recent-log-${log.id}`}
            onPress={() => onOpenLog(log.id)}
            style={styles.book}
          >
            <View style={styles.cover}>
              <LogCover log={log} />
            </View>
            <Text style={styles.bookTitle} numberOfLines={2}>
              {log.book.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <GlassArrows label={RECENT_TEXT.title} {...scroll.edges} centerY={COVER_H / 2} onMove={scroll.onMove} />
      </View>
    </View>
  );
}

// 인기 도서 표지와 같은 규칙: 표지가 없거나 못 받으면 제목 글자 표지
function LogCover({ log }: { log: ReadingLog }) {
  const [failed, setFailed] = useState(false);
  if (log.book.cover_url && !failed) {
    return <Image source={{ uri: log.book.cover_url }} style={styles.coverImage} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[styles.coverImage, styles.coverEmpty, styles.coverText]}>
      <Text style={styles.coverTitle} numberOfLines={4}>
        {log.book.title}
      </Text>
    </View>
  );
}

// 표지 크기는 PopularBooksRow와 같다(R2-O4)
const COVER_W = 92;
const COVER_H = 132;
const c = theme.colors;
const [tl, tr, br, bl] = theme.radii.bookCover;

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, marginBottom: 10 },
  title: { ...T.title },
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
});
