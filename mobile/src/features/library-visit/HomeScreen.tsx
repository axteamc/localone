// 지도 홈 (계약서 library-visit.md VISIT-1). P1: 홈 틀·위치·도서관 목록. P2: 지도·핀·묶음(LibraryMap).
// P3: 보는 위치 바꾸기("이 지역에서 다시 찾기"·"현재 위치로")·도서관 찾기 창(FindLibrarySheet).
// TODO(연결): D theme — 색은 core `theme.colors`가 머지된 뒤 넣는다(바탕 bg, 검색창 paper, 알약·버튼 fill1, 글자 text·inkMuted)
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LatLng, LibrarySummary, Region } from "./__fakes__/publicApi"; // TODO(연결): D APP-0-P1
import { FindLibrarySheet } from "./FindLibrarySheet";
import { LibraryList } from "./LibraryList";
import { LibraryMap } from "./LibraryMap";
import { useHomeLibraries } from "./useHomeLibraries";

/** 지도가 스스로 옮긴 것(보는 위치를 바꿀 때)을 끌어 옮긴 것으로 보지 않기 위한 허용 오차(도) */
const SAME_SPOT = 1e-5;

const TEXT = {
  search: "책 제목·저자를 검색",
  find: "도서관 찾기",
  allow: "위치 허용하기",
  loading: "도서관을 찾는 중…",
  mapFailed: "지도를 불러오지 못했어요",
  reload: "↻ 새로고침",
  error: "지금은 도서관을 불러올 수 없어요.",
  empty: "가까운 곳에서 도서관을 찾지 못했어요.",
  widen: "더 넓게 찾기",
  searchHere: "이 지역에서 다시 찾기",
  backToCurrent: "현재 위치로",
};

export function HomeScreen() {
  const router = useRouter();
  const home = useHomeLibraries();
  const [mapKey, setMapKey] = useState(0);

  // V5: 미리보기 없이 방문 페이지. TODO(연결): B — 방문 페이지가 머지되기 전에는 core 스텁 화면
  const openLibrary = useCallback(
    (id: number) => router.push({ pathname: "/libraries/[libraryId]", params: { libraryId: String(id) } }),
    [router]
  );

  const retryMap = useCallback(() => {
    setMapKey((k) => k + 1);
    home.retryMap();
  }, [home]);

  // V10: 끌어 옮긴 지도 중심. 있으면 "이 지역에서 다시 찾기"가 뜬다
  const [dragCenter, setDragCenter] = useState<LatLng | null>(null);
  // V14: 다시 찾기 요청 중에는 버튼을 흐리게(누를 수 없음)
  const [hereBusy, setHereBusy] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const { center, status } = home;
  const onRegionChange = useCallback(
    (at: LatLng) => {
      if (Math.abs(at.lat - center.lat) < SAME_SPOT && Math.abs(at.lng - center.lng) < SAME_SPOT) return;
      setDragCenter(at);
    },
    [center.lat, center.lng]
  );

  useEffect(() => {
    if (hereBusy && status !== "loading") {
      setHereBusy(false);
      setDragCenter(null);
    }
  }, [hereBusy, status]);

  // 화면이 다시 그려지기 전에 두 번 눌려도 요청은 하나(예외 #3)
  const hereBusyRef = useRef(false);
  useEffect(() => {
    hereBusyRef.current = hereBusy;
  }, [hereBusy]);
  const searchHere = useCallback(() => {
    if (hereBusyRef.current || !dragCenter) return;
    hereBusyRef.current = true;
    setHereBusy(true);
    home.reloadHere(dragCenter);
  }, [dragCenter, home]);

  const backToCurrent = useCallback(() => {
    setDragCenter(null);
    home.backToCurrent();
  }, [home]);

  const closeFind = useCallback(() => setFindOpen(false), []);
  // V12: 찾기 결과는 지도를 옮기거나 목록을 바꾼다. 방문 페이지로 바로 가지 않는다
  const pickRegion = useCallback(
    (r: Region) => {
      setFindOpen(false);
      setDragCenter(null);
      home.showRegion(r.code);
    },
    [home]
  );
  const pickLibrary = useCallback(
    (l: LibrarySummary) => {
      setFindOpen(false);
      setDragCenter(null);
      home.focusLibrary(l);
    },
    [home]
  );

  const canGoBack = home.origin !== "start"; // 현재 위치를 알 때만(V10: "위치 허용하기"와 함께 뜨지 않음)
  const showBack = canGoBack && (home.origin === "moved" || dragCenter != null);

  const message =
    home.status === "error" ? (
      <View style={styles.card}>
        <Text style={styles.cardText}>{TEXT.error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={home.mode === "list" ? retryMap : () => home.reloadHere(home.center)}
          style={styles.button}
        >
          <Text>{TEXT.reload}</Text>
        </Pressable>
      </View>
    ) : home.status === "empty" ? (
      <View style={styles.card}>
        <Text style={styles.cardText}>{TEXT.empty}</Text>
        {home.mode === "map" && home.radiusKm === 3 ? (
          <Pressable accessibilityRole="button" onPress={home.widen} style={styles.button}>
            <Text>{TEXT.widen}</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={styles.screen}>
      {/* V6: 검색창 본문과 오른쪽 "도서관 찾기"는 터치 영역을 따로 둔다. 찾기 창이 열려 있는 동안은 그 창의 입력칸이 이 자리를 대신한다(시안 후보 A) */}
      <View style={[styles.searchBar, findOpen ? styles.hidden : null]} pointerEvents={findOpen ? "none" : "auto"}>
        <Pressable
          accessibilityRole="search"
          testID="home-search-bar"
          onPress={() => router.push("/search")}
          style={styles.searchBody}
        >
          <Text numberOfLines={1}>{TEXT.search}</Text>
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
        {home.mode === "map" ? (
          <>
            <LibraryMap
              key={mapKey}
              center={home.center}
              libraries={home.libraries}
              selectedId={home.selectedId}
              onLibraryPress={openLibrary}
              onError={home.onMapError}
              onRegionChange={onRegionChange}
            />
            {message ? <View style={styles.overlayCenter}>{message}</View> : null}
          </>
        ) : (
          <View style={styles.list}>
            {/* V8: 지도 자리에 한 줄 + 시군구 도서관 목록 */}
            <View style={styles.mapFailedRow}>
              <Text>{TEXT.mapFailed}</Text>
              <Pressable accessibilityRole="button" onPress={retryMap} style={styles.button}>
                <Text>{TEXT.reload}</Text>
              </Pressable>
            </View>
            {message ?? <LibraryList libraries={home.libraries} onPress={(l) => openLibrary(l.id)} />}
          </View>
        )}

        {/* V10: 지도를 끌어 옮기면 검색창 아래 가운데 */}
        {home.mode === "map" && dragCenter ? (
          <View style={styles.pillWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: hereBusy }}
              disabled={hereBusy}
              testID="home-search-here"
              onPress={searchHere}
              style={[styles.button, hereBusy ? styles.dim : null]}
            >
              <Text>{TEXT.searchHere}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* V15: 화면을 가리지 않는 작은 알약 */}
        {home.status === "loading" ? (
          <View style={[styles.pillWrap, home.mode === "map" && dragCenter ? styles.pillBelow : null]} pointerEvents="none">
            <Text style={styles.pill}>{TEXT.loading}</Text>
          </View>
        ) : null}

        {/* V7·V10: 지도 아래 가운데 — 위치를 못 쓰면 "위치 허용하기", 보는 위치가 현재 위치와 다르면 "현재 위치로" */}
        {home.origin === "start" ? (
          <View style={styles.bottomCenter}>
            <Pressable accessibilityRole="button" onPress={() => void home.allowLocation()} style={styles.button}>
              <Text>{TEXT.allow}</Text>
            </Pressable>
          </View>
        ) : showBack ? (
          <View style={styles.bottomCenter}>
            <Pressable accessibilityRole="button" onPress={backToCurrent} style={styles.button}>
              <Text>{TEXT.backToCurrent}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* V11: 위에서 반쯤 내려오는 찾기 창. 시안대로 맨 위 검색창 자리부터 덮어, 열려 있는 동안은 맨 위가 "‹ 지역이나 도서관 이름" 칸이 된다 */}
      {findOpen ? <FindLibrarySheet onClose={closeFind} onPickRegion={pickRegion} onPickLibrary={pickLibrary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // 시안 `.sbar`: 둥근 막대, 왼쪽 안내 글자, 오른쪽 안에 작은 둥근 "도서관 찾기"(색은 theme 머지 뒤 paper·inkMuted·fill1)
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 6,
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  searchBody: { flex: 1, paddingVertical: 6, paddingLeft: 12 },
  findButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  findText: { fontSize: 12 },
  body: { flex: 1 },
  list: { flex: 1 },
  mapFailedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  overlayCenter: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  card: { alignItems: "center", gap: 10, padding: 20 },
  cardText: { fontSize: 15, textAlign: "center" },
  button: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderRadius: 999 },
  pillWrap: { position: "absolute", top: 8, left: 0, right: 0, alignItems: "center" },
  pillBelow: { top: 52 },
  dim: { opacity: 0.4 },
  hidden: { opacity: 0 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, fontSize: 13 },
  bottomCenter: { position: "absolute", bottom: 24, left: 0, right: 0, alignItems: "center" },
});
