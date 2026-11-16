// 지도 홈 (계약서 library-visit.md VISIT-1). P1: 홈 틀·위치·도서관 목록. 핀 모양·묶음은 P2, 보는 위치 바꾸기·찾기 창은 P3.
// TODO(연결): D theme — 색은 core `theme.colors`가 머지된 뒤 넣는다(바탕 bg, 검색창 paper, 알약·버튼 fill1, 글자 text·inkMuted)
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KakaoMap, type LibrarySummary, type MapMarker } from "./__fakes__/publicApi"; // TODO(연결): D APP-0-P3
import { formatDistance } from "./format";
import { LibraryList } from "./LibraryList";
import { useHomeLibraries } from "./useHomeLibraries";

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
};

function toMarkers(libs: LibrarySummary[]): MapMarker[] {
  const out: MapMarker[] = [];
  for (const l of libs) {
    if (l.latitude == null || l.longitude == null) continue;
    out.push({
      id: l.id,
      lat: l.latitude,
      lng: l.longitude,
      title: l.name,
      subtitle: l.distance_m != null ? formatDistance(l.distance_m) : null,
      tone: l.today.is_closed === true ? "closed" : "normal",
    });
  }
  return out;
}

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
      {/* V6: 검색창 본문과 오른쪽 "도서관 찾기"는 터치 영역을 따로 둔다 */}
      <View style={styles.searchBar}>
        <Pressable
          accessibilityRole="search"
          testID="home-search-bar"
          onPress={() => router.push("/search")}
          style={styles.searchBody}
        >
          <Text numberOfLines={1}>{TEXT.search}</Text>
        </Pressable>
        {/* TODO(VISIT-1-P3): 누르면 "도서관 찾기" 창을 연다 */}
        <Pressable accessibilityRole="button" testID="home-find-library" style={styles.findButton}>
          <Text>{TEXT.find}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {home.mode === "map" ? (
          <>
            <KakaoMap
              key={mapKey}
              center={home.center}
              markers={toMarkers(home.libraries)}
              selectedId={home.selectedId}
              onMarkerPress={openLibrary}
              onError={home.onMapError}
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

        {/* V15: 화면을 가리지 않는 작은 알약 */}
        {home.status === "loading" ? (
          <View style={styles.pillWrap} pointerEvents="none">
            <Text style={styles.pill}>{TEXT.loading}</Text>
          </View>
        ) : null}

        {/* V7: 위치를 못 쓰면 지도 아래 가운데 */}
        {home.origin === "start" ? (
          <View style={styles.bottomCenter}>
            <Pressable accessibilityRole="button" onPress={() => void home.allowLocation()} style={styles.button}>
              <Text>{TEXT.allow}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    borderWidth: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  searchBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 16 },
  findButton: { paddingVertical: 12, paddingHorizontal: 14 },
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
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, fontSize: 13 },
  bottomCenter: { position: "absolute", bottom: 24, left: 0, right: 0, alignItems: "center" },
});
