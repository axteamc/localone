// 설정 → "홈을 열면 처음 크게 보일 도서관"(C-90, 시안 실기기개선_P2-P4 #el-settings 후보 A의 다음 화면).
// 이전에는 방문 페이지 ⋯ 메뉴에 있던 항목(L6). 저장소는 홈 꾹 누르기와 같은 기기 키(heroPref).
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getHeroRule, setHeroRule } from "../src/features/library-visit/heroPref";
import { HERO_MENU_TEXT } from "../src/features/library-visit/heroText";
import type { HeroRule } from "../src/features/library-visit/direction";
import { cardSurface, panel, theme } from "../src/theme";

export default function FirstLibrarySettingScreen() {
  const router = useRouter();
  const [rule, setRule] = useState<HeroRule | null>(null);

  useEffect(() => {
    let alive = true;
    void getHeroRule().then((r) => alive && setRule(r));
    return () => {
      alive = false;
    };
  }, []);

  const choose = async (next: HeroRule) => {
    if (rule === null) return;
    setRule(next);
    if (next !== rule) await setHeroRule(next);
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.help}>{HERO_MENU_TEXT.menuTitle}</Text>
      <View style={styles.group}>
        {(["nearest", "recent"] as const).map((r, i) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ checked: rule === r, disabled: rule === null }}
            disabled={rule === null}
            onPress={() => void choose(r)}
            testID={`first-library-${r}`}
            style={({ pressed }) => [styles.row, i === 0 && styles.rowLine, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowText}>
              {r === "nearest" ? `${HERO_MENU_TEXT.nearest} (${HERO_MENU_TEXT.basic})` : HERO_MENU_TEXT.recent}
            </Text>
            <Text style={styles.check}>{rule === r ? "✓" : ""}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: panel.backgroundColor },
  help: { fontSize: 12, color: c.textSub, marginBottom: 6, marginHorizontal: 4 },
  group: { ...cardSurface(theme, { onPanel: true }), overflow: "hidden" },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.seamHairline },
  rowPressed: { backgroundColor: c.surface2 },
  rowText: { fontSize: 15, color: c.text },
  check: { fontSize: 15, color: c.inkStrong },
});
