// 지도 홈의 지도·핀·묶음 (계약서 library-visit.md VISIT-1 V3·V4·V5, 결정 3)
// 지도 SDK는 직접 부르지 않고 core `KakaoMap`만 쓴다(VISIT-1-P2 머리말 7칸).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KakaoMap, type LatLng, type LibrarySummary, type MapMarker } from "./deps";
import { formatDistance } from "./format";

/** 처음 보이는 확대 정도(카카오 지도 level, 작을수록 가깝게). 묶음을 누를 때마다 2단계씩 가깝게 */
export const START_LEVEL = 5;
const MIN_LEVEL = 1;

/** V3: 이름 + 거리(핀 아래 가운데). 휴관이 확실할 때만 회색 핀, 모르면(null) 평소 핀. 좌표 없는 도서관은 핀이 없다 */
export function toMarkers(libs: LibrarySummary[]): MapMarker[] {
  const out: MapMarker[] = [];
  for (const l of libs) {
    if (l.latitude == null || l.longitude == null) continue;
    out.push({
      id: l.id,
      lat: l.latitude,
      lng: l.longitude,
      title: l.name,
      subtitle: l.distance_m != null ? formatDistance(l.distance_m) : null,
      tone: l.today.is_closed === true ? "closed" : "normal",
    });
  }
  return out;
}

export type LibraryMapProps = {
  center: LatLng;
  /** 홈이 보는 위치를 다시 정할 때마다 바뀐다(같은 좌표여도) */
  viewSeq?: number;
  libraries: LibrarySummary[];
  selectedId: number | null;
  onLibraryPress(id: number): void;
  onError(reason: "no_key" | "load_failed" | "timeout"): void;
  onRegionChange?(center: LatLng): void;
};

export function LibraryMap(props: LibraryMapProps) {
  const { center, viewSeq, libraries, selectedId, onLibraryPress, onError, onRegionChange } = props;
  const [view, setView] = useState<{ center: LatLng; level: number }>({ center, level: START_LEVEL });

  // 홈이 보는 위치를 바꾸면(시작·현재 위치로·찾기 결과) 처음 확대 정도로 그곳을 보인다
  useEffect(() => {
    setView({ center, level: START_LEVEL });
  }, [center.lat, center.lng, viewSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // 끌어 옮긴 자리를 지도에 넘기는 값에도 적는다. 안 그러면 지도는 예전 center를 기억해,
  // 같은 좌표로 돌아가라고 해도(현재 위치로) 움직이지 않는다
  const onDragged = useCallback(
    (at: LatLng) => {
      setView((v) => ({ ...v, center: at }));
      onRegionChange?.(at);
    },
    [onRegionChange]
  );

  const markers = useMemo(() => toMarkers(libraries), [libraries]);

  // V4: 숫자 동그라미를 누르면 그곳을 가깝게 보여 핀이 나뉜다
  const onClusterPress = useCallback((at: LatLng) => {
    setView((v) => ({ center: at, level: Math.max(MIN_LEVEL, v.level - 2) }));
  }, []);

  return (
    <KakaoMap
      center={view.center}
      level={view.level}
      markers={markers}
      selectedId={selectedId}
      cluster
      onMarkerPress={onLibraryPress}
      onClusterPress={onClusterPress}
      onRegionChange={onDragged}
      onError={onError}
    />
  );
}
