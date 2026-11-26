// 설정 > 검색 > 주변 찾기 반경 (C-96, 2026-11-26 사용자 결정: 2·3·5km, 기본 3, 기기 저장).
// 책 "주변 찾기"(소장 조회·빌릴 예정 한꺼번에 조회)에만 쓴다. 홈 큐브는 이 값과 상관없이 2km.
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NEARBY_RADII_KM, type RadiusKm } from "../../lib/policy";
import { getSearchRadius, setSearchRadius } from "../../lib/searchRadius";
import { theme } from "../../theme";

export const RADIUS_TEXT = { label: "주변 찾기 반경" } as const;

export function SearchRadiusSetting() {
  const [km, setKm] = useState<RadiusKm | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getSearchRadius().then((v) => alive && setKm(v));
      return () => {
        alive = false;
      };
    }, [])
  );
  return (
    <View style={styles.row} testID="settings-search-radius">
      <Text style={styles.rowText}>{RADIUS_TEXT.label}</Text>
      <View style={styles.seg} accessibilityRole="radiogroup">
        {NEARBY_RADII_KM.map((v) => (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ selected: km === v }}
            testID={`settings-radius-${v}`}
            onPress={() => {
              setKm(v);
              void setSearchRadius(v);
            }}
            style={[styles.segItem, km === v && styles.segOn]}
          >
            <Text style={[styles.segText, km === v && styles.segTextOn]}>{`${v}km`}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 14 },
  rowText: { fontSize: 15, color: c.text, flexShrink: 1 },
  // 세그먼트(컨트롤 = 완전한 필, DESIGN 형태): 고른 칸만 무광 판
  seg: { flexDirection: "row", borderRadius: 9999, borderWidth: 1, borderColor: c.seamHairline, padding: 2, gap: 2 },
  segItem: { minWidth: 48, minHeight: 32, paddingHorizontal: 10, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: c.panelLit, borderWidth: 1, borderColor: c.seamHairline },
  segText: { fontSize: 14, color: c.textSub },
  segTextOn: { color: c.text, fontWeight: "500" },
});
