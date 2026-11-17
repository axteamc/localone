// 빌릴 예정 담기: 도서관을 고르는 하단 시트(book-search.md LIB-3 N3·N7·N8, C6 L3-#3·#5)
// 본인만 보는 메모이고 도서관 예약이 아니다(N1) — "예약"·"예약됨"·"확보" 낱말을 쓰지 않는다.
// 후보는 지금 상세에서 찾아본 도서관 목록(LIB-2)이다.
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AvailabilityItem } from "../../lib/publicApi";
import { theme, actionColors } from "../../theme";
import { ApiCallError, saveLoanPlan, type LoanPlan } from "./api";
import { distanceLabel, holdingText } from "./availabilityText";

export const SHEET_TITLE = "어느 도서관에서 빌릴 예정인가요?";
export const SHEET_SUBTITLE = "본인만 보는 메모예요. 도서관에 예약되지는 않아요.";
export const SHEET_NO_CANDIDATES = "먼저 아래에서 지역을 골라 도서관을 찾아 주세요";
export const SAVE_FAILED = "저장하지 못했어요. 다시 시도해 주세요.";

export function SavePlanSheet({
  visible,
  isbn13,
  candidates,
  onClose,
  onSaved,
  onLoginRequired,
}: {
  visible: boolean;
  isbn13: string;
  candidates: AvailabilityItem[];
  onClose(): void;
  onSaved(plan: LoanPlan): void;
  onLoginRequired(): void;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false); // 연타해도 한 번만 보낸다(L3-#3)
  const openSeq = useRef(0); // 닫을 때마다 올린다 — 닫은 뒤 끝난 요청의 실패 문구를 다음 열림에 남기지 않는다(사후 검토 ②-2)

  const choose = async (libraryId: number) => {
    if (busy.current) return;
    busy.current = true;
    const seq = openSeq.current;
    setPendingId(libraryId);
    setFailed(false);
    try {
      const plan = await saveLoanPlan(isbn13, libraryId); // 201 새로 / 200 이미 있음 — 둘 다 저장된 것(N8)
      onSaved(plan);
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 401) onLoginRequired();
      else if (seq === openSeq.current) setFailed(true); // 시트는 열어 둔다(N8). 이미 닫았으면 남기지 않는다
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  };

  const close = () => {
    openSeq.current += 1;
    setFailed(false);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.scrim}>
        <View testID="save-plan-sheet" style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title}>{SHEET_TITLE}</Text>
              <Text style={styles.subtitle}>{SHEET_SUBTITLE}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={close} style={styles.close}>
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
          </View>

          {failed && <Text style={styles.error}>{SAVE_FAILED}</Text>}

          {candidates.length === 0 ? (
            <Text style={styles.empty}>{SHEET_NO_CANDIDATES}</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listPad}>
              {candidates.map((item) => {
                const lib = item.library;
                const where = [lib.area_label, distanceLabel(lib.distance_m)].filter(Boolean).join(" · ");
                return (
                  <View key={lib.id} testID={`plan-candidate-${lib.id}`} style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{lib.name}</Text>
                      {!!where && <Text style={styles.meta}>{where}</Text>}
                      <Text style={styles.meta}>{`소장 ${holdingText(item.holding)}`}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: pendingId !== null }}
                      disabled={pendingId !== null}
                      onPress={() => void choose(lib.id)}
                      style={[styles.choose, pendingId !== null && styles.dim]}
                    >
                      <Text style={styles.chooseText}>선택</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: c.shadowSoft },
  sheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
    maxHeight: "80%",
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  title: { fontSize: 17, fontWeight: "700", color: c.text },
  subtitle: { fontSize: 13, color: c.textSub, marginTop: 4, lineHeight: 19 },
  close: { paddingVertical: 4, paddingHorizontal: 6 },
  closeText: { fontSize: 15, color: c.text, fontWeight: "600" },
  error: { fontSize: 14, color: c.loanOut },
  empty: { fontSize: 15, color: c.text, lineHeight: 22, paddingVertical: 8 },
  list: { flexGrow: 0 },
  listPad: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  name: { fontSize: 15, fontWeight: "700", color: c.text },
  meta: { fontSize: 13, color: c.textSub, marginTop: 2 },
  choose: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dim: { opacity: 0.5 },
  chooseText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "700" },
});
