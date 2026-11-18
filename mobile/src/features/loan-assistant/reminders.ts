// 반납 알림 계획과 맞추기(loan-assistant.md LOAN-3 T1~T7·T10, C6 T-#1~#5).
// 알림은 앱이 기기에 직접 예약한다(서버 없음). 날짜는 서버가 준 today·due_on(서울 날짜)으로 셈한다(T5).
// 플랫폼 일은 notifications.platform.ts가 맡는다(여기서는 플랫폼 분기·알림 모듈을 직접 쓰지 않는다, C4).
import { addDays } from "./DueDateSheet";
import { listLoans, type Loan, type LoanPage } from "./api";
import {
  NOTIFICATIONS_SUPPORTED,
  cancelAllLoan,
  requestNotificationPermission,
  scheduleLocal,
} from "./notifications.platform";

/** 서버 페이지가 끝나지 않을 때(커서 반복 등) 무한히 읽지 않도록 막는 상한(기본 50권 × 200 = 1만 권). */
const MAX_PAGES = 200;

/**
 * 알림 맞추기용 빌린 책 전체(T4): #19 on_loan을 next_cursor가 null일 때까지 모은다.
 * first가 있으면(화면이 방금 받은 첫 페이지) 그 다음부터 읽는다. today는 첫 페이지의 서버 서울 날짜(T5).
 * 중간 페이지가 하나라도 실패하면 throw — 부르는 쪽은 일부 목록을 전체처럼 적용하면 안 된다.
 */
export async function fetchAllOnLoan(signal?: AbortSignal, first?: LoanPage): Promise<{ items: Loan[]; today: string }> {
  let page = first ?? (await listLoans("on_loan", { cursor: null }, signal));
  const today = page.today;
  const items = [...page.items];
  const seenCursors = new Set<string>();
  for (let n = 1; page.next_cursor !== null; n += 1) {
    const cursor = page.next_cursor;
    if (n >= MAX_PAGES || seenCursors.has(cursor)) throw new Error("on_loan pagination did not finish");
    seenCursors.add(cursor);
    page = await listLoans("on_loan", { cursor }, signal);
    items.push(...page.items);
  }
  const unique = new Map(items.map((l) => [l.id, l] as const)); // 페이지 사이에 순서가 바뀌어 겹친 책은 한 번만
  return { items: [...unique.values()], today };
}

export const REMINDER_TITLE = "동네한권"; // 잠금 화면에 책 제목을 넣지 않는다(T3)

const STAGES: { key: "d3" | "d1" | "d0"; before: number; body: string }[] = [
  { key: "d3", before: 3, body: "반납일이 3일 남았어요" },
  { key: "d1", before: 1, body: "반납일이 내일이에요" },
  { key: "d0", before: 0, body: "오늘이 반납일이에요" },
];

/** 서울 09:00(T2) — 시간대가 붙은 ISO 글자. */
const at0900Kst = (ymd: string) => `${ymd}T09:00:00+09:00`;

/**
 * 한 대출의 알림 계획(순수 함수). 반납했으면 없다(T-#3).
 * 지난 날짜(today보다 앞)는 빼고, today 당일 09:00이 이미 지났으면(now 기준) 그 차수도 뺀다(T-#2).
 */
export function reminderPlan(loan: Loan, today: string, now: Date = new Date()): { id: string; date: string; body: string }[] {
  if (loan.status !== "on_loan") return [];
  return STAGES.flatMap(({ key, before, body }) => {
    const day = addDays(loan.due_on, -before);
    if (day < today) return [];
    const date = at0900Kst(day);
    if (day === today && new Date(date).getTime() <= now.getTime()) return [];
    return [{ id: `loan:${loan.id}:${key}`, date, body }];
  });
}

type SyncResult = { scheduled: number; skipped: number; status: "scheduled" | "denied" | "web" };

// 맞추기가 겹치면(포커스·목록 읽기·앱 복귀가 동시에) 지우고-걸기가 섞여 알림이 두 번 걸릴 수 있어 차례로 돈다(T-#4)
let queue: Promise<unknown> = Promise.resolve();

/**
 * 이 앱이 건 대출 알림을 모두 지우고 지금 목록대로 다시 건다(T4).
 * 빌린 책이 1권 이상일 때만 권한을 묻는다(T10). 거부면 예약하지 않는다(T-#1). 웹은 아무것도 하지 않는다(T9).
 */
export function syncLoanReminders(loans: Loan[], today: string, now?: Date): Promise<SyncResult> {
  const run = async (): Promise<SyncResult> => {
    if (!NOTIFICATIONS_SUPPORTED) return { scheduled: 0, skipped: 0, status: "web" };
    const onLoan = loans.filter((l) => l.status === "on_loan");
    if (onLoan.length === 0) {
      await cancelAllLoan(); // 다 반납했으면 남은 알림도 없어야 한다
      return { scheduled: 0, skipped: 0, status: "scheduled" };
    }
    const permission = await requestNotificationPermission();
    if (permission !== "granted") return { scheduled: 0, skipped: 0, status: "denied" };
    await cancelAllLoan();
    let scheduled = 0;
    let skipped = 0;
    for (const loan of onLoan) {
      const plan = reminderPlan(loan, today, now);
      skipped += STAGES.length - plan.length;
      for (const r of plan) {
        await scheduleLocal(r.id, new Date(r.date), REMINDER_TITLE, r.body);
        scheduled += 1;
      }
    }
    return { scheduled, skipped, status: "scheduled" };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** 로그아웃 때 모두 지운다(T6, T-#5). */
export function clearLoanReminders(): Promise<void> {
  const next = queue.then(cancelAllLoan, cancelAllLoan);
  queue = next.catch(() => undefined);
  return next;
}

// TODO(연결): D(AUTH-2) — registerSignOutCleanup(clearLoanReminders). origin/main에 아직 없다(계약 C7).
