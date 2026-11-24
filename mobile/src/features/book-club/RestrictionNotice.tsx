// CLUB-2-P4 내 참가 제한 안내(알림함 맨 위) — contracts/book-club.md CLUB-2 K2-8~K2-10·K2-O3·K2-O5·C3
// 불참: 최근 180일 몇 번째인지와 기간, 댓글 운영: 관리자가 적은 사유. 영구는 "운영자가 풀 때까지". 재검토 요청은 한 번만.
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import { requestRestrictionReview, type Restriction } from "./api";

const C = theme.colors;
const ACT = actionColors(theme.colors);
const NO_SHOW_DAYS: Record<number, number> = { 1: 3, 2: 7, 3: 30 }; // K2-8

/** ISO → 서울 기준 "M.D HH:mm" */
export function shortKst(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${hh}:${mm}`;
}

export const RESTRICTION_TEXT = {
  title: "내 참가 제한",
  noShowTitle: "불참으로 기록됐어요",
  noShowBody: (n: number, endsAt: string | null) =>
    endsAt === null || n >= 4
      ? `최근 180일 불참 ${n}번째 → 운영자가 풀 때까지 모임 참가와 댓글이 제한돼요.`
      : `최근 180일 불참 ${n}번째 → ${NO_SHOW_DAYS[n]}일 동안 모임 참가와 댓글이 제한돼요. (${shortKst(endsAt)}까지)`,
  commentTitle: "댓글 운영 기준에 따라 제한됐어요",
  commentReason: (text: string) => `관리자가 적은 사유: ${text}`,
  commentBody: (endsAt: string | null) =>
    endsAt === null ? "운영자가 풀 때까지 모임 댓글과 참가가 제한돼요." : `모임 댓글과 참가가 제한돼요. (${shortKst(endsAt)}까지)`,
  ended: "제한 기간은 끝났어요",
  counted: "셈",
  review: "재검토 요청하기",
  reviewPlaceholder: "어떤 사정이었는지 적어 주세요 (선택)",
  reviewSend: "요청 보내기",
  reviewSending: "보내는 중…",
  reviewDone: "재검토를 요청했어요. 운영자가 확인해요",
  reviewed: "재검토 요청함",
  reviewFailed: "요청하지 못했어요. 다시 해 주세요.",
} as const;

export function RestrictionNotice({ items, now = Date.now() }: { items: Restriction[]; now?: number }) {
  if (items.length === 0) return null;
  // 최근순 목록에서 불참은 오래된 것부터 1번째(서버와 같이 해제·180일 지난 것은 이미 빠져 있다)
  const noShows = items.filter((r) => r.reason_kind === "no_show");
  return (
    <View style={styles.box} testID="restriction-notice">
      <Text style={styles.title}>{RESTRICTION_TEXT.title}</Text>
      {items.map((r) => (
        <RestrictionRow key={r.id} item={r} order={noShows.length - noShows.indexOf(r)} now={now} />
      ))}
    </View>
  );
}

function RestrictionRow({ item, order, now }: { item: Restriction; order: number; now: number }) {
  const [requested, setRequested] = useState(item.review_requested);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sending = useRef(false);
  const over = item.ends_at !== null && Date.parse(item.ends_at) <= now;
  const noShow = item.reason_kind === "no_show";

  async function send() {
    if (sending.current || requested) return; // 한 번만
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const next = await requestRestrictionReview(item.id, text.trim());
      setRequested(next.review_requested);
      setOpen(false);
      setMessage(RESTRICTION_TEXT.reviewDone);
    } catch {
      setMessage(RESTRICTION_TEXT.reviewFailed); // 쓴 글은 그대로
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.row} testID={`restriction-${item.id}`}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{noShow ? RESTRICTION_TEXT.noShowTitle : RESTRICTION_TEXT.commentTitle}</Text>
        {noShow ? <Text style={styles.tag}>{RESTRICTION_TEXT.counted}</Text> : null}
      </View>
      {noShow ? null : <Text style={styles.body}>{RESTRICTION_TEXT.commentReason(item.reason_text)}</Text>}
      <Text style={styles.body}>
        {over ? RESTRICTION_TEXT.ended : noShow ? RESTRICTION_TEXT.noShowBody(order, item.ends_at) : RESTRICTION_TEXT.commentBody(item.ends_at)}
      </Text>
      {requested ? (
        <Text style={styles.done}>{RESTRICTION_TEXT.reviewed}</Text>
      ) : open ? (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={RESTRICTION_TEXT.reviewPlaceholder}
            placeholderTextColor={C.inkMuted}
            maxLength={500}
            multiline
            style={styles.input}
            accessibilityLabel={RESTRICTION_TEXT.reviewPlaceholder}
            testID={`restriction-review-input-${item.id}`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void send()}
            testID={`restriction-review-send-${item.id}`}
            style={({ pressed }) => [styles.secondary, pressed && !busy && ACT.secondaryPressed, busy && styles.dim]}
          >
            <Text style={styles.secondaryText}>{busy ? RESTRICTION_TEXT.reviewSending : RESTRICTION_TEXT.reviewSend}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          testID={`restriction-review-${item.id}`}
          style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
        >
          <Text style={styles.secondaryText}>{RESTRICTION_TEXT.review}</Text>
        </Pressable>
      )}
      {message ? (
        <Text style={styles.body} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { ...cardSurface(), padding: 12, gap: 10 },
  title: { ...T.gauge },
  row: { gap: 6, paddingTop: 4 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 15, color: C.text, fontWeight: "500", flexShrink: 1 },
  tag: { fontSize: 12, color: C.textSub, borderWidth: 1, borderColor: C.seamHairline, borderRadius: theme.radii.pill, paddingHorizontal: 8, paddingVertical: 1 },
  body: { fontSize: 14, color: C.text, lineHeight: 20 },
  done: { fontSize: 13, color: C.textSub },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    padding: 10,
    fontSize: 14,
    color: C.text,
    textAlignVertical: "top",
  },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  dim: { opacity: 0.55 },
});
