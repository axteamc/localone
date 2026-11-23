// 모임 카드(CLUB-1-P3)와 날짜 표시 함수 — contracts/book-club.md CLUB-1 C2·K1-O5, 명세 결정 1(날짜가 크게)
// formatClubWhen은 ClubCard·ClubScreen이 같이 쓴다(K1-O4·K1-O5).
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { onFill, theme } from "../../theme";
import type { ClubItem, ClubStatus } from "./api";

const C = theme.colors;
const INK = onFill(C.fill2); // 채움 위 글자색은 자동(디자인_기준 §2)

export const CARD_TEXT = {
  tag: "모임",
  go: "들어가기 →",
  undecidedDay: "날짜 미정",
  undecidedNote: "댓글로 정해요",
  undecidedPlace: "장소 미정",
  count: (club: Pick<ClubItem, "participant_count" | "capacity">) =>
    club.capacity === null ? `${club.participant_count}명 참가` : `${club.participant_count}/${club.capacity}명 참가`,
  status: { open: null, closed: "모집 마감", canceled: "취소됨", ended: "끝난 모임" } as Record<ClubStatus, string | null>,
} as const;

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kst(iso: string): Date | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + KST_OFFSET_MS); // getUTC*로 읽으면 서울 시각
}

function clock(d: Date, withPeriod: boolean): string {
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${withPeriod ? (h < 12 ? "오전 " : "오후 ") : ""}${h12}:${m}`;
}

/** "11.28 토" / "오후 2:00 ~ 4:00". 시작이 없으면 null(= 날짜 미정). 끝이 오전·오후가 다르면 끝에도 붙인다 */
export function formatClubWhen(startsAt: string | null, endsAt: string | null): { day: string; time: string } | null {
  const s = startsAt ? kst(startsAt) : null;
  if (!s) return null;
  const day = `${s.getUTCMonth() + 1}.${s.getUTCDate()} ${DAYS[s.getUTCDay()]}`;
  const e = endsAt ? kst(endsAt) : null;
  if (!e) return { day, time: clock(s, true) };
  const samePeriod = s.getUTCHours() < 12 === e.getUTCHours() < 12;
  return { day, time: `${clock(s, true)} ~ ${clock(e, !samePeriod)}` };
}

/** 피드 2열의 한 칸(P-30). 맨 위 "모임" 알약 → 날짜·요일 제일 크게 → 시각·장소 → 이름 → 인원 → "들어가기 →" */
export function ClubCard({ club, width, onOpen }: { club: ClubItem; width: number; onOpen(clubId: string): void }) {
  const when = formatClubWhen(club.starts_at, null);
  const place = club.place ?? CARD_TEXT.undecidedPlace;
  const label = CARD_TEXT.status[club.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${CARD_TEXT.tag} ${club.name}`}
      onPress={() => onOpen(club.id)}
      testID={`club-card-${club.id}`}
      style={[styles.card, { width }]}
    >
      <View style={styles.tag}>
        <Text style={styles.tagText}>{CARD_TEXT.tag}</Text>
      </View>
      <Text style={styles.day} numberOfLines={1} testID="club-card-day">
        {when ? when.day : CARD_TEXT.undecidedDay}
      </Text>
      <Text style={styles.time} numberOfLines={1}>
        {when ? `${when.time} · ${place}` : club.place ? `${CARD_TEXT.undecidedNote} · ${club.place}` : CARD_TEXT.undecidedNote}
      </Text>
      {label ? (
        <Text style={styles.status} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <Text style={styles.name} numberOfLines={2}>
        {club.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {CARD_TEXT.count(club)}
      </Text>
      <Text style={styles.go} numberOfLines={1}>
        {CARD_TEXT.go}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.fill2,
    borderTopLeftRadius: theme.radii.clubCardTop,
    borderTopRightRadius: theme.radii.clubCardTop,
    borderBottomLeftRadius: theme.radii.clubCardBottom,
    borderBottomRightRadius: theme.radii.clubCardBottom,
    paddingTop: 28,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 4,
  },
  tag: { alignSelf: "flex-start", backgroundColor: C.seamHighlight, borderRadius: theme.radii.pill, paddingHorizontal: 10, paddingVertical: 2 },
  tagText: { fontSize: 11, color: INK },
  day: { fontSize: 24, fontWeight: "400", letterSpacing: -0.4, color: INK, marginTop: 4 },
  time: { fontSize: 14, color: INK, opacity: 0.85 },
  status: { fontSize: 12, fontWeight: "500", color: INK },
  name: { fontSize: 15, fontWeight: "500", color: INK, marginTop: 6, lineHeight: 20 },
  meta: { fontSize: 12, color: INK, opacity: 0.8 },
  go: { fontSize: 14, fontWeight: "500", color: INK, marginTop: 6 },
});
