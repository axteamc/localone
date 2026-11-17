import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, render } from "@testing-library/react-native";
import React from "react";
import { theme } from "../../../theme";
import KakaoMap, { type MapMarker } from "../KakaoMap";
import KakaoMapWeb, { resetKakaoSdkLoaderForTest } from "../KakaoMap.web";
import {
  buildKakaoMapHtml,
  KAKAO_MAP_BASE_URL,
  KAKAO_READY_TIMEOUT_MS,
  parseKakaoBridgeMessage,
} from "../kakaoHtml";

type MockWebViewProps = {
  source?: { html?: string; baseUrl?: string };
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onError?: () => void;
  onHttpError?: () => void;
};

let mockLatestWebViewProps: MockWebViewProps | null = null;
const mockInjectJavaScript = jest.fn<(script: string) => void>();
let mockWebViewRenderCount = 0;

jest.mock("react-native-webview", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");

  const MockWebView = ReactLib.forwardRef(function MockWebView(
    props: MockWebViewProps,
    ref: React.Ref<{ injectJavaScript: (script: string) => void }>
  ) {
    mockWebViewRenderCount += 1;
    mockLatestWebViewProps = props;
    ReactLib.useImperativeHandle(ref, () => ({
      injectJavaScript: mockInjectJavaScript,
    }));
    return ReactLib.createElement(View, { testID: "kakao-webview" });
  });

  return {
    __esModule: true,
    default: MockWebView,
    WebView: MockWebView,
  };
});

const SAMPLE_CENTER = { lat: 37.5815, lng: 126.9831 };
const SAMPLE_MARKERS: MapMarker[] = [
  {
    id: 101,
    lat: 37.5815,
    lng: 126.9831,
    title: "정독도서관",
    subtitle: "420m",
    tone: "normal",
  },
  {
    id: 102,
    lat: 37.5762,
    lng: 126.9667,
    title: "종로도서관",
    subtitle: "휴관",
    tone: "closed",
  },
];

describe("KakaoMap (APP-0-P3)", () => {
  const originalKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockLatestWebViewProps = null;
    mockWebViewRenderCount = 0;
    delete process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalKey === undefined) {
      delete process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
    } else {
      process.env.EXPO_PUBLIC_KAKAO_JS_KEY = originalKey;
    }
  });

  test("kakao map without key calls onError(no_key)", async () => {
    const onError = jest.fn();
    const onMarkerPress = jest.fn();

    const screen = await render(
      <KakaoMap
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={onMarkerPress}
        onError={onError}
      />
    );

    expect(screen.queryByTestId("kakao-webview")).toBeNull();
    expect(mockWebViewRenderCount).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("no_key");

    await act(async () => {
      jest.advanceTimersByTime(KAKAO_READY_TIMEOUT_MS + 1000);
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("kakao map with whitespace-only key calls onError(no_key)", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "   ";
    const onError = jest.fn();

    await render(
      <KakaoMap
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={jest.fn()}
        onError={onError}
      />
    );

    expect(mockWebViewRenderCount).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("no_key");
  });

  test("kakao map marker press message calls onMarkerPress", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "test-kakao-js-key";
    const onMarkerPress = jest.fn();
    const onClusterPress = jest.fn();
    const onRegionChange = jest.fn();
    const onReady = jest.fn();
    const onError = jest.fn();

    const screen = await render(
      <KakaoMap
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        cluster
        onMarkerPress={onMarkerPress}
        onClusterPress={onClusterPress}
        onRegionChange={onRegionChange}
        onReady={onReady}
        onError={onError}
      />
    );

    expect(screen.getByTestId("kakao-webview")).toBeTruthy();
    expect(mockLatestWebViewProps?.source?.baseUrl).toBe(KAKAO_MAP_BASE_URL);

    await act(async () => {
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: "ready" }) },
      });
    });
    expect(onReady).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: "marker", id: 101 }) },
      });
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({ type: "cluster", lat: 37.58, lng: 126.98 }),
        },
      });
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            type: "regionChange",
            lat: 37.57,
            lng: 126.99,
          }),
        },
      });
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: { data: "{not-json" },
      });
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: "marker", id: -1 }) },
      });
    });

    expect(onMarkerPress).toHaveBeenCalledTimes(1);
    expect(onMarkerPress).toHaveBeenCalledWith(101);
    expect(onClusterPress).toHaveBeenCalledTimes(1);
    expect(onClusterPress).toHaveBeenCalledWith({ lat: 37.58, lng: 126.98 });
    expect(onRegionChange).toHaveBeenCalledTimes(1);
    expect(onRegionChange).toHaveBeenCalledWith({ lat: 37.57, lng: 126.99 });

    await act(async () => {
      jest.advanceTimersByTime(KAKAO_READY_TIMEOUT_MS + 1000);
    });
    expect(onError).not.toHaveBeenCalled();
  });

  test("kakao map timeout calls onError(timeout)", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "test-kakao-js-key";
    const onError = jest.fn();
    const onReady = jest.fn();

    await render(
      <KakaoMap
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={jest.fn()}
        onReady={onReady}
        onError={onError}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(KAKAO_READY_TIMEOUT_MS - 1);
    });
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("timeout");

    // 시간 초과 후 늦은 ready·오류가 와도 중복 콜백하지 않는다
    await act(async () => {
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: "ready" }) },
      });
      mockLatestWebViewProps?.onError?.();
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("kakao map load error calls onError(load_failed) once and cancels timeout", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "test-kakao-js-key";
    const onError = jest.fn();

    await render(
      <KakaoMap
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={jest.fn()}
        onError={onError}
      />
    );

    await act(async () => {
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({ type: "error", reason: "load_failed" }),
        },
      });
      mockLatestWebViewProps?.onError?.();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("load_failed");

    await act(async () => {
      jest.advanceTimersByTime(KAKAO_READY_TIMEOUT_MS + 1000);
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("updates markers and center via injectJavaScript after ready", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "test-kakao-js-key";
    const onError = jest.fn();

    const screen = await render(
      <KakaoMap
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        selectedId={null}
        onMarkerPress={jest.fn()}
        onError={onError}
      />
    );

    await act(async () => {
      mockLatestWebViewProps?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: "ready" }) },
      });
    });
    mockInjectJavaScript.mockClear();

    const nextMarkers = [SAMPLE_MARKERS[0]!];
    await screen.rerender(
      <KakaoMap
        center={{ lat: 37.57, lng: 126.99 }}
        markers={nextMarkers}
        selectedId={101}
        onMarkerPress={jest.fn()}
        onError={onError}
      />
    );

    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const script = mockInjectJavaScript.mock.calls[0]?.[0] ?? "";
    expect(script).toContain("window.__localoneUpdateMap");
    expect(script).toContain('"selectedId":101');
    expect(script).toContain('"lat":37.57');
  });

  test("kakaoHtml uses ROADMAP, MarkerClusterer, theme tokens, and escapes HTML", () => {
    const html = buildKakaoMapHtml({
      appKey: "abc&123",
      center: SAMPLE_CENTER,
      level: 5,
      markers: [
        {
          id: 99,
          lat: 37.58,
          lng: 126.98,
          title: "</script><script>alert(1)</script>",
          subtitle: null,
          tone: "normal",
        },
      ],
      selectedId: null,
      cluster: true,
    });

    expect(html).toContain("dapi.kakao.com/v2/maps/sdk.js");
    expect(html).toContain("appkey=abc%26123");
    expect(html).toContain("libraries=clusterer");
    expect(html).toContain("kakao.maps.MapTypeId.ROADMAP");
    expect(html).toContain("kakao.maps.MarkerClusterer");
    expect(html).toContain("도서관 ");
    expect(html).toContain(theme.colors.fill1);
    expect(html).toContain(theme.colors.pinClosed);
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  test("parseKakaoBridgeMessage rejects invalid payloads", () => {
    expect(parseKakaoBridgeMessage("invalid")).toBeNull();
    expect(parseKakaoBridgeMessage("{}")).toBeNull();
    expect(parseKakaoBridgeMessage(JSON.stringify({ type: "marker", id: 0 }))).toBeNull();
    expect(
      parseKakaoBridgeMessage(JSON.stringify({ type: "cluster", lat: "x", lng: 1 }))
    ).toBeNull();
    expect(
      parseKakaoBridgeMessage(JSON.stringify({ type: "error", reason: "other" }))
    ).toBeNull();
    expect(
      parseKakaoBridgeMessage(JSON.stringify({ type: "marker", id: 101 }))
    ).toEqual({ type: "marker", id: 101 });
  });
});

type FakeElement = {
  tagName: string;
  src?: string;
  async?: boolean;
  type?: string;
  textContent: string | null;
  style: Record<string, string>;
  attributes: Record<string, string>;
  children: FakeElement[];
  parentNode: { removeChild: (child: FakeElement) => void } | null;
  listeners: Record<string, Array<(e: { stopPropagation: () => void }) => void>>;
  onload?: () => void;
  onerror?: () => void;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: FakeElement) => FakeElement;
  addEventListener: (
    event: string,
    cb: (e: { stopPropagation: () => void }) => void
  ) => void;
  triggerClick: () => void;
};

function makeFakeElement(tagName: string): FakeElement {
  const el: FakeElement = {
    tagName,
    textContent: null,
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(event, cb) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event]!.push(cb);
    },
    triggerClick() {
      for (const cb of this.listeners.click ?? []) {
        cb({ stopPropagation: jest.fn() });
      }
    },
  };
  return el;
}

describe("KakaoMap.web (APP-0-P3)", () => {
  const originalKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalKakao = (globalThis as { window?: { kakao?: unknown } }).window
    ?.kakao;

  let headScripts: FakeElement[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    resetKakaoSdkLoaderForTest();
    delete process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
    headScripts = [];

    const fakeDoc = {
      createElement: (tag: string) => makeFakeElement(tag),
      head: {
        appendChild: (child: FakeElement) => {
          child.parentNode = {
            removeChild: (target: FakeElement) => {
              headScripts = headScripts.filter((s) => s !== target);
            },
          };
          headScripts.push(child);
          return child;
        },
      },
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDoc,
    });
    if (typeof (globalThis as { window?: unknown }).window === "undefined") {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {},
      });
    }
    delete (globalThis as { window: { kakao?: unknown } }).window.kakao;
  });

  afterEach(() => {
    jest.useRealTimers();
    resetKakaoSdkLoaderForTest();
    if (originalKey === undefined) {
      delete process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
    } else {
      process.env.EXPO_PUBLIC_KAKAO_JS_KEY = originalKey;
    }
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
    if ((globalThis as { window?: { kakao?: unknown } }).window) {
      if (originalKakao === undefined) {
        delete (globalThis as { window: { kakao?: unknown } }).window.kakao;
      } else {
        (globalThis as { window: { kakao?: unknown } }).window.kakao =
          originalKakao;
      }
    }
  });

  test("web: kakao map without key calls onError(no_key)", async () => {
    const onError = jest.fn();

    await render(
      <KakaoMapWeb
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={jest.fn()}
        onError={onError}
      />
    );

    expect(headScripts).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("no_key");
  });

  test("web: script failure calls onError(load_failed) once and resets loader", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "web-test-key";
    const onError = jest.fn();

    await render(
      <KakaoMapWeb
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={jest.fn()}
        onError={onError}
      />
    );

    expect(headScripts).toHaveLength(1);
    expect(headScripts[0]?.src).toContain("appkey=web-test-key");

    await act(async () => {
      headScripts[0]?.onerror?.();
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("load_failed");
    expect(headScripts).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(KAKAO_READY_TIMEOUT_MS + 1000);
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("web: timeout calls onError(timeout)", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "web-test-key";
    const onError = jest.fn();
    const onReady = jest.fn();

    await render(
      <KakaoMapWeb
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        onMarkerPress={jest.fn()}
        onReady={onReady}
        onError={onError}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(KAKAO_READY_TIMEOUT_MS);
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("timeout");

    // 시간 초과 뒤 늦은 script 실패가 와도 중복 오류를 알리지 않는다
    await act(async () => {
      headScripts[0]?.onerror?.();
      await Promise.resolve();
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("web: loads SDK, renders ROADMAP/markers/clusters, and fires callbacks", async () => {
    process.env.EXPO_PUBLIC_KAKAO_JS_KEY = "web-test-key";
    const onMarkerPress = jest.fn();
    const onClusterPress = jest.fn();
    const onRegionChange = jest.fn();
    const onReady = jest.fn();
    const onError = jest.fn();

    const listeners: Array<{ target: unknown; type: string; handler: (...a: unknown[]) => void }> = [];
    const createdOverlays: Array<{ content: FakeElement; setMap: jest.Mock }> = [];
    const addedToClusterer: unknown[][] = [];
    let currentLevel = 5;
    const setLevel = jest.fn<(next: number, opts?: unknown) => void>((next) => {
      currentLevel = next;
    });
    const setCenter = jest.fn();

    const fakeMapInstance = {
      setCenter,
      getCenter: () => ({ getLat: () => 37.57, getLng: () => 126.99 }),
      setLevel,
      getLevel: () => currentLevel,
    };
    const fakeClustererInstance = {
      clear: jest.fn(),
      addMarkers: jest.fn<(items: unknown[]) => void>((items) => {
        addedToClusterer.push(items);
      }),
    };

    const MapCtor = jest.fn<(c: unknown, o: unknown) => typeof fakeMapInstance>(
      () => fakeMapInstance
    );
    const MarkerClustererCtor = jest.fn<(o: unknown) => typeof fakeClustererInstance>(
      () => fakeClustererInstance
    );
    const CustomOverlayCtor = jest.fn<
      (opts: { content: FakeElement }) => { content: FakeElement; setMap: jest.Mock }
    >((opts) => {
      const overlay = { content: opts.content, setMap: jest.fn() };
      createdOverlays.push(overlay);
      return overlay;
    });

    await render(
      <KakaoMapWeb
        center={SAMPLE_CENTER}
        markers={SAMPLE_MARKERS}
        selectedId={101}
        cluster
        onMarkerPress={onMarkerPress}
        onClusterPress={onClusterPress}
        onRegionChange={onRegionChange}
        onReady={onReady}
        onError={onError}
      />
    );

    expect(headScripts).toHaveLength(1);
    (globalThis as { window: { kakao: unknown } }).window.kakao = {
      maps: {
        load: (cb: () => void) => cb(),
        LatLng: function LatLng(lat: number, lng: number) {
          return { getLat: () => lat, getLng: () => lng };
        },
        Map: MapCtor,
        MapTypeId: { ROADMAP: "ROADMAP" },
        CustomOverlay: CustomOverlayCtor,
        MarkerClusterer: MarkerClustererCtor,
        event: {
          addListener: (
            target: unknown,
            type: string,
            handler: (...a: unknown[]) => void
          ) => {
            listeners.push({ target, type, handler });
          },
        },
      },
    };

    await act(async () => {
      headScripts[0]?.onload?.();
      await Promise.resolve();
    });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(MapCtor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        level: 5,
        mapTypeId: "ROADMAP",
      })
    );
    expect(createdOverlays).toHaveLength(2);
    expect(addedToClusterer[0]).toHaveLength(2);

    // 핀 클릭 → onMarkerPress(101)
    createdOverlays[0]?.content.triggerClick();
    expect(onMarkerPress).toHaveBeenCalledWith(101);

    // 지도 드래그 → onRegionChange
    const dragHandler = listeners.find((l) => l.type === "dragend")?.handler;
    dragHandler?.();
    expect(onRegionChange).toHaveBeenCalledWith({ lat: 37.57, lng: 126.99 });

    // 클러스터 생성·클릭 → 확대 + onClusterPress
    const clusterSetContent = jest.fn();
    const clusteredHandler = listeners.find((l) => l.type === "clustered")?.handler;
    clusteredHandler?.([
      {
        getSize: () => 3,
        getCenter: () => ({ getLat: () => 37.58, getLng: () => 126.98 }),
        getClusterMarker: () => ({ setContent: clusterSetContent }),
      },
    ]);
    const clusterEl = clusterSetContent.mock.calls[0]?.[0] as FakeElement;
    expect(clusterEl).toBeTruthy();
    clusterEl.triggerClick();
    expect(setLevel).toHaveBeenCalledWith(4, expect.any(Object));
    expect(onClusterPress).toHaveBeenCalledWith({ lat: 37.58, lng: 126.98 });
  });
});
