import { deviceStorage } from "./platform";
import { STORAGE_KEYS } from "./policy";

export type VisitRecord = {
  libraryId: number; count: number; firstVisitedOn: string; lastVisitedOn: string;
  streakDays: number; defaultAsked: boolean;
};
export type VisitResult = {
  counted: boolean; record: VisitRecord; isFirst: boolean; previousVisitedOn: string | null;
};
type Visits = Record<string, VisitRecord>;
const positiveInt = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function dateString(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}
// UTC arithmetic on a fixed +09:00 offset is independent of the device timezone/DST.
function seoulDate(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
async function readJson(key: string): Promise<unknown> {
  try { const raw = await deviceStorage.getItem(key); return raw === null ? null : JSON.parse(raw); }
  catch { return null; } // Unavailable/corrupt storage is empty on read; never repair here.
}
async function write(key: string, value: unknown): Promise<boolean> {
  try {
    if (value === null) await deviceStorage.removeItem(key);
    else await deviceStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* C3 / G-#6: persistence failure must not block the screen, but write callers can detect failure. */
    return false;
  }
}
function validRecord(v: unknown, key: string): v is VisitRecord {
  return object(v) && positiveInt(v.libraryId) && String(v.libraryId) === key
    && positiveInt(v.count) && positiveInt(v.streakDays) && v.streakDays <= v.count
    && dateString(v.firstVisitedOn) && dateString(v.lastVisitedOn)
    && v.firstVisitedOn <= v.lastVisitedOn && typeof v.defaultAsked === "boolean";
}
async function readVisits(): Promise<Visits> {
  const all = await readJson(STORAGE_KEYS.visits);
  return object(all) && Object.entries(all).every(([key, value]) => validRecord(value, key)) ? all as Visits : {};
}
// Serialize read-modify-write operations, including different libraries and prompts.
let writes: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = writes.then(task);
  writes = result.catch(() => undefined);
  return result;
}
export function recordVisit(libraryId: number, now = new Date()): Promise<VisitResult> {
  return serial(async () => {
    const today = seoulDate(now);
    const yesterday = seoulDate(new Date(now.getTime() - 86_400_000));
    const all = await readVisits();
    const prev = all[String(libraryId)] ?? null;
    if (prev && prev.lastVisitedOn === today) {
      return { counted: false, record: prev, isFirst: false, previousVisitedOn: prev.lastVisitedOn };
    }
    const record: VisitRecord = {
      libraryId, count: (prev?.count ?? 0) + 1, firstVisitedOn: prev?.firstVisitedOn ?? today,
      lastVisitedOn: today, streakDays: prev?.lastVisitedOn === yesterday ? prev.streakDays + 1 : 1,
      defaultAsked: prev?.defaultAsked ?? false,
    };
    const saved = await write(STORAGE_KEYS.visits, { ...all, [String(libraryId)]: record });
    if (!saved) {
      return {
        counted: false,
        record: prev ?? record,
        isFirst: false,
        previousVisitedOn: prev?.lastVisitedOn ?? null,
      };
    }
    return { counted: true, record, isFirst: prev === null, previousVisitedOn: prev?.lastVisitedOn ?? null };
  });
}
export async function getVisitRecord(libraryId: number): Promise<VisitRecord | null> {
  await writes;
  return (await readVisits())[String(libraryId)] ?? null;
}
export async function getFrequentLibraries(limit = 3): Promise<VisitRecord[]> {
  await writes;
  return Object.values(await readVisits()).sort((a, b) => b.count - a.count
    || b.lastVisitedOn.localeCompare(a.lastVisitedOn) || a.libraryId - b.libraryId).slice(0, Math.max(0, limit));
}
export function markDefaultAsked(libraryId: number): Promise<void> {
  return serial(async () => {
    const all = await readVisits();
    const prev = all[String(libraryId)];
    if (prev) await write(STORAGE_KEYS.visits, { ...all, [String(libraryId)]: { ...prev, defaultAsked: true } });
  });
}
export async function getDefaultLibrary(): Promise<number | null> {
  await writes;
  const value = await readJson(STORAGE_KEYS.defaultLibrary);
  return object(value) && positiveInt(value.libraryId) && dateString(value.setOn) ? value.libraryId : null;
}
export function setDefaultLibrary(libraryId: number | null): Promise<void> {
  return serial(async () => {
    await write(
      STORAGE_KEYS.defaultLibrary,
      libraryId === null ? null : { libraryId, setOn: seoulDate(new Date()) },
    );
  });
}
// core K18·C3 (C-68): 위치를 못 쓸 때의 시작점. 지역 코드만 두고 좌표는 두지 않는다.
const regionCode = (v: unknown): v is string => typeof v === "string" && /^[0-9]{5}$/.test(v);
export async function getLastRegion(): Promise<string | null> {
  await writes;
  const value = await readJson(STORAGE_KEYS.lastRegion);
  return object(value) && regionCode(value.code) && dateString(value.setOn) ? value.code : null;
}
export function setLastRegion(code: string): Promise<void> {
  if (!regionCode(code)) return Promise.resolve();
  return serial(async () => {
    await write(STORAGE_KEYS.lastRegion, { code, setOn: seoulDate(new Date()) });
  });
}
// AUTH-2 G8: visits/default/last region are device data (core C3) and stay on sign-out — no registerSignOutCleanup.
