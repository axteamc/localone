// 홈 하단 창 (계약서 library-visit.md VISIT-1b W1·W3·W7·W8·W11, 결정 1·2)
// 지도 홈 아래에서 올려 보는 창. 평소 반쯤, 올리면 맨 위 검색창 바로 아래까지, 내리면 제목 한 줄. 지도는 창 뒤에 그대로 있다.
// P1: 창과 인기 도서 한 줄. P2: 그 아래 자주 가는·가까운 도서관 소식(LibraryNewsSection).
// 창이 반쯤·내림이면 안쪽은 스크롤하지 않고 끌기만, 올림(full)이면 안쪽 목록이 스크롤된다(C4).
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { theme } from "../../theme";
import type { Book, LibrarySummary } from "./deps";
import { LibraryNewsSection } from "./LibraryNewsSection";
import { PopularBooksRow } from "./PopularBooksRow";
import { useHomeFeed } from "./useHomeFeed";
import { useHomeSheet } from "./useHomeSheet";

/** 상세로 넘어가는 동안 두 번째 누름을 무시하는 시간(W8) */
export const OPEN_GUARD_MS = 500;
/** 창 위쪽 끝 바로 위에 띄우는 것(지도 안내·버튼)의 자리 높이 */
const ABOVE_SPACE = 200;
/** 목록 끝에서 이만큼 남으면 다음 게시물을 받는다(W6) */
const LOAD_MORE_EDGE = 200;

export type HomeSheetProps = {
  nearby: LibrarySummary[];
  origin: "current" | "start" | "moved";
  /** 창 위쪽 끝 바로 위에 붙어 함께 움직이는 것(지도 안내 카드·"현재 위치로" 등). 창이 지도 아래쪽을 덮어도 보이게 */
  above?: React.ReactNode;
};

export function HomeSheet(props: HomeSheetProps) {
  const { nearby, origin, above } = props;
  const router = useRouter();
  const [area, setArea] = useState(0);
  const atTop = useRef(true);
  const isListAtTop = useCallback(() => atTop.current, []);
  const sheet = useHomeSheet(area, isListAtTop);
  const feed = useHomeFeed(nearby, origin);

  const onLayout = useCallback((e: LayoutChangeEvent) => setArea(e.nativeEvent.layout.height), []);

  // W8: 책·게시물을 빠르게 두 번 눌러도 상세는 한 번만(이동 중 500ms 동안 두 번째 누름 무시)
  const lastOpen = useRef(0);
  const once = useCallback((go: () => void) => {
    const now = Date.now();
    if (now - lastOpen.current < OPEN_GUARD_MS) return;
    lastOpen.current = now;
    go();
  }, []);
  // W7. TODO(연결): C LIB-1-P2 — 책 상세가 머지되기 전에는 core 스텁 화면
  const openBook = useCallback(
    (b: Book) => once(() => router.push({ pathname: "/books/[isbn13]", params: { isbn13: b.isbn13 } })),
    [once, router]
  );
  // W6. TODO(연결): B LOCAL-2-P4 — 게시물 상세가 머지되기 전에는 core 스텁 화면
  const openPost = useCallback(
    (postId: string) => once(() => router.push({ pathname: "/posts/[postId]", params: { postId } })),
    [once, router]
  );

  const { loadMore } = feed;
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      atTop.current = contentOffset.y <= 0;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - LOAD_MORE_EDGE) loadMore();
    },
    [loadMore]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      {above ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.above, { transform: [{ translateY: Animated.subtract(sheet.translateY, ABOVE_SPACE) }] }]}
        >
          {above}
        </Animated.View>
      ) : null}

      <Animated.View
        testID="home-sheet"
        accessibilityValue={{ text: sheet.snap }}
        style={[styles.sheet, { height: area > 0 ? area : "100%", transform: [{ translateY: sheet.translateY }] }]}
        {...sheet.panHandlers}
      >
        <View style={styles.grabArea}>
          <View style={styles.grab} />
        </View>
        <ScrollView
          testID="home-sheet-scroll"
          style={styles.scroll}
          contentContainerStyle={styles.content}
          scrollEnabled={sheet.snap === "full"}
          onScroll={onScroll}
          scrollEventThrottle={64}
        >
          <PopularBooksRow
            status={feed.popular.status}
            basisLabel={feed.popular.basisLabel}
            books={feed.popular.books}
            onPressBook={openBook}
            onReload={feed.reloadPopular}
          />
          <LibraryNewsSection
            news={feed.news}
            areaBased={origin !== "current"}
            onSelectPill={feed.selectPill}
            onPressPost={openPost}
            onReload={feed.reloadNews}
          />
          {/* W11: "내 최근 독서 기록"은 넣지 않는다(빈 자리도 없음) */}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const c = theme.colors;

const styles = StyleSheet.create({
  above: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: ABOVE_SPACE,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 12,
    userSelect: "none", // 웹: 마우스로 끌 때 글자 선택이 생기면 끌기가 끊긴다
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: c.paper,
    userSelect: "none", // 웹: 마우스 끌기 중 글자 선택이 끌기를 끊지 않게(C4 웹 마우스 끌기)
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    shadowColor: c.shadowSoft,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  grabArea: { paddingTop: 8, paddingBottom: 6, alignItems: "center" },
  grab: { width: 36, height: 4, borderRadius: 4, backgroundColor: c.surface3 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingBottom: 24 },
});
