// 목록 모드 도서관 줄 (계약서 VISIT-1 V8): 이름 · area_label(없으면 주소) · 오늘 운영시간(휴관/모르면 생략)
// TODO(연결): D theme — 색은 core `theme.colors`가 머지된 뒤 넣는다(글자 text·textSub, 구분선 divider)
import React from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import type { LibrarySummary } from "./deps";
import { todayLine } from "./format";

export function rowText(lib: LibrarySummary): string {
  return [lib.name, lib.area_label ?? lib.address, todayLine(lib.today)].filter(Boolean).join(" · ");
}

export function LibraryList(props: { libraries: LibrarySummary[]; onPress(lib: LibrarySummary): void }) {
  return (
    <FlatList
      data={props.libraries}
      keyExtractor={(l) => String(l.id)}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          testID={`library-row-${item.id}`}
          onPress={() => props.onPress(item)}
          style={styles.row}
        >
          <Text style={styles.text}>{rowText(item)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  text: { fontSize: 15 },
});
