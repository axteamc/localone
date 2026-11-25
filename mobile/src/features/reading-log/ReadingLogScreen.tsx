// 독서 기록 탭 = 내 책장 (reading-log.md READ-1 R1-O1·C3·C6 + READ-2 R2-O1·R2-O2·R2-O3·R2-O5·C3·C6)
// 표지 면, 한 줄 3권, 한 달 = 한 줄(넘치면 그 달 안에서 줄바꿈), 최근 읽은 책이 위·왼쪽.
// 책을 누르면 책장 위 카드 → "기록 자세히 보기". 오른쪽 아래 떠 있는 +(지름 38)로 쓰기 화면.
// READ-2: 머리(고정) "독서 기록" · "전체 ⇄"/"도서관별 ⇄". 숫자 줄은 책장과 같이 스크롤.
// 도서관별 보기 = 도서관마다 한 줄(이름표 + 최근 9권 가로 줄, 바닥선 = 도서관 색). 이름표 › → 그 도서관 책장.
// 설정 버튼 순서 메뉴·꾹 눌러 자리 바꾸기는 별도 계약 승인 대기(READ-2 계약 머리말) — 그리지 않는다.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useAuth } from "../../auth/AuthProvider";
import { GlassArrows, useHorizontalScroll } from "../../lib/HorizontalArrows";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import { CUBE_PALETTE } from "../../theme/tokens";
import { APP_MAX_WIDTH, isDesktopPointer } from "../../theme/WebFrame";
import { paletteIndexOf } from "../library-visit/direction";
import { ApiCallError, deleteReadingLog, fetchReadingLogs, shelfDate, shelfStore, type ReadingLog, type ReadingStats, type ReadingStatsLibrary } from "./api";
import { ConfirmDialog, Cover, TEXT as EDITOR_TEXT, Toast, monthDay, styles as base } from "./ReadingLogEditor";
import { useReadingLogs } from "./useReadingLogs";
import { BackChevron } from "../../theme/ScreenHeader";

export const TEXT = {
  title: "독서 기록",
  write: "기록 쓰기",
  emptyTitle: "아직 꽂힌 책이 없어요.",
  emptyBody: "오른쪽 아래 +를 눌러 첫 책을 꽂아 보세요.",
  loadFailed: "기록을 불러오지 못했어요.",
  retry: "다시 해 보기",
  open: "기록 자세히 보기",
  publish: "게시물로 올리기",
  viewPost: "올린 게시물 보기",
  edit: "수정",
  post: "게시",
  remove: "삭제",
  deleteTitle: "이 기록을 지울까요?",
  deleteBody: "지우면 되돌릴 수 없어요.",
  deleteKeepsPost: "올린 게시물은 그대로 남아요.",
  cancel: "취소",
  deleted: "기록을 지웠어요",
  deleteFailed: "지우지 못했어요. 다시 해 주세요.",
  close: "닫기",
  readOn: "읽은 날",
  library: "어디서",
  noLibrary: "도서관 없음",
  noDate: "적지 않음",
  // READ-2 C3
  toggleAll: "전체 ⇄",
  toggleLibraries: "도서관별 ⇄",
  toLibrariesA11y: "도서관별로 보기",
  toAllA11y: "전체로 보기",
  statsFailed: "숫자를 불러오지 못했어요",
  refresh: "새로고침",
  libEmptyTitle: "도서관에서 읽은 기록이 아직 없어요.",
  libEmptyBody: "기록을 쓸 때 도서관을 고르면 여기 꽂혀요.",
  rowFailed: "책을 불러오지 못했어요",
  back: "뒤로",
} as const;

export const statsText = (s: Pick<ReadingStats, "total" | "this_year" | "this_month">) =>
  `전체 ${s.total} · 올해 ${s.this_year} · 이번 달 ${s.this_month}`;

/** 이름표: 첫 줄만 최근 날짜(R2-O3), 둘째 줄부터 권수만 */
export const libraryTagText = (lib: ReadingStatsLibrary, first: boolean) =>
  first ? `${lib.name} ${lib.count}권 · 최근 ${monthDay(lib.last_read_on)} ›` : `${lib.name} ${lib.count}권 ›`;

/** 도서관 색 = 홈 큐브와 같은 팔레트 번호(같은 도서관 = 늘 같은 색) */
export const libraryColor = (libraryId: number) =>
  CUBE_PALETTE[paletteIndexOf(libraryId, CUBE_PALETTE.length)] ?? CUBE_PALETTE[0]!;

const PER_ROW = 4;
const ROW_MAX = 9; // R2-O1 도서관 한 줄 최대 9권
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 한 달 = 한 줄. 칸 이름은 영어 월(임시), 올해가 아니면 연도를 붙인다 */
export function groupByMonth(items: ReadingLog[], thisYear: string): { key: string; label: string; logs: ReadingLog[] }[] {
  const groups: { key: string; label: string; logs: ReadingLog[] }[] = [];
  for (const log of items) {
    const key = shelfDate(log).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const [y, m] = key.split("-");
      const name = MONTHS[Number(m) - 1] ?? m ?? "";
      group = { key, label: y === thisYear ? name : `${name} ${y}`, logs: [] };
      groups.push(group);
    }
    group.logs.push(log);
  }
  return groups;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type ShelfView = "all" | "libraries" | { libraryId: number; name: string; count: number };

const orderStorageKey = (owner: string) => `reading_log_order:${owner}`;

function applyOrder(items: ReadingLog[], orderIds: string[]): ReadingLog[] {
  if (orderIds.length === 0) return items;
  const rank = new Map(orderIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

type MenuAnchor = { x: number; y: number };

type BookTileProps = {
  log: ReadingLog;
  size: number;
  draggable?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onPress: () => void;
  onMenu?: (anchor: MenuAnchor) => void;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string) => void;
  onDrop?: (id: string) => void;
  onDragEnd?: () => void;
};

function anchorFromEvent(e: GestureResponderEvent): MenuAnchor {
  const native = e.nativeEvent as { pageX?: number; pageY?: number; clientX?: number; clientY?: number };
  return {
    x: native.clientX ?? native.pageX ?? 200,
    y: native.clientY ?? native.pageY ?? 200,
  };
}

function BookTile({
  log,
  size,
  draggable,
  isDragging,
  isDropTarget,
  onPress,
  onMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: BookTileProps) {
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<React.ComponentRef<typeof View>>(null);
  const moreRef = useRef<React.ComponentRef<typeof View>>(null);
  const web = Platform.OS === "web";

  useEffect(() => {
    if (!web) return;
    const node = wrapRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== "function") return;
    const handleEnter = () => setHovered(true);
    const handleLeave = () => setHovered(false);
    node.addEventListener("mouseenter", handleEnter);
    node.addEventListener("mouseleave", handleLeave);
    if (!draggable) {
      return () => {
        node.removeEventListener("mouseenter", handleEnter);
        node.removeEventListener("mouseleave", handleLeave);
      };
    }
    node.draggable = true;
    const handleStart = (e: DragEvent) => {
      e.dataTransfer?.setData("text/plain", log.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      onDragStart?.(log.id);
    };
    const handleOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      onDragOver?.(log.id);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      onDrop?.(log.id);
    };
    const handleEnd = () => onDragEnd?.();
    node.addEventListener("dragstart", handleStart);
    node.addEventListener("dragover", handleOver);
    node.addEventListener("drop", handleDrop);
    node.addEventListener("dragend", handleEnd);
    return () => {
      node.draggable = false;
      node.removeEventListener("mouseenter", handleEnter);
      node.removeEventListener("mouseleave", handleLeave);
      node.removeEventListener("dragstart", handleStart);
      node.removeEventListener("dragover", handleOver);
      node.removeEventListener("drop", handleDrop);
      node.removeEventListener("dragend", handleEnd);
    };
  }, [web, draggable, log.id, onDragStart, onDragOver, onDrop, onDragEnd]);

  const openFromMore = (e: GestureResponderEvent) => {
    if (!onMenu) return;
    if (web) {
      const el = moreRef.current as unknown as HTMLElement | null;
      if (el && typeof el.getBoundingClientRect === "function") {
        const rect = el.getBoundingClientRect();
        onMenu({ x: rect.right, y: rect.bottom + 4 });
        return;
      }
    }
    onMenu(anchorFromEvent(e));
  };

  return (
    <View
      ref={wrapRef}
      style={[
        styles.tile,
        { width: size },
        isDragging && styles.tileDragging,
        isDropTarget && styles.tileDropTarget,
      ]}
    >
      <Pressable
        testID={`shelf-book-${log.id}`}
        accessibilityRole="button"
        accessibilityLabel={log.book.title}
        onPress={onPress}
        onLongPress={onMenu ? (e) => onMenu(anchorFromEvent(e)) : undefined}
        delayLongPress={320}
        style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
      >
        <View style={styles.tileCoverWrap}>
          <Cover book={log.book} size={size} />
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {log.book.title}
        </Text>
        {log.book.author ? (
          <Text style={styles.tileAuthor} numberOfLines={1}>
            {log.book.author}
          </Text>
        ) : null}
      </Pressable>
      {web && hovered && onMenu ? (
        <View ref={moreRef} style={styles.tileMoreWrap}>
          <Pressable
            testID={`shelf-more-${log.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${log.book.title} 메뉴`}
            onPress={openFromMore}
            hitSlop={6}
            style={({ pressed }) => [styles.tileMoreBtn, pressed && styles.tileMorePressed]}
          >
            <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <Circle cx={8} cy={3.5} r={1.6} fill={C.inkStrong} stroke={C.panelLit} strokeWidth={0.7} />
              <Circle cx={8} cy={8} r={1.6} fill={C.inkStrong} stroke={C.panelLit} strokeWidth={0.7} />
              <Circle cx={8} cy={12.5} r={1.6} fill={C.inkStrong} stroke={C.panelLit} strokeWidth={0.7} />
            </Svg>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function StatsLine({ stats, failed, onRefresh }: { stats: ReadingStats | null; failed: boolean; onRefresh: () => void }) {
  if (stats) {
    return (
      <Text testID="stats-line" style={[base.sub, styles.statLine]}>
        {"전체 "}<Text style={styles.statNum}>{stats.total}</Text>
        {" · 올해 "}<Text style={styles.statNum}>{stats.this_year}</Text>
        {" · 이번 달 "}<Text style={styles.statNum}>{stats.this_month}</Text>
      </Text>
    );
  }
  if (failed) {
    return (
      <View testID="stats-failed" style={styles.inlineFail}>
        <Text style={[base.sub, styles.inlineFailText]}>{TEXT.statsFailed}</Text>
        <RefreshButton onPress={onRefresh} />
      </View>
    );
  }
  return <View testID="stats-pending" style={styles.statPending} />;
}

function RefreshButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={TEXT.refresh}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [base.secondaryBtn, styles.refreshBtn, pressed && ACT.secondaryPressed]}
    >
      <Text style={[base.secondaryText, styles.refreshText]}>{`↻ ${TEXT.refresh}`}</Text>
    </Pressable>
  );
}

/** 도서관 줄 하나의 콘텐츠 높이(이름표 32 + 간격 8 + 표지 + 제목/저자 36 + 구분선 2). onLayout 전 폴백 계산에 쓴다 */
const libRowContentHeight = (coverSize: number) => 32 + 8 + Math.round(coverSize * 1.45) + 36 + 2;
/** 조회 실패한 도서관 줄의 콘텐츠 높이(이름표 32 + 간격 8 + 실패 영역 60 + 간격 8 + 바닥선 6) */
const LIB_ROW_FAIL_HEIGHT = 32 + 8 + 60 + 8 + 6;
/** 도서관 줄 사이 간격(styles.shelfPad.gap) */
const LIB_ROW_GAP = 18;
/** 도서관별 보기 맨 위(위 여백 16 + 숫자 줄 19 + 간격 18) */
const LIB_LIST_TOP = 16 + 19 + 18;
/** 화면 헤더 기본 최소 높이(styles.head.minHeight) */
const HEAD_MIN_HEIGHT = 52;
/** onLayout이 아직 없을 때 windowHeight에서 제외할 상단 내비·화면 헤더·하단 탭 바 추정 높이 */
const ESTIMATED_CHROME_HEIGHT = 164;

type RowLayout = { y: number; height: number };

/**
 * 도서관 한 줄: 화면에 보일 때(active) 그 도서관 #41 limit=9 한 번(P4).
 * 보기를 바꾸거나(언마운트) 화면 밖·다른 탭·상세로 떠나면(active=false) 받는 중인 요청을 끊는다(C6 연타). 숫자를 다시 받으면(stamp) 보일 때 다시 받는다
 */
function LibraryRow({
  lib,
  first,
  coverSize,
  active,
  stamp,
  onOpen,
  onPick,
  onRowLayout,
  onFailedChange,
}: {
  lib: ReadingStatsLibrary;
  first: boolean;
  coverSize: number;
  /** 지금 실제 스크롤 영역에 보이고 이 탭이 보이는 중 */
  active: boolean;
  /** 숫자(#46)를 다시 받으면 바뀌는 값 — 탭으로 돌아오면 보이는 줄부터 다시 받는다 */
  stamp: ReadingStats;
  onOpen: (lib: ReadingStatsLibrary) => void;
  onPick: (log: ReadingLog) => void;
  onRowLayout: (libraryId: number, layout: RowLayout) => void;
  onFailedChange: (libraryId: number, failed: boolean) => void;
}) {
  const [rows, setRows] = useState<{ items: ReadingLog[] | null; failed: boolean }>({ items: null, failed: false });
  const scroll = useHorizontalScroll(!!rows.items?.length); // 도서관별 가로 책 줄에도 유리 ‹ ›(2026-11-25 P2)
  const [tick, setTick] = useState(0);
  const loadedRef = useRef<{ tick: number; stamp: ReadingStats } | null>(null);
  useEffect(() => {
    onFailedChange(lib.library_id, rows.failed);
    return () => onFailedChange(lib.library_id, false);
  }, [lib.library_id, rows.failed, onFailedChange]);

  useEffect(() => {
    if (!active) return;
    const loaded = loadedRef.current;
    if (loaded && loaded.tick === tick && loaded.stamp === stamp) return; // 이미 받은 줄은 다시 보이게 돼도 그대로
    const ctrl = new AbortController();
    setRows((prev) => ({ items: prev.items, failed: false }));
    fetchReadingLogs({ libraryId: lib.library_id, limit: ROW_MAX }, ctrl.signal)
      .then((page) => {
        if (ctrl.signal.aborted) return;
        loadedRef.current = { tick, stamp };
        setRows({ items: page.items, failed: false });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRows({ items: null, failed: true });
      });
    return () => ctrl.abort();
  }, [active, lib.library_id, tick, stamp]);

  const color = libraryColor(lib.library_id);
  const tag = libraryTagText(lib, first);
  return (
    <View
      testID={`lib-row-${lib.library_id}`}
      style={styles.libRow}
      onLayout={(e) => {
        const { y, height } = e.nativeEvent.layout;
        if (height > 0) onRowLayout(lib.library_id, { y, height });
      }}
    >
      <Pressable
        testID={`lib-tag-${lib.library_id}`}
        accessibilityRole="button"
        accessibilityLabel={tag}
        onPress={() => onOpen(lib)}
        style={({ pressed }) => [styles.libTag, { backgroundColor: color.hex }, pressed && styles.slotPressed]}
      >
        <Text style={[styles.libTagText, { color: color.ink }]} numberOfLines={1}>{tag}</Text>
      </Pressable>
      {rows.failed ? (
        <View testID={`lib-row-failed-${lib.library_id}`} style={[styles.inlineFail, styles.rowFail]}>
          <Text style={[base.sub, styles.inlineFailText]}>{TEXT.rowFailed}</Text>
          <RefreshButton onPress={() => setTick((n) => n + 1)} />
        </View>
      ) : rows.items === null ? (
        <View style={[styles.rowPending, { height: Math.round(coverSize * 1.45) }]}>
          <ActivityIndicator accessibilityLabel="불러오는 중" />
        </View>
      ) : (
        <View>
        <ScrollView {...scroll.scrollProps} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
          {rows.items.map((log) => (
            <BookTile
              key={log.id}
              log={log}
              size={coverSize}
              onPress={() => onPick(log)}
            />
          ))}
        </ScrollView>
        <GlassArrows
          label={`${lib.name} 책 줄`}
          {...scroll.edges}
          centerY={Math.round(coverSize * 1.45) / 2}
          onMove={scroll.onMove}
        />
        </View>
      )}
      <View testID={`lib-plank-${lib.library_id}`} style={[styles.libDivider, { backgroundColor: color.hex }]} />
    </View>
  );
}

export function ReadingLogScreen() {
  const router = useRouter();
  const { status, userId } = useAuth();
  const owner = status === "signedIn" && userId ? userId : null;
  const logs = useReadingLogs();
  const navigation = useNavigation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // 이 탭이 지금 보이는가: 다른 탭·기록 화면으로 가면 도서관 줄의 받는 중인 요청을 끊는다(P4)
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  // 도서관별 보기의 현재 스크롤 영역과 각 줄의 실제 배치(헤더·탭 바 제외, 실패로 줄어든 높이 반영, 최대 스크롤 범위 누적 금지)
  const [screenWidth, setScreenWidth] = useState<number | null>(null);
  const [screenHeight, setScreenHeight] = useState<number | null>(null);
  const [headHeight, setHeadHeight] = useState<number | null>(null);
  const [libViewport, setLibViewport] = useState<{ top: number; height: number | null }>({ top: 0, height: null });
  const [rowLayouts, setRowLayouts] = useState<{ stamp: ReadingStats | null; map: Record<number, RowLayout> }>({ stamp: null, map: {} });
  const [failedRows, setFailedRows] = useState<Record<number, true>>({});
  const statsRef = useRef<ReadingStats | null>(null);
  statsRef.current = logs.stats;

  const onScreenLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0) setScreenWidth((prev) => (prev === w ? prev : w));
    if (h > 0) setScreenHeight((prev) => (prev === h ? prev : h));
  }, []);
  const onHeadLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setHeadHeight((prev) => (prev === h ? prev : h));
  }, []);
  const onRowLayout = useCallback((libraryId: number, layout: RowLayout) => {
    const stamp = statsRef.current;
    setRowLayouts((prev) => {
      const baseMap = prev.stamp === stamp ? prev.map : {};
      const cur = baseMap[libraryId];
      if (cur && cur.y === layout.y && cur.height === layout.height) return prev;
      return { stamp, map: { ...baseMap, [libraryId]: layout } };
    });
  }, []);
  const onFailedChange = useCallback((libraryId: number, failed: boolean) => {
    setFailedRows((prev) => {
      const has = Boolean(prev[libraryId]);
      if (has === failed) return prev;
      if (failed) return { ...prev, [libraryId]: true };
      const next = { ...prev };
      delete next[libraryId];
      return next;
    });
  }, []);

  const [viewState, setViewState] = useState<{ owner: string | null; view: ShelfView }>({ owner: null, view: "all" });
  const view: ShelfView = viewState.owner === owner ? viewState.view : "all";
  const [picked, setPicked] = useState<{ owner: string; log: ReadingLog } | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [zoneWidth, setZoneWidth] = useState<number | null>(null);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<{ log: ReadingLog; anchor: MenuAnchor } | null>(null);
  const [confirmDeleteLog, setConfirmDeleteLog] = useState<ReadingLog | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const deletingRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shelfNotice = shelfStore.get().notice;

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // 계정이 바뀌면 고른 카드·보기·스크롤 측정·순서를 초기화한다(C6 계정 바뀜)
  useEffect(() => {
    setPicked(null);
    setCollapsedMonths({});
    setMenuState(null);
    setConfirmDeleteLog(null);
    setDraggingId(null);
    setDropTargetId(null);
    setLibViewport({ top: 0, height: null });
    setRowLayouts({ stamp: null, map: {} });
    setFailedRows({});
    if (!owner) {
      setOrderIds([]);
      return;
    }
    let alive = true;
    AsyncStorage.getItem(orderStorageKey(owner))
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOrderIds(parsed.filter((x): x is string => typeof x === "string"));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [owner]);

  const orderedItems = useMemo(() => applyOrder(logs.items, orderIds), [logs.items, orderIds]);

  const persistReorder = useCallback(
    (fromId: string, toId: string) => {
      if (!owner || fromId === toId) return;
      const baseIds = orderedItems.map((l) => l.id);
      const fromIdx = baseIds.indexOf(fromId);
      const toIdx = baseIds.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...baseIds];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return;
      next.splice(toIdx, 0, moved);
      setOrderIds(next);
      void AsyncStorage.setItem(orderStorageKey(owner), JSON.stringify(next)).catch(() => undefined);
    },
    [owner, orderedItems]
  );

  const handleDeleteLog = async (target: ReadingLog) => {
    if (deletingRef.current || !owner) return;
    deletingRef.current = true;
    setDeletingBusy(true);
    try {
      await deleteReadingLog(target.id);
      setConfirmDeleteLog(null);
      shelfStore.remove(owner, target.id, TEXT.deleted);
      if (picked?.log.id === target.id) setPicked(null);
    } catch (err) {
      setConfirmDeleteLog(null);
      if (err instanceof ApiCallError && err.status === 404) {
        shelfStore.remove(owner, target.id, TEXT.deleted);
      } else {
        showToast(TEXT.deleteFailed);
      }
    } finally {
      deletingRef.current = false;
      setDeletingBusy(false);
    }
  };

  // 쓰기·지우기 뒤 책장으로 돌아오면 안내 한 번("저장했어요"·"기록을 지웠어요")
  useEffect(() => {
    if (!shelfNotice) return;
    const notice = shelfStore.takeNotice();
    if (!notice) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(notice);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, [shelfNotice]);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const goView = (next: ShelfView) => {
    setPicked(null);
    if (next === "libraries") {
      setLibViewport({ top: 0, height: null });
      setRowLayouts({ stamp: null, map: {} });
      setFailedRows({});
    }
    setViewState({ owner, view: next });
    logs.setFilter(typeof next === "object" ? next.libraryId : null);
  };

  // 카드: 전체 책장에서는 지워진 기록이면 닫는다(READ-1). 도서관 줄·한 도서관 책장에서는 고른 기록 그대로
  const activePicked =
    owner && picked && picked.owner === owner
      ? view === "all"
        ? (logs.items.find((l) => l.id === picked.log.id) ?? null)
        : picked.log
      : null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 240) logs.loadMore();
  };

  if (status === "loading") {
    return (
      <View style={[base.screen, base.center]}>
        <ActivityIndicator accessibilityLabel="불러오는 중" />
      </View>
    );
  }

  if (status !== "signedIn") {
    return (
      <View style={[base.screen, base.center]}>
        <Text style={T.gauge} numberOfLines={1}>SIGN IN REQUIRED</Text>
        <Text style={base.centerText}>{EDITOR_TEXT.loginNeeded}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={({ pressed }) => [base.primaryBtn, pressed && ACT.primaryPressed]}>
          <Text style={base.primaryText}>{EDITOR_TEXT.login}</Text>
        </Pressable>
      </View>
    );
  }

  const pick = (log: ReadingLog) => setPicked(userId ? { owner: userId, log } : null);
  const statsLine = <StatsLine stats={logs.stats} failed={logs.statsFailed} onRefresh={logs.retryStats} />;
  const thisYear = new Date().getFullYear().toString();
  // 가로 줄: 3권 + 다음 표지 약 10%가 화면 오른쪽 끝에 보이는 폭(R2-O1). 넓은 웹은 앱 칼럼 폭(480, WebFrame)으로 잰다
  const frameWidth = screenWidth ?? (isDesktopPointer() ? Math.min(windowWidth, APP_MAX_WIDTH) : windowWidth);
  const rowCover = Math.max(72, Math.min(132, Math.floor((frameWidth - 48 - 3 * GAP) / 3.1)));
  // 도서 영역(bookZone) 실제 측정 폭(스크롤바 폭 제외)으로 4권 폭을 계산해 1px도 벗어나지 않게 고정
  const innerZoneWidth = zoneWidth !== null ? Math.max(180, zoneWidth - 28 - 2) : Math.max(200, frameWidth - 32 - 28 - 20);
  const shelfCover = Math.max(52, Math.min(112, Math.floor((innerZoneWidth - (PER_ROW - 1) * GAP) / PER_ROW)));

  const toggleMonth = (key: string) =>
    setCollapsedMonths((prev) => ({ ...prev, [key]: !prev[key] }));

  const monthShelf = (items: ReadingLog[], withStats: boolean) => {
    const groups = groupByMonth(items, thisYear);
    return (
      <ScrollView testID="shelf" contentContainerStyle={styles.shelfPad} onScroll={onScroll} scrollEventThrottle={200}>
        {withStats ? statsLine : null}
        {groups.map((group) => {
          const collapsed = Boolean(collapsedMonths[group.key]);
          const rows = chunk(group.logs, PER_ROW);
          return (
            <View
              key={group.key}
              style={[styles.bookZone, collapsed && styles.bookZoneCollapsed]}
              onLayout={(e) => {
                const w = Math.floor(e.nativeEvent.layout.width);
                if (w > 0) setZoneWidth((prev) => (prev === w ? prev : w));
              }}
            >
              <Pressable
                testID={`month-head-${group.key}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                onPress={() => toggleMonth(group.key)}
                style={styles.monthHead}
              >
                <View style={styles.monthHeadLeft}>
                  <Text style={styles.monthLabel}>{group.label}</Text>
                  <Text style={styles.monthDot}>·</Text>
                  <Text style={styles.monthCount}>{group.logs.length}</Text>
                </View>
                <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                  <Path
                    d={collapsed ? "M3.5 5.5 L7 9 L10.5 5.5" : "M3.5 8.5 L7 5 L10.5 8.5"}
                    stroke={C.inkMuted}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>
              {!collapsed ? (
                <View style={styles.monthBody}>
                  {rows.map((row, ri) => {
                    const isLastRow = ri === rows.length - 1;
                    return (
                      <View key={`${group.key}-${ri}`} style={styles.shelfTier}>
                        <View style={styles.shelfRow}>
                          {row.map((log) => (
                            <BookTile
                              key={log.id}
                              log={log}
                              size={shelfCover}
                              draggable
                              isDragging={draggingId === log.id}
                              isDropTarget={dropTargetId === log.id && draggingId !== log.id}
                              onPress={() => pick(log)}
                              onMenu={(anchor) => setMenuState({ log, anchor })}
                              onDragStart={(id) => setDraggingId(id)}
                              onDragOver={(id) => setDropTargetId(id)}
                              onDrop={(targetId) => {
                                if (draggingId) persistReorder(draggingId, targetId);
                                setDraggingId(null);
                                setDropTargetId(null);
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDropTargetId(null);
                              }}
                            />
                          ))}
                        </View>
                        {!isLastRow ? <View style={styles.rowDivider} /> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
        {logs.moreLoading ? <ActivityIndicator accessibilityLabel="더 불러오는 중" /> : null}
      </ScrollView>
    );
  };

  const loadError = (
    <View style={[base.flex, base.center]}>
      <Text style={base.centerText}>{TEXT.loadFailed}</Text>
      <Pressable accessibilityRole="button" onPress={logs.reload} style={({ pressed }) => [base.secondaryBtn, pressed && ACT.secondaryPressed]}>
        <Text style={base.secondaryText}>{TEXT.retry}</Text>
      </Pressable>
    </View>
  );
  const spinner = (
    <View style={[base.flex, base.center]}>
      <ActivityIndicator accessibilityLabel="불러오는 중" />
    </View>
  );

  let head: React.ReactNode;
  let content: React.ReactNode;
  if (typeof view === "object") {
    // 권수는 다시 받은 숫자(#46)를 따른다(지우고 돌아오면 줄어든다). 그 도서관 기록이 모두 지워졌으면 0
    const liveCount = logs.stats ? (logs.stats.libraries.find((l) => l.library_id === view.libraryId)?.count ?? 0) : view.count;
    // 한 도서관 책장: ‹ · 이름 · n권 (본문은 전체 책장과 같은 한 달 한 줄 책장)
    head = (
      <View testID="reading-head" style={styles.head} onLayout={onHeadLayout}>
        <Pressable accessibilityRole="button" accessibilityLabel={TEXT.back} onPress={() => goView("libraries")} hitSlop={8} style={styles.backBtn}>
          <BackChevron color={C.inkStrong} />
        </Pressable>
        <Text style={[styles.headTitle, base.flex]} numberOfLines={1}>{view.name}</Text>
        <Text style={base.sub}>{`${liveCount}권`}</Text>
      </View>
    );
    content =
      logs.status === "error" && logs.items.length === 0
        ? loadError
        : logs.status === "loading"
          ? spinner
          : logs.status === "empty"
            ? (
              <View testID="shelf-empty" style={[base.flex, base.center]}>
                <Text style={base.sub}>{TEXT.libEmptyTitle}</Text>
              </View>
            )
            : monthShelf(orderedItems, false);
  } else {
    const isAll = view === "all";
    head = (
      <View testID="reading-head" style={styles.head} onLayout={onHeadLayout}>
        <Text style={[styles.headTitle, base.flex]} numberOfLines={1}>{TEXT.title}</Text>
        <Pressable
          testID="view-toggle"
          accessibilityRole="button"
          accessibilityLabel={isAll ? TEXT.toLibrariesA11y : TEXT.toAllA11y}
          onPress={() => goView(isAll ? "libraries" : "all")}
          style={({ pressed }) => [base.secondaryBtn, styles.toggleBtn, pressed && ACT.secondaryPressed]}
        >
          <Text style={[base.secondaryText, styles.toggleText]}>{isAll ? TEXT.toggleAll : TEXT.toggleLibraries}</Text>
        </Pressable>
      </View>
    );
    if (isAll) {
      if (logs.status === "error" && logs.items.length === 0) content = loadError;
      else if (logs.status === "loading") content = spinner;
      else if (logs.status === "empty") {
        content = (
          <ScrollView contentContainerStyle={[styles.shelfPad, styles.grow]}>
            {statsLine}
            <View testID="shelf-empty" style={[base.flex, base.center]}>
              <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
              <Text style={base.sub}>{TEXT.emptyBody}</Text>
            </View>
          </ScrollView>
        );
      } else content = monthShelf(orderedItems, true);
    } else {
      const libs = logs.stats?.libraries ?? null;
      const estimatedScrollHeight =
        screenHeight !== null
          ? Math.max(0, screenHeight - (headHeight ?? HEAD_MIN_HEIGHT))
          : Math.max(0, windowHeight - ESTIMATED_CHROME_HEIGHT);
      const viewportHeight = libViewport.height ?? estimatedScrollHeight;
      const viewTop = libViewport.top;
      const viewBottom = viewTop + viewportHeight;
      const rowContentH = libRowContentHeight(rowCover);
      const measuredMap = rowLayouts.stamp === logs.stats ? rowLayouts.map : {};
      let cursorY = LIB_LIST_TOP;
      const rowBounds = (libs ?? []).map((lib) => {
        const measured = measuredMap[lib.library_id];
        const estH = failedRows[lib.library_id] ? LIB_ROW_FAIL_HEIGHT : rowContentH;
        const top = measured ? measured.y : cursorY;
        const height = measured ? measured.height : estH;
        const bottom = top + height;
        cursorY = bottom + LIB_ROW_GAP;
        return { top, bottom };
      });
      content = (
        <ScrollView
          testID="library-shelf"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setLibViewport((prev) => (prev.height === h ? prev : { ...prev, height: h }));
          }}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement } = e.nativeEvent;
            const top = Math.max(0, contentOffset.y);
            const h = layoutMeasurement.height > 0 ? layoutMeasurement.height : null;
            setLibViewport((prev) => {
              const nextH = h ?? prev.height;
              return prev.top === top && prev.height === nextH ? prev : { top, height: nextH };
            });
          }}
          scrollEventThrottle={100}
          contentContainerStyle={[styles.shelfPad, styles.libPad, libs?.length === 0 && styles.grow]}>
          {statsLine}
          {libs === null ? (
            logs.statsFailed ? null : <ActivityIndicator accessibilityLabel="불러오는 중" />
          ) : libs.length === 0 ? (
            <View testID="library-empty" style={[base.flex, base.center]}>
              <Text style={styles.emptyTitle}>{TEXT.libEmptyTitle}</Text>
              <Text style={base.sub}>{TEXT.libEmptyBody}</Text>
            </View>
          ) : (
            libs.map((lib, i) => {
              const bounds = rowBounds[i]!;
              const visible = bounds.bottom > viewTop && bounds.top < viewBottom;
              return (
                <LibraryRow
                  key={`${owner}-${lib.library_id}`}
                  lib={lib}
                  first={i === 0}
                  coverSize={rowCover}
                  active={focused && visible}
                  stamp={logs.stats!}
                  onOpen={(l) => goView({ libraryId: l.library_id, name: l.name, count: l.count })}
                  onPick={pick}
                  onRowLayout={onRowLayout}
                  onFailedChange={onFailedChange}
                />
              );
            })
          )}
        </ScrollView>
      );
    }
  }

  return (
    <View testID="reading-screen" style={base.screen} onLayout={onScreenLayout}>
      {head}
      {view === "all" && logs.status === "error" && logs.items.length > 0 ? (
        <View testID="shelf-refresh-error" style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{TEXT.loadFailed}</Text>
          <Pressable accessibilityRole="button" onPress={logs.reload} style={({ pressed }) => [base.secondaryBtn, pressed && ACT.secondaryPressed]}>
            <Text style={base.secondaryText}>{TEXT.retry}</Text>
          </Pressable>
        </View>
      ) : null}
      {content}

      {activePicked ? (
        <View testID="shelf-card" style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={TEXT.close} onPress={() => setPicked(null)} hitSlop={8} style={styles.cardClose}>
            <Text style={base.headerX}>✕</Text>
          </Pressable>
          <View style={styles.cardRow}>
            <Cover book={activePicked.book} size={56} />
            <View style={base.flex}>
              <Text style={base.bookTitle} numberOfLines={2}>{activePicked.book.title}</Text>
              {activePicked.book.author ? <Text style={base.sub} numberOfLines={1}>{activePicked.book.author}</Text> : null}
              {activePicked.note ? <Text style={styles.noteLine} numberOfLines={1}>{activePicked.note.split("\n")[0]}</Text> : null}
            </View>
          </View>
          <Text style={base.sub}>{`${TEXT.readOn} · ${activePicked.read_on ? monthDay(activePicked.read_on) : TEXT.noDate}`}</Text>
          <Text style={base.sub}>{`${TEXT.library} · ${activePicked.library?.name ?? TEXT.noLibrary}`}</Text>
          <View style={styles.cardActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const id = activePicked.id;
                setPicked(null);
                router.push({ pathname: "/reading/[logId]", params: { logId: id } });
              }}
              style={({ pressed }) => [base.secondaryBtn, styles.cardBtn, pressed && ACT.secondaryPressed]}
            >
              <Text style={[base.secondaryText, styles.cardBtnText]}>{TEXT.open}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const { id, published_post_id: postId } = activePicked;
                setPicked(null);
                if (postId) {
                  router.push({ pathname: "/posts/[postId]", params: { postId } });
                } else {
                  router.push({ pathname: "/posts/new", params: { fromLog: id } });
                }
              }}
              style={({ pressed }) => [base.primaryBtn, styles.cardBtn, pressed && ACT.primaryPressed]}
            >
              <Text style={[base.primaryText, styles.cardBtnText]}>{activePicked.published_post_id ? TEXT.viewPost : TEXT.publish}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Pressable
        testID="reading-fab"
        accessibilityRole="button"
        accessibilityLabel={TEXT.write}
        onPress={() => router.push("/reading/new")}
        style={({ pressed }) => [styles.fab, pressed && ACT.primaryPressed]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {menuState ? (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuState(null)}>
          <Pressable style={styles.popoverScrim} onPress={() => setMenuState(null)}>
            <View
              testID="book-action-sheet"
              style={[
                styles.popoverMenu,
                {
                  top: Math.min(Math.max(12, menuState.anchor.y), Math.max(12, windowHeight - 150)),
                  left: Math.min(Math.max(12, menuState.anchor.x - POPOVER_W), Math.max(12, windowWidth - POPOVER_W - 12)),
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const id = menuState.log.id;
                  setMenuState(null);
                  router.push({ pathname: "/reading/[logId]", params: { logId: id, edit: "1" } });
                }}
                style={({ pressed }) => [styles.popoverRow, styles.popoverLine, pressed && ACT.secondaryPressed]}
              >
                <Text style={styles.popoverText}>{TEXT.edit}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const { id, published_post_id: postId } = menuState.log;
                  setMenuState(null);
                  if (postId) router.push({ pathname: "/posts/[postId]", params: { postId } });
                  else router.push({ pathname: "/posts/new", params: { fromLog: id } });
                }}
                style={({ pressed }) => [styles.popoverRow, styles.popoverLine, pressed && ACT.secondaryPressed]}
              >
                <Text style={styles.popoverText}>{menuState.log.published_post_id ? TEXT.viewPost : TEXT.post}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const target = menuState.log;
                  setMenuState(null);
                  setConfirmDeleteLog(target);
                }}
                style={({ pressed }) => [styles.popoverRow, pressed && ACT.secondaryPressed]}
              >
                <Text style={[styles.popoverText, base.dangerText]}>{TEXT.remove}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {confirmDeleteLog ? (
        <ConfirmDialog
          title={TEXT.deleteTitle}
          body={TEXT.deleteBody}
          extra={confirmDeleteLog.published_post_id ? TEXT.deleteKeepsPost : null}
          cancel={TEXT.cancel}
          confirm={deletingBusy ? "지우는 중…" : TEXT.remove}
          onCancel={() => setConfirmDeleteLog(null)}
          onConfirm={() => void handleDeleteLog(confirmDeleteLog)}
          danger
        />
      ) : null}

      <Toast text={toast} />
    </View>
  );
}

const GAP = 10;
const POPOVER_W = 128;
const C = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, minHeight: 52 },
  headTitle: { fontSize: 17, fontWeight: "500", color: C.inkStrong },
  toggleBtn: { minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 },
  toggleText: { fontSize: 13 },
  backBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 24, lineHeight: 26, color: C.inkStrong },
  statLine: { marginTop: -8 },
  statNum: { color: C.text },
  statPending: { height: 19, marginTop: -8 },
  inlineFail: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  inlineFailText: { flexShrink: 1 },
  refreshBtn: { minHeight: 32, paddingVertical: 4, paddingHorizontal: 10 },
  refreshText: { fontSize: 13 },
  emptyTitle: { fontSize: 16, color: C.text, fontWeight: "500" },
  grow: { flexGrow: 1 },
  shelfPad: { padding: 16, paddingBottom: 96, gap: 16 },
  libPad: { paddingRight: 0 },
  bookZone: {
    backgroundColor: C.panelLit,
    borderRadius: theme.radii.card,
    borderWidth: 1,
    borderColor: C.seamHairline,
    padding: 14,
    gap: 12,
  },
  bookZoneCollapsed: {
    borderRadius: theme.radii.control,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  monthHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
  },
  monthHeadLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  monthLabel: { ...T.gauge },
  monthDot: { ...T.gauge },
  monthCount: { ...T.gauge, fontWeight: "400", color: C.inkMuted },
  monthBody: { gap: 14 },
  shelfTier: { gap: 14 },
  shelfRow: { flexDirection: "row", gap: GAP, alignItems: "flex-start" },
  slot: { borderRadius: theme.radii.block },
  slotPressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  tile: { position: "relative", gap: 0 },
  tileDragging: { opacity: 0.45 },
  tileDropTarget: {
    borderRadius: theme.radii.infoCard,
    outlineWidth: 2,
    outlineColor: C.inkStrong,
    outlineStyle: "dashed",
  } as object,
  tileCoverWrap: {
    position: "relative",
    borderTopLeftRadius: theme.radii.bookCover[0],
    borderTopRightRadius: theme.radii.bookCover[1],
    borderBottomRightRadius: theme.radii.bookCover[2],
    borderBottomLeftRadius: theme.radii.bookCover[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.seamHairline,
    overflow: "hidden",
    boxShadow: `0 2px 6px 0 ${C.shadowAmbient}`,
  },
  tileMoreWrap: {
    position: "absolute",
    top: 4,
    right: 2,
    zIndex: 4,
  },
  tileMoreBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  tileMorePressed: { opacity: 0.55 },
  tileTitle: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: C.text, marginTop: 7 },
  tileAuthor: { fontSize: 11, lineHeight: 14, color: C.inkMuted, marginTop: 2 },
  rowDivider: { height: 1, backgroundColor: C.seamHairline },
  libDivider: { height: 1.5, marginRight: 16, opacity: 0.7 },
  popoverScrim: { flex: 1 },
  popoverMenu: {
    ...cardSurface(theme, { onPanel: true }),
    position: "absolute",
    width: POPOVER_W,
    overflow: "hidden",
    boxShadow: `0 6px 18px 0 ${C.shadowCast}`,
  },
  popoverRow: { minHeight: 38, justifyContent: "center", paddingHorizontal: 14 },
  popoverLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.seamHairline },
  popoverText: { fontSize: 13.5, fontWeight: "500", color: C.text },
  libRow: { gap: 10 },
  libTag: { alignSelf: "flex-start", maxWidth: "92%", minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: theme.radii.pill },
  libTagText: { fontSize: 13, fontWeight: "500" },
  hRow: { gap: GAP, paddingRight: 16, alignItems: "flex-start" },
  rowPending: { alignItems: "center", justifyContent: "center", marginRight: 16 },
  rowFail: { minHeight: 60, marginRight: 16 },
  libPlank: { marginRight: 16 },
  card: {
    ...cardSurface(theme, { onPanel: true }),
    position: "absolute",
    left: 16,
    right: 16,
    top: 16,
    padding: 14,
    gap: 6,
    zIndex: 15,
  },
  cardClose: { position: "absolute", right: 6, top: 6, minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center", zIndex: 1 },
  cardRow: { flexDirection: "row", gap: 12, paddingRight: 32 },
  noteLine: { fontSize: 14, color: C.inkSoft, marginTop: 4 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  cardBtn: { alignSelf: "flex-start", minHeight: 38, height: 38, paddingVertical: 0, paddingHorizontal: 14 },
  cardBtnText: { fontSize: 14 },
  fab: {
    ...ACT.primary,
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 38,
    height: 38,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  fabText: { ...ACT.primaryText, fontSize: 22, lineHeight: 24 },
  errorBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.seamHairline, backgroundColor: C.panelFrosted },
  errorBannerText: { flex: 1, fontSize: 13, color: C.inkSoft },
});
