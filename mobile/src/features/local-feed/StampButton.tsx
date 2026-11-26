// VISIT-4-P2 "다녀왔어요" — contracts/local-feed.md VISIT-4 V4-1·V4-3·V4-6·V4-7, V4-O1·V4-O2·V4-O4, P4 골격, 명세 결정 1·2
// 누르면 바로 "나만 보기"로 남고(#36 private), 아래 한 줄 안내의 "피드에도 남기기"로 공개(#36 public + expected_stamp_id).
// 남긴 뒤에는 버튼 대신 "오늘 다녀감 · 나만 보기 ▾" — 그 글자를 누르면 바로 아래 작은 메뉴에서 바꾼다
// (2026-11-25 C-89, 시안 실기기개선_P2-P4 #el-visithead 후보 A. 이전: 옆 ⋯ → 아래에서 올라오는 시트). 기기 방문 기록(lib/visits)은 건드리지 않는다(V4-7).
// 2026-11-25 C-92(V4-12·V4-O6, 시안 오늘의서가_UI개선 #el-compose A): ▾ 메뉴에 "한마디 남기기/수정" — 스탬프와 방명록을 하나로.
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const windowWidth = () => Dimensions.get("window").width;
type ViewType = React.ComponentRef<typeof Pressable>;
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import {
  ApiCallError,
  emitStampChanged,
  emitStampNotice,
  fetchTodayStamp,
  putTodayStamp,
  STAMP_BODY_MAX,
  type StampVisibility,
  type TodayStamp,
} from "./api";
import { ModalFrame } from "../../theme/WebFrame";

const PRIVATE_NOTICE_MS = 5000; // V4-O1 안내 5초

export const STAMP_TEXT = {
  button: "방문", // 2026-11-26: "다녀왔어요" → "방문"
  privateNotice: "나만 보기로 남겼어요",
  toPublic: "피드에도 남기기",
  savedPublic: "피드에 남겼어요",
  changedPrivate: "나만 보기로 바꿨어요",
  labelPrivate: "오늘 다녀감 · 나만 보기",
  labelPublic: "오늘 다녀감 · 피드에 공개",
  menuLabel: "공개 범위 바꾸기",
  menuToPublic: "피드에 공개",
  menuToPrivate: "나만 보기로 바꾸기",
  close: "닫기",
  failed: "남기지 못했어요. 다시 눌러 주세요",
  changeFailed: "바꾸지 못했어요. 다시 해 주세요",
  dateChanged: "날짜가 바뀌었어요. 다시 확인해 주세요",
  loginNeeded: "로그인하면 다녀왔어요를 남길 수 있어요",
  loginSub: "피드와 책장은 로그인 없이도 볼 수 있어요.",
  login: "로그인하기",
  noteAdd: "한마디 남기기",
  noteEdit: "한마디 수정",
  noteSub: `${STAMP_BODY_MAX}자 방문 방명록`,
  noteGuide: "오늘 방문 기록에 남겨요. 나만 보기면 나만, 피드에 공개면 모두가 봐요.",
  notePlaceholder: "예) 2층 창가 자리 오늘 햇살 좋아요",
  noteCount: (n: number) => `${n}/${STAMP_BODY_MAX}`,
  noteSave: "저장",
  noteSaving: "저장하는 중…",
  noteAdded: "한마디를 남겼어요",
  noteEdited: "한마디를 고쳤어요",
  noteCleared: "한마디를 지웠어요",
  noteFailed: "저장하지 못했어요. 다시 해 주세요",
} as const;

/** 도서관·로그인 사용자·화면 세대를 묶은 범위. 바뀌면 새 객체가 되어 앞 범위의 응답·안내는 아무것도 바꾸지 못한다 */
type Scope = { libraryId: number; userId: string | null; alive: boolean; pending: boolean };
type Action = "first" | "change" | "note";
type Outcome = "ok" | "failed" | "dateChanged" | "skipped";
type ReadState = "idle" | "loading" | "ok" | "error";

export function StampButton({ libraryId }: { libraryId: number }) {
  const { ACT, styles } = useLook(makeStyles);
  const { status, userId } = useAuth();
  const signedInUser = status === "signedIn" ? userId ?? null : null;
  const [today, setToday] = useState<TodayStamp | null>(null);
  const [read, setRead] = useState<ReadState>("idle");
  const [menu, setMenu] = useState(false);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null); // 글자 바로 아래(창 기준)
  const labelRef = useRef<ViewType>(null);
  const [loginSheet, setLoginSheet] = useState(false);
  const [note, setNote] = useState<{ text: string; busy: boolean; failed: boolean } | null>(null); // 한마디 창(V4-O6)
  const readRunner = useRef(createLatestRunner()).current;
  const scopeRef = useRef<Scope>({ libraryId, userId: signedInUser, alive: true, pending: false });

  const isCurrentSignedIn = (scope: Scope) => scope.alive && scopeRef.current === scope && scope.userId !== null;

  const reloadToday = useCallback(
    async (scope: Scope, notifyOnError = false) => {
      setRead("loading");
      const res = await readRunner.run((signal) => fetchTodayStamp(scope.libraryId, signal));
      if (res.status === "stale" || !(scope.alive && scopeRef.current === scope)) return;
      if (res.status === "ok") {
        setToday(res.value);
        setRead("ok");
      } else {
        setRead("error");
        if (notifyOnError) emitStampNotice({ libraryId: scope.libraryId, text: STAMP_TEXT.failed });
      }
    },
    [readRunner]
  );

  // 범위가 바뀌면 오늘 상태·안내·메뉴를 지우고, 로그인 상태에서만 #35를 부른다
  useEffect(() => {
    const scope: Scope = { libraryId, userId: signedInUser, alive: true, pending: false };
    scopeRef.current = scope;
    readRunner.cancel();
    setToday(null);
    setRead("idle");
    setMenu(false);
    setLoginSheet(false);
    setNote(null);
    if (scope.userId !== null) void reloadToday(scope);
    return () => {
      scope.alive = false;
      readRunner.cancel();
    };
  }, [libraryId, signedInUser, readRunner, reloadToday]);

  const notice = (scope: Scope, text: string, extra?: { ms: number; action: { label: string; run(): void } }) =>
    emitStampNotice({ libraryId: scope.libraryId, text, ...(extra ?? {}) });

  const put = async (
    scope: Scope,
    visibility: StampVisibility,
    action: Action,
    expectedStampId?: string,
    body?: { before: string | null; after: string | null }
  ): Promise<Outcome> => {
    if (!isCurrentSignedIn(scope) || scope.pending) return "skipped"; // 이전 화면 안내·메뉴와 연타 차단
    scope.pending = true;
    readRunner.cancel(); // 앞서 시작한 #35의 응답 무효화
    try {
      const result = await putTodayStamp(scope.libraryId, visibility, expectedStampId, body ? { body: body.after } : undefined);
      if (!isCurrentSignedIn(scope)) return "skipped";
      setToday(result);
      setRead("ok");
      setMenu(false);
      const stamp = result.stamp;
      if (stamp === null) return "ok";
      emitStampChanged({ libraryId: scope.libraryId, userId: scope.userId!, stampId: stamp.id, visibility: stamp.visibility });
      if (action === "note") {
        setNote(null);
        notice(scope, stamp.body === null ? STAMP_TEXT.noteCleared : body?.before ? STAMP_TEXT.noteEdited : STAMP_TEXT.noteAdded);
      } else if (action === "first") {
        notice(scope, STAMP_TEXT.privateNotice, {
          ms: PRIVATE_NOTICE_MS,
          action: { label: STAMP_TEXT.toPublic, run: () => void put(scope, "public", "change", stamp.id) },
        });
      } else {
        notice(scope, stamp.visibility === "public" ? STAMP_TEXT.savedPublic : STAMP_TEXT.changedPrivate);
      }
      return "ok";
    } catch (e) {
      if (!isCurrentSignedIn(scope)) return "skipped";
      setMenu(false);
      if (e instanceof ApiCallError && e.status === 409 && e.code === "STAMP_DATE_CHANGED") {
        setNote(null);
        notice(scope, STAMP_TEXT.dateChanged);
        void reloadToday(scope); // #35 재조회로 새 날짜 버튼 복구
        return "dateChanged";
      }
      if (action === "note") return "failed"; // 한마디 창·글 그대로, 창 안에 실패 안내
      notice(scope, action === "first" ? STAMP_TEXT.failed : STAMP_TEXT.changeFailed);
      return "failed";
    } finally {
      scope.pending = false;
    }
  };

  const onPress = () => {
    if (status === "signedOut") {
      setLoginSheet(true); // 서버를 부르지 않는다(V4-O4)
      return;
    }
    const scope = scopeRef.current;
    if (!isCurrentSignedIn(scope)) return;
    if (read === "error") {
      void reloadToday(scope, true); // 오늘 상태를 모르면 찍지 않고 먼저 다시 확인한다(이미 공개한 것을 비공개로 덮지 않게)
      return;
    }
    if (read === "ok" && today?.stamped === false) void put(scope, "private", "first");
  };

  const onMenuFlip = () => {
    const stamp = today?.stamp;
    if (!stamp) return;
    void put(scopeRef.current, stamp.visibility === "public" ? "private" : "public", "change", stamp.id);
  };

  const openNote = () => {
    const stamp = today?.stamp;
    if (!stamp) return;
    setMenu(false);
    setNote({ text: stamp.body ?? "", busy: false, failed: false });
  };

  const saveNote = async () => {
    const stamp = today?.stamp;
    if (!stamp || !note || note.busy) return;
    const after = note.text.trim() || null;
    setNote({ ...note, busy: true, failed: false });
    const outcome = await put(scopeRef.current, stamp.visibility, "note", stamp.id, { before: stamp.body ?? null, after });
    if (outcome === "failed" || outcome === "skipped") {
      setNote((n) => (n ? { ...n, busy: false, failed: outcome === "failed" } : n));
    }
  };

  const openMenu = () => {
    // 창 안의 글자 위치를 재서 그 바로 아래에 연다. 재지 못하면(시험·드문 기기) 오른쪽 위 기본 자리
    setMenu(true);
    labelRef.current?.measureInWindow?.((x, y, w, h) => {
      if (w > 0) setAnchor({ right: Math.max(8, windowWidth() - (x + w)), top: y + h + 4 });
    });
  };

  const stamp = today?.stamped ? today.stamp : null;
  return (
    <View style={styles.wrap} testID="stamp-control">
      {stamp ? (
        <>
          <Pressable
            ref={labelRef}
            accessibilityRole="button"
            accessibilityLabel={STAMP_TEXT.menuLabel}
            accessibilityState={{ expanded: menu }}
            onPress={openMenu}
            style={styles.pullDown}
          >
            <Text style={styles.label} numberOfLines={1} testID="stamp-label">
              {stamp.visibility === "public" ? STAMP_TEXT.labelPublic : STAMP_TEXT.labelPrivate}
            </Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          testID="stamp-button"
        >
          <Text style={styles.buttonText}>{STAMP_TEXT.button}</Text>
        </Pressable>
      )}

      {menu && stamp ? (
        <Modal transparent animationType="fade" onRequestClose={() => setMenu(false)}>
          {/* 바깥을 누르면 닫힌다. 메뉴는 글자 바로 아래 오른쪽 맞춤(시트 아님) */}
          <Pressable accessibilityLabel={STAMP_TEXT.close} style={styles.dropScrim} onPress={() => setMenu(false)}>
            <View
              style={[styles.drop, anchor ? { position: "absolute", right: anchor.right, top: anchor.top } : styles.dropFallback]}
              testID="stamp-menu"
            >
              <Pressable accessibilityRole="menuitem" onPress={onMenuFlip} style={styles.dropItem}>
                <Text style={styles.dropText}>
                  {stamp.visibility === "public" ? STAMP_TEXT.menuToPrivate : STAMP_TEXT.menuToPublic}
                </Text>
              </Pressable>
              <View style={styles.dropDivider} />
              <Pressable accessibilityRole="menuitem" onPress={openNote} style={styles.dropItem} testID="stamp-menu-note">
                <Text style={styles.dropText}>{stamp.body ? STAMP_TEXT.noteEdit : STAMP_TEXT.noteAdd}</Text>
                <Text style={styles.dropSub}>{STAMP_TEXT.noteSub}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {note && stamp ? (
        <StampNoteSheet
          title={stamp.body ? STAMP_TEXT.noteEdit : STAMP_TEXT.noteAdd}
          text={note.text}
          unchanged={(note.text.trim() || null) === (stamp.body ?? null)}
          busy={note.busy}
          failed={note.failed}
          onChange={(text) => setNote((n) => (n ? { ...n, text, failed: false } : n))}
          onSave={() => void saveNote()}
          onClose={() => {
            if (!note.busy) setNote(null);
          }}
        />
      ) : null}

      <StampLoginSheet visible={loginSheet} title={STAMP_TEXT.loginNeeded} onClose={() => setLoginSheet(false)} />
    </View>
  );
}

/** 한마디 쓰는 창(V4-O6). 기존 한마디를 채워 열고, 비우고 저장하면 지운다 */
function StampNoteSheet(props: {
  title: string;
  text: string;
  unchanged: boolean;
  busy: boolean;
  failed: boolean;
  onChange(text: string): void;
  onSave(): void;
  onClose(): void;
}) {
  const { C, ACT, styles } = useLook(makeStyles);
  const disabled = props.unchanged || props.busy;
  return (
    <Modal transparent animationType="fade" onRequestClose={props.onClose}>
      <ModalFrame>
        <View style={styles.backdrop}>
          <View style={styles.sheet} testID="stamp-note-sheet">
            <Text style={styles.sheetTitle}>{props.title}</Text>
            <Text style={styles.sheetSub}>{STAMP_TEXT.noteGuide}</Text>
            <TextInput
              value={props.text}
              onChangeText={props.onChange}
              placeholder={STAMP_TEXT.notePlaceholder}
              placeholderTextColor={C.inkMuted}
              maxLength={STAMP_BODY_MAX}
              multiline
              autoFocus
              accessibilityLabel={props.title}
              style={styles.noteInput}
              testID="stamp-note-input"
            />
            <Text style={styles.noteCount}>{STAMP_TEXT.noteCount(props.text.trim().length)}</Text>
            {props.failed ? (
              <Text style={styles.sheetSub} accessibilityRole="alert" testID="stamp-note-failed">
                {STAMP_TEXT.noteFailed}
              </Text>
            ) : null}
            <View style={styles.noteActions}>
              <Pressable
                accessibilityRole="button"
                onPress={props.onClose}
                style={({ pressed }) => [styles.secondary, styles.noteAction, pressed && ACT.secondaryPressed]}
              >
                <Text style={styles.secondaryText}>{STAMP_TEXT.close}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={props.onSave}
                testID="stamp-note-save"
                style={({ pressed }) => [styles.primary, styles.noteAction, pressed && ACT.primaryPressed, disabled && styles.dim]}
              >
                <Text style={styles.primaryText}>{props.busy ? STAMP_TEXT.noteSaving : STAMP_TEXT.noteSave}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ModalFrame>
    </Modal>
  );
}

/** 비로그인 안내(V4-O4). 아래에서 올라오는 안내 창. 스탬프 카드 북마크도 같이 쓴다 */
export function StampLoginSheet({ visible, title, onClose }: { visible: boolean; title: string; onClose(): void }) {
  const { ACT, styles } = useLook(makeStyles);
  const router = useRouter();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}><ModalFrame>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityRole="alert" testID="stamp-login-sheet">
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetSub}>{STAMP_TEXT.loginSub}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push({ pathname: "/login" });
            }}
            style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
          >
            <Text style={styles.primaryText}>{STAMP_TEXT.login}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryText}>{STAMP_TEXT.close}</Text>
          </Pressable>
        </View>
      </View>
    </ModalFrame></Modal>
  );
}

const makeStyles = (theme: Theme) => {
  const { C, T, ACT } = lookKit(theme);
  return StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minHeight: 44, gap: 2, flexShrink: 1 },
  // V4-1: 무광 판, 완전한 필(9999). 2026-11-26 아래 검은 받침 제거·글자 2자로 줄어 폭·높이도 줄임(16→12, 40→36)
  button: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.surface3,
    borderRadius: theme.radii.control,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
  },
  buttonPressed: { transform: [{ translateY: 1 }] },
  buttonText: { fontSize: 14, fontWeight: "500", color: C.text },
  label: { fontSize: 12, color: C.inkMuted, flexShrink: 1 },
  pullDown: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, flexShrink: 1 },
  caret: { fontSize: 11, color: C.text },
  dropScrim: { flex: 1 },
  // 시안 #el-visithead A: 최소 폭 140, 곡률 9, 항목 높이 44
  drop: {
    minWidth: 140,
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    paddingVertical: 4,
    boxShadow: `0 2px 10px 0 ${C.shadowSoft}`,
  },
  dropFallback: { position: "absolute", right: 16, top: 160 },
  dropItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  dropText: { fontSize: 14, fontWeight: "500", color: C.text },
  dropSub: { fontSize: 11, color: C.inkMuted, marginTop: 1 },
  dropDivider: { height: 1, backgroundColor: C.seamHairline, marginHorizontal: 10 },
  noteInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    color: C.text,
    textAlignVertical: "top",
  },
  noteCount: { alignSelf: "flex-end", fontSize: 12, color: C.inkMuted },
  noteActions: { flexDirection: "row", gap: 10 },
  noteAction: { flex: 1 },
  dim: { opacity: 0.5 },
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
  sheetTitle: { ...T.title },
  sheetSub: { fontSize: 14, color: C.textSub },
  row: { minHeight: 52, justifyContent: "center" },
  rowText: { fontSize: 16, fontWeight: "500", color: C.text },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center" },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center" },
  secondaryText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "500" },
  });
};
