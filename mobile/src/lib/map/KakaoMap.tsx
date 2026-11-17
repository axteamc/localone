import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import {
  buildKakaoMapHtml,
  DEFAULT_MAP_LEVEL,
  getKakaoJsKey,
  KAKAO_MAP_BASE_URL,
  KAKAO_READY_TIMEOUT_MS,
  parseKakaoBridgeMessage,
  safeJsonStringify,
} from "./kakaoHtml";

export type LatLng = { lat: number; lng: number };

export type MapMarker = {
  id: number;
  lat: number;
  lng: number;
  title: string;
  subtitle: string | null;
  tone: "normal" | "closed";
};

export type KakaoMapProps = {
  center: LatLng;
  level?: number;
  markers: MapMarker[];
  selectedId?: number | null;
  cluster?: boolean;
  onMarkerPress(id: number): void;
  onClusterPress?(center: LatLng): void;
  onRegionChange?(center: LatLng): void;
  onReady?(): void;
  onError(reason: "no_key" | "load_failed" | "timeout"): void;
};

type WebViewHandle = {
  injectJavaScript: (script: string) => void;
};

type WebViewComponentWithRef = React.ComponentType<
  React.ComponentProps<typeof WebView> & { ref?: React.Ref<WebViewHandle> }
>;

const WebViewWithRef = WebView as unknown as WebViewComponentWithRef;

export function KakaoMap(props: KakaoMapProps) {
  const {
    center,
    level = DEFAULT_MAP_LEVEL,
    markers,
    selectedId = null,
    cluster = true,
  } = props;

  const appKey = getKakaoJsKey();
  const webViewRef = useRef<WebViewHandle | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorReportedRef = useRef(false);
  const readyRef = useRef(false);

  const callbacksRef = useRef(props);
  callbacksRef.current = props;

  const latestStateRef = useRef({
    center,
    level,
    markers,
    selectedId,
    cluster,
  });
  latestStateRef.current = { center, level, markers, selectedId, cluster };

  const clearReadyTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reportError = useCallback(
    (reason: "no_key" | "load_failed" | "timeout") => {
      if (errorReportedRef.current || readyRef.current) return;
      errorReportedRef.current = true;
      clearReadyTimer();
      callbacksRef.current.onError(reason);
    },
    [clearReadyTimer]
  );

  const pushStateToWebView = useCallback(() => {
    if (!readyRef.current || !webViewRef.current) return;
    const payload = safeJsonStringify(latestStateRef.current);
    webViewRef.current.injectJavaScript(
      `window.__localoneUpdateMap && window.__localoneUpdateMap(${payload}); true;`
    );
  }, []);

  useEffect(() => {
    errorReportedRef.current = false;
    readyRef.current = false;

    if (!appKey) {
      reportError("no_key");
      return;
    }

    timeoutRef.current = setTimeout(() => {
      reportError("timeout");
    }, KAKAO_READY_TIMEOUT_MS);

    return () => {
      clearReadyTimer();
    };
  }, [appKey, clearReadyTimer, reportError]);

  useEffect(() => {
    pushStateToWebView();
  }, [center.lat, center.lng, level, markers, selectedId, cluster, pushStateToWebView]);

  const initialHtml = useMemo(() => {
    if (!appKey) return "";
    return buildKakaoMapHtml({
      appKey,
      center: latestStateRef.current.center,
      level: latestStateRef.current.level,
      markers: latestStateRef.current.markers,
      selectedId: latestStateRef.current.selectedId,
      cluster: latestStateRef.current.cluster,
    });
  }, [appKey]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg = parseKakaoBridgeMessage(event.nativeEvent.data);
      if (!msg) return;

      switch (msg.type) {
        case "ready":
          if (errorReportedRef.current || readyRef.current) return;
          readyRef.current = true;
          clearReadyTimer();
          callbacksRef.current.onReady?.();
          pushStateToWebView();
          break;
        case "error":
          reportError(msg.reason);
          break;
        case "marker":
          callbacksRef.current.onMarkerPress(msg.id);
          break;
        case "cluster":
          callbacksRef.current.onClusterPress?.({ lat: msg.lat, lng: msg.lng });
          break;
        case "regionChange":
          callbacksRef.current.onRegionChange?.({ lat: msg.lat, lng: msg.lng });
          break;
      }
    },
    [clearReadyTimer, pushStateToWebView, reportError]
  );

  const handleLoadError = useCallback(() => {
    reportError("load_failed");
  }, [reportError]);

  if (!appKey) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WebViewWithRef
        ref={webViewRef}
        source={{ html: initialHtml, baseUrl: KAKAO_MAP_BASE_URL }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        onMessage={handleMessage}
        onError={handleLoadError}
        onHttpError={handleLoadError}
        style={styles.webview}
      />
    </View>
  );
}

export default KakaoMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
