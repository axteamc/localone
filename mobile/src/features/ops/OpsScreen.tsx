// 운영 화면 `/ops` — contracts/core.md M2-0-P2 Z4·C2·C6.
// 운영자만 쓴다. 서버가 운영자 아님·비로그인을 404로 돌려주면 "찾을 수 없어요"만 보인다(경로 존재를 알리지 않음).
// 모든 처리는 사유가 필요하다(위 사유 칸 하나를 모든 버튼이 같이 쓴다). 룩 재배정·서가 테마는 M2-0-P3.
// 문구·배치는 기본값(Claude) — 운영자 전용 화면이라 시안 없이 둔다.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiFetch } from "../../auth/apiFetch";
import { ApiCallError } from "../../lib/publicApi";
import { actionColors, cardSurface, panel, theme, type as T } from "../../theme";

type TargetKind = "post" | "guestbook" | "club" | "club_comment" | "stamp";
type Report = {
  id: string; target_kind: TargetKind; target_id: string; reason: string; text: string | null;
  status: string; created_at: string; target_status: string | null; target_preview: string | null;
};
type CommentRequest = {
  id: string; comment_id: string; club_id: string; comment_body: string; comment_status: string;
  reason: string; status: string; created_at: string;
};
type Restriction = {
  id: string; user_id: string; reason_kind: "comment" | "no_show"; reason_text: string;
  ends_at: string | null; review_requested_at: string | null; review_text: string | null;
};
type Tab = "reports" | "requests" | "reviews" | "direct";

const TABS: { key: Tab; label: string }[] = [
  { key: "reports", label: "신고" },
  { key: "requests", label: "댓글 요청" },
  { key: "reviews", label: "재검토" },
  { key: "direct", label: "직접 처리" },
];
const KIND_LABEL: Record<TargetKind, string> = {
  post: "게시물", guestbook: "방명록", club: "모임", club_comment: "모임 댓글", stamp: "방문 기록(한마디)",
};
const RESTRICTION_PERIODS = [
  { label: "1일", days: 1 },
  { label: "3일", days: 3 },
  { label: "7일", days: 7 },
  { label: "영구", days: null },
] as const;

async function send<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(`/api/v1/ops/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiCallError(0, "NETWORK", "서버에 연결하지 못했어요.", "");
  }
  if (!res.ok) {
    let err: { error?: { code?: string; message?: string; detail?: string } } = {};
    try { err = await res.json(); } catch { /* 본문이 없어도 실패 */ }
    throw new ApiCallError(res.status, err?.error?.code ?? "HTTP_ERROR",
      err?.error?.message ?? "요청을 처리하지 못했어요.", err?.error?.detail ?? "");
  }
  return res.json() as Promise<T>;
}

function errorText(e: unknown): string {
  if (e instanceof ApiCallError) {
    if (e.status === 422 && e.detail.includes("reason")) return "사유를 적어 주세요.";
    return e.message;
  }
  return "요청을 처리하지 못했어요.";
}

export function OpsScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("reports");
  const [reason, setReason] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [requests, setRequests] = useState<CommentRequest[]>([]);
  const [reviews, setReviews] = useState<Restriction[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<TargetKind>("post");
  const [targetId, setTargetId] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, q, v] = await Promise.all([
        send<{ items: Report[] }>("GET", "reports?status=open"),
        send<{ items: CommentRequest[] }>("GET", "club-comment-requests?status=pending"),
        send<{ items: Restriction[] }>("GET", "restrictions?state=review"),
      ]);
      setReports(r.items); setRequests(q.items); setReviews(v.items); setAllowed(true);
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 404) setAllowed(false);
      else { setAllowed((prev) => prev ?? true); setMessage(errorText(e)); }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, extra: Record<string, unknown> = {}, done = "처리했어요.") => {
    if (busy) return;
    if (reason.trim() === "") { setMessage("사유를 적어 주세요."); return; }
    setBusy(true); setMessage(null);
    try {
      await send("POST", path, { reason: reason.trim(), ...extra });
      setMessage(done);
      await load();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null) {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.text} /></View>;
  }
  if (!allowed) {
    return <View style={styles.center}><Text style={T.title}>찾을 수 없어요</Text></View>;
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={T.pageTitle}>운영</Text>
      <TextInput
        accessibilityLabel="처리 사유"
        placeholder="처리 사유(모든 처리에 남아요)"
        placeholderTextColor={theme.colors.inkMuted}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        style={styles.input}
      />
      {message !== null && <Text style={styles.message}>{message}</Text>}

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key ? ACT.primary : ACT.secondary]}>
            <Text style={styles.tabText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "reports" && (reports.length === 0 ? <Text style={styles.empty}>열린 신고가 없어요</Text> :
        reports.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.meta}>{KIND_LABEL[r.target_kind]} · {r.target_status ?? "없음"} · 사유 {r.reason}</Text>
            <Text style={styles.body} numberOfLines={3}>{r.target_preview ?? "(내용 없음)"}</Text>
            {r.text !== null && <Text style={styles.sub}>신고 내용: {r.text}</Text>}
            <View style={styles.row}>
              <Btn label="숨기기" primary disabled={busy}
                onPress={() => act(`targets/${r.target_kind}/${r.target_id}/hide`, {}, "숨겼어요. 작성자에게 안내가 갔어요.")} />
              <Btn label="기각" disabled={busy} onPress={() => act(`reports/${r.id}/resolve`, {}, "기각했어요.")} />
            </View>
          </View>
        )))}

      {tab === "requests" && (requests.length === 0 ? <Text style={styles.empty}>기다리는 요청이 없어요</Text> :
        requests.map((q) => (
          <View key={q.id} style={styles.card}>
            <Text style={styles.meta}>모임 댓글 · {q.comment_status} · 요청 사유 {q.reason}</Text>
            <Text style={styles.body} numberOfLines={4}>{q.comment_body}</Text>
            <View style={styles.row}>
              <Btn label="삭제만" primary disabled={busy}
                onPress={() => act(`club-comment-requests/${q.id}/decide`, { decision: "delete_only" })} />
              {RESTRICTION_PERIODS.map(({ label, days }) => (
                <Btn key={label} label={`삭제와 ${label} 참가 제한`} disabled={busy}
                  onPress={() => act(`club-comment-requests/${q.id}/decide`,
                    { decision: "delete_and_restrict", restriction_days: days })} />
              ))}
              <Btn label="거절" disabled={busy}
                onPress={() => act(`club-comment-requests/${q.id}/decide`, { decision: "rejected" })} />
            </View>
          </View>
        )))}

      {tab === "reviews" && (reviews.length === 0 ? <Text style={styles.empty}>재검토 요청이 없어요</Text> :
        reviews.map((v) => (
          <View key={v.id} style={styles.card}>
            <Text style={styles.meta}>{v.reason_kind === "comment" ? "댓글" : "불참"} 제한 · {v.ends_at ? `${v.ends_at.slice(0, 10)}까지` : "기간 없음"}</Text>
            <Text style={styles.body}>{v.reason_text}</Text>
            {v.review_text ? <Text style={styles.body}>재검토 요청 글: {v.review_text}</Text> : null}
            <View style={styles.row}>
              <Btn label="제한 해제" primary disabled={busy}
                onPress={() => act(`restrictions/${v.id}/lift`, {}, "제한을 풀었어요.")} />
            </View>
          </View>
        )))}

      {tab === "direct" && (
        <View style={styles.card}>
          <View style={styles.row}>
            {(Object.keys(KIND_LABEL) as TargetKind[]).map((k) => (
              <Btn key={k} label={KIND_LABEL[k]} primary={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <TextInput accessibilityLabel="대상 id" placeholder="대상 id" autoCapitalize="none" value={targetId}
            onChangeText={setTargetId} placeholderTextColor={theme.colors.inkMuted} style={styles.input} />
          <View style={styles.row}>
            <Btn label="숨기기" primary disabled={busy || targetId.trim() === ""}
              onPress={() => act(`targets/${kind}/${encodeURIComponent(targetId.trim())}/hide`)} />
            <Btn label="복구" disabled={busy || targetId.trim() === ""}
              onPress={() => act(`targets/${kind}/${encodeURIComponent(targetId.trim())}/restore`, {}, "복구했어요.")} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Btn({ label, onPress, primary = false, disabled = false }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, primary ? ACT.primary : ACT.secondary,
        pressed && !disabled && (primary ? ACT.primaryPressed : ACT.secondaryPressed), disabled && styles.disabled]}>
      <Text style={[styles.buttonText, primary ? ACT.primaryText : ACT.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: panel.backgroundColor },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: panel.backgroundColor },
  input: {
    minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.seamHairline,
    borderRadius: theme.radii.control, backgroundColor: theme.colors.panelLit, color: theme.colors.text, fontSize: 15,
  },
  message: { fontSize: 14, fontWeight: "500", color: theme.colors.text },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: { minHeight: 36, paddingHorizontal: 14, justifyContent: "center", borderRadius: theme.radii.control },
  tabText: { fontSize: 14, fontWeight: "500", color: theme.colors.text },
  card: { ...cardSurface(theme, { onPanel: true }), padding: 12, gap: 8 },
  meta: { ...T.gauge, textTransform: "none", letterSpacing: 0.4 },
  body: { fontSize: 15, lineHeight: 21, color: theme.colors.text },
  sub: { fontSize: 13, lineHeight: 18, color: theme.colors.textSub },
  empty: { fontSize: 14, color: theme.colors.textSub, textAlign: "center", paddingVertical: 24 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: theme.radii.control },
  buttonText: { fontSize: 14, fontWeight: "500" },
  disabled: { opacity: 0.5 },
});
