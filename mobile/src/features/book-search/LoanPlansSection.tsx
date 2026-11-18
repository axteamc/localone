// 대출·반납 탭의 "빌릴 예정" 구역(book-search.md LIB-3 N5·N9·N10, C6 L3-#6·#7)
// 카드마다 "빌렸어요"로 내 대출에 옮긴다(loan-assistant.md LOAN-1 M6·M10 ②, C6 M-#3~#5).
// 본인만 보는 메모 목록이다(N1). 로그인했을 때만 그린다(비로그인 처리는 탭 화면).
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import type { Loan } from "../loan-assistant/api";
import {
  START_CONFLICT,
  START_FAILED,
  StartLoanButton,
  convertedNote,
} from "../loan-assistant/StartLoanButton";
import { ApiCallError, listLoanPlans, releaseLoanPlan, type LoanPlan } from "./api";
import { BookCover } from "./SearchScreen";

export const PLANS_TITLE = "빌릴 예정";
export const PLANS_EMPTY =
  "아직 빌릴 예정에 담은 책이 없어요. 책을 찾은 뒤 '빌릴 예정에 저장'을 눌러 보세요.";
export const PLANS_FAILED = "빌릴 예정 목록을 불러오지 못했어요.";
export const RELEASE_FAILED = "빼지 못했어요. 다시 시도해 주세요.";
export const RELEASE_CONFLICT = "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요."; // L3-#7

type ListState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: LoanPlan[]; nextCursor: string | null };

/** `onLoanStarted`: 예정을 내 대출로 옮겼거나(성공) 이미 바뀐 내용이라 다시 읽어야 할 때 — 위 "내 대출"을 다시 읽게 한다. */
export function LoanPlansSection({ onLoanStarted }: { onLoanStarted?: () => void } = {}) {
  const router = useRouter();
  const runner = useMemo(() => createLatestRunner(), []);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [moreBusy, setMoreBusy] = useState(false);
  const [releasing, setReleasing] = useState<ReadonlySet<string>>(new Set());
  const releasingRef = useRef(new Set<string>()); // 같은 항목은 한 번만 보낸다(N10)
  const [notice, setNotice] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null); // "빌렸어요" 성공 안내(M10 ②)

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    setNotice(null);
    const r = await runner.run((signal) => listLoanPlans({ cursor: null }, signal));
    if (r.status === "stale") return;
    setList(r.status === "ok" ? { kind: "ready", items: r.value.items, nextCursor: r.value.next_cursor } : { kind: "error" });
  }, [runner]);

  // 상세에서 저장하고 탭으로 오면 새로 읽는다. 포커스를 잃으면 진행 중인 읽기는 버린다.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => runner.cancel();
    }, [load, runner])
  );

  const loadMore = async () => {
    if (list.kind !== "ready" || list.nextCursor === null || moreBusy) return;
    setMoreBusy(true);
    const r = await runner.run((signal) => listLoanPlans({ cursor: list.nextCursor }, signal));
    setMoreBusy(false);
    if (r.status === "stale") return;
    if (r.status === "error") {
      setNotice(PLANS_FAILED);
      return;
    }
    setList((prev) => {
      if (prev.kind !== "ready") return prev;
      const seen = new Set(prev.items.map((p) => p.id));
      return {
        kind: "ready",
        items: [...prev.items, ...r.value.items.filter((p) => !seen.has(p.id))],
        nextCursor: r.value.next_cursor,
      };
    });
  };

  // 보이는 예정을 다 뺐는데 다음 쪽이 남아 있으면 빈 안내 대신 다음 쪽을 바로 읽는다(사후 검토 ②-1)
  const emptyWithMore = list.kind === "ready" && list.items.length === 0 && list.nextCursor !== null;
  useEffect(() => {
    if (emptyWithMore && !moreBusy) void loadMore();
    // loadMore는 렌더마다 새로 만들어지므로 조건 값만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyWithMore, moreBusy]);

  const loanStarted = (planId: string, loan: Loan) => {
    runner.cancel();
    if (list.kind === "ready") {
      setList((prev) =>
        prev.kind === "ready" ? { ...prev, items: prev.items.filter((p) => p.id !== planId) } : prev
      );
    } else {
      void load();
    }
    setNotice(null);
    setBanner(convertedNote(loan));
    onLoanStarted?.();
  };

  const loanFailed = (error: unknown) => {
    setBanner(null);
    const changed = error instanceof ApiCallError && (error.status === 409 || error.status === 404); // M-#4·#5
    if (changed) {
      void load();
      onLoanStarted?.();
    }
    setNotice(changed ? START_CONFLICT : START_FAILED); // load()가 지운 뒤에 다시 적는다
  };

  const release = async (planId: string) => {
    if (releasingRef.current.has(planId)) return;
    releasingRef.current.add(planId);
    setReleasing(new Set(releasingRef.current));
    setNotice(null);
    setBanner(null);
    try {
      await releaseLoanPlan(planId); // 확인창 없이 바로(N10)
      setList((prev) =>
        prev.kind === "ready" ? { ...prev, items: prev.items.filter((p) => p.id !== planId) } : prev
      );
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 404) {
        void load(); // 이미 없는 예정 — 목록을 새로 읽는다(L3-#6)
      } else {
        setNotice(e instanceof ApiCallError && e.status === 409 ? RELEASE_CONFLICT : RELEASE_FAILED);
      }
    } finally {
      releasingRef.current.delete(planId);
      setReleasing(new Set(releasingRef.current));
    }
  };

  const sectionGauge =
    list.kind === "ready" ? `PLANNED · ${String(list.items.length).padStart(2, "0")}` : "PLANNED";

  return (
    <View testID="loan-plans" style={styles.section}>
      <View>
        <Text style={styles.gauge} numberOfLines={1}>{sectionGauge}</Text>
        <Text style={styles.title} numberOfLines={1}>{PLANS_TITLE}</Text>
      </View>

      {list.kind === "loading" && <ActivityIndicator accessibilityLabel="불러오는 중" style={styles.busy} />}

      {list.kind === "error" && (
        <View style={styles.box}>
          <Text style={styles.text}>{PLANS_FAILED}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.darkBtnText} numberOfLines={1}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {list.kind === "ready" && list.items.length === 0 && list.nextCursor === null && (
        <View style={styles.box}>
          <Text style={styles.text}>{PLANS_EMPTY}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/search")}
            style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.darkBtnText} numberOfLines={1}>책 찾아보기</Text>
          </Pressable>
        </View>
      )}

      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!banner && (
        <View testID="loan-converted-note" style={styles.box}>
          <Text style={styles.text}>{banner}</Text>
        </View>
      )}

      {list.kind === "ready" &&
        list.items.map((plan) => {
          const busy = releasing.has(plan.id);
          const where = [plan.library.name, plan.library.area_label].filter(Boolean).join(" · ");
          return (
            <View key={plan.id} testID={`plan-${plan.id}`} style={styles.card}>
              <View style={styles.topRow}>
                <BookCover book={plan.book} style={styles.cover} fontSize={9} />
                <View style={styles.flex}>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {plan.book.title}
                  </Text>
                  {!!plan.book.author && <Text style={styles.meta} numberOfLines={1}>{plan.book.author}</Text>}
                  <Text style={styles.meta} numberOfLines={1}>{where}</Text>
                </View>
              </View>
              <View style={styles.actBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void release(plan.id)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.release, pressed && !busy && styles.dim, busy && styles.dim]}
                >
                  <Text style={styles.releaseText} numberOfLines={1}>빼기</Text>
                </Pressable>
                <StartLoanButton
                  variant="plan"
                  input={{ isbn13: plan.book.isbn13, libraryId: plan.library.id, planId: plan.id }}
                  onStarted={(loan) => loanStarted(plan.id, loan)}
                  onFailed={loanFailed}
                />
              </View>
            </View>
          );
        })}

      {list.kind === "ready" && list.nextCursor !== null && (
        <Pressable
          accessibilityRole="button"
          disabled={moreBusy}
          onPress={() => void loadMore()}
          style={({ pressed }) => [styles.more, pressed && !moreBusy && ACT.secondaryPressed, moreBusy && styles.dim]}
        >
          <Text style={styles.moreText} numberOfLines={1}>더 보기</Text>
        </Pressable>
      )}
    </View>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  section: { gap: 10 },
  gauge: { ...T.gauge },
  title: { ...T.title },
  busy: { marginVertical: 16 },
  box: { ...cardSurface(theme, { onPanel: true }), padding: 16, gap: 12, alignItems: "flex-start" },
  text: { fontSize: 15, color: c.text, lineHeight: 22 },
  notice: { fontSize: 14, color: c.loanOut },
  card: { ...cardSurface(theme, { onPanel: true }), padding: 12, gap: 8 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cover: { width: 44, height: 62, flexShrink: 0 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  bookTitle: { ...T.name },
  meta: { fontSize: 12, color: c.textSub },
  actBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.seamHairline,
  },
  release: { paddingVertical: 4, paddingHorizontal: 2, flexShrink: 0 },
  releaseText: { fontSize: 13, color: c.inkMuted, fontWeight: "500" },
  dim: { opacity: 0.5 },
  more: {
    alignSelf: "center",
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  moreText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
  darkBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
