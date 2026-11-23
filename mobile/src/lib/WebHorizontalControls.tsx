import { useCallback, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

type Direction = -1 | 1;
type Edges = { canGoBack: boolean; canGoForward: boolean };
const START: Edges = { canGoBack: false, canGoForward: false };

export function useWebHorizontalScroll(enabled: boolean) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [edges, setEdges] = useState(START);
  const web = Platform.OS === "web";
  const active = enabled && web;

  // React Native Web exposes the DOM scroller here. Its current geometry also
  // covers browser clamping after deletion and pointer or keyboard scrolling.
  const getNode = useCallback(
    () => active ? ref.current?.getNativeScrollRef() as HTMLElement | null | undefined : null,
    [active],
  );
  const measure = useCallback(() => {
    const node = getNode();
    const canGoBack = !!node && node.scrollLeft > 0.5;
    const canGoForward = !!node && node.scrollWidth - node.clientWidth - node.scrollLeft > 0.5;
    setEdges((previous) => previous.canGoBack === canGoBack && previous.canGoForward === canGoForward
      ? previous
      : { canGoBack, canGoForward });
  }, [getNode]);
  useLayoutEffect(() => {
    measure();
    const node = getNode();
    if (!node) return;
    // The home row can become ready in the same ScrollView that showed its
    // placeholders. Observe both boxes when the controls become active.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const content = ref.current?.getInnerViewRef() as HTMLElement | null | undefined;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [getNode, measure]);

  const onMove = (direction: Direction) => {
    const node = getNode();
    if (!node) return;
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    const x = Math.max(0, Math.min(max, node.scrollLeft + direction * node.clientWidth));
    ref.current?.scrollTo({ x, animated: false });
    measure();
  };

  return {
    scrollProps: web ? {
      ref,
      onScroll: measure,
      scrollEventThrottle: 16,
    } : {},
    edges: active ? edges : START,
    onMove,
  };
}

type ControlsProps = Edges & { label: string; onMove(direction: Direction): void };

export function WebHorizontalControls({ label, canGoBack, canGoForward, onMove }: ControlsProps) {
  if (Platform.OS !== "web" || (!canGoBack && !canGoForward)) return null;
  return (
    <View style={styles.controls}>
      <Arrow label={`${label} 이전`} glyph="‹" disabled={!canGoBack} onPress={() => onMove(-1)} />
      <Arrow label={`${label} 다음`} glyph="›" disabled={!canGoForward} onPress={() => onMove(1)} />
    </View>
  );
}

function Arrow({ label, glyph, disabled, onPress }: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress(): void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.button, disabled && styles.disabled, focused && styles.focused]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  controls: { flexDirection: "row", gap: 6, flexShrink: 0 },
  button: {
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
    borderRadius: theme.radii.control, borderWidth: 1, borderColor: c.seamHairline,
    backgroundColor: c.paper,
  },
  disabled: { opacity: 0.45 },
  focused: { outlineStyle: "solid", outlineColor: c.inkStrong, outlineWidth: 2, outlineOffset: 1 },
  glyph: { color: c.inkStrong, fontSize: 22, lineHeight: 24 },
});
