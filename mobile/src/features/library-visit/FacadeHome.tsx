// 홈 파사드 — 등각 큐브(C2) + 주인공 포커스·모서리 이웃 (VISIT-1 V3·V18, 2026-11-18 "홈 큐브 배치" · 2026-11-19 홈 큐브 개편 E1-A·E2-2·E3-2).
// 기준 시안: 개발산출물/시안/홈_큐브_개편_시안.html(배열·주인공 크기·이름), 큐브 모양은 홈_파사드_큐브_시안.html. 지도는 쓰지 않는다. 색·곡률은 theme 토큰만.
// 세 플랫폼 같은 코드: 큐브 면은 View 세 겹(회전·축 확대·회전, AffineBox — Android는 skew를 못 그림), 끌기는 PanResponder, 움직임은 Animated(useNativeDriver: false — 웹과 같게).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Ellipse, Polygon } from "react-native-svg";
import { affineLayers, composeMat, rotateMat, scaleMat, skewXMat, skewYMat } from "../../lib/affine";
import { mix, onFill, theme, type as T } from "../../theme";
import { CLOSED_CUBE_LID_INK, CUBE_PALETTE } from "../../theme/tokens";
import { createLatestRunner } from "../../lib/latest";
import type { LatLng, LibrarySummary } from "./deps";
import {
  CUBE_H,
  CUBE_W,
  assignSpineTones,
  computeDistanceMeters,
  facadeItems,
  heroScene,
  initialHeroId,
  paletteIndexOf,
  pickByDragScene,
  shownItems,
  type CubePlace,
  type FacadeItem,
  type FacadeScene,
  type HeroRule,
  type SpineTone,
} from "./direction";
import { formatDistance } from "./format";
import { HERO_MENU_TEXT } from "./heroText";
import { cubeNames, type CubeName } from "./shortName";
import { snapOffsets } from "./useHomeSheet";
import {
  gaugeKm,
  layoutMap,
  movedCenter,
  placeLabel,
  toKm,
  toLatLng,
  MAP_TILT,
  type KmPoint,
  type MapLayout,
  type Rect,
} from "./mapMode";

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
const FALLBACK_H = 400; // 창이 28%로 줄어 판이 커짐(2026-11-25 mac, 이전 325)

export type FacadeHomeProps = {
  center: LatLng;
  /** 보는 위치를 다시 정할 때마다 바뀐다. 바뀌면 주인공·전체 보기를 처음으로 되돌린다 */
  viewSeq?: number;
  libraries: LibrarySummary[];
  /** 기점에 새기는 이름(지도 모드). 예: "현위치", "임시 시작점" */
  originTitle: string;
  /** 주인공 보기의 기점 이름 — 누르면 지도 모드라 "지도 보기"(C-96). 없으면 originTitle */
  heroOriginTitle?: string;
  /** 지도 모드: 그 좌표에서 가까운 몇 곳(C-96 #10 nearest). 없으면 지금 목록만 그린다 */
  loadNearest?(at: LatLng, signal: AbortSignal): Promise<LibrarySummary[]>;
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
  ...HERO_MENU_TEXT,
  ring: "지도로 주변 도서관 보기",
  back: "원래 도서관 크게 보기",
  locate: "현위치로",
};

export function cubeLidColors(tone: SpineTone): { fill: string; ink: string } {
  if (tone === "closed") return { fill: C.pinClosed, ink: CLOSED_CUBE_LID_INK };
  const { hex, ink } = CUBE_PALETTE[tone] ?? CUBE_PALETTE[0];
  return { fill: hex, ink };
}

function statusOf(lib: LibrarySummary): string {
  if (lib.today.is_closed === true) return "CLOSED";
  if (lib.today.is_closed === false) return "OPEN";
  return "—";
}

function hoursOf(lib: LibrarySummary): string {
  if (lib.today.is_closed === true) return "오늘 휴관";
  return lib.today.hours_text ?? "운영시간 미확인";
}

/** 윗면 이름 상자(큐브 기본 좌표): 110.85×110.85 정사각형을 등각 변환하면 윗면 마름모에 정확히 포개진다(시안 .face-top-box) */
const TOP_BOX = 110.85;
const TOP_LS = 0.3;
/** E3-2(2026-11-19 D 채택): 기준(`ewm` 비율) 대비 -10% */
const FONT_F = 0.9;
/** 큰 글자가 이 글자 수 이상이면 두 줄 — 기본값(Claude) */
export const TWO_LINE_FROM = 6;
/** 작은 글자 = 큰 글자의 0.38배(최소 9) */
export const SMALL_RATIO = 0.38;

/**
 * 윗면 이름 크기·줄(큐브 기본 좌표, 화면에서는 × 큐브 배율). 시안 calcFont(E3-2) 그대로: 글자 수는 큰 글자만 센다(D 결정 §7.5).
 * 한 줄 최대 30.6 · 두 줄 최대 19.8, 윗면 사용 폭(90)과 목표 폭(67.5)에 맞춰 줄이고 최소 10.
 * 두 줄이면 앞쪽에 반 넘게(올림) 두고 나눈다. 역할(주인공·이웃·전체 보기)과 상관없이 같은 기본 크기다.
 */
export function topFont(big: string, small: string | null = null) {
  const chars = [...big];
  const len = Math.max(1, chars.length);
  const lines: 1 | 2 = len >= TWO_LINE_FROM ? 2 : 1;
  const per = lines === 2 ? Math.ceil(len / 2) + (len === 7 ? 0.6 : 0.3) : len;
  const byWidth = Math.min(90 / per, (75 * FONT_F) / Math.max(1.5, per * 0.92));
  const fontSize = Math.max(10, Math.min(lines === 1 ? 34 * FONT_F : 22 * FONT_F, byWidth));
  const cut = Math.ceil(len / 2);
  const text = lines === 2 ? `${chars.slice(0, cut).join("")}\n${chars.slice(cut).join("")}` : big;
  return { fontSize, lineHeight: fontSize * 1.08, lines, text, smallSize: small ? Math.max(9, fontSize * SMALL_RATIO) : 0 };
}

type Anim = { cx: Animated.Value; cy: Animated.Value; scale: Animated.Value };

type CubeProps = {
  item: FacadeItem;
  /** 윗면에 보일 이름(큰 글자 + 작은 글자) */
  title: CubeName;
  tone: SpineTone;
  place: CubePlace;
  anim: Anim;
  onPress(): void;
  onLongPress?(): void;
};

/** C2 등각 큐브: 윗면 = 색 + 이름, 왼쪽 면 = 상태·거리·주소, 오른쪽 면 = 오늘·방위 */
function HomeCube({ item, title, tone, place, anim, onPress, onLongPress }: CubeProps) {
  const { lib } = item;
  const { fill, ink } = cubeLidColors(tone);
  const hero = place.role === "hero";
  const label = hero ? `${lib.name} ${formatDistance(item.distanceM)}` : `${lib.name} 크게 보기`;
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
        <IsoCube title={title} fill={fill} ink={ink} emphasized={hero} left={<>
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
        </>} right={<>
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
        </>} />
      </Pressable>
    </Animated.View>
  );
}

/** 큐브의 공통 면과 윗면 이름. 배치·터치와 옆면 내용은 호출부가 정한다. */
export function IsoCube({ title, fill, ink, emphasized = false, left, right }: {
  title: CubeName;
  fill: string;
  ink: string;
  emphasized?: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const fs = topFont(title.big, title.small);
  return (
    <View style={styles.cubeHit} pointerEvents="none" accessible={false}>
      <AffineBox box={styles.ground} layers={GROUND_LAYERS} style={styles.groundFill} />
      <AffineBox box={styles.faceLeft} layers={LEFT_LAYERS} style={[styles.faceLeftFill, emphasized && styles.faceHero]}>{left}</AffineBox>
      <AffineBox box={styles.faceRight} layers={RIGHT_LAYERS} style={[styles.faceRightFill, emphasized && styles.faceHero]}>{right}</AffineBox>
      <AffineBox box={styles.faceTop} layers={TOP_LAYERS} testID="cube-lid" style={[styles.faceTopFill, { backgroundColor: fill }]} />
      {/* E3-2: 이름은 윗면 왼쪽 아래, 작은 글자는 큰 글자 왼쪽 위 */}
      <AffineBox box={styles.topBox} layers={TOP_BOX_LAYERS} testID="facade-top-name" style={styles.topBoxFill}>
          {title.small ? (
            <Text numberOfLines={1} style={[styles.topSmall, { fontSize: fs.smallSize, lineHeight: fs.smallSize * 1.1, color: ink }]}>
              {title.small}
            </Text>
          ) : null}
          <Text numberOfLines={fs.lines} style={[styles.topText, { fontSize: fs.fontSize, lineHeight: fs.lineHeight, color: ink }]}>
            {fs.text}
          </Text>
      </AffineBox>
    </View>
  );
}

type Layers = ReturnType<typeof affineLayers>;

/**
 * 기울인 면: `box`(변환 전 위치·크기) 안에 같은 크기 View 세 겹(회전 · 축 확대 · 회전)을 두고,
 * 채움·테두리·내용(`style`, children)은 맨 안쪽에 그린다. Android에서도 기울이기가 그대로 보인다(src/lib/affine.ts).
 */
function AffineBox({ box, layers, style, testID, children }: {
  box: object;
  layers: Layers;
  style?: React.ComponentProps<typeof View>["style"];
  testID?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[box, { transform: layers.outer }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { transform: layers.middle }]}>
        <View testID={testID} style={[StyleSheet.absoluteFill, { transform: layers.inner }, style]}>
          {children}
        </View>
      </View>
    </View>
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
  const { center, viewSeq, libraries, originTitle, selectedId, onLibraryPress } = props;
  const heroRule = props.heroRule ?? "nearest";
  const recentId = props.recentId ?? null;

  const items = useMemo(() => facadeItems(center, libraries), [center, libraries]);
  const tones = useMemo(() => assignSpineTones(items, CUBE_PALETTE.length), [items]);

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
  const titles = useMemo(() => cubeNames(shown.map((it) => it.lib)), [shown]);
  const scene: FacadeScene = useMemo(
    // 지도 모드(ring)는 MapBoard가 따로 그린다. 그동안 주인공 장면은 그대로 둬서 돌아올 때 튀지 않는다
    () => (heroId == null ? { origin: { x: W / 2, y: H / 2 }, cubes: [] } : heroScene(shown, heroId, W, H)),
    [shown, heroId, W, H]
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
  const live = useRef({ shown, heroId, ring, scene });
  live.current = { shown, heroId, ring, scene };
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
          const { scene: sc, shown: sh, heroId: hid } = live.current;
          const pick = pickByDragScene(sc, sh, hid, g.dx, g.dy);
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

  const fallbackNearest = useCallback(async () => libraries, [libraries]);

  return (
    <View style={styles.board} testID="facade-board" onLayout={onLayout} {...responder.panHandlers}>
      {ring ? (
        <MapBoard
          home={center}
          W={W}
          H={H}
          originTitle={originTitle}
          loadNearest={props.loadNearest ?? fallbackNearest}
          onLibraryPress={onLibraryPress}
          onBack={() => setRing(false)}
        />
      ) : (
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
            <HomeCube
              key={c.id}
              item={it}
              title={titles.get(c.id) ?? { big: it.lib.name, small: null }}
              tone={tones.get(c.id) ?? 0}
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
            <Text style={styles.plinthTitle}>{props.heroOriginTitle ?? originTitle}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
      )}

      {menuOpen && heroPlace && !ring ? (
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

// ── 지도 모드(C-96, 시안 홈_지도모드_시안.html 채택안 C) ─────────────────────────────
/** 지도 모드 큐브 크기: 판 폭의 약 11%(시안 26/240). 면 글자는 없고 위에 이름표 */
const MAP_CUBE_F = 0.11;
const LABEL_H = 28;
const LOCATE_SIZE = 40;

type MapItem = { lib: LibrarySummary; at: KmPoint };

/** 지도 모드 작은 큐브(시안 26×28 다각형): 윗면 = 도서관 색, 옆면 두 장, 진한 테두리. 면 글자는 없다 */
function MapCube({ width, height, lid }: { width: number; height: number; lid: string }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 26 28" pointerEvents="none">
      <Polygon points="13,1 25,7 13,13 1,7" fill={lid} stroke={C.inkStrong} strokeWidth={0.7} strokeLinejoin="round" />
      <Polygon points="1,7 13,13 13,27 1,21" fill={LEFT_FACE} stroke={C.inkStrong} strokeWidth={0.7} strokeLinejoin="round" />
      <Polygon points="25,7 13,13 13,27 25,21" fill={C.surface2} stroke={C.inkStrong} strokeWidth={0.7} strokeLinejoin="round" />
    </Svg>
  );
}

/** 지도 모드 바닥(v2 바닥 A): 가운데 기준 거리 고리 2개(기울인 평면이라 타원) + 둥근 거리 글자, 오른쪽 위 북쪽 표시 */
function MapRings({ layout, W, H, drag }: { layout: MapLayout<MapItem>; W: number; H: number; drag: { x: number; y: number } }) {
  const cx = W / 2 + drag.x;
  const cy = H / 2 + drag.y;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="map-rings">
      <Svg width={W} height={H}>
        {layout.rings.map((g) => (
          <Ellipse
            key={g.km}
            cx={cx}
            cy={cy}
            rx={g.r}
            ry={g.r * MAP_TILT}
            fill="none"
            stroke={C.inkStrong}
            strokeOpacity={0.35}
            strokeDasharray="4 4"
          />
        ))}
      </Svg>
      {layout.rings.map((g) => (
        <Text key={g.km} style={[styles.mapRingText, { left: cx + g.r + 4, top: cy - 7 }]} testID={`map-ring-${g.km}`}>
          {gaugeKm(g.km)}
        </Text>
      ))}
      <View style={styles.mapNorth}>
        <Text style={styles.mapNorthText}>N</Text>
        <View style={styles.mapNorthArrow} />
      </View>
    </View>
  );
}

function MapBoard({ home, W, H, originTitle, loadNearest, onLibraryPress, onBack }: {
  /** 현위치(기점) 좌표 */
  home: LatLng;
  W: number;
  H: number;
  originTitle: string;
  loadNearest(at: LatLng, signal: AbortSignal): Promise<LibrarySummary[]>;
  onLibraryPress(lib: LibrarySummary): void;
  onBack(): void;
}) {
  const runner = useMemo(() => createLatestRunner(), []);
  const [center, setCenter] = useState<KmPoint>({ x: 0, y: 0 });
  const [items, setItems] = useState<MapItem[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  // 시안 큐브(26×28) 비율, 폭 = 판 폭 × MAP_CUBE_F
  const cw = Math.round(W * MAP_CUBE_F);
  const ch = Math.round((cw * 28) / 26);

  // C-96 2차(방안 S): 방향은 실제, 거리는 눌러 담고, 겹치면 바깥으로 밀거나 튼다
  const layout = useMemo(
    () =>
      layoutMap(
        items.map((it) => ({ item: it, at: it.at })),
        { center, home: { x: 0, y: 0 }, W, H, cube: { w: cw, h: ch }, plinth: { w: PLINTH_W, h: PLINTH_H } }
      ),
    [items, center, W, H, cw, ch]
  );
  const live = useRef({ center, ppk: layout.pxPerKm });
  live.current = { center, ppk: layout.pxPerKm };

  // 가운데(km) 기준 가까운 몇 곳을 받는다. 실패·늦은 응답은 판을 마지막 그대로
  const fetchAt = useCallback(
    async (c: KmPoint) => {
      const r = await runner.run((signal) => loadNearest(toLatLng(home, c), signal));
      if (r.status !== "ok") return;
      setCenter(c);
      setItems(
        r.value
          .filter((l) => l.latitude != null && l.longitude != null)
          .map((l) => ({ lib: l, at: toKm(home, { lat: l.latitude as number, lng: l.longitude as number }) }))
      );
    },
    [runner, loadNearest, home]
  );

  useEffect(() => {
    void fetchAt({ x: 0, y: 0 });
    return () => runner.cancel();
  }, [fetchAt, runner]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // 웹 마우스는 움직임만으로는 넘겨받지 못해 누르는 순간 받는다(큐브·받침은 더 안쪽이라 먼저 받는다)
        onStartShouldSetPanResponder: () => Platform.OS === "web",
        onMoveShouldSetPanResponderCapture: (_, g) => Math.hypot(g.dx, g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => setDrag({ x: g.dx, y: g.dy }),
        onPanResponderRelease: (_, g) => {
          setDrag({ x: 0, y: 0 });
          if (Math.hypot(g.dx, g.dy) <= 6) return;
          // 끈 길이를 판 끝 기준(가장 먼 곳 거리)으로 km로 바꿔 그 자리 기준으로 다시 받는다
          void fetchAt(movedCenter(live.current.center, g.dx, g.dy, live.current.ppk));
        },
        onPanResponderTerminate: () => setDrag({ x: 0, y: 0 }),
      }),
    [fetchAt]
  );

  const o = layout.home ? { x: layout.home.x + drag.x, y: layout.home.y + drag.y } : null;
  // 이름표가 피할 것: 받침과 모든 큐브 몸
  const placed = layout.spots.map((s) => ({
    it: s.item,
    body: [s.body[0] + drag.x, s.body[1] + drag.y, s.body[2] + drag.x, s.body[3] + drag.y] as Rect,
  }));
  const taken: Rect[] = [
    ...(o ? [[o.x - PLINTH_W / 2, o.y - PLINTH_H / 2, o.x + PLINTH_W / 2, o.y + PLINTH_H / 2] as Rect] : []),
    ...placed.map((q) => q.body),
  ];

  return (
    <View style={[StyleSheet.absoluteFill, styles.mapBoard]} testID="facade-map" {...responder.panHandlers}>
      <MapRings layout={layout} W={W} H={H} drag={drag} />
      {placed.map(({ it, body }) => {
        const m = Math.round(computeDistanceMeters(home, { lat: it.lib.latitude as number, lng: it.lib.longitude as number }));
        const w = Math.max(it.lib.name.length * 11.5, 40);
        const label = placeLabel(body, w, LABEL_H, taken);
        const { fill } = cubeLidColors(it.lib.today.is_closed === true ? "closed" : paletteIndexOf(it.lib.id, CUBE_PALETTE.length));
        return (
          <React.Fragment key={it.lib.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${it.lib.name} ${formatDistance(m)}`}
              testID={`map-cube-${it.lib.id}`}
              onPress={() => onLibraryPress(it.lib)}
              style={[styles.mapCube, { left: body[0], top: body[1], width: cw, height: ch }]}
            >
              <MapCube width={cw} height={ch} lid={fill} />
            </Pressable>
            {/* 이름표(C-96): 배경 없이 두 줄 왼쪽 정렬 — 이름 = 사람 목소리, 거리 = 계기판 목소리(실제 거리) */}
            <View
              pointerEvents="none"
              testID={`map-label-${it.lib.id}`}
              style={[styles.mapLabel, { left: label.rect[0], top: label.rect[1], width: label.rect[2] - label.rect[0] }, label.pos === "left" && styles.mapLabelEnd]}
            >
              <Text numberOfLines={1} style={styles.mapName}>{it.lib.name}</Text>
              <Text style={styles.mapDist}>{gaugeKm(m / 1000)}</Text>
            </View>
          </React.Fragment>
        );
      })}
      {/* 기점(현위치): 늘 맨 위. 누르면 주인공 보기로. 가장 먼 곳보다 멀면 판 밖 → 현위치 버튼 */}
      {o ? (
        <View style={[styles.plinthWrap, { left: o.x - PLINTH_W / 2, top: o.y - PLINTH_H / 2 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={TEXT.back} testID="facade-origin" onPress={onBack} style={styles.plinth}>
            <Text style={styles.plus}>+</Text>
            <Text style={styles.plinthTitle}>{originTitle}</Text>
          </Pressable>
        </View>
      ) : null}
      {/* 곳 수(계기판 목소리), 왼쪽 아래. 거리를 눌러 담아서 축척 막대는 없다 */}
      {layout.spots.length > 0 ? (
        <View pointerEvents="none" style={[styles.mapScale, { top: H - 28 }]} testID="map-scale">
          <Text style={styles.mapScaleText}>{`가까운 ${layout.spots.length}곳`}</Text>
        </View>
      ) : null}
      {/* 현위치가 판 밖이면 오른쪽 아래 현위치 버튼(지도 앱 표준) */}
      {!o ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={TEXT.locate}
          testID="map-locate"
          onPress={() => void fetchAt({ x: 0, y: 0 })}
          style={[styles.locate, { top: H - LOCATE_SIZE - 12 }]}
        >
          <View style={styles.locateRing} />
          <View style={styles.locateDot} />
        </Pressable>
      ) : null}
    </View>
  );
}

const TOP_SIDE = 192 / Math.SQRT2; // 윗면 마름모(192×110.8)를 만드는 정사각형 한 변
const LEFT_FACE = mix(C.paper, C.surface3, 0.8);
const FACE_W = 96;
const FACE_H = 78;
// 면 변환(시안 CSS 그대로, 왼쪽부터): 윗면·바닥 scaleY(110.8/192) rotate(45°) · 이름 상자 rotate(-30°) skewX(30°) scaleY(.866)
// · 왼쪽 면 skewY(30°)·오른쪽 면 skewY(-30°)(왼쪽 위 고정). 세 겹으로 나눠 Android에서도 같게(AffineBox).
const LID_MAT = composeMat(scaleMat(1, 110.8 / 192), rotateMat(45));
const GROUND_LAYERS = affineLayers(LID_MAT, TOP_SIDE, TOP_SIDE);
const TOP_LAYERS = GROUND_LAYERS;
const TOP_BOX_LAYERS = affineLayers(composeMat(rotateMat(-30), skewXMat(30), scaleMat(1, 0.866)), 110.85, 110.85);
const LEFT_LAYERS = affineLayers(skewYMat(30), FACE_W, FACE_H, 0, 0);
const RIGHT_LAYERS = affineLayers(skewYMat(-30), FACE_W, FACE_H, 0, 0);

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
  },
  groundFill: { backgroundColor: C.shadowAmbient },
  // 윗면: (110,12)·(206,67.4)·(110,122.8)·(14,67.4)
  faceTop: {
    position: "absolute",
    left: 110 - TOP_SIDE / 2,
    top: 67.4 - TOP_SIDE / 2,
    width: TOP_SIDE,
    height: TOP_SIDE,
  },
  faceTopFill: { borderWidth: 1, borderColor: C.seamHairline },
  topBox: {
    position: "absolute",
    left: 110 - TOP_BOX / 2,
    top: 67.4 - TOP_BOX / 2,
    width: TOP_BOX,
    height: TOP_BOX,
  },
  topBoxFill: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 9,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  topText: { fontWeight: "500", letterSpacing: TOP_LS, textAlign: "left" },
  topSmall: { fontWeight: "500", textAlign: "left", opacity: 0.86, marginBottom: 1, maxWidth: TOP_BOX - 17 },
  // 왼쪽 면: (14,67.4) 기준 96×78, skewY(30°)
  faceLeft: { position: "absolute", left: 14, top: 67.4, width: FACE_W, height: FACE_H },
  faceLeftFill: {
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
  faceRight: { position: "absolute", left: 110, top: 122.8, width: FACE_W, height: FACE_H },
  faceRightFill: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.seamHairline,
    paddingVertical: 7,
    paddingHorizontal: 8,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  faceHero: { borderColor: C.inkStrong },
  // 이웃·전체 보기 큐브 옆면 글자(E3 기본값(Claude): 잘려도 구조는 남기고 흐리게)
  quiet: { opacity: 0.38 },
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
  // 지도 모드(C-96, 2차 바닥 A: 주인공 보기보다 한 단 밝은 paper)
  mapBoard: { backgroundColor: C.paper },
  mapRingText: { position: "absolute", ...T.gauge, fontSize: 10, lineHeight: 14, textShadowColor: C.paper, textShadowRadius: 4 },
  mapNorth: { position: "absolute", right: 14, top: 10, alignItems: "center" },
  mapNorthText: { fontSize: 12, lineHeight: 14, fontWeight: "500", color: C.inkStrong },
  mapNorthArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: C.inkStrong,
  },
  mapCube: { position: "absolute", zIndex: 3 },
  mapLabel: { position: "absolute", zIndex: 4, alignItems: "flex-start" },
  mapLabelEnd: { alignItems: "flex-end" },
  // 사람 목소리(type.name 계열 500) / 계기판 목소리(type.gauge 계열). 상자 없이 판 색 번짐만
  mapName: { fontSize: 12, lineHeight: 15, fontWeight: "500", color: C.text, textShadowColor: C.paper, textShadowRadius: 4 },
  mapDist: { ...T.gauge, fontSize: 10, lineHeight: 13, textShadowColor: C.paper, textShadowRadius: 4 },
  mapScale: { position: "absolute", left: 16, zIndex: 5 },
  mapScaleText: { ...T.gauge, fontSize: 10 },
  locate: {
    position: "absolute",
    right: 12,
    zIndex: 8,
    width: LOCATE_SIZE,
    height: LOCATE_SIZE,
    borderRadius: LOCATE_SIZE / 2,
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.inkStrong,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  locateRing: { position: "absolute", width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.inkStrong },
  locateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.inkStrong },
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
