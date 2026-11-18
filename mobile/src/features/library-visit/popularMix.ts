// 홈 "이 동네 인기 도서" 줄의 보이는 순서(2026-11-18 D 지시): 순위 번호를 보이지 않고, 받을 때마다 섞는다.
// 같은 시리즈의 다른 권(예: "화산귀환 9"·"화산귀환 10")이 나란히 붙지 않게 벌린다.
import type { Book } from "./deps";

/** 제목 끝의 권수 표기를 떼어 시리즈 열쇠로 쓴다. 예: "화산귀환 10" → "화산귀환", "토지 3권" → "토지" */
export function seriesKey(title: string): string {
  return title
    .replace(/[\s.,:·-]*(제?\s*\d+\s*(권|부|편)?|[上中下]|\((상|중|하|\d+)\))\s*$/u, "")
    .trim()
    .toLowerCase();
}

/**
 * 섞은 뒤, 바로 앞 책과 시리즈가 다른 책 가운데 남은 권수가 가장 많은 시리즈를 먼저 놓는다(같으면 섞인 순서).
 * 이렇게 해야 한 시리즈가 끝에 몰려 붙는 일이 없다. 어떻게 해도 붙을 수밖에 없으면 그때만 붙인다.
 */
export function mixPopular(books: Book[], random: () => number = Math.random): Book[] {
  const pool = [...books];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as Book, pool[i] as Book];
  }
  const out: Book[] = [];
  while (pool.length) {
    const left = new Map<string, number>();
    for (const b of pool) left.set(seriesKey(b.title), (left.get(seriesKey(b.title)) ?? 0) + 1);
    const prevKey = out.length ? seriesKey((out[out.length - 1] as Book).title) : null;
    let pick = -1;
    pool.forEach((b, i) => {
      const k = seriesKey(b.title);
      if (k === prevKey) return;
      if (pick < 0 || (left.get(k) ?? 0) > (left.get(seriesKey((pool[pick] as Book).title)) ?? 0)) pick = i;
    });
    out.push(...pool.splice(pick < 0 ? 0 : pick, 1));
  }
  return out;
}
