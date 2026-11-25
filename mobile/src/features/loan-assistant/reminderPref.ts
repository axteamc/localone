// 반납 알림 켜기·끄기(2026-11-25 C-90, 설정 화면 "알림"). 기기 데이터 — 기기에 예약하는 알림이라 기기마다 정한다.
// 기본은 켜짐. 끄면 이 앱이 건 대출 알림을 바로 모두 지우고, 다시 켜면 다음 맞추기(대출·반납 화면)부터 다시 건다.
import { deviceStorage } from "../../lib/platform";

export const LOAN_REMINDERS_KEY = "localone:loan_reminders:v1";

export async function getLoanRemindersEnabled(): Promise<boolean> {
  try {
    return (await deviceStorage.getItem(LOAN_REMINDERS_KEY)) !== "off";
  } catch {
    return true;
  }
}

export async function setLoanRemindersEnabled(on: boolean): Promise<void> {
  try {
    await deviceStorage.setItem(LOAN_REMINDERS_KEY, on ? "on" : "off");
  } catch {
    /* 기기 저장 실패는 조용히 넘긴다 */
  }
}
