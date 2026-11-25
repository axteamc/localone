// 대출·반납 탭의 "빌릴 예정" 구역(book-search.md LIB-3 N5·N9·N10, C6 L3-#6·#7)
// 카드마다 "빌렸어요"로 내 대출에 옮긴다(loan-assistant.md LOAN-1 M6·M10 ②, C6 M-#3~#5).
// 본인만 보는 메모 목록이다(N1). 로그인했을 때만 그린다(비로그인 처리는 탭 화면).
// LIB-3b(Y-6): 미지정 예정도 읽고(#16 include_unassigned, U5·U7), 체크로 고른 예정을 "일괄 검색"(#70, V8·V9)·
// "빌렸어요"(일괄 빌림, §4 B1~B6)로 다룬다. 선택이 없으면 일괄 검색은 전체를 묻는다.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import type { Loan } from "../loan-assistant/api";
import {
  START_CONFLICT,
  START_FAILED,
  StartLoanButton,
  convertedNote,
} from "../loan-assistant/StartLoanButton";
import {
  ApiCallError,
  listLoanPlans,
  releaseLoanPlan,
  type BatchAvailabilityResponse,
  type LoanPlan,
} from "./api";
import { BATCH_STALE, BatchAvailabilityPanel } from "./BatchAvailabilityPanel";
import { BatchLoanSheet, UNASSIGNED_LABEL, type BatchLoanOutcome } from "./BatchLoanSheet";
import { BookCover } from "./SearchScreen";

export const PLANS_TITLE = "빌릴 예정";
export const PLANS_EMPTY =
  "아직 빌릴 예정에 담은 책이 없어요. 책 상세에서 '대출 예정'을 눌러 보세요.";
export const PLANS_FAILED = "빌릴 예정 목록을 불러오지 못했어요.";
export const RELEASE_FAILED = "빼지 못했어요. 다시 시도해 주세요.";
export const RELEASE_CONFLICT = "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요."; // L3-#7
export const SELECT_ALL = "전체 선택";
export const BULK_LOAN = "빌렸어요";
export const BATCH_SEARCH = "일괄 검색";
export const bulkLoanLabel = (n: number) => (n > 0 ? `선택한 ${n}권 빌렸어요` : BULK_LOAN);
export const movedNote = (n: number) => `${n}권을 내 대출로 옮겼어요.`;
export const failedNote = (n: number) => `${n}권은 옮기지 못했어요. 다시 시도해 주세요.`; // B4
export const alreadyNote = (n: number) => `${n}권은 이미 빌린 책이에요. 빌릴 예정에 남겨 두었어요.`; // B5 기본값(Claude)
/** B4 재조회 크기(#16 `limit` 상한) */
const RELOAD_LIMIT = 50;

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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRes, setBatchRes] = useState<BatchAvailabilityResponse | null>(null);
  const [batchLibrary, setBatchLibrary] = useState<number | null>(null);
  const [loanSheetOpen, setLoanSheetOpen] = useState(false);

  /** 첫 쪽을 다시 읽는다. 읽은 결과를 돌려준다(B4 판정용). */
  const load = useCallback(
    async (limit?: number): Promise<{ items: LoanPlan[]; nextCursor: string | null } | null> => {
      setList({ kind: "loading" });
      setNotice(null);
      const r = await runner.run((signal) =>
        listLoanPlans({ cursor: null, limit, includeUnassigned: true }, signal)
      );
      if (r.status === "stale") return null;
      if (r.status === "error") {
        setList({ kind: "error" });
        return null;
      }
      const next = { items: r.value.items, nextCursor: r.value.next_cursor };
      setList({ kind: "ready", ...next });
      // 목록에서 사라진 예정은 선택에서도 뺀다
      const ids = new Set(next.items.map((p) => p.id));
      setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
      return next;
    },
    [runner]
  );

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
    const r = await runner.run((signal) =>
      listLoanPlans({ cursor: list.nextCursor, includeUnassigned: true }, signal)
    );
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

  const unselect = (planId: string) =>
    setSelected((prev) => {
      if (!prev.has(planId)) return prev;
      const next = new Set(prev);
      next.delete(planId);
      return next;
    });

  const toggle = (planId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });

  const items = list.kind === "ready" ? list.items : [];
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)));
  const selectedPlans = items.filter((p) => selected.has(p.id));
  const batchPlanIds = selectedPlans.length > 0 ? selectedPlans.map((p) => p.id) : null; // V8 선택 없으면 전체
  const distinctIsbns = new Set(selectedPlans.map((p) => p.book.isbn13)).size;

  /** B4: 모든 호출이 끝나면 #16을 다시 읽어, 서버에서 빠진 예정만 목록에서 뺀다. 실패·이미 빌린 예정은 선택을 유지한다. */
  const batchDone = async (outcomes: BatchLoanOutcome[]) => {
    setLoanSheetOpen(false);
    setBatchOpen(false); // 옮긴 뒤의 조회 결과는 낡았다
    setBatchRes(null);
    setBatchLibrary(null);
    setBanner(null);
    const fresh = await load(RELOAD_LIMIT);
    if (fresh === null) {
      setNotice(PLANS_FAILED);
      return;
    }
    const remaining = new Set(fresh.items.map((p) => p.id));
    const complete = fresh.nextCursor === null; // 첫 쪽에 다 들어왔을 때만 "없음"을 믿는다
    let moved = 0;
    let failed = 0;
    let already = 0;
    for (const o of outcomes) {
      const gone = !remaining.has(o.planId) && (complete || o.kind === "converted");
      if (gone) moved += 1;
      else if (o.kind === "already") already += 1;
      else if (o.kind === "failed" || o.kind === "converted") failed += 1;
    }
    setSelected(new Set(outcomes.filter((o) => remaining.has(o.planId)).map((o) => o.planId)));
    if (moved > 0) {
      setBanner(movedNote(moved));
      onLoanStarted?.();
    }
    const notes = [failed > 0 ? failedNote(failed) : null, already > 0 ? alreadyNote(already) : null];
    const text = notes.filter(Boolean).join(" ");
    setNotice(text || null);
  };

  const loanStarted = (planId: string, loan: Loan) => {
    runner.cancel();
    unselect(planId);
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
      unselect(planId);
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
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{PLANS_TITLE}</Text>
          {list.kind === "ready" && (
            <Text testID="plans-count" style={styles.count} numberOfLines={1}>{`${list.items.length}권`}</Text>
          )}
        </View>
      </View>

      {items.length > 0 && (
        <>
          <Pressable
            testID="select-all"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            onPress={toggleAll}
            style={styles.checkRow}
          >
            <CheckBox on={allSelected} />
            <Text style={styles.checkText}>{SELECT_ALL}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              testID="bulk-loan"
              accessibilityRole="button"
              accessibilityState={{ disabled: selectedPlans.length === 0 }}
              disabled={selectedPlans.length === 0}
              onPress={() => {
                setNotice(null);
                setBanner(null);
                setLoanSheetOpen(true);
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                ACT.secondary,
                pressed && ACT.secondaryPressed,
                selectedPlans.length === 0 && styles.dim,
              ]}
            >
              <Text style={[styles.actionText, ACT.secondaryText]} numberOfLines={1}>
                {bulkLoanLabel(selectedPlans.length)}
              </Text>
            </Pressable>
            <Pressable
              testID="batch-search"
              accessibilityRole="button"
              accessibilityState={{ expanded: batchOpen }}
              onPress={() => setBatchOpen((v) => !v)}
              style={({ pressed }) => [styles.actionBtn, ACT.primary, pressed && ACT.primaryPressed]}
            >
              <Text style={[styles.actionText, ACT.primaryText]} numberOfLines={1}>{BATCH_SEARCH}</Text>
            </Pressable>
          </View>
        </>
      )}

      {batchOpen && list.kind === "ready" && items.length > 0 && (
        <BatchAvailabilityPanel
          planIds={batchPlanIds}
          distinctIsbnCount={distinctIsbns}
          selectedLibraryId={batchLibrary}
          onSelectLibrary={setBatchLibrary}
          onResult={setBatchRes}
          onStale={() => {
            setBatchOpen(false); // 목록이 바뀌었다 — 새 목록으로 다시 고르게 한다
            void load().then(() => setNotice(BATCH_STALE));
          }}
          onClose={() => setBatchOpen(false)}
        />
      )}

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
          const where = plan.library
            ? [plan.library.name, plan.library.area_label].filter(Boolean).join(" · ")
            : UNASSIGNED_LABEL; // U7
          const on = selected.has(plan.id);
          return (
            <View key={plan.id} testID={`plan-${plan.id}`} style={styles.card}>
              <View style={styles.topRow}>
                <Pressable
                  testID={`select-plan-${plan.id}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${plan.book.title} 선택`}
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(plan.id)}
                  hitSlop={8}
                  style={styles.checkHit}
                >
                  <CheckBox on={on} />
                </Pressable>
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
                  input={{ isbn13: plan.book.isbn13, libraryId: plan.library?.id, planId: plan.id }} // B3 미지정은 안 보냄
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

      <BatchLoanSheet
        visible={loanSheetOpen}
        plans={selectedPlans}
        candidates={batchRes?.candidates ?? []}
        prefillLibraryId={batchLibrary}
        onClose={() => setLoanSheetOpen(false)}
        onDone={(outcomes) => void batchDone(outcomes)}
      />
    </View>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <View style={[styles.box16, on && styles.box16On]}>
      {on && (
        <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
          <Path
            d="M2.5 6.2 L4.8 8.5 L9.5 3.6"
            stroke={c.panelLit}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
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
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  count: { fontSize: 14, color: c.textSub },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, alignSelf: "flex-start" },
  checkText: { fontSize: 14, color: c.text },
  checkHit: { minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" },
  box16: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.control,
    borderWidth: 1.5,
    borderColor: c.seamHairline,
    backgroundColor: c.panelLit,
    alignItems: "center",
    justifyContent: "center",
  },
  box16On: { backgroundColor: c.inkStrong, borderColor: c.inkStrong },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 15, fontWeight: "500" },
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
