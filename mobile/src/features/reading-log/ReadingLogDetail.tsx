// READ-1-P2 기록 화면 `/reading/[logId]` (reading-log.md READ-1 R1-O4·R1-O5, specs/reading-log/세부/READ-1.md 결정 3)
// 머리 ‹ · "내 기록" · ⋯(수정·지우기). 본문: 표지·제목·저자 → 읽은 날·도서관·대출 → 감상 → 좋았던 문장.
// 맨 아래 "게시물로 올리기"(이미 올렸으면 "올린 게시물 보기", B LOCAL-3로 넘김).
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { actionColors, cardSurface, theme } from "../../theme";
import { ApiCallError, deleteReadingLog, fetchReadingLog, shelfStore, type ReadingLog } from "./api";
import { ConfirmDialog, Cover, ReadingLogEditor, TEXT as EDITOR_TEXT, Toast, monthDay, styles as base } from "./ReadingLogEditor";
import { BackChevron, HeaderTitle } from "../../theme/ScreenHeader";

export const TEXT = {
  title: "내 기록",
  back: "돌아가기",
  more: "더 보기",
  edit: "수정",
  remove: "지우기",
  notFound: "찾을 수 없는 기록이에요",
  loadFailed: "기록을 불러오지 못했어요.",
  retry: "다시 해 보기",
  readOn: "읽은 날",
  library: "도서관",
  loan: "대출",
  noLibrary: "도서관 없이 읽었어요",
  noDate: "적지 않음",
  noLoan: "연결 안 함",
  linkedLoan: "대출과 연결됨",
  note: "감상",
  quote: "좋았던 문장",
  emptyNote: "감상을 적지 않았어요.",
  publish: "게시물로 올리기",
  viewPost: "올린 게시물 보기",
  deleteTitle: "이 기록을 지울까요?",
  deleteBody: "지우면 되돌릴 수 없어요.",
  deleteKeepsPost: "올린 게시물은 그대로 남아요.",
  cancel: "취소",
  deleted: "기록을 지웠어요",
  deleteFailed: "지우지 못했어요. 다시 해 주세요.",
} as const;

type State =
  | { kind: "loading"; owner: string | null; logId: string }
  | { kind: "ok"; owner: string; logId: string; log: ReadingLog }
  | { kind: "notFound"; owner: string; logId: string }
  | { kind: "failed"; owner: string; logId: string };

function cachedFor(owner: string | null, logId: string): ReadingLog | undefined {
  if (!owner) return undefined;
  const s = shelfStore.get();
  return s.owner === owner ? s.items?.find((l) => l.id === logId) : undefined;
}

export function ReadingLogDetail({ logId, initialEdit = false }: { logId: string; initialEdit?: boolean }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { status, userId } = useAuth();
  const activeOwner = status === "signedIn" ? userId ?? null : null;
  const [state, setState] = useState<State>(() => {
    const cached = cachedFor(activeOwner, logId);
    return cached && activeOwner ? { kind: "ok", owner: activeOwner, logId, log: cached } : { kind: "loading", owner: activeOwner, logId };
  });
  const [reload, setReload] = useState(0);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(initialEdit);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const deleting = useRef(false);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useLayoutEffect(() => {
    const nav = navigation as unknown as { setOptions?: (o: Record<string, unknown>) => void } | undefined;
    nav?.setOptions?.({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    // The first fetch runs below. A focused return from compose or post detail refreshes the link.
    return navigation?.addListener?.("focus", () => setReload((value) => value + 1));
  }, [navigation]);

  useEffect(() => {
    setMenuOpen(false);
    setEditing(initialEdit);
    setConfirmDelete(false);
    setRefreshFailed(false);
    if (!activeOwner) {
      setState({ kind: "loading", owner: null, logId });
      return;
    }
    const cached = cachedFor(activeOwner, logId);
    setState(cached ? { kind: "ok", owner: activeOwner, logId, log: cached } : { kind: "loading", owner: activeOwner, logId });
    const ctrl = new AbortController();
    fetchReadingLog(logId, ctrl.signal)
      .then((log) => {
        if (ctrl.signal.aborted) return;
        setRefreshFailed(false);
        setState({ kind: "ok", owner: activeOwner, logId, log });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof ApiCallError && err.status === 404) {
          setRefreshFailed(false);
          setState({ kind: "notFound", owner: activeOwner, logId });
        } else {
          setState((s) => {
            if (s.kind === "ok" && s.owner === activeOwner && s.logId === logId) {
              setRefreshFailed(true);
              return s;
            }
            return { kind: "failed", owner: activeOwner, logId };
          });
        }
      });
    return () => ctrl.abort();
  }, [logId, reload, activeOwner]);

  const goBack = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace("/reading");
  };

  async function doDelete(log: ReadingLog) {
    if (deleting.current) return;
    deleting.current = true;
    setBusy(true);
    try {
      await deleteReadingLog(log.id);
      setConfirmDelete(false);
      if (activeOwner) shelfStore.remove(activeOwner, log.id, TEXT.deleted);
      goBack();
    } catch (err) {
      setConfirmDelete(false);
      if (err instanceof ApiCallError && err.status === 404) {
        if (activeOwner) shelfStore.remove(activeOwner, log.id, TEXT.deleted); // 이미 없음: 책장에서도 뺀다
        goBack();
      } else showToast(TEXT.deleteFailed); // 기록 화면 그대로
    } finally {
      deleting.current = false;
      setBusy(false);
    }
  }

  const owned = activeOwner !== null && state.owner === activeOwner && state.logId === logId;
  const log = owned && state.kind === "ok" ? state.log : null;

  if (log && editing) {
    return (
      <ReadingLogEditor
        mode="edit"
        log={log}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          if (activeOwner) setState({ kind: "ok", owner: activeOwner, logId, log: saved });
          setEditing(false);
          showToast(EDITOR_TEXT.saved);
        }}
      />
    );
  }

  return (
    <View style={base.screen}>
      <View style={[base.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={TEXT.back} onPress={goBack} hitSlop={8} style={base.headerSide}>
          <BackChevron color={C.inkStrong} />
        </Pressable>
        <View style={base.flex}>
          <HeaderTitle label="MY RECORD" title={TEXT.title} />
        </View>
        {log ? (
          <Pressable accessibilityRole="button" accessibilityLabel={TEXT.more} onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={base.headerSide}>
            <Text style={base.headerX}>⋯</Text>
          </Pressable>
        ) : (
          <View style={base.headerSide} />
        )}
      </View>

      {menuOpen && log ? (
        <View style={[styles.menu, { top: insets.top + 56 }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuOpen(false);
              setEditing(true);
            }}
            style={({ pressed }) => [styles.menuItem, styles.menuLine, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.menuText}>{TEXT.edit}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && ACT.secondaryPressed]}
          >
            <Text style={[styles.menuText, base.dangerText]}>{TEXT.remove}</Text>
          </Pressable>
        </View>
      ) : null}

      {status !== "signedIn" ? (
        <View style={[base.flex, base.center]}>
          <Text style={base.centerText}>{EDITOR_TEXT.loginNeeded}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={({ pressed }) => [base.primaryBtn, pressed && ACT.primaryPressed]}>
            <Text style={base.primaryText}>{EDITOR_TEXT.login}</Text>
          </Pressable>
        </View>
      ) : !owned || state.kind === "loading" ? (
        <View style={[base.flex, base.center]}>
          <ActivityIndicator accessibilityLabel="불러오는 중" />
        </View>
      ) : state.kind === "notFound" ? (
        <View style={[base.flex, base.center]}>
          <Text style={base.centerText}>{TEXT.notFound}</Text>
        </View>
      ) : state.kind === "failed" ? (
        <View style={[base.flex, base.center]}>
          <Text style={base.centerText}>{TEXT.loadFailed}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setState({ kind: "loading", owner: activeOwner, logId }); setReload((n) => n + 1); }} style={({ pressed }) => [base.secondaryBtn, pressed && ACT.secondaryPressed]}>
            <Text style={base.secondaryText}>{TEXT.retry}</Text>
          </Pressable>
        </View>
      ) : log ? (
        <>
          {refreshFailed ? (
            <View testID="detail-refresh-error" style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{TEXT.loadFailed}</Text>
              <Pressable accessibilityRole="button" onPress={() => { setRefreshFailed(false); setReload((n) => n + 1); }} style={({ pressed }) => [base.secondaryBtn, pressed && ACT.secondaryPressed]}>
                <Text style={base.secondaryText}>{TEXT.retry}</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView style={base.flex} contentContainerStyle={[base.body, styles.body]}>
            <View style={styles.bookRow}>
              <Cover book={log.book} size={72} />
              <View style={base.flex}>
                <Text style={styles.bookTitle} numberOfLines={3}>{log.book.title}</Text>
                {log.book.author ? <Text style={base.sub}>{log.book.author}</Text> : null}
              </View>
            </View>

            <View style={base.rows}>
              <InfoRow label={TEXT.readOn} value={log.read_on ? monthDay(log.read_on) : TEXT.noDate} />
              <InfoRow label={TEXT.library} value={log.library?.name ?? TEXT.noLibrary} />
              <InfoRow label={TEXT.loan} value={log.loan_id ? TEXT.linkedLoan : TEXT.noLoan} last />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{TEXT.note}</Text>
              <Text style={log.note ? styles.noteText : base.sub}>{log.note ?? TEXT.emptyNote}</Text>
            </View>
            {log.quote ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{TEXT.quote}</Text>
                <Text style={styles.quoteText}>{`“${log.quote}”`}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (log.published_post_id) {
                  router.push({ pathname: "/posts/[postId]", params: { postId: log.published_post_id } });
                } else {
                  router.push({ pathname: "/posts/new", params: { fromLog: log.id } });
                }
              }}
              style={({ pressed }) => [base.primaryBtn, pressed && ACT.primaryPressed]}
            >
              <Text style={base.primaryText}>{log.published_post_id ? TEXT.viewPost : TEXT.publish}</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {confirmDelete && log ? (
        <ConfirmDialog
          title={TEXT.deleteTitle}
          body={TEXT.deleteBody}
          extra={log.published_post_id ? TEXT.deleteKeepsPost : null}
          cancel={TEXT.cancel}
          confirm={busy ? "지우는 중…" : TEXT.remove}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void doDelete(log)}
          danger
        />
      ) : null}
      <Toast text={toast} />
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[base.row, !last && base.rowLine]}>
      <Text style={base.rowLabel}>{label}</Text>
      <Text style={base.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const C = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  body: { gap: 16 },
  bookRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  bookTitle: { fontSize: 20, fontWeight: "400", color: C.inkSoft, letterSpacing: -0.3 },
  section: { gap: 6 },
  sectionLabel: { fontSize: 12, color: C.inkMuted },
  noteText: { fontSize: 15, color: C.text, lineHeight: 23 },
  quoteText: { fontSize: 15, color: C.inkSoft, lineHeight: 23, fontStyle: "italic" },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderColor: C.seamHairline, backgroundColor: C.panelFrosted },
  menu: { ...cardSurface(theme, { onPanel: true }), position: "absolute", right: 12, minWidth: 140, zIndex: 20 },
  menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  menuLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.seamHairline },
  menuText: { fontSize: 15, color: C.text },
  errorBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.seamHairline, backgroundColor: C.panelFrosted },
  errorBannerText: { flex: 1, fontSize: 13, color: C.inkSoft },
});
