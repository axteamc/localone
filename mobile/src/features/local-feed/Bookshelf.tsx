// VISIT-3-P2 오늘의 서가(책장) — contracts/local-feed.md VISIT-3 V3-1~V3-5, V3-O1·V3-O2·V3-O7, 명세 결정 1
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { GlassArrows } from "../../lib/HorizontalArrows";
import { type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import { fetchShelf, type ShelfBook, type ShelfKind, type ShelfPage, type ShelfResponse } from "./api";


export const SHELF_HEIGHT = 224; // V3-1 처음 자리 값. 실제 높이는 내용(제목·점·표지·선반)에 맞추고 onHeight로 알린다(2026-11-25 P2)
const SHELF_MIN_HEIGHT = 120; // 불러오는 중·빈 책장·실패 안내 자리
export const SHELF_FADE_HEIGHT = 72; // V3-1 피드-책장 사이 띠
const COVER_W = 104;
const COVER_H = 150;
const PAGE_INSET = 16;
const BOOK_GAP = 16;
const PAGE_TOP = 8; // page paddingTop
const OPEN_LOCK_MS = 1000; // 책 연타: 책 화면은 한 번만(예외 #3)

/** V3-O1 (2026-11-25 C-92 3장 체제): 화제의 책(YES24 베스트셀러) → {테마} → 요즘 사람들이 읽고 간 책(정보나루 최근 30일).
 * 서버도 같은 순서로 주지만 앱이 한 번 더 맞춘다. 서버가 뺀 장은 건너뛴다(이전: recent_reads → theme → popular) */
export const SHELF_ORDER: readonly ShelfKind[] = ["popular", "theme", "recent_reads"];

export const SHELF_TEXT = {
  emptyTitle: "아직 이 도서관 책장이 비어 있어요",
  // C-92: 책장은 YES24·테마·정보나루 대출로 채운다(반납 집계 안 씀) → 비면 내 독서 기록으로 잇는다
  emptySub: "읽은 책은 독서 기록에 남겨 보세요",
  emptyLink: "독서 기록 쓰기 →",
  failed: "책장을 불러오지 못했어요",
  retry: "다시 해 보기",
} as const;

export function orderShelfPages(pages: ShelfPage[]): ShelfPage[] {
  return SHELF_ORDER.flatMap((kind) => pages.filter((p) => p.kind === kind)).filter((p) => p.books.length > 0);
}

type ShelfState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; pages: ShelfPage[] };

export type BookshelfProps = {
  libraryId: number;
  onOpenBook(isbn13: string): void;
  load?: (libraryId: number, signal: AbortSignal) => Promise<ShelfResponse>; // 기본: fetchShelf(#31)
  /** 아래 안전 영역을 뺀 책장 높이(글쓰기 버튼·피드 여백 맞춤용) */
  onHeight?: (height: number) => void;
  /** 빈 책장 "독서 기록 쓰기 →"(C-92). 없으면 링크를 그리지 않는다 */
  onWriteRecord?(): void;
};

export function Bookshelf({ libraryId, onOpenBook, load = fetchShelf, onHeight, onWriteRecord }: BookshelfProps) {
  const { styles } = useLook(makeStyles);
  const runner = useRef(createLatestRunner()).current;
  const [state, setState] = useState<ShelfState>({ kind: "loading" });
  const [index, setIndex] = useState(0);
  const pageIndex = useRef(0);
  const [width, setWidth] = useState(0);
  const [pagesHeight, setPagesHeight] = useState(0);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const opening = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const web = Platform.OS === "web";
  const pages = state.kind === "ok" ? state.pages : [];
  const lastIndex = Math.max(0, pages.length - 1);

  const selectPage = useCallback((i: number) => {
    pageIndex.current = i;
    setIndex(i);
  }, []);

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    const res = await runner.run((signal) => load(libraryId, signal));
    if (res.status === "stale") return;
    if (res.status === "error") setState({ kind: "error" });
    else setState({ kind: "ok", pages: orderShelfPages(res.value.pages) });
  }, [runner, load, libraryId]);

  // 처음 열 때·도서관을 바꿀 때 늘 첫 장(V3-O1). 늦게 온 앞 도서관 응답은 버린다
  useEffect(() => {
    selectPage(0);
    scroller.current?.scrollTo?.({ x: 0, animated: false });
    void reload();
    return () => runner.cancel();
  }, [reload, runner, selectPage]);

  // The web scroll offset is in pixels. Realign it to the same page after resize.
  useLayoutEffect(() => {
    if (web && width > 0) {
      scroller.current?.scrollTo({ x: Math.min(pageIndex.current, lastIndex) * width, animated: false });
    }
  }, [lastIndex, web, width]);

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    },
    []
  );

  const goTo = (i: number) => {
    if (i < 0 || i > lastIndex || (web && width <= 0)) return;
    selectPage(i);
    scroller.current?.scrollTo?.({ x: i * width, animated: !web });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    selectPage(Math.max(0, Math.min(lastIndex, Math.round(e.nativeEvent.contentOffset.x / width))));
  };

  const open = (isbn13: string) => {
    if (opening.current) return;
    opening.current = true;
    openTimer.current = setTimeout(() => {
      opening.current = false;
    }, OPEN_LOCK_MS);
    onOpenBook(isbn13);
  };

  const current = pages[Math.min(index, lastIndex)];
  const coverWidthFor = (count: number) =>
    width > 0 ? Math.max(1, Math.min(COVER_W, (width - PAGE_INSET * 2 - BOOK_GAP * (count - 1)) / count)) : COVER_W;
  const currentCoverHeight = (coverWidthFor(current?.books.length ?? 1) * COVER_H) / COVER_W;

  return (
    <View
      // 인라인 서가 섹션: 피드 스크롤 흐름 안에서 내용만큼 차지한다(하단 고정 해제)
      style={[styles.wrap, { minHeight: SHELF_MIN_HEIGHT }]}
      testID="bookshelf"
      onLayout={(e: LayoutChangeEvent) => {
        setWidth(e.nativeEvent.layout.width);
        onHeight?.(Math.round(e.nativeEvent.layout.height));
      }}
    >
      {state.kind === "error" ? (
        <View style={styles.message} testID="shelf-error">
          <Text style={styles.messageTitle}>{SHELF_TEXT.failed}</Text>
          <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.retry}>
            <Text style={styles.retryText}>{SHELF_TEXT.retry}</Text>
          </Pressable>
        </View>
      ) : state.kind === "ok" && pages.length === 0 ? (
        <View style={styles.message} testID="shelf-empty">
          <Text style={styles.messageTitle}>{SHELF_TEXT.emptyTitle}</Text>
          <Text style={styles.messageSub}>{SHELF_TEXT.emptySub}</Text>
          {onWriteRecord ? (
            <Pressable accessibilityRole="link" onPress={onWriteRecord} style={styles.retry} testID="shelf-empty-record">
              <Text style={styles.retryText}>{SHELF_TEXT.emptyLink}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : state.kind === "loading" ? (
        <View style={styles.message} testID="shelf-loading" />
      ) : (
        <>
          <View style={styles.top}>
            <Text style={styles.title} numberOfLines={1} testID="shelf-title">
              {current?.title ?? ""}
            </Text>
            {current?.basis_label ? (
              <Text style={styles.basis} numberOfLines={1}>
                {current.basis_label}
              </Text>
            ) : null}
          </View>
          {pages.length > 1 ? (
            <View style={styles.dots} testID="shelf-dots">
              {pages.map((p, i) => (
                <Pressable
                  key={p.kind}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}번째 책장: ${p.title}`}
                  accessibilityState={{ selected: i === index }}
                  {...(web && i === index ? { "aria-current": "page" } : {})}
                  testID={`shelf-dot-${i}`}
                  onPress={() => goTo(i)}
                  hitSlop={10}
                  style={[styles.dot, i === index && styles.dotOn]}
                />
              ))}
            </View>
          ) : null}
          <View
            onLayout={(e: LayoutChangeEvent) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0) setPagesHeight(h);
            }}
          >
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={web ? undefined : onScrollEnd}
            onScroll={web ? onScrollEnd : undefined}
            scrollEventThrottle={web ? 16 : undefined}
            testID="shelf-pages"
            style={styles.pages}
          >
            {pages.map((p) => {
              const coverWidth = coverWidthFor(p.books.length);
              return (
                <View key={p.kind} style={[styles.page, { width: width || undefined }]}>
                  {p.books.map((b) => (
                    <BookCover key={b.isbn13} book={b} width={coverWidth} onPress={() => open(b.isbn13)} />
                  ))}
                </View>
              );
            })}
          </ScrollView>
          {/* 책 위 좌우 유리 버튼(표지 높이 가운데) — 장 단위로 넘긴다. 모바일에서도 보인다(P2) */}
          <GlassArrows
            label="오늘의 서가"
            canGoBack={width > 0 && index > 0}
            canGoForward={width > 0 && index < lastIndex}
            centerY={pagesHeight > PAGE_TOP ? PAGE_TOP + (pagesHeight - PAGE_TOP) / 2 : PAGE_TOP + currentCoverHeight / 2}
            onMove={(direction) => goTo(pageIndex.current + direction)}
          />
          </View>
          <View style={styles.plank} />
        </>
      )}
    </View>
  );
}

function BookCover({ book, width, onPress }: { book: ShelfBook; width: number; onPress(): void }) {
  const { styles } = useLook(makeStyles);
  const compact = width < 84;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title} 책 화면 열기`}
      onPress={onPress}
      style={({ pressed }) => [styles.book, { width }, pressed && styles.bookPressed]}
    >
      {book.cover_url ? (
        <Image source={{ uri: book.cover_url }} style={styles.cover} accessibilityIgnoresInvertColors />
      ) : (
        // V3-O7: 표지 없으면 같은 크기의 글자 표지(위 저자, 아래 제목), 바탕 paper
        <View style={[styles.cover, styles.textCover, compact && styles.compactCover]}>
          <Text style={styles.coverAuthor} numberOfLines={compact ? 1 : 2}>
            {book.author ?? ""}
          </Text>
          <Text style={[styles.coverTitle, compact && styles.compactTitle]} numberOfLines={compact ? 2 : 4}>
            {book.title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// V3-1 피드-책장 사이 띠: 블러 라이브러리 없이(P3 승인 전) 그라데이션 페이드만 — 아래로 갈수록 선반색으로 녹는다
const FADE_STEPS = ["00", "1a", "36", "57", "7a", "a0", "c4", "d9"];
function ShelfFade() {
  const { C, styles } = useLook(makeStyles);
  const step = SHELF_FADE_HEIGHT / FADE_STEPS.length;
  return (
    <View pointerEvents="none" style={styles.fade} testID="shelf-fade">
      {FADE_STEPS.map((a) => (
        <View key={a} style={{ height: step, backgroundColor: `${C.surface2}${a}` }} />
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  const [bTL, bTR, bBR, bBL] = theme.radii.bookCover;
  const bookRadius = {
    borderTopLeftRadius: bTL,
    borderTopRightRadius: bTR,
    borderBottomRightRadius: bBR,
    borderBottomLeftRadius: bBL,
  };
  return StyleSheet.create({
  wrap: {
    marginVertical: 14,
    marginHorizontal: -12,
    paddingBottom: 6,
    backgroundColor: C.surface2,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.seamHairline,
    justifyContent: "flex-end",
  },
  fade: { position: "absolute", left: 0, right: 0, top: -SHELF_FADE_HEIGHT, height: SHELF_FADE_HEIGHT },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  title: { flexShrink: 1, fontSize: 14, fontWeight: "500", color: C.text },
  basis: { flexShrink: 1, fontSize: 11, color: C.inkMuted, marginLeft: "auto" },
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.surface3 },
  dotOn: { backgroundColor: C.inkStrong },
  pages: { flexGrow: 0 },
  page: {
    flexDirection: "row", justifyContent: "center", alignItems: "flex-end",
    gap: BOOK_GAP, paddingTop: PAGE_TOP, paddingHorizontal: PAGE_INSET,
  },
  book: { aspectRatio: COVER_W / COVER_H, ...bookRadius, boxShadow: `0 6px 12px 0 ${C.shadowSoft}` },
  bookPressed: { transform: [{ translateY: -4 }] },
  cover: { width: "100%", height: "100%", ...bookRadius, overflow: "hidden", backgroundColor: C.paper },
  textCover: { padding: 10, justifyContent: "space-between", borderLeftWidth: 5, borderLeftColor: C.surface3 },
  coverAuthor: { fontSize: 11, color: C.inkMuted },
  coverTitle: { fontSize: 14, lineHeight: 18, fontWeight: "500", color: C.text },
  compactCover: { padding: 6 },
  compactTitle: { fontSize: 12, lineHeight: 15 },
  plank: { height: 7, marginHorizontal: 8, marginBottom: 6, backgroundColor: C.inkStrong },
  message: { flex: 1, justifyContent: "center", alignItems: "flex-start", gap: 4, paddingHorizontal: 20 },
  messageTitle: { fontSize: 15, fontWeight: "500", color: C.text },
  messageSub: { fontSize: 13, color: C.textSub },
  retry: { minHeight: 44, justifyContent: "center" },
  retryText: { fontSize: 15, fontWeight: "500", color: C.inkStrong },
  });
};
