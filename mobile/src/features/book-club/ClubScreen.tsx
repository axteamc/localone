// CLUB-1-P2 모임 화면 `/clubs/[clubId]` — contracts/book-club.md CLUB-1 K1-O4·K1-O6~O8·C3·C6·P4, 명세 결정 1~3·예외 #1~#6
// CLUB-2-P3: 끝난 모임 "기록·후기 쓰기"(큰 틀 결정 3), 만든 사람 댓글 처리 요청(K2-9), 제한 중 안내(K2-O4·C3)
// 순서: 머리(만든 사람만 ⋯) → 약속 정보 → 주 버튼 → 참가자 → 댓글 → 아래 고정 댓글 칸(큰 틀 결정 2)
import * as Crypto from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { actionColors, cardSurface, panel, theme, type as T } from "../../theme";
import {
  ApiCallError,
  cancelClub,
  closeClub,
  COMMENT_MAX,
  activeRestrictionUntil,
  deleteClubComment,
  fetchClub,
  fetchMyRestrictions,
  fetchClubComments,
  joinClub,
  leaveClub,
  postClubComment,
  REASON_MAX,
  requestCommentModeration,
  type Club,
  type ClubComment,
} from "./api";
import { formatClubWhen } from "./ClubCard";

const C = theme.colors;
const ACT = actionColors(theme.colors);

/** C3 화면 문구 한곳(테스트도 이 상수로 단언) */
export const CLUB_TEXT = {
  header: "모임",
  join: "모임에 참가",
  joining: "참가하는 중…",
  leave: "참가 취소",
  leaving: "취소하는 중…",
  loginToJoin: "로그인하고 참가하기",
  loginToComment: "로그인하면 댓글을 쓸 수 있어요",
  loginTitle: "로그인이 필요해요",
  loginBody: "모임에 참가하거나 댓글을 쓰려면 로그인해 주세요. 보던 모임으로 다시 돌아와요.",
  login: "로그인",
  close: "닫기",
  undecidedDay: "날짜 미정",
  undecidedNote: "댓글로 정해요",
  undecidedPlace: "장소 미정",
  closed: "모집 마감",
  full: "자리가 다 찼어요",
  fullNote: "누가 참가를 취소하면 다시 참가할 수 있어요.",
  canceled: "취소된 모임",
  cancelReason: "취소 이유",
  ended: "끝난 모임",
  startedNoLeave: "시작한 모임이라 취소할 수 없어요",
  changed: "바뀜",
  restricted: "지금은 모임에 참가할 수 없어요",
  commentRestricted: "지금은 댓글을 쓸 수 없어요",
  writeRecord: "기록·후기 쓰기",
  moderationTitle: "댓글 처리 요청",
  moderationPlaceholder: "관리자에게 알릴 이유를 적어 주세요",
  moderationSend: "관리자에게 요청",
  moderationDone: "요청했어요. 관리자가 확인할 때까지 댓글은 그대로 보여요",
  moderationAgain: "이미 요청한 댓글이에요",
  moderationFailed: "요청하지 못했어요. 다시 해 주세요.",
  restrictedUntil: (iso: string) => {
    const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return ` (${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${hh}:${mm}까지)`;
  },
  joinFailed: "참가하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.",
  leaveFailed: "참가를 취소하지 못했어요. 다시 해 주세요.",
  retry: "다시 해 보기",
  commentFailed: "댓글을 올리지 못했어요. 다시 해 주세요",
  commentDeleteFailed: "댓글을 지우지 못했어요. 다시 해 주세요",
  commentTooLong: `${COMMENT_MAX}자까지 쓸 수 있어요`,
  commentPlaceholder: "댓글 쓰기",
  commentSend: "올리기",
  loadFailed: "모임을 불러오지 못했어요.",
  notFound: "모임을 찾을 수 없어요",
  participants: (n: number) => `참가자 ${n}`,
  comments: (n: number) => `댓글 ${n}`,
  moreComments: "댓글 더 보기",
  emptyParticipants: "아직 참가한 사람이 없어요. 첫 번째로 참가해 보세요.",
  emptyComments: "아직 댓글이 없어요. 시간·장소를 댓글로 의논해 보세요.",
  me: "나",
  count: (club: Pick<Club, "participant_count" | "capacity">) =>
    club.capacity === null ? `${club.participant_count}명` : `${club.participant_count}/${club.capacity}명`,
  host: (nickname: string) => `만든 사람 ${nickname}`,
  menuEdit: "일정·장소 바꾸기",
  menuClose: "모집 마감",
  menuCancel: "모임 취소",
  leaveConfirm: "참가를 취소할까요?",
  leaveKeep: "그대로 두기",
  closeConfirm: "모집을 마감할까요? 더는 참가할 수 없어요",
  closeDo: "마감",
  cancelConfirm: "모임을 취소할까요? 참가한 사람에게 안내가 가요",
  cancelPlaceholder: "취소 이유를 적어 주세요",
  cancelDo: "모임 취소",
  commentDelete: "지우기",
  commentDeleteConfirm: "댓글을 지울까요?",
  failed: "다시 해 주세요.",
  hostOwn: "내가 만든 모임",
} as const;

type Load = { state: "loading" } | { state: "ok"; club: Club } | { state: "error" } | { state: "notfound" };
type Dialog =
  | { kind: "leave" }
  | { kind: "close" }
  | { kind: "cancel" }
  | { kind: "menu" }
  | { kind: "deleteComment"; comment: ClubComment }
  | { kind: "moderation"; comment: ClubComment }
  | { kind: "login" }
  | null;

function started(club: Club): boolean {
  return club.starts_at !== null && Date.parse(club.starts_at) <= Date.now();
}

/** 주 버튼(P4 골격 MainButton). 상태 문구는 흐린 버튼 자리에 */
function MainButton({
  club,
  signedIn,
  busy,
  restrictedLabel,
  onJoin,
  onLeave,
  onLogin,
  onRecord,
}: {
  club: Club;
  signedIn: boolean;
  busy: boolean;
  restrictedLabel: string | null;
  onJoin(): void;
  onLeave(): void;
  onLogin(): void;
  onRecord(): void;
}) {
  if (!signedIn) return <Btn label={CLUB_TEXT.loginToJoin} onPress={onLogin} />;
  if (club.status === "canceled") return <Btn label={CLUB_TEXT.canceled} disabled />;
  if (club.status === "ended") {
    // 끝난 모임: 만든 사람·끝까지 참가한 사람은 참가 버튼 자리가 "기록·후기 쓰기"(큰 틀 결정 3)
    if (club.is_host || club.my_participation === "joined") return <Btn label={CLUB_TEXT.writeRecord} onPress={onRecord} />;
    return <Btn label={CLUB_TEXT.ended} disabled />;
  }
  if (club.is_host) return <Btn label={CLUB_TEXT.hostOwn} disabled />; // 만든 사람은 참가자 수에 세지 않는다(K1-O4)
  if (club.my_participation === "joined") {
    if (started(club)) return <Btn label={CLUB_TEXT.startedNoLeave} disabled />;
    return <Btn label={busy ? CLUB_TEXT.leaving : CLUB_TEXT.leave} disabled={busy} onPress={onLeave} />;
  }
  if (restrictedLabel) return <Btn label={restrictedLabel} disabled />;
  if (club.status === "closed") return <Btn label={CLUB_TEXT.closed} disabled />;
  if (club.capacity !== null && club.participant_count >= club.capacity) return <Btn label={CLUB_TEXT.full} disabled />;
  return <Btn label={busy ? CLUB_TEXT.joining : CLUB_TEXT.join} disabled={busy} onPress={onJoin} />; // 진행 중 연타 무시
}

function Btn({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress?(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID="club-main-button"
      style={({ pressed }) => [styles.primary, pressed && !disabled && ACT.primaryPressed, disabled && styles.dim]}
    >
      <Text style={styles.primaryText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ClubScreen({ clubId }: { clubId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, userId } = useAuth();
  const signedIn = status === "signedIn";
  const account = signedIn ? userId : null; // 계정이 바뀌면 다시 읽는다(is_host·my_participation·mine)
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [comments, setComments] = useState<ClubComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<{ text: string; retry: (() => void) | null } | null>(null);
  const [restrictedUntil, setRestrictedUntil] = useState<string | null>(null); // "" = 기간 없음
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState("");
  const [commentWarn, setCommentWarn] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const moderating = useRef(false);
  const sending = useRef(false);
  const commentSending = useRef(false);
  const commentRequestId = useRef<string>(Crypto.randomUUID());
  const runner = useMemo(() => createLatestRunner(), []);
  const listGen = useRef(0); // 다시 읽을 때마다 올려 진행 중인 "댓글 더 보기"를 버린다
  const loadingMore = useRef(false);
  const focusedOnce = useRef(false);

  const reload = useCallback(async () => {
    listGen.current += 1;
    loadingMore.current = false;
    const res = await runner.run(async (signal) =>
      Promise.all([fetchClub(clubId, signal), fetchClubComments(clubId, null, signal)])
    );
    if (res.status === "stale") return; // 다른 모임으로 옮긴 뒤 늦게 온 응답은 버린다(C6 늦은 응답)
    if (res.status === "error") {
      const e = res.error;
      setLoad(e instanceof ApiCallError && e.status === 404 ? { state: "notfound" } : { state: "error" });
      return;
    }
    const [club, page] = res.value;
    setLoad({ state: "ok", club });
    setComments(page.items);
    setNextCursor(page.next_cursor);
  }, [clubId, runner, account]); // account가 바뀌면 새 함수 → 아래 효과가 지금 계정으로 다시 읽는다

  useEffect(() => {
    // 처음 열 때·계정이 바뀔 때: 앞 계정의 응답·메뉴·안내를 버리고 지금 계정으로 다시 읽는다
    setLoad({ state: "loading" });
    setDialog(null);
    setActionError(null);
    setRestrictedUntil(null);
    setComments([]);
    setNextCursor(null);
    void reload();
    return () => runner.cancel();
  }, [reload, runner]);

  // 제한 중이면 열자마자 참가 버튼 자리·댓글 칸에 안내(K2-O4). 실패하면 조용히 넘기고 누를 때 서버 응답으로 안내한다
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchMyRestrictions()
      .then((items) => {
        const until = activeRestrictionUntil(items);
        if (alive && until !== null) setRestrictedUntil(until);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn, account]);

  // 고치기 화면 등에서 돌아오면 새 시각·장소로 다시 읽는다(처음 포커스는 위에서 이미 읽음)
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void reloadRef.current(); // 계정이 바뀌어 reload가 새로 생겨도 여기서는 다시 부르지 않는다(위 효과가 읽음)
    }, [])
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  async function act(task: () => Promise<Club>, failedText: string, retry: () => void) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const club = await task();
      setLoad({ state: "ok", club });
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 403 && e.code === "PARTICIPATION_RESTRICTED") {
        setRestrictedUntil(e.detail);
        await reload();
      } else if (e instanceof ApiCallError && (e.status === 409 || e.status === 404)) {
        await reload(); // 자리 참·마감·시작됨: 다시 그리고 버튼 자리 문구로(C3)
      } else {
        setActionError({ text: failedText, retry }); // 끊김: 정보·명단·댓글은 그대로
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const doJoin = () => void act(() => joinClub(clubId), CLUB_TEXT.joinFailed, doJoin);
  const doLeave = () => void act(() => leaveClub(clubId), CLUB_TEXT.leaveFailed, doLeave);

  async function loadMoreComments() {
    if (!nextCursor || loadingMore.current) return; // 같은 커서 연타는 한 번만
    loadingMore.current = true;
    const gen = listGen.current;
    try {
      const page = await fetchClubComments(clubId, nextCursor);
      if (gen !== listGen.current) return; // 그사이 다시 읽었으면 늦은 쪽을 버린다
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {
      /* 더 보기 실패는 그대로 두고 다시 누를 수 있게 한다 */
    } finally {
      if (gen === listGen.current) loadingMore.current = false;
    }
  }

  async function sendComment() {
    const text = draft.trim();
    if (!text || commentSending.current) return;
    if (text.length > COMMENT_MAX) {
      setCommentWarn(CLUB_TEXT.commentTooLong);
      return;
    }
    commentSending.current = true;
    setCommentBusy(true);
    setCommentWarn(null);
    try {
      const item = await postClubComment(clubId, text, commentRequestId.current);
      commentRequestId.current = Crypto.randomUUID();
      setDraft("");
      setComments((prev) => (prev.some((c) => c.id === item.id) ? prev : [...prev, item]));
    } catch (e) {
      if (e instanceof ApiCallError && e.code === "PARTICIPATION_RESTRICTED") setRestrictedUntil(e.detail);
      else setCommentWarn(e instanceof ApiCallError && e.status === 422 ? CLUB_TEXT.commentTooLong : CLUB_TEXT.commentFailed);
    } finally {
      commentSending.current = false;
      setCommentBusy(false);
    }
  }

  async function confirmDialog() {
    const d = dialog;
    if (!d) return;
    if (d.kind === "leave") {
      setDialog(null);
      doLeave();
    } else if (d.kind === "close") {
      setDialog(null);
      void act(() => closeClub(clubId), CLUB_TEXT.failed, () => setDialog({ kind: "close" }));
    } else if (d.kind === "cancel") {
      const why = reason.trim();
      if (!why) return;
      setDialog(null);
      void act(() => cancelClub(clubId, why), CLUB_TEXT.failed, () => setDialog({ kind: "cancel" }));
    } else if (d.kind === "moderation") {
      const why = reason.trim();
      if (!why || moderating.current) return;
      moderating.current = true;
      setDialog(null);
      try {
        const res = await requestCommentModeration(d.comment.id, why);
        setNotice(res.alreadyRequested ? CLUB_TEXT.moderationAgain : CLUB_TEXT.moderationDone); // 댓글은 그대로 둔다
      } catch {
        setActionError({ text: CLUB_TEXT.moderationFailed, retry: () => setDialog({ kind: "moderation", comment: d.comment }) });
      } finally {
        moderating.current = false;
      }
    } else if (d.kind === "deleteComment") {
      setDialog(null);
      try {
        await deleteClubComment(d.comment.id);
        setComments((prev) => prev.filter((c) => c.id !== d.comment.id));
      } catch (e) {
        if (e instanceof ApiCallError && e.status === 404) setComments((prev) => prev.filter((c) => c.id !== d.comment.id));
        else setActionError({ text: CLUB_TEXT.commentDeleteFailed, retry: null });
      }
    }
  }

  const head = (club: Club | null) => (
    <View style={[styles.head, { paddingTop: 10 + insets.top }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} hitSlop={10}>
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <Text style={styles.headTitle} numberOfLines={1}>
        {CLUB_TEXT.header}
      </Text>
      {club?.is_host && club.status !== "canceled" && club.status !== "ended" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="모임 메뉴"
          testID="club-host-menu"
          onPress={() => setDialog({ kind: "menu" })}
          hitSlop={10}
        >
          <Text style={styles.more}>⋯</Text>
        </Pressable>
      ) : (
        <View style={styles.headSide} />
      )}
    </View>
  );

  if (load.state !== "ok") {
    return (
      <View style={styles.root}>
        {head(null)}
        <View style={styles.center}>
          {load.state === "loading" ? <ActivityIndicator color={C.inkStrong} /> : null}
          {load.state === "notfound" ? <Text style={styles.body}>{CLUB_TEXT.notFound}</Text> : null}
          {load.state === "error" ? (
            <>
              <Text style={styles.body}>{CLUB_TEXT.loadFailed}</Text>
              <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.secondary}>
                <Text style={styles.secondaryText}>{CLUB_TEXT.retry}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const club = load.club;
  const when = formatClubWhen(club.starts_at, club.ends_at);
  const untilText = restrictedUntil ? CLUB_TEXT.restrictedUntil(restrictedUntil) : "";
  const restrictedLabel = restrictedUntil === null ? null : CLUB_TEXT.restricted + untilText;
  const commentRestrictedLabel = restrictedUntil === null ? null : CLUB_TEXT.commentRestricted + untilText;
  const isFull = club.capacity !== null && club.participant_count >= club.capacity && club.my_participation !== "joined";

  return (
    <View style={styles.root}>
      {head(club)}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="club-scroll">
        <View style={styles.info} testID="club-info">
          {club.book ? <View style={styles.cover} /> : null}
          <View style={styles.flex}>
            <Text style={styles.name}>{club.name}</Text>
            {club.book ? <Text style={styles.line}>{club.book.title}</Text> : null}
            <Text style={styles.line}>
              {when ? `${when.day} ${when.time}` : `${CLUB_TEXT.undecidedDay} · ${CLUB_TEXT.undecidedNote}`}
            </Text>
            <Text style={styles.line}>{club.place ?? CLUB_TEXT.undecidedPlace}</Text>
            <Text style={styles.line}>
              {`${CLUB_TEXT.count(club)} · ${CLUB_TEXT.host(club.host_nickname)}`}
            </Text>
            {club.intro ? <Text style={styles.intro}>{club.intro}</Text> : null}
          </View>
        </View>

        <MainButton
          club={club}
          signedIn={signedIn}
          busy={busy}
          restrictedLabel={restrictedLabel}
          onJoin={doJoin}
          onLeave={() => setDialog({ kind: "leave" })}
          onLogin={() => setDialog({ kind: "login" })}
          onRecord={() => router.push(`/clubs/${clubId}/record`)}
        />
        {isFull && club.status === "open" ? <Text style={styles.note}>{CLUB_TEXT.fullNote}</Text> : null}
        {club.status === "canceled" && club.cancel_reason ? (
          <View style={styles.msg} testID="club-cancel-reason">
            <Text style={styles.msgTitle}>{CLUB_TEXT.cancelReason}</Text>
            <Text style={styles.body}>{club.cancel_reason}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={styles.msg} accessibilityRole="alert" testID="club-notice">
            <Text style={styles.body}>{notice}</Text>
          </View>
        ) : null}
        {actionError ? (
          <View style={styles.msg} accessibilityRole="alert" testID="club-action-error">
            <Text style={styles.body}>{actionError.text}</Text>
            {actionError.retry ? (
              <Pressable accessibilityRole="button" onPress={actionError.retry} style={styles.secondary}>
                <Text style={styles.secondaryText}>{CLUB_TEXT.retry}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sec} testID="club-participants-title">
          {CLUB_TEXT.participants(club.participant_count)}
        </Text>
        {club.participants.length === 0 ? (
          <Text style={styles.empty}>{CLUB_TEXT.emptyParticipants}</Text>
        ) : (
          <View style={styles.who}>
            {club.participants.map((p, i) => (
              <View key={`${p.nickname}-${i}`} style={styles.pill}>
                <Text style={styles.pillText}>{p.is_me ? CLUB_TEXT.me : p.nickname}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sec} testID="club-comments-title">
          {CLUB_TEXT.comments(comments.length)}
        </Text>
        {comments.length === 0 ? <Text style={styles.empty}>{CLUB_TEXT.emptyComments}</Text> : null}
        {comments.map((m) => (
          <View key={m.id} style={styles.comment} testID={`club-comment-${m.id}`}>
            <View style={styles.flex}>
              <Text style={styles.commentMeta}>{m.author_nickname}</Text>
              <Text style={styles.body}>{m.body}</Text>
            </View>
            {m.mine || club.is_host ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="댓글 메뉴"
                testID={`club-comment-menu-${m.id}`}
                onPress={() => {
                  if (m.mine) return setDialog({ kind: "deleteComment", comment: m });
                  setReason(""); // 만든 사람만: 남의 댓글 처리 요청(K2-9)
                  setDialog({ kind: "moderation", comment: m });
                }}
                hitSlop={8}
              >
                <Text style={styles.more}>⋯</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {nextCursor ? (
          <Pressable accessibilityRole="button" onPress={() => void loadMoreComments()} style={styles.secondary}>
            <Text style={styles.secondaryText}>{CLUB_TEXT.moreComments}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.commentBar, { paddingBottom: 10 + insets.bottom }]}>
        {commentWarn ? (
          <Text style={styles.warn} accessibilityRole="alert">
            {commentWarn}
          </Text>
        ) : null}
        {!signedIn ? (
          <Pressable accessibilityRole="button" onPress={() => setDialog({ kind: "login" })} style={styles.commentInput}>
            <Text style={styles.placeholder}>{CLUB_TEXT.loginToComment}</Text>
          </Pressable>
        ) : commentRestrictedLabel ? (
          <View style={styles.commentInput} testID="club-comment-restricted">
            <Text style={styles.placeholder}>{commentRestrictedLabel}</Text>
          </View>
        ) : (
          <View style={styles.commentRow}>
            <TextInput
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                if (commentWarn) setCommentWarn(null);
              }}
              placeholder={CLUB_TEXT.commentPlaceholder}
              placeholderTextColor={C.inkMuted}
              maxLength={COMMENT_MAX}
              style={[styles.commentInput, styles.flex]}
              accessibilityLabel={CLUB_TEXT.commentPlaceholder}
              testID="club-comment-input"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: commentBusy }}
              onPress={() => void sendComment()}
              style={({ pressed }) => [styles.send, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{CLUB_TEXT.commentSend}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ClubDialog
        dialog={dialog}
        reason={reason}
        onReason={setReason}
        onClose={() => setDialog(null)}
        onConfirm={() => void confirmDialog()}
        onMenu={(kind) => {
          if (kind === "edit") {
            setDialog(null);
            router.push({ pathname: "/clubs/new", params: { clubId } });
          } else {
            setReason("");
            setDialog({ kind });
          }
        }}
        onLogin={() => {
          setDialog(null);
          // 로그인 뒤 같은 모임으로 돌아오기(예외 #4). login.tsx가 returnTo를 읽는 것은 D 판단 대기(TODO(연결): D)
          router.push({ pathname: "/login", params: { returnTo: `/clubs/${clubId}` } });
        }}
      />
    </View>
  );
}

/** 확인창·만든 사람 메뉴·로그인 창(K1-O7·K1-O8·예외 #4) */
function ClubDialog({
  dialog,
  reason,
  onReason,
  onClose,
  onConfirm,
  onMenu,
  onLogin,
}: {
  dialog: Dialog;
  reason: string;
  onReason(v: string): void;
  onClose(): void;
  onConfirm(): void;
  onMenu(kind: "edit" | "close" | "cancel"): void;
  onLogin(): void;
}) {
  if (!dialog) return null;
  let body: React.ReactNode;
  if (dialog.kind === "menu") {
    body = (
      <>
        <MenuRow label={CLUB_TEXT.menuEdit} onPress={() => onMenu("edit")} />
        <MenuRow label={CLUB_TEXT.menuClose} onPress={() => onMenu("close")} />
        <MenuRow label={CLUB_TEXT.menuCancel} onPress={() => onMenu("cancel")} />
        <SheetButtons cancel={CLUB_TEXT.close} onCancel={onClose} />
      </>
    );
  } else if (dialog.kind === "login") {
    body = (
      <>
        <Text style={styles.sheetTitle}>{CLUB_TEXT.loginTitle}</Text>
        <Text style={styles.body}>{CLUB_TEXT.loginBody}</Text>
        <SheetButtons cancel={CLUB_TEXT.close} onCancel={onClose} confirm={CLUB_TEXT.login} onConfirm={onLogin} />
      </>
    );
  } else if (dialog.kind === "cancel" || dialog.kind === "moderation") {
    const empty = reason.trim().length === 0;
    const mod = dialog.kind === "moderation";
    body = (
      <>
        <Text style={styles.sheetTitle}>{mod ? CLUB_TEXT.moderationTitle : CLUB_TEXT.cancelConfirm}</Text>
        <TextInput
          value={reason}
          onChangeText={onReason}
          placeholder={mod ? CLUB_TEXT.moderationPlaceholder : CLUB_TEXT.cancelPlaceholder}
          placeholderTextColor={C.inkMuted}
          maxLength={REASON_MAX}
          multiline
          style={styles.reason}
          accessibilityLabel={mod ? CLUB_TEXT.moderationPlaceholder : CLUB_TEXT.cancelPlaceholder}
          testID={mod ? "club-moderation-reason-input" : "club-cancel-reason-input"}
        />
        <SheetButtons
          cancel={CLUB_TEXT.close}
          onCancel={onClose}
          confirm={mod ? CLUB_TEXT.moderationSend : CLUB_TEXT.cancelDo}
          onConfirm={onConfirm}
          disabled={empty}
        />
      </>
    );
  } else {
    const [title, keep, go] =
      dialog.kind === "leave"
        ? [CLUB_TEXT.leaveConfirm, CLUB_TEXT.leaveKeep, CLUB_TEXT.leave]
        : dialog.kind === "close"
          ? [CLUB_TEXT.closeConfirm, CLUB_TEXT.close, CLUB_TEXT.closeDo]
          : [CLUB_TEXT.commentDeleteConfirm, CLUB_TEXT.close, CLUB_TEXT.commentDelete];
    body = (
      <>
        <Text style={styles.sheetTitle}>{title}</Text>
        <SheetButtons cancel={keep} onCancel={onClose} confirm={go} onConfirm={onConfirm} />
      </>
    );
  }
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID={`club-dialog-${dialog.kind}`}>
          {body}
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuRow}>
      <Text style={styles.menuText}>{label}</Text>
    </Pressable>
  );
}

function SheetButtons({
  cancel,
  onCancel,
  confirm,
  onConfirm,
  disabled,
}: {
  cancel: string;
  onCancel(): void;
  confirm?: string;
  onConfirm?(): void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.secondary, styles.flex]}>
        <Text style={styles.secondaryText}>{cancel}</Text>
      </Pressable>
      {confirm ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !!disabled }}
          disabled={disabled}
          onPress={onConfirm}
          style={({ pressed }) => [styles.primary, styles.flex, styles.noTop, pressed && ACT.primaryPressed, disabled && styles.dim]}
        >
          <Text style={styles.primaryText}>{confirm}</Text>
        </Pressable>
      ) : null}
    </View>
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
  more: { fontSize: 20, color: C.text, paddingHorizontal: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  info: { ...cardSurface(), padding: 12, flexDirection: "row", gap: 12 },
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
  intro: { fontSize: 14, color: C.text, marginTop: 8, lineHeight: 20 },
  primary: { ...ACT.primary, borderRadius: theme.radii.control, minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: 8, paddingHorizontal: 16 },
  primaryText: { ...ACT.primaryText, fontSize: 15, fontWeight: "500" },
  noTop: { marginTop: 0 },
  secondary: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  secondaryText: { ...ACT.secondaryText, fontSize: 14, fontWeight: "500" },
  dim: { opacity: 0.55 },
  note: { fontSize: 13, color: C.textSub },
  msg: { ...cardSurface(), padding: 12, gap: 8 },
  msgTitle: { ...T.gauge },
  body: { fontSize: 14, color: C.text, lineHeight: 20 },
  sec: { ...T.gauge, marginTop: 16 },
  empty: { fontSize: 14, color: C.textSub },
  who: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { backgroundColor: C.panelLit, borderRadius: theme.radii.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.seamHairline },
  pillText: { fontSize: 13, color: C.text },
  comment: { ...cardSurface(), padding: 10, flexDirection: "row", gap: 8 },
  commentMeta: { fontSize: 12, color: C.inkMuted, marginBottom: 2 },
  commentBar: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: panel.backgroundColor, borderTopWidth: 1, borderColor: panel.borderColor, gap: 6 },
  commentRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  commentInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    paddingHorizontal: 12,
    justifyContent: "center",
    fontSize: 14,
    color: C.text,
  },
  placeholder: { fontSize: 14, color: C.inkMuted },
  send: { ...ACT.secondary, borderRadius: theme.radii.control, minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  warn: { fontSize: 13, color: C.text },
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
  menuRow: { minHeight: 48, justifyContent: "center" },
  menuText: { fontSize: 16, color: C.text },
  reason: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    padding: 12,
    fontSize: 15,
    color: C.text,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: 10 },
});
