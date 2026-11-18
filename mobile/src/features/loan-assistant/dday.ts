// 남은 날짜(D-day) 계기판 숫자·상태 점과 색(loan-assistant.md LOAN-1 M9, 2026-11-18 C-74 개정).
// 기기 날짜로 계산하지 않고 서버가 준 d_day·is_overdue만 쓴다(M4). 색은 tokens.ts 기존 토큰 임시 매핑.
import type { ThemeColors } from "../../theme";

export type DdayTone = "overdue" | "urgent" | "soon" | "normal";

const pad2 = (n: number) => (n >= 100 ? String(n) : String(n).padStart(2, "0"));

export function ddayFormat(dDay: number, isOverdue: boolean): { label: string; tone: DdayTone } {
  if (isOverdue || dDay < 0) return { label: `연체 ${Math.abs(dDay)}일`, tone: "overdue" };
  if (dDay === 0) return { label: "오늘 반납", tone: "urgent" };
  if (dDay <= 3) return { label: "임박", tone: "soon" };
  return { label: "여유", tone: "normal" };
}

/** 카드 오른쪽 계기판 숫자(M9: `+02D` · `D-DAY` · `D-02` · `D-08`). */
export function ddayGauge(dDay: number, isOverdue: boolean): string {
  if (isOverdue || dDay < 0) return `+${pad2(Math.abs(dDay))}D`;
  if (dDay === 0) return "D-DAY";
  return `D-${pad2(dDay)}`;
}

/** `bg`: 6px 상태 점 색, `fg`: 계기판 숫자 색(채움 알약 없음, M9). */
export function ddayColors(tone: DdayTone, colors: ThemeColors): { bg: string; fg: string } {
  switch (tone) {
    case "overdue":
      return { bg: colors.loanOut, fg: colors.loanOut };
    case "urgent":
      return { bg: colors.inkStrong, fg: colors.inkStrong };
    case "soon":
      return { bg: colors.fill1, fg: colors.inkStrong };
    case "normal":
      return { bg: colors.surface3, fg: colors.inkSoft };
  }
}
