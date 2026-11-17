// 홈 (계약서 library-visit.md VISIT-1). 시안 C(2026-11-17 확정): 지도 대신 파사드 격자 + 방위 블록(FacadeHome).
// 위치·주변 조회·도서관 찾기 창은 그대로, 지도 끌기·"이 지역에서 다시 찾기"는 없다(지도는 책 검색 LIB-2로 이관).
// VISIT-1b: 아래에서 올려 보는 홈 하단 창(HomeSheet). 안내 카드·아래 가운데 버튼은 창 위쪽 끝에 붙어 함께 움직인다.
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LibrarySummary, Region } from "./deps";
import { onFill, theme } from "../../theme";
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
  backToCurrent: "현재 위치로",
  here: "현위치",
  start: "임시 시작점",
  moved: "이동한 지역",
};

export function HomeScreen() {
  const router = useRouter();
  const home = useHomeLibraries();

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
        {home.radiusKm === 3 ? (
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
      <Pressable accessibilityRole="button" onPress={() => void home.allowLocation()} style={styles.button}>
        <Text style={styles.buttonText}>{TEXT.allow}</Text>
      </Pressable>
    ) : showBack ? (
      <Pressable accessibilityRole="button" onPress={home.backToCurrent} style={styles.button}>
        <Text style={styles.buttonText}>{TEXT.backToCurrent}</Text>
      </Pressable>
    ) : null;

  const originTitle = home.origin === "start" ? TEXT.start : home.origin === "moved" ? TEXT.moved : TEXT.here;

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
          radiusKm={home.radiusKm}
          selectedId={home.selectedId}
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
      {findOpen ? <FindLibrarySheet onClose={closeFind} onPickRegion={pickRegion} onPickLibrary={pickLibrary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  // 건축 프레임 바: 파사드 상단 줄눈에 맞물리는 직각 가까운 모서리 + 1px 줄눈선 + 오른쪽 마이크로 베벨 "도서관 찾기" 태그
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 6,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: theme.colors.seamHairline,
    borderRadius: 6,
    backgroundColor: theme.colors.paper,
  },
  searchBody: { flex: 1, paddingVertical: 6, paddingLeft: 12 },
  searchText: { color: theme.colors.inkMuted },
  findButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.block + 1,
    borderWidth: 1,
    borderColor: theme.colors.seamHairline,
    backgroundColor: theme.colors.fill1,
  },
  findText: { fontSize: 12, fontWeight: "700", color: onFill(theme.colors.fill1) }, // 채움 위 글자색 자동(디자인_기준 §2, 사후 검토 ③-5)
  body: { flex: 1, overflow: "hidden" },
  card: { alignItems: "center", gap: 10, padding: 20 },
  cardText: { fontSize: 15, textAlign: "center", color: theme.colors.text },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.control,
    backgroundColor: theme.colors.inkStrong,
  },
  buttonText: { fontWeight: "700", color: onFill(theme.colors.inkStrong) },
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
  aboveSheet: { alignItems: "center", gap: 8 },
  // 파사드 위에 뜨는 안내 카드는 바탕이 있어야 읽힌다(색·곡률 토큰)
  messageCard: { backgroundColor: theme.colors.paper, borderRadius: theme.radii.card, marginHorizontal: 16 },
});
