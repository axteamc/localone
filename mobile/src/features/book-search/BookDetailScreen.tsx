// 책 상세: 표지 + 제목·저자·출판사·연도 → 빌릴 예정에 저장 → 가까운 도서관 → 책 소개
// book-search.md LIB-1 B4·B5·B12, S-4·S-9·S-11 / LIB-2 A1~A3·A7·A10·A11, V-1·V-4·V-9 / LIB-3 N7·N8
// loan-assistant.md LOAN-1 M10 ① — "빌릴 예정에 저장" 아래 "빌렸어요"
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { ApiCallError, fetchBook, type AvailabilityItem, type Book } from "../../lib/publicApi";
import { theme, actionColors } from "../../theme";
import { StartLoanButton } from "../loan-assistant/StartLoanButton";
import { availabilitySummary, checkedAtLabel } from "./availabilityText";
import { EmptyAvailability } from "./EmptyAvailability";
import { LibraryAvailabilityCard } from "./LibraryAvailabilityCard";
import { pushRecentBook } from "./recentBooks";
import { RegionPicker } from "./RegionPicker";
import { SavePlanSheet } from "./SavePlanSheet";
import { BookCover, SEARCH_FAILED } from "./SearchScreen";
import { useAvailability } from "./useAvailability";

export const NOT_FOUND = "찾을 수 없어요.";
export const LOGIN_TO_SAVE = "로그인하면 빌릴 예정을 저장할 수 있어요";
export const SAVED_NOTE = "빌릴 예정 메모에 저장했어요. 대출·반납 탭에서 볼 수 있어요."; // N8

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
  const [saveNote, setSaveNote] = useState<"login" | "saved" | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [candidates, setCandidates] = useState<AvailabilityItem[]>([]); // 시트 후보 = 지금 찾아본 도서관(N3)

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

  // 책 옆 버튼·빈 결과의 "나중에 빌릴 책으로 저장"이 같이 쓴다. 비로그인은 창을 열지 않는다(N7).
  const onSave = () => {
    if (authStatus === "loading") return; // 로그인 복원 중에는 로그인 안내를 띄우지 않는다(사후 검토 ②-3, ①-5와 같은 정책)
    if (authStatus === "signedIn") {
      setSaveNote(null);
      setSheetOpen(true);
    } else {
      setSaveNote("login");
    }
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
      <StartLoanButton variant="detail" input={{ isbn13: b.isbn13 }} />
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
      {saveNote === "saved" && (
        <View testID="saved-note" style={styles.note}>
          <Text style={styles.noteText}>{SAVED_NOTE}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/loans")}
            style={styles.darkBtn}
          >
            <Text style={styles.darkBtnText}>대출·반납 보기</Text>
          </Pressable>
        </View>
      )}

      {/* B5 ③ 가까운 도서관. 책을 받아 온 뒤에만 조회한다(A10). */}
      <AvailabilitySection isbn13={b.isbn13} onItems={setCandidates} onSaveForLater={onSave} />

      <SavePlanSheet
        visible={sheetOpen}
        isbn13={b.isbn13}
        candidates={candidates}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false);
          setSaveNote("saved");
        }}
        onLoginRequired={() => {
          setSheetOpen(false);
          setSaveNote("login");
        }}
      />

      {b.description !== null && (
        <View testID="description">
          <Text style={styles.section}>책 소개</Text>
          <Text style={styles.desc}>{b.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function AvailabilitySection({
  isbn13,
  onItems,
  onSaveForLater,
}: {
  isbn13: string;
  onItems(items: AvailabilityItem[]): void;
  onSaveForLater(): void;
}) {
  const a = useAvailability(isbn13);
  useEffect(() => onItems(a.items), [a.items, onItems]);
  const [picking, setPicking] = useState(false); // "지역 다시 고르기"(A12)
  useEffect(() => setPicking(false), [isbn13]);
  const today = a.checkedAt?.slice(0, 10) ?? "";
  const footer = a.checkedAt ? checkedAtLabel(a.checkedAt) : null;
  const busy = a.status === "locating" || a.status === "loading";
  const city = a.scope === "city";
  const summary = availabilitySummary(a.items);
  const showPicker = a.status === "need_region" || picking;

  const chooseRegion = (code: string) => {
    setPicking(false);
    a.chooseRegion(code);
  };
  const nearbyAgain = () => {
    setPicking(false);
    a.reloadNearby?.();
  };

  return (
    <View testID="availability" style={styles.availability}>
      <Text style={styles.section}>
        {city ? "도시 전체 도서관" : "가까운 도서관"}
        {city && a.selectedRegionLabel ? ` · ${a.selectedRegionLabel}` : ""}
      </Text>
      {/* A4: 도시 전체 버튼은 구역 머리에 늘 보인다. 도시 전체 모드에서는 내 주변 다시 보기도 함께 */}
      <View style={styles.scopeRow}>
        <Pressable
          testID="search-city"
          accessibilityRole="button"
          onPress={() => {
            setPicking(false);
            a.searchCity();
          }}
          style={styles.scopeBtn}
        >
          <Text style={styles.scopeBtnText}>현재 도시 내 모든 도서관 검색</Text>
        </Pressable>
        {city && (
          <Pressable accessibilityRole="button" onPress={nearbyAgain} style={styles.scopeBtn}>
            <Text style={styles.scopeBtnText}>내 주변 다시 보기</Text>
          </Pressable>
        )}
      </View>

      {busy && <ActivityIndicator accessibilityLabel="도서관 찾는 중" style={styles.availBusy} />}

      {!busy && showPicker && <RegionPicker onChoose={chooseRegion} onLocationAllowed={nearbyAgain} />}

      {!busy && !showPicker && a.status === "empty" && (
        <EmptyAvailability
          scope={a.scope}
          onSearchCity={() => a.searchCity()}
          onSaveForLater={onSaveForLater} // 지금 찾아본 도서관 중에서 골라 저장(N3·N7)
          onPickRegion={() => setPicking(true)}
        />
      )}

      {!busy && !showPicker && city && summary.unknown > 0 && (
        <Text style={styles.summary}>
          {`총 ${summary.total}곳 중 확인 ${summary.checked}곳 · 미확인 ${summary.unknown}곳`}
        </Text>
      )}

      {a.status === "error" && (
        <View style={styles.stateBoxInline}>
          <Text style={styles.stateText}>{a.errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={a.retry} style={styles.darkBtn}>
            <Text style={styles.darkBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {/* V-3: 빈 결과 안내가 있어도 카드 목록은 그 아래 그대로 */}
      {!busy && !showPicker && a.status !== "error" && a.items.length > 0 && (
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
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  availability: { marginTop: 8, gap: 10 },
  availBusy: { marginVertical: 16 },
  cards: { gap: 12 },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scopeBtn: {
    borderWidth: 1,
    borderColor: c.divider,
    backgroundColor: c.paper,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  scopeBtnText: { fontSize: 14, color: c.text, fontWeight: "500" },
  summary: { fontSize: 13, color: c.textSub },
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
  title: { fontSize: 19, fontWeight: "500", color: c.text, lineHeight: 26 },
  sub: { fontSize: 14, color: c.textSub, marginTop: 4 },
  saveBtn: {
    marginTop: 16,
    ...ACT.primary,
    borderRadius: theme.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { ...ACT.primaryText, fontSize: 16, fontWeight: "500" },
  note: {
    marginTop: 10,
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
  },
  noteText: { fontSize: 15, color: c.text },
  section: { fontSize: 15, fontWeight: "500", color: c.text, marginTop: 24, marginBottom: 6 },
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
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
