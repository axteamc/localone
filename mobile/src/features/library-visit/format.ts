// 지도 홈 글자 모양 (계약서 library-visit.md VISIT-1 C2)
import type { Today } from "./deps";

/** 1000m 미만은 "420m", 이상은 소수 한 자리 "1.3km" */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/** 휴관이면 "휴관", 운영시간 원문이 있으면 그 값, 모르면 null(줄에서 생략) */
export function todayLine(t: Today): string | null {
  if (t.is_closed === true) return "휴관";
  if (t.hours_text) return t.hours_text;
  return null;
}
