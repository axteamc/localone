// CLUB-2-P3 모임 기록 화면 `/clubs/[clubId]/record` — contracts/book-club.md CLUB-2 K2-2~K2-7·K2-O6·K2-O7·C3·C6, 명세 결정 1·예외 #1~#6
// 순서(결정 1): 머리 → 기록 카드 → 내 후기 → 다음 모임 → (만든 사람만) 출석 확인
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, cardSurface, panel, theme, type as T } from "../../theme";
import {
  ApiCallError,
  fetchClubRecord,
  fetchNextClubs,
  putClubReview,
  REVIEW_MAX,
  shareClubReview,
  type Club,
  type ClubItem,
  type ClubRecord,
} from "./api";
import { AttendanceSheet } from "./AttendanceSheet";
import { formatClubWhen } from "./ClubCard";
import { NextClubSheet } from "./NextClubSheet";

const C = theme.colors;
const ACT = actionColors(theme.colors);

/** C3 화면 문구(테스트도 이 상수로 단언) */
export const RECORD_TEXT = {
  header: "모임 기록",
  ended: "끝난 모임",
  undecidedPlace: "장소 미정",
  count: (n: number) => `참가 ${n}명`,
  mine: {
    attended: "참가 신청함",
    no_show: "불참으로 기록됨",
    left: "참가를 취소했어요",
    removed: "참가 제한으로 명단에서 빠졌어요",
    host: "내가 만든 모임",
  },
  reviewTitle: "내 후기 · 나만 보기",
  reviewPlaceholder: "오늘 모임 어땠어요? 나만 볼 수 있어요",
  reviewCount: (n: number) => `${n}/${REVIEW_MAX}`,
  reviewTooLong: `${REVIEW_MAX}자까지 쓸 수 있어요`,
  save: "저장",
  saving: "저장하는 중…",
  saved: "후기를 저장했어요. 나만 볼 수 있어요",
  saveFailed: "후기를 저장하지 못했어요. 다시 해 주세요.",
  retry: "다시 해 보기",
  share: "게시물로 올리기",
  sharing: "올리는 중…",
  sharedNow: "후기를 게시물로 올렸어요. 원래 후기는 그대로 나만 봐요",
  shared: "게시물로 올렸어요 · 보러 가기",
  shareFailed: "게시물로 올리지 못했어요. 다시 해 주세요.",
  nextTitle: "다음 모임",
  existingNext: "이미 만든 다음 모임",
  noNext: "아직 다음 모임이 없어요. 처음으로 만들어 볼까요?",
  suggestTitle: "다음 모임 만들어 볼까요?",
  suggestBody: "이름·책·장소를 그대로 가져와요. 날짜만 새로 골라요.",
  createNext: "다음 모임 만들기",
  nextUndecided: "날짜 미정",
  loadFailed: "기록을 불러오지 못했어요.",
  notMine: "이 모임에 참가한 사람만 기록을 볼 수 있어요.",
  notEnded: "아직 끝나지 않은 모임이에요.",
  canceled: "취소된 모임이에요.",
  toClub: "모임 화면으로",
  signedOut: "로그인하면 모임 기록과 내 후기를 볼 수 있어요",
  loginTitle: "로그인이 필요해요",
  loginBody: "모임 기록을 보려면 로그인해 주세요. 보던 모임으로 다시 돌아와요.",
  login: "로그인",
  close: "닫기",
} as const;

type Load =
  | { state: "loading" }
  | { state: "ok"; record: ClubRecord }
  | { state: "error" }
  | { state: "blocked"; text: string };

type Notice = { text: string; retry: (() => void) | null } | null;

export function ClubRecordScreen({ clubId }: { clubId: string }) {
  const { status, userId } = useAuth();
  const account = status === "signedIn" ? userId : null;
  // 계정이나 모임이 바뀌면 화면을 새로 만든다: 바뀐 그 순간부터 이전 기록·초안·안내·진행 상태가 보이지 않는다(C6)
  return <RecordView key={`${account ?? "signed-out"}:${clubId}`} clubId={clubId} />;
}

function RecordView({ clubId }: { clubId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, userId } = useAuth();
  const signedIn = status === "signedIn";
  const account = signedIn ? userId : null;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [nextClubs, setNextClubs] = useState<ClubItem[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [askLogin, setAskLogin] = useState(true);
  const savingRef = useRef(false);
  const sharingRef = useRef(false);
  const shareRequestId = useRef(Crypto.randomUUID()); // 화면에서 한 번. 실패 뒤 다시 눌러도 같은 값(멱등)
  const runner = useMemo(() => createLatestRunner(), []);
  const alive = useRef(true); // 이 계정·모임 화면이 아직 떠 있는지. 바뀐 뒤 늦게 온 저장·공유 응답은 버린다
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const res = await runner.run((signal) => Promise.all([fetchClubRecord(clubId, signal), fetchNextClubs(clubId, signal)]));
    if (res.status === "stale") return; // 다른 계정·모임으로 바뀐 뒤 늦게 온 응답은 버린다
    if (res.status === "error") {
      const e = res.error;
      if (e instanceof ApiCallError && e.status === 404) setLoad({ state: "blocked", text: RECORD_TEXT.notMine });
      else if (e instanceof ApiCallError && e.code === "CLUB_CLOSED") setLoad({ state: "blocked", text: RECORD_TEXT.canceled });
      else if (e instanceof ApiCallError && e.code === "CLUB_NOT_ENDED") setLoad({ state: "blocked", text: RECORD_TEXT.notEnded });
      else setLoad({ state: "error" }); // 예외 #6
      return;
    }
    const [record, next] = res.value;
    setLoad({ state: "ok", record });
    setDraft(record.review?.body ?? "");
    setNextClubs(next);
  }, [clubId, runner, account]); // 계정이 바뀌면 새 함수 → 아래 효과가 다시 읽는다

  useEffect(() => {
    setLoad({ state: "loading" });
    setNotice(null);
    setNextClubs([]);
    setDraft("");
    if (status === "signedIn") void reload(); // 로그인 안 했으면 부르지 않는다(C6 비로그인)
    return () => runner.cancel();
  }, [reload, runner, status]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/clubs/${clubId}`));
  const toClub = () => router.replace(`/clubs/${clubId}`);

  async function save(body: string) {
    if (savingRef.current || sharingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const record = await putClubReview(clubId, body);
      if (!alive.current) return;
      setLoad((current) => current.state === "ok"
        ? { state: "ok", record: { ...current.record, review: record.review, shared_post_id: record.shared_post_id } }
        : current);
      setNotice({ text: RECORD_TEXT.saved, retry: null });
    } catch {
      if (!alive.current) return;
      setNotice({ text: RECORD_TEXT.saveFailed, retry: () => void save(body) }); // 쓰던 후기 유지(예외 #1)
    } finally {
      if (alive.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  async function share() {
    if (sharingRef.current || savingRef.current) return; // 연타·저장 중 공유 방지
    sharingRef.current = true;
    setSharing(true);
    setNotice(null);
    try {
      const record = await shareClubReview(clubId, shareRequestId.current);
      if (!alive.current) return;
      setLoad((current) => current.state === "ok"
        ? { state: "ok", record: { ...current.record, shared_post_id: record.shared_post_id } }
        : current);
      setNotice({ text: RECORD_TEXT.sharedNow, retry: null });
    } catch {
      if (!alive.current) return;
      setNotice({ text: RECORD_TEXT.shareFailed, retry: () => void share() });
    } finally {
      if (alive.current) {
        sharingRef.current = false;
        setSharing(false);
      }
    }
  }

  const head = (
    <View style={[styles.head, { paddingTop: 10 + insets.top }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} hitSlop={10}>
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <Text style={styles.headTitle} numberOfLines={1}>
        {RECORD_TEXT.header}
      </Text>
      <View style={styles.headSide} />
    </View>
  );

  if (!signedIn) {
    return (
      <View style={styles.root}>
        {head}
        <View style={styles.center} testID="record-signed-out">
          {status === "loading" ? (
            <ActivityIndicator color={C.inkStrong} />
          ) : (
            <>
              <Text style={styles.body}>{RECORD_TEXT.signedOut}</Text>
              <Pressable accessibilityRole="button" onPress={() => setAskLogin(true)} style={styles.secondary}>
                <Text style={styles.secondaryText}>{RECORD_TEXT.login}</Text>
              </Pressable>
            </>
          )}
        </View>
        {status === "signedOut" && askLogin ? (
          <Modal transparent animationType="fade" onRequestClose={() => setAskLogin(false)}>
            <View style={styles.backdrop}>
              <View style={styles.sheet} testID="record-login-dialog">
                <Text style={styles.sheetTitle}>{RECORD_TEXT.loginTitle}</Text>
                <Text style={styles.body}>{RECORD_TEXT.loginBody}</Text>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => setAskLogin(false)} style={[styles.secondary, styles.flex]}>
                    <Text style={styles.secondaryText}>{RECORD_TEXT.close}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setAskLogin(false);
                      router.push({ pathname: "/login", params: { returnTo: `/clubs/${clubId}/record` } });
                    }}
                    style={({ pressed }) => [styles.primary, styles.flex, styles.noTop, pressed && ACT.primaryPressed]}
                  >
                    <Text style={styles.primaryText}>{RECORD_TEXT.login}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    );
  }

  if (load.state !== "ok") {
    return (
      <View style={styles.root}>
        {head}
        <View style={styles.center}>
          {load.state === "loading" ? <ActivityIndicator color={C.inkStrong} /> : null}
          {load.state === "error" ? (
            <>
              <Text style={styles.body}>{RECORD_TEXT.loadFailed}</Text>
              <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.secondary}>
                <Text style={styles.secondaryText}>{RECORD_TEXT.retry}</Text>
              </Pressable>
            </>
          ) : null}
          {load.state === "blocked" ? (
            <>
              <Text style={styles.body}>{load.text}</Text>
              <Pressable accessibilityRole="button" onPress={toClub} style={styles.secondary}>
                <Text style={styles.secondaryText}>{RECORD_TEXT.toClub}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const record = load.record;
  const club = record.club;
  const when = formatClubWhen(club.starts_at, club.ends_at);
  const mine = club.is_host
    ? RECORD_TEXT.mine.host
    : record.my_participation === "joined"
      ? RECORD_TEXT.mine[record.my_attendance === "no_show" ? "no_show" : "attended"]
      : record.my_participation === "none"
        ? null
        : RECORD_TEXT.mine[record.my_participation];
  const text = draft.trim();
  const tooLong = text.length > REVIEW_MAX;
  const unchanged = record.review !== null && text === record.review.body;
  const canSave = text.length > 0 && !tooLong && !unchanged && !saving && !sharing;

  return (
    <View style={styles.root}>
      {head}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" testID="record-scroll">
        <View style={styles.card} testID="record-card">
          {club.book ? <View style={styles.cover} /> : null}
          <View style={styles.flex}>
            <Text style={styles.name}>{club.name}</Text>
            {club.book ? <Text style={styles.line}>{club.book.title}</Text> : null}
            <Text style={styles.line}>{when ? `${when.day} ${when.time} · ${RECORD_TEXT.ended}` : RECORD_TEXT.ended}</Text>
            <Text style={styles.line}>{club.place ?? RECORD_TEXT.undecidedPlace}</Text>
            <Text style={styles.line}>{RECORD_TEXT.count(club.participant_count)}</Text>
            {mine ? <Text style={styles.mine}>{mine}</Text> : null}
          </View>
        </View>

        <View style={styles.box} testID="record-review">
          <Text style={styles.sec}>{RECORD_TEXT.reviewTitle}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={RECORD_TEXT.reviewPlaceholder}
            placeholderTextColor={C.inkMuted}
            multiline
            style={styles.review}
            accessibilityLabel={RECORD_TEXT.reviewTitle}
            testID="record-review-input"
          />
          <Text style={styles.counter}>{RECORD_TEXT.reviewCount(text.length)}</Text>
          {tooLong ? (
            <Text style={styles.warn} accessibilityRole="alert">
              {RECORD_TEXT.reviewTooLong}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={() => void save(text)}
            testID="record-review-save"
            style={({ pressed }) => [styles.primary, pressed && canSave && ACT.primaryPressed, !canSave && styles.dim]}
          >
            <Text style={styles.primaryText}>{saving ? RECORD_TEXT.saving : RECORD_TEXT.save}</Text>
          </Pressable>
          {record.review && !record.shared_post_id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saving || sharing }}
              disabled={saving || sharing}
              onPress={() => void share()}
              testID="record-review-share"
              style={({ pressed }) => [styles.secondary, pressed && !sharing && ACT.secondaryPressed, sharing && styles.dim]}
            >
              <Text style={styles.secondaryText}>{sharing ? RECORD_TEXT.sharing : RECORD_TEXT.share}</Text>
            </Pressable>
          ) : null}
          {record.shared_post_id ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/posts/${record.shared_post_id}`)}
              testID="record-review-shared"
              style={styles.linkRow}
            >
              <Text style={styles.link}>{RECORD_TEXT.shared}</Text>
            </Pressable>
          ) : null}
          {notice ? (
            <View style={styles.notice} accessibilityRole="alert" testID="record-notice">
              <Text style={styles.body}>{notice.text}</Text>
              {notice.retry ? (
                <Pressable accessibilityRole="button" onPress={notice.retry} style={styles.secondary}>
                  <Text style={styles.secondaryText}>{RECORD_TEXT.retry}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.box} testID="record-next">
          <Text style={styles.sec}>{RECORD_TEXT.nextTitle}</Text>
          {nextClubs.length > 0 ? (
            <>
              <Text style={styles.note}>{RECORD_TEXT.existingNext}</Text>
              {nextClubs.map((n) => (
                <NextRow key={n.id} item={n} onOpen={() => router.push(`/clubs/${n.id}`)} />
              ))}
            </>
          ) : (
            <Text style={styles.note}>{RECORD_TEXT.noNext}</Text>
          )}
          {record.suggest_next ? (
            <View style={styles.suggest} testID="record-next-suggest">
              <Text style={styles.suggestTitle}>{RECORD_TEXT.suggestTitle}</Text>
              <Text style={styles.note}>{RECORD_TEXT.suggestBody}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCreating(true)}
                testID="record-next-create"
                style={({ pressed }) => [styles.primary, pressed && ACT.primaryPressed]}
              >
                <Text style={styles.primaryText}>{RECORD_TEXT.createNext}</Text>
              </Pressable>
            </View>
          ) : record.can_create_next ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setCreating(true)}
              testID="record-next-create"
              style={({ pressed }) => [styles.secondary, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{RECORD_TEXT.createNext}</Text>
            </Pressable>
          ) : null}
        </View>

        {club.is_host ? (
          <AttendanceSheet
            record={record}
            onRecorded={(next) => {
              if (!alive.current) return;
              setLoad((current) => current.state === "ok"
                ? { state: "ok", record: {
                    ...current.record, club: next.club, attendance_roster_version: next.attendance_roster_version,
                  } }
                : current);
            }}
            onReload={() => fetchClubRecord(clubId)}
          />
        ) : null}
      </ScrollView>

      {creating ? (
        <NextClubSheet
          clubId={clubId}
          previousPlace={club.place}
          onClose={() => setCreating(false)}
          onCreated={(created: Club) => {
            setCreating(false);
            router.push(`/clubs/${created.id}`);
          }}
        />
      ) : null}
    </View>
  );
}

function NextRow({ item, onOpen }: { item: ClubItem; onOpen(): void }) {
  const when = formatClubWhen(item.starts_at, null);
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.nextRow} testID={`record-next-${item.id}`}>
      <Text style={styles.nextName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.line} numberOfLines={1}>
        {`${when ? `${when.day} ${when.time}` : RECORD_TEXT.nextUndecided} · ${item.place ?? RECORD_TEXT.undecidedPlace}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: panel.backgroundColor,
    borderBottomWidth: 1,
    borderColor: panel.borderColor,
  },
  back: { fontSize: 28, lineHeight: 30, color: C.text },
  headTitle: { ...T.name, flex: 1 },
  headSide: { width: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, gap: 12 },
  card: { ...cardSurface(), borderRadius: theme.radii.infoCard, padding: 12, flexDirection: "row", gap: 12 },
  cover: {
    width: 52,
    height: 74,
    backgroundColor: C.fill1,
    borderTopLeftRadius: theme.radii.bookCover[0],
    borderTopRightRadius: theme.radii.bookCover[1],
    borderBottomRightRadius: theme.radii.bookCover[2],
    borderBottomLeftRadius: theme.radii.bookCover[3],
  },
  name: { ...T.title, fontSize: 20 },
  line: { fontSize: 14, color: C.textSub, marginTop: 2 },
  mine: { fontSize: 13, color: C.text, marginTop: 6, fontWeight: "500" },
  box: { ...cardSurface(), padding: 12, gap: 8 },
  sec: { ...T.gauge },
  review: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    padding: 12,
    fontSize: 15,
    color: C.text,
    textAlignVertical: "top",
  },
  counter: { fontSize: 12, color: C.inkMuted, alignSelf: "flex-end" },
  warn: { fontSize: 13, color: C.text },
  note: { fontSize: 13, color: C.textSub, lineHeight: 18 },
  notice: { gap: 8 },
  linkRow: { minHeight: 40, justifyContent: "center" },
  link: { fontSize: 14, color: C.text, textDecorationLine: "underline" },
  suggest: { gap: 6, marginTop: 4 },
  suggestTitle: { fontSize: 16, color: C.text, fontWeight: "500" },
  nextRow: { borderWidth: 1, borderColor: C.seamHairline, borderRadius: theme.radii.control, padding: 10, backgroundColor: C.paper },
  nextName: { fontSize: 15, color: C.text },
  body: { fontSize: 14, color: C.text, lineHeight: 20, textAlign: "center" },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: 4, paddingHorizontal: 16 },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  noTop: { marginTop: 0 },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  dim: { opacity: 0.55 },
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
  sheetTitle: { fontSize: 17, color: C.text, lineHeight: 24 },
  actions: { flexDirection: "row", gap: 10 },
});
