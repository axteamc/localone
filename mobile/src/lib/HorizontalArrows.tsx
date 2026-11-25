// 가로로 넘기는 줄 위에 얹는 유리 ‹ › 버튼(2026-11-25 실기기 개선 P2, 시안 `실기기개선_P2-P4_시안.html` #el-arrows 후보 A).
// - 웹·Android·iOS 모두 보인다(이전 WebHorizontalControls는 웹 전용·제목 줄 오른쪽).
// - 줄의 왼쪽·오른쪽 끝, 표지 높이 가운데(centerY). 더 갈 곳이 없는 쪽 버튼은 숨긴다.
// - 보이는 원 지름 32, 누르는 자리 44×44. 바탕 paper 62% + 흰 테두리 75% + 옅은 그림자(웹은 뒤 흐림 8 추가).
// - 손가락으로 밀어 넘기기는 그대로다. 버튼은 보이는 폭의 85%만큼 넘긴다(다음 표지가 이어 보이게).
import { useCallback, useRef, useState, type ComponentRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { theme } from "../theme";

type Direction = -1 | 1;
export type ArrowEdges = { canGoBack: boolean; canGoForward: boolean };
const NONE: ArrowEdges = { canGoBack: false, canGoForward: false };
const EDGE_EPSILON = 1;
const STEP_RATIO = 0.85;

/** ScrollView에 펼쳐 넣을 props와 현재 끝 상태·이동 함수 */
export function useHorizontalScroll(enabled: boolean) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const geo = useRef({ x: 0, width: 0, content: 0 });
  const [edges, setEdges] = useState<ArrowEdges>(NONE);

  const update = useCallback(() => {
    const { x, width, content } = geo.current;
    const canGoBack = width > 0 && x > EDGE_EPSILON;
    const canGoForward = width > 0 && content - width - x > EDGE_EPSILON;
    setEdges((p) => (p.canGoBack === canGoBack && p.canGoForward === canGoForward ? p : { canGoBack, canGoForward }));
  }, []);

  const onMove = useCallback(
    (direction: Direction) => {
      const { x, width, content } = geo.current;
      if (width <= 0) return;
      const max = Math.max(0, content - width);
      const next = Math.max(0, Math.min(max, x + direction * width * STEP_RATIO));
      ref.current?.scrollTo({ x: next, animated: true });
      geo.current.x = next; // 애니메이션 중 onScroll이 늦어도 다음 누름이 같은 자리에서 시작하지 않게
      update();
    },
    [update]
  );

  return {
    scrollProps: {
      ref,
      scrollEventThrottle: 16,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        geo.current.x = e.nativeEvent.contentOffset.x;
        update();
      },
      onLayout: (e: LayoutChangeEvent) => {
        geo.current.width = e.nativeEvent.layout.width;
        update();
      },
      onContentSizeChange: (w: number) => {
        geo.current.content = w;
        update();
      },
    },
    edges: enabled ? edges : NONE,
    onMove,
  };
}

type ArrowsProps = ArrowEdges & {
  /** 접근성 이름 앞부분(예: "요즘 많이 읽는 책") → "… 이전"/"… 다음" */
  label: string;
  /** 감싼 상자 위에서 버튼 가운데까지의 거리(표지 높이 가운데) */
  centerY: number;
  onMove(direction: Direction): void;
};

/** 줄을 감싼 View(position 기본 relative) 안, ScrollView 뒤에 둔다 */
export function GlassArrows({ label, canGoBack, canGoForward, centerY, onMove }: ArrowsProps) {
  return (
    <>
      {canGoBack && <Arrow side="left" label={`${label} 이전`} glyph="‹" top={centerY - HIT / 2} onPress={() => onMove(-1)} />}
      {canGoForward && <Arrow side="right" label={`${label} 다음`} glyph="›" top={centerY - HIT / 2} onPress={() => onMove(1)} />}
    </>
  );
}

const HIT = 44;
const SIZE = 32;

function Arrow({ side, label, glyph, top, onPress }: {
  side: "left" | "right";
  label: string;
  glyph: string;
  top: number;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.hit, side === "left" ? styles.left : styles.right, { top }]}
    >
      {({ pressed }) => (
        <View style={[styles.glass, pressed && styles.pressed]}>
          <Text style={styles.glyph}>{glyph}</Text>
        </View>
      )}
    </Pressable>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  hit: { position: "absolute", width: HIT, height: HIT, alignItems: "center", justifyContent: "center", zIndex: 2 },
  left: { left: 2 },
  right: { right: 2 },
  glass: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${c.paper}9E`, // 62%
    borderWidth: 1,
    borderColor: `${c.paper}BF`, // 75%
    boxShadow: `0 1px 6px 0 ${c.shadowSoft}`,
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(8px)" } as object) : null),
  },
  pressed: { backgroundColor: `${c.paper}D9` },
  glyph: { color: c.inkStrong, fontSize: 22, lineHeight: 24, fontWeight: "500", marginTop: -2 },
});
