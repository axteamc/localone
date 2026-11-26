// 검색(책 소장 "주변 찾기") 반경 설정 — C-96(2026-11-26). 기기에 저장하고 로그아웃해도 남긴다(처음 크게 보일 도서관 설정과 같음).
// 홈 큐브는 이 값과 상관없이 늘 HOME_RADIUS_KM(2)이다.
import { deviceStorage } from "./platform";
import { NEARBY_DEFAULT_RADIUS_KM, NEARBY_RADII_KM, STORAGE_KEYS, type RadiusKm } from "./policy";

const isRadius = (v: number): v is RadiusKm => (NEARBY_RADII_KM as readonly number[]).includes(v);

/** 저장이 없거나 읽지 못하면 기본(3km) */
export async function getSearchRadius(): Promise<RadiusKm> {
  try {
    const v = Number(await deviceStorage.getItem(STORAGE_KEYS.searchRadius));
    return isRadius(v) ? v : (NEARBY_DEFAULT_RADIUS_KM as RadiusKm);
  } catch {
    return NEARBY_DEFAULT_RADIUS_KM as RadiusKm;
  }
}

/** 저장 실패는 화면을 막지 않는다 */
export async function setSearchRadius(km: RadiusKm): Promise<void> {
  try {
    await deviceStorage.setItem(STORAGE_KEYS.searchRadius, String(km));
  } catch {
    /* 기기 저장 실패는 조용히 넘긴다 */
  }
}
