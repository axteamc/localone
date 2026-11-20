// LOCAL-1-P2 글쓰기·올리기·내리기 (contracts/local-feed.md LOCAL-1 F13~F17, specs/local-feed/세부/LOCAL-1.md)
import * as Crypto from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useAuth } from "../../auth/AuthProvider";
import { fetchBook, fetchLibrary, searchBooks, type Book } from "../../lib/publicApi";
import { ON_FILL_LIGHT } from "../../theme/tokens";
import { actionColors, cardSurface, onFill, panel, resolvePostColor, theme, type as T } from "../../theme";
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
  const bg = kind === "color" ? resolvePostColor(color, C) : C.surface3;
  const onColor = kind === "color" && color ? onFill(bg) : ON_FILL_LIGHT;
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
          <Pressable
            accessibilityRole="button"
            onPress={props.onCancel}
            style={({ pressed }) => [styles.dialogCancelBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.dialogCancel}>{props.cancel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={props.onConfirm}
            style={({ pressed }) => [styles.dialogConfirmBtn, pressed && ACT.primaryPressed]}
          >
            <Text style={props.danger ? styles.dialogDangerText : styles.dialogConfirm}>{props.confirm}</Text>
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
  const [focused, setFocused] = useState(false);
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
      <View style={styles.finderHead}>
        <View>
          <Text style={T.gauge}>BOOK SEARCH</Text>
          <Text style={T.title}>책 찾기</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.headerSide}>
          <Text style={styles.link}>{TEXT.close}</Text>
        </Pressable>
      </View>
      <View style={styles.finderBar}>
        <TextInput
          accessibilityLabel="책 제목이나 저자"
          placeholder="책 제목이나 저자"
          placeholderTextColor={C.inkMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={run}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          autoFocus
          style={[styles.input, styles.finderInput, focused && styles.inputFocus]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={run}
          style={({ pressed }) => [styles.smallSecondary, pressed && ACT.secondaryPressed]}
        >
          <Text style={styles.smallSecondaryText}>찾기</Text>
        </Pressable>
      </View>
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
  const navigation = useNavigation();
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
  const [attachOpen, setAttachOpen] = useState(false);
  const [overlayFocused, setOverlayFocused] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
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
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const overlayY = useRef(0);
  const bodyY = useRef(0);
  const focusedField = useRef<"overlay" | "body" | null>(null);
  const submitRef = useRef<() => Promise<void>>(async () => {});

  const scrollToFocused = useCallback((field: "overlay" | "body") => {
    const y = field === "overlay" ? overlayY.current : bodyY.current;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }, 120);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e?.endCoordinates?.height ?? 320);
      if (focusedField.current) scrollToFocused(focusedField.current);
    });
    const subHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [scrollToFocused]);

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const nav = navigation as unknown as { setOptions?: (opts: Record<string, unknown>) => void };
    nav?.setOptions?.({
      headerBackVisible: false,
      headerLeft: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={() => onCloseRef.current()}
          style={styles.headerClose}
        >
          <Text style={styles.headerX}>✕</Text>
        </Pressable>
      ),
      headerRight:
        keyboardVisible && !posted
          ? () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={submitting ? TEXT.submitting : TEXT.submit}
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={() => void submitRef.current()}
                style={({ pressed }) => [
                  styles.headerSubmit,
                  !canSubmit && styles.headerSubmitOff,
                  canSubmit && pressed && styles.headerSubmitPressed,
                ]}
              >
                <Text style={styles.headerSubmitText}>
                  {submitting ? TEXT.submitting : TEXT.submit}
                </Text>
              </Pressable>
            )
          : undefined,
    });
  }, [navigation, keyboardVisible, canSubmit, submitting, posted]);

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
  submitRef.current = submit;

  if (invalidLibraryId) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={T.title}>{TEXT.notFound}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={leave}
          style={({ pressed }) => [styles.smallSecondary, pressed && ACT.secondaryPressed]}
        >
          <Text style={styles.smallSecondaryText}>{TEXT.goBack}</Text>
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
          <Text style={T.title}>{TEXT.loginNeeded}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/login")}
            style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
          >
            <Text style={styles.primaryText}>{TEXT.login}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={leave}
            style={({ pressed }) => [styles.secondaryBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryBtnText}>{TEXT.close}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const discardDialog = confirmClose ? (
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
  ) : null;

  if (finder) {
    return (
      <View style={styles.screen}>
        <BookFinder onPick={pickBook} onClose={() => setFinder(null)} />
        {discardDialog}
      </View>
    );
  }

  const libraryLabel = `${libraryName ?? "이 도서관"} 피드에 올라가요`;

  if (posted) {
    return (
      <View style={styles.screen}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <View style={styles.postedHead}>
            <View style={styles.pageHead}>
              <Text style={T.gauge}>POSTED</Text>
              <Text style={T.pageTitle}>내 게시물</Text>
            </View>
            {!withdrawnDone ? (
              <PostMoreMenu
                post={posted}
                onWithdrawn={() => {
                  setWithdrawnDone(true);
                  showToast(TEXT.withdrawn);
                }}
              />
            ) : null}
          </View>
          {!withdrawnDone ? (
            <View testID="posted-card" style={styles.postedCardWrap}>
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
            style={({ pressed }) => [styles.secondaryBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.secondaryBtnText}>피드 보기</Text>
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
      {error ? (
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerText}>{error.message}</Text>
          {error.retryable ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void submit()}
              disabled={submitting}
              style={({ pressed }) => [styles.smallSecondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.smallSecondaryText}>{TEXT.retry}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.body, keyboardHeight > 0 && { paddingBottom: keyboardHeight + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHead}>
          <Text style={T.gauge}>{`NEW POST · ${libraryName ?? "이 도서관"}`}</Text>
          <Text style={T.pageTitle}>새 게시물</Text>
        </View>

        {!picked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이미지 고르기"
            testID="image-slot-button"
            onPress={() => setAttachOpen(true)}
            style={styles.slotFrame}
          >
            <View style={styles.slotPlus}>
              <Text style={styles.slotPlusText}>+</Text>
            </View>
            <Text style={T.gauge}>01 · IMAGE SLOT</Text>
            <Text style={styles.slotSub}>눌러서 이미지 고르기</Text>
          </Pressable>
        ) : (
          <View style={styles.previewWrap}>
            <Pressable accessibilityRole="button" accessibilityLabel="이미지 바꾸기" onPress={() => setAttachOpen(true)}>
              <PostImage
                testID="compose-preview"
                kind={effectiveKind ?? "color"}
                imageUrl={picked.kind === "photo" ? picked.uri : picked.kind === "cover" ? book?.cover_url ?? null : null}
                color={coverMissing ? "fill3" : picked.kind === "color" ? picked.token : null}
                text={previewText}
                pos={pos}
              />
            </Pressable>
            {coverMissing ? (
              <Text style={styles.sub}>
                {TEXT.noCover}
                <Text accessibilityRole="link" style={styles.link} onPress={() => setAttachOpen(true)}>
                  {TEXT.switchImage}
                </Text>
              </Text>
            ) : null}
            <View style={styles.previewMeta}>
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
                        { backgroundColor: resolvePostColor(token, C) },
                        picked.token === token && styles.swatchOn,
                      ]}
                    />
                  ))}
                </View>
              ) : (
                <View />
              )}
              <Pressable accessibilityRole="button" onPress={() => setAttachOpen(true)} style={styles.textLinkWrap}>
                <Text style={styles.link}>이미지 바꾸기</Text>
              </Pressable>
            </View>
          </View>
        )}
        {notice ? <Text style={styles.sub}>{notice}</Text> : null}

        <View style={styles.stepLine}>
          <Text style={T.gauge}>02 · OVERLAY TEXT</Text>
          <Text style={T.gauge}>MAX 80</Text>
        </View>
        <TextInput
          accessibilityLabel="이미지 위 글자"
          placeholder="글자를 넣어 보세요"
          placeholderTextColor={C.inkMuted}
          value={overlay}
          onChangeText={setOverlay}
          onLayout={(e) => {
            overlayY.current = e.nativeEvent.layout.y;
          }}
          onFocus={() => {
            focusedField.current = "overlay";
            setOverlayFocused(true);
            scrollToFocused("overlay");
          }}
          onBlur={() => {
            if (focusedField.current === "overlay") focusedField.current = null;
            setOverlayFocused(false);
          }}
          maxLength={OVERLAY_MAX}
          autoCorrect={false}
          spellCheck={false}
          style={[styles.input, overlayFocused && styles.inputFocus]}
        />
        {effectiveKind === "photo" || effectiveKind === "cover" ? (
          <View style={styles.choiceRow} accessibilityRole="radiogroup">
            {(["top", "mid", "bot"] as const).map((p) => {
              const active = pos === p;
              return (
                <Pressable
                  key={p}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setPos(p)}
                  style={({ pressed }) => [styles.pill, active && styles.pillOn, pressed && ACT.secondaryPressed]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextOn]}>{POS_LABEL[p]}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.stepLine}>
          <Text style={T.gauge}>03 · BODY</Text>
          {!bodyOpen ? (
            <Pressable accessibilityRole="button" onPress={() => setBodyOpen(true)} style={styles.textLinkWrap}>
              <Text style={styles.link}>{TEXT.openBody}</Text>
            </Pressable>
          ) : null}
        </View>
        {bodyOpen ? (
          <TextInput
            accessibilityLabel="감상"
            placeholder="감상(선택)"
            placeholderTextColor={C.inkMuted}
            value={body}
            onChangeText={setBody}
            onLayout={(e) => {
              bodyY.current = e.nativeEvent.layout.y;
            }}
            onFocus={() => {
              focusedField.current = "body";
              setBodyFocused(true);
              scrollToFocused("body");
            }}
            onBlur={() => {
              if (focusedField.current === "body") focusedField.current = null;
              setBodyFocused(false);
            }}
            maxLength={BODY_MAX}
            multiline
            autoFocus
            autoCorrect={false}
            spellCheck={false}
            style={[styles.input, styles.bodyInput, bodyFocused && styles.inputFocus]}
          />
        ) : null}

        <View style={styles.stepLine}>
          <Text style={T.gauge}>04 · BOOK &amp; LIBRARY</Text>
          {!book ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFinder("attach")}
              style={({ pressed }) => [styles.smallSecondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.smallSecondaryText}>책 붙이기</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.sub}>{libraryLabel}</Text>
        {book ? (
          <View style={styles.bookAttached}>
            <Text style={styles.bookTitle} testID="attached-book">
              📖 {book.title}
              {book.author ? ` · ${book.author}` : ""}
            </Text>
            <View style={styles.bookActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFinder(picked?.kind === "cover" ? "cover" : "attach")}
                style={styles.textLinkWrap}
              >
                <Text style={styles.link}>바꾸기</Text>
              </Pressable>
              {picked?.kind !== "cover" ? (
                <Pressable accessibilityRole="button" onPress={() => setBook(null)} style={styles.textLinkWrap}>
                  <Text style={styles.link}>빼기</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {!keyboardVisible ? (
        <View style={styles.dock}>
          {!picked ? <Text style={[T.gauge, styles.dockHint]}>{TEXT.needImage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitOff,
              canSubmit && pressed && ACT.primaryPressed,
            ]}
          >
            <Text style={styles.submitText}>{submitting ? TEXT.submitting : TEXT.submit}</Text>
          </Pressable>
        </View>
      ) : null}

      {attachOpen ? (
        <View style={styles.attachOverlay} testID="attach-overlay">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="첨부 창 닫기"
            style={StyleSheet.absoluteFill}
            onPress={() => setAttachOpen(false)}
          />
          <View style={styles.attachPop} testID="attach-menu">
            {canUseCamera() ? (
              <AttachItem
                icon="camera"
                label="사진 찍기"
                first
                onPress={() => {
                  setAttachOpen(false);
                  void choosePhoto("camera");
                }}
              />
            ) : null}
            <AttachItem
              icon="library"
              label="앨범에서 고르기"
              first={!canUseCamera()}
              onPress={() => {
                setAttachOpen(false);
                void choosePhoto("library");
              }}
            />
            <AttachItem
              icon="book"
              label="책 표지"
              onPress={() => {
                setAttachOpen(false);
                setFinder("cover");
              }}
            />
            <AttachItem
              icon="color"
              label="단색 배경"
              onPress={() => {
                setAttachOpen(false);
                setPicked({ kind: "color", token: COLOR_TOKENS[0] });
              }}
            />
          </View>
        </View>
      ) : null}

      {discardDialog}
      <Toast text={toast} />
    </View>
  );
}

type AttachIcon = "camera" | "library" | "book" | "color";

function AttachGlyph({ kind }: { kind: AttachIcon }) {
  const common = { stroke: C.inkStrong, fill: "none", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "camera") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" {...common} />
        <Circle cx="12" cy="13" r="3.5" {...common} />
      </Svg>
    );
  }
  if (kind === "library") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Rect x="3" y="4" width="18" height="16" rx="2" {...common} />
        <Circle cx="8.5" cy="9.5" r="1.5" {...common} />
        <Path d="M21 15l-5-5L5 20" {...common} />
      </Svg>
    );
  }
  if (kind === "book") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" {...common} />
        <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" {...common} />
      </Svg>
    );
  }
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Rect x="4" y="4" width="16" height="16" rx="4" {...common} />
      <Path d="M9 12h6" {...common} />
    </Svg>
  );
}

function AttachItem({
  icon,
  label,
  first = false,
  onPress,
}: {
  icon: AttachIcon;
  label: string;
  first?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.attachItem, first && styles.attachItemFirst, pressed && ACT.secondaryPressed]}
    >
      <AttachGlyph kind={icon} />
      <Text style={styles.attachLabel}>{label}</Text>
    </Pressable>
  );
}

const NO_LEDGE = "0 0 0 0 transparent";
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: panel.backgroundColor },
  scroll: { flex: 1, minHeight: 0 },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  headerClose: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  headerSubmit: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSubmitOff: { opacity: 0.4 },
  headerSubmitPressed: { opacity: 0.6 },
  headerSubmitText: { color: C.inkStrong, fontSize: 15, fontWeight: "600" },
  headerSide: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "flex-end" },
  headerX: { fontSize: 18, fontWeight: "400", color: C.inkStrong },
  pageHead: { gap: 2 },
  postedHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 3 },
  postedCardWrap: { gap: 6 },
  banner: {
    ...cardSurface(theme, { onPanel: true }),
    margin: 12,
    padding: 12,
    gap: 8,
    borderColor: C.loanOut,
  },
  bannerText: { color: C.text, fontSize: 14 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  slotFrame: {
    width: "100%",
    maxWidth: 260,
    aspectRatio: 4 / 5,
    alignSelf: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.seamHairline,
    borderRadius: theme.radii.card,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 6,
  },
  slotPlus: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    borderColor: C.seamHairline,
    backgroundColor: C.panelLit,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  slotPlusText: { fontSize: 20, fontWeight: "400", color: C.inkStrong, lineHeight: 22 },
  slotSub: { fontSize: 13, color: C.inkMuted },
  previewWrap: { gap: 8 },
  previewMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  attachOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 12,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 120,
    paddingHorizontal: 24,
  },
  attachPop: {
    ...cardSurface(theme, { onPanel: true }),
    width: "100%",
    maxWidth: 280,
    paddingVertical: 4,
  },
  attachItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.seamHairline,
  },
  attachItemFirst: { borderTopWidth: 0 },
  attachLabel: { fontSize: 14, fontWeight: "500", color: C.text },
  stepLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.seamHairline,
    paddingTop: 10,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, gap: 8 },
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
    fontWeight: "500",
  },
  overlayShadow: {
    textShadowColor: C.shadowSoft,
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  swatch: { width: 32, height: 32, borderRadius: theme.radii.control, borderWidth: 1, borderColor: C.seamHairline },
  swatchOn: { borderWidth: 2.5, borderColor: C.inkStrong },
  input: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },
  inputFocus: {
    borderColor: C.inkStrong,
    borderWidth: 1.5,
  },
  bodyInput: { minHeight: 112, textAlignVertical: "top" },
  pill: {
    ...ACT.secondary,
    alignSelf: "flex-start",
    borderRadius: theme.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillOn: { backgroundColor: C.panelLit, borderColor: C.inkStrong },
  pillText: { color: C.inkMuted, fontSize: 13, fontWeight: "500" },
  pillTextOn: { color: C.inkStrong },
  smallSecondary: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    minHeight: 34,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  smallSecondaryText: { ...ACT.secondaryText, fontSize: 13, fontWeight: "500" },
  textLinkWrap: { minHeight: 32, justifyContent: "center", paddingHorizontal: 2 },
  link: { color: C.inkStrong, fontSize: 13, fontWeight: "500" },
  sub: { color: C.inkMuted, fontSize: 13 },
  bookAttached: {
    ...cardSurface(theme, { onPanel: true }),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    flexWrap: "wrap",
  },
  bookActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  bookTitle: { color: C.text, fontSize: 14, fontWeight: "500", flexShrink: 1 },
  finder: { flex: 1, padding: 16, gap: 12 },
  finderHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  finderBar: { flexDirection: "row", alignItems: "center", gap: 8 },
  finderInput: { flex: 1 },
  bookRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.seamHairline, gap: 2 },
  dock: {
    flexShrink: 0,
    backgroundColor: C.panelLit,
    borderTopWidth: 1,
    borderTopColor: C.seamHairline,
    borderTopLeftRadius: theme.radii.block,
    borderTopRightRadius: theme.radii.block,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 6,
  },
  dockHint: { textAlign: "center" },
  submit: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  submitOff: { opacity: 0.4, boxShadow: NO_LEDGE },
  submitText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  scrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.shadowDeep,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 20,
  },
  dialog: {
    ...cardSurface(theme, { onPanel: true }),
    width: "100%",
    maxWidth: 360,
    padding: 18,
    gap: 14,
  },
  dialogTitle: { ...T.name, lineHeight: 21 },
  dialogRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  dialogCancelBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    minHeight: 38,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogConfirmBtn: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    minHeight: 38,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogCancel: { ...ACT.secondaryText, fontSize: 13, fontWeight: "500" },
  dialogConfirm: { ...ACT.primaryText, fontSize: 13, fontWeight: "500" },
  dialogDangerText: { color: C.loanOut, fontSize: 13, fontWeight: "500" },
  errorText: { color: C.loanOut, fontSize: 13 },
  moreButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 22, color: C.inkStrong },
  menu: {
    ...cardSurface(theme, { onPanel: true }),
    position: "absolute",
    right: 0,
    top: 44,
    minWidth: 160,
    paddingVertical: 4,
    zIndex: 5,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 12 },
  menuDanger: { color: C.loanOut, fontWeight: "500" },
  menuEmpty: { paddingHorizontal: 14, paddingVertical: 12, color: C.inkMuted },
  sheetBackdrop: { justifyContent: "flex-end", backgroundColor: C.shadowDeep },
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
  primary: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  secondaryBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  toast: {
    ...cardSurface(theme, { onPanel: true }),
    position: "absolute",
    bottom: 84,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 25,
  },
  toastText: { color: C.inkStrong, fontSize: 14, fontWeight: "500" },
});
