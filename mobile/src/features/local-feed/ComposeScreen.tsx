/**
 * LOCAL-1 글쓰기 화면 (specs/local-feed/세부/LOCAL-1.md 결정 1~4, 예외 1~7).
 * 쓰는 순서: 이미지(사진·표지·단색) → 글자 → 감상(선택) → 책·도서관 → 올리기.
 * 색·곡률은 theme 토큰만 쓴다.
 */
import { useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { onFill, theme } from "../../theme";
import {
  BODY_MAX, ImageKind, OVERLAY_MAX, POST_COLORS, Post, PostApiError, PostBook, PostColor, PostsApi,
} from "./api";

const c = theme.colors;
const r = theme.radii;

export type OverlayPos = "top" | "mid" | "bot";
type Picked =
  | { kind: "photo"; uri: string }
  | { kind: "cover"; book: PostBook }
  | { kind: "color"; color: PostColor };

export type ComposeProps = {
  libraryId: number;
  libraryName: string;
  api: PostsApi;
  signedIn: boolean;
  pickImage: (source: "camera" | "library") => Promise<{ uri: string } | null>;
  /** 책 찾기 화면(C)으로 가서 고른 책을 돌려받는다. TODO(연결): C 책 찾기 화면 */
  pickBook: () => Promise<PostBook | null>;
  onClose: () => void;
  onPosted: (post: Post) => void;
  onLogin: () => void;
  newRequestId?: () => string;
};

export const MSG = {
  title: "어떤 이미지로 올릴까요?",
  needImage: "이미지를 하나 골라야 올릴 수 있어요",
  failed: "지금은 올릴 수 없어요. 쓴 내용은 그대로 있어요.",
  tooBig: "사진이 너무 커요.",
  retry: "다시 올리기",
  posting: "올리는 중…",
  post: "올리기",
  noCover: "표지를 찾지 못해 제목·저자로 만들었어요",
  toPhotoOrColor: "사진·단색으로 바꾸기",
  loginTitle: "로그인하면 글을 올릴 수 있어요",
  loginSub: "구경은 로그인 없이도 할 수 있어요.",
  discardTitle: "쓰던 글을 버릴까요?",
  discardSub: "닫으면 쓴 내용이 남지 않아요.",
  webNoCamera: "웹에서는 앨범에서 골라 주세요",
} as const;

/** 진행 중에는 다시 부르지 않는 함수로 감싼다(예외 3: 연타는 한 번만). */
export function once<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  let running = false;
  return async (...args: A) => {
    if (running) return;
    running = true;
    try { await fn(...args); } finally { running = false; }
  };
}

function colorOf(token: PostColor): string {
  return c[token];
}

export function ComposeScreen(props: ComposeProps) {
  const { api, libraryId, libraryName } = props;
  const requestId = useRef(props.newRequestId?.() ?? Crypto.randomUUID()); // F9: 화면을 열 때 하나
  const [picked, setPicked] = useState<Picked | null>(null);
  const [overlay, setOverlay] = useState("");
  const [pos, setPos] = useState<OverlayPos>("mid");
  const [bodyOpen, setBodyOpen] = useState(false);
  const [body, setBody] = useState("");
  const [book, setBook] = useState<PostBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const [loginSheet, setLoginSheet] = useState(!props.signedIn);
  const uploaded = useRef<{ uri: string; path: string } | null>(null);

  const dirty = picked !== null || overlay.trim() !== "" || body.trim() !== "";
  // 결정 2: 표지를 고른 책은 마지막 단계에 이미 붙어 있다. 표지가 없는 책은 제목·저자 표지(단색 fill3 + 제목·저자).
  const generatedCover = picked?.kind === "cover" && !picked.book.cover_url;

  async function choose(kind: ImageKind) {
    setNotice(null);
    if (kind === "color") { setPicked({ kind: "color", color: "fill1" }); return; }
    if (kind === "cover") {
      const b = await props.pickBook();
      if (b) { setPicked({ kind: "cover", book: b }); setBook(b); }
      return;
    }
    const img = await props.pickImage("library");
    if (img) { uploaded.current = null; setPicked({ kind: "photo", uri: img.uri }); }
  }

  async function takePhoto() {
    const img = await props.pickImage("camera");
    if (img) { uploaded.current = null; setPicked({ kind: "photo", uri: img.uri }); }
    else setNotice(MSG.webNoCamera);
  }

  async function attachBook() {
    const b = await props.pickBook();
    if (b) setBook(b);
  }

  const submitRef = useRef<() => Promise<void>>(async () => {});
  const submitOnce = useRef(once(() => submitRef.current())).current;

  async function submit() {
    if (!picked) return;
    if (!props.signedIn) { setLoginSheet(true); return; }
    setBusy(true);
    setError(null);
    try {
      let imagePath: string | null = null;
      if (picked.kind === "photo") {
        if (uploaded.current?.uri !== picked.uri) {
          const up = await api.uploadPostImage(picked.uri);
          uploaded.current = { uri: picked.uri, path: up.image_path };
        }
        imagePath = uploaded.current.path;
      }
      const userText = overlay.trim() || null;
      const kind: ImageKind = generatedCover ? "color" : picked.kind;
      const post = await api.createPost({
        client_request_id: requestId.current,
        library_id: libraryId,
        isbn13: book?.isbn13 ?? null,
        image_kind: kind,
        image_path: imagePath,
        image_color: picked.kind === "color" ? picked.color : generatedCover ? "fill3" : null,
        // 제목·저자 표지는 단색 + 제목·저자 글자로 저장한다(계약서 F6 422 회피, 검토 메모 [계약 보완 필요])
        overlay_text: generatedCover && picked.kind === "cover"
          ? userText ?? [picked.book.title, picked.book.author].filter(Boolean).join(" · ").slice(0, OVERLAY_MAX)
          : userText,
        body: body.trim() || null,
      });
      props.onPosted(post);
    } catch (e) {
      setError(e instanceof PostApiError && e.code === "PAYLOAD_TOO_LARGE" ? MSG.tooBig : MSG.failed);
    } finally {
      setBusy(false);
    }
  }

  submitRef.current = submit;

  function close() {
    if (dirty) setAskDiscard(true);
    else props.onClose();
  }

  const fill = picked?.kind === "color" ? colorOf(picked.color) : generatedCover ? c.fill3 : c.surface3;
  const textColor = onFill(fill);
  const overlayPos = picked?.kind === "color" || generatedCover ? "mid" : pos; // 단색은 늘 가운데(큰 틀 결정 2)

  return (
    <View style={s.screen} testID="compose">
      <View style={s.top}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="닫기" testID="compose-close"><Text style={s.x}>✕</Text></Pressable>
        <Pressable onPress={submitOnce} disabled={!picked || busy} accessibilityRole="button" testID="compose-submit">
          <Text style={[s.post, (!picked || busy) && s.postOff]}>{busy ? MSG.posting : MSG.post}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {!picked ? (
          <View testID="pick-step">
            <Text style={s.h}>{MSG.title}</Text>
            <Text style={s.sub}>{libraryName} 광장에 올라가요</Text>
            <Pressable style={s.opt} onPress={() => choose("photo")} testID="pick-photo"><Text style={s.optT}>사진 찍기 · 앨범</Text><Text style={s.sub}>사진의 위치 정보는 올리기 전에 지워요</Text></Pressable>
            <Pressable onPress={takePhoto} testID="pick-camera"><Text style={s.link}>카메라로 찍기</Text></Pressable>
            <Pressable style={s.opt} onPress={() => choose("cover")} testID="pick-cover"><Text style={s.optT}>책 표지</Text><Text style={s.sub}>책을 찾아 표지를 가져와요</Text></Pressable>
            <Pressable style={s.opt} onPress={() => choose("color")} testID="pick-color"><Text style={s.optT}>단색 배경</Text><Text style={s.sub}>좋은 문장을 가운데에 크게</Text></Pressable>
            {notice ? <Text style={s.sub}>{notice}</Text> : null}
            <Text style={s.sub} testID="need-image">{MSG.needImage}</Text>
          </View>
        ) : (
          <View>
            <View style={[s.canvas, { backgroundColor: fill }]} testID="canvas">
              {picked.kind === "photo" ? <Image source={{ uri: picked.uri }} style={StyleSheet.absoluteFill} testID="photo" /> : null}
              {picked.kind === "cover" && picked.book.cover_url ? <Image source={{ uri: picked.book.cover_url }} style={StyleSheet.absoluteFill} testID="cover" /> : null}
              {picked.kind === "cover" && generatedCover ? (
                <View style={s.genCover}><Text style={[s.genT, { color: textColor }]}>{picked.book.title}</Text><Text style={{ color: textColor }}>{picked.book.author ?? ""}</Text></View>
              ) : null}
              {overlay.trim() ? (
                <Text testID="overlay" style={[s.overlay, overlayPos === "top" ? s.oTop : overlayPos === "bot" ? s.oBot : s.oMid, { color: textColor }]}>{overlay.trim()}</Text>
              ) : null}
            </View>
            {generatedCover ? (
              <Text style={s.sub} testID="no-cover">{MSG.noCover} · <Text style={s.link} onPress={() => setPicked(null)}>{MSG.toPhotoOrColor}</Text></Text>
            ) : null}

            <TextInput testID="overlay-input" style={s.input} placeholder="이미지 위에 넣을 글자" value={overlay}
              onChangeText={(t) => setOverlay(t.slice(0, OVERLAY_MAX))} />
            {picked.kind !== "color" && !generatedCover ? (
              <View style={s.seg} testID="pos-seg">
                {(["top", "mid", "bot"] as const).map((p) => (
                  <Pressable key={p} testID={`pos-${p}`} onPress={() => setPos(p)} style={[s.segB, pos === p && s.segOn]}>
                    <Text style={pos === p ? s.segOnT : undefined}>{p === "top" ? "위" : p === "mid" ? "가운데" : "아래"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {picked.kind === "color" ? (
              <View style={s.colors}>
                {POST_COLORS.map((t) => (
                  <Pressable key={t} testID={`color-${t}`} accessibilityLabel={t} onPress={() => setPicked({ kind: "color", color: t })}
                    style={[s.dot, { backgroundColor: colorOf(t) }, picked.color === t && s.dotOn]} />
                ))}
              </View>
            ) : null}

            {bodyOpen ? (
              <TextInput testID="body-input" style={[s.input, s.multi]} multiline placeholder="감상이나 좋았던 문장" value={body}
                onChangeText={(t) => setBody(t.slice(0, BODY_MAX))} />
            ) : (
              <Pressable style={s.row} onPress={() => setBodyOpen(true)} testID="open-body"><Text>+ 감상 쓰기</Text></Pressable>
            )}

            <Pressable style={s.row} onPress={attachBook} testID="book-row">
              <Text>{book ? `📖 ${book.title}${book.author ? ` · ${book.author}` : ""}` : "책 붙이기"}</Text>
            </Pressable>
            <View style={s.row}><Text>{libraryName} 광장에 올라가요</Text></View>
          </View>
        )}
      </ScrollView>

      {error ? (
        <View style={s.card} testID="error-card">
          <Text style={s.center}>{error}</Text>
          <Pressable style={s.btn} onPress={submitOnce} testID="retry"><Text style={s.btnT}>{MSG.retry}</Text></Pressable>
        </View>
      ) : null}

      {askDiscard ? (
        <>
          <View style={s.dim} />
          <View style={s.dialog} testID="discard-dialog">
            <Text style={s.bold}>{MSG.discardTitle}</Text>
            <Text style={s.sub}>{MSG.discardSub}</Text>
            <View style={s.dbtn}>
              <Pressable onPress={() => setAskDiscard(false)} testID="keep-writing"><Text>계속 쓰기</Text></Pressable>
              <Pressable onPress={props.onClose} testID="discard"><Text style={s.bold}>버리기</Text></Pressable>
            </View>
          </View>
        </>
      ) : null}

      {loginSheet ? <LoginSheet onLogin={props.onLogin} onClose={() => { setLoginSheet(false); if (!props.signedIn) props.onClose(); }} /> : null}
    </View>
  );
}

export function LoginSheet({ onLogin, onClose }: { onLogin: () => void; onClose: () => void }) {
  return (
    <>
      <View style={s.dim} />
      <View style={s.sheet} testID="login-sheet">
        <Text style={s.bold}>{MSG.loginTitle}</Text>
        <Text style={s.sub}>{MSG.loginSub}</Text>
        <Pressable style={s.btn} onPress={onLogin} testID="login"><Text style={s.btnT}>로그인하기</Text></Pressable>
        <Pressable onPress={onClose} testID="login-close"><Text style={s.sub}>닫기</Text></Pressable>
      </View>
    </>
  );
}

/**
 * 결정 4: 내 게시물 상세의 ⋯ 메뉴 → "게시물 내리기" → 확인 → 내림.
 * 상세 화면 자체는 LOCAL-2. 남의 게시물(is_mine=false)에는 "게시물 내리기"가 없다.
 */
export function PostMoreMenu({ post, api, onWithdrawn }: { post: Post; api: PostsApi; onWithdrawn: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);
  async function withdraw() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setFailed(false);
    try { await api.withdrawPost(post.id); setConfirm(false); setOpen(false); onWithdrawn(post.id); }
    catch { setFailed(true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} testID="more" accessibilityLabel="더 보기"><Text style={s.more}>⋯</Text></Pressable>
      {open ? (
        <>
          <Pressable style={s.dim} onPress={() => setOpen(false)} />
          <View style={s.sheet} testID="more-sheet">
            <Text style={s.menuRow}>공유</Text>
            {post.is_mine ? <Pressable onPress={() => setConfirm(true)} testID="withdraw-open"><Text style={[s.menuRow, s.bold]}>게시물 내리기</Text></Pressable> : null}
          </View>
        </>
      ) : null}
      {confirm ? (
        <View style={s.dialog} testID="withdraw-dialog">
          <Text style={s.bold}>이 게시물을 내릴까요?</Text>
          <Text style={s.sub}>내리면 광장과 링크에서 바로 사라져요.</Text>
          {failed ? <Text style={s.sub}>지금은 내릴 수 없어요. 다시 해 주세요.</Text> : null}
          <View style={s.dbtn}>
            <Pressable onPress={() => setConfirm(false)} testID="withdraw-cancel"><Text>취소</Text></Pressable>
            <Pressable onPress={withdraw} disabled={busy} testID="withdraw-confirm"><Text style={s.bold}>내리기</Text></Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.paper },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  x: { fontSize: 22, color: c.text },
  post: { fontSize: 16, fontWeight: "700", color: c.text },
  postOff: { opacity: 0.35 },
  body: { padding: 16, gap: 10 },
  h: { fontSize: 20, fontWeight: "700", color: c.text, marginTop: 8 },
  sub: { fontSize: 13, color: c.textSub },
  opt: { backgroundColor: c.cream, borderRadius: r.inner, padding: 16, marginTop: 10, gap: 2 },
  optT: { fontSize: 16, fontWeight: "700", color: c.text },
  link: { fontWeight: "700", color: c.text, marginTop: 6 },
  canvas: { height: 380, borderRadius: r.card, overflow: "hidden", justifyContent: "center" },
  genCover: { alignItems: "center", gap: 4 },
  genT: { fontSize: 20, fontWeight: "700" },
  overlay: { position: "absolute", left: "8%", right: "8%", textAlign: "center", fontSize: 15, fontWeight: "700" },
  oTop: { top: "10%" },
  oMid: { top: "45%" },
  oBot: { bottom: 16 },
  input: { backgroundColor: c.cream, borderRadius: r.inner, padding: 12, fontSize: 15, color: c.text, marginTop: 10 },
  multi: { minHeight: 100, textAlignVertical: "top" },
  seg: { flexDirection: "row", alignSelf: "center", marginTop: 6 },
  segB: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: c.surface2 },
  segOn: { backgroundColor: c.inkStrong },
  segOnT: { color: c.paper },
  colors: { flexDirection: "row", gap: 10, justifyContent: "center", marginTop: 6 },
  dot: { width: 32, height: 32, borderRadius: r.control, borderWidth: 1, borderColor: c.divider },
  dotOn: { borderWidth: 3, borderColor: c.inkStrong },
  row: { backgroundColor: c.cream, borderRadius: r.inner, padding: 12, marginTop: 10 },
  card: { position: "absolute", left: 24, right: 24, top: 180, backgroundColor: c.paper, borderRadius: r.card, padding: 16, gap: 8, alignItems: "center", elevation: 6 },
  center: { textAlign: "center", color: c.text },
  btn: { backgroundColor: c.inkStrong, borderRadius: r.control, paddingHorizontal: 16, paddingVertical: 8 },
  btnT: { color: c.paper, fontWeight: "700" },
  dim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.inkStrong, opacity: 0.28 },
  dialog: { position: "absolute", left: 32, right: 32, top: 220, backgroundColor: c.paper, borderRadius: r.card, padding: 16, gap: 4 },
  dbtn: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.paper, borderTopLeftRadius: r.card, borderTopRightRadius: r.card, padding: 20, gap: 6, alignItems: "center" },
  bold: { fontWeight: "700", color: c.text },
  more: { fontSize: 20, color: c.text, paddingHorizontal: 6 },
  menuRow: { paddingVertical: 10, fontSize: 15, color: c.text },
});

export default ComposeScreen;
