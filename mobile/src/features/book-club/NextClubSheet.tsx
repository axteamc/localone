// CLUB-2-P3 다음 모임 만들기 창 — contracts/book-club.md CLUB-2 K2-4·K2-O6·C3, 명세 결정 1·예외 #3
// 이름·책·소개·도서관은 서버가 이전 모임에서 복사한다. 여기서는 장소(이전 값으로 채움)와 날짜·시각만 받는다.
import * as Crypto from "expo-crypto";
import React, { useLayoutEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { actionColors, theme } from "../../theme";
import { ApiCallError, createNextClub, PLACE_MAX, type Club } from "./api";
import { EDITOR_TEXT, toKstIso } from "./ClubEditor";

const C = theme.colors;
const ACT = actionColors(theme.colors);

export const NEXT_TEXT = {
  title: "다음 모임 만들기",
  copied: "이름·책·소개는 그대로 가져와요. 장소와 날짜만 정해요.",
  placeLabel: "장소",
  whenLabel: "날짜·시각 · 비우면 미정",
  submit: "다음 모임 만들기",
  sending: "올리는 중…",
  close: "닫기",
  failed: "다음 모임을 만들지 못했어요. 다시 해 주세요.",
} as const;

export function NextClubSheet({
  clubId,
  previousPlace,
  onClose,
  onCreated,
}: {
  clubId: string;
  previousPlace: string | null;
  onClose(): void;
  onCreated(club: Club): void;
}) {
  const [place, setPlace] = useState(previousPlace ?? "");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const alive = useRef(true);
  const requestId = useRef(Crypto.randomUUID()); // 창을 열 때 한 번. 실패 뒤 다시 눌러도 같은 값(멱등)

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function collect(): { place: string | null; starts_at: string | null; ends_at: string | null } | null {
    const p = place.trim();
    if (p.length > PLACE_MAX) return setWarn(EDITOR_TEXT.tooLong(PLACE_MAX)), null;
    if (!date.trim() && !start.trim() && !end.trim()) return { place: p || null, starts_at: null, ends_at: null }; // 미정
    if (!date.trim() || !start.trim()) return setWarn(EDITOR_TEXT.whenNeeded), null;
    const startsAt = toKstIso(date, start);
    const endsAt = end.trim() ? toKstIso(date, end) : null;
    if (!startsAt || (end.trim() && !endsAt)) return setWarn(EDITOR_TEXT.whenBad), null;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return setWarn(EDITOR_TEXT.timeOrder), null;
    return { place: p || null, starts_at: startsAt, ends_at: endsAt };
  }

  async function submit() {
    if (sending.current) return; // 연타: 첫 누름만(예외 #3)
    const input = collect();
    if (!input) return;
    sending.current = true;
    setBusy(true);
    setWarn(null);
    try {
      const created = await createNextClub(clubId, input, requestId.current);
      if (alive.current) onCreated(created);
    } catch (e) {
      if (!alive.current) return;
      const timeBad = e instanceof ApiCallError && e.status === 422 && (e.detail === "ends_at" || e.detail === "starts_at");
      setWarn(timeBad ? EDITOR_TEXT.timeOrder : NEXT_TEXT.failed); // 쓰던 값은 그대로
    } finally {
      if (alive.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="next-club-sheet">
          <Text style={styles.title}>{NEXT_TEXT.title}</Text>
          <Text style={styles.note}>{NEXT_TEXT.copied}</Text>
          <Text style={styles.label}>{NEXT_TEXT.placeLabel}</Text>
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder={EDITOR_TEXT.placePlaceholder}
            placeholderTextColor={C.inkMuted}
            style={styles.input}
            accessibilityLabel={NEXT_TEXT.placeLabel}
            testID="next-club-place"
          />
          <Text style={styles.label}>{NEXT_TEXT.whenLabel}</Text>
          <View style={styles.row}>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder={EDITOR_TEXT.datePlaceholder}
              placeholderTextColor={C.inkMuted}
              style={[styles.input, styles.date]}
              accessibilityLabel="날짜"
              testID="next-club-date"
            />
            <TextInput
              value={start}
              onChangeText={setStart}
              placeholder={EDITOR_TEXT.startPlaceholder}
              placeholderTextColor={C.inkMuted}
              style={[styles.input, styles.flex]}
              accessibilityLabel="시작 시각"
              testID="next-club-start"
            />
            <TextInput
              value={end}
              onChangeText={setEnd}
              placeholder={EDITOR_TEXT.endPlaceholder}
              placeholderTextColor={C.inkMuted}
              style={[styles.input, styles.flex]}
              accessibilityLabel="끝나는 시각"
              testID="next-club-end"
            />
          </View>
          {warn ? (
            <Text style={styles.warn} accessibilityRole="alert">
              {warn}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={[styles.secondary, styles.flex]}>
              <Text style={styles.secondaryText}>{NEXT_TEXT.close}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void submit()}
              testID="next-club-submit"
              style={({ pressed }) => [styles.primary, styles.flex, pressed && !busy && ACT.primaryPressed, busy && styles.dim]}
            >
              <Text style={styles.primaryText} numberOfLines={1}>
                {busy ? NEXT_TEXT.sending : NEXT_TEXT.submit}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: C.shadowDeep },
  sheet: {
    backgroundColor: C.panelLit,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
    borderTopLeftRadius: theme.radii.infoCard,
    borderTopRightRadius: theme.radii.infoCard,
    padding: 20,
    paddingBottom: 32,
    gap: 10,
  },
  title: { fontSize: 17, color: C.text, lineHeight: 24 },
  note: { fontSize: 13, color: C.textSub, lineHeight: 18 },
  label: { fontSize: 13, color: C.textSub, marginTop: 4 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.control,
    backgroundColor: C.paper,
    paddingHorizontal: 10,
    fontSize: 14,
    color: C.text,
  },
  date: { flex: 1.4 },
  warn: { fontSize: 13, color: C.text },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  dim: { opacity: 0.55 },
});
