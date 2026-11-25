import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createLatestRunner } from "../../lib/latest";
import { onFill, theme } from "../../theme";
import { CUBE_H, CUBE_W } from "../library-visit/direction";
import { IsoCube } from "../library-visit/FacadeHome";
import { cubeNames, type CubeName } from "../library-visit/shortName";
import { fetchVisitedLibraries, type VisitedLibrariesPage, type VisitedLibrary } from "./api";
import { collectionTone, VISIT_PALETTE } from "./visitPalette";
import { ModalFrame } from "../../theme/WebFrame";

const C = theme.colors;
const COLUMNS = 3;
const GAP = 6;
const SIDE = 12;
const MAX_WIDTH = 480;
const TEXT = {
  title: "도서관 방문 모음",
  empty: "“다녀왔어요”를 누르면 방문한 도서관이 여기에 모여요",
  error: "불러오지 못했어요",
  retry: "↻ 다시 시도",
  loading: "불러오는 중…",
  all: "모두 보기",
  close: "닫기",
};

type State =
  | { kind: "loading" | "error" }
  | { kind: "ready"; page: VisitedLibrariesPage; more: "idle" | "loading" | "error" };

export function VisitedLibraries({ onOpenLibrary }: { onOpenLibrary(libraryId: number): void }) {
  const runner = useMemo(createLatestRunner, []);
  const [state, setState] = useState<State>({ kind: "loading" });
  const pending = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null);
  const window = useWindowDimensions();
  const availableWidth = layoutWidth ?? Math.min(window.width, MAX_WIDTH);
  const width = Math.max(1, (availableWidth - 2 * SIDE - (COLUMNS - 1) * GAP) / COLUMNS);

  const loadFirst = useCallback(async (showLoading = true) => {
    pending.current = true;
    if (showLoading) setState({ kind: "loading" });
    const result = await runner.run((signal) => fetchVisitedLibraries(null, signal));
    if (result.status === "stale") return;
    pending.current = false;
    setState(result.status === "ok"
      ? { kind: "ready", page: result.value, more: "idle" }
      : { kind: "error" });
  }, [runner]);

  useFocusEffect(useCallback(() => {
    void loadFirst();
    return () => {
      runner.cancel();
      pending.current = false;
    };
  }, [loadFirst, runner]));

  const loadMore = async () => {
    if (state.kind !== "ready" || !state.page.next_cursor || pending.current) return;
    const { page } = state;
    pending.current = true;
    setState({ ...state, more: "loading" });
    const result = await runner.run((signal) => fetchVisitedLibraries(page.next_cursor, signal));
    if (result.status === "stale") return;
    pending.current = false;
    if (result.status === "error") {
      setState({ ...state, more: "error" });
      return;
    }
    const seen = new Set(page.items.map(({ library }) => library.id));
    setState({
      kind: "ready",
      page: {
        items: [...page.items, ...result.value.items.filter(({ library }) => !seen.has(library.id))],
        next_cursor: result.value.next_cursor,
      },
      more: "idle",
    });
  };

  const items = state.kind === "ready" ? state.page.items : [];
  const titles = useMemo(() => cubeNames(items.map(({ library }) => library)), [items]);
  const close = () => setExpanded(false);
  const renderCube = (item: VisitedLibrary) => (
    <VisitCube
      key={item.library.id}
      item={item}
      title={titles.get(item.library.id) ?? { big: item.library.name, small: null }}
      width={width}
      onPress={() => {
        close();
        onOpenLibrary(item.library.id);
      }}
    />
  );

  return (
    <View style={styles.section} onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>{TEXT.title}</Text>
        {items.length > 0 && <Action label={TEXT.all} onPress={() => setExpanded(true)} />}
      </View>
      {state.kind === "loading" && <Text style={styles.message}>{TEXT.loading}</Text>}
      {state.kind === "error" && <LoadError onRetry={() => void loadFirst(false)} />}
      {state.kind === "ready" && (items.length === 0
        ? <Text style={styles.message}>{TEXT.empty}</Text>
        : <View style={styles.row}>{items.slice(0, COLUMNS).map(renderCube)}</View>)}
      {expanded && state.kind === "ready" && (
        <Modal visible onRequestClose={close} animationType="slide"><ModalFrame>
          <SafeAreaView style={styles.full}>
            <View style={styles.panel} accessibilityViewIsModal>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>{TEXT.title}</Text>
                <Action label={TEXT.close} onPress={close} />
              </View>
              <FlatList
                testID="visited-libraries-grid"
                data={items}
                numColumns={COLUMNS}
                keyExtractor={({ library }) => String(library.id)}
                renderItem={({ item }) => renderCube(item)}
                columnWrapperStyle={styles.row}
                onEndReached={() => {
                  if (state.more === "idle") void loadMore();
                }}
                onEndReachedThreshold={0.25}
                ListFooterComponent={state.more === "error" ? <LoadError onRetry={() => void loadMore()} />
                  : state.more === "loading" ? <Text style={styles.message}>{TEXT.loading}</Text> : undefined}
              />
            </View>
          </SafeAreaView>
        </ModalFrame></Modal>
      )}
    </View>
  );
}

function VisitCube({ item, title, width, onPress }: {
  item: VisitedLibrary;
  title: CubeName;
  width: number;
  onPress(): void;
}) {
  const scale = width / CUBE_W;
  const height = CUBE_H * scale;
  const fill = collectionTone(item.library.id, VISIT_PALETTE);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.library.name}
      accessibilityHint={`처음 방문 ${item.first_on}, 스탬프 ${item.stamp_days}개`}
      onPress={onPress}
      style={{ width, height }}
    >
      <View style={{
        position: "absolute",
        left: (width - CUBE_W) / 2,
        top: (height - CUBE_H) / 2,
        transform: [{ scale }],
      }}>
        <IsoCube
          title={title}
          fill={fill}
          ink={onFill(fill)}
          left={<Text style={styles.faceLabel}>{item.first_on}</Text>}
          right={<Text style={styles.faceLabel}>{`STAMP ${item.stamp_days}`}</Text>}
        />
      </View>
    </Pressable>
  );
}

function Action({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function LoadError({ onRetry }: { onRetry(): void }) {
  return (
    <View style={styles.error}>
      <Text style={styles.message}>{TEXT.error}</Text>
      <Action label={TEXT.retry} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingHorizontal: SIDE, paddingVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  title: { color: C.inkStrong, fontSize: 16, fontWeight: "500" },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  actionText: { color: C.inkStrong, fontSize: 14, fontWeight: "500" },
  row: { flexDirection: "row", gap: GAP },
  message: { color: C.textSub, fontSize: 14, paddingVertical: 8 },
  error: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: GAP },
  full: { flex: 1, backgroundColor: C.panelFrosted },
  panel: { flex: 1, alignSelf: "center", width: "100%", maxWidth: MAX_WIDTH, paddingHorizontal: SIDE },
  faceLabel: { color: C.inkStrong, fontSize: 13, fontWeight: "500" },
});
