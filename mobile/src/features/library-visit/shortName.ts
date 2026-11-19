// 큐브 윗면 도서관 이름 규칙 v2 — 엔진 (VISIT-1 V3, 2026-11-19 D 위임 결정 "큰 글자 + 작은 글자"). 순수 함수만 둔다.
// 낱말 목록·우선순위는 cubeNameRule.ts에 있다. 규칙을 바꿀 때는 그 파일부터 고친다.
// 화면에 보이는 글자만 줄인다. 접근성 이름·방문 페이지·목록은 원래 이름(name)을 그대로 쓴다.
//
// 흐름: 이름 → 칸으로 쪼갬(parse: core·kind·usage·region·branch·paren·national·founder)
//      → 큰 글자 하나(BIG_ORDER) + 작은 글자 하나(SMALL_ORDER) → 판 안에서 겹치면 지역을 더함 → 그래도 겹치면 원래 이름.
import * as RULE from "./cubeNameRule";
import type { BigSlot, Slot } from "./cubeNameRule";
// 지역 표는 순수 데이터라 직접 가져온다(deps.ts는 기기 모듈까지 묶여 있고, 시험 대역의 지역 표는 2줄뿐이라 규칙 시험이 안 된다)
import { REGIONS } from "../../lib/regions";
import type { LibrarySummary } from "./deps";

/** 큐브 윗면 이름: 큰 글자(이름) + 작은 글자(부가정보, 없으면 null) */
export type CubeName = { big: string; small: string | null };
/** 지역을 알 때 쓰는 도서관 정보. dtl_region_code가 있으면 먼저 쓴다(홈 #10), 없으면 주소(MY-3) */
export type CubeNameLib = Pick<LibrarySummary, "address" | "area_label"> & { dtl_region_code?: string | null };

const hasHangul = (s: string) => /[가-힣]/.test(s);
/** 보이는 글자 수(한글 한 글자 = 1, 공백 포함) */
const len = (s: string) => [...s].length;
/** 시군구 줄임말: 종로구 → 종로, 수원시 → 수원, 중구 → 중구(두 글자는 그대로) */
const shortSigungu = (part: string) => (len(part) > 2 ? part.slice(0, -1) : part);
const lastPart = (sigungu: string) => sigungu.split(" ").pop() ?? sigungu;
const byLengthDesc = (a: string, b: string) => len(b) - len(a);
const sidoShort = (code: string) => RULE.SIDO.find((s) => s.code === code)?.short ?? null;

// ── 지역 낱말 표 ─────────────────────────────────────────────

type Token = { text: string; level: "sido" | "sigungu"; codes: readonly string[]; short: string | null };
let tokenCache: { src: readonly unknown[]; list: Token[] } | null = null;
/** 이름 앞에서 맞출 지역 낱말(시도 이름·별칭·시군구 이름), 긴 것부터 */
function regionTokens(): Token[] {
  if (tokenCache?.src === REGIONS) return tokenCache.list;
  const list: Token[] = [];
  for (const s of RULE.SIDO) for (const n of s.names) list.push({ text: n, level: "sido", codes: [s.code], short: s.short });
  for (const a of RULE.SIDO_ALIASES) list.push({ text: a.name, level: "sido", codes: a.codes, short: null });
  for (const r of REGIONS) {
    for (const part of r.sigungu.split(" ")) list.push({ text: part, level: "sigungu", codes: [r.code.slice(0, 2)], short: shortSigungu(part) });
  }
  list.sort((a, b) => byLengthDesc(a.text, b.text));
  tokenCache = { src: REGIONS, list };
  return list;
}

type Area = { sido: string | null; sigungu: string | null };
/** 도서관의 시도 코드와 시군구 줄임말. 코드(dtl_region_code) → 주소 순서로 본다 */
function areaOf(lib?: CubeNameLib): Area {
  if (!lib) return { sido: null, sigungu: null };
  const code = lib.dtl_region_code?.trim();
  if (code && /^\d{5}$/.test(code)) {
    const r = REGIONS.find((x) => x.code === code);
    return { sido: code.slice(0, 2), sigungu: r ? shortSigungu(lastPart(r.sigungu)) : null };
  }
  const words = (lib.address ?? "").replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return { sido: null, sigungu: null };
  const codes = [
    ...RULE.SIDO.filter((s) => s.names.includes(first)).map((s) => s.code),
    ...RULE.SIDO_ALIASES.filter((a) => a.name === first).flatMap((a) => a.codes),
  ];
  const rest = `${words.slice(1).join(" ")} `;
  // 여러 낱말 시군구(수원시 영통구)는 가장 길게 맞는 것으로 정한다
  const hit = REGIONS.filter((r) => codes.includes(r.code.slice(0, 2)) && rest.startsWith(`${r.sigungu} `)).sort((a, b) =>
    byLengthDesc(a.sigungu, b.sigungu),
  )[0];
  if (hit) return { sido: hit.code.slice(0, 2), sigungu: shortSigungu(lastPart(hit.sigungu)) };
  return { sido: codes.length === 1 ? codes[0]! : null, sigungu: null }; // 별칭인데 시군구로 못 가르면 모름(넘겨짚지 않음)
}

/** 주소의 구·군(없으면 시) → "종로구" → "종로", "중구"는 두 글자라 그대로. 없으면 area_label(동). v1부터 있던 공개 함수(계약 C2) */
export function regionOf(lib: Pick<LibrarySummary, "address" | "area_label">): string | null {
  const tokens = (lib.address ?? "").replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  const gu = tokens.find((t, i) => i > 0 && /^[가-힣]+(?:구|군)$/.test(t)) ?? tokens.find((t, i) => i > 0 && /^[가-힣]+시$/.test(t));
  if (gu) return len(gu) > 2 ? gu.slice(0, -1) : gu;
  return lib.area_label?.trim() || null;
}

// ── 쪼개기 ───────────────────────────────────────────────────

type Place = { short: string; code: string | null };
type Parsed = {
  core: string;
  /** core가 지역 이름 그 자체(김제·노원·세종) */
  place: Place | null;
  kind: string | null;
  usage: string | null;
  /** 앞말에서 뗀 가장 좁은 지역 */
  region: Place | null;
  branch: boolean;
  paren: string | null;
  national: boolean;
  founder: string | null;
};

/** 분관 이름 앞에서 본관 이름이 끝나는 곳 뒤의 말. 없으면 null */
function afterMainName(s: string): string | null {
  let at = -1;
  for (const end of RULE.MAIN_NAME_ENDS) {
    const i = s.lastIndexOf(end);
    if (i >= 0 && i + end.length > at) at = i + end.length;
  }
  const rest = at >= 0 ? s.slice(at).trim() : "";
  return rest || null;
}

/** s 앞의 지역 낱말 하나. 낱말 경계·도서관 시도와 맞는 것을 고른다 */
function matchRegion(s: string, area: Area, nameCodes: readonly string[] | null, afterSido: boolean): Token | null {
  const tokens = regionTokens();
  const ok: Token[] = [];
  for (const t of tokens) {
    if (!s.startsWith(t.text)) continue;
    const rest = s.slice(t.text.length);
    if (!rest.trim()) continue; // 지역만 남으면 떼지 않는다(core가 지역 이름인 경우로 처리)
    if (t.level === "sigungu") {
      const allowed = nameCodes ?? (area.sido ? [area.sido] : null);
      if (allowed && !t.codes.some((c) => allowed.includes(c))) continue;
      if (RULE.SIGUNGU_BLOCKED_NEXT.test(rest)) continue;
      if (!RULE.REGION_BOUNDARY.test(rest) && !afterSido) continue;
    } else {
      const sigunguNext = tokens.some((u) => u.level === "sigungu" && u.codes.some((c) => t.codes.includes(c)) && rest.startsWith(u.text));
      if (!RULE.REGION_BOUNDARY.test(rest) && !sigunguNext) continue;
    }
    ok.push(t);
  }
  if (!ok.length) return null;
  const fits = (t: Token) => !area.sido || t.codes.includes(area.sido);
  return ok.find(fits) ?? ok[0]!; // 이미 긴 것부터 정렬됨
}

/**
 * core가 지역 이름 그 자체인지. bare = 맨 지명(김제·노원·광주 — 고유 이름의 일부라 큰 글자로 남김),
 * 아니면 행정 단위 글자까지 붙은 모양(남원시·충청북도 — 앞말 지역과 같게 작은 글자로 내림)
 */
function placeOf(core: string, area: Area, nameCodes: readonly string[] | null): (Place & { bare: boolean }) | null {
  const allowed = area.sido ? [area.sido] : nameCodes;
  for (const s of RULE.SIDO) {
    if ((s.names.includes(core) || s.short === core) && (!allowed || allowed.includes(s.code))) return { short: s.short, code: s.code, bare: core === s.short };
  }
  for (const t of regionTokens()) {
    if (t.level !== "sigungu" || (t.text !== core && t.short !== core)) continue;
    if (allowed && !t.codes.some((c) => allowed.includes(c))) continue;
    return { short: t.short ?? core, code: t.codes[0] ?? null, bare: core !== t.text || t.text === t.short };
  }
  return null;
}

/** 이름을 칸으로 쪼갠다. 줄이면 안 되는 이름(이름 속 지역과 도서관 시도가 다름, 괄호 짝 안 맞음)이면 null */
function parse(original: string, area: Area): Parsed | null {
  let s = original.normalize("NFC").replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, " ").trim();
  let branch = false;
  let paren: string | null = null;
  s = s.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
    const t = inner.trim();
    if (RULE.BRANCH_MARKERS.includes(t)) branch = true;
    else if (t && paren == null) paren = t;
    return " ";
  });
  s = s.replace(/\s+/g, " ").trim();
  if (/[()[\]]/.test(s)) return null;

  let words = s.split(" ").filter((w) => !RULE.DROP_STANDALONE_WORDS.includes(w));
  if (words.length > 1 && RULE.SUBFACILITY_LAST_WORD.test(words[words.length - 1]!)) words = words.slice(0, -1);
  // 분관: "본관 분관 최상준도서관" / "본관 화령분관" / "…학습관아현분관"
  const bi = words.indexOf("분관");
  if (bi >= 0 && bi < words.length - 1) {
    words = words.slice(bi + 1);
    branch = true;
  } else {
    const last = words[words.length - 1] ?? "";
    if (last.endsWith("분관") && len(last) > 2) {
      const head = last.slice(0, -2);
      const name = afterMainName(head) ?? (words.length > 1 ? head : null);
      if (name) {
        words = [name];
        branch = true;
      }
    }
  }
  s = words.join(" ");

  // 앞말: 교육청·설립주체·지역을 반복해서 뗀다
  let region: Place | null = null;
  let nameCodes: readonly string[] | null = null;
  let national = false;
  let founder: string | null = null;
  let afterSido = false;
  for (;;) {
    s = s.trimStart();
    const drop = RULE.DROP_PREFIX_WORDS.find((w) => s.startsWith(w) && len(s) > len(w));
    if (drop) {
      s = s.slice(drop.length);
      afterSido = false;
      continue;
    }
    const fw = RULE.FOUNDER_WORDS.find((w) => s.startsWith(w) && len(s) > len(w));
    if (fw) {
      if (fw === "국립") national = true;
      else if (!RULE.DROP_STANDALONE_WORDS.includes(fw)) founder ??= fw;
      s = s.slice(fw.length);
      afterSido = false;
      continue;
    }
    const t = matchRegion(s, area, nameCodes, afterSido);
    if (!t) break;
    if (area.sido && !t.codes.includes(area.sido)) return null; // 이름은 경기, 도서관은 광주광역시 같은 경우: 줄이지 않는다
    const codes = area.sido ? [area.sido] : t.codes;
    nameCodes = codes;
    if (t.level === "sigungu") region = { short: t.short!, code: codes[0] ?? null };
    else if (!region || region.code == null) region = codes.length === 1 ? { short: sidoShort(codes[0]!)!, code: codes[0]! } : null;
    s = s.slice(t.text.length);
    const m = s.match(/^([시구군도]?)립/);
    if (m) {
      founder ??= `${m[1] || t.text.slice(-1)}립`;
      s = s.slice(m[0].length);
    }
    afterSido = t.level === "sido";
  }

  // 끝말: 버리는 끝말 → 기관 종류 → 이용 대상
  s = s.trim();
  const suf = RULE.DROP_SUFFIXES.find((x) => s.endsWith(x));
  if (suf) s = s.slice(0, -suf.length).trim();
  const kind = [...RULE.KIND_WORDS].sort(byLengthDesc).find((k) => s.endsWith(k)) ?? null;
  if (kind) s = s.slice(0, -kind.length).trim();
  const usage = [...RULE.USAGE_WORDS].sort(byLengthDesc).find((u) => s.endsWith(u)) ?? null;
  if (usage) s = s.slice(0, -usage.length).trim();
  let core = s.replace(/\s+/g, "");
  let kindOut = kind;
  if (RULE.GENERIC_WORDS.includes(core) && !kindOut) {
    kindOut = core;
    core = "";
  }
  const found = core ? placeOf(core, area, nameCodes) : null;
  const place = found?.bare ? { short: found.short, code: found.code } : null;
  if (found && !found.bare) {
    // 남원시어린이청소년 → 지역은 앞말처럼(더 좁은 쪽), 고유 이름은 없음
    if (!region || region.code === found.code) region = { short: found.short, code: found.code };
    core = "";
  }
  return { core: place ? place.short : core, place, kind: kindOut, usage, region, branch, paren, national, founder };
}

// ── 고르기 ───────────────────────────────────────────────────

/** 지역 줄임말이 다른 시도 이름과 같으면(경기 광주시의 "광주") 그 시도 이름 */
function otherSidoOf(p: Place | null): string | null {
  if (!p?.code) return null;
  const clash = RULE.SIDO.some((s) => s.short === p.short && s.code !== p.code);
  return clash ? sidoShort(p.code) : null;
}

function compose(p: Parsed, lib: CubeNameLib | undefined, area: Area): CubeName | null {
  const regionText = p.region ? (otherSidoOf(p.region) ? `${otherSidoOf(p.region)} ${p.region.short}` : p.region.short) : null;
  const bigValues: Record<BigSlot, string | null> = { core: p.core || null, kind: p.kind, usage: p.usage, region: p.region?.short ?? null };
  const bigSlot = RULE.BIG_ORDER.find((slot) => bigValues[slot]);
  if (!bigSlot) return null;
  const big = bigValues[bigSlot]!;
  if (len(big) < RULE.MIN_BIG_LENGTH) return null;
  const bigIs: BigSlot | "place" = bigSlot === "core" && p.place ? "place" : bigSlot;
  const smallValues: Record<Slot, string | null> = {
    core: null,
    kind: p.kind,
    usage: p.usage,
    region: regionText ?? area.sigungu ?? (lib ? regionOf(lib) : null),
    regionSido: otherSidoOf(bigIs === "place" ? p.place : bigIs === "region" ? p.region : null),
    branch: p.branch ? "분관" : null,
    paren: p.paren,
    national: p.national ? "국립" : null,
    founder: p.founder,
  };
  for (const rule of RULE.SMALL_ORDER) {
    if (rule.slot === bigSlot || (rule.when && !rule.when.includes(bigIs))) continue;
    const v = smallValues[rule.slot];
    if (v && v !== big) return { big, small: v };
  }
  if (RULE.NEEDS_SMALL.includes(bigSlot)) return null; // "중앙"만 덩그러니 남으면 원래 이름
  return { big, small: null };
}

/**
 * 한 도서관의 큐브 이름. 예: "전남광주통합특별시교육청금호평생교육관" → 큰 "금호" + 작은 "평생교육관".
 * 영문명(한글 없음)·괄호 짝이 안 맞음·이름 속 지역과 도서관 시도가 다름·줄이면 1글자면 원래 이름(작은 글자 없음).
 */
export function cubeName(name: string, lib?: CubeNameLib): CubeName {
  const original = name.trim();
  const whole: CubeName = { big: original, small: null };
  if (!hasHangul(original)) return whole;
  const area = areaOf(lib);
  const p = parse(original, area);
  return (p && compose(p, lib, area)) ?? whole;
}

/** 화면 한 줄 글(접근성 보조·테스트용): 작은 글자 + 큰 글자 */
export const cubeNameText = (n: CubeName) => (n.small ? `${n.small} ${n.big}` : n.big);

/**
 * 판에 함께 보이는 도서관들의 큐브 이름. 큰·작은 쌍으로 비교해서 겹치면 겹친 것끼리 작은 글자 앞에
 * ① 시군구 → ② 시도+시군구를 붙이고, 그래도 겹치면 원래 이름. 마지막 결과 전체를 다시 검사한다(원래 이름까지 같으면 그대로).
 */
export function cubeNames(libs: (Pick<LibrarySummary, "id" | "name"> & CubeNameLib)[]): Map<number, CubeName> {
  const base = new Map(libs.map((l) => [l.id, cubeName(l.name, l)]));
  const key = (n: CubeName) => `${n.big}\u0000${n.small ?? ""}`;
  const dupIds = (m: Map<number, CubeName>) => {
    const c = new Map<string, number>();
    for (const v of m.values()) c.set(key(v), (c.get(key(v)) ?? 0) + 1);
    return new Set([...m].filter(([, v]) => c.get(key(v))! > 1).map(([id]) => id));
  };
  /** 작은 글자 앞에 지역을 붙인다. 큰 글자·작은 글자에 이미 있는 낱말은 빼고 붙인다(큰 고성 + 작은 "강원 군립") */
  const withRegion = (n: CubeName, r: string | null): CubeName => {
    const have = new Set([n.big, ...(n.small ?? "").split(" ")]);
    const add = (r ?? "").split(" ").filter((w) => w && !have.has(w)).join(" ");
    return add ? { big: n.big, small: n.small ? `${add} ${n.small}` : add } : n;
  };
  const levels = [
    (l: CubeNameLib) => areaOf(l).sigungu ?? regionOf(l),
    (l: CubeNameLib) => {
      const a = areaOf(l);
      const s = a.sido ? sidoShort(a.sido) : null;
      return s && a.sigungu ? `${s} ${a.sigungu}` : null;
    },
  ];
  const out = new Map(base);
  for (const level of levels) {
    const d = dupIds(out);
    if (!d.size) break;
    for (const l of libs) if (d.has(l.id)) out.set(l.id, withRegion(base.get(l.id)!, level(l)));
  }
  for (let round = 0; round < libs.length; round++) {
    const d = [...dupIds(out)].filter((id) => out.get(id)!.big !== libs.find((l) => l.id === id)!.name.trim() || out.get(id)!.small);
    if (!d.length) break;
    for (const id of d) out.set(id, { big: libs.find((l) => l.id === id)!.name.trim(), small: null });
  }
  return out;
}
