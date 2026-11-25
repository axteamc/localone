// 게시물 고치기(2026-11-25 실기기 개선 P5, C-91). 본문·이미지 위 글자만 — 책·이미지는 그대로(사용자 결정).
// 상세 ⋯ → "게시물 수정" → 전체 화면 위로 올라오는 창(P-03: 취소 | 제목 | 저장). 바뀐 칸만 #72로 보낸다.
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardSurface, theme } from "../../theme";
import { ApiCallError, editPost, type Post } from "./api";

export const EDIT_TEXT = {
  title: "게시물 수정",
  cancel: "취소",
  save: "저장",
  saving: "저장 중…",
  overlay: "이미지 위 글자",
  body: "감상",
  bodyPlaceholder: "감상을 적어 보세요",
  keep: "책과 이미지는 바꿀 수 없어요. 바꾸려면 새로 올려 주세요.",
  failed: "지금은 고칠 수 없어요. 다시 시도해 주세요.",
} as const;
const OVERLAY_MAX = 80; // 서버 F15와 같다
const BODY_MAX = 2000;

export function PostEditSheet({ post, visible, onClose, onSaved }: {
  post: Pick<Post, "id" | "overlay_text" | "body">;
  visible: boolean;
  onClose(): void;
  onSaved(post: Post): void;
}) {
  const insets = useSafeAreaInsets();
  const [overlay, setOverlay] = useState(post.overlay_text ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setOverlay(post.overlay_text ?? "");
    setBody(post.body ?? "");
    setError(null);
  }, [visible, post.overlay_text, post.body]);

  const norm = (v: string) => (v.trim() === "" ? null : v.trim());
  const patch: { overlay_text?: string | null; body?: string | null } = {};
  if (norm(overlay) !== (post.overlay_text ?? null)) patch.overlay_text = norm(overlay);
  if (norm(body) !== (post.body ?? null)) patch.body = norm(body);
  const changed = Object.keys(patch).length > 0;

  const save = async () => {
    if (!changed || running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      onSaved(await editPost(post.id, patch));
    } catch (e) {
      setError(e instanceof ApiCallError && e.status !== 0 && e.status < 500 ? e.message : EDIT_TEXT.failed);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.head, { paddingTop: Platform.OS === "ios" ? 8 : 8 + insets.top }]}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.headBtn} disabled={busy}>
            <Text style={styles.headText}>{EDIT_TEXT.cancel}</Text>
          </Pressable>
          <Text style={styles.title}>{EDIT_TEXT.title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !changed || busy }}
            disabled={!changed || busy}
            onPress={() => void save()}
            style={styles.headBtn}
            testID="post-edit-save"
          >
            <Text style={[styles.headText, styles.save, (!changed || busy) && styles.dim]}>
              {busy ? EDIT_TEXT.saving : EDIT_TEXT.save}
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>{EDIT_TEXT.overlay}</Text>
          <TextInput
            testID="post-edit-overlay"
            value={overlay}
            onChangeText={setOverlay}
            maxLength={OVERLAY_MAX}
            style={styles.input}
            accessibilityLabel={EDIT_TEXT.overlay}
          />
          <Text style={styles.count}>{`${overlay.length}/${OVERLAY_MAX}`}</Text>
          <Text style={styles.label}>{EDIT_TEXT.body}</Text>
          <TextInput
            testID="post-edit-body"
            value={body}
            onChangeText={setBody}
            maxLength={BODY_MAX}
            multiline
            placeholder={EDIT_TEXT.bodyPlaceholder}
            placeholderTextColor={c.textSub}
            style={[styles.input, styles.multi]}
            accessibilityLabel={EDIT_TEXT.body}
          />
          <Text style={styles.count}>{`${body.length}/${BODY_MAX}`}</Text>
          <Text style={styles.keep}>{EDIT_TEXT.keep}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.panelFrosted },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.seamHairline,
  },
  headBtn: { minWidth: 64, minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  headText: { fontSize: 15, color: c.text },
  save: { fontWeight: "500", color: c.inkStrong, textAlign: "right" },
  dim: { color: c.textSub },
  title: { fontSize: 16, fontWeight: "500", color: c.text },
  body: { padding: 16, gap: 6 },
  label: { fontSize: 12, color: c.textSub, marginTop: 8 },
  input: { ...cardSurface(theme, { onPanel: true }), paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.text },
  multi: { minHeight: 160, textAlignVertical: "top" },
  count: { fontSize: 11, color: c.textSub, textAlign: "right" },
  keep: { fontSize: 12, color: c.textSub, marginTop: 12 },
  error: { fontSize: 14, color: c.loanOut },
});
