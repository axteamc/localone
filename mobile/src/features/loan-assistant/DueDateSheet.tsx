// 반납 예정일 고치는 하단 시트(loan-assistant.md LOAN-2 E6, C6 R-#1~#3).
// 새 날짜 패키지 없이 순수 React Native(Modal·TextInput·Pressable)로 만든다. 날짜는 "YYYY-MM-DD" 글자로만 다룬다.
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../../theme";
import { ApiCallError, changeDueDate, type Loan } from "./api";

export const SHEET_TITLE = "반납 예정일 고치기";
export const sheetSubtitle = (loan: Loan) => `대출일 ${loan.loaned_on}부터 고를 수 있어요.`;
export const dateTooEarly = (loan: Loan) => `대출일(${loan.loaned_on}) 이후 날짜를 골라 주세요.`;
export const DUE_FAILED = "예정일을 바꾸지 못했어요. 다시 시도해 주세요.";

const YMD = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** 달력에 있는 날짜면 그대로, 아니면 null(예: 2026-02-30). */
export function parseYmd(value: string): string | null {
  const m = YMD.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? value : null;
}

/** 날짜 글자에 n일을 더한다(시간대 영향 없이 UTC 달력으로만 셈). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const CHIPS: [string, number][] = [
  ["하루 전", -1],
  ["하루 뒤", 1],
  ["+3일", 3],
  ["+7일", 7],
  ["+14일", 14],
];

/**
 * 열린 대출이 바뀔 때마다(닫힘·다른 책·다시 열기) 세대를 올린다. 요청은 보낼 때의 세대를 기억해 두고,
 * 끝났을 때 세대가 다르면 지금 창에 결과(닫기·오류 문구·보내는 중 해제)를 적용하지 않는다.
 * onReset은 새 세대가 시작될 때 창의 보내는 중 상태를 비우는 데 쓴다.
 */
export function useOpenGeneration(loan: Loan | null, onReset: () => void): MutableRefObject<number> {
  const gen = useRef(0);
  const reset = useRef(onReset);
  reset.current = onReset;
  useLayoutEffect(() => {
    gen.current += 1;
    reset.current();
  }, [loan]);
  return gen;
}

type Props = {
  /** 고칠 대출. null이면 닫혀 있다 */
  loan: Loan | null;
  onClose(): void;
  onSaved(loan: Loan): void;
  /** 409(반납됨)·404(이미 없음): 시트를 닫고 목록을 다시 읽게 한다(R-#2·#3) */
  onChanged(): void;
  /**
   * 닫았거나 다른 책으로 바뀐 시트의 앞 저장이 늦게 끝났을 때: 지금 시트는 건드리지 않고 목록만 맞춘다.
   * 저장됐으면 그 대출, 409·404면 null. 실패(503·422 등)는 알리지 않는다(지금 시트에 엉뚱한 문구 금지).
   */
  onLateResult(saved: Loan | null): void;
};

export function DueDateSheet({ loan, onClose, onSaved, onChanged, onLateResult }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const gen = useOpenGeneration(loan, () => {
    sending.current = false;
    setBusy(false);
  });

  useEffect(() => {
    if (!loan) return;
    setValue(loan.due_on);
    setError(null);
  }, [loan]);

  if (!loan) return null;

  const base = parseYmd(value) ?? loan.due_on; // 빠른 조정은 지금 고른 날 기준(글자가 틀리면 원래 예정일)
  const save = async () => {
    if (sending.current) return;
    const due = parseYmd(value.trim());
    if (due === null || due < loan.loaned_on) {
      setError(dateTooEarly(loan)); // 보내지 않고 막는다(E6)
      return;
    }
    const mine = gen.current;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await changeDueDate(loan.id, due);
      if (mine === gen.current) onSaved(saved);
      else onLateResult(saved);
    } catch (e) {
      const changed = e instanceof ApiCallError && (e.status === 409 || e.status === 404);
      if (mine !== gen.current) {
        if (changed) onLateResult(null);
      } else if (changed) onChanged();
      else setError(e instanceof ApiCallError && e.status === 422 ? dateTooEarly(loan) : DUE_FAILED);
    } finally {
      if (mine === gen.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View testID="due-sheet" style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title}>{SHEET_TITLE}</Text>
              <Text style={styles.sub}>{sheetSubtitle(loan)}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <View style={styles.chips}>
            {CHIPS.map(([label, n]) => {
              const next = addDays(base, n);
              const off = next < loan.loaned_on;
              return (
                <Pressable
                  key={label}
                  testID={`due-chip-${n}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: off }}
                  disabled={off}
                  onPress={() => {
                    setValue(next);
                    setError(null);
                  }}
                  style={[styles.chip, off && styles.dim]}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            testID="due-input"
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textSub}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={styles.input}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="due-save"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void save()}
            style={[styles.save, busy && styles.dim]}
          >
            <Text style={styles.saveText}>{busy ? "저장 중…" : "저장"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: c.shadowFloat },
  sheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  title: { fontSize: 17, fontWeight: "700", color: c.text },
  sub: { fontSize: 13, color: c.textSub, marginTop: 4 },
  close: { fontSize: 15, color: c.text, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: theme.radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 14, color: c.text, fontWeight: "600" },
  input: {
    backgroundColor: c.cream,
    borderRadius: theme.radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: c.text,
  },
  error: { fontSize: 14, color: c.loanOut },
  save: {
    backgroundColor: c.inkStrong,
    borderRadius: theme.radii.inner,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: c.paper, fontSize: 16, fontWeight: "700" },
  dim: { opacity: 0.5 },
});
