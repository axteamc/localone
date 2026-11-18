// 홈 파사드 — 등각 큐브(C2) + 주인공 포커스·가장자리 걸침 (VISIT-1 V3·V18, 2026-11-18 D 결정 "홈 큐브 배치").
// 기준 시안: 개발산출물/시안/홈_파사드_큐브_시안.html "3. 실제 배치 미리보기 v2". 지도는 쓰지 않는다. 색·곡률은 theme 토큰만.
// 세 플랫폼 같은 코드: 큐브 면은 View + transform(rotate·skewY·scale), 끌기는 PanResponder, 움직임은 Animated(useNativeDriver: false — 웹과 같게).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { mix, onFill, theme, type as T } from "../../theme";
import type { LatLng, LibrarySummary } from "./deps";
import {
  CUBE_H,
  CUBE_W,
  assignSpineTones,
  facadeItems,
  heroScene,
  initialHeroId,
  pickByDrag,
  ringScene,
  shownItems,
  type CubePlace,
  type CubeRole,
  type FacadeItem,
  type FacadeScene,
  type HeroRule,
  type SpineTone,
} from "./direction";
import { formatDistance } from "./format";
import { snapOffsets } from "./useHomeSheet";

const { colors: C, radii: R } = theme;

/** 움직임 0.8초, 끝으로 갈수록 천천히(시안 cubic-bezier(.22,1,.36,1)) */
export const MOVE_MS = 800;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** 주인공 큐브 꾹 누르기(처음 주인공 설정 메뉴) */
export const LONG_PRESS_MS = 600;
/** 기점에 맞춘 격자 간격(시안 96px). 따로 그린 축 선은 없다 — 기점을 지나는 격자선이 축 */
const GRID_STEP = 96;
const PLINTH_W = 58;
const PLINTH_H = 44;
/** 재기 전(시험·첫 그리기) 판 크기: 390×844 웹에서 하단 창 위로 보이는 판 */
const FALLBACK_W = 390;
const FALLBACK_H = 325;

export type FacadeHomeProps = {
  center: LatLng;
  /** 보는 위치를 다시 정할 때마다 바뀐다. 바뀌면 주인공·전체 보기를 처음으로 되돌린다 */
  viewSeq?: number;
  libraries: LibrarySummary[];
  /** 기점에 새기는 이름. 예: "현위치", "임시 시작점" */
  originTitle: string;
  originSub: string;
  /** 찾기 창에서 고른 도서관(V12). 판에 있으면 그곳이 주인공 */
  selectedId: number | null;
  /** 처음 주인공 설정(기기 저장). 기본 "nearest" */
  heroRule?: HeroRule;
  /** 최근 방문한 도서관 id(heroRule "recent"일 때) */
  recentId?: number | null;
  onHeroRuleChange?(rule: HeroRule): void;
  onLibraryPress(lib: LibrarySummary): void;
};

const TEXT = {
  menuTitle: "홈을 열면 처음 크게 보일 도서관",
  nearest: "가장 가까운 곳",
  recent: "최근 방문한 곳",
  basic: "기본",
  ring: "주변 도서관 전체 보기",
  back: "원래 도서관 크게 보기",
};

function toneColor(tone: SpineTone): string {
  return tone === "closed" ? C.pinClosed : C[tone];
}

function statusOf(lib: LibrarySummary): string {
  if (lib.today.is_closed === true) return "CLOSED";
  if (lib.today.is_closed === false) return "OPEN";
  return "—";
}

function hoursOf(lib: LibrarySummary): string {
  if (lib.today.is_closed === true) return "오늘 휴관";
  return lib.today.hours_text ?? "";
}

/** 윗면 이름 한 줄 길이(큐브 기본 좌표). 윗면 마름모 가운데 줄 110.8에서 양옆 여백을 뺀 값 */
const TOP_LINE = 92;
const TOP_LS = 1;
/**
 * 윗면 이름 글자 크기·줄 수(큐브 기본 좌표). 이름 줄이는 규칙은 디자인 뒤라(D 결정) 그 전까지는
 * 7자 이상이면 두 줄로 나누고, 한 줄이 윗면 안에 들어오게 글자를 줄인다 — 기본값(Claude, 임시)
 */
export function topFont(name: string, role: CubeRole, scale: number): { fontSize: number; lines: 1 | 2; width: number } {
  const len = Math.max(1, [...name].length);
  const lines = len > 6 ? 2 : 1;
  const per = Math.ceil(len / lines);
  const want = role === "hero" ? 16 : 12.5 / scale; // 걸침·전체 보기는 화면에서 약 12.5px
  const fontSize = Math.max(6, Math.min(want, TOP_LINE / per - TOP_LS));
  return { fontSize, lines, width: Math.ceil(per * (fontSize + TOP_LS)) + 2 };
}

type Anim = { cx: Animated.Value; cy: Animated.Value; scale: Animated.Value };

type CubeProps = {
  item: FacadeItem;
  tone: SpineTone;
  place: CubePlace;
  anim: Anim;
  onPress(): void;
  onLongPress?(): void;
};

/** C2 등각 큐브: 윗면 = 색 + 이름, 왼쪽 면 = 상태·거리·주소, 오른쪽 면 = 오늘·방위 */
function IsoCube({ item, tone, place, anim, onPress, onLongPress }: CubeProps) {
  const { lib } = item;
  const fill = toneColor(tone);
  const hero = place.role === "hero";
  const label = hero ? `${lib.name} ${formatDistance(item.distanceM)}` : `${lib.name} 크게 보기`;
  const fs = topFont(lib.name, place.role, place.scale);
  const quiet = hero ? null : styles.quiet;
  return (
    <Animated.View
      testID={hero ? "facade-hero" : `facade-cube-${lib.id}`}
      accessibilityHint={place.role}
      style={[
        styles.cube,
        {
          left: Animated.subtract(anim.cx, CUBE_W / 2),
          top: Animated.subtract(anim.cy, CUBE_H / 2),
          zIndex: hero ? 4 : place.role === "ring" ? 3 : 2,
          opacity: place.role === "peek" ? 0.94 : 1,
          transform: [{ scale: anim.scale }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={LONG_PRESS_MS}
        style={styles.cubeHit}
      >
        <View style={styles.ground} />
        <View style={[styles.faceLeft, hero ? styles.faceHero : null]}>
          <View style={styles.leftTop}>
            <View style={styles.badge}>
              <View style={[styles.dot, { backgroundColor: fill }]} />
              <Text style={styles.status}>{statusOf(lib)}</Text>
            </View>
            <Text style={styles.dist}>{formatDistance(item.distanceM)}</Text>
          </View>
          <View style={quiet}>
            <Text style={styles.lbl}>ADDRESS</Text>
            <Text numberOfLines={2} style={styles.addr}>
              {lib.area_label ?? lib.address ?? ""}
            </Text>
          </View>
        </View>
        <View style={[styles.faceRight, hero ? styles.faceHero : null]}>
          <View style={quiet}>
            <Text style={styles.lbl}>TODAY</Text>
            <Text numberOfLines={2} style={[styles.hours, lib.today.is_closed === true ? styles.closed : null]}>
              {hoursOf(lib)}
            </Text>
          </View>
          <View style={[styles.bearWrap, quiet]}>
            <Text style={styles.lbl}>BEARING</Text>
            <Text style={styles.bear}>{item.code}</Text>
          </View>
        </View>
        <View style={[styles.faceTop, { backgroundColor: fill }]} />
        <View style={styles.topTextWrap} pointerEvents="none">
          <Text
            numberOfLines={fs.lines}
            style={[styles.topText, { fontSize: fs.fontSize, lineHeight: fs.fontSize * 1.2, width: fs.width, color: mix(fill, C.inkStrong, 0.4) }]}
          >
            {lib.name}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** 기점에 맞춘 격자. 기점과 함께 움직인다 */
function OriginGrid({ origin, w, h }: { origin: Animated.ValueXY; w: number; h: number }) {
  const nx = Math.ceil(w / GRID_STEP) + 1;
  const ny = Math.ceil(h / GRID_STEP) + 1;
  const xs = Array.from({ length: nx * 2 + 1 }, (_, i) => (i - nx) * GRID_STEP);
  const ys = Array.from({ length: ny * 2 + 1 }, (_, i) => (i - ny) * GRID_STEP);
  return (
    <Animated.View
      pointerEvents="none"
      testID="facade-grid"
      style={[styles.gridLayer, { left: origin.x, top: origin.y }]}
    >
      {xs.map((x) => (
        <View key={`v${x}`} style={[styles.gridV, { left: x, top: -ny * GRID_STEP, height: ny * 2 * GRID_STEP }]} />
      ))}
      {ys.map((y) => (
        <View key={`h${y}`} style={[styles.gridH, { top: y, left: -nx * GRID_STEP, width: nx * 2 * GRID_STEP }]} />
      ))}
    </Animated.View>
  );
}

export function FacadeHome(props: FacadeHomeProps) {
  const { center, viewSeq, libraries, originTitle, originSub, selectedId, onLibraryPress } = props;
  const heroRule = props.heroRule ?? "nearest";
  const recentId = props.recentId ?? null;

  const items = useMemo(() => facadeItems(center, libraries), [center, libraries]);
  const tones = useMemo(() => assignSpineTones(items), [items]);

  const [boardH, setBoardH] = useState(0);
  const [boardW, setBoardW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    setBoardH(e.nativeEvent.layout.height);
    setBoardW(e.nativeEvent.layout.width);
  };
  // V18: 하단 창이 평소 높이(half)일 때 창 위로 보이는 판 안에 놓는다
  const W = boardW > 0 ? boardW : FALLBACK_W;
  const H = boardH > 0 ? snapOffsets(boardH).half : FALLBACK_H;

  // 사용자가 고른 주인공·전체 보기. 보는 위치·목록·설정이 바뀌면 처음으로
  const [chosen, setChosen] = useState<number | null>(null);
  const [ring, setRing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setChosen(null);
    setRing(false);
    setMenuOpen(false);
  }, [center.lat, center.lng, viewSeq, libraries, heroRule, recentId]);

  const has = (id: number | null) => id != null && items.some((it) => it.lib.id === id);
  const heroId = has(chosen) ? chosen : has(selectedId) ? selectedId : initialHeroId(items, heroRule, recentId);
  const shown = useMemo(() => shownItems(items, heroId), [items, heroId]);
  const scene: FacadeScene = useMemo(
    () => (heroId == null ? { origin: { x: W / 2, y: H / 2 }, cubes: [] } : ring ? ringScene(shown, W, H) : heroScene(shown, heroId, W, H)),
    [shown, heroId, ring, W, H]
  );

  // 큐브마다 움직임 값. 처음 보이는 큐브는 그 자리에서 시작하고, 그 뒤 바뀐 자리로는 0.8초에 걸쳐 옮긴다
  const anims = useRef(new Map<number, Anim>()).current;
  const origin = useRef(new Animated.ValueXY(scene.origin)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hadCubes = useRef(false);
  for (const c of scene.cubes) {
    if (!anims.has(c.id)) anims.set(c.id, { cx: new Animated.Value(c.cx), cy: new Animated.Value(c.cy), scale: new Animated.Value(c.scale) });
  }
  useEffect(() => {
    if (scene.cubes.length === 0) {
      hadCubes.current = false;
      origin.setValue(scene.origin);
      return;
    }
    if (!hadCubes.current) {
      hadCubes.current = true;
      origin.setValue(scene.origin);
      for (const c of scene.cubes) {
        const a = anims.get(c.id) as Anim;
        a.cx.setValue(c.cx);
        a.cy.setValue(c.cy);
        a.scale.setValue(c.scale);
      }
      return;
    }
    const to = (v: Animated.Value | Animated.ValueXY, toValue: number | { x: number; y: number }) =>
      Animated.timing(v, { toValue, duration: MOVE_MS, easing: EASE, useNativeDriver: false });
    const runs = [to(origin, scene.origin)];
    for (const c of scene.cubes) {
      const a = anims.get(c.id) as Anim;
      runs.push(to(a.cx, c.cx), to(a.cy, c.cy), to(a.scale, c.scale));
    }
    const all = Animated.parallel(runs);
    all.start();
    return () => all.stop();
  }, [scene, anims, origin]);

  // 빈 판 끌기(주인공 모드만): 지도처럼 끈 반대 방향의 도서관이 주인공. 40px 미만이면 제자리로
  const live = useRef({ shown, heroId, ring });
  live.current = { shown, heroId, ring };
  const responder = useMemo(
    () =>
      PanResponder.create({
        // 큐브·기점 위에서 시작해도 6px 넘게 움직이면 판이 가져간다(그 누름은 취소된다 — 웹 Pressable도 끌기 뒤 눌림으로 치지 않게)
        onMoveShouldSetPanResponderCapture: (_, g) => !live.current.ring && Math.hypot(g.dx, g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => setMenuOpen(false),
        onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy }),
        onPanResponderRelease: (_, g) => {
          Animated.timing(pan, { toValue: { x: 0, y: 0 }, duration: MOVE_MS, easing: EASE, useNativeDriver: false }).start();
          const pick = pickByDrag(live.current.shown, live.current.heroId, g.dx, g.dy);
          if (pick != null) setChosen(pick);
        },
        onPanResponderTerminate: () => {
          Animated.timing(pan, { toValue: { x: 0, y: 0 }, duration: MOVE_MS, easing: EASE, useNativeDriver: false }).start();
        },
      }),
    [pan]
  );

  const byId = new Map(shown.map((it) => [it.lib.id, it]));
  const heroPlace = scene.cubes.find((c) => c.role === "hero");
  const chooseRule = (rule: HeroRule) => {
    setMenuOpen(false);
    props.onHeroRuleChange?.(rule);
  };

  return (
    <View style={styles.board} testID="facade-board" onLayout={onLayout} {...responder.panHandlers}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pan.getTranslateTransform() }]} pointerEvents="box-none">
        <OriginGrid origin={origin} w={W} h={Math.max(H, boardH)} />
        {scene.cubes.map((c) => {
          const it = byId.get(c.id);
          if (!it) return null;
          const open = () => onLibraryPress(it.lib);
          const focus = () => {
            setMenuOpen(false);
            setRing(false);
            setChosen(c.id);
          };
          return (
            <IsoCube
              key={c.id}
              item={it}
              tone={tones.get(c.id) ?? "fill1"}
              place={c}
              anim={anims.get(c.id) as Anim}
              onPress={c.role === "hero" ? open : focus}
              onLongPress={c.role === "hero" ? () => setMenuOpen(true) : undefined}
            />
          );
        })}
        {/* 기점: 누르면 전체 보기 ↔ 원래 주인공 */}
        <Animated.View
          style={[styles.plinthWrap, { left: Animated.subtract(origin.x, PLINTH_W / 2), top: Animated.subtract(origin.y, PLINTH_H / 2) }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ring ? TEXT.back : TEXT.ring}
            testID="facade-origin"
            onPress={() => {
              setMenuOpen(false);
              setRing((r) => !r);
            }}
            style={styles.plinth}
          >
            <Text style={styles.plus}>+</Text>
            <Text style={styles.plinthTitle}>{originTitle}</Text>
            <Text style={styles.plinthSub}>{originSub}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>

      {menuOpen && heroPlace ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="메뉴 닫기" />
          <View
            accessibilityRole="menu"
            testID="facade-hero-menu"
            style={[
              styles.menu,
              {
                left: Math.min(W - 212, Math.max(8, heroPlace.cx - 102)),
                top: Math.min(H - 140, Math.max(8, heroPlace.cy - 60)),
              },
            ]}
          >
            <Text style={styles.menuTitle}>{TEXT.menuTitle}</Text>
            {(["nearest", "recent"] as const).map((rule) => (
              <Pressable
                key={rule}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: heroRule === rule }}
                onPress={() => chooseRule(rule)}
                style={[styles.menuItem, heroRule === rule ? styles.menuItemOn : null]}
              >
                <Text style={styles.menuText}>{rule === "nearest" ? TEXT.nearest : TEXT.recent}</Text>
                {rule === "nearest" ? <Text style={styles.menuSmall}>{TEXT.basic}</Text> : null}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const TOP_SIDE = 192 / Math.SQRT2; // 윗면 마름모(192×110.8)를 만드는 정사각형 한 변
const LEFT_FACE = mix(C.paper, C.surface3, 0.8);

const styles = StyleSheet.create({
  // 웹에서 꾹 누르기·끌기 때 글자가 선택되지 않게
  board: { flex: 1, backgroundColor: C.panelFrosted, overflow: "hidden", userSelect: "none" },
  gridLayer: { position: "absolute", width: 0, height: 0, opacity: 0.8 },
  gridV: { position: "absolute", width: 1, backgroundColor: C.seamHairline },
  gridH: { position: "absolute", height: 1, backgroundColor: C.seamHairline },
  cube: { position: "absolute", width: CUBE_W, height: CUBE_H },
  cubeHit: { width: CUBE_W, height: CUBE_H },
  // 바닥 그림자(시안의 흐린 다각형 대신 옅은 마름모)
  ground: {
    position: "absolute",
    left: 110 - TOP_SIDE / 2 + 8,
    top: 150 - TOP_SIDE / 2,
    width: TOP_SIDE,
    height: TOP_SIDE,
    backgroundColor: C.shadowAmbient,
    transform: [{ scaleY: 110.8 / 192 }, { rotate: "45deg" }],
  },
  // 윗면: (110,12)·(206,67.4)·(110,122.8)·(14,67.4)
  faceTop: {
    position: "absolute",
    left: 110 - TOP_SIDE / 2,
    top: 67.4 - TOP_SIDE / 2,
    width: TOP_SIDE,
    height: TOP_SIDE,
    borderWidth: 1,
    borderColor: C.seamHairline,
    transform: [{ scaleY: 110.8 / 192 }, { rotate: "45deg" }],
  },
  topTextWrap: {
    position: "absolute",
    left: 14,
    top: 67.4 - 30,
    width: 192,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-30deg" }, { skewX: "30deg" }, { scaleY: 0.866 }],
  },
  topText: { fontWeight: "500", letterSpacing: TOP_LS, textAlign: "center" },
  // 왼쪽 면: (14,67.4) 기준 96×78, skewY(30°)
  faceLeft: {
    position: "absolute",
    left: 14,
    top: 67.4,
    width: 96,
    height: 78,
    transformOrigin: "left top",
    transform: [{ skewY: "30deg" }],
    backgroundColor: LEFT_FACE,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: C.seamHairline,
    paddingVertical: 7,
    paddingHorizontal: 8,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  // 오른쪽 면: (110,122.8) 기준 96×78, skewY(-30°)
  faceRight: {
    position: "absolute",
    left: 110,
    top: 122.8,
    width: 96,
    height: 78,
    transformOrigin: "left top",
    transform: [{ skewY: "-30deg" }],
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.seamHairline,
    paddingVertical: 7,
    paddingHorizontal: 8,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  faceHero: { borderColor: C.inkStrong },
  quiet: { opacity: 0.5 },
  leftTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  status: { fontSize: 8, fontWeight: "500", letterSpacing: 0.3, color: C.inkStrong },
  dist: { fontSize: 8, fontWeight: "500", color: C.inkMuted },
  lbl: { fontSize: 6.5, fontWeight: "500", letterSpacing: 0.7, color: C.inkMuted },
  addr: { fontSize: 8.5, lineHeight: 11, fontWeight: "500", color: C.inkSoft },
  hours: { fontSize: 8, lineHeight: 10.5, fontWeight: "500", color: C.inkStrong },
  closed: { color: C.pinClosed },
  bearWrap: { borderTopWidth: 1, borderColor: C.seamHairline, paddingTop: 3 },
  bear: { ...T.gauge, fontSize: 9, fontWeight: "500", color: C.inkStrong },
  plinthWrap: { position: "absolute", width: PLINTH_W, height: PLINTH_H, zIndex: 6 },
  plinth: {
    width: PLINTH_W,
    height: PLINTH_H,
    borderRadius: R.block,
    backgroundColor: C.inkStrong,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.reliefSideDark,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 6 },
    elevation: 6,
  },
  plus: { fontSize: 14, lineHeight: 14, color: onFill(C.inkStrong) },
  plinthTitle: { fontSize: 8.5, fontWeight: "500", color: onFill(C.inkStrong) },
  plinthSub: { ...T.gauge, fontSize: 7, letterSpacing: 1, color: onFill(C.inkStrong), opacity: 0.85 },
  menu: {
    position: "absolute",
    zIndex: 9,
    width: 204,
    padding: 10,
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: R.infoCard,
    shadowColor: C.inkStrong,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuTitle: { fontSize: 12, color: C.inkSoft, marginBottom: 6 },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    borderRadius: R.control,
    borderWidth: 1,
    borderColor: C.seamHairline,
    backgroundColor: C.panelFrosted,
  },
  menuItemOn: { backgroundColor: C.panelLit, borderBottomWidth: 2, borderBottomColor: C.reliefBottomMid },
  menuText: { fontSize: 13, color: C.text },
  menuSmall: { ...T.gauge, fontSize: 9, letterSpacing: 1 },
});
