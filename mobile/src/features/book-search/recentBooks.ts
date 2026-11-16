// 최근 본 도서 — 기기에만 저장(book-search.md LIB-1 B4, core.md APP-0 C3)
import { deviceStorage } from "../../lib/platform";
import { RECENT_BOOK_LIMIT, STORAGE_KEYS } from "../../lib/policy";
import type { Book } from "../../lib/publicApi";

export type RecentBook = {
  isbn13: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  viewed_at: string;
};

const keyFor = (userId: string | null) => STORAGE_KEYS.recentBooks(userId); // "recent_books:<id>" | "recent_books:guest"

function isRecentBook(v: unknown): v is RecentBook {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.isbn13 === "string" &&
    typeof o.title === "string" &&
    (o.author === null || typeof o.author === "string") &&
    (o.cover_url === null || typeof o.cover_url === "string") &&
    typeof o.viewed_at === "string"
  );
}

/** 깨진 값·읽기 실패는 빈 목록으로 본다. 읽기만 하고 덮어쓰지 않는다(core P-#7). */
export async function listRecentBooks(userId: string | null): Promise<RecentBook[]> {
  let raw: string | null;
  try {
    raw = await deviceStorage.getItem(keyFor(userId));
  } catch {
    return []; // 기기 저장소를 못 읽음 → 빈 목록(S-6: 칸 숨김, 화면 계속)
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // JSON이 아님 → 빈 목록(P-#7)
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecentBook).slice(0, RECENT_BOOK_LIMIT);
}

export async function pushRecentBook(userId: string | null, book: Book, now = new Date()) {
  const list = (await listRecentBooks(userId)).filter((b) => b.isbn13 !== book.isbn13); // 다시 본 책은 맨 앞
  const next = [
    {
      isbn13: book.isbn13,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      viewed_at: now.toISOString(),
    },
    ...list,
  ].slice(0, RECENT_BOOK_LIMIT);
  await deviceStorage.setItem(keyFor(userId), JSON.stringify(next));
}

export async function removeRecentBook(userId: string | null, isbn13: string): Promise<void> {
  const list = await listRecentBooks(userId);
  await deviceStorage.setItem(
    keyFor(userId),
    JSON.stringify(list.filter((b) => b.isbn13 !== isbn13))
  );
}

export async function clearRecentBooks(userId: string | null): Promise<void> {
  await deviceStorage.removeItem(keyFor(userId));
}
