// 소장·대출 가능 글자 만들기(book-search.md LIB-2 A3·A11·A14). 순수 함수만 둔다.
import type { AvailabilityItem } from "../../lib/publicApi";

export type Tri = "yes" | "no" | "unknown";

/** "YYYY-MM-DD"를 하루 앞으로. 날짜만 다루므로 UTC로 계산해 시간대 영향을 받지 않는다. */
function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 기준일 글자. `today`는 응답 `checked_at.slice(0, 10)`(서버 서울 오늘)이다(A11).
 * 서울 어제면 "어제", 그 밖은 "M월 D일", 추정이면 뒤에 "(추정)". 날짜가 없으면 null.
 */
export function dataDateLabel(dataDate: string | null, today: string, assumed: boolean): string | null {
  if (!dataDate || !/^\d{4}-\d{2}-\d{2}/.test(dataDate)) return null;
  const day = dataDate.slice(0, 10);
  const base =
    day === previousDay(today) ? "어제" : `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
  return assumed ? `${base}(추정)` : base;
}

export function holdingText(t: Tri): "있음" | "없음" | "알 수 없음" {
  return t === "yes" ? "있음" : t === "no" ? "없음" : "알 수 없음";
}

export function loanableText(t: Tri): "가능" | "불가" | "알 수 없음" {
  return t === "yes" ? "가능" : t === "no" ? "불가" : "알 수 없음";
}

/** 1000m 미만은 "Nm", 이상은 소수 한 자리 "N.Nkm". 모르면 null(숨김). */
export function distanceLabel(distanceM: number | null): string | null {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM < 0) return null;
  return distanceM < 1000 ? `${Math.round(distanceM)}m` : `${(distanceM / 1000).toFixed(1)}km`;
}

/**
 * 소장·대출을 확인하지 못한 도서관인가(A14 "미확인").
 * 소장을 모르거나, 소장은 있는데 대출 가능 여부를 모르면 미확인이다.
 */
export function isUnchecked(item: AvailabilityItem): boolean {
  return item.holding === "unknown" || (item.holding === "yes" && item.loanable === "unknown");
}

export function availabilitySummary(items: AvailabilityItem[]): {
  total: number;
  checked: number;
  unknown: number;
} {
  const unknown = items.filter(isUnchecked).length;
  return { total: items.length, checked: items.length - unknown, unknown };
}

/** 목록 아래 작은 글(A11): "HH:mm에 확인 · 출처 도서관 정보나루". `checked_at`은 서울 시각 ISO 문자열. */
export function checkedAtLabel(checkedAt: string): string | null {
  const hhmm = checkedAt.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hhmm) ? `${hhmm}에 확인 · 출처 도서관 정보나루` : null;
}
