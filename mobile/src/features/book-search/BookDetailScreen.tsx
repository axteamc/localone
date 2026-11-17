// 책 상세: 표지 + 제목·저자·출판사·연도 → 빌릴 예정에 저장 → 가까운 도서관 → 책 소개
// book-search.md LIB-1 B4·B5·B12, S-4·S-9·S-11 / LIB-2 A1~A3·A7·A10·A11, V-1·V-4·V-9
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { ApiCallError, type Book } from "../../lib/publicApi";
import { theme } from "../../theme";
import { fetchBook } from "./__fakes__/publicApi"; // detail.test.tsx 호환상 LIB-2에서 유지(book-search.md LIB-2 C7)
import { checkedAtLabel } from "./availabilityText";
import { LibraryAvailabilityCard } from "./LibraryAvailabilityCard";
import { pushRecentBook } from "./recentBooks";
import { BookCover, SEARCH_FAILED } from "./SearchScreen";
import { useAvailability } from "./useAvailability";

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
  }, [isbn13, runner]);

  useEffect(() => {
    void load();
    return () => runner.cancel();
    // userId가 바뀌어도 다시 부르지 않는다(같은 책)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn13]);

  // 책을 받아 온 뒤에만 최근 본 도서에 남긴다(B4). 로그인 복원이 끝난 뒤의 계정으로 한 번만 남긴다
  // (복원 중 guest 키로 가지 않게 — D 이월 메모, 이슈 113). 저장 실패는 화면을 막지 않는다(S-6).
  const recordedFor = useRef<string | null>(null);
  const readyBook = state.kind === "ready" ? state.book : null;
  useEffect(() => {
    if (!readyBook || authStatus === "loading" || recordedFor.current === readyBook.isbn13) return;
    recordedFor.current = readyBook.isbn13;
    void pushRecentBook(userId, readyBook).catch(() => undefined);
  }, [readyBook, authStatus, userId]);

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

      {/* B5 ③ 가까운 도서관. 책을 받아 온 뒤에만 조회한다(A10). */}
      <AvailabilitySection isbn13={b.isbn13} />

      {b.description !== null && (
        <View testID="description">
          <Text style={styles.section}>책 소개</Text>
          <Text style={styles.desc}>{b.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function AvailabilitySection({ isbn13 }: { isbn13: string }) {
  const a = useAvailability(isbn13);
  const today = a.checkedAt?.slice(0, 10) ?? "";
  const footer = a.checkedAt ? checkedAtLabel(a.checkedAt) : null;
  const busy = a.status === "locating" || a.status === "loading";

  return (
    <View testID="availability" style={styles.availability}>
      <Text style={styles.section}>가까운 도서관</Text>

      {busy && <ActivityIndicator accessibilityLabel="도서관 찾는 중" style={styles.availBusy} />}

      {a.status === "error" && (
        <View style={styles.stateBoxInline}>
          <Text style={styles.stateText}>{a.errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={a.retry} style={styles.darkBtn}>
            <Text style={styles.darkBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {!busy && a.status !== "error" && a.items.length > 0 && (
        <View testID="availability-list" style={styles.cards}>
          {a.items.map((item) => (
            <LibraryAvailabilityCard key={item.library.id} item={item} today={today} onRetry={a.retry} />
          ))}
          {!!footer && <Text style={styles.footer}>{footer}</Text>}
        </View>
      )}
    </View>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  availability: { marginTop: 8 },
  availBusy: { marginVertical: 16 },
  cards: { gap: 10 },
  footer: { fontSize: 12, color: c.textSub, marginTop: 2 },
  stateBoxInline: {
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 18,
    gap: 12,
    alignItems: "flex-start",
  },
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
