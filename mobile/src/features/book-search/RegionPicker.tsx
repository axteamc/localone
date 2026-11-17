// 위치 없이 시군구를 골라 찾기(book-search.md LIB-2 A6·A13, V-5). 정확한 위치는 저장하지 않는다.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { requestLocationPermission } from "../../lib/platform";
import { REGIONS, searchRegions } from "../../lib/regions";
import { theme, actionColors } from "../../theme";

export const REGION_INTRO = "위치를 쓰지 않고 지역을 골라 찾을 수 있어요.";
export const REGION_NO_MATCH = "일치하는 지역이 없어요. 시·군·구 이름으로 다시 입력해 주세요.";
export const REGION_LOCATION_DENIED = "위치 권한이 꺼져 있어요. 휴대폰 설정에서 켜거나 아래에서 지역을 골라 주세요.";
export const REGION_PLACEHOLDER = "시·도 또는 시·군·구 이름 입력 (예: 종로구, 광주)";

export function RegionPicker({
  onChoose,
  onLocationAllowed,
}: {
  onChoose(code: string): void;
  /** 위치를 허용하면 주변을 다시 찾는다 */
  onLocationAllowed(): void;
}) {
  const [q, setQ] = useState("");
  const [denied, setDenied] = useState(false);
  const regions = useMemo(() => (q.trim() ? searchRegions(q, 20) : REGIONS.slice(0, 10)), [q]);

  const allowLocation = async () => {
    const granted = (await requestLocationPermission()) === "granted";
    setDenied(!granted); // 거부·창이 더 안 뜸이면 아무 반응 없이 끝내지 않는다(사후 검토 ②-4)
    if (granted) onLocationAllowed();
  };

  return (
    <View testID="region-picker" style={styles.box}>
      <Text style={styles.intro}>{REGION_INTRO}</Text>
      <Pressable accessibilityRole="button" onPress={() => void allowLocation()} style={styles.locBtn}>
        <Text style={styles.locBtnText}>위치 허용해서 주변 찾기</Text>
      </Pressable>
      {denied && (
        <Text style={styles.denied} accessibilityLiveRegion="polite">
          {REGION_LOCATION_DENIED}
        </Text>
      )}
      <TextInput
        testID="region-input"
        value={q}
        onChangeText={setQ}
        placeholder={REGION_PLACEHOLDER}
        placeholderTextColor={theme.colors.textSub}
        style={styles.input}
        returnKeyType="search"
      />
      {regions.length === 0 ? (
        <Text style={styles.noMatch}>{REGION_NO_MATCH}</Text>
      ) : (
        <View>
          {regions.map((r) => (
            <Pressable
              key={r.code}
              testID={`region-${r.code}`}
              accessibilityRole="button"
              onPress={() => onChoose(r.code)}
              style={styles.row}
            >
              <Text style={styles.rowText}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  box: { backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 16, gap: 10 },
  intro: { fontSize: 15, color: c.text, lineHeight: 22 },
  locBtn: {
    ...ACT.primary,
    borderRadius: theme.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  locBtnText: { ...ACT.primaryText, fontSize: 15, fontWeight: "700" },
  input: {
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
  },
  noMatch: { fontSize: 14, color: c.textSub, lineHeight: 20 },
  denied: { fontSize: 14, color: c.textSub, lineHeight: 20 },
  row: {
    minHeight: 44,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.divider,
  },
  rowText: { fontSize: 15, color: c.text },
});
