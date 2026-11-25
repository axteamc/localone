// 홈 하단 창 높이·끌기 (계약서 library-visit.md VISIT-1b W3·C4, 결정 2)
// 세 플랫폼 같은 코드: React Native 기본 PanResponder + Animated(useNativeDriver: false — 웹과 같게). 제스처 라이브러리 없음.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, useWindowDimensions, type GestureResponderHandlers } from "react-native";

export type SheetSnap = "half" | "full" | "peek";

/** 내렸을 때 남는 높이(제목 한 줄) */
export const PEEK_HEIGHT = 56;
/** 평소 높이: 위쪽 파사드를 넓게(약 72%) 두고 하단 창은 지금의 절반 수준(약 28%)만 살짝 보이게 한다. */
export const HALF_RATIO = 0.72;
/** 제목과 책 표지 상단이 살짝 엿보이는 최소 높이(기존 320의 절반 수준). 지도 블록 자리도 함께 보장한다. */
const MIN_HALF_HEIGHT = 156;
const MIN_MAP_HEIGHT = 220;
/** 손을 뗄 때 이 속도(px/ms) 이상이면 그 방향 다음 자리로 */
export const FLING_VELOCITY = 0.5;
/** 이만큼 움직여야 끌기로 본다(누름과 구분) */
const DRAG_SLOP = 6;

/** 창 위쪽 끝의 자리(창이 놓인 영역의 맨 위에서 아래로 몇 px). 위에서부터 full → half → peek */
export function snapOffsets(areaHeight: number): Record<SheetSnap, number> {
  const peek = Math.max(0, areaHeight - PEEK_HEIGHT);
  const defaultHalf = Math.min(peek, Math.round(areaHeight * HALF_RATIO));
  const half = Math.max(Math.min(defaultHalf, MIN_MAP_HEIGHT), Math.min(defaultHalf, areaHeight - MIN_HALF_HEIGHT));
  return { full: 0, half, peek };
}

const ORDER: SheetSnap[] = ["full", "half", "peek"];

/** 손을 뗀 자리와 속도로 붙을 자리를 고른다 */
export function pickSnap(y: number, vy: number, offsets: Record<SheetSnap, number>): SheetSnap {
  if (vy >= FLING_VELOCITY) return ORDER.find((s) => offsets[s] > y) ?? "peek"; // 아래로 빠르게
  if (vy <= -FLING_VELOCITY) return [...ORDER].reverse().find((s) => offsets[s] < y) ?? "full"; // 위로 빠르게
  return ORDER.reduce((best, s) => (Math.abs(offsets[s] - y) < Math.abs(offsets[best] - y) ? s : best), "half");
}

export type HomeSheetState = {
  snap: SheetSnap;
  translateY: Animated.Value;
  panHandlers: GestureResponderHandlers;
  snapTo(s: SheetSnap): void;
};

/**
 * areaHeight: 창이 놓인 영역(검색창 아래 ~ 하단 탭 위)의 높이. 재기 전에는 화면 높이로 둔다.
 * isListAtTop: 창 안 목록이 맨 위인지. full에서는 목록이 맨 위일 때만 아래로 끌어 창을 내린다(C4 2행).
 */
export function useHomeSheet(areaHeight?: number, isListAtTop?: () => boolean): HomeSheetState {
  const { height: screenHeight } = useWindowDimensions();
  const area = areaHeight && areaHeight > 0 ? areaHeight : screenHeight;
  const offsets = useMemo(() => snapOffsets(area), [area]);

  const [snap, setSnap] = useState<SheetSnap>("half");
  const translateY = useRef(new Animated.Value(offsets.half)).current;

  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;
  const snapRef = useRef<SheetSnap>(snap);
  snapRef.current = snap;
  const startY = useRef(offsets.half);
  const atTopRef = useRef(isListAtTop);
  atTopRef.current = isListAtTop;

  const animateTo = useCallback(
    (s: SheetSnap) => {
      snapRef.current = s;
      setSnap(s);
      Animated.spring(translateY, {
        toValue: offsetsRef.current[s],
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [translateY]
  );

  // 영역 높이가 바뀌면(첫 재기·화면 돌림) 지금 자리를 다시 맞춘다
  useEffect(() => {
    translateY.setValue(offsets[snapRef.current]);
  }, [offsets, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 웹 마우스는 움직임만으로는 끌기를 넘겨받지 못한다(react-native-web). 창 빈 곳·손잡이를 누르면 창이 받는다.
        // 책·버튼처럼 누를 수 있는 것은 더 안쪽이라 먼저 받는다(누름 그대로). 휴대폰에서 안쪽 목록이 스크롤을 시작하면
        // 스크롤이 이 끌기를 넘겨받는다(아래 onPanResponderTerminate)
        onStartShouldSetPanResponder: () => true,
        // C4: full이 아니면 끌기가 먼저(안쪽 스크롤보다). full이면 안쪽 스크롤에 맡기고, 목록이 맨 위에서 아래로 끌 때만 창을 내린다
        onMoveShouldSetPanResponderCapture: (_e, g) => {
          if (Math.abs(g.dy) <= DRAG_SLOP || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
          if (snapRef.current !== "full") return true;
          return g.dy > 0 && (atTopRef.current?.() ?? true);
        },
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > DRAG_SLOP && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((v) => {
            startY.current = v;
          });
        },
        onPanResponderMove: (_e, g) => {
          const o = offsetsRef.current;
          translateY.setValue(Math.min(o.peek, Math.max(o.full, startY.current + g.dy)));
        },
        onPanResponderRelease: (_e, g) => {
          const o = offsetsRef.current;
          const y = Math.min(o.peek, Math.max(o.full, startY.current + g.dy));
          animateTo(pickSnap(y, g.vy, o));
        },
        onPanResponderTerminate: () => animateTo(snapRef.current),
      }),
    [animateTo, translateY]
  );

  return { snap, translateY, panHandlers: pan.panHandlers, snapTo: animateTo };
}
