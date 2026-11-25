import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../theme";
import { createLatestRunner } from "./latest";
import { searchPlaces, type Place } from "./publicApi";
import { writeRoughStart } from "./roughStart";

export function PlacePicker({ onClose, onRegion }: { onClose(): void; onRegion(): void }) {
  const runner = useMemo(createLatestRunner, []);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Place[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const locked = useRef(false);
  useEffect(() => () => runner.cancel(), [runner]);

  async function search(value: string) {
    runner.cancel();
    setQuery(value);
    setItems([]);
    setSaveFailed(false);
    if (Array.from(value.trim()).length < 2) { setStatus("idle"); return; }
    setStatus("loading");
    const r = await runner.run(s => searchPlaces(value.trim(), s));
    if (r.status === "stale") return;
    if (r.status === "error") { setStatus("error"); return; }
    setItems(r.value.items);
    setStatus("ready");
  }

  async function select(place: Place) {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    try {
      await writeRoughStart(place);
      onClose();
    } catch {
      setSaveFailed(true);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  const action = (label: string, press: () => void) => (
    <Pressable accessibilityRole="button" disabled={saving} onPress={press} style={styles.row}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!locked.current) onClose(); }}>
    <View style={styles.overlay}><View style={styles.sheet}>
      <Text style={styles.title}>대략적인 위치</Text>
      <TextInput accessibilityLabel="건물 이름 검색" placeholder="건물 이름 검색" autoFocus editable={!saving}
        maxLength={100} value={query} onChangeText={value => void search(value)} style={styles.input} />
      <Text style={styles.text}>집 근처 큰 건물·역·학교 이름을 입력해 주세요. 주소는 저장하지 않아요.</Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {status === "loading" && <ActivityIndicator accessibilityLabel="장소 검색 중" />}
        {status === "ready" && !items.length && <Text>검색 결과가 없어요. 다른 이름으로 찾아보세요.</Text>}
        {status === "error" && <><Text>장소를 불러오지 못했어요.</Text>{action("다시 시도", () => void search(query))}</>}
        {items.map(p => <View key={p.id}>{action(p.name + " · " + p.area_label, () => void select(p))}</View>)}
        {saveFailed && <Text>위치를 저장하지 못했어요. 다시 선택해 주세요.</Text>}
        {action("지역 선택", onRegion)}
        {action("닫기", onClose)}
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.colors.shadowSoft },
  sheet: { maxHeight: "80%", padding: 16, gap: 8, backgroundColor: theme.colors.paper, borderRadius: theme.radii.infoCard },
  title: { color: theme.colors.text, fontWeight: "500", fontSize: 17 },
  row: { minHeight: 44, justifyContent: "center" },
  text: { color: theme.colors.text },
  input: { minHeight: 44, borderBottomWidth: 1, borderColor: theme.colors.seamHairline, color: theme.colors.text },
});
