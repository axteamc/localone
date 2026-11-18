// 도서관 카드: 머리 줄 → 상태 한 줄·주소 전화 접기(왼쪽) + 작은 "실시간 ↗"(오른쪽)(book-search.md LIB-2 A2·A3·A11·A14, C-70, V-1·V-7·V-8)
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { openExternalUrl } from "../../lib/platform";
import type { AvailabilityItem } from "../../lib/publicApi";
import { actionColors, theme } from "../../theme";
import { dataDateLabel, distanceLabel, holdingText, loanableText } from "./availabilityText";

export const LIMIT_UNCHECKED = "요청 한도로 확인하지 못했어요"; // A14
export const OPEN_FAILED = "주소를 열지 못했어요."; // V-8

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

export function LibraryAvailabilityCard({
  item,
  today,
  onRetry,
}: {
  item: AvailabilityItem;
  /** 서버 서울 오늘(`checked_at.slice(0, 10)`) */
  today: string;
  onRetry(): void;
}) {
  const [openFailed, setOpenFailed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const lib = item.library;
  const distance = distanceLabel(lib.distance_m);
  const todayLabel = todayText(lib.today);
  const line = statusLine(item, today);
  const live = item.live_check;

  const openLive = async () => {
    if (!live) return;
    setOpenFailed(!(await openExternalUrl(live.url)));
  };

  return (
    <View testID={`library-${lib.id}`} style={styles.foot}>
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.name}>{lib.name}</Text>
        {(!!distance || !!todayLabel) && (
          <View style={styles.headSide}>
            {!!distance && <Text style={styles.meta}>{distance}</Text>}
            {!!todayLabel && <Text style={styles.meta}>{todayLabel}</Text>}
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.bodyMain}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: line.dot }]} />
            <Text style={styles.statusText}>{line.parts.join(" · ")}</Text>
            {line.retry && (
              <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
                <Text style={styles.retry}>다시 시도</Text>
              </Pressable>
            )}
          </View>

          {(!!lib.address || !!lib.tel) && !infoOpen && (
            <Pressable testID={`info-open-${lib.id}`} accessibilityRole="button" onPress={() => setInfoOpen(true)} hitSlop={8}>
              <Text style={styles.fold}>주소·전화 ⌄</Text>
            </Pressable>
          )}
          {(!!lib.address || !!lib.tel) && infoOpen && (
            <View style={styles.info}>
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
        </View>

        {/* A11 ④: 오른쪽 작은 버튼(C-69 위치, C-70 "실시간 ↗"·높이 38). 높이 38 + hitSlop 3 → 누르는 영역 44 */}
        {live !== null && (
          <Pressable
            testID={`live-check-${lib.id}`}
            accessibilityRole="button"
            onPress={() => void openLive()}
            hitSlop={LIVE_HIT_SLOP}
            style={styles.liveBtn}
          >
            <Text style={styles.liveBtnText}>실시간 ↗</Text>
          </Pressable>
        )}
      </View>
      {openFailed && <Text style={styles.meta}>{OPEN_FAILED}</Text>}
    </View>
    </View>
  );
}

/** 버튼 높이 38 + 위아래 3 = 44(A11 ④ 누르는 영역 44×44 이상) */
export const LIVE_HIT_SLOP = { top: 3, bottom: 3, left: 5, right: 5 } as const;

const c = theme.colors;
const ACT = actionColors(c);
const styles = StyleSheet.create({
  // A11(C-70, DESIGN.md "정보 카드 질감"): 무광 면 + 1px 줄눈 + 아래 2px 받침, 그림자 없음
  foot: { backgroundColor: c.reliefBottomMid, borderRadius: theme.radii.infoCard, paddingBottom: 2 },
  card: {
    backgroundColor: c.panelFrosted,
    borderWidth: 1,
    borderColor: c.seamHairline,
    borderRadius: theme.radii.infoCard,
    padding: 12,
    gap: 6,
  },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  headSide: { alignItems: "flex-end" },
  name: { flex: 1, fontSize: 16, fontWeight: "500", color: c.text },
  meta: { fontSize: 13, color: c.textSub },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: "50%" }, // B9 예외: 점 모양만 50%
  statusText: { fontSize: 14, color: c.text },
  retry: { fontSize: 14, color: c.inkStrong, fontWeight: "500", textDecorationLine: "underline" },
  info: { gap: 2, alignItems: "flex-start" },
  fold: { fontSize: 13, color: c.textSub, fontWeight: "500", paddingVertical: 2 },
  infoText: { fontSize: 13, color: c.inkSoft, lineHeight: 19 },
  body: { flexDirection: "row", alignItems: "center", gap: 10 },
  bodyMain: { flex: 1, minWidth: 0, gap: 6, alignItems: "flex-start" },
  liveBtn: {
    flexShrink: 0,
    height: 38,
    paddingHorizontal: 12,
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBtnText: { ...ACT.secondaryText, fontSize: 13, fontWeight: "500" },
});
