// 3탭 바(글자 + 밑줄) — contracts/my-collection.md MY-1 Y1·Y-O2. 내리면 화면 맨 위에 붙는다(화면의 stickyHeaderIndices).
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";
import { MY_TEXT, TABS, type CollectionTab } from "./useMyCollection";

const C = theme.colors;

export type CollectionTabsProps = {
  active: CollectionTab;
  onSelect(tab: CollectionTab): void;
};

export function CollectionTabs({ active, onSelect }: CollectionTabsProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist" testID="collection-tabs">
      {TABS.map((tab) => {
        const on = tab === active;
        return (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(tab)}
            style={styles.tab}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{MY_TEXT.tabs[tab]}</Text>
            <View style={[styles.underline, on && styles.underlineOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  tab: { flex: 1, alignItems: "center", paddingTop: 10, minHeight: 44 },
  label: { fontSize: 14, color: C.textSub, paddingBottom: 8 },
  labelOn: { fontWeight: "500", color: C.text },
  underline: { height: 2, alignSelf: "stretch", marginHorizontal: 16 },
  underlineOn: { backgroundColor: C.inkStrong },
});
