import { onFill, theme } from "../../theme";
import type { LatLng, MapMarker } from "./KakaoMap";

export const KAKAO_MAP_BASE_URL = "https://map.localone.invalid";
export const KAKAO_READY_TIMEOUT_MS = 5000;
export const DEFAULT_MAP_LEVEL = 5;

export type KakaoMapPalette = {
  bg: string;
  fill1: string;
  onFill1: string;
  paper: string;
  inkStrong: string;
  pinClosed: string;
  onPinClosed: string;
  text: string;
  textSub: string;
  shadowSoft: string;
};

export type KakaoBridgeMessage =
  | { type: "ready" }
  | { type: "error"; reason: "load_failed" }
  | { type: "marker"; id: number }
  | { type: "cluster"; lat: number; lng: number }
  | { type: "regionChange"; lat: number; lng: number };

export function getKakaoJsKey(): string {
  return process.env.EXPO_PUBLIC_KAKAO_JS_KEY?.trim() ?? "";
}

export function getKakaoSdkUrl(appKey: string): string {
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
    appKey
  )}&libraries=clusterer&autoload=false`;
}

export function getKakaoMapPalette(): KakaoMapPalette {
  const { colors } = theme;
  return {
    bg: colors.bg,
    fill1: colors.fill1,
    onFill1: onFill(colors.fill1),
    paper: colors.paper,
    inkStrong: colors.inkStrong,
    pinClosed: colors.pinClosed,
    onPinClosed: onFill(colors.pinClosed),
    text: colors.text,
    textSub: colors.textSub,
    shadowSoft: colors.shadowSoft,
  };
}

/** HTML `<script>` 삽입·`injectJavaScript` 전달 시 태그/줄구분 문자를 안전하게 이스케이프한다. */
export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseKakaoBridgeMessage(raw: string): KakaoBridgeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    return null;
  }
  const msg = parsed as Record<string, unknown>;
  switch (msg.type) {
    case "ready":
      return { type: "ready" };
    case "error":
      return msg.reason === "load_failed"
        ? { type: "error", reason: "load_failed" }
        : null;
    case "marker":
      return typeof msg.id === "number" && Number.isSafeInteger(msg.id) && msg.id > 0
        ? { type: "marker", id: msg.id }
        : null;
    case "cluster":
      return isFiniteNumber(msg.lat) && isFiniteNumber(msg.lng)
        ? { type: "cluster", lat: msg.lat, lng: msg.lng }
        : null;
    case "regionChange":
      return isFiniteNumber(msg.lat) && isFiniteNumber(msg.lng)
        ? { type: "regionChange", lat: msg.lat, lng: msg.lng }
        : null;
    default:
      return null;
  }
}

export function createMarkerContentElement(
  doc: Document,
  marker: MapMarker,
  selected: boolean,
  palette: KakaoMapPalette,
  onClick: () => void
): HTMLElement {
  const root = doc.createElement("button");
  root.type = "button";
  root.setAttribute("aria-label", marker.subtitle ? `${marker.title} ${marker.subtitle}` : marker.title);
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "transparent",
    border: "0",
    padding: "0",
    margin: "0",
    cursor: "pointer",
    userSelect: "none",
  });

  const pin = doc.createElement("div");
  const isClosed = marker.tone === "closed";
  Object.assign(pin.style, {
    width: selected ? "22px" : "18px",
    height: selected ? "22px" : "18px",
    borderRadius: "9999px",
    background: isClosed ? palette.pinClosed : palette.fill1,
    border: selected ? `3px solid ${palette.inkStrong}` : `2.5px solid ${palette.paper}`,
    boxShadow: `0 2px 6px ${palette.shadowSoft}`,
    boxSizing: "border-box",
    pointerEvents: "none",
  });
  root.appendChild(pin);

  const label = doc.createElement("div");
  Object.assign(label.style, {
    marginTop: "3px",
    padding: "2px 6px",
    borderRadius: "8px",
    background: palette.paper,
    border: selected ? `1.5px solid ${palette.inkStrong}` : "none",
    boxShadow: `0 1px 4px ${palette.shadowSoft}`,
    textAlign: "center",
    lineHeight: "1.2",
    pointerEvents: "none",
    maxWidth: "128px",
  });

  const titleEl = doc.createElement("div");
  titleEl.textContent = marker.title;
  Object.assign(titleEl.style, {
    fontSize: "11px",
    fontWeight: "500",
    color: palette.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });
  label.appendChild(titleEl);

  if (marker.subtitle) {
    const subEl = doc.createElement("div");
    subEl.textContent = marker.subtitle;
    Object.assign(subEl.style, {
      fontSize: "10px",
      fontWeight: "500",
      color: isClosed ? palette.pinClosed : palette.textSub,
      whiteSpace: "nowrap",
    });
    label.appendChild(subEl);
  }

  root.appendChild(label);
  root.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return root;
}

export function createClusterContentElement(
  doc: Document,
  count: number,
  palette: KakaoMapPalette,
  onClick: (event: Event) => void
): HTMLElement {
  const root = doc.createElement("button");
  root.type = "button";
  root.setAttribute("aria-label", `도서관 ${count}곳`);
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "transparent",
    border: "0",
    padding: "0",
    margin: "0",
    cursor: "pointer",
    userSelect: "none",
  });

  const circle = doc.createElement("div");
  circle.textContent = String(count);
  Object.assign(circle.style, {
    width: "38px",
    height: "38px",
    borderRadius: "9999px",
    background: palette.fill1,
    border: `3px solid ${palette.paper}`,
    color: palette.onFill1,
    fontSize: "15px",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    boxShadow: `0 2px 6px ${palette.shadowSoft}`,
    pointerEvents: "none",
  });
  root.appendChild(circle);

  const caption = doc.createElement("div");
  caption.textContent = `도서관 ${count}곳`;
  Object.assign(caption.style, {
    marginTop: "2px",
    padding: "1px 6px",
    borderRadius: "9999px",
    background: palette.paper,
    color: palette.text,
    fontSize: "10px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    boxShadow: `0 1px 3px ${palette.shadowSoft}`,
    pointerEvents: "none",
  });
  root.appendChild(caption);

  root.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return root;
}

export type MapRenderState = {
  center: LatLng;
  level: number;
  markers: MapMarker[];
  selectedId: number | null;
  cluster: boolean;
};

export function buildKakaoMapHtml(options: {
  appKey: string;
  center: LatLng;
  level: number;
  markers: MapMarker[];
  selectedId: number | null;
  cluster: boolean;
  palette?: KakaoMapPalette;
}): string {
  const palette = options.palette ?? getKakaoMapPalette();
  const sdkUrl = getKakaoSdkUrl(options.appKey);
  const initialState: MapRenderState = {
    center: options.center,
    level: options.level,
    markers: options.markers,
    selectedId: options.selectedId,
    cluster: options.cluster,
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
  html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: ${palette.bg}; }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var PALETTE = ${safeJsonStringify(palette)};
  var state = ${safeJsonStringify(initialState)};
  var map = null;
  var clusterer = null;
  var overlays = [];
  var lastCenter = null;
  var lastLevel = null;

  function post(payload) {
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function makePinElement(marker, selected) {
    var root = document.createElement("button");
    root.type = "button";
    root.setAttribute("aria-label", marker.subtitle ? marker.title + " " + marker.subtitle : marker.title);
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.alignItems = "center";
    root.style.background = "transparent";
    root.style.border = "0";
    root.style.padding = "0";
    root.style.margin = "0";
    root.style.cursor = "pointer";
    root.style.userSelect = "none";

    var isClosed = marker.tone === "closed";
    var pin = document.createElement("div");
    pin.style.width = selected ? "22px" : "18px";
    pin.style.height = selected ? "22px" : "18px";
    pin.style.borderRadius = "9999px";
    pin.style.background = isClosed ? PALETTE.pinClosed : PALETTE.fill1;
    pin.style.border = selected ? "3px solid " + PALETTE.inkStrong : "2.5px solid " + PALETTE.paper;
    pin.style.boxShadow = "0 2px 6px " + PALETTE.shadowSoft;
    pin.style.boxSizing = "border-box";
    pin.style.pointerEvents = "none";
    root.appendChild(pin);

    var label = document.createElement("div");
    label.style.marginTop = "3px";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "8px";
    label.style.background = PALETTE.paper;
    label.style.border = selected ? "1.5px solid " + PALETTE.inkStrong : "none";
    label.style.boxShadow = "0 1px 4px " + PALETTE.shadowSoft;
    label.style.textAlign = "center";
    label.style.lineHeight = "1.2";
    label.style.pointerEvents = "none";
    label.style.maxWidth = "128px";

    var titleEl = document.createElement("div");
    titleEl.textContent = marker.title;
    titleEl.style.fontSize = "11px";
    titleEl.style.fontWeight = "700";
    titleEl.style.color = PALETTE.text;
    titleEl.style.whiteSpace = "nowrap";
    titleEl.style.overflow = "hidden";
    titleEl.style.textOverflow = "ellipsis";
    label.appendChild(titleEl);

    if (marker.subtitle) {
      var subEl = document.createElement("div");
      subEl.textContent = marker.subtitle;
      subEl.style.fontSize = "10px";
      subEl.style.fontWeight = "600";
      subEl.style.color = isClosed ? PALETTE.pinClosed : PALETTE.textSub;
      subEl.style.whiteSpace = "nowrap";
      label.appendChild(subEl);
    }

    root.appendChild(label);
    root.addEventListener("click", function (e) {
      e.stopPropagation();
      post({ type: "marker", id: marker.id });
    });
    return root;
  }

  function makeClusterElement(cluster) {
    var count = cluster.getSize();
    var root = document.createElement("button");
    root.type = "button";
    root.setAttribute("aria-label", "도서관 " + count + "곳");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.alignItems = "center";
    root.style.background = "transparent";
    root.style.border = "0";
    root.style.padding = "0";
    root.style.margin = "0";
    root.style.cursor = "pointer";
    root.style.userSelect = "none";

    var circle = document.createElement("div");
    circle.textContent = String(count);
    circle.style.width = "38px";
    circle.style.height = "38px";
    circle.style.borderRadius = "9999px";
    circle.style.background = PALETTE.fill1;
    circle.style.border = "3px solid " + PALETTE.paper;
    circle.style.color = PALETTE.onFill1;
    circle.style.fontSize = "15px";
    circle.style.fontWeight = "700";
    circle.style.display = "flex";
    circle.style.alignItems = "center";
    circle.style.justifyContent = "center";
    circle.style.boxSizing = "border-box";
    circle.style.boxShadow = "0 2px 6px " + PALETTE.shadowSoft;
    circle.style.pointerEvents = "none";
    root.appendChild(circle);

    var caption = document.createElement("div");
    caption.textContent = "도서관 " + count + "곳";
    caption.style.marginTop = "2px";
    caption.style.padding = "1px 6px";
    caption.style.borderRadius = "9999px";
    caption.style.background = PALETTE.paper;
    caption.style.color = PALETTE.text;
    caption.style.fontSize = "10px";
    caption.style.fontWeight = "700";
    caption.style.whiteSpace = "nowrap";
    caption.style.boxShadow = "0 1px 3px " + PALETTE.shadowSoft;
    caption.style.pointerEvents = "none";
    root.appendChild(caption);

    root.addEventListener("click", function (e) {
      e.stopPropagation();
      var center = cluster.getCenter();
      map.setLevel(Math.max(1, map.getLevel() - 1), { anchor: center });
      post({ type: "cluster", lat: center.getLat(), lng: center.getLng() });
    });
    return root;
  }

  function clearMarkers() {
    if (clusterer) {
      clusterer.clear();
    }
    for (var i = 0; i < overlays.length; i++) {
      overlays[i].setMap(null);
    }
    overlays = [];
  }

  function renderMarkers() {
    clearMarkers();
    var list = state.markers || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(m.lat, m.lng),
        content: makePinElement(m, m.id === state.selectedId),
        xAnchor: 0.5,
        yAnchor: 0.35,
        clickable: true,
        zIndex: m.id === state.selectedId ? 3 : 1
      });
      overlays.push(overlay);
    }
    if (state.cluster !== false && clusterer) {
      clusterer.addMarkers(overlays);
    } else {
      for (var j = 0; j < overlays.length; j++) {
        overlays[j].setMap(map);
      }
    }
  }

  window.__localoneUpdateMap = function (next) {
    state = next;
    if (!map) return;
    if (!lastCenter || lastCenter.lat !== next.center.lat || lastCenter.lng !== next.center.lng) {
      map.setCenter(new kakao.maps.LatLng(next.center.lat, next.center.lng));
      lastCenter = { lat: next.center.lat, lng: next.center.lng };
    }
    if (typeof next.level === "number" && lastLevel !== next.level) {
      map.setLevel(next.level);
      lastLevel = next.level;
    }
    renderMarkers();
  };

  function init() {
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      post({ type: "error", reason: "load_failed" });
      return;
    }
    window.kakao.maps.load(function () {
      try {
        var container = document.getElementById("map");
        var centerLatLng = new kakao.maps.LatLng(state.center.lat, state.center.lng);
        map = new kakao.maps.Map(container, {
          center: centerLatLng,
          level: state.level,
          mapTypeId: kakao.maps.MapTypeId.ROADMAP
        });
        lastCenter = { lat: state.center.lat, lng: state.center.lng };
        lastLevel = state.level;

        clusterer = new kakao.maps.MarkerClusterer({
          map: map,
          averageCenter: true,
          minLevel: 2,
          disableClickZoom: true
        });
        kakao.maps.event.addListener(clusterer, "clustered", function (clusters) {
          for (var i = 0; i < clusters.length; i++) {
            var cluster = clusters[i];
            cluster.getClusterMarker().setContent(makeClusterElement(cluster));
          }
        });
        kakao.maps.event.addListener(map, "dragend", function () {
          var c = map.getCenter();
          post({ type: "regionChange", lat: c.getLat(), lng: c.getLng() });
        });

        renderMarkers();
        post({ type: "ready" });
      } catch (err) {
        post({ type: "error", reason: "load_failed" });
      }
    });
  }

  var script = document.createElement("script");
  script.src = ${safeJsonStringify(sdkUrl)};
  script.async = true;
  script.onload = init;
  script.onerror = function () {
    post({ type: "error", reason: "load_failed" });
  };
  document.head.appendChild(script);
})();
</script>
</body>
</html>`;
}
