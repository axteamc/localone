// 홈 파사드(시안 C): 프로스티드 유리 격자 + 수평 스케일 룰러 + 중앙 + 기점 + 3D 컬러 스파인 블록 (VISIT-1 총정리 §2).
// 지도는 쓰지 않는다. 색·곡률은 theme 토큰만 쓴다.
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { onFill, theme, type as T } from "../../theme";
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
import { snapOffsets } from "./useHomeSheet";

const { colors: C, radii: R } = theme;
const BLOCK_BORDER = 1; // styles.block borderWidth
const BODY_PAD_V = 8;
const BODY_PAD_H = 9;
const PILL_H = 15; // "+N곳 ↻" 알약(글자 10 + 위아래 여백)
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

/** 칸별 자리. 맨 아래는 홈 하단 창(HomeSheet)이 덮으므로 블록은 위쪽 절반에 모은다.
 *  네 칸(NW·NE·SW·SE) 세로 자리는 판 높이를 잰 뒤 quadLayout()이 px로 정한다(아래는 재기 전 자리) */
const SLOT_STYLE: Record<FacadeSlot, ViewStyle> = {
  NW: { left: 16, width: "44%", top: "5%" },
  NE: { right: 22, width: "44%", top: "3%" },
  SW: { left: 16, width: "44%", bottom: "52%" },
  SE: { right: 22, width: "44%", bottom: "51%" },
  W: { left: 16, width: "44%", top: "14%" },
  E: { right: 22, width: "44%", top: "14%" },
  MAIN: { left: 28, right: 34, top: "8%" },
};

/** 넓은 화면(태블릿·가로 휴대폰)에서 블록이 늘어나지 않게 폭 상한, 가운데 축 양옆에 붙인다(2026-11-18 D) */
export const BLOCK_W_MAX = 300;
const AXIS_GAP_W = 7; // 서쪽 블록 오른쪽 끝 ~ 축(휴대폰에서 지금 자리와 같다)
const AXIS_GAP_E = 2; // 축 ~ 동쪽 블록 왼쪽 끝

/** 판 폭에 따른 블록 가로 자리. 휴대폰(폭 44% ≤ 300)에서는 지금 퍼센트 자리와 거의 같다 */
export function horizontalPlace(slot: FacadeSlot, boardWidth: number): { left: number; width: number } {
  const mid = boardWidth / 2;
  if (slot === "MAIN") {
    const width = Math.min(boardWidth - 62, BLOCK_W_MAX + 60);
    return { left: Math.round(mid - width / 2 - 3), width };
  }
  const width = Math.min(Math.round(boardWidth * 0.44), BLOCK_W_MAX);
  const west = slot === "NW" || slot === "SW" || slot === "W";
  return { left: Math.round(west ? mid - AXIS_GAP_W - width : mid + AXIS_GAP_E), width };
}

const BLOCK_H = 104;
/** 작은 화면에서 줄일 수 있는 블록 높이 하한(코드·이름·거리 줄이 남는 높이) */
const BLOCK_H_MIN = 64;
/** 이보다 낮으면 지역 줄을 뺀다 */
const BLOCK_H_FULL_TEXT = 90;
const QUAD_TOP = 10; // 판 위 여백
const QUAD_STAGGER = 6; // 같은 줄 두 블록의 어긋남
const QUAD_BOTTOM = 6; // 남쪽 블록 아래 끝과 창 위쪽 끝 사이
const PLINTH_W = 78;
const PLINTH_H = 62;
/** 북·남 줄 사이 = 기점 매스 높이 + 위아래 1px. 기점이 블록 글자를 덮지도, 블록에 가려지지도 않게(2026-11-18 D 지적 ②) */
const QUAD_MID = PLINTH_H + 2;
/** 한 줄 배치(W·E·MAIN): 블록 아래 끝(두께 그림자 8 포함)과 기점 위 끝 사이 */
const UPPER_GAP = 8 + 8;
const ORIGIN_RATIO = 0.4;

export type QuadLayout = {
  /** 하단 창이 평소 높이(half)일 때 창 위로 보이는 판 높이 */
  visible: number;
  blockH: number;
  top: Record<"NW" | "NE" | "SW" | "SE", number>;
  /** 룰러·기점의 세로 가운데 */
  originY: number;
};

/**
 * ③-2: 네 칸 배치의 세로 자리. 파사드와 하단 창은 같은 영역을 쓰므로, 처음 열린 홈(half)에서
 * 남쪽 블록까지 창 위쪽 끝(snapOffsets(h).half) 위에 오게 한다. 자리가 모자라면 블록 높이를 줄인다.
 */
export function quadLayout(boardHeight: number): QuadLayout {
  const visible = snapOffsets(boardHeight).half;
  const fit = Math.floor((visible - QUAD_TOP - QUAD_STAGGER - QUAD_BOTTOM - QUAD_MID - QUAD_STAGGER) / 2);
  const blockH = Math.max(BLOCK_H_MIN, Math.min(BLOCK_H, fit));
  const SE = visible - QUAD_BOTTOM - blockH;
  const SW = SE - QUAD_STAGGER;
  const NE = QUAD_TOP;
  const NW = NE + QUAD_STAGGER;
  return { visible, blockH, top: { NW, NE, SW, SE }, originY: Math.round((NW + blockH + SW) / 2) };
}

export type UpperLayout = { blockH: number; top: number; originY: number };

/**
 * 한 줄 배치(dual·single)의 세로 자리. 퍼센트 자리를 그대로 쓰면 낮은 화면에서 블록이 기점 매스를 덮었다(D 지적 ②).
 * 블록 아래 끝이 기점 위 끝보다 UPPER_GAP 위에 오게 하고, 자리가 모자라면 블록 높이를 줄인다.
 */
export function upperLayout(boardHeight: number, slot: FacadeSlot): UpperLayout {
  const originY = Math.round(boardHeight * ORIGIN_RATIO);
  const limit = originY - PLINTH_H / 2 - UPPER_GAP; // 블록 아래 끝 한계
  const blockH = Math.max(BLOCK_H_MIN, Math.min(BLOCK_H, limit - QUAD_TOP));
  const pct = slot === "MAIN" ? 0.08 : 0.14;
  const top = Math.max(QUAD_TOP, Math.min(Math.round(boardHeight * pct), limit - blockH));
  return { blockH, top, originY };
}

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

function RulerTrack({ radiusKm, y }: { radiusKm: number; y?: number }) {
  const half = radiusKm / 2;
  const third = (radiusKm / 6).toFixed(1);
  return (
    <View style={[styles.ruler, y != null ? { top: y } : null]} pointerEvents="none" testID="facade-ruler">
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

function OriginPlinth({ title, sub, y }: { title: string; sub: string; y?: number }) {
  return (
    <View style={[styles.plinthWrap, y != null ? { top: y } : null]} pointerEvents="none" testID="facade-origin">
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
  /** 네 칸 배치에서 판 높이를 잰 뒤의 세로 자리·높이 */
  place?: { top: number; height: number };
  /** 판 폭을 잰 뒤의 가로 자리 */
  hplace?: { left: number; width: number };
  onOpen(lib: LibrarySummary): void;
  onCycle(slot: FacadeSlot, count: number): void;
};

function ReliefLibraryBlock({ group, index, tone, selected, place, hplace, onOpen, onCycle }: BlockProps) {
  const item: FacadeItem = group.items[index % group.items.length] as FacadeItem;
  const count = group.items.length;
  const closed = item.lib.today.is_closed === true;
  const h = place?.height ?? BLOCK_H;
  const sub = h >= BLOCK_H_FULL_TEXT ? item.lib.area_label ?? item.lib.address ?? "" : "";
  const placed: ViewStyle | null = place ? { top: place.top, bottom: undefined, height: h } : null;
  const across: ViewStyle | null = hplace ? { left: hplace.left, right: undefined, width: hplace.width } : null;
  return (
    <View style={[styles.blockWrap, SLOT_STYLE[group.slot], placed, across]} testID={`facade-block-${group.slot}`}>
      {count > 1 ? <View style={[styles.slab, { height: h }]} /> : null}
      <View style={[styles.layer, { left: 3, top: 4, height: h, backgroundColor: C.surface3 }]} />
      <View style={[styles.layer, { left: 6, top: 8, height: h, backgroundColor: C.reliefSideDark }]} />
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
      {/* 버튼 안 버튼 금지(웹 <button> 중첩 오류, 시연 전 개선 S1 W-3): 블록 버튼의 형제로 두고 머리 줄 오른쪽에 겹친다 */}
      {count > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`같은 방향 도서관 ${count - 1}곳 더 보기`}
          onPress={() => onCycle(group.slot, count)}
          style={styles.stackPill}
          testID={`facade-cycle-${group.slot}`}
        >
          <Text style={styles.stackText}>{`+${count - 1}곳 ↻`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FacadeHome(props: FacadeHomeProps) {
  const { center, viewSeq, libraries, originTitle, originSub, radiusKm, selectedId, onLibraryPress } = props;
  const layout = useMemo(() => groupLibrariesForFacade(center, libraries), [center, libraries]);
  const tones = useMemo(() => assignSpineTones(layout), [layout]);
  const [indices, setIndices] = useState<Partial<Record<FacadeSlot, number>>>({});
  const [boardH, setBoardH] = useState(0);
  const [boardW, setBoardW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    setBoardH(e.nativeEvent.layout.height);
    setBoardW(e.nativeEvent.layout.width);
  };
  const quad = layout.kind === "quad" && boardH > 0 ? quadLayout(boardH) : null;
  const upper = (slot: FacadeSlot) => (boardH > 0 && !quad ? upperLayout(boardH, slot) : null);
  const originY = quad?.originY ?? (boardH > 0 ? Math.round(boardH * ORIGIN_RATIO) : undefined);
  const placeOf = (slot: FacadeSlot): { top: number; height: number } | undefined => {
    if (quad && slot in quad.top) return { top: quad.top[slot as keyof QuadLayout["top"]], height: quad.blockH };
    const u = upper(slot);
    return u ? { top: u.top, height: u.blockH } : undefined;
  };

  // 보는 위치나 목록이 바뀌면 전환해 둔 자리를 처음(가장 가까운 곳)으로 되돌린다
  useEffect(() => {
    setIndices({});
  }, [center.lat, center.lng, viewSeq, libraries]);

  const cycle = (slot: FacadeSlot, count: number) =>
    setIndices((prev) => ({ ...prev, [slot]: ((prev[slot] ?? 0) + 1) % count }));

  return (
    <View style={styles.board} testID="facade-board" onLayout={onLayout}>
      <FacadeGrid />
      <View style={styles.axis} pointerEvents="none" />
      <RulerTrack radiusKm={radiusKm} y={originY} />
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
            place={placeOf(g.slot)}
            hplace={boardW > 0 ? horizontalPlace(g.slot, boardW) : undefined}
            onOpen={onLibraryPress}
            onCycle={cycle}
          />
        );
      })}
      {/* 기점은 블록 뒤에 깔리지 않게 맨 마지막(맨 위)에 그린다 */}
      <OriginPlinth title={originTitle} sub={originSub} y={originY} />
    </View>
  );
}

export type { FacadeKind };

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
  rulerText: { ...T.gauge, fontSize: 9, letterSpacing: 1 },
  plinthWrap: {
    position: "absolute",
    left: "50%",
    top: "40%",
    width: PLINTH_W,
    height: PLINTH_H,
    marginLeft: -PLINTH_W / 2,
    marginTop: -PLINTH_H / 2,
    zIndex: 2,
  },
  plinthSide: {
    position: "absolute",
    left: 6,
    top: 8,
    width: PLINTH_W,
    height: PLINTH_H,
    borderRadius: R.block,
    backgroundColor: C.reliefSideDark,
  },
  plinth: {
    width: PLINTH_W,
    height: PLINTH_H,
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
  plinthTitle: { fontSize: 10, fontWeight: "500", color: onFill(C.inkStrong) },
  plinthSub: { ...T.gauge, fontSize: 8.5, letterSpacing: 1, color: onFill(C.inkStrong), opacity: 0.75 },
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
    borderWidth: BLOCK_BORDER,
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
  blockBody: { flex: 1, paddingVertical: BODY_PAD_V, paddingHorizontal: BODY_PAD_H, justifyContent: "space-between" },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, minHeight: PILL_H },
  code: { ...T.gauge, fontSize: 9.5 },
  // 블록 테두리 1 + 몸통 여백만큼 안쪽, 머리 줄과 같은 높이(예전 머리 줄 안 자리와 같다)
  stackPill: {
    position: "absolute",
    top: BLOCK_BORDER + BODY_PAD_V,
    right: BLOCK_BORDER + BODY_PAD_H,
    height: PILL_H,
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: R.block,
    backgroundColor: C.inkStrong,
  },
  stackText: { fontSize: 10, fontWeight: "500", color: onFill(C.inkStrong) },
  name: { ...T.name },
  area: { fontSize: 11, color: C.inkMuted },
  edge: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: C.seamHairline,
  },
  edgeText: { ...T.gauge, fontSize: 9.5, color: C.inkSoft },
  closedText: { color: C.pinClosed },
});
