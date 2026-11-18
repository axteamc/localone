// 홈 큐브 "처음 크게 보일 도서관" 설정 (VISIT-1 V3, 2026-11-18 D 결정). 기기 데이터 — 로그아웃해도 남긴다(visits와 같음).
// 화면은 deps.ts로만 부른다(시험은 __fakes__/publicApi가 대신한다).
import { deviceStorage } from "../../lib/platform";
import { getFrequentLibraries } from "../../lib/visits";
import type { HeroRule } from "./direction";

export const HERO_RULE_KEY = "localone:home_hero_rule:v1";

/** 저장이 없거나 읽지 못하면 기본(가장 가까운 곳) */
export async function getHeroRule(): Promise<HeroRule> {
  try {
    return (await deviceStorage.getItem(HERO_RULE_KEY)) === "recent" ? "recent" : "nearest";
  } catch {
    return "nearest";
  }
}

/** 저장 실패는 화면을 막지 않는다(지금 화면에는 바로 반영) */
export async function setHeroRule(rule: HeroRule): Promise<void> {
  try {
    await deviceStorage.setItem(HERO_RULE_KEY, rule);
  } catch {
    /* 기기 저장 실패는 조용히 넘긴다 */
  }
}

/** 마지막으로 방문(lastVisitedOn)한 도서관 id. 같은 날이면 많이 간 곳. 기록이 없으면 null */
export async function getRecentVisitedLibraryId(): Promise<number | null> {
  const all = await getFrequentLibraries(1000);
  let best: (typeof all)[number] | null = null;
  for (const v of all) if (!best || v.lastVisitedOn > best.lastVisitedOn) best = v;
  return best?.libraryId ?? null;
}
