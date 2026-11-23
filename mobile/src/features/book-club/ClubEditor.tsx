// CLUB-1-P2 모임 만들기·고치기 `/clubs/new?libraryId=` · `/clubs/new?clubId=` — contracts/book-club.md CLUB-1 K1-O2·K1-O3·C3·C4
// 결정 2(D 시안 확인 후보 C): 처음엔 이름(필수)·날짜만, "+ 장소·책·정원·소개 더 쓰기"로 나머지 4칸을 펼친다.
// 날짜·시각은 LOAN-2 DueDateSheet처럼 새 라이브러리 없이 글자 칸("YYYY-MM-DD"·"HH:MM")으로 받는다(C4, 세 플랫폼 공통).
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { searchBooks, type Book } from "../../lib/publicApi";
import { parseYmd } from "../loan-assistant/DueDateSheet";
import { actionColors, panel, theme, type as T } from "../../theme";
import {
  ApiCallError,
  createClub,
  fetchClub,
  INTRO_MAX,
  NAME_MAX,
  PLACE_MAX,
  updateClub,
  type Club,
  type ClubInput,
} from "./api";

const C = theme.colors;
const ACT = actionColors(theme.colors);

export const EDITOR_TEXT = {
  createTitle: "모임 만들기",
  createSubmit: "올리기",
  editTitle: "모임 고치기",
  editSubmit: "저장",
  sending: "올리는 중…",
  more: "+ 장소·책·정원·소개 더 쓰기",
  nameLabel: "모임 이름 · 필수",
  whenLabel: "날짜·시각 · 선택",
  placeLabel: "장소 · 선택",
  bookLabel: "함께 읽을 책 · 선택",
  capacityLabel: "정원 · 선택",
  introLabel: "소개 · 선택",
  undecided: "미정",
  undecidedNote: "날짜 미정 — 댓글로 정해요",
  datePlaceholder: "2026-11-28",
  startPlaceholder: "14:00",
  endPlaceholder: "16:00 (선택)",
  namePlaceholder: "예) 소년이 온다 같이 읽기",
  placePlaceholder: "예) 2층 세미나실",
  capacityPlaceholder: "비우면 제한 없음",
  introPlaceholder: "어떤 모임인지 적어 주세요",
  bookFind: "책 찾기",
  bookSearch: "찾기",
  bookRemove: "빼기",
  bookNone: "찾는 책이 없어요.",
  bookFailed: "지금은 책을 찾을 수 없어요. 다시 시도해 주세요.",
  tooLong: (max: number) => `${max}자까지 쓸 수 있어요`,
  nameEmpty: "모임 이름을 적어 주세요",
  whenNeeded: "날짜와 시작 시각을 적거나 \"미정\"을 켜 주세요",
  whenBad: "날짜는 2026-11-28, 시각은 14:00처럼 적어 주세요",
  timeOrder: "끝나는 시각은 시작보다 늦어야 해요",
  capacityBad: "정원은 1명 이상 숫자로 적어 주세요",
  createFailed: "모임을 올리지 못했어요. 다시 해 주세요",
  started: "시작한 모임이라 시작 시각은 바꿀 수 없어요",
  loginNeeded: "로그인하면 모임을 만들 수 있어요",
  login: "로그인하기",
  loadFailed: "모임을 불러오지 못했어요.",
  count: (n: number, max: number) => `${n}/${max}`,
} as const;

const HM = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

/** "2026-11-28" + "14:00" → "2026-11-28T14:00:00+09:00". 틀리면 null */
export function toKstIso(ymd: string, hm: string): string | null {
  const day = parseYmd(ymd.trim());
  const m = HM.exec(hm.trim());
  if (!day || !m) return null;
  return `${day}T${m[1]!.padStart(2, "0")}:${m[2]}:00+09:00`;
}

/** ISO → 서울 기준 ["YYYY-MM-DD", "HH:MM"] */
function fromIso(iso: string | null): [string, string] {
  if (!iso) return ["", ""];
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString();
  return [d.slice(0, 10), d.slice(11, 16)];
}

type Field = "name" | "when" | "place" | "capacity" | "intro" | "form";

export type ClubEditorProps = { libraryId: number | null; clubId?: string | null };

export function ClubEditor({ libraryId, clubId = null }: ClubEditorProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const editing = clubId !== null;
  const [original, setOriginal] = useState<Club | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState("");
  const [undecided, setUndecided] = useState(false);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [expanded, setExpanded] = useState(editing);
  const [place, setPlace] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [capacity, setCapacity] = useState("");
  const [intro, setIntro] = useState("");
  const [warn, setWarn] = useState<{ field: Field; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const requestId = useRef(Crypto.randomUUID()); // 화면을 열 때 한 번. 실패 후 다시 눌러도 같은 값(멱등)
  const sending = useRef(false);

  useEffect(() => {
    if (!clubId) return;
    let alive = true;
    fetchClub(clubId)
      .then((club) => {
        if (!alive) return;
        setOriginal(club);
        setName(club.name);
        const [d, s] = fromIso(club.starts_at);
        const [, e] = fromIso(club.ends_at);
        setUndecided(club.starts_at === null);
        setDate(d);
        setStart(s);
        setEnd(e);
        setPlace(club.place ?? "");
        setBook(club.book);
        setCapacity(club.capacity === null ? "" : String(club.capacity));
        setIntro(club.intro ?? "");
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [clubId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  /** 화면 칸 → 보낼 값. 틀리면 칸 아래 안내를 띄우고 null */
  function collect(): ClubInput | null {
    const n = name.trim();
    if (!n) return setWarn({ field: "name", text: EDITOR_TEXT.nameEmpty }), null;
    if (n.length > NAME_MAX) return setWarn({ field: "name", text: EDITOR_TEXT.tooLong(NAME_MAX) }), null;
    let startsAt: string | null = null;
    let endsAt: string | null = null;
    if (!undecided) {
      if (!date.trim() || !start.trim()) return setWarn({ field: "when", text: EDITOR_TEXT.whenNeeded }), null;
      startsAt = toKstIso(date, start);
      endsAt = end.trim() ? toKstIso(date, end) : null;
      if (!startsAt || (end.trim() && !endsAt)) return setWarn({ field: "when", text: EDITOR_TEXT.whenBad }), null;
      if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return setWarn({ field: "when", text: EDITOR_TEXT.timeOrder }), null;
    }
    const p = place.trim();
    if (p.length > PLACE_MAX) return setWarn({ field: "place", text: EDITOR_TEXT.tooLong(PLACE_MAX) }), null;
    let cap: number | null = null;
    if (capacity.trim()) {
      cap = Number(capacity.trim());
      if (!Number.isInteger(cap) || cap < 1) return setWarn({ field: "capacity", text: EDITOR_TEXT.capacityBad }), null;
    }
    const i = intro.trim();
    if (i.length > INTRO_MAX) return setWarn({ field: "intro", text: EDITOR_TEXT.tooLong(INTRO_MAX) }), null;
    return { name: n, intro: i || null, isbn13: book?.isbn13 ?? null, place: p || null, starts_at: startsAt, ends_at: endsAt, capacity: cap };
  }

  /** 고치기: 바뀐 칸만 보낸다(#52 보낸 칸만) */
  function changed(input: ClubInput, club: Club): Partial<ClubInput> {
    const out: Partial<ClubInput> = {};
    if (input.name !== club.name) out.name = input.name;
    if (input.intro !== club.intro) out.intro = input.intro;
    if (input.isbn13 !== (club.book?.isbn13 ?? null)) out.isbn13 = input.isbn13;
    if (input.place !== club.place) out.place = input.place;
    const sameTime = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));
    if (!sameTime(input.starts_at, club.starts_at)) out.starts_at = input.starts_at;
    if (!sameTime(input.ends_at, club.ends_at)) out.ends_at = input.ends_at;
    if (input.capacity !== club.capacity) out.capacity = input.capacity;
    return out;
  }

  async function submit() {
    if (sending.current) return;
    const input = collect();
    if (!input) return;
    sending.current = true;
    setBusy(true);
    setWarn(null);
    try {
      if (editing && original) await updateClub(original.id, changed(input, original));
      else if (libraryId !== null) await createClub(libraryId, input, requestId.current);
      close();
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 422) {
        const field: Field = e.detail === "name" ? "name" : e.detail === "place" ? "place" : e.detail === "intro" ? "intro"
          : e.detail === "capacity" ? "capacity" : e.detail === "starts_at" || e.detail === "ends_at" ? "when" : "form";
        const max = field === "name" ? NAME_MAX : field === "place" ? PLACE_MAX : field === "intro" ? INTRO_MAX : 0;
        setWarn({ field, text: field === "when" ? EDITOR_TEXT.timeOrder : max ? EDITOR_TEXT.tooLong(max) : EDITOR_TEXT.createFailed });
      } else if (e instanceof ApiCallError && e.code === "CLUB_STARTED") {
        setWarn({ field: "when", text: EDITOR_TEXT.started });
      } else {
        setWarn({ field: "form", text: EDITOR_TEXT.createFailed }); // 입력은 그대로, 다시 누르면 같은 requestId
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const head = (
    <View style={[styles.head, { paddingTop: 10 + insets.top }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={10}>
        <Text style={styles.x}>✕</Text>
      </Pressable>
      <Text style={styles.headTitle} numberOfLines={1}>
        {editing ? EDITOR_TEXT.editTitle : EDITOR_TEXT.createTitle}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !name.trim() || busy }}
        disabled={!name.trim() || busy}
        onPress={() => void submit()}
        testID="club-editor-submit"
        style={({ pressed }) => [styles.submit, pressed && ACT.primaryPressed, (!name.trim() || busy) && styles.dim]}
      >
        <Text style={styles.submitText} numberOfLines={1}>
          {busy ? EDITOR_TEXT.sending : editing ? EDITOR_TEXT.editSubmit : EDITOR_TEXT.createSubmit}
        </Text>
      </Pressable>
    </View>
  );

  if (status === "signedOut") {
    return (
      <View style={styles.root}>
        {head}
        <View style={styles.center}>
          <Text style={styles.body}>{EDITOR_TEXT.loginNeeded}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/login" })} style={styles.secondary}>
            <Text style={styles.secondaryText}>{EDITOR_TEXT.login}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (editing && !original) {
    return (
      <View style={styles.root}>
        {head}
        <View style={styles.center}>
          {loadFailed ? <Text style={styles.body}>{EDITOR_TEXT.loadFailed}</Text> : <ActivityIndicator color={C.inkStrong} />}
        </View>
      </View>
    );
  }

  const warnFor = (field: Field) =>
    warn?.field === field ? (
      <Text style={styles.warn} accessibilityRole="alert" testID={`club-editor-warn-${field}`}>
        {warn.text}
      </Text>
    ) : null;
  const label = (text: string, counter?: string) => (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{text}</Text>
      {counter ? <Text style={styles.counter}>{counter}</Text> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      {head}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="club-editor-scroll">
        {warnFor("form")}
        {label(EDITOR_TEXT.nameLabel, EDITOR_TEXT.count(name.trim().length, NAME_MAX))}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={EDITOR_TEXT.namePlaceholder}
          placeholderTextColor={C.inkMuted}
          style={styles.input}
          accessibilityLabel={EDITOR_TEXT.nameLabel}
          testID="club-editor-name"
        />
        {warnFor("name")}

        <View style={styles.labelRow}>
          <Text style={styles.label}>{EDITOR_TEXT.whenLabel}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.counter}>{EDITOR_TEXT.undecided}</Text>
            <Switch
              value={undecided}
              onValueChange={setUndecided}
              accessibilityLabel={EDITOR_TEXT.undecided}
              testID="club-editor-undecided"
              trackColor={{ true: C.inkStrong, false: C.surface3 }}
            />
          </View>
        </View>
        {undecided ? (
          <View style={styles.input} testID="club-editor-undecided-note">
            <Text style={styles.placeholderText}>{EDITOR_TEXT.undecidedNote}</Text>
          </View>
        ) : (
          <View style={styles.whenRow}>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder={EDITOR_TEXT.datePlaceholder}
              placeholderTextColor={C.inkMuted}
              style={[styles.input, styles.date]}
              accessibilityLabel="날짜"
              testID="club-editor-date"
            />
            <TextInput
              value={start}
              onChangeText={setStart}
              placeholder={EDITOR_TEXT.startPlaceholder}
              placeholderTextColor={C.inkMuted}
              style={[styles.input, styles.time]}
              accessibilityLabel="시작 시각"
              testID="club-editor-start"
            />
            <TextInput
              value={end}
              onChangeText={setEnd}
              placeholder={EDITOR_TEXT.endPlaceholder}
              placeholderTextColor={C.inkMuted}
              style={[styles.input, styles.time]}
              accessibilityLabel="끝나는 시각"
              testID="club-editor-end"
            />
          </View>
        )}
        {warnFor("when")}

        {!expanded ? (
          <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.more} testID="club-editor-more">
            <Text style={styles.moreText}>{EDITOR_TEXT.more}</Text>
          </Pressable>
        ) : (
          <View testID="club-editor-rest" style={styles.rest}>
            {label(EDITOR_TEXT.placeLabel, EDITOR_TEXT.count(place.trim().length, PLACE_MAX))}
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder={EDITOR_TEXT.placePlaceholder}
              placeholderTextColor={C.inkMuted}
              style={styles.input}
              accessibilityLabel={EDITOR_TEXT.placeLabel}
              testID="club-editor-place"
            />
            {warnFor("place")}

            {label(EDITOR_TEXT.bookLabel)}
            {book ? (
              <View style={[styles.input, styles.bookRow]}>
                <Text style={[styles.body, styles.flex]} numberOfLines={1}>
                  {book.title}
                  {book.author ? ` · ${book.author}` : ""}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setBook(null)} hitSlop={8}>
                  <Text style={styles.link}>{EDITOR_TEXT.bookRemove}</Text>
                </Pressable>
              </View>
            ) : finding ? (
              <BookFinder
                onPick={(b) => {
                  setBook(b);
                  setFinding(false);
                }}
              />
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setFinding(true)} style={styles.secondary} testID="club-editor-book">
                <Text style={styles.secondaryText}>{EDITOR_TEXT.bookFind}</Text>
              </Pressable>
            )}

            {label(EDITOR_TEXT.capacityLabel)}
            <TextInput
              value={capacity}
              onChangeText={setCapacity}
              placeholder={EDITOR_TEXT.capacityPlaceholder}
              placeholderTextColor={C.inkMuted}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel={EDITOR_TEXT.capacityLabel}
              testID="club-editor-capacity"
            />
            {warnFor("capacity")}

            {label(EDITOR_TEXT.introLabel, EDITOR_TEXT.count(intro.trim().length, INTRO_MAX))}
            <TextInput
              value={intro}
              onChangeText={setIntro}
              placeholder={EDITOR_TEXT.introPlaceholder}
              placeholderTextColor={C.inkMuted}
              multiline
              style={[styles.input, styles.intro]}
              accessibilityLabel={EDITOR_TEXT.introLabel}
              testID="club-editor-intro"
            />
            {warnFor("intro")}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** 책 찾기(publicApi.searchBooks, C7 book-search). 늦게 온 앞 결과는 버린다 */
function BookFinder({ onPick }: { onPick(book: Book): void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Book[] | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const run = async () => {
    const q = query.trim();
    if (!q) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await searchBooks(q);
      if (mine === seq.current) setItems(res.items);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  };
  return (
    <View style={styles.finder} testID="club-book-finder">
      <View style={styles.whenRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void run()}
          placeholder="책 제목이나 저자"
          placeholderTextColor={C.inkMuted}
          returnKeyType="search"
          style={[styles.input, styles.flex]}
          accessibilityLabel="책 제목이나 저자"
        />
        <Pressable accessibilityRole="button" onPress={() => void run()} style={styles.secondary}>
          <Text style={styles.secondaryText}>{EDITOR_TEXT.bookSearch}</Text>
        </Pressable>
      </View>
      {failed ? <Text style={styles.warn}>{EDITOR_TEXT.bookFailed}</Text> : null}
      {items && items.length === 0 ? <Text style={styles.counter}>{EDITOR_TEXT.bookNone}</Text> : null}
      {(items ?? []).slice(0, 8).map((b) => (
        <Pressable key={b.isbn13} accessibilityRole="button" onPress={() => onPick(b)} style={styles.finderRow}>
          <Text style={styles.body} numberOfLines={1}>
            {b.title}
          </Text>
          <Text style={styles.counter} numberOfLines={1}>
            {b.author ?? "저자 정보 없음"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: panel.backgroundColor,
    borderBottomWidth: 1,
    borderColor: panel.borderColor,
  },
  x: { fontSize: 18, color: C.text },
  headTitle: { ...T.name, flex: 1 },
  submit: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 36, paddingHorizontal: 16, justifyContent: "center" },
  submitText: { ...ACT.primaryText, fontSize: 14, fontWeight: "500" },
  dim: { opacity: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, paddingBottom: 48, gap: 6 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  label: { fontSize: 13, color: C.textSub },
  counter: { fontSize: 12, color: C.inkMuted },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    justifyContent: "center",
  },
  placeholderText: { fontSize: 15, color: C.inkMuted },
  whenRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  date: { flex: 1.4 },
  time: { flex: 1 },
  intro: { minHeight: 96, textAlignVertical: "top" },
  rest: { gap: 6 },
  more: { marginTop: 16, minHeight: 44, borderWidth: 1, borderStyle: "dashed", borderColor: C.surface3, borderRadius: theme.radii.infoCard, justifyContent: "center", paddingHorizontal: 12 },
  moreText: { fontSize: 14, color: C.text },
  warn: { fontSize: 13, color: C.text },
  body: { fontSize: 14, color: C.text },
  link: { fontSize: 13, color: C.textSub, textDecorationLine: "underline" },
  bookRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  finder: { gap: 6 },
  finderRow: { paddingVertical: 8, borderBottomWidth: 1, borderColor: C.divider },
});
