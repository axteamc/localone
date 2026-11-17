// 검색 진입 화면: 최근 본 도서 → 인기 도서(book-search.md LIB-1 B1·B2·B4·B10, S-6·S-10)
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import type { RecommendationResponse } from "../../lib/publicApi";
import { theme } from "../../theme";
import { fetchRecommendations } from "./__fakes__/publicApi"; // TODO(연결): D LIB-0-P2 — lib/publicApi
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
          <View style={styles.head}>
            <Text style={styles.headText}>최근 본 도서</Text>
            <Pressable accessibilityRole="button" onPress={() => void clearAll()} hitSlop={8}>
              <Text style={styles.headSub}>전체 삭제</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pills}
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
        <View style={styles.head}>
          <Text style={styles.headText}>
            인기 도서{" "}
            {popular.kind === "ready" && (
              <Text style={styles.headSub}>{popular.data.basis_label}</Text>
            )}
          </Text>
        </View>
        {popular.kind === "loading" && <Text style={styles.muted}>불러오는 중이에요</Text>}
        {popular.kind === "error" && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>인기 도서를 불러오지 못했어요</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadPopular()} style={styles.stateBtn}>
              <Text style={styles.stateBtnText}>다시 해 보기</Text>
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
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 24 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 16, marginBottom: 8 },
  headText: { fontSize: 15, fontWeight: "700", color: c.text },
  headSub: { fontSize: 13, fontWeight: "400", color: c.textSub },
  pills: { gap: 6, paddingBottom: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.paper,
    borderColor: c.surface3,
    borderWidth: 1,
    borderRadius: theme.radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  pillText: { fontSize: 14, color: c.text },
  pillX: { fontSize: 15, color: c.textSub },
  rankRow: { flexDirection: "row", gap: 12 },
  rankCol: { flex: 1 },
  rankItem: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  rankNo: { width: 22, fontSize: 14, fontWeight: "700", color: c.inkStrong },
  rankTitle: { flex: 1, fontSize: 14, color: c.text },
  muted: { fontSize: 13, color: c.textSub, paddingVertical: 8 },
  stateBox: { backgroundColor: c.cream, borderRadius: theme.radii.card, padding: 16, gap: 10, alignItems: "flex-start" },
  stateText: { fontSize: 14, color: c.text },
  stateBtn: { backgroundColor: c.inkStrong, borderRadius: theme.radii.control, paddingVertical: 8, paddingHorizontal: 16 },
  stateBtnText: { fontSize: 14, color: c.paper, fontWeight: "700" },
});
