// "도서관 찾기" 창 (계약서 library-visit.md VISIT-1 V11·V13, 결정 1: 위에서 반쯤 내려오는 하얀 창)
// 색은 theme 토큰만(창 paper, 테두리 divider, 덮개 shadowDeep, 글자 text·inkMuted). 배경이 없어 창이 투명하던 것 고침(시연 전 개선 S1 W-2)
import React, { useEffect } from "react";
import { BackHandler, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { LibrarySummary, Region } from "./deps";
import { theme } from "../../theme";
import { useFindLibrary } from "./useFindLibrary";

const c = theme.colors;

const TEXT = {
  close: "‹",
  placeholder: "지역이나 도서관 이름",
  guide: "지역이나 도서관 이름을 적어 주세요",
  loading: "찾는 중…",
  error: "지금은 도서관을 불러올 수 없어요.",
  reload: "↻ 새로고침",
  empty: (q: string) => `‘${q}’에 맞는 지역·도서관을 찾지 못했어요.`,
};

type Row = { kind: "region"; region: Region } | { kind: "library"; library: LibrarySummary };

export type FindLibrarySheetProps = {
  onClose(): void;
  onPickRegion(region: Region): void;
  onPickLibrary(library: LibrarySummary): void;
};

export function FindLibrarySheet(props: FindLibrarySheetProps) {
  const { onClose, onPickRegion, onPickLibrary } = props;
  const find = useFindLibrary();

  // V13: Android 기기 뒤로 버튼은 창만 닫는다(다른 플랫폼에서는 부르지 않는 공통 API, C4)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  // V11: 지역 먼저, 그 아래 도서관. 결과 줄 앞에 핀 그림 없음
  const rows: Row[] = [
    ...find.regions.map((region) => ({ kind: "region" as const, region })),
    ...find.libraries.map((library) => ({ kind: "library" as const, library })),
  ];

  let message: React.ReactNode = null;
  if (find.status === "idle") message = <Text style={styles.guide}>{TEXT.guide}</Text>;
  else if (find.status === "empty") message = <Text style={styles.guide}>{TEXT.empty(find.query.trim())}</Text>;
  else if (find.status === "error")
    message = (
      <View style={styles.errorBox}>
        <Text style={styles.guide}>{TEXT.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => find.setQuery(find.query)} style={styles.button}>
          <Text style={styles.buttonText}>{TEXT.reload}</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.root}>
      {/* V13: 창 밖 흐린 지도를 누르면 닫힘 */}
      <Pressable accessibilityLabel="닫기" testID="find-sheet-backdrop" onPress={onClose} style={styles.backdrop} />
      <View style={styles.sheet} testID="find-sheet">
        <View style={styles.inputRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>{TEXT.close}</Text>
          </Pressable>
          <TextInput
            testID="find-sheet-input"
            autoFocus
            value={find.query}
            onChangeText={find.setQuery}
            placeholder={TEXT.placeholder}
            placeholderTextColor={c.inkMuted}
            returnKeyType="search"
            style={styles.input}
          />
        </View>
        {find.status === "loading" ? <Text style={styles.guide}>{TEXT.loading}</Text> : null}
        {message ?? (
          <FlatList
            data={rows}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(r) => (r.kind === "region" ? `r-${r.region.code}` : `l-${r.library.id}`)}
            renderItem={({ item }) =>
              item.kind === "region" ? (
                <Pressable accessibilityRole="button" onPress={() => onPickRegion(item.region)} style={styles.row}>
                  <Text style={styles.rowTitle}>{item.region.label}</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => onPickLibrary(item.library)} style={styles.row}>
                  <Text style={styles.rowTitle}>{item.library.name}</Text>
                  {item.library.address ? <Text style={styles.rowSub}>{item.library.address}</Text> : null}
                </Pressable>
              )
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: c.shadowDeep },
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    maxHeight: "55%",
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.divider,
    backgroundColor: c.paper,
  },
  inputRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginBottom: 6, gap: 6 },
  closeButton: { paddingHorizontal: 10, paddingVertical: 6 },
  closeText: { fontSize: 22, color: c.text },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: c.text,
  },
  guide: { paddingVertical: 14, paddingHorizontal: 20, fontSize: 14, textAlign: "center", color: c.inkMuted },
  errorBox: { alignItems: "center", paddingBottom: 10 },
  button: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: c.divider, borderRadius: 999 },
  buttonText: { color: c.text },
  row: { paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.divider },
  rowTitle: { fontSize: 15, color: c.text },
  rowSub: { fontSize: 12, marginTop: 2, color: c.inkMuted },
});
