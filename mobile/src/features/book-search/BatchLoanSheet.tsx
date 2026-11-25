// 일괄 빌림 확인 창(book-search.md LIB-3b §4 B1~B6, loan-assistant.md LOAN-1 M6)
// - 예정마다 도서관을 보인다. 지정 예정은 그 도서관, 미지정 예정은 "빌린 도서관"(일괄 검색 후보) 또는 "기록 안 함"을 고른다(B2).
// - 일괄 검색 창에서 고른 도서관은 후보로만 미리 채운다. 사용자가 이 창에서 "기록하기"를 눌러야 보낸다(자동 확정 없음).
// - 새 API 없이 `#20`을 예정마다 **순차로** 부른다(B1). 미지정 + "기록 안 함"은 `library_id`를 보내지 않는다(B3).
// - 끝난 뒤 목록 재조회·남길 예정 판정은 부모가 한다(B4). 다시 시도하면 같은 `plan_id`로 다시 보낸다(B6).
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { actionColors, theme, type as T } from "../../theme";
import { startLoan } from "../loan-assistant/api";
import type { BatchCandidate, LoanPlan } from "./api";
import { ModalFrame } from "../../theme/WebFrame";

export const BATCH_LOAN_TITLE = "선택한 책을 빌렸나요?";
export const BATCH_LOAN_SUBTITLE = "빌린 도서관을 확인해 주세요. 내 대출로 옮겨요.";
export const NO_LIBRARY = "기록 안 함"; // B2
export const UNASSIGNED_LABEL = "도서관 미정"; // U7
export const BATCH_LOAN_CONFIRM = "기록하기";
export const BATCH_LOAN_BUSY = "기록 중…";
export const PICK_LIBRARY_HINT = "빌린 도서관을 골라 주세요";

/** 예정마다의 결과. `already`는 같은 책이 이미 대출 중이라 `#20`이 기존 대출을 돌려준 경우(B5, M5) */
export type BatchLoanOutcome = { planId: string; kind: "converted" | "already" | "failed" };

/** 미지정 예정의 선택: 도서관 ID, `null` = 기록 안 함, `undefined` = 아직 안 고름 */
type Choice = number | null | undefined;

export function BatchLoanSheet({
  visible,
  plans,
  candidates,
  prefillLibraryId,
  onClose,
  onDone,
}: {
  visible: boolean;
  plans: LoanPlan[];
  /** 마지막 일괄 검색 후보(없으면 빈 배열 — 그때 미지정 예정은 "기록 안 함"만 고를 수 있다) */
  candidates: BatchCandidate[];
  /** 일괄 검색 창에서 선택한 도서관(후보로만 미리 채움) */
  prefillLibraryId: number | null;
  onClose(): void;
  onDone(outcomes: BatchLoanOutcome[]): void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 열 때마다 미리 채운다. 미리 채운 도서관이 그 책을 소장한 후보일 때만 넣는다.
  useEffect(() => {
    if (!visible) return;
    const next: Record<string, Choice> = {};
    for (const p of plans) {
      if (p.library !== null) continue;
      const pre = candidates.find(
        (cand) => cand.library.id === prefillLibraryId && cand.held_isbn13s.includes(p.book.isbn13)
      );
      next[p.id] = pre ? pre.library.id : undefined;
    }
    setChoices(next);
    // 열린 순간의 값만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const ready = plans.every((p) => p.library !== null || choices[p.id] !== undefined);
  const busy = progress !== null;

  const confirm = async () => {
    if (sending.current || !ready || plans.length === 0) return;
    sending.current = true;
    const outcomes: BatchLoanOutcome[] = [];
    setProgress({ done: 0, total: plans.length });
    for (const p of plans) {
      const libraryId = p.library !== null ? p.library.id : (choices[p.id] ?? undefined);
      try {
        const loan = await startLoan({ isbn13: p.book.isbn13, libraryId, planId: p.id });
        outcomes.push({ planId: p.id, kind: loan.plan_id === p.id ? "converted" : "already" });
      } catch {
        outcomes.push({ planId: p.id, kind: "failed" }); // 409·네트워크 포함 — 부모가 #16으로 맞춘다(B4·B6)
      }
      if (alive.current) setProgress({ done: outcomes.length, total: plans.length });
    }
    sending.current = false;
    if (!alive.current) return;
    setProgress(null);
    onDone(outcomes);
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={() => {
      if (!busy) onClose();
    }}><ModalFrame>
      <View style={styles.scrim}>
        <View testID="batch-loan-sheet" style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title}>{BATCH_LOAN_TITLE}</Text>
              <Text style={styles.subtitle}>{BATCH_LOAN_SUBTITLE}</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.close}>
              <Text style={[styles.closeText, busy && styles.dim]}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listPad}>
            {plans.map((p) => {
              const options = candidates.filter((cand) => cand.held_isbn13s.includes(p.book.isbn13));
              const choice = choices[p.id];
              return (
                <View key={p.id} testID={`batch-loan-row-${p.id}`} style={styles.row}>
                  <Text style={styles.name} numberOfLines={2}>{p.book.title}</Text>
                  {p.library !== null ? (
                    <Text style={styles.meta}>{p.library.name}</Text>
                  ) : (
                    <>
                      <Text style={styles.meta}>
                        {choice === undefined ? `${UNASSIGNED_LABEL} · ${PICK_LIBRARY_HINT}` : UNASSIGNED_LABEL}
                      </Text>
                      <View style={styles.chips}>
                        {options.map((cand) => (
                          <Chip
                            key={cand.library.id}
                            testID={`batch-loan-pick-${p.id}-${cand.library.id}`}
                            label={cand.library.name}
                            on={choice === cand.library.id}
                            disabled={busy}
                            onPress={() => setChoices((s) => ({ ...s, [p.id]: cand.library.id }))}
                          />
                        ))}
                        <Chip
                          testID={`batch-loan-none-${p.id}`}
                          label={NO_LIBRARY}
                          on={choice === null}
                          disabled={busy}
                          onPress={() => setChoices((s) => ({ ...s, [p.id]: null }))}
                        />
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            testID="batch-loan-confirm"
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || busy }}
            disabled={!ready || busy}
            onPress={() => void confirm()}
            style={({ pressed }) => [styles.confirm, pressed && ACT.primaryPressed, (!ready || busy) && styles.dim]}
          >
            <Text style={styles.confirmText} numberOfLines={1}>
              {progress ? `${BATCH_LOAN_BUSY} ${progress.done}/${progress.total}` : BATCH_LOAN_CONFIRM}
            </Text>
          </Pressable>
        </View>
      </View>
    </ModalFrame></Modal>
  );
}

function Chip({
  testID,
  label,
  on,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  on: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const c = theme.colors;
const ACT = actionColors(c);
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: c.shadowSoft },
  sheet: {
    backgroundColor: c.panelLit,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: c.seamHairline,
    borderTopLeftRadius: theme.radii.infoCard,
    borderTopRightRadius: theme.radii.infoCard,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
    maxHeight: "85%",
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  title: { ...T.title },
  subtitle: { fontSize: 13, color: c.textSub, marginTop: 4, lineHeight: 19 },
  close: { paddingVertical: 4, paddingHorizontal: 6 },
  closeText: { fontSize: 15, color: c.text, fontWeight: "500" },
  list: { flexGrow: 0 },
  listPad: { gap: 8 },
  row: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.seamHairline },
  name: { fontSize: 15, fontWeight: "500", color: c.text },
  meta: { fontSize: 13, color: c.textSub },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: theme.radii.control,
    borderWidth: 1,
    borderColor: c.seamHairline,
  },
  chipOn: { borderColor: c.inkStrong, backgroundColor: c.inkStrong },
  chipText: { fontSize: 13, color: c.text },
  chipTextOn: { color: c.panelLit, fontWeight: "500" },
  confirm: {
    ...ACT.primary,
    height: 48,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  dim: { opacity: 0.5 },
});
