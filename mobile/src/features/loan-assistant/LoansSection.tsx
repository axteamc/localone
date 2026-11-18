// 대출·반납 탭의 "내 대출" 구역(loan-assistant.md LOAN-1 M8·M9, LOAN-2 E6~E8).
// "빌린 책"(반납 임박 순)·"지난 대출"(최근 반납 순) 두 탭. 로그인했을 때만 그린다(비로그인 처리는 탭 화면).
// D-day는 서버가 준 d_day·is_overdue만 쓴다(기기 날짜로 다시 계산하지 않는다, M4).
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { theme, actionColors } from "../../theme";
import { BookCover } from "../book-search/SearchScreen";
import { ApiCallError, listLoans, returnLoan, type Loan, type LoanStatus } from "./api";
import { ddayColors, ddayFormat } from "./dday";
import { DueDateSheet, useOpenGeneration } from "./DueDateSheet";

export const LOANS_TITLE = "내 대출";
export const LOANS_EMPTY = "지금 빌린 책이 없어요. 책 상세나 빌릴 예정에서 '빌렸어요'를 눌러 보세요.";
export const RETURNED_EMPTY = "아직 반납한 책이 없어요.";
export const LOANS_FAILED = "내 대출을 불러오지 못했어요.";
export const CHANGED = "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요.";
export const RETURN_TITLE = "이 책을 반납했나요?";
export const returnBody = (loan: Loan) => `${loan.book.title}을 지난 대출로 옮길게요.`;
export const RETURNED_NOTE = "반납 처리했어요. 지난 대출에서 다시 볼 수 있어요.";
export const RETURN_FAILED = "반납 처리하지 못했어요. 다시 시도해 주세요.";

export const loanDates = (loan: Loan) =>
  `대출 ${loan.loaned_on} · 예정 ${loan.due_on}${loan.due_on_assumed ? " (추정)" : ""}`;
export const returnedDates = (loan: Loan) => `대출 ${loan.loaned_on} · 반납 ${loan.returned_on ?? ""}`;

const TABS: [LoanStatus, string][] = [
  ["on_loan", "빌린 책"],
  ["returned", "지난 대출"],
];

type ListState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: Loan[]; nextCursor: string | null };

/** `refreshKey`가 바뀌면 다시 읽는다(빌릴 예정에서 "빌렸어요"를 눌렀을 때, M10 ②). */
export function LoansSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const runner = useMemo(() => createLatestRunner(), []);
  const [tab, setTab] = useState<LoanStatus>("on_loan");
  const tabRef = useRef<LoanStatus>("on_loan");
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [moreBusy, setMoreBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [returning, setReturning] = useState<Loan | null>(null);

  /**
   * 첫 페이지부터 읽는다. 새 읽기는 진행 중인 앞 읽기(포커스·탭 전환·더 보기)를 모두 무효화한다(createLatestRunner).
   * quiet: 쓰기 성공 뒤 다시 맞추기 — 지금 카드를 그대로 둔 채 서버 순서·커서로 바꾼다(실패하면 카드는 두고 안내).
   */
  const load = useCallback(
    async (status: LoanStatus = tabRef.current, opts: { quiet?: boolean } = {}) => {
      if (!opts.quiet) {
        setList({ kind: "loading" });
        setNotice(null);
      }
      const r = await runner.run((signal) => listLoans(status, { cursor: null }, signal));
      if (r.status === "stale") return; // 늦게 온 앞 응답(다른 탭·쓰기 전 읽기 포함)은 버린다(AC-RACE)
      if (r.status === "ok") {
        setList({ kind: "ready", items: r.value.items, nextCursor: r.value.next_cursor });
      } else if (opts.quiet) {
        setList((prev) => (prev.kind === "ready" ? prev : { kind: "error" }));
        setNotice(LOANS_FAILED);
      } else {
        setList({ kind: "error" });
      }
    },
    [runner]
  );

  /**
   * 기한 수정·반납이 서버에 반영된 뒤: 그 전에 시작한 목록 읽기는 모두 버리고(반납한 카드·옛 예정일이 돌아오지 않게, E7),
   * 첫 페이지부터 다시 읽어 반납 임박 순과 다음 페이지 커서를 서버 기준으로 맞춘다(LOAN-1 M8·C2).
   */
  const refreshAfterWrite = () => void load(tabRef.current, { quiet: true });

  // 탭으로 돌아올 때마다 새로 읽는다(책 상세에서 "빌렸어요" → "내 대출 보기"). 포커스를 잃으면 진행 중인 읽기는 버린다.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => runner.cancel();
    }, [load, runner])
  );

  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === firstKey.current) return; // 처음 그릴 때는 위 포커스 읽기가 맡는다
    firstKey.current = refreshKey;
    void load();
  }, [refreshKey, load]);

  const switchTab = (next: LoanStatus) => {
    if (next === tabRef.current) return;
    tabRef.current = next;
    setTab(next);
    setBanner(null);
    void load(next);
  };

  /** 409·404: 이미 바뀐 내용 — 목록을 다시 읽고 안내(load가 지운 뒤에 적는다) */
  const changedElsewhere = () => {
    setBanner(null);
    void load();
    setNotice(CHANGED);
  };

  const loadMore = async () => {
    if (list.kind !== "ready" || list.nextCursor === null || moreBusy) return;
    setMoreBusy(true);
    const r = await runner.run((signal) => listLoans(tabRef.current, { cursor: list.nextCursor }, signal));
    setMoreBusy(false);
    if (r.status === "stale") return;
    if (r.status === "error") {
      setNotice(LOANS_FAILED);
      return;
    }
    setList((prev) => {
      if (prev.kind !== "ready") return prev;
      const seen = new Set(prev.items.map((x) => x.id));
      return {
        kind: "ready",
        items: [...prev.items, ...r.value.items.filter((x) => !seen.has(x.id))],
        nextCursor: r.value.next_cursor,
      };
    });
  };

  /** 저장한 카드는 바로 새 예정일로 바꾸고, 순서·커서는 다시 읽어 맞춘다 */
  const replace = (loan: Loan) => {
    setList((prev) =>
      prev.kind === "ready" ? { ...prev, items: prev.items.map((x) => (x.id === loan.id ? loan : x)) } : prev
    );
    refreshAfterWrite();
  };
  /** 반납한 카드는 바로 빼고(E7), 다시 읽어 맞춘다 */
  const remove = (loanId: string) => {
    setList((prev) => (prev.kind === "ready" ? { ...prev, items: prev.items.filter((x) => x.id !== loanId) } : prev));
    refreshAfterWrite();
  };

  const onLoan = tab === "on_loan";
  return (
    <View testID="my-loans" style={styles.section}>
      <Text style={styles.title}>{LOANS_TITLE}</Text>

      <View style={styles.tabs}>
        {TABS.map(([status, label]) => {
          const on = status === tab;
          return (
            <Pressable
              key={status}
              testID={`loans-tab-${status}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => switchTab(status)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {list.kind === "loading" && <ActivityIndicator accessibilityLabel="불러오는 중" style={styles.busy} />}

      {list.kind === "error" && (
        <View style={styles.box}>
          <Text style={styles.text}>{LOANS_FAILED}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.btn}>
            <Text style={styles.btnText}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {list.kind === "ready" && list.items.length === 0 && list.nextCursor === null && (
        <View style={styles.box}>
          <Text style={styles.text}>{onLoan ? LOANS_EMPTY : RETURNED_EMPTY}</Text>
        </View>
      )}

      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!banner && (
        <View testID="loans-banner" style={styles.box}>
          <Text style={styles.text}>{banner}</Text>
        </View>
      )}

      {list.kind === "ready" &&
        list.items.map((loan) =>
          onLoan ? (
            <LoanCard
              key={loan.id}
              loan={loan}
              onEdit={() => {
                setBanner(null);
                setNotice(null);
                setEditing(loan);
              }}
              onReturn={() => {
                setBanner(null);
                setNotice(null);
                setReturning(loan);
              }}
            />
          ) : (
            <ReturnedCard key={loan.id} loan={loan} />
          )
        )}

      {list.kind === "ready" && list.nextCursor !== null && (
        <Pressable
          accessibilityRole="button"
          disabled={moreBusy}
          onPress={() => void loadMore()}
          style={[styles.more, moreBusy && styles.dim]}
        >
          <Text style={styles.moreText}>더 보기</Text>
        </Pressable>
      )}

      <DueDateSheet
        loan={editing}
        onClose={() => setEditing(null)}
        onSaved={(loan) => {
          setEditing(null);
          replace(loan); // (추정)이 사라진다(E1)
          // TODO(연결): C LOAN-3-P1 — 예정일이 바뀌면 기기 알림 다시 맞추기(E5)
        }}
        onChanged={() => {
          setEditing(null);
          changedElsewhere();
        }}
        onLateResult={(saved) => (saved ? replace(saved) : refreshAfterWrite())}
      />

      <ReturnConfirm
        loan={returning}
        onCancel={() => setReturning(null)}
        onReturned={(loan) => {
          setReturning(null);
          remove(loan.id);
          setBanner(RETURNED_NOTE);
          // TODO(연결): C LOAN-3-P1 — 반납하면 기기 알림 지우기(E5)
        }}
        onChanged={() => {
          setReturning(null);
          changedElsewhere();
        }}
        onLateResult={(returned) => (returned ? remove(returned.id) : refreshAfterWrite())}
      />
    </View>
  );
}

function LoanCard({ loan, onEdit, onReturn }: { loan: Loan; onEdit(): void; onReturn(): void }) {
  const { label, tone } = ddayFormat(loan.d_day, loan.is_overdue);
  const pill = ddayColors(tone, theme.colors);
  return (
    <View testID={`loan-${loan.id}`} style={styles.card}>
      <View style={styles.row}>
        <BookCover book={loan.book} style={styles.cover} fontSize={9} />
        <View style={styles.flex}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {loan.book.title}
          </Text>
          {!!loan.book.author && <Text style={styles.meta}>{loan.book.author}</Text>}
          {!!loan.library && <Text style={styles.meta}>{loan.library.name}</Text>}
          <Text style={styles.meta}>{loanDates(loan)}</Text>
        </View>
        <View testID={`dday-${loan.id}`} style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{label}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.action}>
          <Text style={styles.actionText}>기한 수정</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onReturn} style={styles.action}>
          <Text style={styles.actionText}>반납했어요</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReturnedCard({ loan }: { loan: Loan }) {
  return (
    <View testID={`returned-${loan.id}`} style={[styles.card, styles.row]}>
      <BookCover book={loan.book} style={styles.cover} fontSize={9} />
      <View style={styles.flex}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {loan.book.title}
        </Text>
        {!!loan.book.author && <Text style={styles.meta}>{loan.book.author}</Text>}
        {!!loan.library && <Text style={styles.meta}>{loan.library.name}</Text>}
        <Text style={styles.meta}>{returnedDates(loan)}</Text>
      </View>
      <View style={[styles.pill, styles.donePill]}>
        <Text style={[styles.pillText, styles.doneText]}>반납 완료</Text>
      </View>
    </View>
  );
}

/**
 * 반납 확인 창(E8). 실패(503·네트워크)는 창을 닫지 않고 문구, 404·409는 닫고 목록 다시 읽기.
 * 창을 닫거나(안드로이드 뒤로 가기 포함) 다른 책 창을 연 뒤 앞 요청이 끝나면, 지금 창은 그대로 두고 onLateResult로 목록만 맞춘다.
 */
function ReturnConfirm({
  loan,
  onCancel,
  onReturned,
  onChanged,
  onLateResult,
}: {
  loan: Loan | null;
  onCancel(): void;
  onReturned(loan: Loan): void;
  onChanged(): void;
  /** 닫힌·바뀐 창의 늦은 결과: 반납됐으면 그 대출, 404·409면 null. 실패(503 등)는 알리지 않는다 */
  onLateResult(returned: Loan | null): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const gen = useOpenGeneration(loan, () => {
    sending.current = false;
    setBusy(false);
    setError(null);
  });
  if (!loan) return null;

  const confirm = async () => {
    if (sending.current) return;
    const mine = gen.current;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const returned = await returnLoan(loan.id);
      if (mine === gen.current) onReturned(returned);
      else onLateResult(returned);
    } catch (e) {
      const changed = e instanceof ApiCallError && (e.status === 404 || e.status === 409);
      if (mine !== gen.current) {
        if (changed) onLateResult(null);
      } else if (changed) onChanged();
      else setError(RETURN_FAILED);
    } finally {
      if (mine === gen.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.center}>
        <View testID="return-confirm" style={styles.dialog}>
          <Text style={styles.dialogTitle}>{RETURN_TITLE}</Text>
          <Text style={styles.text}>{returnBody(loan)}</Text>
          {!!error && <Text style={styles.notice}>{error}</Text>}
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.action}>
              <Text style={styles.actionText}>취소</Text>
            </Pressable>
            <Pressable
              testID="return-confirm-ok"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void confirm()}
              style={[styles.btn, busy && styles.dim]}
            >
              <Text style={styles.btnText}>{busy ? "처리 중…" : "반납했어요"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  section: { gap: 10 },
  title: { fontSize: 16, fontWeight: "700", color: c.text },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: theme.radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  tabOn: { backgroundColor: c.inkStrong, borderColor: c.inkStrong },
  tabText: { fontSize: 14, color: c.text, fontWeight: "600" },
  tabTextOn: { color: c.paper },
  busy: { marginVertical: 16 },
  box: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 16, gap: 12, alignItems: "flex-start" },
  text: { fontSize: 15, color: c.text, lineHeight: 22 },
  notice: { fontSize: 14, color: c.loanOut },
  card: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 12, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  cover: { width: 44, height: 62 },
  flex: { flex: 1 },
  bookTitle: { fontSize: 15, fontWeight: "700", color: c.text },
  meta: { fontSize: 13, color: c.textSub, marginTop: 2 },
  pill: { borderRadius: theme.radii.pill, paddingVertical: 5, paddingHorizontal: 12 },
  pillText: { fontSize: 13, fontWeight: "700" },
  donePill: { backgroundColor: c.surface2 },
  doneText: { color: c.inkSoft },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  action: {
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: theme.radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  actionText: { fontSize: 14, color: c.text, fontWeight: "600" },
  dim: { opacity: 0.5 },
  more: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  moreText: { fontSize: 14, color: c.text, fontWeight: "600" },
  btn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  btnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.shadowFloat },
  dialog: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 20, gap: 12 },
  dialogTitle: { fontSize: 17, fontWeight: "700", color: c.text },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
