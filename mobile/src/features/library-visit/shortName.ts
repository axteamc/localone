// 큐브 윗면 도서관 이름 줄이는 규칙 (VISIT-1 V3, L6 2026-11-19 D 결정 "핵심 이름만"). 순수 함수만 둔다.
// 화면에 보이는 글자만 줄인다. 접근성 이름·방문 페이지·목록은 원래 이름(name)을 그대로 쓴다.
import type { LibrarySummary } from "./deps";

/** 앞말(행정 단위·교육청·구립 등). 공백을 지운 이름 앞에서 반복해서 뗀다. 국립은 떼지 않는다(국립중앙 → 중앙이 되면 못 알아봄) */
const PREFIXES: RegExp[] = [
  /^[가-힣]{1,4}(?:구립|시립|군립|도립)/, // 강남구립·성남시립·부산광역시립(광역시보다 먼저)
  /^[가-힣]{2,4}(?:특별시|광역시|특별자치시|특별자치도)교육청/, // 서울특별시교육청
  /^[가-힣]{2,4}(?:도)교육청/, // 경기도교육청
  /^[가-힣]{2,4}(?:특별시|광역시|특별자치시|특별자치도)/, // 서울특별시
  /^(?:경기|강원|충청북|충청남|전라북|전라남|경상북|경상남|충북|충남|전북|전남|경북|경남)도/, // 경기도
  /^(?:구립|시립|군립|도립|공립|교육청)/,
];
/** 끝말. 하나만 뗀다 */
const SUFFIX = /(?:공공도서관|도서관)$/;
/** 이것만 남으면 무슨 도서관인지 모른다 → 지역 이름을 붙인다 */
const GENERIC = new Set(["중앙", "어린이", "청소년", "작은", "공공", "시민", "구민", "평생학습", "정보", "기적의", "본관", "분관"]);

const hasHangul = (s: string) => /[가-힣]/.test(s);
/** 보이는 글자 수(한글 한 글자 = 1) */
const len = (s: string) => [...s].length;

/** 앞말에서 지역 낱말을 꺼낸다: "강남구립" → "강남", "서울특별시교육청" → "서울" */
function regionOfPrefix(p: string): string | null {
  const m = p.match(/^([가-힣]{1,4}?)(?:특별시|광역시|특별자치시|특별자치도|도|구립|시립|군립|도립)/);
  return m ? m[1]! : null;
}

/** 주소의 구·군(없으면 시) → "종로구" → "종로", "중구"는 두 글자라 그대로. 없으면 area_label(동) */
export function regionOf(lib: Pick<LibrarySummary, "address" | "area_label">): string | null {
  const tokens = (lib.address ?? "").replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  const gu = tokens.find((t, i) => i > 0 && /^[가-힣]+(?:구|군)$/.test(t)) ?? tokens.find((t, i) => i > 0 && /^[가-힣]+시$/.test(t));
  if (gu) return len(gu) > 2 ? gu.slice(0, -1) : gu;
  return lib.area_label?.trim() || null;
}

/**
 * 한 도서관의 핵심 이름. 예: "서울특별시교육청정독도서관" → "정독", "강남구립 개포도서관" → "개포".
 * 영문명(한글 없음)·줄이면 2글자 미만·괄호가 있는 이름은 원래 이름을 그대로 둔다.
 * 핵심이 흔한 말(어린이·중앙 등)이면 지역을 붙인다: "서울특별시교육청어린이도서관" → "서울 어린이".
 */
export function coreLibraryName(name: string, lib?: Pick<LibrarySummary, "address" | "area_label">): string {
  const original = name.trim();
  if (!hasHangul(original) || /[()[\]]/.test(original)) return original;
  let s = original.replace(/\s+/g, "");
  let region: string | null = null;
  for (let changed = true; changed; ) {
    changed = false;
    for (const re of PREFIXES) {
      const m = s.match(re);
      if (m && len(s) - len(m[0]) >= 2) {
        region = region ?? regionOfPrefix(m[0]);
        s = s.slice(m[0].length);
        changed = true;
      }
    }
  }
  const cut = s.replace(SUFFIX, "");
  if (len(cut) < 2) return original; // "구립도서관"처럼 끝말만 남으면 줄이지 않는다
  s = cut;
  if (GENERIC.has(s)) {
    const r = region ?? (lib ? regionOf(lib) : null);
    return r ? `${r} ${s}` : original;
  }
  return s;
}

/**
 * 판에 함께 보이는 도서관들의 큐브 이름. 줄인 이름이 겹치면 겹친 것끼리 지역을 앞에 붙이고,
 * 그래도 겹치면(지역도 같음·없음) 원래 이름을 쓴다.
 */
export function cubeNames(libs: Pick<LibrarySummary, "id" | "name" | "address" | "area_label">[]): Map<number, string> {
  const first = new Map(libs.map((l) => [l.id, coreLibraryName(l.name, l)]));
  const count = (m: Map<number, string>) => {
    const c = new Map<string, number>();
    for (const v of m.values()) c.set(v, (c.get(v) ?? 0) + 1);
    return c;
  };
  const c1 = count(first);
  const second = new Map(first);
  for (const l of libs) {
    const v = first.get(l.id)!;
    if (c1.get(v)! < 2) continue;
    const r = regionOf(l);
    second.set(l.id, r && !v.startsWith(`${r} `) ? `${r} ${v}` : l.name.trim());
  }
  const c2 = count(second);
  const out = new Map<number, string>();
  for (const l of libs) {
    const v = second.get(l.id)!;
    out.set(l.id, c2.get(v)! > 1 ? l.name.trim() : v);
  }
  return out;
}
