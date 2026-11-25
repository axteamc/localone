// 방문 페이지 2열 메이슨리 피드(contracts/local-feed.md LOCAL-2 H1·H4·H10·H13).
// #32 혼합 피드(게시물·방명록·모임·스탬프)를 그린다. 불러오기·다음 쪽은 VisitScreen이 하고
// 여기서는 받은 목록 그리기·카드 메뉴(게시물 메뉴 / 내 방명록 지우기)·스탬프 카드 북마크(VISIT-4 V4-11)만 한다.
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import {
  ApiCallError,
  feedItemKey,
  isGuestbookItem,
  isPostItem,
  isStampItem,
  onPostReaction,
  onPostWithdrawn,
  onStampChanged,
  setStampBookmark,
  withdrawGuestbook,
  type FeedItem,
  type FeedPost,
  type GuestbookItem,
  type PostReactionPatch,
} from "./api";
import { FeedItemCard, isClubItem } from "./FeedItemCard";
import { GUESTBOOK_CARD_TEXT, GuestbookMenu, guestbookHeightRatio } from "./GuestbookCard";
import { cardHeightRatio, PostCard } from "./PostCard";
import { LoginPrompt, PostMenu } from "./PostMenu";
import { REPORT_TEXT, ReportedTarget, ReportSheet } from "./ReportSheet";
import { StampLoginSheet } from "./StampButton";
import { STAMP_CARD_TEXT, stampHeightRatio } from "./StampCard";

export const COLUMN_GAP = 12; // H13
const WITHDRAWN_TEXT = "내렸어요"; // LOCAL-1 ComposeScreen TEXT.withdrawn과 같은 문구

/** 짧은 쪽 열에 차례로 쌓는다(H13). 같은 입력이면 늘 같은 배치 */
export function splitColumns<T extends Pick<FeedPost, "image_kind" | "overlay_text">>(items: T[]): [T[], T[]] {
  return splitColumnsBy(items, cardHeightRatio);
}

function splitColumnsBy<T>(items: T[], ratio: (item: T) => number): [T[], T[]] {
  const cols: [T[], T[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const i = heights[1]! < heights[0]! ? 1 : 0;
    cols[i].push(item);
    heights[i]! += ratio(item);
  }
  return cols;
}

/** 혼합 피드 카드 높이 어림(너비 대비) */
export function feedItemHeightRatio(item: FeedItem): number {
  if (isPostItem(item)) return cardHeightRatio(item.post);
  if (isGuestbookItem(item)) return guestbookHeightRatio(item.guestbook);
  if (isClubItem(item)) return 1.0; // C-92 K1-O5a: 아치 없는 정보 카드
  if (isStampItem(item)) return stampHeightRatio(item.stamp);
  return 0;
}

function useCardWidth() {
  const window = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  const total = width ?? Math.max(0, window.width - 24); // 첫 그리기: 화면 폭 - 좌우 여백 12
  const cardWidth = Math.max(0, Math.floor((total - COLUMN_GAP) / 2));
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };
  return { cardWidth, onLayout };
}

export type MasonryGridProps = {
  items: FeedPost[];
  onPress(postId: string): void;
  onMenu?(post: FeedPost): void;
  testID?: string;
};

/** 2열 메이슨리. 상세 아래 이어지는 묶음(P4)도 같이 쓴다 */
export function MasonryGrid({ items, onPress, onMenu, testID }: MasonryGridProps) {
  const { cardWidth, onLayout } = useCardWidth();
  const [left, right] = useMemo(() => splitColumns(items), [items]);
  return (
    <View style={styles.grid} onLayout={onLayout} testID={testID}>
      {[left, right].map((col, i) => (
        <View key={i} style={[styles.column, { width: cardWidth }]}>
          {col.map((post) => (
            <ReportedTarget key={post.id} kind="post" id={post.id} width={cardWidth}>
              <PostCard post={post} width={cardWidth} onPress={onPress} onMenu={onMenu} />
            </ReportedTarget>
          ))}
        </View>
      ))}
    </View>
  );
}

/** 혼합 피드 2열 메이슨리(V3-O4: 방명록도 게시물과 같은 한 칸) */
function FeedItemGrid({
  items,
  onOpenPost,
  onMenu,
  onToggleStampBookmark,
}: {
  items: FeedItem[];
  onOpenPost(postId: string): void;
  onMenu(item: FeedItem): void;
  onToggleStampBookmark(stampId: string, next: boolean): void;
}) {
  const { cardWidth, onLayout } = useCardWidth();
  const [left, right] = useMemo(() => splitColumnsBy(items, feedItemHeightRatio), [items]);
  return (
    <View style={styles.grid} onLayout={onLayout}>
      {[left, right].map((col, i) => (
        <View key={i} style={[styles.column, { width: cardWidth }]}>
          {col.map((item) => {
            const card = (
              <FeedItemCard
                key={feedItemKey(item)}
                item={item}
                width={cardWidth}
                onOpenPost={onOpenPost}
                onMenu={onMenu}
                onToggleStampBookmark={onToggleStampBookmark}
              />
            );
            const target = isPostItem(item) ? { kind: "post" as const, id: item.post.id }
              : isGuestbookItem(item) ? { kind: "guestbook" as const, id: item.guestbook.id }
              : isClubItem(item) ? { kind: "club" as const, id: item.club.id }
              : isStampItem(item) ? { kind: "stamp" as const, id: item.stamp.id } : null;
            return target ? (
              <ReportedTarget key={feedItemKey(item)} {...target} width={cardWidth}>
                {card}
              </ReportedTarget>
            ) : card;
          })}
        </View>
      ))}
    </View>
  );
}

export const INLINE_SHELF_AFTER = 4; // 첫 2행(4개 카드) 아래에 오늘의 서가 인라인 삽입

export type LibraryFeedProps = {
  items: FeedItem[];
  onNotice(text: string): void;
  /** 이미 사라진 방명록을 지우려 했을 때 첫 묶음을 다시 받는다(C6 타인·없는 글) */
  onReload?(): void;
  /** 피드 중간(INLINE_SHELF_AFTER개 뒤)에 끼워 넣는 인라인 섹션(오늘의 서가) */
  inlineSlot?: React.ReactNode;
  inlineAfter?: number;
};

export function LibraryFeed({ items, onNotice, onReload, inlineSlot, inlineAfter = INLINE_SHELF_AFTER }: LibraryFeedProps) {
  const router = useRouter();
  const { status, userId } = useAuth();
  const reportOwner = JSON.stringify([status, userId]);
  // 메뉴·상세에서 바꾼 좋아요·북마크. 필드 단위로 최신 상태에 합친다(①-1: 늦은 응답이 다른 필드를 덮지 않게)
  const [changed, setChanged] = useState<Record<string, PostReactionPatch>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set()); // 게시물 id(상세에서 내림)
  const [gone, setGone] = useState<Set<string>>(() => new Set()); // 지운 방명록 id
  const [report, setReport] = useState<{ kind: "guestbook" | "stamp"; id: string; owner: string } | null>(null);
  const [gbMenu, setGbMenu] = useState<GuestbookItem | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const withdrawingRef = useRef(false);
  const [stampMarks, setStampMarks] = useState<Record<string, boolean>>({}); // 스탬프 id → 바꾼 my_bookmark
  const [privateStamps, setPrivateStamps] = useState<Set<string>>(() => new Set()); // 나만 보기로 바꾼 내 스탬프 "도서관:id"
  const [stampLogin, setStampLogin] = useState(false);
  const stampBusy = useRef(new Set<string>());
  const authScopeRef = useRef({ status, userId, alive: true });
  authScopeRef.current.status = status;
  authScopeRef.current.userId = userId;
  useEffect(
    () => () => {
      authScopeRef.current.alive = false;
    },
    []
  );
  const shown = useMemo(
    () =>
      items.flatMap((item): FeedItem[] => {
        if (isPostItem(item)) {
          const p = item.post;
          if (hidden.has(p.id)) return [];
          return [changed[p.id] ? { kind: "post", post: { ...p, ...changed[p.id] } } : item];
        }
        if (isGuestbookItem(item)) return gone.has(item.guestbook.id) ? [] : [item];
        if (isClubItem(item)) return [item];
        if (isStampItem(item)) {
          const st = item.stamp;
          if (privateStamps.has(`${st.library_id}:${st.id}`)) return []; // 비공개로 바꾸면 바로 뺀다(V4-O2)
          return [st.id in stampMarks ? { kind: "stamp", stamp: { ...st, my_bookmark: stampMarks[st.id]! } } : item];
        }
        return []; // 모르는 종류는 그리지 않는다
      }),
    [items, changed, hidden, gone, stampMarks, privateStamps]
  );
  const posts = useMemo(() => shown.flatMap((i) => (isPostItem(i) ? [i.post] : [])), [shown]);
  const patch = useCallback(
    (id: string, next: PostReactionPatch) => setChanged((m) => ({ ...m, [id]: { ...m[id], ...next } })),
    []
  );

  // 상세에서 바꾼 공감·북마크를 돌아왔을 때 메뉴에 그대로 보인다(①-2)
  useEffect(() => onPostReaction(patch), [patch]);
  // 로그인 상태나 계정이 바뀌면 앞 사용자의 변경을 남기지 않는다
  useEffect(() => {
    setChanged({});
    setStampMarks({});
    setPrivateStamps(new Set());
  }, [status, userId]);

  // 내 스탬프 공개 여부를 바꾸면 카드를 바로 넣고 뺀다(V4-O1·V4-O2). 넣기는 VisitScreen의 #32 갱신이 한다
  useEffect(
    () =>
      onStampChanged((change) => {
        if (status !== "signedIn" || change.userId !== userId) return; // 지금 로그인한 사람의 것만
        const key = `${change.libraryId}:${change.stampId}`;
        setPrivateStamps((s) => {
          const next = new Set(s);
          if (change.visibility === "private") next.add(key);
          else next.delete(key);
          return next;
        });
      }),
    [status, userId]
  );

  // 스탬프 카드 북마크(V4-11): 비로그인이면 안내만, 연타는 한 번만. 성공한 뒤에만 아이콘을 바꾼다
  const toggleStampBookmark = async (stampId: string, next: boolean) => {
    if (status === "signedOut") {
      setStampLogin(true); // 서버를 부르지 않는다(V4-O4)
      return;
    }
    if (status !== "signedIn" || !userId) return;
    const reqUserId = userId;
    const busyKey = `${reqUserId}:${stampId}`;
    if (stampBusy.current.has(busyKey)) return;
    stampBusy.current.add(busyKey);
    const sameUser = () =>
      authScopeRef.current.alive &&
      authScopeRef.current.status === "signedIn" &&
      authScopeRef.current.userId === reqUserId;
    try {
      const res = await setStampBookmark(stampId, next);
      if (!sameUser()) return;
      setStampMarks((m) => ({ ...m, [stampId]: res.bookmarked }));
      onNotice(res.bookmarked ? STAMP_CARD_TEXT.saved : STAMP_CARD_TEXT.unsaved);
    } catch {
      if (!sameUser()) return;
      onNotice(STAMP_CARD_TEXT.saveFailed);
    } finally {
      stampBusy.current.delete(busyKey);
    }
  };

  // 상세에서 내린 글은 돌아왔을 때 바로 감추고 "내렸어요"(LOCAL-1 F16)
  useEffect(
    () =>
      onPostWithdrawn((id) => {
        setHidden((h) => new Set(h).add(id));
        onNotice(WITHDRAWN_TEXT);
      }),
    [onNotice]
  );
  const menuPost = menuFor ? posts.find((p) => p.id === menuFor) ?? null : null;

  // 내 방명록 지우기(V3-O6): 확인 뒤 한 번만. 실패하면 카드 그대로 + 한 줄 안내
  const withdraw = async (entry: GuestbookItem) => {
    if (withdrawingRef.current) return; // 연타: 한 번만 지운다(예외 #3)
    withdrawingRef.current = true;
    setWithdrawing(true);
    try {
      await withdrawGuestbook(entry.id);
      setGone((g) => new Set(g).add(entry.id));
      setGbMenu(null);
      onNotice(GUESTBOOK_CARD_TEXT.withdrawn);
    } catch (e) {
      setGbMenu(null);
      onNotice(GUESTBOOK_CARD_TEXT.withdrawFailed);
      if (e instanceof ApiCallError && e.status === 404) onReload?.(); // 이미 사라진 글: 첫 묶음 다시 받기
    } finally {
      withdrawingRef.current = false;
      setWithdrawing(false);
    }
  };

  const firstSlice = inlineSlot && shown.length > inlineAfter ? shown.slice(0, inlineAfter) : shown;
  const restSlice = inlineSlot && shown.length > inlineAfter ? shown.slice(inlineAfter) : [];

  const gridHandlers = {
    onOpenPost: (id: string) =>
      router.push({
        pathname: "/posts/[postId]",
        params: { postId: id, libraryId: String(posts.find((p) => p.id === id)?.library_id ?? "") },
      }),
    onMenu: (item: FeedItem) => {
      if (isPostItem(item)) setMenuFor(item.post.id);
      else if (isGuestbookItem(item)) setGbMenu(item.guestbook);
      // C-92: 남의 공개 스탬프(한마디)는 ⋯ → 바로 신고 창(로그인 확인은 신고 창이 한다)
      else if (isStampItem(item)) setReport({ kind: "stamp", id: item.stamp.id, owner: reportOwner });
    },
    onToggleStampBookmark: (id: string, next: boolean) => void toggleStampBookmark(id, next),
  };

  return (
    <View testID="library-feed">
      <FeedItemGrid items={firstSlice} {...gridHandlers} />
      {inlineSlot ?? null}
      {restSlice.length > 0 ? <FeedItemGrid items={restSlice} {...gridHandlers} /> : null}
      {menuPost ? (
        <PostMenu
          post={menuPost}
          signedIn={status === "signedIn"}
          authLoading={status === "loading"}
          onClose={() => setMenuFor(null)}
          onChange={patch}
          onNotice={onNotice}
          onLoginNeeded={() => setLogin(true)}
        />
      ) : null}
      {login ? <LoginPrompt onClose={() => setLogin(false)} /> : null}
      <StampLoginSheet visible={stampLogin} title={STAMP_CARD_TEXT.loginNeeded} onClose={() => setStampLogin(false)} />
      {gbMenu ? (
        <GuestbookMenu
          entry={gbMenu}
          busy={withdrawing}
          onClose={() => setGbMenu(null)}
          onWithdraw={(entry) => void withdraw(entry)}
          onReport={() => {
            setReport({ kind: "guestbook", id: gbMenu.id, owner: reportOwner });
            setGbMenu(null);
          }}
        />
      ) : null}
      {report?.owner === reportOwner ? (
        <ReportSheet
          target={{ kind: report.kind, id: report.id }}
          onClose={() => setReport(null)}
          onDone={() => { setReport(null); onNotice(REPORT_TEXT.done); }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  column: { gap: COLUMN_GAP },
});
