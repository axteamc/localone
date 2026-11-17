// 홈 파사드(시안 C): 프로스티드 유리 격자 + 수평 스케일 룰러 + 중앙 + 기점 + 3D 컬러 스파인 블록 (VISIT-1 총정리 §2).
// 지도는 쓰지 않는다. 색·곡률은 theme 토큰만 쓴다.
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { onFill, theme } from "../../theme";
import type { LatLng, LibrarySummary } from "./deps";
import {
  assignSpineTones,
  groupLibrariesForFacade,
  type FacadeGroup,
  type FacadeItem,
  type FacadeKind,
  type FacadeSlot,
  type SpineTone,
} from "./direction";
import { formatDistance } from "./format";

const { colors: C, radii: R } = theme;
const GRID_COLS = 4;
const GRID_ROWS = 4;
const TICKS = 41;

export type FacadeHomeProps = {
  center: LatLng;
  /** 보는 위치를 다시 정할 때마다 바뀐다. 바뀌면 "+N곳 전환"으로 넘겨 둔 칸을 처음으로 되돌린다 */
  viewSeq?: number;
  libraries: LibrarySummary[];
  /** 기점 매스에 새기는 이름. 예: "현위치", "임시 시작점" */
  originTitle: string;
  originSub: string;
  radiusKm: number;
  selectedId: number | null;
  onLibraryPress(lib: LibrarySummary): void;
};

function hoursOf(lib: LibrarySummary): string {
  if (lib.today.is_closed === true) return "오늘 휴관";
  return lib.today.hours_text ?? "";
}

function spineColor(tone: SpineTone): string {
  return tone === "closed" ? C.pinClosed : C[tone];
}

/** 칸별 자리. 맨 아래는 홈 하단 창(HomeSheet)이 덮으므로 블록은 위쪽 절반에 모은다 */
const SLOT_STYLE: Record<FacadeSlot, ViewStyle> = {
  NW: { left: 16, width: "44%", top: "5%" },
  NE: { right: 22, width: "44%", top: "3%" },
  SW: { left: 16, width: "44%", top: "52%" },
  SE: { right: 22, width: "44%", top: "54%" },
  W: { left: 16, width: "44%", top: "14%" },
  E: { right: 22, width: "44%", top: "14%" },
  MAIN: { left: 28, right: 34, top: "8%" },
};

function FacadeGrid() {
  const cells = useMemo(() => Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => i), []);
  return (
    <View style={styles.grid} pointerEvents="none" testID="facade-grid">
      {cells.map((i) => (
        <View key={i} style={styles.bay}>
          <View style={[styles.rivet, { top: 6, left: 6 }]} />
          <View style={[styles.rivet, { top: 6, right: 6 }]} />
          <View style={[styles.rivet, { bottom: 6, left: 6 }]} />
          <View style={[styles.rivet, { bottom: 6, right: 6 }]} />
        </View>
      ))}
    </View>
  );
}

function RulerTrack({ radiusKm }: { radiusKm: number }) {
  const half = radiusKm / 2;
  const third = (radiusKm / 6).toFixed(1);
  return (
    <View style={styles.ruler} pointerEvents="none" testID="facade-ruler">
      <View style={styles.ticks}>
        {Array.from({ length: TICKS }, (_, i) => (
          <View key={i} style={[styles.tick, i % 5 === 0 ? styles.tickMajor : null]} />
        ))}
      </View>
      <View style={styles.rulerLabels}>
        <Text style={styles.rulerText}>{`W ${half}km`}</Text>
        <Text style={styles.rulerText}>{`${third}km`}</Text>
        <Text style={styles.rulerText}>{`${third}km`}</Text>
        <Text style={styles.rulerText}>{`E ${half}km`}</Text>
      </View>
    </View>
  );
}

function OriginPlinth({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.plinthWrap} pointerEvents="none" testID="facade-origin">
      <View style={styles.plinthSide} />
      <View style={styles.plinth}>
        <View style={styles.cross}>
          <View style={styles.crossV} />
          <View style={styles.crossH} />
        </View>
        <Text style={styles.plinthTitle}>{title}</Text>
        <Text style={styles.plinthSub}>{sub}</Text>
      </View>
    </View>
  );
}

type BlockProps = {
  group: FacadeGroup;
  index: number;
  tone: SpineTone;
  selected: boolean;
  onOpen(lib: LibrarySummary): void;
  onCycle(slot: FacadeSlot, count: number): void;
};

function ReliefLibraryBlock({ group, index, tone, selected, onOpen, onCycle }: BlockProps) {
  const item: FacadeItem = group.items[index % group.items.length] as FacadeItem;
  const count = group.items.length;
  const closed = item.lib.today.is_closed === true;
  const sub = item.lib.area_label ?? item.lib.address ?? "";
  return (
    <View style={[styles.blockWrap, SLOT_STYLE[group.slot]]} testID={`facade-block-${group.slot}`}>
      {count > 1 ? <View style={styles.slab} /> : null}
      <View style={[styles.layer, { left: 3, top: 4, backgroundColor: C.surface3 }]} />
      <View style={[styles.layer, { left: 6, top: 8, backgroundColor: C.reliefSideDark }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.lib.name} ${formatDistance(item.distanceM)}`}
        onPress={() => onOpen(item.lib)}
        style={[styles.block, selected ? styles.blockSelected : null]}
      >
        <View style={[styles.spine, { backgroundColor: spineColor(tone) }]}>
          <View style={styles.slit} />
        </View>
        <View style={styles.blockBody}>
          <View style={styles.blockHead}>
            <Text style={styles.code}>{item.code}</Text>
            {count > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`같은 방향 도서관 ${count - 1}곳 더 보기`}
                onPress={() => onCycle(group.slot, count)}
                style={styles.stackPill}
              >
                <Text style={styles.stackText}>{`+${count - 1}곳 ↻`}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {item.lib.name}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={styles.area}>
              {sub}
            </Text>
          ) : null}
          <View style={styles.edge}>
            <Text style={styles.edgeText}>{formatDistance(item.distanceM)}</Text>
            <Text numberOfLines={1} style={[styles.edgeText, closed ? styles.closedText : null]}>
              {hoursOf(item.lib)}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export function FacadeHome(props: FacadeHomeProps) {
  const { center, viewSeq, libraries, originTitle, originSub, radiusKm, selectedId, onLibraryPress } = props;
  const layout = useMemo(() => groupLibrariesForFacade(center, libraries), [center, libraries]);
  const tones = useMemo(() => assignSpineTones(layout), [layout]);
  const [indices, setIndices] = useState<Partial<Record<FacadeSlot, number>>>({});

  // 보는 위치나 목록이 바뀌면 전환해 둔 자리를 처음(가장 가까운 곳)으로 되돌린다
  useEffect(() => {
    setIndices({});
  }, [center.lat, center.lng, viewSeq, libraries]);

  const cycle = (slot: FacadeSlot, count: number) =>
    setIndices((prev) => ({ ...prev, [slot]: ((prev[slot] ?? 0) + 1) % count }));

  return (
    <View style={styles.board} testID="facade-board">
      <FacadeGrid />
      <View style={styles.axis} pointerEvents="none" />
      <RulerTrack radiusKm={radiusKm} />
      <OriginPlinth title={originTitle} sub={originSub} />
      {layout.groups.map((g) => {
        const idx = indices[g.slot] ?? 0;
        const shown = g.items[idx % g.items.length] as FacadeItem;
        return (
          <ReliefLibraryBlock
            key={g.slot}
            group={g}
            index={idx}
            tone={tones.get(shown.lib.id) ?? "fill1"}
            selected={selectedId === shown.lib.id}
            onOpen={onLibraryPress}
            onCycle={cycle}
          />
        );
      })}
    </View>
  );
}

export type { FacadeKind };

const BLOCK_H = 104;

const styles = StyleSheet.create({
  board: { flex: 1, backgroundColor: C.panelFrosted, overflow: "hidden" },
  grid: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 8,
    bottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: C.seamHairline,
  },
  bay: {
    width: `${100 / GRID_COLS}%`,
    height: `${100 / GRID_ROWS}%`,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.seamHairline,
  },
  rivet: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: C.rivetBase },
  axis: { position: "absolute", top: 8, bottom: 8, left: "50%", width: 1, backgroundColor: C.seamHairline },
  ruler: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "40%",
    height: 36,
    marginTop: -18,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.surface3,
    paddingHorizontal: 10,
    justifyContent: "space-between",
  },
  ticks: { flexDirection: "row", justifyContent: "space-between", height: 14 },
  tick: { width: 1, height: 7, backgroundColor: C.inkStrong, opacity: 0.45 },
  tickMajor: { height: 14, opacity: 0.72 },
  rulerLabels: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 2 },
  rulerText: { fontSize: 10, color: C.inkMuted },
  plinthWrap: {
    position: "absolute",
    left: "50%",
    top: "40%",
    width: 78,
    height: 62,
    marginLeft: -39,
    marginTop: -31,
  },
  plinthSide: {
    position: "absolute",
    left: 6,
    top: 8,
    width: 78,
    height: 62,
    borderRadius: R.block,
    backgroundColor: C.reliefSideDark,
  },
  plinth: {
    width: 78,
    height: 62,
    borderRadius: R.block,
    backgroundColor: C.inkStrong,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.inkStrong,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 10 },
    elevation: 6,
  },
  cross: { width: 18, height: 18, marginBottom: 4 },
  crossV: { position: "absolute", left: 8, top: 0, width: 2.5, height: 18, backgroundColor: C.paper },
  crossH: { position: "absolute", top: 8, left: 0, width: 18, height: 2.5, backgroundColor: C.paper },
  plinthTitle: { fontSize: 10, fontWeight: "700", color: onFill(C.inkStrong) },
  plinthSub: { fontSize: 9, color: onFill(C.inkStrong), opacity: 0.75 },
  blockWrap: { position: "absolute", height: BLOCK_H },
  layer: { position: "absolute", width: "100%", height: BLOCK_H, borderRadius: R.block },
  slab: {
    position: "absolute",
    left: 10,
    top: 12,
    width: "100%",
    height: BLOCK_H,
    borderRadius: R.block,
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.surface3,
  },
  block: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: R.block,
    shadowColor: C.inkStrong,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 10 },
    elevation: 5,
  },
  blockSelected: { borderColor: C.inkStrong, borderWidth: 2 },
  spine: { width: 16, borderRightWidth: 1, borderColor: C.seamHairline },
  slit: {
    position: "absolute",
    top: 10,
    left: 3,
    right: 3,
    height: 22,
    backgroundColor: C.paper,
    opacity: 0.88,
    borderTopLeftRadius: R.libraryIconTop,
    borderTopRightRadius: R.libraryIconTop,
    borderBottomLeftRadius: R.libraryIconBottom,
    borderBottomRightRadius: R.libraryIconBottom,
  },
  blockBody: { flex: 1, paddingVertical: 8, paddingHorizontal: 9, justifyContent: "space-between" },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  code: { fontSize: 10.5, fontWeight: "700", color: C.inkMuted },
  stackPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: R.block, backgroundColor: C.inkStrong },
  stackText: { fontSize: 10, fontWeight: "700", color: onFill(C.inkStrong) },
  name: { fontSize: 14, fontWeight: "700", color: C.text },
  area: { fontSize: 11, color: C.inkMuted },
  edge: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
  },
  edgeText: { fontSize: 11, fontWeight: "700", color: C.text },
  closedText: { color: C.pinClosed },
});
