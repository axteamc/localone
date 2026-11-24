import { useNavigation, useRouter } from "expo-router";
import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { registerSignOutCleanup, useAuth } from "../../auth/AuthProvider";
import { actionColors, type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import { ApiCallError, reportTarget, type ReportKind, type ReportReason } from "./api";

export type ReportTarget = { kind: ReportKind; id: string };

export const REPORT_TEXT = {
  open: "신고하기",
  done: "신고했어요",
  collapsed: "신고한 글",
  loginNeeded: "로그인하면 신고할 수 있어요",
} as const;

const REASONS: { code: ReportReason; label: string }[] = [
  { code: "spam", label: "스팸 또는 광고" },
  { code: "abuse", label: "욕설 또는 괴롭힘" },
  { code: "privacy", label: "개인정보 노출" },
  { code: "other", label: "기타" },
];

const empty: ReadonlySet<string> = new Set();
let reported = { owner: null as string | null, keys: empty };
let sessionVersion = 0;
let cleanupRegistered = false;
const listeners = new Set<() => void>();

function targetKey({ kind, id }: ReportTarget) {
  return `${kind}:${id}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function clearReports() {
  sessionVersion += 1;
  reported = { owner: null, keys: empty };
  notify();
}

export function useReportedTargets(): ReadonlySet<string> {
  const { status, userId } = useAuth();
  const owner = status === "signedIn" ? userId : null;
  useLayoutEffect(() => {
    if (reported.owner !== null && reported.owner !== owner) clearReports();
  }, [owner]);
  return useSyncExternalStore(subscribe, () => owner !== null && owner === reported.owner ? reported.keys : empty);
}

export function ReportedTarget({
  kind, id, children, width,
}: ReportTarget & { children: React.ReactNode; width?: number }) {
  const { styles } = useLook(makeStyles);
  const reportedTargets = useReportedTargets();
  return reportedTargets.has(targetKey({ kind, id })) ? (
    <View style={[styles.collapsed, { width }]}>
      <Text style={styles.muted}>{REPORT_TEXT.collapsed}</Text>
    </View>
  ) : <>{children}</>;
}

type ReportSheetProps = { target: ReportTarget; onClose(): void; onDone(): void };

export function ReportSheet(props: ReportSheetProps) {
  const { status, userId } = useAuth();
  return <ReportForm key={JSON.stringify([status, userId, targetKey(props.target)])} {...props}
    owner={status === "signedIn" ? userId : null} loadingAuth={status === "loading"} />;
}

function ReportForm({
  target, onClose, onDone, owner, loadingAuth,
}: ReportSheetProps & { owner: string | null; loadingAuth: boolean }) {
  const { T, styles } = useLook(makeStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const sending = useRef(false);
  const callbacks = useRef({ onClose, onDone });
  callbacks.current = { onClose, onDone };

  useLayoutEffect(() => {
    active.current = true;
    const unsubscribe = navigation?.addListener?.("blur", () => {
      active.current = false;
      callbacks.current.onClose();
    });
    return () => {
      active.current = false;
      unsubscribe?.();
    };
  }, [navigation]);

  const length = Array.from(detail.trim()).length;
  const canSubmit = reason !== null && (reason !== "other" || (length >= 1 && length <= 200));
  const close = () => {
    active.current = false;
    onClose();
  };
  const submit = async () => {
    if (!owner || !reason || !canSubmit || sending.current || !active.current) return;
    if (!cleanupRegistered) {
      registerSignOutCleanup(clearReports);
      cleanupRegistered = true;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    const version = sessionVersion;
    try {
      await reportTarget(target, reason, reason === "other" ? detail.trim() : null);
      if (!active.current || version !== sessionVersion) return;
      const keys = reported.owner === owner ? reported.keys : empty;
      reported = { owner, keys: new Set([...keys, targetKey(target)]) };
      callbacks.current.onDone();
      notify();
    } catch (e) {
      if (active.current && version === sessionVersion) {
        setError(e instanceof ApiCallError && e.status === 404
          ? "찾을 수 없는 글이에요." : "신고를 보내지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      sending.current = false;
      if (active.current && version === sessionVersion) setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={T.title}>{REPORT_TEXT.open}</Text>
          {owner ? (
            <>
              {REASONS.map(({ code, label }) => (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reason === code }}
                  disabled={busy}
                  onPress={() => { setReason(code); setError(null); }}
                  style={[styles.row, reason === code && styles.selected]}
                >
                  <Text style={styles.label}>{label}</Text>
                </Pressable>
              ))}
              {reason === "other" ? (
                <>
                  <TextInput
                    accessibilityLabel="신고 상세"
                    placeholder="신고 사유를 적어 주세요"
                    multiline
                    editable={!busy}
                    value={detail}
                    onChangeText={setDetail}
                    style={styles.input}
                  />
                  <Text style={styles.muted}>{length} / 200</Text>
                </>
              ) : null}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit || busy}
                onPress={() => void submit()}
                style={[styles.primary, (!canSubmit || busy) && styles.disabled]}
              >
                <Text style={styles.primaryText}>{busy ? "보내는 중…" : error ? "다시 시도" : "신고 보내기"}</Text>
              </Pressable>
            </>
          ) : loadingAuth ? null : (
            <>
              <Text style={styles.label}>{REPORT_TEXT.loginNeeded}</Text>
              <Pressable accessibilityRole="button" onPress={() => { close(); router.push("/login"); }} style={styles.primary}>
                <Text style={styles.primaryText}>로그인하기</Text>
              </Pressable>
            </>
          )}
          <Pressable accessibilityRole="button" onPress={close} style={styles.row}>
            <Text style={styles.label}>닫기</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T, ACT } = lookKit(theme);
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: C.shadowDeep },
    sheet: { flexGrow: 0, maxHeight: "90%", width: "100%", maxWidth: 480, backgroundColor: C.paper, borderRadius: theme.radii.card },
    content: { padding: 20, gap: 8 },
    row: { ...ACT.secondary, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: theme.radii.control },
    selected: { borderColor: C.inkStrong, backgroundColor: C.panelLit },
    label: { color: C.text, fontSize: 14 },
    input: { minHeight: 76, borderWidth: 1, borderColor: C.seamHairline, padding: 10, color: C.text },
    muted: { color: C.inkMuted, fontSize: 13 },
    error: { color: C.loanOut },
    primary: { ...ACT.primary, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: theme.radii.control },
    primaryText: { ...ACT.primaryText, fontSize: 14 },
    disabled: { opacity: 0.5 },
    collapsed: { backgroundColor: C.paper, minHeight: 48, borderRadius: theme.radii.card, padding: 12, justifyContent: "center" },
  });
};
