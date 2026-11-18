// 앱 시작 분기: 기본 도서관이면 방문 페이지로 (contracts/local-feed.md VISIT-2 G6, G-#4·#5)
// 홈 탭(A)이 화면 맨 위에 한 번 놓는다. 이동하지 않으면 null 또는 한 줄 안내만 그린다.
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NEARBY_DEFAULT_RADIUS_KM } from "../../lib/policy";
import { locate } from "../../lib/platform";
import { ApiCallError, fetchLibrariesNearby, fetchLibrary } from "../../lib/publicApi";
import { getDefaultLibrary, setDefaultLibrary } from "../../lib/visits";
import { theme } from "../../theme";

const C = theme.colors;
const NOTICE_MS = 2500;

let decided = false; // 앱 실행마다 한 번만 판단

/** 시험 전용: 새 앱 실행처럼 다시 판단하게 한다 */
export function resetDefaultLibraryGateForTests() {
  decided = false;
}

export const releasedText = (name: string) => `${name} 바로 열기를 풀었어요`;

export function DefaultLibraryGate(): React.JSX.Element | null {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (decided) return;
    decided = true;
    const ctrl = new AbortController();
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const open = (libraryId: number, distanceM?: number | null) =>
      router.push({
        pathname: "/libraries/[libraryId]",
        params: {
          libraryId: String(libraryId),
          ...(distanceM != null && Number.isSafeInteger(distanceM) && distanceM >= 0
            ? { distanceM: String(distanceM) }
            : {}),
        },
      });

    void (async () => {
      await decide();
      finished = true;
    })();

    async function decide() {
      const defaultId = await getDefaultLibrary();
      if (defaultId === null || ctrl.signal.aborted) return;
      let name: string | null = null;
      try {
        name = (await fetchLibrary(defaultId, ctrl.signal)).name;
      } catch (e) {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiCallError && e.status === 404) {
          await setDefaultLibrary(null); // 서버에서 사라진 도서관(G-#4): 끄고 홈 그대로
          return;
        }
        // 이름을 못 받아도 판단은 계속한다(방문 페이지가 실패 화면을 보여 준다)
      }
      const here = await locate(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!here.ok) {
        open(defaultId); // 위치를 못 쓰면 풀지 않고 방문 페이지로(G-#5)
        return;
      }
      let items: { id: number; distance_m: number | null }[];
      try {
        items = (await fetchLibrariesNearby(here.lat, here.lng, NEARBY_DEFAULT_RADIUS_KM, ctrl.signal)).items;
      } catch {
        if (!ctrl.signal.aborted) open(defaultId); // 주변을 못 물어보면 풀지 않는다
        return;
      }
      if (ctrl.signal.aborted) return;
      const mine = items.find((it) => it.id === defaultId);
      if (mine) {
        open(defaultId, mine.distance_m);
        return;
      }
      if (items.length > 0) {
        await setDefaultLibrary(null);
        if (ctrl.signal.aborted) return;
        if (name) {
          setNotice(releasedText(name));
          timer = setTimeout(() => setNotice(null), NOTICE_MS);
        }
        return;
      }
      open(defaultId); // 주변에 도서관이 하나도 없으면 판단할 근거가 없어 그대로 연다
    }

    return () => {
      ctrl.abort();
      if (!finished) decided = false; // 판단 도중 사라졌으면(개발 모드 이중 실행 등) 다음에 다시 판단
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  if (!notice) return null;
  return (
    <View style={styles.notice} pointerEvents="none" accessibilityLiveRegion="polite" testID="gate-notice">
      <Text style={styles.noticeText}>{notice}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    backgroundColor: C.paper,
    borderRadius: theme.radii.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 20,
    shadowColor: C.shadowFloat,
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  noticeText: { fontSize: 15, fontWeight: "500", color: C.text },
});
