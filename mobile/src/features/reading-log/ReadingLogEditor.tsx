// READ-1-P2 기록 쓰기·수정 화면 (reading-log.md READ-1 R1-O2·R1-O3·R1-O6·R1-O7, specs/reading-log/세부/READ-1.md 결정 1·2)
// 한 화면에 다 같이: 책 칸 → 감상 → 좋았던 문장 → 읽은 날 → 도서관 → 대출 연결. 아무 칸부터 채워도 된다.
// 대출 연결은 사용자가 "연결하기"를 누를 때만(R1-4). 도서관 없는 기록은 그대로 null(R1-3).
import * as Crypto from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { searchBooks, searchLibrariesByName, type Book, type LibrarySummary } from "../../lib/publicApi";
import { actionColors, cardSurface, panel, theme, type as T } from "../../theme";
import { addDays, parseYmd } from "../loan-assistant/DueDateSheet";
import { listLoans, type Loan } from "../loan-assistant/api";
import {
  ApiCallError,
  NOTE_MAX,
  QUOTE_MAX,
  createReadingLog,
  seoulToday,
  shelfStore,
  updateReadingLog,
  type ReadingLog,
  type ReadingLogInput,
} from "./api";
import { ModalFrame } from "../../theme/WebFrame";
import { BackChevron, CloseMark, HeaderTitle } from "../../theme/ScreenHeader";

export const TEXT = {
  newTitle: "기록 쓰기",
  editTitle: "기록 수정",
  save: "저장",
  saving: "저장 중…",
  close: "닫기",
  pickBook: "＋ 책 고르기 (꼭 골라야 해요)",
  bookLocked: "책은 바꿀 수 없어요",
  needBook: "책을 골라야 저장할 수 있어요",
  saved: "저장했어요",
  notePlaceholder: "감상 (비워도 돼요)",
  quotePlaceholder: "좋았던 문장",
  noteTooLong: "감상은 2000자까지 쓸 수 있어요",
  quoteTooLong: "좋았던 문장은 300자까지 쓸 수 있어요",
  readOn: "읽은 날",
  library: "도서관",
  loan: "대출 연결",
  notChosen: "고르지 않음",
  noLibrary: "도서관 없이 (집·카페)",
  noLoan: "연결 안 함",
  linkedLoan: "연결됨",
  bookSearchTitle: "어떤 책을 읽었어요?",
  bookSearchPlaceholder: "책 이름이나 저자",
  bookSearchEmpty: "찾는 책이 없어요. 다른 말로 찾아보세요.",
  bookSearchFailed: "책을 찾지 못했어요. 다시 해 주세요.",
  dateSheetTitle: "언제 다 읽었어요?",
  dateInvalid: "날짜를 2026-11-19처럼 써 주세요.",
  dateFuture: "앞으로 올 날짜는 고를 수 없어요.",
  pick: "고르기",
  librarySheetTitle: "어디서 읽었어요?",
  librarySearchPlaceholder: "도서관 이름으로 찾기",
  librariesFromLoans: "내가 빌린 도서관",
  librarySearchFailed: "도서관을 찾지 못했어요. 다시 해 주세요.",
  loanSheetTitle: "어떤 대출과 연결할까요?",
  loansEmpty: "연결할 대출이 없어요.",
  loansFailed: "대출 목록을 불러오지 못했어요.",
  loanAskBody: "이 대출과 연결할까요? 도서관도 같이 채워요.",
  loanLink: "연결하기",
  loanNo: "아니요",
  loanMissing: "연결한 대출을 찾을 수 없어요. 다시 골라 주세요.",
  bookUnavailable: "책 정보를 가져오지 못했어요. 잠시 뒤 다시 저장해 주세요.",
  saveFailedTitle: "저장하지 못했어요",
  saveFailedBody: "인터넷 연결을 확인해 주세요. 쓴 내용은 그대로 있어요.",
  retry: "다시 저장하기",
  discardTitle: "쓰던 기록을 버릴까요?",
  keepWriting: "계속 쓰기",
  discard: "버리기",
  loginNeeded: "로그인하면 나만 보는 독서 기록을 남길 수 있어요.",
  login: "로그인하기",
} as const;

const TOAST_MS = 2200;
const LOAN_PAGE = 100;

/** "11월 3일" */
export function monthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일`;
}

export const loanAskTitle = (loan: Loan) =>
  `${loan.library?.name ?? "도서관"}에서 ${monthDay(loan.loaned_on)}에 빌린 책이에요`;

type BookLite = ReadingLog["book"];
type LibraryLite = { id: number; name: string };

type Form = {
  book: BookLite | null;
  note: string;
  quote: string;
  readOn: string;
  library: LibraryLite | null;
  loanId: string | null;
};

type FieldErrors = Partial<Record<"book" | "note" | "quote" | "readOn" | "library" | "loan", string>>;

function formFromLog(log: ReadingLog): Form {
  return {
    book: log.book,
    note: log.note ?? "",
    quote: log.quote ?? "",
    readOn: log.read_on ?? "",
    library: log.library,
    loanId: log.loan_id,
  };
}

const emptyToNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** 같은 책 대출이 위, 그다음 빌린 날 최근 순(R1-O6 ①) */
export function sortLoansForBook(loans: Loan[], isbn13: string | null): Loan[] {
  return [...loans].sort((a, b) => {
    const sa = a.book.isbn13 === isbn13 ? 0 : 1;
    const sb = b.book.isbn13 === isbn13 ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return b.loaned_on.localeCompare(a.loaned_on);
  });
}

async function loadMyLoans(): Promise<Loan[]> {
  // #19 대출 중 + 반납한 대출 모두(R1-O6)
  const [onLoan, returned] = await Promise.all([
    listLoans("on_loan", { cursor: null, limit: LOAN_PAGE }),
    listLoans("returned", { cursor: null, limit: LOAN_PAGE }),
  ]);
  return [...onLoan.items, ...returned.items];
}

type Props =
  | { mode: "new" }
  | { mode: "edit"; log: ReadingLog; onDone: (log: ReadingLog) => void; onCancel: () => void };

export function ReadingLogEditor(props: Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { status, userId } = useAuth();
  const editing = props.mode === "edit";
  const original = useRef<Form>(
    props.mode === "edit"
      ? formFromLog(props.log)
      : { book: null, note: "", quote: "", readOn: seoulToday(), library: null, loanId: null }
  ).current;

  const [form, setForm] = useState<Form>(original);
  const formRef = useRef(form);
  formRef.current = form;
  const requestId = useRef<string>(Crypto.randomUUID()); // 화면을 열 때 한 번. 다시 저장도 같은 id (C6 끊김·연타)
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [askLoan, setAskLoan] = useState<Loan | null>(null);
  const askedFor = useRef<string | null>(null);
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [sheet, setSheet] = useState<"date" | "library" | "loan" | null>(null);
  const [findingBook, setFindingBook] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const leaving = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const isDirty = (f: Form) =>
    f.book?.isbn13 !== original.book?.isbn13 ||
    f.note !== original.note ||
    f.quote !== original.quote ||
    f.readOn !== original.readOn ||
    (f.library?.id ?? null) !== (original.library?.id ?? null) ||
    f.loanId !== original.loanId;

  const leave = useCallback(() => {
    leaving.current = true;
    if (props.mode === "edit") props.onCancel();
    else if (router.canGoBack?.()) router.back();
    else router.replace("/reading");
  }, [props, router]);

  // R1-O7: 바뀐 칸이 있으면 묻고, 없으면 바로 닫는다
  const onClose = () => (isDirty(formRef.current) ? setConfirmDiscard(true) : leave());

  useLayoutEffect(() => {
    const nav = navigation as unknown as { setOptions?: (o: Record<string, unknown>) => void } | undefined;
    if (!editing) nav?.setOptions?.({ headerShown: false });
  }, [navigation, editing]);

  // 기기 뒤로 가기(Android 버튼·웹 뒤로)도 R1-O7을 따른다
  useEffect(() => {
    const nav = navigation as unknown as
      | { addListener?: (e: string, cb: (ev: { preventDefault: () => void }) => void) => () => void }
      | undefined;
    const off = nav?.addListener?.("beforeRemove", (ev) => {
      if (leaving.current || !isDirty(formRef.current)) return;
      ev.preventDefault();
      setConfirmDiscard(true);
    });
    return () => off?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const ensureLoans = useCallback(async (): Promise<Loan[] | null> => {
    if (loans !== null) return loans;
    try {
      const all = await loadMyLoans();
      setLoans(all);
      return all;
    } catch {
      return null; // 대출을 못 불러와도 쓰기는 막지 않는다
    }
  }, [loans]);

  useEffect(() => {
    if (editing && original.loanId) void ensureLoans(); // 연결된 대출 이름을 보여 주려고
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const clearError = (key: keyof FieldErrors) => setErrors((e) => ({ ...e, [key]: undefined }));

  async function onPickBook(book: Book) {
    const picked: BookLite = { isbn13: book.isbn13, title: book.title, author: book.author, cover_url: book.cover_url };
    setFindingBook(false);
    set({ book: picked });
    clearError("book");
    setAskLoan(null);
    if (askedFor.current === book.isbn13) return; // "아니요" 뒤 같은 책이면 다시 묻지 않음
    askedFor.current = null;
    const all = await ensureLoans();
    if (!all || formRef.current.book?.isbn13 !== book.isbn13) return; // 그사이 다른 책을 골랐다
    const same = all
      .filter((l) => l.book.isbn13 === book.isbn13)
      .sort((a, b) => b.loaned_on.localeCompare(a.loaned_on))[0];
    if (same) setAskLoan(same); // 카드만 띄움. 연결하지 않는다 (R1-4)
  }

  function onConfirmLoan(l: Loan) {
    setForm((f) => ({ ...f, loanId: l.id, library: l.library ?? f.library }));
    clearError("loan");
    setAskLoan(null);
  }

  function onDeclineLoan() {
    askedFor.current = formRef.current.book?.isbn13 ?? null;
    setAskLoan(null);
  }

  function localErrors(f: Form): FieldErrors {
    const e: FieldErrors = {};
    if (f.note.trim().length > NOTE_MAX) e.note = TEXT.noteTooLong;
    if (f.quote.trim().length > QUOTE_MAX) e.quote = TEXT.quoteTooLong;
    return e;
  }

  function serverErrors(err: unknown): FieldErrors | null {
    if (!(err instanceof ApiCallError)) return null;
    if (err.status === 422 && err.detail === "note") return { note: TEXT.noteTooLong };
    if (err.status === 422 && err.detail === "quote") return { quote: TEXT.quoteTooLong };
    if (err.status === 422 && err.detail === "read_on") return { readOn: TEXT.dateFuture };
    if (err.status === 422 && err.detail === "library_id") return { library: TEXT.librarySearchFailed };
    if (err.status === 404 && err.detail === "loan_id") return { loan: TEXT.loanMissing };
    if (err.status === 422 && err.detail === "isbn13") return { book: TEXT.bookUnavailable };
    if (err.code === "PROVIDER_UNAVAILABLE" || err.code === "PROVIDER_LIMIT") return { book: TEXT.bookUnavailable };
    return null;
  }

  async function onSave() {
    const f = formRef.current;
    if (!f.book) {
      showToast(TEXT.needBook);
      setErrors((e) => ({ ...e, book: TEXT.needBook }));
      return;
    }
    if (saving.current) return; // 진행 중 연타 무시
    const local = localErrors(f);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    saving.current = true;
    setBusy(true);
    setSaveFailed(false);
    try {
      if (props.mode === "edit") {
        const patch: Partial<ReadingLogInput> = {};
        if (f.note !== original.note) patch.note = emptyToNull(f.note);
        if (f.quote !== original.quote) patch.quote = emptyToNull(f.quote);
        if (f.readOn !== original.readOn) patch.readOn = f.readOn || null;
        if ((f.library?.id ?? null) !== (original.library?.id ?? null)) patch.libraryId = f.library?.id ?? null;
        if (f.loanId !== original.loanId) patch.loanId = f.loanId;
        const updated = Object.keys(patch).length ? await updateReadingLog(props.log.id, patch) : props.log;
        if (userId) shelfStore.upsert(userId, updated);
        leaving.current = true;
        props.onDone(updated);
      } else {
        const created = await createReadingLog(
          {
            isbn13: f.book.isbn13,
            libraryId: f.library?.id ?? null,
            readOn: f.readOn || null,
            note: emptyToNull(f.note),
            quote: emptyToNull(f.quote),
            loanId: f.loanId,
          },
          requestId.current
        );
        if (userId) shelfStore.upsert(userId, created, TEXT.saved);
        leave();
      }
    } catch (err) {
      const fields = serverErrors(err);
      if (fields) setErrors(fields);
      else setSaveFailed(true); // 입력값 그대로, "다시 저장하기"
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (status !== "signedIn") {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.centerText}>{TEXT.loginNeeded}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.primaryBtn, pressed && ACT.primaryPressed]}
        >
          <Text style={styles.primaryText}>{TEXT.login}</Text>
        </Pressable>
      </View>
    );
  }

  const linkedLoan = form.loanId ? loans?.find((l) => l.id === form.loanId) ?? null : null;
  const loanLabel = form.loanId
    ? linkedLoan
      ? `${linkedLoan.library?.name ?? "도서관"} · ${monthDay(linkedLoan.loaned_on)}`
      : TEXT.linkedLoan
    : TEXT.notChosen;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={TEXT.close} onPress={onClose} hitSlop={8} style={styles.headerSide}>
          <CloseMark color={C.inkStrong} />
        </Pressable>
        <View style={styles.flex}>
          <HeaderTitle label={editing ? "EDIT RECORD" : "NEW RECORD"} title={editing ? TEXT.editTitle : TEXT.newTitle} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={TEXT.save}
          accessibilityState={{ busy }}
          onPress={() => void onSave()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerSave, pressed && ACT.primaryPressed]}
        >
          <Text style={styles.headerSaveText}>{busy ? TEXT.saving : TEXT.save}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Pressable
          testID="book-field"
          accessibilityRole="button"
          onPress={() => {
            if (editing) setErrors((e) => ({ ...e, book: TEXT.bookLocked }));
            else setFindingBook(true);
          }}
          style={({ pressed }) => [styles.bookField, pressed && !editing && ACT.secondaryPressed]}
        >
          {form.book ? (
            <View style={styles.bookRow}>
              <Cover book={form.book} size={48} />
              <View style={styles.flex}>
                <Text style={styles.bookTitle} numberOfLines={2}>{form.book.title}</Text>
                {form.book.author ? <Text style={styles.sub} numberOfLines={1}>{form.book.author}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={styles.pickBook}>{TEXT.pickBook}</Text>
          )}
        </Pressable>
        {errors.book ? <Text style={styles.fieldError}>{errors.book}</Text> : null}

        {askLoan ? (
          <View testID="loan-ask-card" style={styles.askCard}>
            <Text style={styles.askTitle}>{loanAskTitle(askLoan)}</Text>
            <Text style={styles.sub}>{TEXT.loanAskBody}</Text>
            <View style={styles.dialogRow}>
              <Pressable accessibilityRole="button" onPress={onDeclineLoan} style={({ pressed }) => [styles.secondaryBtn, pressed && ACT.secondaryPressed]}>
                <Text style={styles.secondaryText}>{TEXT.loanNo}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => onConfirmLoan(askLoan)} style={({ pressed }) => [styles.primaryBtnSmall, pressed && ACT.primaryPressed]}>
                <Text style={styles.primaryText}>{TEXT.loanLink}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <TextInput
          testID="note-input"
          value={form.note}
          onChangeText={(note) => {
            set({ note });
            clearError("note");
          }}
          placeholder={TEXT.notePlaceholder}
          placeholderTextColor={C.inkMuted}
          multiline
          style={[styles.input, styles.noteInput]}
          textAlignVertical="top"
        />
        {errors.note ? <Text style={styles.fieldError}>{errors.note}</Text> : null}

        <TextInput
          testID="quote-input"
          value={form.quote}
          onChangeText={(quote) => {
            set({ quote });
            clearError("quote");
          }}
          placeholder={TEXT.quotePlaceholder}
          placeholderTextColor={C.inkMuted}
          multiline
          style={[styles.input, styles.quoteInput]}
          textAlignVertical="top"
        />
        {errors.quote ? <Text style={styles.fieldError}>{errors.quote}</Text> : null}

        <View style={styles.rows}>
          <FieldRow label={TEXT.readOn} value={form.readOn ? monthDay(form.readOn) : TEXT.notChosen} onPress={() => setSheet("date")} />
          {errors.readOn ? <Text style={styles.fieldError}>{errors.readOn}</Text> : null}
          <FieldRow label={TEXT.library} value={form.library?.name ?? TEXT.notChosen} onPress={() => setSheet("library")} />
          {errors.library ? <Text style={styles.fieldError}>{errors.library}</Text> : null}
          <FieldRow label={TEXT.loan} value={loanLabel} onPress={() => { setSheet("loan"); void ensureLoans(); }} last />
          {errors.loan ? <Text style={styles.fieldError}>{errors.loan}</Text> : null}
        </View>

        {saveFailed ? (
          <View testID="save-failed" style={styles.failCard} accessibilityLiveRegion="polite">
            <Text style={styles.askTitle}>{TEXT.saveFailedTitle}</Text>
            <Text style={styles.sub}>{TEXT.saveFailedBody}</Text>
            <Pressable accessibilityRole="button" onPress={() => void onSave()} style={({ pressed }) => [styles.primaryBtnSmall, pressed && ACT.primaryPressed]}>
              <Text style={styles.primaryText}>{TEXT.retry}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {sheet === "date" ? (
        <DateSheet
          value={form.readOn}
          onClose={() => setSheet(null)}
          onPick={(readOn) => {
            set({ readOn });
            clearError("readOn");
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "library" ? (
        <LibrarySheet
          loans={loans}
          onOpen={() => void ensureLoans()}
          onClose={() => setSheet(null)}
          onPick={(library) => {
            set({ library });
            clearError("library");
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "loan" ? (
        <LoanSheet
          loans={loans}
          isbn13={form.book?.isbn13 ?? null}
          selected={form.loanId}
          onRetry={() => void ensureLoans()}
          onClose={() => setSheet(null)}
          onPick={(loan) => {
            if (loan) onConfirmLoan(loan);
            else {
              set({ loanId: null });
              clearError("loan");
            }
            setSheet(null);
          }}
        />
      ) : null}

      {findingBook ? <BookFinder onPick={(b) => void onPickBook(b)} onClose={() => setFindingBook(false)} /> : null}

      {confirmDiscard ? (
        <ConfirmDialog
          title={TEXT.discardTitle}
          cancel={TEXT.keepWriting}
          confirm={TEXT.discard}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            leave();
          }}
          danger
        />
      ) : null}
      <Toast text={toast} />
    </View>
  );
}

// ─────────── 작은 부품 (기록 화면·책장이 같이 쓴다) ───────────

export function Cover({ book, size }: { book: BookLite; size: number }) {
  const width = size;
  const height = Math.round(size * 1.45);
  const [r0, r1, r2, r3] = theme.radii.bookCover;
  const radius = { borderTopLeftRadius: r0, borderTopRightRadius: r1, borderBottomRightRadius: r2, borderBottomLeftRadius: r3 };
  if (book.cover_url) {
    return <Image source={{ uri: book.cover_url }} style={[{ width, height }, radius, styles.coverImg]} accessibilityLabel={book.title} />;
  }
  return (
    <View style={[{ width, height }, radius, styles.coverBlank]}>
      <Text style={styles.coverBlankText} numberOfLines={4}>{book.title}</Text>
    </View>
  );
}

function FieldRow({ label, value, onPress, last }: { label: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && ACT.secondaryPressed]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

export function ConfirmDialog(props: {
  title: string;
  body?: string | null;
  extra?: string | null;
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
        {props.body ? <Text style={styles.sub}>{props.body}</Text> : null}
        {props.extra ? <Text style={styles.sub}>{props.extra}</Text> : null}
        {props.error ? <Text style={styles.fieldError}>{props.error}</Text> : null}
        <View style={styles.dialogRow}>
          <Pressable accessibilityRole="button" onPress={props.onCancel} style={({ pressed }) => [styles.secondaryBtn, pressed && ACT.secondaryPressed]}>
            <Text style={styles.secondaryText}>{props.cancel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={props.onConfirm} style={({ pressed }) => [styles.primaryBtnSmall, pressed && ACT.primaryPressed]}>
            <Text style={[styles.primaryText, props.danger && styles.dangerText]}>{props.confirm}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>{text}</Text>
    </View>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}><ModalFrame>
      <View style={styles.backdrop}>
        <Pressable style={styles.flex} accessibilityLabel={TEXT.close} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHead}>
            <Text accessibilityRole="header" style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetClose}>{TEXT.close}</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </ModalFrame></Modal>
  );
}

const DATE_CHIPS: [string, number][] = [
  ["오늘", 0],
  ["어제", -1],
  ["일주일 전", -7],
];

function DateSheet({ value, onPick, onClose }: { value: string; onPick: (ymd: string) => void; onClose: () => void }) {
  const today = seoulToday();
  const [text, setText] = useState(value || today);
  const [error, setError] = useState<string | null>(null);
  const choose = (raw: string) => {
    const ymd = parseYmd(raw.trim());
    if (!ymd) return setError(TEXT.dateInvalid);
    if (ymd > today) return setError(TEXT.dateFuture); // 미래 날짜는 서버도 422(read_on)
    onPick(ymd);
  };
  return (
    <Sheet title={TEXT.dateSheetTitle} onClose={onClose}>
      <View style={styles.chips}>
        {DATE_CHIPS.map(([label, n]) => (
          <Pressable key={label} accessibilityRole="button" onPress={() => choose(addDays(today, n))} style={({ pressed }) => [styles.chip, pressed && ACT.secondaryPressed]}>
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        testID="date-input"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        placeholder="2026-11-19"
        placeholderTextColor={C.inkMuted}
        style={styles.input}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => choose(text)} style={({ pressed }) => [styles.primaryBtn, pressed && ACT.primaryPressed]}>
        <Text style={styles.primaryText}>{TEXT.pick}</Text>
      </Pressable>
    </Sheet>
  );
}

function LibrarySheet({
  loans,
  onOpen,
  onPick,
  onClose,
}: {
  loans: Loan[] | null;
  onOpen: () => void;
  onPick: (library: LibraryLite | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<LibrarySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const runner = useRef(createLatestRunner()).current;
  useEffect(() => {
    onOpen();
    return () => runner.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromLoans: LibraryLite[] = [];
  for (const l of loans ?? []) {
    if (l.library && !fromLoans.some((x) => x.id === l.library!.id)) fromLoans.push(l.library);
  }

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setFailed(false);
    const result = await runner.run((signal) => searchLibrariesByName(q, signal));
    if (result.status === "stale") return;
    setLoading(false);
    if (result.status === "ok") setFound(result.value.items);
    else setFailed(true);
  };

  return (
    <Sheet title={TEXT.librarySheetTitle} onClose={onClose}>
      <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
        <SheetItem label={TEXT.noLibrary} onPress={() => onPick(null)} />
        {fromLoans.length ? <Text style={styles.sheetSection}>{TEXT.librariesFromLoans}</Text> : null}
        {fromLoans.map((lib) => (
          <SheetItem key={`loan-${lib.id}`} label={lib.name} onPress={() => onPick(lib)} />
        ))}
        <TextInput
          testID="library-search"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search()}
          returnKeyType="search"
          placeholder={TEXT.librarySearchPlaceholder}
          placeholderTextColor={C.inkMuted}
          style={[styles.input, styles.sheetSearch]}
        />
        {loading ? <ActivityIndicator accessibilityLabel="불러오는 중" /> : null}
        {failed ? <Text style={styles.fieldError}>{TEXT.librarySearchFailed}</Text> : null}
        {(found ?? []).map((lib) => (
          <SheetItem key={`found-${lib.id}`} label={lib.name} sub={lib.area_label ?? lib.address ?? null} onPress={() => onPick({ id: lib.id, name: lib.name })} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function LoanSheet({
  loans,
  isbn13,
  selected,
  onRetry,
  onPick,
  onClose,
}: {
  loans: Loan[] | null;
  isbn13: string | null;
  selected: string | null;
  onRetry: () => void;
  onPick: (loan: Loan | null) => void;
  onClose: () => void;
}) {
  const sorted = loans ? sortLoansForBook(loans, isbn13) : null;
  return (
    <Sheet title={TEXT.loanSheetTitle} onClose={onClose}>
      <ScrollView style={styles.sheetList}>
        <SheetItem label={TEXT.noLoan} onPress={() => onPick(null)} active={selected === null} />
        {sorted === null ? (
          <Pressable accessibilityRole="button" onPress={onRetry}>
            <Text style={styles.sheetSection}>{TEXT.loansFailed}</Text>
          </Pressable>
        ) : sorted.length === 0 ? (
          <Text style={styles.sheetSection}>{TEXT.loansEmpty}</Text>
        ) : (
          sorted.map((loan) => (
            <SheetItem
              key={loan.id}
              testID={`loan-${loan.id}`}
              label={loan.book.title}
              sub={`${loan.library?.name ?? "도서관"} · ${monthDay(loan.loaned_on)}`}
              active={selected === loan.id}
              onPress={() => onPick(loan)}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

function SheetItem({
  label,
  sub,
  onPress,
  active,
  testID,
}: {
  label: string;
  sub?: string | null;
  onPress: () => void;
  active?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetItem, pressed && ACT.secondaryPressed]}
    >
      <Text style={[styles.sheetItemText, active && styles.sheetItemActive]} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

// ─────────── 책 검색 화면 (R1-5: C의 searchBooks 그대로) ───────────

function BookFinder({ onPick, onClose }: { onPick: (book: Book) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Book[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const runner = useRef(createLatestRunner()).current;
  useEffect(() => () => runner.cancel(), [runner]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setFailed(false);
    const result = await runner.run((signal) => searchBooks(q, 1, signal));
    if (result.status === "stale") return;
    setLoading(false);
    if (result.status === "ok") setItems(result.value.items);
    else setFailed(true);
  };

  return (
    <View style={[styles.finder, { paddingTop: insets.top + 8 }]} testID="book-finder">
      <View style={styles.finderHead}>
        <Pressable accessibilityRole="button" accessibilityLabel="돌아가기" onPress={onClose} hitSlop={8} style={styles.headerSide}>
          <BackChevron color={C.inkStrong} />
        </Pressable>
        <View style={styles.flex}>
          <HeaderTitle label="FIND BOOK" title={TEXT.bookSearchTitle} />
        </View>
        <View style={styles.headerSide} />
      </View>
      <TextInput
        testID="book-search"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void search()}
        returnKeyType="search"
        autoFocus
        placeholder={TEXT.bookSearchPlaceholder}
        placeholderTextColor={C.inkMuted}
        style={[styles.input, styles.finderInput]}
      />
      <ScrollView contentContainerStyle={[styles.finderList, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator accessibilityLabel="불러오는 중" /> : null}
        {failed ? <Text style={styles.fieldError}>{TEXT.bookSearchFailed}</Text> : null}
        {items !== null && items.length === 0 && !loading ? <Text style={styles.sub}>{TEXT.bookSearchEmpty}</Text> : null}
        {(items ?? []).map((book) => (
          <Pressable
            key={book.isbn13}
            testID={`book-${book.isbn13}`}
            accessibilityRole="button"
            onPress={() => onPick(book)}
            style={({ pressed }) => [styles.finderItem, pressed && ACT.secondaryPressed]}
          >
            <Cover book={book} size={40} />
            <View style={styles.flex}>
              <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
              {book.author ? <Text style={styles.sub} numberOfLines={1}>{book.author}</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const C = theme.colors;
const ACT = actionColors(theme.colors);
export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.panelFrosted },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  centerText: { fontSize: 15, color: C.text, lineHeight: 22, textAlign: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: panel.backgroundColor,
    borderBottomWidth: 1,
    borderColor: panel.borderColor,
  },
  headerSide: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerX: { fontSize: 20, color: C.inkStrong },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "500", color: C.inkStrong },
  headerSave: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    minHeight: 36,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSaveText: { ...ACT.primaryText, fontSize: 14, fontWeight: "500" },
  body: { padding: 16, gap: 12 },
  bookField: { ...cardSurface(theme, { onPanel: true }), padding: 12, minHeight: 64, justifyContent: "center" },
  bookRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bookTitle: { fontSize: 15, fontWeight: "500", color: C.text },
  pickBook: { fontSize: 15, color: C.inkSoft },
  sub: { fontSize: 13, color: C.inkMuted, lineHeight: 19 },
  input: {
    ...ACT.secondary,
    backgroundColor: C.panelLit,
    borderRadius: theme.radii.infoCard,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
  },
  noteInput: { minHeight: 120 },
  quoteInput: { minHeight: 64 },
  fieldError: { fontSize: 13, color: C.loanOut },
  rows: { ...cardSurface(theme, { onPanel: true }) },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.seamHairline },
  rowLabel: { fontSize: 14, color: C.inkSoft, width: 72 },
  rowValue: { flex: 1, fontSize: 14, color: C.text, textAlign: "right" },
  rowChevron: { fontSize: 18, color: C.inkMuted },
  askCard: { ...cardSurface(theme, { onPanel: true }), padding: 12, gap: 6 },
  askTitle: { fontSize: 15, fontWeight: "500", color: C.text },
  failCard: { ...cardSurface(theme, { onPanel: true }), padding: 12, gap: 8 },
  dialogRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 6 },
  primaryBtn: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    height: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnSmall: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    minHeight: 40,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  dangerText: { color: C.loanOut },
  secondaryBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    minHeight: 40,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.shadowDeep,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 30,
  },
  dialog: { ...cardSurface(theme, { onPanel: true }), padding: 18, gap: 8, width: "100%", maxWidth: 360 },
  dialogTitle: { fontSize: 16, fontWeight: "500", color: C.text },
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
  coverImg: { backgroundColor: C.surface2 },
  coverBlank: { backgroundColor: C.surface3, padding: 4, justifyContent: "flex-end" },
  coverBlankText: { fontSize: 9, color: C.inkStrong },
  backdrop: { flex: 1, backgroundColor: C.shadowDeep, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.panelFrosted,
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
    padding: 16,
    gap: 12,
    maxHeight: "80%",
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetTitle: { ...T.title, flex: 1, fontSize: 19 },
  sheetClose: { fontSize: 14, color: C.inkSoft },
  sheetList: { flexGrow: 0 },
  sheetSection: { fontSize: 12, color: C.inkMuted, marginTop: 10, marginBottom: 4 },
  sheetSearch: { marginTop: 12, marginBottom: 6 },
  sheetItem: { minHeight: 48, justifyContent: "center", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.seamHairline },
  sheetItemText: { fontSize: 15, color: C.text },
  sheetItemActive: { fontWeight: "500", color: C.inkStrong },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { ...ACT.secondary, borderRadius: theme.radii.pill, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
  chipText: { fontSize: 14, color: C.text },
  finder: { ...StyleSheet.absoluteFill, backgroundColor: C.panelFrosted, zIndex: 20 },
  finderHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  finderInput: { marginHorizontal: 16 },
  finderList: { padding: 16, gap: 8 },
  finderItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
});
