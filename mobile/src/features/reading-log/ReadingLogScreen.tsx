// READ-1-P2 독서 기록 탭 = 내 책장 (reading-log.md READ-1 R1-O1·C3·C6, 큰 틀 결정 3·4)
// 표지 면, 한 줄 3권, 한 달 = 한 줄(넘치면 그 달 안에서 줄바꿈), 최근 읽은 책이 위·왼쪽.
// 책을 누르면 책장 위 카드 → "기록 자세히 보기". 오른쪽 아래 떠 있는 +(지름 38)로 쓰기 화면.
// 통계 한 줄·도서관별 보기·자리 바꾸기·프리셋은 READ-2.
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import { fetchReadingLogs, shelfDate, shelfStore, type ReadingLog } from "./api";
import { Cover, TEXT as EDITOR_TEXT, Toast, monthDay, styles as base } from "./ReadingLogEditor";

export const TEXT = {
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
} as const;

const PER_ROW = 3;
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

export function ReadingLogScreen() {
  const router = useRouter();
  const { status, userId } = useAuth();
  const shelf = useSyncExternalStore(shelfStore.subscribe, shelfStore.get, shelfStore.get);
  const items = status === "signedIn" && shelf.owner === userId ? shelf.items : null;
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [picked, setPicked] = useState<{ owner: string; log: ReadingLog } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reload, setReload] = useState(0);
  const genRef = useRef(0);
  const moreCtrlRef = useRef<AbortController | null>(null);
  const loadingCursorRef = useRef<string | null>(null);

  const load = useCallback(
    async (owner: string, cursor: string | null, signal?: AbortSignal) => {
      const page = await fetchReadingLogs({ cursor }, signal);
      if (signal?.aborted) return;
      shelfStore.setPage(owner, page, cursor !== null);
    },
    []
  );

  useEffect(() => {
    genRef.current += 1;
    moreCtrlRef.current?.abort();
    moreCtrlRef.current = null;
    loadingCursorRef.current = null;
    setMoreLoading(false);
    if (status !== "signedIn" || !userId) {
      setPicked(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    load(userId, null, ctrl.signal)
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => {
      ctrl.abort();
      moreCtrlRef.current?.abort();
    };
  }, [status, userId, reload, load]);

  // 쓰기·지우기 뒤 책장으로 돌아오면 안내 한 번("저장했어요"·"기록을 지웠어요")
  useEffect(() => {
    if (!shelf.notice) return;
    const notice = shelfStore.takeNotice();
    if (!notice) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(notice);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, [shelf.notice]);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const activePicked =
    status === "signedIn" && userId && picked && picked.owner === userId
      ? (items?.find((l) => l.id === picked.log.id) ?? null)
      : null;

  const loadMore = () => {
    const cursor = shelf.nextCursor;
    if (!userId || !cursor || moreLoading || loadingCursorRef.current === cursor || shelf.owner !== userId) return;
    const reqGen = genRef.current;
    const reqOwner = userId;
    const ctrl = new AbortController();
    moreCtrlRef.current = ctrl;
    loadingCursorRef.current = cursor;
    setMoreLoading(true);
    fetchReadingLogs({ cursor }, ctrl.signal)
      .then((page) => {
        if (ctrl.signal.aborted || genRef.current !== reqGen) return;
        shelfStore.setPage(reqOwner, page, true);
      })
      .catch(() => undefined) // 다음 묶음 실패는 다음 스크롤 때 다시 한다
      .finally(() => {
        if (genRef.current === reqGen) {
          loadingCursorRef.current = null;
          setMoreLoading(false);
        }
      });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 240) loadMore();
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

  const thisYear = new Date().getFullYear().toString();
  let content: React.ReactNode;
  if (items === null && failed) {
    content = (
      <View style={[base.flex, base.center]}>
        <Text style={base.centerText}>{TEXT.loadFailed}</Text>
        <Pressable accessibilityRole="button" onPress={() => setReload((n) => n + 1)} style={({ pressed }) => [base.secondaryBtn, pressed && ACT.secondaryPressed]}>
          <Text style={base.secondaryText}>{TEXT.retry}</Text>
        </Pressable>
      </View>
    );
  } else if (items === null || (loading && items.length === 0)) {
    content = (
      <View style={[base.flex, base.center]}>
        <ActivityIndicator accessibilityLabel="불러오는 중" />
      </View>
    );
  } else if (items.length === 0) {
    content = (
      <View testID="shelf-empty" style={[base.flex, base.center]}>
        <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
        <Text style={base.sub}>{TEXT.emptyBody}</Text>
      </View>
    );
  } else {
    content = (
      <ScrollView testID="shelf" contentContainerStyle={styles.shelfPad} onScroll={onScroll} scrollEventThrottle={200}>
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
                    onPress={() => setPicked(userId ? { owner: userId, log } : null)}
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
        {moreLoading ? <ActivityIndicator accessibilityLabel="더 불러오는 중" /> : null}
      </ScrollView>
    );
  }

  return (
    <View style={base.screen}>
      {items !== null && failed ? (
        <View testID="shelf-refresh-error" style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{TEXT.loadFailed}</Text>
          <Pressable accessibilityRole="button" onPress={() => setReload((n) => n + 1)} style={({ pressed }) => [base.secondaryBtn, pressed && ACT.secondaryPressed]}>
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
const C = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  emptyTitle: { fontSize: 16, color: C.text, fontWeight: "500" },
  shelfPad: { padding: 16, paddingBottom: 96, gap: 18 },
  month: { gap: 8 },
  monthLabel: { ...T.gauge },
  shelfRow: { flexDirection: "row", gap: 14, alignItems: "flex-end" },
  slot: { borderRadius: theme.radii.block },
  slotPressed: { opacity: 0.8, transform: [{ translateY: 1 }] },
  plank: { height: 6, borderRadius: theme.radii.block, backgroundColor: C.surface3, boxShadow: `0 2px 0 0 ${C.reliefSideDark}` },
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
