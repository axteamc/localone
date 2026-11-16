// 책 상세: 표지 + 제목·저자·출판사·연도 → 빌릴 예정에 저장 → (LIB-2 도서관 목록 자리) → 책 소개
// book-search.md LIB-1 B4·B5·B12, S-4·S-9·S-11
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner, theme } from "./__fakes__/core"; // TODO(연결): D — theme, lib/latest
import { ApiCallError, fetchBook, type Book } from "./__fakes__/publicApi"; // TODO(연결): D — lib/publicApi
import { pushRecentBook } from "./recentBooks";
import { BookCover, SEARCH_FAILED } from "./SearchScreen";

export const NOT_FOUND = "찾을 수 없어요.";
export const LOGIN_TO_SAVE = "로그인하면 빌릴 예정을 저장할 수 있어요";
export const PREPARING = "준비 중이에요";

const ISBN13 = /^[0-9]{13}$/;

type State =
  | { kind: "loading" }
  | { kind: "ready"; book: Book }
  | { kind: "notFound" }
  | { kind: "error" };

export function BookDetailScreen({ isbn13 }: { isbn13: string }) {
  const router = useRouter();
  const { userId, status: authStatus } = useAuth();
  const runner = useMemo(() => createLatestRunner(), []);
  const [state, setState] = useState<State>(
    ISBN13.test(isbn13) ? { kind: "loading" } : { kind: "notFound" }
  );
  const [saveNote, setSaveNote] = useState<"login" | "preparing" | null>(null);

  const load = useCallback(async () => {
    if (!ISBN13.test(isbn13)) {
      setState({ kind: "notFound" }); // 13자리가 아니면 묻지 않는다(C3)
      return;
    }
    setState({ kind: "loading" });
    const r = await runner.run((signal) => fetchBook(isbn13, signal));
    if (r.status === "stale") return;
    if (r.status === "error") {
      const e = r.error;
      const missing = e instanceof ApiCallError && (e.status === 404 || e.status === 422);
      setState({ kind: missing ? "notFound" : "error" }); // S-4 / S-11, 기록하지 않음
      return;
    }
    setState({ kind: "ready", book: r.value });
    // 책을 받아 온 뒤에만 최근 본 도서에 남긴다(B4). 저장 실패는 화면을 막지 않는다(S-6).
    await pushRecentBook(userId, r.value).catch(() => undefined);
  }, [isbn13, runner, userId]);

  useEffect(() => {
    void load();
    return () => runner.cancel();
    // userId가 바뀌어도 다시 부르지 않는다(같은 책)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn13]);

  const onSave = () => {
    // TODO(연결): C LIB-3 — 로그인했으면 도서관 고르는 창(LIB-3)
    setSaveNote(authStatus === "signedIn" ? "preparing" : "login");
  };

  if (state.kind === "loading") {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator accessibilityLabel="불러오는 중" />
      </View>
    );
  }
  if (state.kind === "notFound") {
    return (
      <View style={styles.screen}>
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{NOT_FOUND}</Text>
        </View>
      </View>
    );
  }
  if (state.kind === "error") {
    return (
      <View style={styles.screen}>
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{SEARCH_FAILED}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.darkBtn}>
            <Text style={styles.darkBtnText}>다시 해 보기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const b = state.book;
  const pubLine = [b.publisher, b.pub_year === null ? null : String(b.pub_year)]
    .filter((v): v is string => !!v)
    .join(" · ");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <View testID="detail-info" style={styles.head}>
        <BookCover book={b} style={styles.cover} fontSize={13} />
        <View style={styles.flex}>
          <Text style={styles.title}>{b.title}</Text>
          {!!b.author && <Text style={styles.sub}>{b.author}</Text>}
          {!!pubLine && <Text style={styles.sub}>{pubLine}</Text>}
        </View>
      </View>

      <Pressable
        testID="save-plan"
        accessibilityRole="button"
        onPress={onSave}
        style={styles.saveBtn}
      >
        <Text style={styles.saveBtnText}>빌릴 예정에 저장</Text>
      </Pressable>
      {saveNote === "login" && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{LOGIN_TO_SAVE}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/login")}
            style={styles.darkBtn}
          >
            <Text style={styles.darkBtnText}>로그인</Text>
          </Pressable>
        </View>
      )}
      {saveNote === "preparing" && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{PREPARING}</Text>
        </View>
      )}

      {/* 가까운 도서관 목록은 LIB-2에서 이 자리에 넣는다(B5 ③). LIB-1에서는 그리지 않는다. */}

      {b.description !== null && (
        <View testID="description">
          <Text style={styles.section}>책 소개</Text>
          <Text style={styles.desc}>{b.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.cream },
  center: { alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  pad: { padding: 16, paddingBottom: 32 },
  head: { flexDirection: "row", gap: 14 },
  cover: { width: 84, height: 118 },
  title: { fontSize: 19, fontWeight: "700", color: c.text, lineHeight: 26 },
  sub: { fontSize: 14, color: c.textSub, marginTop: 4 },
  saveBtn: {
    marginTop: 16,
    backgroundColor: c.inkStrong,
    borderRadius: theme.radii.inner,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { color: c.paper, fontSize: 16, fontWeight: "700" },
  note: {
    marginTop: 10,
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
  },
  noteText: { fontSize: 15, color: c.text },
  section: { fontSize: 15, fontWeight: "700", color: c.text, marginTop: 24, marginBottom: 6 },
  desc: { fontSize: 15, color: c.inkSoft, lineHeight: 23 },
  stateBox: {
    margin: 16,
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 18,
    gap: 12,
    alignItems: "flex-start",
  },
  stateText: { fontSize: 15, color: c.text, lineHeight: 22 },
  darkBtn: {
    backgroundColor: c.inkStrong,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, color: c.paper, fontWeight: "700" },
});
