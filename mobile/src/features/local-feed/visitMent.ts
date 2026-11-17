// 방문 멘트 카드 규칙 한 곳(contracts/local-feed.md VISIT-2 G3, P4 골격)
import type { VisitResult } from "../../lib/visits";

export type VisitMent = { kind: "ment"; text: string } | { kind: "ask" } | null;

/** "YYYY-MM-DD" 두 날짜 사이 일수(서울 날짜 문자열끼리, 시간대 무관) */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function pickVisitMent(r: VisitResult, name: string, isDefault: boolean, today: string): VisitMent {
  if (!r.counted) return null; // 같은 날 재방문 또는 저장 실패 (G-#3·#6)
  if (r.isFirst) return { kind: "ment", text: `처음으로 ${name}에 방문했어요!` };
  if (r.record.count === 3 && !r.record.defaultAsked && !isDefault) return { kind: "ask" }; // 누적 우선 (C-58)
  const s = r.record.streakDays;
  const streakText =
    s === 3 ? "3일 연속으로 방문했어요!"
    : s === 7 ? "일주일 동안 매일 방문했어요!"
    : s === 14 ? "2주 동안 매일 방문했어요!"
    : s === 30 ? "한 달 동안 매일 방문했어요!"
    : s >= 100 && s % 100 === 0 ? `${s}일 연속으로 방문했어요!`
    : null;
  if (streakText) return { kind: "ment", text: streakText };
  const gap = r.previousVisitedOn ? daysBetween(r.previousVisitedOn, today) : 0;
  if (gap >= 30) return { kind: "ment", text: `오랜만이에요! ${gap}일 만에 방문했어요` };
  return null;
}
