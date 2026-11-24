// 도서관 카드(Y-6 시안 조회 카드): "이름 · 거리 (오늘 운영)" → 상태 점·글 → 주소 전화 접기(왼쪽) + "실시간 ↗"(오른쪽)
// (book-search.md LIB-2 A2·A3·A11·A14, C-70, V-1·V-7·V-8)
// LIB-3b V5: 카드 본문을 누르면 한 곳 선택·해제(테두리·왼쪽 표시선·"선택됨"). 오른쪽 필 버튼은 링크만 열고 선택과 따로다.
// LIB-3b V6: 필 버튼 "실시간 ↗" ↔ 열기 성공 뒤 초록 점 "확인 완료". 두 상태 같은 크기, 높이 44.
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { openExternalUrl } from "../../lib/platform";
import type { AvailabilityItem } from "../../lib/publicApi";
import { actionColors, theme } from "../../theme";
import { dataDateLabel, distanceLabel, holdingText, loanableText } from "./availabilityText";

export const LIMIT_UNCHECKED = "요청 한도로 확인하지 못했어요"; // A14
export const OPEN_FAILED = "주소를 열지 못했어요."; // V-8
export const LIVE_LABEL = "실시간 ↗";
export const LIVE_DONE = "확인 완료"; // V6 — 링크를 연 상태일 뿐 대출 상태와는 별개
export const SELECTED_LABEL = "선택됨"; // V5

function todayText(today: AvailabilityItem["library"]["today"]): string | null {
  if (today.is_closed === true) return "오늘 휴관";
  if (today.is_closed === false && today.hours_text) return `오늘 ${today.hours_text}`;
  return null; // 모르면 표시 없음(큰 틀 결정 8)
}

/**
 * 상태 한 줄의 글자와 점 색. `unknown`은 절대 `없음`·`불가`로 바꾸지 않는다(AC-UNKNOWN).
 * 대출이 확인되면 "<기준일> 기준 · 대출 가능|불가"만(소장 있음은 따로 쓰지 않음, A11 ② C-70). 모르는 것이 있으면 옆에 "다시 시도"(A3).
 */
function statusLine(item: AvailabilityItem, today: string): { parts: string[]; dot: string; retry: boolean } {
  const c = theme.colors;
  if (item.holding === "unknown") {
    const text = item.fallback_reason === "limit" ? LIMIT_UNCHECKED : `소장 ${holdingText("unknown")}`;
    return { parts: [text], dot: c.loanUnknown, retry: true };
  }
  const holding = `소장 ${holdingText(item.holding)}`;
  if (item.holding === "no") return { parts: [holding], dot: c.loanOut, retry: false };
  if (item.loanable === "unknown") {
    return { parts: [`${holding} · 대출 ${loanableText("unknown")}`], dot: c.loanUnknown, retry: true };
  }
  const label = dataDateLabel(item.data_date, today, item.data_date_assumed);
  const loan = `대출 ${loanableText(item.loanable)}`;
  return {
    parts: [label ? `${label} 기준 · ${loan}` : loan],
    dot: item.loanable === "yes" ? c.loanAvailable : c.loanOut,
    retry: false,
  };
}

/**
 * V6 필 버튼. `openExternalUrl`이 `true`(Expo `Linking.openURL`이 resolve: OS가 열었거나 사용자가 확인함)면
 * "확인 완료", reject·주소 오류면 그대로 "실시간 ↗"로 두어 다시 누를 수 있다. 다시 누르면 같은 링크를 연다.
 */
export function LivePill({ url, testID, onOpenFailed }: { url: string; testID: string; onOpenFailed(failed: boolean): void }) {
  const [opened, setOpened] = useState(false);
  const busy = useRef(false);
  const press = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const ok = await openExternalUrl(url);
      if (ok) setOpened(true);
      onOpenFailed(!ok);
    } finally {
      busy.current = false;
    }
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={opened ? `${LIVE_DONE}, 다시 열기` : LIVE_LABEL}
      onPress={() => void press()}
      style={({ pressed }) => [styles.liveBtn, pressed && ACT.secondaryPressed]}
    >
      {opened ? (
        <View style={styles.liveInner}>
          <View testID={`${testID}-done-dot`} style={[styles.dot, { backgroundColor: c.loanAvailable }]} />
          <Text style={styles.liveBtnText} numberOfLines={1}>{LIVE_DONE}</Text>
        </View>
      ) : (
        <Text style={styles.liveBtnText} numberOfLines={1}>{LIVE_LABEL}</Text>
      )}
    </Pressable>
  );
}

export function LibraryAvailabilityCard({
  item,
  today,
  onRetry,
  selected = false,
  onToggleSelect,
}: {
  item: AvailabilityItem;
  /** 서버 서울 오늘(`checked_at.slice(0, 10)`) */
  today: string;
  onRetry(): void;
  /** V5 — 주면 카드 본문을 눌러 선택·해제한다 */
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [openFailed, setOpenFailed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const lib = item.library;
  const distance = distanceLabel(lib.distance_m);
  const todayLabel = todayText(lib.today);
  const line = statusLine(item, today);
  const live = item.live_check;

  return (
    <View testID={`library-${lib.id}`} style={styles.foot}>
    <View style={[styles.card, selected && styles.cardSelected]}>
      {/* V5 선택 레이어는 카드 맨 뒤에 깐다. 안쪽 버튼(주소·전화·다시 시도·필)을 감싸면
          웹에서 <button> 안에 <button>이 생긴다(Y-6 웹 확인 2026-11-24). 글자 영역은
          pointerEvents none이라 누르면 이 레이어가 받는다. */}
      {onToggleSelect && (
        <Pressable
          testID={`select-library-${lib.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${lib.name} 선택`}
          accessibilityState={{ selected }}
          onPress={onToggleSelect}
          style={StyleSheet.absoluteFill}
        />
      )}
      {selected && <View style={[styles.selectBar, styles.passThrough]} />}
      {/* Y-6 시안: 왼쪽 글자 묶음(이름 · 거리 / 상태 점·글 / 작은 부가 줄) + 오른쪽 필 */}
      <View style={[styles.info, styles.boxNone]}>
        <View style={[styles.nameRow, styles.passThrough]}>
          <Text style={styles.name} numberOfLines={1}>{lib.name}</Text>
          {!!distance && <Text style={styles.sep}>·</Text>}
          {!!distance && <Text style={styles.name}>{distance}</Text>}
          {selected && <Text style={styles.selectedTag}>{SELECTED_LABEL}</Text>}
          {/* LIB-2 머리 줄(C-70): 오늘 운영은 이름 줄 오른쪽에 작게 */}
          {!!todayLabel && <Text style={[styles.meta, styles.todayRight]} numberOfLines={1}>{todayLabel}</Text>}
        </View>

        <View style={[styles.statusRow, styles.boxNone]}>
          <View style={[styles.statusMain, styles.passThrough]}>
            <View style={[styles.dot, { backgroundColor: line.dot }]} />
            <Text style={styles.statusText} numberOfLines={1}>{line.parts.join(" · ")}</Text>
          </View>
          {line.retry && (
            <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
              <Text style={styles.retry}>다시 시도</Text>
            </Pressable>
          )}
        </View>

        {/* LIB-2 A2: 주소·전화 접기는 작은 부가 줄로 남긴다 */}
        {(!!lib.address || !!lib.tel) && !infoOpen && (
          <View style={[styles.extraRow, styles.boxNone]}>
            <Pressable testID={`info-open-${lib.id}`} accessibilityRole="button" onPress={() => setInfoOpen(true)} hitSlop={8}>
              <Text style={styles.fold}>주소·전화 ⌄</Text>
            </Pressable>
          </View>
        )}
        {(!!lib.address || !!lib.tel) && infoOpen && (
          <View style={[styles.infoOpen, styles.boxNone]}>
            {!!lib.address && <Text style={styles.infoText}>{lib.address}</Text>}
            {/* 전화는 글자로만 보인다. 눌러서 걸지 않는다(A2). */}
            {!!lib.tel && (
              <Text selectable style={styles.infoText}>
                {`전화 ${lib.tel}`}
              </Text>
            )}
            <Pressable testID={`info-close-${lib.id}`} accessibilityRole="button" onPress={() => setInfoOpen(false)} hitSlop={8}>
              <Text style={styles.fold}>접기 ⌃</Text>
            </Pressable>
          </View>
        )}
        {openFailed && <Text style={[styles.meta, styles.passThrough]}>{OPEN_FAILED}</Text>}
      </View>

      {/* A11 ④ 오른쪽 작은 버튼. V6: 높이 44·고정 폭으로 두 상태 크기가 같다. `live_check = null`이면 버튼 없음 */}
      {live !== null && <LivePill url={live.url} testID={`live-check-${lib.id}`} onOpenFailed={setOpenFailed} />}
    </View>
    </View>
  );
}

/** V6 필 버튼 크기 — 두 상태가 같다(높이 44 = 누르는 영역 44×44 이상) */
export const LIVE_PILL_SIZE = { width: 96, height: 44 } as const;

const c = theme.colors;
const ACT = actionColors(c);
const styles = StyleSheet.create({
  // Y-6 시안 조회 카드: 바탕 panel·1px 줄눈·곡률 card, 받침 없음. 선택 = 크림 바탕 + 진한 테두리 + 왼쪽 3px 선
  foot: { borderRadius: theme.radii.infoCard },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 7,
    backgroundColor: c.panelFrosted,
    borderWidth: 1,
    borderColor: c.seamHairline,
    borderRadius: theme.radii.infoCard,
    overflow: "hidden",
  },
  cardSelected: { borderColor: c.inkStrong, backgroundColor: c.cream },
  selectBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: c.inkStrong },
  passThrough: { pointerEvents: "none" },
  boxNone: { pointerEvents: "box-none" },
  info: { flex: 1, minWidth: 0, minHeight: 54, paddingVertical: 6, paddingLeft: 10, gap: 2, justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sep: { fontSize: 13, color: c.textSub },
  todayRight: { marginLeft: "auto", paddingLeft: 6, flexShrink: 0 },
  name: { fontSize: 13, color: c.text, flexShrink: 1 },
  selectedTag: { fontSize: 11, color: c.inkStrong, fontWeight: "500" },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  statusMain: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: "50%" }, // B9 예외: 점 모양만 50%
  statusText: { fontSize: 12, color: c.text, flexShrink: 1 },
  retry: { fontSize: 12, color: c.inkStrong, fontWeight: "500", textDecorationLine: "underline" },
  extraRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8 },
  meta: { fontSize: 11, color: c.textSub },
  fold: { fontSize: 11, color: c.textSub, paddingVertical: 2 },
  infoOpen: { gap: 2, alignItems: "flex-start" },
  infoText: { fontSize: 12, color: c.inkSoft, lineHeight: 17 },
  liveInner: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveBtn: {
    flexShrink: 0,
    ...LIVE_PILL_SIZE,
    paddingHorizontal: 10,
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBtnText: { ...ACT.secondaryText, fontSize: 12, fontWeight: "500" },
});
