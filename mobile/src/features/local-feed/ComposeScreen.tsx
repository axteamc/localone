// LOCAL-1-P2 글쓰기·올리기·내리기 (contracts/local-feed.md LOCAL-1 F13~F17, specs/local-feed/세부/LOCAL-1.md)
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { fetchBook, fetchLibrary, searchBooks, type Book } from "../../lib/publicApi";
import { ON_FILL_LIGHT } from "../../theme/tokens";
import { onFill, theme } from "../../theme";
import {
  ApiCallError,
  BODY_MAX,
  COLOR_TOKENS,
  OVERLAY_MAX,
  createPost,
  uploadPostImage,
  withdrawPost,
  type ColorToken,
  type ImageKind,
  type Post,
  type UploadedImage,
} from "./api";
import { canUseCamera, pickPostImage, type PickSource } from "./imagePicker";

export type OverlayPos = "top" | "mid" | "bot";

export const TEXT = {
  needImage: "이미지를 하나 골라야 올릴 수 있어요",
  submit: "올리기",
  submitting: "올리는 중…",
  posted: "올렸어요",
  failed: "지금은 올릴 수 없어요. 쓴 내용은 그대로 있어요.",
  tooLarge: "사진이 너무 커요.",
  retry: "다시 올리기",
  loginNeeded: "로그인하면 글을 올릴 수 있어요",
  login: "로그인하기",
  close: "닫기",
  noCover: "표지를 찾지 못해 제목·저자로 만들었어요 · ",
  switchImage: "사진·단색으로 바꾸기",
  discardTitle: "쓰던 글을 버릴까요? 닫으면 쓴 내용이 남지 않아요.",
  keepWriting: "계속 쓰기",
  discard: "버리기",
  openBody: "+ 감상 쓰기",
  withdrawMenu: "게시물 내리기",
  withdrawTitle: "이 게시물을 내릴까요? 내리면 피드와 링크에서 바로 사라져요.",
  cancel: "취소",
  withdraw: "내리기",
  withdrawn: "내렸어요",
  withdrawFailed: "지금은 내릴 수 없어요. 다시 시도해 주세요.",
  noCamera: "이 기기에서는 사진 찍기를 쓸 수 없어요. 앨범에서 골라 주세요.",
  pickFailed: "사진을 불러오지 못했어요. 다시 시도해 주세요.",
  notFound: "찾을 수 없어요",
  goBack: "돌아가기",
} as const;

const TOAST_MS = 2000;
const C = theme.colors;
const POS_TOP: Record<OverlayPos, `${number}%` | undefined> = { top: "10%", mid: "45%", bot: undefined };
const POS_LABEL: Record<OverlayPos, string> = { top: "위", mid: "가운데", bot: "아래" };

/** 표지 없는 책(F14): 제목·저자 글자를 80자 이내로 */
export function titleAuthorText(book: Pick<Book, "title" | "author">): string {
  const raw = book.author ? `${book.title}\n${book.author}` : book.title;
  return raw.trim().slice(0, OVERLAY_MAX);
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type SubmitError = { message: string; retryable: boolean };

function classifySubmitError(e: unknown): SubmitError {
  if (e instanceof ApiCallError) {
    if (e.status === 413) return { message: TEXT.tooLarge, retryable: true };
    if (e.status === 0 || e.status === 429 || e.status === 503) {
      return { message: TEXT.failed, retryable: true };
    }
    if (e.status >= 400 && e.status < 500) {
      return {
        message: e.status === 404 ? "찾을 수 없어요." : e.message || TEXT.failed,
        retryable: false,
      };
    }
  }
  return { message: TEXT.failed, retryable: true };
}

type Picked =
  | { kind: "photo"; uri: string }
  | { kind: "cover" }
  | { kind: "color"; token: ColorToken };

// ─────────── 이미지 미리보기(글쓰기·올린 뒤 카드 공용) ───────────

type PreviewProps = {
  kind: ImageKind;
  imageUrl: string | null;
  color: ColorToken | null;
  text: string | null;
  pos: OverlayPos;
  testID?: string;
};

export function PostImage({ kind, imageUrl, color, text, pos, testID }: PreviewProps) {
  const bg = kind === "color" && color ? C[color] : C.surface3;
  const onColor = kind === "color" && color ? onFill(C[color]) : ON_FILL_LIGHT;
  const place = kind === "color" ? "mid" : pos; // 단색은 늘 가운데(큰 틀 결정 2)
  return (
    <View testID={testID} style={[styles.image, { backgroundColor: bg }]}>
      {kind !== "color" && imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {text ? (
        <Text
          testID={testID ? `${testID}-text-${place}` : undefined}
          style={[
            styles.overlay,
            { color: onColor },
            kind !== "color" && styles.overlayShadow,
            place === "bot" ? { bottom: 12 } : { top: POS_TOP[place] },
          ]}
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}

// ─────────── ⋯ 메뉴(LOCAL-2 상세가 다시 쓴다) ───────────

export function PostMoreMenu({
  post,
  onWithdrawn,
}: {
  post: Pick<Post, "id" | "is_mine">;
  onWithdrawn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const doWithdraw = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await withdrawPost(post.id);
      setConfirming(false);
      onWithdrawn();
    } catch (e) {
      setError(e instanceof ApiCallError && e.status !== 0 ? e.message : TEXT.withdrawFailed);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="더 보기"
        onPress={() => setOpen((v) => !v)}
        style={styles.moreButton}
      >
        <Text style={styles.moreText}>⋯</Text>
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {post.is_mine ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                setConfirming(true);
              }}
              style={styles.menuItem}
            >
              <Text style={styles.menuDanger}>{TEXT.withdrawMenu}</Text>
            </Pressable>
          ) : (
            <Text style={styles.menuEmpty}>할 수 있는 일이 없어요</Text>
          )}
        </View>
      ) : null}
      {confirming ? (
        <Dialog
          title={TEXT.withdrawTitle}
          cancel={TEXT.cancel}
          confirm={busy ? "내리는 중…" : TEXT.withdraw}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void doWithdraw()}
          error={error}
          danger
        />
      ) : null}
    </View>
  );
}

function Dialog(props: {
  title: string;
  cancel: string;
  confirm: string;
  onCancel: () => void;
  onConfirm: () => void;
  error?: string | null;
  danger?: boolean;
}) {
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={styles.dialog} accessibilityRole="alert">
        <Text style={styles.dialogTitle}>{props.title}</Text>
        {props.error ? <Text style={styles.errorText}>{props.error}</Text> : null}
        <View style={styles.dialogRow}>
          <Pressable accessibilityRole="button" onPress={props.onCancel} style={styles.dialogButton}>
            <Text style={styles.dialogCancel}>{props.cancel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={props.onConfirm} style={styles.dialogButton}>
            <Text style={props.danger ? styles.menuDanger : styles.dialogConfirm}>{props.confirm}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>{text}</Text>
    </View>
  );
}

// ─────────── 책 찾기(글쓰기 안, publicApi.searchBooks) ───────────

function BookFinder({ onPick, onClose }: { onPick: (book: Book) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Book[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const run = async () => {
    const q = query.trim();
    if (!q) return;
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await searchBooks(q);
      if (mine === seq.current) setItems(res.items);
    } catch {
      if (mine === seq.current) setFailed(true);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  return (
    <View style={styles.finder} testID="book-finder">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>책 찾기</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.headerSide}>
          <Text style={styles.link}>{TEXT.close}</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="책 제목이나 저자"
        placeholder="책 제목이나 저자"
        placeholderTextColor={C.textSub}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={run}
        returnKeyType="search"
        autoFocus
        style={styles.input}
      />
      <Pressable accessibilityRole="button" onPress={run} style={styles.pill}>
        <Text style={styles.pillText}>찾기</Text>
      </Pressable>
      {loading ? <ActivityIndicator color={C.inkStrong} /> : null}
      {failed ? <Text style={styles.errorText}>지금은 책을 찾을 수 없어요. 다시 시도해 주세요.</Text> : null}
      {items && items.length === 0 ? <Text style={styles.sub}>찾는 책이 없어요.</Text> : null}
      <ScrollView keyboardShouldPersistTaps="handled">
        {(items ?? []).map((book) => (
          <Pressable
            key={book.isbn13}
            accessibilityRole="button"
            onPress={() => onPick(book)}
            style={styles.bookRow}
          >
            <Text style={styles.bookTitle}>{book.title}</Text>
            <Text style={styles.sub}>{book.author ?? "저자 정보 없음"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─────────── 글쓰기 화면 ───────────

export type ComposeScreenProps = { libraryId: number; isbn13?: string | null };

export function ComposeScreen({ libraryId, isbn13 }: ComposeScreenProps) {
  const router = useRouter();
  const { status } = useAuth();
  const clientRequestId = useRef<string>(Crypto.randomUUID()).current; // 화면을 열 때 하나(F9)

  const [libraryName, setLibraryName] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [overlay, setOverlay] = useState("");
  const [pos, setPos] = useState<OverlayPos>("mid");
  const [bodyOpen, setBodyOpen] = useState(false);
  const [body, setBody] = useState("");
  const [finder, setFinder] = useState<null | "cover" | "attach">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [posted, setPosted] = useState<Post | null>(null);
  const [withdrawnDone, setWithdrawnDone] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const running = useRef(false);
  const uploaded = useRef<{ uri: string; image: UploadedImage } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const invalidLibraryId = !Number.isSafeInteger(libraryId) || libraryId < 1;

  useEffect(() => {
    if (invalidLibraryId) return;
    const ctrl = new AbortController();
    fetchLibrary(libraryId, ctrl.signal)
      .then((lib) => setLibraryName(lib.name))
      .catch(() => undefined); // 이름을 못 받아도 쓰기는 막지 않는다(표시만 "이 도서관")
    return () => ctrl.abort();
  }, [invalidLibraryId, libraryId]);

  useEffect(() => {
    // 책 상세에서 "글쓰기"로 들어오면(/posts/new?isbn13=) 그 책을 마지막 단계에 미리 붙인다
    if (!isbn13 || invalidLibraryId) return;
    const ctrl = new AbortController();
    fetchBook(isbn13, ctrl.signal)
      .then((b) => setBook((cur) => cur ?? b))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [invalidLibraryId, isbn13]);

  const coverMissing = picked?.kind === "cover" && book !== null && book.cover_url === null;
  const effectiveKind: ImageKind | null = picked ? (coverMissing ? "color" : picked.kind) : null;
  const dirty = picked !== null || overlay.trim() !== "" || body.trim() !== "" || book !== null;
  const canSubmit = picked !== null && !submitting && (picked.kind !== "cover" || book !== null);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else if (!invalidLibraryId) router.replace(`/libraries/${libraryId}`);
    else router.replace("/");
  };

  const onClose = () => {
    if (dirty && !posted) setConfirmClose(true);
    else leave();
  };

  const choosePhoto = async (source: PickSource) => {
    setNotice(null);
    if (source === "camera" && !canUseCamera()) {
      setNotice(TEXT.noCamera);
      return;
    }
    try {
      const result = await pickPostImage(source);
      if (result) setPicked({ kind: "photo", uri: result.uri });
    } catch {
      setNotice(TEXT.pickFailed);
    }
  };

  const pickBook = (chosen: Book) => {
    setBook(chosen);
    if (finder === "cover") setPicked({ kind: "cover" });
    setFinder(null);
  };

  const submit = async () => {
    if (running.current || !picked) return; // 연타 막기(예외 #3)
    running.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let imagePath: string | null = null;
      if (picked.kind === "photo") {
        if (uploaded.current?.uri !== picked.uri) {
          uploaded.current = { uri: picked.uri, image: await uploadPostImage(picked.uri) };
        }
        imagePath = uploaded.current.image.image_path;
      }
      const userText = nullIfBlank(overlay);
      const post = await createPost({
        client_request_id: clientRequestId,
        library_id: libraryId,
        isbn13: book?.isbn13 ?? null,
        image_kind: coverMissing ? "color" : picked.kind,
        image_path: imagePath,
        image_color: coverMissing ? "fill3" : picked.kind === "color" ? picked.token : null,
        overlay_text: coverMissing && book ? userText ?? titleAuthorText(book) : userText,
        body: nullIfBlank(body),
      });
      setPosted(post);
      showToast(TEXT.posted);
    } catch (e) {
      setError(classifySubmitError(e));
    } finally {
      running.current = false;
      setSubmitting(false);
    }
  };

  if (invalidLibraryId) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.dialogTitle}>{TEXT.notFound}</Text>
        <Pressable accessibilityRole="button" onPress={leave} style={styles.secondary}>
          <Text style={styles.dialogCancel}>{TEXT.goBack}</Text>
        </Pressable>
      </View>
    );
  }

  if (status === "loading") {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={C.inkStrong} />
      </View>
    );
  }

  if (status === "signedOut") {
    return (
      <View style={[styles.screen, styles.sheetBackdrop]}>
        <View style={styles.sheet} accessibilityRole="alert">
          <Text style={styles.dialogTitle}>{TEXT.loginNeeded}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={styles.primary}>
            <Text style={styles.primaryText}>{TEXT.login}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={leave} style={styles.secondary}>
            <Text style={styles.dialogCancel}>{TEXT.close}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (finder) {
    return (
      <View style={styles.screen}>
        <BookFinder onPick={pickBook} onClose={() => setFinder(null)} />
      </View>
    );
  }

  const libraryLabel = `${libraryName ?? "이 도서관"} 피드에 올라가요`;

  if (posted) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={leave} style={styles.headerSide}>
            <Text style={styles.headerX}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>내 게시물</Text>
          {!withdrawnDone ? (
            <PostMoreMenu
              post={posted}
              onWithdrawn={() => {
                setWithdrawnDone(true);
                showToast(TEXT.withdrawn);
              }}
            />
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {!withdrawnDone ? (
            <View testID="posted-card">
              <PostImage
                kind={posted.image_kind}
                imageUrl={posted.image_url}
                color={posted.image_color}
                text={posted.overlay_text}
                pos={pos}
              />
              {posted.book ? (
                <Text style={styles.sub}>📖 {posted.book.title}{posted.book.author ? ` · ${posted.book.author}` : ""}</Text>
              ) : null}
              <Text style={styles.sub}>{posted.library.name} · {posted.author.nickname}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(`/libraries/${libraryId}`)}
            style={styles.secondary}
          >
            <Text style={styles.link}>피드 보기</Text>
          </Pressable>
        </ScrollView>
        <Toast text={toast} />
      </View>
    );
  }

  const previewText =
    nullIfBlank(overlay) ?? (coverMissing && book ? titleAuthorText(book) : null);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.headerSide}>
          <Text style={styles.headerX}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>새 게시물</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={[styles.submit, !canSubmit && styles.submitOff]}
        >
          <Text style={styles.submitText}>{submitting ? TEXT.submitting : TEXT.submit}</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerText}>{error.message}</Text>
          {error.retryable ? (
            <Pressable accessibilityRole="button" onPress={() => void submit()} disabled={submitting} style={styles.pill}>
              <Text style={styles.pillText}>{TEXT.retry}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!picked ? <Text style={styles.hint}>{TEXT.needImage}</Text> : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.step}>1. 이미지</Text>
        {!picked ? (
          <View style={styles.choiceRow}>
            {canUseCamera() ? (
              <Choice label="사진 찍기" onPress={() => choosePhoto("camera")} />
            ) : null}
            <Choice label="앨범에서 고르기" onPress={() => choosePhoto("library")} />
            <Choice label="책 표지" onPress={() => setFinder("cover")} />
            <Choice label="단색 배경" onPress={() => setPicked({ kind: "color", token: COLOR_TOKENS[0] })} />
          </View>
        ) : (
          <View>
            <PostImage
              testID="compose-preview"
              kind={effectiveKind ?? "color"}
              imageUrl={picked.kind === "photo" ? picked.uri : picked.kind === "cover" ? book?.cover_url ?? null : null}
              color={coverMissing ? "fill3" : picked.kind === "color" ? picked.token : null}
              text={previewText}
              pos={pos}
            />
            {coverMissing ? (
              <Text style={styles.sub}>
                {TEXT.noCover}
                <Text accessibilityRole="link" style={styles.link} onPress={() => setPicked(null)}>
                  {TEXT.switchImage}
                </Text>
              </Text>
            ) : null}
            {picked.kind === "color" ? (
              <View style={styles.choiceRow}>
                {COLOR_TOKENS.map((token) => (
                  <Pressable
                    key={token}
                    accessibilityRole="button"
                    accessibilityLabel={`색 ${token}`}
                    accessibilityState={{ selected: picked.token === token }}
                    onPress={() => setPicked({ kind: "color", token })}
                    style={[
                      styles.swatch,
                      { backgroundColor: C[token] },
                      picked.token === token && styles.swatchOn,
                    ]}
                  />
                ))}
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setPicked(null)} style={styles.secondary}>
              <Text style={styles.link}>이미지 바꾸기</Text>
            </Pressable>
          </View>
        )}
        {notice ? <Text style={styles.sub}>{notice}</Text> : null}

        <Text style={styles.step}>2. 글자</Text>
        <TextInput
          accessibilityLabel="이미지 위 글자"
          placeholder="글자를 넣어 보세요"
          placeholderTextColor={C.textSub}
          value={overlay}
          onChangeText={setOverlay}
          maxLength={OVERLAY_MAX}
          style={styles.input}
        />
        {effectiveKind === "photo" || effectiveKind === "cover" ? (
          <View style={styles.choiceRow} accessibilityRole="radiogroup">
            {(["top", "mid", "bot"] as const).map((p) => (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ checked: pos === p }}
                onPress={() => setPos(p)}
                style={[styles.pill, pos === p && styles.pillOn]}
              >
                <Text style={styles.pillText}>{POS_LABEL[p]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.step}>3. 감상</Text>
        {bodyOpen ? (
          <TextInput
            accessibilityLabel="감상"
            placeholder="감상(선택)"
            placeholderTextColor={C.textSub}
            value={body}
            onChangeText={setBody}
            maxLength={BODY_MAX}
            multiline
            autoFocus
            style={[styles.input, styles.bodyInput]}
          />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setBodyOpen(true)} style={styles.secondary}>
            <Text style={styles.link}>{TEXT.openBody}</Text>
          </Pressable>
        )}

        <Text style={styles.step}>4. 책·도서관</Text>
        <Text style={styles.sub}>{libraryLabel}</Text>
        {book ? (
          <View style={styles.bookAttached}>
            <Text style={styles.bookTitle} testID="attached-book">
              📖 {book.title}
              {book.author ? ` · ${book.author}` : ""}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setFinder(picked?.kind === "cover" ? "cover" : "attach")}>
              <Text style={styles.link}>바꾸기</Text>
            </Pressable>
            {picked?.kind !== "cover" ? (
              <Pressable accessibilityRole="button" onPress={() => setBook(null)}>
                <Text style={styles.link}>빼기</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setFinder("attach")} style={styles.secondary}>
            <Text style={styles.link}>책 붙이기</Text>
          </Pressable>
        )}
      </ScrollView>

      {confirmClose ? (
        <Dialog
          title={TEXT.discardTitle}
          cancel={TEXT.keepWriting}
          confirm={TEXT.discard}
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            leave();
          }}
          danger
        />
      ) : null}
      <Toast text={toast} />
    </View>
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.choice}>
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  headerSide: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  headerX: { fontSize: 22, color: C.text },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  submit: {
    backgroundColor: C.inkStrong,
    borderRadius: theme.radii.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  submitOff: { opacity: 0.35 },
  submitText: { color: onFill(C.inkStrong), fontWeight: "700" },
  hint: { textAlign: "right", paddingHorizontal: 16, paddingTop: 6, fontSize: 12, color: C.textSub },
  banner: {
    margin: 12,
    padding: 12,
    gap: 8,
    borderRadius: theme.radii.inner,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.loanOut,
  },
  bannerText: { color: C.text, fontSize: 14 },
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  step: { fontSize: 13, fontWeight: "700", color: C.textSub, marginTop: 8 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    backgroundColor: C.paper,
    borderRadius: theme.radii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choiceText: { color: C.text, fontSize: 14, fontWeight: "600" },
  image: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 4 / 5,
    alignSelf: "center",
    borderRadius: theme.radii.card,
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    left: 16,
    right: 16,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
  },
  overlayShadow: {
    textShadowColor: C.shadowSoft,
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  swatch: { width: 36, height: 36, borderRadius: theme.radii.control, borderWidth: 1, borderColor: C.divider },
  swatchOn: { borderWidth: 3, borderColor: C.inkStrong },
  input: {
    backgroundColor: C.paper,
    borderRadius: theme.radii.inner,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
  },
  bodyInput: { minHeight: 120, textAlignVertical: "top" },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: C.paper,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillOn: { backgroundColor: C.fill1 },
  pillText: { color: C.text, fontWeight: "600" },
  secondary: { paddingVertical: 8 },
  link: { color: C.inkStrong, fontWeight: "700", textDecorationLine: "underline" },
  sub: { color: C.textSub, fontSize: 13, marginTop: 4 },
  bookAttached: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  bookTitle: { color: C.text, fontSize: 15, fontWeight: "600" },
  finder: { flex: 1, padding: 12, gap: 10 },
  bookRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  scrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.shadowFloat,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 10,
  },
  dialog: { width: "100%", maxWidth: 360, backgroundColor: C.paper, borderRadius: theme.radii.card, padding: 20, gap: 12 },
  dialogTitle: { fontSize: 16, fontWeight: "600", color: C.text, lineHeight: 22 },
  dialogRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  dialogButton: { paddingHorizontal: 12, paddingVertical: 8 },
  dialogCancel: { color: C.textSub, fontWeight: "600" },
  dialogConfirm: { color: C.inkStrong, fontWeight: "700" },
  errorText: { color: C.loanOut, fontSize: 13 },
  moreButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 22, color: C.text },
  menu: {
    position: "absolute",
    right: 0,
    top: 44,
    minWidth: 160,
    backgroundColor: C.paper,
    borderRadius: theme.radii.inner,
    paddingVertical: 4,
    zIndex: 5,
    shadowColor: C.shadowFloat,
    shadowRadius: 8,
    shadowOpacity: 1,
    elevation: 4,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 12 },
  menuDanger: { color: C.loanOut, fontWeight: "700" },
  menuEmpty: { paddingHorizontal: 14, paddingVertical: 12, color: C.textSub },
  sheetBackdrop: { justifyContent: "flex-end", backgroundColor: C.shadowSoft },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  primary: {
    backgroundColor: C.inkStrong,
    borderRadius: theme.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: onFill(C.inkStrong), fontWeight: "700" },
  toast: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    backgroundColor: C.inkStrong,
    borderRadius: theme.radii.control,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  toastText: { color: onFill(C.inkStrong), fontWeight: "600" },
});
