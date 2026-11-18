// 방문 페이지 ⋯ 메뉴: 도서관 기본값 켜고 끄기·도서관 홈페이지 (contracts/local-feed.md VISIT-2 G4, V-#3)
// + 홈 처음 주인공 설정(L6 2026-11-19 D 결정, 홈 꾹 누르기와 같은 저장소 localone:home_hero_rule:v1)
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { openExternalUrl } from "../../lib/platform";
import type { LibraryDetail } from "../../lib/publicApi";
import { getDefaultLibrary, setDefaultLibrary } from "../../lib/visits";
import { getHeroRule, setHeroRule } from "../library-visit/heroPref";
import { HERO_MENU_TEXT } from "../library-visit/heroText";
import type { HeroRule } from "../library-visit/direction";
import { cardSurface, theme } from "../../theme";

const C = theme.colors;

export const MENU_TEXT = {
  turnOn: "앱을 켜면 여기부터 열기",
  turnOff: "바로 열기 끄기",
  homepage: "도서관 홈페이지",
  onNotice: (name: string) => `앱을 켜면 ${name}부터 열어요`,
  offNotice: "바로 열기를 껐어요",
  homepageFailed: "홈페이지를 열 수 없어요",
  ...HERO_MENU_TEXT,
  heroNotice: (rule: HeroRule) => `홈을 열면 ${rule === "recent" ? HERO_MENU_TEXT.recent : HERO_MENU_TEXT.nearest}을 크게 보여 줘요`,
} as const;

export function VisitMenu({
  library,
  onNotice,
}: {
  library: Pick<LibraryDetail, "id" | "name" | "homepage">;
  onNotice: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [heroRule, setRule] = useState<HeroRule | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    void getDefaultLibrary().then((id) => alive && setIsDefault(id === library.id));
    void getHeroRule().then((rule) => alive && setRule(rule));
    return () => {
      alive = false;
    };
  }, [library.id, open]);

  const chooseRule = async (rule: HeroRule) => {
    setOpen(false);
    if (rule === heroRule) return;
    setRule(rule);
    await setHeroRule(rule); // 저장 실패는 조용히 넘긴다(heroPref) — 홈은 돌아올 때 다시 읽는다
    onNotice(MENU_TEXT.heroNotice(rule));
  };

  const toggle = async () => {
    if (saving.current || isDefault === null) return; // 저장 중 두 번째 누름 무시(V-#3)
    saving.current = true;
    const next = !isDefault;
    try {
      await setDefaultLibrary(next ? library.id : null); // 기기에 하나만(G4)
      setIsDefault(next);
      setOpen(false);
      onNotice(next ? MENU_TEXT.onNotice(library.name) : MENU_TEXT.offNotice);
    } finally {
      saving.current = false;
    }
  };

  const openHomepage = async () => {
    setOpen(false);
    const ok = library.homepage ? await openExternalUrl(library.homepage) : false;
    if (!ok) onNotice(MENU_TEXT.homepageFailed);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="도서관 메뉴"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.more}
      >
        <Text style={styles.moreText}>⋯</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="메뉴 닫기" style={styles.scrim} onPress={() => setOpen(false)}>
          <View style={styles.menu} testID="visit-menu-card">
            <Pressable
              accessibilityRole="button"
              disabled={isDefault === null}
              onPress={() => void toggle()}
              style={styles.item}
            >
              <Text style={styles.itemText}>{isDefault ? MENU_TEXT.turnOff : MENU_TEXT.turnOn}</Text>
            </Pressable>
            {library.homepage ? (
              <Pressable accessibilityRole="button" onPress={() => void openHomepage()} style={styles.item}>
                <Text style={styles.itemText}>{MENU_TEXT.homepage}</Text>
              </Pressable>
            ) : null}
            <View style={styles.divider} />
            <Text style={styles.groupTitle}>{MENU_TEXT.menuTitle}</Text>
            {(["nearest", "recent"] as const).map((rule) => (
              <Pressable
                key={rule}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: heroRule === rule }}
                disabled={heroRule === null}
                onPress={() => void chooseRule(rule)}
                style={[styles.item, styles.ruleItem]}
                testID={`visit-menu-hero-${rule}`}
              >
                <Text style={styles.itemText}>{rule === "nearest" ? MENU_TEXT.nearest : MENU_TEXT.recent}</Text>
                <Text style={styles.ruleMark}>
                  {heroRule === rule ? "✓" : rule === "nearest" ? MENU_TEXT.basic : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  more: { minWidth: 44, minHeight: 36, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 24, color: C.inkStrong },
  scrim: { flex: 1, backgroundColor: C.shadowSoft, alignItems: "flex-end", paddingTop: 110, paddingRight: 12 },
  menu: {
    ...cardSurface(theme, { onPanel: true }),
    minWidth: 220,
    paddingVertical: 4,
  },
  item: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 },
  itemText: { fontSize: 14, fontWeight: "500", color: C.text },
  divider: { height: 1, backgroundColor: C.seamHairline, marginVertical: 4 },
  groupTitle: { fontSize: 12, color: C.inkSoft, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  ruleItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ruleMark: { fontSize: 12, color: C.inkSoft },
});
