// CLUB-2-P3 출석 확인 칸(만든 사람만, 기록 화면 맨 아래) — contracts/book-club.md CLUB-2 K2-7·K2-O1·K2-O2·C3
// 기본은 모두 "왔어요". 안 온 사람만 "안 왔어요"로 바꾸고 확인창을 거쳐 보내면 바로 불참·제한이 된다(되돌리기 없음).
import React, { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import { ApiCallError, putAttendance, type ClubRecord } from "./api";

const C = theme.colors;
const ACT = actionColors(theme.colors);

export const ATTEND_TEXT = {
  title: "출석 확인",
  note: (n: number) => `참가 신청 ${n}명 · 기본은 모두 왔어요`,
  came: "왔어요",
  missed: "안 왔어요",
  send: "출석 확인 보내기",
  sending: "보내는 중…",
  confirm: (n: number) => `안 온 ${n}명을 불참으로 기록할까요? 바로 참가가 제한돼요`,
  close: "닫기",
  record: "불참으로 기록",
  recorded: "불참으로 기록됨",
  failed: "출석 확인을 보내지 못했어요. 다시 해 주세요.",
  empty: "참가 신청한 사람이 없어요.",
} as const;

export function AttendanceSheet({
  record,
  onRecorded,
  onReload,
}: {
  record: ClubRecord;
  onRecorded(next: ClubRecord): void;
  onReload(): void;
}) {
  const people = record.club.participants;
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [recorded, setRecorded] = useState<Set<number>>(new Set()); // 이 화면에서 보낸 사람(되돌리기 없음)
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const sending = useRef(false);

  const toggle = (i: number, miss: boolean) =>
    setMissed((prev) => {
      const next = new Set(prev);
      if (miss) next.add(i);
      else next.delete(i);
      return next;
    });

  async function send() {
    if (sending.current) return;
    const marks = [...missed].sort((a, b) => a - b).map((i) => ({ participant_index: i }));
    sending.current = true;
    setAsking(false);
    setBusy(true);
    setFailed(false);
    try {
      const next = await putAttendance(record.club.id, marks);
      setRecorded((prev) => new Set([...prev, ...missed]));
      setMissed(new Set());
      onRecorded(next);
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 422) {
        setMissed(new Set());
        onReload(); // 명단이 바뀌었으면 화면을 다시 읽는다(C6)
      } else {
        setFailed(true); // 고른 것은 그대로
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.box} testID="record-attendance">
      <Text style={styles.title}>{ATTEND_TEXT.title}</Text>
      <Text style={styles.note}>{ATTEND_TEXT.note(people.length)}</Text>
      {people.length === 0 ? <Text style={styles.note}>{ATTEND_TEXT.empty}</Text> : null}
      {people.map((p, i) => {
        const done = recorded.has(i);
        const miss = missed.has(i);
        return (
          <View key={`${p.nickname}-${i}`} style={styles.row} testID={`attend-row-${i}`}>
            <Text style={styles.name} numberOfLines={1}>
              {p.nickname}
            </Text>
            {done ? (
              <Text style={styles.done}>{ATTEND_TEXT.recorded}</Text>
            ) : (
              <View style={styles.seg}>
                <Seg label={ATTEND_TEXT.came} on={!miss} onPress={() => toggle(i, false)} testID={`attend-came-${i}`} />
                <Seg label={ATTEND_TEXT.missed} on={miss} onPress={() => toggle(i, true)} testID={`attend-missed-${i}`} />
              </View>
            )}
          </View>
        );
      })}
      {failed ? (
        <Text style={styles.note} accessibilityRole="alert">
          {ATTEND_TEXT.failed}
        </Text>
      ) : null}
      {people.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: missed.size === 0 || busy }}
          disabled={missed.size === 0 || busy}
          onPress={() => setAsking(true)}
          testID="attend-send"
          style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed, (missed.size === 0 || busy) && styles.dim]}
        >
          <Text style={styles.secondaryText}>{busy ? ATTEND_TEXT.sending : ATTEND_TEXT.send}</Text>
        </Pressable>
      ) : null}
      {asking ? (
        <Modal transparent animationType="fade" onRequestClose={() => setAsking(false)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet} testID="attend-confirm">
              <Text style={styles.sheetTitle}>{ATTEND_TEXT.confirm(missed.size)}</Text>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={() => setAsking(false)} style={[styles.secondary, styles.flex]}>
                  <Text style={styles.secondaryText}>{ATTEND_TEXT.close}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void send()}
                  testID="attend-confirm-do"
                  style={({ pressed }) => [styles.primary, styles.flex, pressed && ACT.primaryPressed]}
                >
                  <Text style={styles.primaryText}>{ATTEND_TEXT.record}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function Seg({ label, on, onPress, testID }: { label: string; on: boolean; onPress(): void; testID: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      testID={testID}
      style={[styles.segBtn, on && styles.segOn]}
    >
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { ...cardSurface(), padding: 12, gap: 8 },
  title: { ...T.gauge },
  note: { fontSize: 13, color: C.textSub },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 },
  name: { flex: 1, fontSize: 14, color: C.text },
  done: { fontSize: 13, color: C.textSub },
  seg: { flexDirection: "row", borderWidth: 1, borderColor: C.seamHairline, borderRadius: theme.radii.pill, overflow: "hidden" },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.paper },
  segOn: { backgroundColor: C.fill1 },
  segText: { fontSize: 13, color: C.textSub },
  segTextOn: { color: C.text, fontWeight: "500" },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  dim: { opacity: 0.55 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: C.shadowDeep },
  sheet: {
    backgroundColor: C.panelLit,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
    borderTopLeftRadius: theme.radii.infoCard,
    borderTopRightRadius: theme.radii.infoCard,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  sheetTitle: { fontSize: 17, color: C.text, lineHeight: 24 },
  actions: { flexDirection: "row", gap: 10 },
});
