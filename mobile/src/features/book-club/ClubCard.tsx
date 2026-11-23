// 모임 카드(CLUB-1-P3)와 날짜 표시 함수 — contracts/book-club.md CLUB-1 C2·K1-O5
// formatClubWhen은 ClubCard·ClubScreen이 같이 쓴다(K1-O4·K1-O5).

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kst(iso: string): Date | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + KST_OFFSET_MS); // getUTC*로 읽으면 서울 시각
}

function clock(d: Date, withPeriod: boolean): string {
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${withPeriod ? (h < 12 ? "오전 " : "오후 ") : ""}${h12}:${m}`;
}

/** "11.28 토" / "오후 2:00 ~ 4:00". 시작이 없으면 null(= 날짜 미정). 끝이 오전·오후가 다르면 끝에도 붙인다 */
export function formatClubWhen(startsAt: string | null, endsAt: string | null): { day: string; time: string } | null {
  const s = startsAt ? kst(startsAt) : null;
  if (!s) return null;
  const day = `${s.getUTCMonth() + 1}.${s.getUTCDate()} ${DAYS[s.getUTCDay()]}`;
  const e = endsAt ? kst(endsAt) : null;
  if (!e) return { day, time: clock(s, true) };
  const samePeriod = s.getUTCHours() < 12 === e.getUTCHours() < 12;
  return { day, time: `${clock(s, true)} ~ ${clock(e, !samePeriod)}` };
}
