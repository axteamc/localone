// 홈 (계약서 library-visit.md VISIT-1). 지도 대신 파사드 격자 + 등각 큐브(FacadeHome, 2026-11-18 큐브 배치).
// 위치·주변 조회·도서관 찾기 창은 그대로, 지도 끌기·"이 지역에서 다시 찾기"는 없다(지도는 책 검색 LIB-2로 이관).
// VISIT-1b: 아래에서 올려 보는 홈 하단 창(HomeSheet). 안내 카드·아래 가운데 버튼은 창 위쪽 끝에 붙어 함께 움직인다.
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getHeroRule, getRecentVisitedLibraryId, setHeroRule, type LibrarySummary, type Region } from "./deps";
import type { HeroRule } from "./direction";
import { theme, actionColors } from "../../theme";
import { PlacePicker } from "../../lib/PlacePicker";
import { FacadeHome } from "./FacadeHome";
import { FindLibrarySheet } from "./FindLibrarySheet";
import { HomeSheet } from "./HomeSheet";
import { useHomeLibraries } from "./useHomeLibraries";

const TEXT = {
  search: "책 제목·저자를 검색",
  find: "도서관 찾기",
  allow: "위치 허용하기",
  loading: "도서관을 찾는 중…",
  reload: "↻ 새로고침",
  error: "지금은 도서관을 불러올 수 없어요.",
  empty: "가까운 곳에서 도서관을 찾지 못했어요.",
  noCoords: "이 지역 도서관은 위치 정보가 없어 여기에 놓지 못했어요.",
  widen: "더 넓게 찾기",
  pickRegion: "지역 골라 시작",
  backToCurrent: "현재 위치로",
  here: "현위치",
  start: "임시 시작점",
  moved: "이동한 지역",
};

export function HomeScreen() {
  const router = useRouter();
  const home = useHomeLibraries();
  const [visitRefresh, refreshVisits] = useState(0);
  const hasFocused = useRef(false);

  // V5: 미리보기 없이 방문 페이지. distanceM은 distance_m이 0 이상 안전한 정수일 때만 넘기고, null·잘못된 값은 뺀다(core K15)
  const openLibrary = useCallback(
    (lib: Pick<LibrarySummary, "id" | "distance_m">) => {
      const d = lib.distance_m;
      const distanceM = d != null && Number.isSafeInteger(d) && d >= 0 ? d : null;
      router.push({
        pathname: "/libraries/[libraryId]",
        params: { libraryId: String(lib.id), ...(distanceM == null ? {} : { distanceM: String(distanceM) }) },
      });
    },
    [router]
  );

  // 처음 주인공(2026-11-18 D): 기본은 가장 가까운 곳, "최근 방문"은 기기에 둔 설정(홈에서 주인공 큐브 꾹 누르기)
  const [heroRule, setRule] = useState<HeroRule>("nearest");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 최근 방문: 홈은 방문 페이지(루트 Stack)로 가도 unmount되지 않으므로 홈에 돌아올 때(focus)와 "최근 방문한 곳"을
  // 고를 때 다시 읽는다. 순번으로 늦은 응답은 버린다.
  // latest = 마지막으로 읽은 값, shown = 파사드에 넘긴 값. V3는 "보는 위치·목록·설정이 바뀌면" 고른 주인공을 되돌리므로
  // 홈 복귀만으로는 shown을 바꾸지 않는다(FacadeHome은 recentId가 바뀌면 고른 주인공을 처음으로 되돌린다).
  // shown은 처음 읽었을 때, 설정을 고를 때, 보는 위치·목록이 바뀔 때(어차피 되돌리는 때) latest로 맞춘다.
  const [recent, setRecent] = useState<{ latest: number | null; shown: number | null; read: boolean }>({
    latest: null,
    shown: null,
    read: false,
  });
  const recentSeq = useRef(0);
  const readRecent = useCallback((apply: boolean) => {
    const mine = ++recentSeq.current;
    void getRecentVisitedLibraryId()
      .catch(() => null)
      .then((id) => {
        if (!alive.current || mine !== recentSeq.current) return;
        setRecent((r) => ({ latest: id, shown: apply || !r.read ? id : r.shown, read: true }));
      });
  }, []);
  // 저장값은 처음과 홈에 돌아올 때(방문 페이지 ⋯ 메뉴에서 바꿨을 수 있다, L6) 읽는다. 읽는 중에 사용자가 고르면
  // 늦게 온 이전 저장값은 버리고(순번), 홈에서 고른 값의 저장이 끝난 뒤에 읽는다(되돌림 방지)
  const ruleNow = useRef<HeroRule>("nearest");
  ruleNow.current = heroRule;
  const ruleSeq = useRef(0);
  const ruleSaving = useRef<Promise<void>>(Promise.resolve());
  const ruleRead = useRef(false);
  const readRule = useCallback(() => {
    const mine = ++ruleSeq.current;
    void ruleSaving.current
      .then(() => getHeroRule())
      .catch((): HeroRule => "nearest")
      .then((rule) => {
        if (!alive.current || mine !== ruleSeq.current) return;
        const first = !ruleRead.current; // 처음 읽을 때는 최근 방문도 처음 읽는 중이라 다시 읽지 않는다
        ruleRead.current = true;
        if (rule === ruleNow.current) return;
        setRule(rule);
        if (rule === "recent" && !first) {
          setRecent((r) => ({ ...r, shown: r.latest }));
          readRecent(true);
        }
      });
  }, [readRecent]);
  useFocusEffect(
    useCallback(() => {
      readRecent(false);
      readRule();
      if (hasFocused.current) refreshVisits((n) => n + 1);
      hasFocused.current = true;
    }, [readRecent, readRule])
  );
  const [seenView, setSeenView] = useState({ libraries: home.libraries, viewSeq: home.viewSeq, center: home.center });
  if (seenView.libraries !== home.libraries || seenView.viewSeq !== home.viewSeq || seenView.center !== home.center) {
    // 렌더 중 상태 맞추기(React "이전 값 저장" 방식): FacadeHome이 같은 렌더에서 목록 변경과 새 최근 방문을 함께 받는다
    setSeenView({ libraries: home.libraries, viewSeq: home.viewSeq, center: home.center });
    if (recent.shown !== recent.latest) setRecent({ ...recent, shown: recent.latest });
  }

  const changeHeroRule = useCallback(
    (rule: HeroRule) => {
      ruleSeq.current++; // 읽는 중인 이전 저장값은 버린다
      setRule(rule);
      ruleSaving.current = setHeroRule(rule).catch(() => undefined);
      if (rule === "recent") {
        // 홈 복귀 때 읽은 값으로 바로 보여 주고, 기록이 그 뒤 바뀌었을 수 있으니 한 번 더 읽어 맞춘다
        setRecent((r) => ({ ...r, shown: r.latest }));
        readRecent(true);
      }
    },
    [readRecent]
  );

  const [placesOpen, setPlacesOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const closeFind = useCallback(() => setFindOpen(false), []);
  // V12: 찾기 결과는 기준 위치와 목록을 바꾼다. 방문 페이지로 바로 가지 않는다
  const pickRegion = useCallback(
    (r: Region) => {
      setFindOpen(false);
      home.showRegion(r.code);
    },
    [home]
  );
  const pickLibrary = useCallback(
    (l: LibrarySummary) => {
      setFindOpen(false);
      home.focusLibrary(l);
    },
    [home]
  );

  const showBack = home.origin === "moved"; // 현재 위치를 알면서 다른 곳을 볼 때만(V10: "위치 허용하기"와 함께 뜨지 않음)

  const message =
    home.status === "error" ? (
      <View style={styles.card}>
        <Text style={styles.cardText}>{TEXT.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => home.reloadHere(home.center)} style={styles.ghostButton}>
          <Text style={styles.ghostText}>{TEXT.reload}</Text>
        </Pressable>
      </View>
    ) : home.status === "empty" ? (
      <View style={styles.card}>
        <Text style={styles.cardText}>{TEXT.empty}</Text>
        {home.origin === "start" ? (
          // V7(C-68): 임시 시작점 주변이 비면 넓히기보다 지역을 고르게 한다(위치 없는 노트북 등)
          <Pressable accessibilityRole="button" onPress={() => setFindOpen(true)} style={styles.ghostButton}>
            <Text style={styles.ghostText}>{TEXT.pickRegion}</Text>
          </Pressable>
        ) : home.radiusKm === 3 ? (
          <Pressable accessibilityRole="button" onPress={home.widen} style={styles.ghostButton}>
            <Text style={styles.ghostText}>{TEXT.widen}</Text>
          </Pressable>
        ) : null}
      </View>
    ) : home.status === "ready" &&
      home.libraries.length > 0 &&
      home.libraries.every((l) => l.latitude == null || l.longitude == null) ? (
      // 좌표가 하나도 없으면 블록이 0개라 빈 파사드만 남는다 — 말없이 비워 두지 않는다(사후 검토 ③-3)
      <View style={styles.card}>
        <Text style={styles.cardText}>{TEXT.noCoords}</Text>
      </View>
    ) : null;

  // V7·V10: 아래 가운데 — 위치를 못 쓰면 "위치 허용하기", 보는 위치가 현재 위치와 다르면 "현재 위치로"
  const bottomButton =
    home.origin === "start" ? (
      <View style={styles.startActions}>
        {home.status !== "loading" && <Pressable accessibilityRole="button" onPress={() => setPlacesOpen(true)} style={styles.button}>
          <Text style={styles.buttonText}>주소·장소로 시작</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" onPress={() => void home.allowLocation()} style={styles.button}>
          <Text style={styles.buttonText}>{TEXT.allow}</Text>
        </Pressable>
      </View>
    ) : showBack ? (
      <Pressable accessibilityRole="button" onPress={home.backToCurrent} style={styles.button}>
        <Text style={styles.buttonText}>{TEXT.backToCurrent}</Text>
      </Pressable>
    ) : null;

  const originTitle = home.origin === "start" ? home.roughLabel ?? TEXT.start : home.origin === "moved" ? TEXT.moved : TEXT.here;

  return (
    <View style={styles.screen}>
      {/* V6: 검색창 본문과 오른쪽 "도서관 찾기"는 터치 영역을 따로 둔다. 찾기 창이 열려 있는 동안은 그 창의 입력칸이 이 자리를 대신한다 */}
      <View style={[styles.searchBar, findOpen ? styles.hidden : null]} pointerEvents={findOpen ? "none" : "auto"}>
        <Pressable
          accessibilityRole="search"
          testID="home-search-bar"
          onPress={() => router.push("/search")}
          style={styles.searchBody}
        >
          <Text numberOfLines={1} style={styles.searchText}>
            {TEXT.search}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="home-find-library"
          onPress={() => setFindOpen(true)}
          style={styles.findButton}
        >
          <Text style={styles.findText}>{TEXT.find}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <FacadeHome
          center={home.center}
          viewSeq={home.viewSeq}
          libraries={home.libraries}
          originTitle={originTitle}
          originSub={`${home.radiusKm}KM`}
          selectedId={home.selectedId}
          heroRule={heroRule}
          recentId={recent.shown}
          onHeroRuleChange={changeHeroRule}
          onLibraryPress={openLibrary}
        />

        {/* V15: 화면을 가리지 않는 작은 알약 */}
        {home.status === "loading" ? (
          <View style={styles.pillWrap} pointerEvents="none" testID="home-loading-pill">
            <Text style={styles.pill}>{TEXT.loading}</Text>
          </View>
        ) : null}

        {/* VISIT-1b 결정 2: 파사드 위에 반쯤 올라온 창. 안내 카드와 아래 가운데 버튼은 창 위쪽 끝 바로 위에 */}
        <HomeSheet
          nearby={home.libraries}
          locationReady={home.status !== "loading"}
          viewSeq={home.viewSeq}
          visitRefresh={visitRefresh}
          origin={home.origin}
          above={
            message || bottomButton ? (
              <View style={styles.aboveSheet} pointerEvents="box-none">
                {message ? <View style={styles.messageCard}>{message}</View> : null}
                {bottomButton}
              </View>
            ) : null
          }
        />
      </View>

      {/* V11: 위에서 반쯤 내려오는 찾기 창. 열려 있는 동안은 맨 위가 "‹ 지역이나 도서관 이름" 칸이 된다 */}
      {placesOpen && <PlacePicker onClose={() => setPlacesOpen(false)} onRegion={() => {
        setPlacesOpen(false);
        setFindOpen(true);
      }} />}
      {findOpen ? <FindLibrarySheet onClose={closeFind} onPickRegion={pickRegion} onPickLibrary={pickLibrary} /> : null}
    </View>
  );
}

const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.panelFrosted },
  // 건축 프레임 바: 파사드 상단 줄눈에 맞물리는 입력 칸(곡률 9) + 1px 줄눈선 + 오른쪽 무광 판 "도서관 찾기" 버튼
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 6,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: theme.colors.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: theme.colors.paper,
  },
  searchBody: { flex: 1, paddingVertical: 6, paddingLeft: 12 },
  searchText: { color: theme.colors.inkMuted },
  findButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.control,
    ...ACT.primary,
  },
  findText: { fontSize: 12, fontWeight: "500", ...ACT.primaryText },
  body: { flex: 1, overflow: "hidden" },
  card: { alignItems: "center", gap: 10, padding: 20 },
  cardText: { fontSize: 15, textAlign: "center", color: theme.colors.text },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.control,
    ...ACT.primary,
  },
  buttonText: { fontWeight: "500", ...ACT.primaryText },
  ghostButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    borderColor: theme.colors.seamHairline,
  },
  ghostText: { color: theme.colors.text },
  pillWrap: { position: "absolute", top: 8, left: 0, right: 0, alignItems: "center" },
  hidden: { opacity: 0 },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.control,
    fontSize: 13,
    overflow: "hidden",
    backgroundColor: theme.colors.paper,
    color: theme.colors.text,
  },
  startActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  aboveSheet: { alignItems: "center", gap: 8 },
  // 파사드 위에 뜨는 안내 카드는 바탕이 있어야 읽힌다(색·곡률 토큰)
  messageCard: { backgroundColor: theme.colors.paper, borderRadius: theme.radii.card, marginHorizontal: 16 },
});
