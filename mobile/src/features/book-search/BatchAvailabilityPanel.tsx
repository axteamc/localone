// 빌릴 예정 "일괄 검색" 결과(book-search.md LIB-3b §2 #70, V5·V6·V8·V9)
// 선택이 없으면 전체(`planIds = null`), 있으면 선택한 예정만 묻는다. 범위(예정 집합·위치·반경)가 바뀌면 이전 요청은 취소하고
// 늦게 온 응답은 버린다(V9, `createLatestRunner`). 카드 본문을 누르면 한 곳 선택(일괄 빌림 확인 창의 후보로만 미리 채움, B2).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { locate } from "../../lib/platform";
import { getSearchRadius } from "../../lib/searchRadius";
import { actionColors, cardSurface, theme, type as T } from "../../theme";
import { ApiCallError, fetchPlansAvailability, type BatchAvailabilityResponse, type BatchCandidate } from "./api";
import { checkedAtLabel, distanceLabel } from "./availabilityText";
import { LivePill, OPEN_FAILED, SELECTED_LABEL } from "./LibraryAvailabilityCard";

export const BATCH_TITLE = "일괄 검색";
export const BATCH_PARTIAL = "일부 도서관만 확인했어요."; // §2.4·V8
export const BATCH_RETRY = "다시 조회";
export const BATCH_NONE_COMPLETE = "가까운 도서관에서 찾지 못했어요"; // V8
export const BATCH_NONE_PARTIAL = "일부만 확인해서 찾지 못했어요"; // V8
export const BATCH_FAILED = "조회하지 못했어요. 다시 시도해 주세요."; // §2.4
export const BATCH_TOO_MANY = "한 번에 20권까지 조회할 수 있어요. 책을 골라 주세요."; // §2.4·Y6-3
export const BATCH_STALE = "이미 바뀐 내용이에요. 목록을 새로 고쳤어요."; // §2.4 404
export const BATCH_NO_LOCATION = "위치를 확인하지 못했어요. 위치 권한을 켠 뒤 다시 조회해 주세요."; // 기본값(Claude)
/** 앱이 먼저 막는 서로 다른 ISBN 수(서버 `BATCH_AVAILABILITY_MAX_ISBNS`와 같다) */
export const BATCH_MAX_ISBNS = 20;

export const countLine = (cand: BatchCandidate) => `소장 ${cand.holding_count}권 · 대출 가능 ${cand.loanable_count}권`;

type State =
  | { kind: "loading" }
  | { kind: "ready"; res: BatchAvailabilityResponse }
  | { kind: "error"; message: string };

export function BatchAvailabilityPanel({
  planIds,
  distinctIsbnCount,
  selectedLibraryId,
  onSelectLibrary,
  onResult,
  onStale,
  onClose,
}: {
  /** `null` = 내 활성 예정 전체(V8 선택 없음) */
  planIds: string[] | null;
  /** 선택한 예정의 서로 다른 ISBN 수. 20을 넘으면 묻지 않는다 */
  distinctIsbnCount: number;
  selectedLibraryId: number | null;
  onSelectLibrary(libraryId: number | null): void;
  onResult(res: BatchAvailabilityResponse | null): void;
  /** 404 — 예정이 이미 바뀌었다. 목록을 다시 읽게 한다 */
  onStale(): void;
  onClose(): void;
}) {
  const runner = useMemo(() => createLatestRunner(), []);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [openFailed, setOpenFailed] = useState(false);
  const scopeKey = planIds === null ? "*" : planIds.join(",");

  const run = useCallback(async () => {
    onResult(null);
    onSelectLibrary(null);
    if (planIds !== null && distinctIsbnCount > BATCH_MAX_ISBNS) {
      runner.cancel();
      setState({ kind: "error", message: BATCH_TOO_MANY });
      return;
    }
    setState({ kind: "loading" });
    const r = await runner.run(async (signal) => {
      const loc = await locate(signal);
      if (!loc.ok) return null;
      return fetchPlansAvailability(
        { planIds, lat: loc.lat, lng: loc.lng, radiusKm: await getSearchRadius() }, // C-96 검색 반경 설정
        signal
      );
    });
    if (r.status === "stale") return; // V9: 범위가 바뀌었거나 닫혔다
    if (r.status === "error") {
      const e = r.error;
      if (e instanceof ApiCallError && e.status === 404) {
        setState({ kind: "error", message: BATCH_STALE });
        onStale();
        return;
      }
      const tooMany = e instanceof ApiCallError && e.status === 422 && e.detail === "plan_ids";
      setState({ kind: "error", message: tooMany ? BATCH_TOO_MANY : BATCH_FAILED });
      return;
    }
    if (r.value === null) {
      setState({ kind: "error", message: BATCH_NO_LOCATION });
      return;
    }
    setState({ kind: "ready", res: r.value });
    onResult(r.value);
    // 범위 키만 본다(콜백은 렌더마다 새로 만들어진다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, distinctIsbnCount, runner]);

  useEffect(() => {
    void run();
  }, [run]);
  useEffect(() => () => runner.cancel(), [runner]);

  return (
    <View testID="batch-panel" style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>{BATCH_TITLE}</Text>
        {/* 단일 조회 창과 같은 X 아이콘(44×44, 시안 #sheet-close). 글자 기호 대신 선 두 개 */}
        <Pressable
          testID="batch-close"
          accessibilityRole="button"
          accessibilityLabel="일괄 검색 닫기"
          onPress={onClose}
          style={styles.closeBtn}
        >
          <View style={[styles.closeLine, styles.closeLineA]} />
          <View style={[styles.closeLine, styles.closeLineB]} />
        </Pressable>
      </View>

      {state.kind === "loading" && <ActivityIndicator accessibilityLabel="도서관 찾는 중" style={styles.busy} />}

      {state.kind === "error" && (
        <View style={styles.box}>
          <Text style={styles.text}>{state.message}</Text>
          {state.message !== BATCH_TOO_MANY && state.message !== BATCH_STALE && (
            <RetryButton onPress={() => void run()} />
          )}
        </View>
      )}

      {state.kind === "ready" && (
        <>
          {!state.res.complete && (
            <View testID="batch-partial" style={styles.partialRow}>
              <Text style={styles.text}>{BATCH_PARTIAL}</Text>
              <RetryButton onPress={() => void run()} />
            </View>
          )}
          {state.res.candidates.length === 0 && (
            <Text style={styles.text}>{state.res.complete ? BATCH_NONE_COMPLETE : BATCH_NONE_PARTIAL}</Text>
          )}
          {state.res.candidates.map((cand) => {
            const selected = selectedLibraryId === cand.library.id;
            const distance = distanceLabel(cand.library.distance_m);
            return (
              // 단일 조회 카드(LibraryAvailabilityCard)와 같은 모양: 이름 · 거리 [선택됨] / 상태 점 + 권수, 오른쪽 필.
              // 선택 레이어는 카드 맨 뒤에 깔아 필을 감싸지 않는다(웹 <button> 안 <button> 방지, 필을 눌러도 선택은 그대로).
              <View key={cand.library.id} testID={`batch-library-${cand.library.id}`} style={[styles.card, selected && styles.cardSelected]}>
                <Pressable
                  testID={`batch-select-${cand.library.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${cand.library.name} 선택`}
                  accessibilityState={{ selected }}
                  onPress={() => onSelectLibrary(selected ? null : cand.library.id)}
                  style={StyleSheet.absoluteFill}
                />
                {selected && <View style={[styles.selectBar, styles.passThrough]} />}
                <View style={[styles.info, styles.passThrough]}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{cand.library.name}</Text>
                    {!!distance && <Text style={styles.sep}>·</Text>}
                    {!!distance && <Text style={styles.nameFixed}>{distance}</Text>}
                    {selected && <Text style={styles.selectedTag}>{SELECTED_LABEL}</Text>}
                  </View>
                  <View style={styles.statusRow}>
                    <View
                      style={[styles.dot, { backgroundColor: cand.loanable_count > 0 ? c.loanAvailable : c.loanOut }]}
                    />
                    <Text style={styles.count} numberOfLines={1}>{countLine(cand)}</Text>
                  </View>
                </View>
                {cand.link !== null && (
                  <LivePill
                    url={cand.link.url}
                    testID={`batch-live-${cand.library.id}`}
                    onOpenFailed={setOpenFailed}
                  />
                )}
              </View>
            );
          })}
          {openFailed && <Text style={styles.meta}>{OPEN_FAILED}</Text>}
          <Text style={styles.gauge}>{checkedAtLabel(state.res.checked_at)}</Text>
        </>
      )}
    </View>
  );
}

function RetryButton({ onPress }: { onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
    >
      <Text style={styles.darkBtnText} numberOfLines={1}>{BATCH_RETRY}</Text>
    </Pressable>
  );
}

const c = theme.colors;
const ACT = actionColors(c);
const styles = StyleSheet.create({
  panel: { ...cardSurface(theme, { onPanel: true }), padding: 14, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...T.name },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  closeLine: { position: "absolute", width: 18, height: 1.6, backgroundColor: c.inkStrong },
  closeLineA: { transform: [{ rotate: "45deg" }] },
  closeLineB: { transform: [{ rotate: "-45deg" }] },
  busy: { marginVertical: 12 },
  box: { gap: 10, alignItems: "flex-start" },
  partialRow: { gap: 8, alignItems: "flex-start" },
  text: { fontSize: 15, color: c.text, lineHeight: 22 },
  gauge: { ...T.gauge },
  // LibraryAvailabilityCard 값 그대로(Y-6 시안 조회 카드): panelFrosted·1px 줄눈·곡률 infoCard, 선택 = 크림 + 진한 테두리 + 왼쪽 3px
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
  info: { flex: 1, minWidth: 0, minHeight: 54, paddingVertical: 6, paddingLeft: 10, gap: 2, justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: 13, color: c.text, flexShrink: 1 },
  nameFixed: { fontSize: 13, color: c.text },
  sep: { fontSize: 13, color: c.textSub },
  selectedTag: { fontSize: 11, color: c.inkStrong, fontWeight: "500" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: "50%" }, // B9 예외: 점 모양만 50%(LibraryAvailabilityCard와 같다)
  count: { fontSize: 12, color: c.text, flexShrink: 1 },
  meta: { fontSize: 13, color: c.textSub },
  darkBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
