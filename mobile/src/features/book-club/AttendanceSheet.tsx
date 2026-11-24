// CLUB-2-P3 출석 확인 칸(만든 사람만, 기록 화면 맨 아래) — contracts/book-club.md CLUB-2 K2-7·K2-O1·K2-O2·C3
// 기본은 모두 "왔어요". 안 온 사람만 "안 왔어요"로 바꾸고 확인창을 거쳐 보내면 바로 불참·제한이 된다(되돌리기 없음).
// 고른 자리는 #60에서 명단과 함께 받은 명단 버전으로 보낸다. 그 사이 명단이 바뀌면(409) 선택을 비우고 새 명단을 읽는다.
import React, { useLayoutEffect, useRef, useState } from "react";
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
  rosterChanged: "참가 명단이 바뀌었어요. 다시 확인해 주세요.",
  reloadFailed: "참가 명단을 불러오지 못했어요.",
  reload: "명단 다시 불러오기",
  empty: "참가 신청한 사람이 없어요.",
} as const;

export function AttendanceSheet({
  record,
  onRecorded,
  onReload,
}: {
  record: ClubRecord;
  onRecorded(next: ClubRecord): void;
  onReload(): Promise<ClubRecord>;
}) {
  const people = record.club.participants;
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [recorded, setRecorded] = useState<Set<number>>(new Set()); // 이 화면에서 보낸 사람(되돌리기 없음)
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const sending = useRef(false);
  const alive = useRef(true); // 계정·모임이 바뀌어 이 칸이 사라진 뒤 늦게 온 응답은 버린다
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const toggle = (i: number, miss: boolean) =>
    setMissed((prev) => {
      const next = new Set(prev);
      if (miss) next.add(i);
      else next.delete(i);
      return next;
    });

  async function refreshRoster() {
    try {
      const next = await onReload();
      if (!alive.current) return;
      onRecorded(next);
      setNeedsReload(false);
      setFailed(ATTEND_TEXT.rosterChanged);
    } catch {
      if (alive.current) setFailed(ATTEND_TEXT.reloadFailed);
    }
  }

  async function send() {
    if (sending.current) return;
    const version = record.attendance_roster_version;
    sending.current = true;
    setAsking(false);
    setBusy(true);
    setFailed(null);
    try {
      if (needsReload) {
        await refreshRoster();
        return;
      }
      if (!version || missed.size === 0) return;
      const marks = [...missed].sort((a, b) => a - b).map((i) => ({ participant_index: i }));
      const next = await putAttendance(record.club.id, version, marks);
      if (!alive.current) return;
      setMissed(new Set());
      if (next.attendance_roster_version === version) {
        setRecorded((prev) => new Set([...prev, ...missed]));
      } else {
        setRecorded(new Set());
        setFailed(ATTEND_TEXT.rosterChanged);
      }
      onRecorded(next);
    } catch (e) {
      if (!alive.current) return;
      const changed = e instanceof ApiCallError && e.code === "CLUB_ATTENDANCE_ROSTER_CHANGED";
      if (changed || (e instanceof ApiCallError && e.status === 422)) {
        // 받은 명단이 낡았다: 자리 번호가 다른 사람을 가리킬 수 있으니 고른 것·보낸 표시를 비우고 새 명단을 읽는다(C6)
        setMissed(new Set());
        setRecorded(new Set());
        setNeedsReload(true);
        setFailed(ATTEND_TEXT.rosterChanged);
        await refreshRoster();
      } else {
        setFailed(ATTEND_TEXT.failed); // 고른 것은 그대로
      }
    } finally {
      if (alive.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }

  const rosterUnavailable = busy || needsReload || !record.attendance_roster_version;
  const canSend = missed.size > 0 && !rosterUnavailable;
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
                <Seg label={ATTEND_TEXT.came} on={!miss} disabled={rosterUnavailable} onPress={() => toggle(i, false)} testID={`attend-came-${i}`} />
                <Seg label={ATTEND_TEXT.missed} on={miss} disabled={rosterUnavailable} onPress={() => toggle(i, true)} testID={`attend-missed-${i}`} />
              </View>
            )}
          </View>
        );
      })}
      {failed ? (
        <Text style={styles.note} accessibilityRole="alert" testID="attend-failed">
          {failed}
        </Text>
      ) : null}
      {needsReload && !busy ? (
        <Pressable accessibilityRole="button" onPress={() => void send()} style={styles.secondary}>
          <Text style={styles.secondaryText}>{ATTEND_TEXT.reload}</Text>
        </Pressable>
      ) : null}
      {people.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => setAsking(true)}
          testID="attend-send"
          style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed, !canSend && styles.dim]}
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

function Seg({ label, on, disabled, onPress, testID }: {
  label: string; on: boolean; disabled: boolean; onPress(): void; testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
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
