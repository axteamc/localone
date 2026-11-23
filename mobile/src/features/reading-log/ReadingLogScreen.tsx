// 독서 기록 탭 = 내 책장 (reading-log.md READ-1 R1-O1·C3·C6 + READ-2 R2-O1·R2-O2·R2-O3·R2-O5·C3·C6)
// 표지 면, 한 줄 3권, 한 달 = 한 줄(넘치면 그 달 안에서 줄바꿈), 최근 읽은 책이 위·왼쪽.
// 책을 누르면 책장 위 카드 → "기록 자세히 보기". 오른쪽 아래 떠 있는 +(지름 38)로 쓰기 화면.
// READ-2: 머리(고정) "독서 기록" · "전체 ⇄"/"도서관별 ⇄". 숫자 줄은 책장과 같이 스크롤.
// 도서관별 보기 = 도서관마다 한 줄(이름표 + 최근 9권 가로 줄, 바닥선 = 도서관 색). 이름표 › → 그 도서관 책장.
// 설정 버튼 순서 메뉴·꾹 눌러 자리 바꾸기는 별도 계약 승인 대기(READ-2 계약 머리말) — 그리지 않는다.
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import { CUBE_PALETTE } from "../../theme/tokens";
import { APP_MAX_WIDTH } from "../../theme/WebFrame";
import { paletteIndexOf } from "../library-visit/direction";
import { fetchReadingLogs, shelfDate, shelfStore, type ReadingLog, type ReadingStats, type ReadingStatsLibrary } from "./api";
import { Cover, TEXT as EDITOR_TEXT, Toast, monthDay, styles as base } from "./ReadingLogEditor";
import { useReadingLogs } from "./useReadingLogs";

export const TEXT = {
  title: "독서 기록",
  write: "기록 쓰기",
  emptyTitle: "아직 꽂힌 책이 없어요.",
  emptyBody: "오른쪽 아래 +를 눌러 첫 책을 꽂아 보세요.",
  loadFailed: "기록을 불러오지 못했어요.",
  retry: "다시 해 보기",
  open: "기록 자세히 보기",
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

const PER_ROW = 3;
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

/** 도서관 한 줄: 처음 보일 때 그 도서관 #41 limit=9 한 번. 보기를 바꾸거나 화면을 떠나면 abort(C6 연타) */
function LibraryRow({
  lib,
  first,
  coverSize,
  stamp,
  onOpen,
  onPick,
}: {
  lib: ReadingStatsLibrary;
  first: boolean;
  coverSize: number;
  /** 숫자(#46)를 다시 받으면 바뀌는 값 — 탭으로 돌아오면 줄도 다시 받는다 */
  stamp: ReadingStats;
  onOpen: (lib: ReadingStatsLibrary) => void;
  onPick: (log: ReadingLog) => void;
}) {
  const [rows, setRows] = useState<{ items: ReadingLog[] | null; failed: boolean }>({ items: null, failed: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setRows((prev) => ({ items: prev.items, failed: false }));
    fetchReadingLogs({ libraryId: lib.library_id, limit: ROW_MAX }, ctrl.signal)
      .then((page) => {
        if (!ctrl.signal.aborted) setRows({ items: page.items, failed: false });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRows({ items: null, failed: true });
      });
    return () => ctrl.abort();
  }, [lib.library_id, tick, stamp]);

  const color = libraryColor(lib.library_id);
  const tag = libraryTagText(lib, first);
  return (
    <View testID={`lib-row-${lib.library_id}`} style={styles.libRow}>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
          {rows.items.map((log) => (
            <Pressable
              key={log.id}
              testID={`shelf-book-${log.id}`}
              accessibilityRole="button"
              accessibilityLabel={log.book.title}
              onPress={() => onPick(log)}
              style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
            >
              <Cover book={log.book} size={coverSize} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View testID={`lib-plank-${lib.library_id}`} style={[styles.plank, styles.libPlank, { backgroundColor: color.hex }]} />
    </View>
  );
}

export function ReadingLogScreen() {
  const router = useRouter();
  const { status, userId } = useAuth();
  const owner = status === "signedIn" && userId ? userId : null;
  const logs = useReadingLogs();
  const { width: windowWidth } = useWindowDimensions();
  const [viewState, setViewState] = useState<{ owner: string | null; view: ShelfView }>({ owner: null, view: "all" });
  const view: ShelfView = viewState.owner === owner ? viewState.view : "all";
  const [picked, setPicked] = useState<{ owner: string; log: ReadingLog } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shelfNotice = shelfStore.get().notice;

  // 계정이 바뀌면 고른 카드·보기를 닫는다(C6 계정 바뀜)
  useEffect(() => {
    setPicked(null);
  }, [owner]);

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
  const statsLine = <StatsLine stats={logs.stats} failed={logs.statsFailed} onRefresh={logs.reload} />;
  const thisYear = new Date().getFullYear().toString();
  // 가로 줄: 3권 + 다음 표지 약 10%가 화면 오른쪽 끝에 보이는 폭(R2-O1). 넓은 웹은 앱 칼럼 폭(480, WebFrame)으로 잰다
  const frameWidth = Platform.OS === "web" ? Math.min(windowWidth, APP_MAX_WIDTH) : windowWidth;
  const rowCover = Math.max(72, Math.min(140, Math.floor((frameWidth - 16 - 3 * GAP) / 3.1)));

  const monthShelf = (items: ReadingLog[], withStats: boolean) => (
    <ScrollView testID="shelf" contentContainerStyle={styles.shelfPad} onScroll={onScroll} scrollEventThrottle={200}>
      {withStats ? statsLine : null}
      {groupByMonth(items, thisYear).map((group) => (
        <View key={group.key} style={styles.month}>
          <Text style={styles.monthLabel}>{group.label}</Text>
          {chunk(group.logs, PER_ROW).map((row, i) => (
            <View key={`${group.key}-${i}`} style={styles.shelfRow}>
              {row.map((log) => (
                <Pressable
                  key={log.id}
                  testID={`shelf-book-${log.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={log.book.title}
                  onPress={() => pick(log)}
                  style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
                >
                  <Cover book={log.book} size={COVER} />
                </Pressable>
              ))}
            </View>
          ))}
          <View style={styles.plank} />
        </View>
      ))}
      {logs.moreLoading ? <ActivityIndicator accessibilityLabel="더 불러오는 중" /> : null}
    </ScrollView>
  );

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
    // 한 도서관 책장: ‹ · 이름 · n권 (본문은 전체 책장과 같은 한 달 한 줄 책장)
    head = (
      <View testID="reading-head" style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={TEXT.back} onPress={() => goView("libraries")} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={[styles.headTitle, base.flex]} numberOfLines={1}>{view.name}</Text>
        <Text style={base.sub}>{`${view.count}권`}</Text>
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
            : monthShelf(logs.items, false);
  } else {
    const isAll = view === "all";
    head = (
      <View testID="reading-head" style={styles.head}>
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
      } else content = monthShelf(logs.items, true);
    } else {
      const libs = logs.stats?.libraries ?? null;
      content = (
        <ScrollView testID="library-shelf" contentContainerStyle={[styles.shelfPad, styles.libPad, libs?.length === 0 && styles.grow]}>
          {statsLine}
          {libs === null ? (
            logs.statsFailed ? null : <ActivityIndicator accessibilityLabel="불러오는 중" />
          ) : libs.length === 0 ? (
            <View testID="library-empty" style={[base.flex, base.center]}>
              <Text style={styles.emptyTitle}>{TEXT.libEmptyTitle}</Text>
              <Text style={base.sub}>{TEXT.libEmptyBody}</Text>
            </View>
          ) : (
            libs.map((lib, i) => (
              <LibraryRow
                key={`${owner}-${lib.library_id}`}
                lib={lib}
                first={i === 0}
                coverSize={rowCover}
                stamp={logs.stats!}
                onOpen={(l) => goView({ libraryId: l.library_id, name: l.name, count: l.count })}
                onPick={pick}
              />
            ))
          )}
        </ScrollView>
      );
    }
  }

  return (
    <View style={base.screen}>
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
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const id = activePicked.id;
              setPicked(null);
              router.push({ pathname: "/reading/[logId]", params: { logId: id } });
            }}
            style={({ pressed }) => [base.secondaryBtn, styles.cardBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={base.secondaryText}>{TEXT.open}</Text>
          </Pressable>
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
      <Toast text={toast} />
    </View>
  );
}

const COVER = 84;
const GAP = 14;
const C = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, minHeight: 52 },
  headTitle: { fontSize: 17, fontWeight: "500", color: C.inkStrong },
  toggleBtn: { minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 },
  toggleText: { fontSize: 13 },
  backBtn: { minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
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
  shelfPad: { padding: 16, paddingBottom: 96, gap: 18 },
  libPad: { paddingRight: 0 },
  month: { gap: 8 },
  monthLabel: { ...T.gauge },
  shelfRow: { flexDirection: "row", gap: GAP, alignItems: "flex-end" },
  slot: { borderRadius: theme.radii.block },
  slotPressed: { opacity: 0.8, transform: [{ translateY: 1 }] },
  plank: { height: 6, borderRadius: theme.radii.block, backgroundColor: C.surface3, boxShadow: `0 2px 0 0 ${C.reliefSideDark}` },
  libRow: { gap: 8 },
  libTag: { alignSelf: "flex-start", maxWidth: "92%", minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: theme.radii.pill },
  libTagText: { fontSize: 13, fontWeight: "500" },
  hRow: { gap: GAP, paddingRight: 16, alignItems: "flex-end" },
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
  cardBtn: { marginTop: 6, alignSelf: "flex-start" },
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
