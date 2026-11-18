// 남은 날짜(D-day) 알약의 글자와 색(loan-assistant.md LOAN-1 M9).
// 기기 날짜로 계산하지 않고 서버가 준 d_day·is_overdue만 쓴다(M4). 색은 tokens.ts 기존 토큰 임시 매핑.
import type { ThemeColors } from "../../theme";

export type DdayTone = "overdue" | "urgent" | "soon" | "normal";

export function ddayFormat(dDay: number, isOverdue: boolean): { label: string; tone: DdayTone } {
  if (isOverdue || dDay < 0) return { label: `연체 ${Math.abs(dDay)}일`, tone: "overdue" };
  if (dDay === 0) return { label: "오늘 반납", tone: "urgent" };
  if (dDay <= 3) return { label: `D-${dDay}`, tone: "soon" };
  return { label: `D-${dDay}`, tone: "normal" };
}

export function ddayColors(tone: DdayTone, colors: ThemeColors): { bg: string; fg: string } {
  switch (tone) {
    case "overdue":
      return { bg: colors.loanOut, fg: colors.paper };
    case "urgent":
      return { bg: colors.inkStrong, fg: colors.paper };
    case "soon":
      return { bg: colors.fill1, fg: colors.text };
    case "normal":
      return { bg: colors.surface2, fg: colors.text };
  }
}
