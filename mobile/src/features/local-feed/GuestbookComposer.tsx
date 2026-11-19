// VISIT-3-P3 "+" 고르기 창·방명록 쓰는 창·방명록 로그인 창 — contracts/local-feed.md VISIT-3 V3-O3·V3-O5·V3-9·C3, 명세 결정 2
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { actionColors, theme, type as T } from "../../theme";
import { ApiCallError, GUESTBOOK_MAX, postGuestbook, type GuestbookItem } from "./api";

const C = theme.colors;
const ACT = actionColors(theme.colors);

export const GUESTBOOK_TEXT = {
  chooserTitle: "무엇을 올릴까요?",
  choosePost: "게시물 올리기",
  choosePostSub: "사진·표지와 글",
  chooseGuestbook: "방명록 남기기",
  chooseGuestbookSub: `짧은 한마디 (${GUESTBOOK_MAX}자까지)`,
  close: "닫기",
  title: "방명록 남기기",
  guide: (libraryName: string) => `${libraryName}에 짧은 한마디를 남겨요. 모두가 볼 수 있어요.`,
  placeholder: "예) 2층 창가 자리 오늘 햇살 좋아요",
  count: (n: number) => `${n}/${GUESTBOOK_MAX}`,
  submit: "올리기",
  sending: "올리는 중…",
  empty: "한 글자 이상 써 주세요",
  tooLong: `${GUESTBOOK_MAX}자까지 쓸 수 있어요`,
  postFailed: "방명록을 올리지 못했어요. 다시 해 주세요",
  posted: "방명록을 남겼어요",
  loginNeeded: "로그인하면 방명록을 남길 수 있어요",
  loginSub: "책장과 피드는 로그인 없이도 볼 수 있어요.",
  login: "로그인하기",
} as const;

export type ComposeChooserProps = { visible: boolean; onPost(): void; onGuestbook(): void; onClose(): void };

/** "+"를 누르면 아래에서 뜨는 고르기 창(결정 2) */
export function ComposeChooser({ visible, onPost, onGuestbook, onClose }: ComposeChooserProps) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="compose-chooser">
          <Text style={styles.sheetTitle}>{GUESTBOOK_TEXT.chooserTitle}</Text>
          <Pressable accessibilityRole="button" onPress={onPost} style={styles.row}>
            <Text style={styles.rowText}>{GUESTBOOK_TEXT.choosePost}</Text>
            <Text style={styles.rowSub}>{GUESTBOOK_TEXT.choosePostSub}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onGuestbook} style={styles.row}>
            <Text style={styles.rowText}>{GUESTBOOK_TEXT.chooseGuestbook}</Text>
            <Text style={styles.rowSub}>{GUESTBOOK_TEXT.chooseGuestbookSub}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryText}>{GUESTBOOK_TEXT.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** 로그인하지 않은 사람이 "방명록 남기기"를 고를 때(예외 #4). 서버에 묻지 않는다 */
export function GuestbookLoginSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const router = useRouter();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityRole="alert" testID="guestbook-login-sheet">
          <Text style={styles.sheetTitle}>{GUESTBOOK_TEXT.loginNeeded}</Text>
          <Text style={styles.sub}>{GUESTBOOK_TEXT.loginSub}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push({ pathname: "/login" });
            }}
            style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
          >
            <Text style={styles.primaryText}>{GUESTBOOK_TEXT.login}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryText}>{GUESTBOOK_TEXT.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export type GuestbookComposerProps = {
  libraryId: number;
  libraryName: string;
  visible: boolean;
  onClose(): void;
  onPosted(item: GuestbookItem): void;
};

/** 쓰는 창. client_request_id는 창을 열 때 한 번 만들고 성공·닫기 때 버린다(V3-9) */
export function GuestbookComposer({ libraryId, libraryName, visible, onClose, onPosted }: GuestbookComposerProps) {
  const [body, setBody] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (visible) {
      requestId.current = Crypto.randomUUID(); // 창을 열 때 한 번
      setBody("");
      setWarn(null);
    } else {
      requestId.current = null;
    }
  }, [visible]);

  async function submit() {
    const text = body.trim();
    if (text.length === 0) {
      setWarn(GUESTBOOK_TEXT.empty);
      return;
    }
    if (sending.current) return; // 연타: 진행 중이면 무시
    sending.current = true;
    setBusy(true);
    setWarn(null);
    try {
      const item = await postGuestbook(libraryId, text, requestId.current ?? Crypto.randomUUID());
      requestId.current = null;
      onPosted(item);
    } catch (e) {
      // 글은 그대로 두고, 다시 누르면 같은 requestId로 보낸다(같은 글이면 200)
      const tooLong = e instanceof ApiCallError && e.status === 422 && e.detail === "body";
      setWarn(tooLong ? GUESTBOOK_TEXT.tooLong : GUESTBOOK_TEXT.postFailed);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog} testID="guestbook-composer">
          <Text style={styles.sheetTitle}>{GUESTBOOK_TEXT.title}</Text>
          <Text style={styles.sub}>{GUESTBOOK_TEXT.guide(libraryName)}</Text>
          <TextInput
            value={body}
            onChangeText={(t) => {
              setBody(t);
              if (warn) setWarn(null);
            }}
            placeholder={GUESTBOOK_TEXT.placeholder}
            placeholderTextColor={C.inkMuted}
            maxLength={GUESTBOOK_MAX}
            multiline
            autoFocus
            style={styles.input}
            accessibilityLabel={GUESTBOOK_TEXT.title}
            testID="guestbook-input"
          />
          <View style={styles.inputFoot}>
            <Text style={styles.warn} testID="guestbook-warn">
              {warn ?? ""}
            </Text>
            <Text style={styles.count}>{GUESTBOOK_TEXT.count(body.trim().length)}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.secondary, styles.action, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{GUESTBOOK_TEXT.close}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy }}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.primary, styles.action, pressed && ACT.primaryPressed]}
            >
              <Text style={styles.primaryText}>{busy ? GUESTBOOK_TEXT.sending : GUESTBOOK_TEXT.submit}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: C.shadowDeep },
  // 쓰는 창은 위쪽에 두어 키보드가 입력 칸을 가리지 않게 한다(플랫폼 분기 없음)
  dialogBackdrop: { flex: 1, justifyContent: "flex-start", paddingTop: 72, paddingHorizontal: 16, backgroundColor: C.shadowDeep },
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
  dialog: {
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    padding: 20,
    gap: 10,
  },
  sheetTitle: { ...T.title },
  sub: { fontSize: 14, color: C.textSub },
  row: { minHeight: 52, justifyContent: "center" },
  rowText: { fontSize: 16, fontWeight: "500", color: C.text },
  rowSub: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  input: {
    minHeight: 96,
    maxHeight: 180,
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
  inputFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, minHeight: 18 },
  warn: { flex: 1, fontSize: 13, color: C.text },
  count: { fontSize: 12, color: C.inkMuted },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center" },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center" },
  secondaryText: { ...ACT.secondaryText, fontSize: 15, fontWeight: "500" },
});
