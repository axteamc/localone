// 지도 홈이 쓰는 core 모듈 한곳 모음 (contracts/core.md APP-0 C2, LIB-0 C3).
// 화면·훅은 core를 직접 부르지 않고 여기서만 가져온다. 시험은 이 파일 하나를 `__fakes__/publicApi`로 바꿔 끼운다.
export { createLatestRunner } from "../../lib/latest";
export { KakaoMap, type KakaoMapProps, type LatLng, type MapMarker } from "../../lib/map/KakaoMap";
export { locate, requestLocationPermission } from "../../lib/platform";
export { DEFAULT_START, NEARBY_DEFAULT_RADIUS_KM } from "../../lib/policy";
export {
  fetchRecommendations,
  fetchLibrariesInRegion,
  fetchLibrariesNearby,
  fetchLibrary,
  searchLibrariesByName,
  type Book,
  type LibraryListResponse,
  type LibrarySummary,
  type RecommendationResponse,
  type Today,
} from "../../lib/publicApi";
export { searchRegions, type Region } from "../../lib/regions";
export { getDefaultLibrary, getFrequentLibraries, type VisitRecord } from "../../lib/visits";
