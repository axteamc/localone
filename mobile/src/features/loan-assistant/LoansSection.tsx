// 대출·반납 탭의 "내 대출" 구역(loan-assistant.md LOAN-1 M8·M9).
// 도서관별로 묶지 않고 서버 정렬(반납 임박 순) 그대로 한 줄 목록. 로그인했을 때만 그린다(비로그인 처리는 탭 화면).
// D-day는 서버가 준 d_day·is_overdue만 쓴다(기기 날짜로 다시 계산하지 않는다, M4).
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { theme, actionColors } from "../../theme";
import { BookCover } from "../book-search/SearchScreen";
import { listLoans, type Loan } from "./api";
import { ddayColors, ddayFormat } from "./dday";

export const LOANS_TITLE = "내 대출";
export const LOANS_EMPTY = "지금 빌린 책이 없어요. 책 상세나 빌릴 예정에서 '빌렸어요'를 눌러 보세요.";
export const LOANS_FAILED = "내 대출을 불러오지 못했어요.";

export const loanDates = (loan: Loan) =>
  `대출 ${loan.loaned_on} · 예정 ${loan.due_on}${loan.due_on_assumed ? " (추정)" : ""}`;

type ListState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: Loan[]; nextCursor: string | null };

/** `refreshKey`가 바뀌면 다시 읽는다(빌릴 예정에서 "빌렸어요"를 눌렀을 때, M10 ②). */
export function LoansSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const runner = useMemo(() => createLatestRunner(), []);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [moreBusy, setMoreBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    setNotice(null);
    const r = await runner.run((signal) => listLoans("on_loan", { cursor: null }, signal));
    if (r.status === "stale") return; // 늦게 온 앞 응답은 버린다(AC-RACE)
    setList(r.status === "ok" ? { kind: "ready", items: r.value.items, nextCursor: r.value.next_cursor } : { kind: "error" });
  }, [runner]);

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

  const loadMore = async () => {
    if (list.kind !== "ready" || list.nextCursor === null || moreBusy) return;
    setMoreBusy(true);
    const r = await runner.run((signal) => listLoans("on_loan", { cursor: list.nextCursor }, signal));
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

  return (
    <View testID="my-loans" style={styles.section}>
      <Text style={styles.title}>{LOANS_TITLE}</Text>

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
          <Text style={styles.text}>{LOANS_EMPTY}</Text>
        </View>
      )}

      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      {list.kind === "ready" && list.items.map((loan) => <LoanCard key={loan.id} loan={loan} />)}

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
    </View>
  );
}

function LoanCard({ loan }: { loan: Loan }) {
  const { label, tone } = ddayFormat(loan.d_day, loan.is_overdue);
  const pill = ddayColors(tone, theme.colors);
  return (
    <View testID={`loan-${loan.id}`} style={styles.card}>
      <BookCover book={loan.book} style={styles.cover} fontSize={9} />
      <View style={styles.flex}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {loan.book.title}
        </Text>
        {!!loan.book.author && <Text style={styles.meta}>{loan.book.author}</Text>}
        {!!loan.library && <Text style={styles.meta}>{loan.library.name}</Text>}
        <Text style={styles.meta}>{loanDates(loan)}</Text>
        {/* TODO(연결): C LOAN-2-P2 — "기한 수정"·"반납했어요" 버튼 */}
      </View>
      <View testID={`dday-${loan.id}`} style={[styles.pill, { backgroundColor: pill.bg }]}>
        <Text style={[styles.pillText, { color: pill.fg }]}>{label}</Text>
      </View>
    </View>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  section: { gap: 10 },
  title: { fontSize: 16, fontWeight: "700", color: c.text },
  busy: { marginVertical: 16 },
  box: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 16, gap: 12, alignItems: "flex-start" },
  text: { fontSize: 15, color: c.text, lineHeight: 22 },
  notice: { fontSize: 14, color: c.loanOut },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 12,
  },
  cover: { width: 44, height: 62 },
  flex: { flex: 1 },
  bookTitle: { fontSize: 15, fontWeight: "700", color: c.text },
  meta: { fontSize: 13, color: c.textSub, marginTop: 2 },
  pill: { borderRadius: theme.radii.pill, paddingVertical: 5, paddingHorizontal: 12 },
  pillText: { fontSize: 13, fontWeight: "700" },
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
});
