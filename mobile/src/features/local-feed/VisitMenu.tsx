// 방문 페이지 ⋯ 메뉴: 도서관 기본값 켜고 끄기·도서관 홈페이지 (contracts/local-feed.md VISIT-2 G4, V-#3)
// 홈 처음 주인공 설정(L6)은 2026-11-25 설정 화면으로 옮겼다(C-89, 사용자 결정) — 여기에는 두 항목만.
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { openExternalUrl } from "../../lib/platform";
import type { LibraryDetail } from "../../lib/publicApi";
import { getDefaultLibrary, setDefaultLibrary } from "../../lib/visits";
import { cardSurface, type Theme } from "../../theme";
import { lookKit, useLook } from "./useLibraryLook";
import { ModalFrame } from "../../theme/WebFrame";


export const MENU_TEXT = {
  turnOn: "앱을 켜면 여기부터 열기",
  turnOff: "바로 열기 끄기",
  homepage: "도서관 홈페이지",
  onNotice: (name: string) => `앱을 켜면 ${name}부터 열어요`,
  offNotice: "바로 열기를 껐어요",
  homepageFailed: "홈페이지를 열 수 없어요",
} as const;

export function VisitMenu({
  library,
  onNotice,
}: {
  library: Pick<LibraryDetail, "id" | "name" | "homepage">;
  onNotice: (text: string) => void;
}) {
  const { styles } = useLook(makeStyles);
  const [open, setOpen] = useState(false);
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    void getDefaultLibrary().then((id) => alive && setIsDefault(id === library.id));
    return () => {
      alive = false;
    };
  }, [library.id, open]);

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
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}><ModalFrame>
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
          </View>
        </Pressable>
      </ModalFrame></Modal>
    </>
  );
}

const makeStyles = (theme: Theme) => {
  const { C } = lookKit(theme);
  return StyleSheet.create({
  more: { minWidth: 44, minHeight: 36, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 24, color: C.inkStrong },
  scrim: { flex: 1, backgroundColor: C.shadowSoft, alignItems: "flex-end", paddingTop: 56, paddingRight: 12 },
  menu: {
    ...cardSurface(theme, { onPanel: true }),
    minWidth: 220,
    paddingVertical: 4,
  },
  item: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 },
  itemText: { fontSize: 14, fontWeight: "500", color: C.text },
  });
};
