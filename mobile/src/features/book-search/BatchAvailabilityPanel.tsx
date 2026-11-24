// 빌릴 예정 "일괄 검색" 결과(book-search.md LIB-3b §2 #70, V5·V6·V8·V9)
// 선택이 없으면 전체(`planIds = null`), 있으면 선택한 예정만 묻는다. 범위(예정 집합·위치·반경)가 바뀌면 이전 요청은 취소하고
// 늦게 온 응답은 버린다(V9, `createLatestRunner`). 카드 본문을 누르면 한 곳 선택(일괄 빌림 확인 창의 후보로만 미리 채움, B2).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { createLatestRunner } from "../../lib/latest";
import { locate } from "../../lib/platform";
import { NEARBY_DEFAULT_RADIUS_KM } from "../../lib/policy";
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
        { planIds, lat: loc.lat, lng: loc.lng, radiusKm: NEARBY_DEFAULT_RADIUS_KM },
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
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>닫기</Text>
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
              <View key={cand.library.id} testID={`batch-library-${cand.library.id}`} style={styles.foot}>
                <Pressable
                  testID={`batch-select-${cand.library.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelectLibrary(selected ? null : cand.library.id)}
                  style={[styles.card, selected && styles.cardSelected]}
                >
                  {selected && <View style={styles.selectBar} />}
                  <View style={styles.body}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{cand.library.name}</Text>
                      {selected && <Text style={styles.selectedTag}>{SELECTED_LABEL}</Text>}
                      <Text style={styles.count}>{countLine(cand)}</Text>
                      {!!distance && <Text style={styles.meta}>{distance}</Text>}
                    </View>
                    {cand.link !== null && (
                      <LivePill
                        url={cand.link.url}
                        testID={`batch-live-${cand.library.id}`}
                        onOpenFailed={setOpenFailed}
                      />
                    )}
                  </View>
                </Pressable>
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
  close: { fontSize: 15, color: c.text, fontWeight: "500" },
  busy: { marginVertical: 12 },
  box: { gap: 10, alignItems: "flex-start" },
  partialRow: { gap: 8, alignItems: "flex-start" },
  text: { fontSize: 15, color: c.text, lineHeight: 22 },
  gauge: { ...T.gauge },
  foot: { backgroundColor: c.reliefBottomMid, borderRadius: theme.radii.infoCard, paddingBottom: 2 },
  card: {
    backgroundColor: c.panelLit,
    borderWidth: 1,
    borderColor: c.seamHairline,
    borderRadius: theme.radii.infoCard,
    padding: 12,
    overflow: "hidden",
  },
  cardSelected: { borderColor: c.inkStrong },
  selectBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: c.inkStrong },
  selectedTag: { fontSize: 12, color: c.inkStrong, fontWeight: "500" },
  body: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: "500", color: c.text },
  count: { fontSize: 14, color: c.text },
  meta: { fontSize: 13, color: c.textSub },
  darkBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
