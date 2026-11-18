// "빌렸어요" 버튼(loan-assistant.md LOAN-1 M10, C6 M-#1·#8).
// - detail: 책 상세 "빌릴 예정에 저장" 아래 보조 버튼. 확인창 없이 바로 기록하고, 결과 안내를 버튼 아래에 직접 보인다.
// - plan: 빌릴 예정 카드 아래 줄눈 행동 줄 오른쪽의 텍스트 행동("빌렸어요->"). 결과 안내는 부모(빌릴 예정 구역)가 배너로 보인다.
// 대출일·예정일은 서버가 정한다(M2). 진행 중에는 "기록 중…"으로 막아 한 번만 보낸다(M-#8).
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { actionColors, cardSurface, theme } from "../../theme";
import { startLoan, type Loan } from "./api";

export const START_LABEL = "빌렸어요";
export const START_PLAN_LABEL = "빌렸어요->";
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
  | { variant: "detail"; input: Input; leftSlot?: ReactNode }
  | { variant: "plan"; input: Input; onStarted(loan: Loan): void; onFailed(error: unknown): void };

export function StartLoanButton(props: Props) {
  const router = useRouter();
  const { status: authStatus, userId } = useAuth();
  const sending = useRef(false);
  const reqGen = useRef(0);
  const userIdRef = useRef<string | null>(userId);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "login" | "failed" } | { kind: "started"; loan: Loan } | null>(null);

  useEffect(() => {
    if (userIdRef.current !== userId || authStatus === "signedOut") {
      userIdRef.current = userId;
      reqGen.current += 1;
      sending.current = false;
      setBusy(false);
      setNote(null);
    }
  }, [userId, authStatus]);

  const press = async () => {
    if (sending.current || authStatus === "loading") return; // 로그인 복원 중에는 아무것도 하지 않는다
    if (authStatus !== "signedIn") {
      setNote({ kind: "login" }); // 비로그인은 서버에 묻지 않는다(M-#1)
      return;
    }
    const gen = reqGen.current;
    const reqUserId = userId;
    sending.current = true;
    setBusy(true);
    setNote(null);
    try {
      const loan = await startLoan(props.input);
      if (reqGen.current !== gen || userIdRef.current !== reqUserId) return;
      if (props.variant === "plan") props.onStarted(loan);
      else setNote({ kind: "started", loan });
    } catch (error) {
      if (reqGen.current !== gen || userIdRef.current !== reqUserId) return;
      if (props.variant === "plan") props.onFailed(error);
      else setNote({ kind: "failed" });
    } finally {
      if (reqGen.current === gen) {
        sending.current = false;
        setBusy(false);
      }
    }
  };

  const compact = props.variant === "plan";
  const button = (
    <Pressable
      testID={compact ? `start-loan-${props.input.planId ?? props.input.isbn13}` : "start-loan"}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={() => void press()}
      style={({ pressed }) => [
        compact ? styles.planLink : [styles.wide, props.leftSlot ? styles.detailRight : styles.wideMargin],
        !compact && pressed && ACT.secondaryPressed,
        compact && pressed && styles.dim,
        busy && styles.dim,
      ]}
    >
      <Text style={compact ? styles.planLinkText : styles.wideText} numberOfLines={1}>
        {busy ? START_BUSY : compact ? START_PLAN_LABEL : START_LABEL}
      </Text>
    </Pressable>
  );

  return (
    <>
      {!compact && props.leftSlot ? (
        <View style={styles.detailRow}>
          {props.leftSlot}
          {button}
        </View>
      ) : (
        button
      )}
      {!compact && note?.kind === "login" && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{LOGIN_TO_LOAN}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/login")}
            style={({ pressed }) => [styles.smallBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.smallBtnText} numberOfLines={1}>로그인</Text>
          </Pressable>
        </View>
      )}
      {!compact && note?.kind === "started" && (
        <View testID="loan-started-note" style={styles.note}>
          <Text style={styles.noteText}>{startedNote(note.loan)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/loans")}
            style={({ pressed }) => [styles.smallBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.smallBtnText} numberOfLines={1}>내 대출 보기</Text>
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
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  wide: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    height: 48,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wideMargin: { marginTop: 10 },
  detailRight: { flex: 1, flexShrink: 0 },
  wideText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "500" },
  planLink: { paddingVertical: 4, paddingHorizontal: 2, flexShrink: 0 },
  planLinkText: { fontSize: 13, color: c.inkStrong, fontWeight: "500" },
  dim: { opacity: 0.5 },
  note: {
    marginTop: 10,
    ...cardSurface(theme, { onPanel: true }),
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
  smallBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
