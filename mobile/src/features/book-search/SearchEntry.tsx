// 검색 진입 화면: 최근 본 도서 → 인기 도서(book-search.md LIB-1 B1·B2·B4·B10, S-6·S-10)
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { WebHorizontalControls, useWebHorizontalScroll } from "../../lib/WebHorizontalControls";
import { createLatestRunner } from "../../lib/latest";
import { fetchRecommendations, type RecommendationResponse } from "../../lib/publicApi";
import { actionColors, cardSurface, theme, type } from "../../theme";
import {
  clearRecentBooks,
  listRecentBooks,
  removeRecentBook,
  type RecentBook,
} from "./recentBooks";

const PILL_MAX_CHARS = 10;
const POPULAR_SHOWN = 10;

export function cutTitle(title: string, max = PILL_MAX_CHARS): string {
  const chars = Array.from(title);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : title;
}

type Popular =
  | { kind: "loading" }
  | { kind: "ready"; data: RecommendationResponse }
  | { kind: "error" };

export function SearchEntry({ onOpenBook }: { onOpenBook(isbn13: string): void }) {
  const { userId } = useAuth();
  const runner = useMemo(() => createLatestRunner(), []);
  // 목록에 주인 계정을 붙여 둔다. 계정이 바뀌면 새로 읽기 전이라도 이전 계정 목록은 그리지 않는다(B4 계정 격리).
  const [recentState, setRecentState] = useState<{ owner: string | null; books: RecentBook[] }>({
    owner: userId,
    books: [],
  });
  const recent = recentState.owner === userId ? recentState.books : [];
  const recentScroll = useWebHorizontalScroll(recent.length > 0);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const loadSeq = useRef(0); // 가장 마지막에 시작한 읽기만 화면에 반영한다
  const [popular, setPopular] = useState<Popular>({ kind: "loading" });

  const loadRecent = useCallback(async () => {
    const seq = ++loadSeq.current;
    const books = await listRecentBooks(userId);
    if (seq !== loadSeq.current || currentUser.current !== userId) return; // 늦게 온 읽기·다른 계정 읽기는 버린다
    setRecentState({ owner: userId, books });
  }, [userId]);

  // 상세에서 돌아오면 최근 본 도서를 다시 읽는다. 포커스를 잃거나 계정이 바뀌면 진행 중인 읽기는 무효.
  useFocusEffect(
    useCallback(() => {
      void loadRecent();
      return () => {
        loadSeq.current++;
      };
    }, [loadRecent])
  );

  const loadPopular = useCallback(async () => {
    setPopular({ kind: "loading" });
    const r = await runner.run((signal) => fetchRecommendations(undefined, signal)); // 항상 전국(B2)
    if (r.status === "stale") return;
    setPopular(r.status === "ok" ? { kind: "ready", data: r.value } : { kind: "error" });
  }, [runner]);

  useEffect(() => {
    void loadPopular();
    return () => runner.cancel();
  }, [loadPopular, runner]);

  const editRecent = (update: (books: RecentBook[]) => RecentBook[]) => {
    loadSeq.current++; // 삭제 전에 시작된 읽기가 지운 책을 다시 그리지 않게 한다
    setRecentState((prev) => (prev.owner === userId ? { owner: userId, books: update(prev.books) } : prev));
  };

  // 저장에 실패해도 화면은 계속 쓴다(S-6). 대신 기기에 남은 그대로 다시 읽어 보인다(계정이 그대로일 때만).
  const reloadIfSameUser = () => {
    if (currentUser.current === userId) void loadRecent();
  };

  const remove = async (isbn13: string) => {
    editRecent((books) => books.filter((b) => b.isbn13 !== isbn13));
    await removeRecentBook(userId, isbn13).catch(reloadIfSameUser);
  };

  const clearAll = async () => {
    editRecent(() => []);
    await clearRecentBooks(userId).catch(reloadIfSameUser); // S-6과 같음
  };

  const ranked = popular.kind === "ready" ? popular.data.books.slice(0, POPULAR_SHOWN) : [];
  const half = Math.ceil(ranked.length / 2);
  const columns = [ranked.slice(0, half), ranked.slice(half)];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
      {recent.length > 0 && (
        <View testID="recent-section">
          <View style={[styles.head, styles.recentHead]}>
            <Text style={styles.headText} numberOfLines={1}>
              최근 본 도서
            </Text>
            <View style={styles.recentActions}>
              <Pressable accessibilityRole="button" onPress={() => void clearAll()} hitSlop={8}>
                <Text style={styles.headSub} numberOfLines={1}>
                  전체 삭제
                </Text>
              </Pressable>
              <WebHorizontalControls label="최근 본 도서" {...recentScroll.edges} onMove={recentScroll.onMove} />
            </View>
          </View>
          <ScrollView
            {...recentScroll.scrollProps}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pills}
            testID="recent-books-scroll"
          >
            {recent.map((b) => (
              <View key={b.isbn13} style={styles.pill}>
                <Pressable accessibilityRole="button" onPress={() => onOpenBook(b.isbn13)}>
                  <Text style={styles.pillText}>{cutTitle(b.title)}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${b.title} 지우기`}
                  onPress={() => void remove(b.isbn13)}
                  hitSlop={8}
                >
                  <Text style={styles.pillX}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View testID="popular-section">
        {/* 칸 제목과 기준 글자(계기판)는 다른 줄(DESIGN.md 레시피 "표찰·숫자", C-74) */}
        <View style={[styles.head, popular.kind === "ready" && styles.headTight]}>
          <Text style={styles.headText} numberOfLines={1}>
            인기 도서
          </Text>
        </View>
        {popular.kind === "ready" && (
          <Text style={styles.basis} numberOfLines={1}>
            {popular.data.basis_label}
          </Text>
        )}
        {popular.kind === "loading" && <Text style={styles.muted}>불러오는 중이에요</Text>}
        {popular.kind === "error" && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>인기 도서를 불러오지 못했어요</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadPopular()}
              style={({ pressed }) => [styles.stateBtn, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.stateBtnText} numberOfLines={1}>
                다시 해 보기
              </Text>
            </Pressable>
          </View>
        )}
        {popular.kind === "ready" && (
          <View style={styles.rankRow}>
            {columns.map((col, ci) => (
              <View key={ci} style={styles.rankCol}>
                {col.map((b, i) => (
                  <Pressable
                    key={b.isbn13}
                    accessibilityRole="button"
                    onPress={() => onOpenBook(b.isbn13)}
                    style={styles.rankItem}
                  >
                    <Text style={styles.rankNo}>{ci * half + i + 1}</Text>
                    <Text style={styles.rankTitle} numberOfLines={1}>
                      {b.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 24 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 20, marginBottom: 10 },
  headTight: { marginBottom: 2 },
  recentHead: { alignItems: "center" },
  recentActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { ...type.title, flexShrink: 1 },
  headSub: { fontSize: 13, fontWeight: "400", color: c.textSub },
  basis: { ...type.gauge, marginBottom: 10 },
  pills: { gap: 6, paddingBottom: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.paper,
    borderColor: c.seamHairline,
    borderWidth: 1,
    borderRadius: theme.radii.control,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  pillText: { fontSize: 14, color: c.text },
  pillX: { fontSize: 15, color: c.textSub },
  rankRow: { flexDirection: "row", gap: 12 },
  rankCol: { flex: 1 },
  rankItem: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  rankNo: { ...type.gauge, fontSize: 11, width: 22 },
  rankTitle: { flex: 1, fontSize: 14, color: c.text },
  muted: { fontSize: 13, color: c.textSub, paddingVertical: 8 },
  stateBox: { ...cardSurface(theme, { onPanel: true }), padding: 16, gap: 10, alignItems: "flex-start" },
  stateText: { fontSize: 14, color: c.text },
  stateBtn: { ...ACT.secondary, borderRadius: theme.radii.control, paddingVertical: 8, paddingHorizontal: 16 },
  stateBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
