// "빌렸어요" 버튼(loan-assistant.md LOAN-1 M10, C6 M-#1·#8).
// - detail: 책 상세 "빌릴 예정에 저장" 아래 보조 버튼. 확인창 없이 바로 기록하고, 결과 안내를 버튼 아래에 직접 보인다.
// - plan: 빌릴 예정 카드의 "빼기" 옆 작은 버튼. 결과 안내는 부모(빌릴 예정 구역)가 배너로 보인다.
// 대출일·예정일은 서버가 정한다(M2). 진행 중에는 "기록 중…"으로 막아 한 번만 보낸다(M-#8).
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { theme, actionColors } from "../../theme";
import { startLoan, type Loan } from "./api";

export const START_LABEL = "빌렸어요";
export const START_BUSY = "기록 중…";
export const LOGIN_TO_LOAN = "로그인하면 대출을 기록할 수 있어요";
export const START_FAILED = "대출을 기록하지 못했어요. 다시 시도해 주세요.";
export const START_CONFLICT = "이미 바뀐 내용이에요. 목록을 새로 고쳤어요.";

const dueText = (loan: Loan) => `${loan.due_on}${loan.due_on_assumed ? "(추정)" : ""}`;
/** 책 상세에서 기록했을 때(M10 ①) */
export const startedNote = (loan: Loan) => `내 대출에 기록했어요. 반납 예정일은 ${dueText(loan)}예요.`;
/** 빌릴 예정에서 옮겼을 때(M10 ②) */
export const convertedNote = (loan: Loan) => `내 대출에 추가했어요. 반납 예정일은 ${dueText(loan)}예요.`;

type Input = { isbn13: string; libraryId?: number; planId?: string };

type Props =
  | { variant: "detail"; input: Input }
  | { variant: "plan"; input: Input; onStarted(loan: Loan): void; onFailed(error: unknown): void };

export function StartLoanButton(props: Props) {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "login" | "failed" } | { kind: "started"; loan: Loan } | null>(null);

  const press = async () => {
    if (sending.current || authStatus === "loading") return; // 로그인 복원 중에는 아무것도 하지 않는다
    if (authStatus !== "signedIn") {
      setNote({ kind: "login" }); // 비로그인은 서버에 묻지 않는다(M-#1)
      return;
    }
    sending.current = true;
    setBusy(true);
    setNote(null);
    try {
      const loan = await startLoan(props.input);
      if (props.variant === "plan") props.onStarted(loan);
      else setNote({ kind: "started", loan });
    } catch (error) {
      if (props.variant === "plan") props.onFailed(error);
      else setNote({ kind: "failed" });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const compact = props.variant === "plan";
  return (
    <>
      <Pressable
        testID={compact ? `start-loan-${props.input.planId ?? props.input.isbn13}` : "start-loan"}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void press()}
        style={[compact ? styles.pill : styles.wide, busy && styles.dim]}
      >
        <Text style={compact ? styles.pillText : styles.wideText}>{busy ? START_BUSY : START_LABEL}</Text>
      </Pressable>
      {!compact && note?.kind === "login" && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{LOGIN_TO_LOAN}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>로그인</Text>
          </Pressable>
        </View>
      )}
      {!compact && note?.kind === "started" && (
        <View testID="loan-started-note" style={styles.note}>
          <Text style={styles.noteText}>{startedNote(note.loan)}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/loans")} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>내 대출 보기</Text>
          </Pressable>
        </View>
      )}
      {!compact && note?.kind === "failed" && <Text style={styles.failed}>{START_FAILED}</Text>}
    </>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  wide: {
    marginTop: 10,
    ...ACT.secondary,
    borderRadius: theme.radii.inner,
    paddingVertical: 12,
    alignItems: "center",
  },
  wideText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "700" },
  pill: {
    ...ACT.secondary,
    borderRadius: theme.radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pillText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "700" },
  dim: { opacity: 0.5 },
  note: {
    marginTop: 10,
    backgroundColor: c.paper,
    borderRadius: theme.radii.card,
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
  },
  noteText: { fontSize: 15, color: c.text },
  failed: { marginTop: 8, fontSize: 14, color: c.loanOut },
  smallBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  smallBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "700" },
});
