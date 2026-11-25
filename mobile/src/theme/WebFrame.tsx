// 넓은 웹 화면(2026-11-18 D 결정 "넓은 화면 처리" A): 앱 전체를 폭 480 칼럼으로 가운데에 세우고,
// 바깥은 바탕(`bg`) 위에 줄눈 격자(칸 120, 리벳 없음)가 옅게 이어지는 벽.
// 마우스로 쓰는 넓은 화면(노트북·데스크톱)에서만 켠다. 손가락으로 쓰는 웹(태블릿, 가로로 돌린 휴대폰)과 앱은 화면을 꽉 채운다(2026-11-18 D).
// 웹 글꼴: Noto Sans KR 400·500을 웹에서만 불러온다(Android·iOS는 기기 한글 글꼴이 같은 굵기를 가진다).
import React, { useEffect, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { theme } from "./index";

export const APP_MAX_WIDTH = 480;
const BAY = 120;
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500&display=swap";

function useWebFont() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById("app-font")) return;
    const link = document.createElement("link");
    link.id = "app-font";
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.id = "app-font-face";
    // RN 웹의 기본 글꼴 지정을 덮는다(입력 칸 포함)
    style.textContent = `div, span, input, textarea, button { font-family: "Noto Sans KR", system-ui, sans-serif !important; }`;
    document.head.appendChild(style);
  }, []);
}

function Wall({ width, height }: { width: number; height: number }) {
  const cols = Math.ceil(width / BAY / 2) + 1;
  const rows = Math.ceil(height / BAY) + 1;
  const mid = width / 2;
  const lines: ReactNode[] = [];
  for (let i = -cols; i <= cols; i++) {
    lines.push(<View key={`v${i}`} style={[styles.v, { left: mid + i * BAY }]} />);
  }
  for (let j = 0; j < rows; j++) lines.push(<View key={`h${j}`} style={[styles.h, { top: j * BAY }]} />);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="web-wall">
      {lines}
    </View>
  );
}

/** 웹에서 마우스처럼 정밀한 포인터로 쓰는 화면인가(태블릿·휴대폰 브라우저는 아니다) */
export function isDesktopPointer(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function WebFrame({ children }: { children: ReactNode }) {
  useWebFont();
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== "web") return <>{children}</>;
  const framed = width > APP_MAX_WIDTH && isDesktopPointer();
  return (
    <View style={framed ? styles.outer : styles.fill}>
      {framed ? <Wall width={width} height={height} /> : null}
      <View style={framed ? styles.column : styles.fill} testID={framed ? "web-column" : undefined}>
        {children}
      </View>
    </View>
  );
}

/**
 * 아래에서 올라오는 창·가운데 확인 창의 `Modal` 안을 감싼다(core APP-0 C4 "웹 하단 창 폭", 2026-11-25 C-92).
 * RN 웹 `Modal`은 `document.body`에 붙어 앱 칼럼 밖 화면 전체 폭으로 펼쳐졌다 → WebFrame이 칼럼을 세우는
 * 조건(마우스로 쓰는 넓은 웹)에서만 창 안을 폭 480 가운데 칼럼으로 둔다. 앱·좁은 웹은 그대로(화면 폭).
 * 누른 자리 바로 아래에 뜨는 작은 메뉴(창 좌표로 잰 것)는 감싸지 않는다.
 */
export function ModalFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || !(width > APP_MAX_WIDTH && isDesktopPointer())) return <>{children}</>;
  return (
    <View style={styles.modalOuter} testID="modal-column">
      <View style={styles.modalColumn}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  modalOuter: { flex: 1, alignItems: "center" },
  modalColumn: { flex: 1, width: APP_MAX_WIDTH, maxWidth: "100%" },
  outer: { flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", overflow: "hidden" },
  v: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: theme.colors.seamHairline, opacity: 0.55 },
  h: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: theme.colors.seamHairline, opacity: 0.55 },
  column: {
    flex: 1,
    width: APP_MAX_WIDTH,
    overflow: "hidden",
    backgroundColor: theme.colors.bg,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.seamHairline,
    shadowColor: theme.colors.shadowCast,
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
  },
});
