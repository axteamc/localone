// 큐브 윗면 이름 규칙 v2의 "설정" (VISIT-1 V3, 2026-11-19 D 위임 결정). 엔진은 shortName.ts.
// 규칙을 바꾸고 싶으면 대부분 이 파일의 표만 고치면 된다. 엔진 코드를 다시 짤 필요가 없게 나눴다.
//   - 낱말을 더/덜 떼고 싶다 → 아래 낱말 목록(KIND_WORDS·USAGE_WORDS·GENERIC_WORDS …)
//   - 무엇을 큰 글자로 올릴지 → BIG_ORDER 순서
//   - 작은 글자에 무엇을 먼저 쓸지·언제 쓸지 → SMALL_ORDER 순서와 when
// 결정 근거: 개발산출물/결과/큐브이름_v2_결정.md

/**
 * 이름을 쪼갠 칸(slot).
 * - core: 떼고 남은 고유 이름(정독·금호·최상준). 남은 말이 지역 이름 그 자체면(김제·노원·세종) 지역 줄임말로 바꿔 둔다(place)
 * - kind: 기관 종류 끝말(평생교육관·기념회관·학생교육문화회관…) 또는 범용어만 남은 경우(중앙·시민)
 * - usage: 이용 대상 끝말(어린이·청소년·영어…)
 * - region: 이름 앞의 행정 앞말에서 뗀 가장 좁은 지역(광주·남구). 없으면 도서관 주소·코드의 지역
 * - regionSido: 큰 글자가 지역 이름인데 그 이름이 다른 시도 이름과 같을 때(경기 광주시 → 경기)
 * - branch: 분관이면 "분관"
 * - paren: 분관 표식이 아닌 괄호 안의 말(양정작은도서관(달팽이) → 달팽이, D 결정 D-f)
 * - national: "국립"
 * - founder: 시립·구립·군립·도립
 */
export type Slot = "core" | "kind" | "usage" | "region" | "regionSido" | "branch" | "paren" | "national" | "founder";
export type BigSlot = "core" | "kind" | "usage" | "region";

/** 큰 글자: 앞에서부터 처음으로 값이 있는 칸 하나 */
export const BIG_ORDER: readonly BigSlot[] = ["core", "kind", "usage", "region"];

/**
 * 작은 글자: 앞에서부터 처음으로 값이 있고 when(큰 글자가 어느 칸인지) 조건이 맞는 칸 하나(D-a "작은 글자는 하나").
 * when이 없으면 큰 글자가 무엇이든 쓴다. place = 큰 글자가 core인데 그 core가 지역 이름일 때.
 */
export const SMALL_ORDER: readonly { slot: Slot; when?: readonly (BigSlot | "place")[] }[] = [
  { slot: "regionSido", when: ["place", "region"] }, // 큰 광주 + 작은 경기 (D 결정)
  { slot: "branch" }, // 큰 화령 + 작은 분관 (D-e)
  { slot: "paren" }, // 큰 양정 + 작은 달팽이 (D-f)
  { slot: "kind" }, // 큰 금호 + 작은 평생교육관 (D 예시)
  { slot: "usage" }, // 큰 사직 + 작은 어린이 (D 그림, D-d)
  { slot: "national" }, // 큰 세종 + 작은 국립 (D 예시)
  { slot: "region", when: ["kind", "usage"] }, // 큰 중앙 + 작은 광주 (D-b)
  { slot: "founder", when: ["region", "place"] }, // 큰 세종 + 작은 시립 (D 예시)
];

/** 시도. names는 이름 앞에서 뗄 때 쓰는 모양(긴 것부터 맞춘다), short는 화면에 쓰는 줄임말. code는 정보나루 지역 코드 앞 두 자리 */
export const SIDO: readonly { code: string; short: string; names: readonly string[] }[] = [
  { code: "11", short: "서울", names: ["서울특별시", "서울시", "서울"] },
  { code: "21", short: "부산", names: ["부산광역시", "부산시", "부산"] },
  { code: "22", short: "대구", names: ["대구광역시", "대구시", "대구"] },
  { code: "23", short: "인천", names: ["인천광역시", "인천시", "인천"] },
  // "광주시"는 넣지 않는다: 경기도 광주시와 겹친다(경기 광주시는 시군구 표에서 맞춘다)
  { code: "24", short: "광주", names: ["광주광역시", "광주"] },
  { code: "25", short: "대전", names: ["대전광역시", "대전시", "대전"] },
  { code: "26", short: "울산", names: ["울산광역시", "울산시", "울산"] },
  { code: "29", short: "세종", names: ["세종특별자치시", "세종시", "세종"] },
  { code: "31", short: "경기", names: ["경기도", "경기"] },
  { code: "32", short: "강원", names: ["강원특별자치도", "강원도", "강원"] },
  { code: "33", short: "충북", names: ["충청북도", "충북"] },
  { code: "34", short: "충남", names: ["충청남도", "충남"] },
  { code: "35", short: "전북", names: ["전북특별자치도", "전라북도", "전북"] },
  { code: "36", short: "전남", names: ["전라남도", "전남"] },
  { code: "37", short: "경북", names: ["경상북도", "경북"] },
  { code: "38", short: "경남", names: ["경상남도", "경남"] },
  { code: "39", short: "제주", names: ["제주특별자치도", "제주도", "제주"] },
];

/** 행정명이 바뀌어 여러 시도에 걸리는 이름. 도서관의 시도(코드 → 주소)로 하나를 고르고, 못 고르면 지역을 모르는 것으로 둔다(넘겨짚지 않음) */
export const SIDO_ALIASES: readonly { name: string; codes: readonly string[] }[] = [{ name: "전남광주통합특별시", codes: ["24", "36"] }];

/** 지역 이름 바로 뒤에 이 말이 오면 지역을 뗀다(낱말 경계). 시도 바로 뒤에 붙은 시군구(광주남구)는 따로 허용한다 */
export const REGION_BOUNDARY = /^(?:\s|교육청|[시구군도]?립)/;
/** 시군구 바로 뒤가 이 모양이면 떼지 않는다: 노원구청·중구청(구청 기관 이름). 청소년은 예외(광주남구청소년) */
export const SIGUNGU_BLOCKED_NEXT = /^청(?!소년)/;

/** 이름 앞에서 떼는 말(지역 다음에 와도 된다). 교육청은 작은 글자로도 되살리지 않는다(합의 A2) */
export const DROP_PREFIX_WORDS: readonly string[] = ["교육청"];
/** 설립주체. 국립은 national 칸, 나머지는 founder 칸으로 간다 */
export const FOUNDER_WORDS: readonly string[] = ["국립", "시립", "구립", "군립", "도립", "공립"];
/** 어디에 있든 낱말 하나로 서 있으면 지운다(도봉1동 공립 작은도서관) */
export const DROP_STANDALONE_WORDS: readonly string[] = ["공립"];

/** 끝에서 떼고 버리는 말. 하나만 뗀다 */
export const DROP_SUFFIXES: readonly string[] = ["작은도서관", "공공도서관", "도서관"];
/** 마지막 낱말이 이 모양이면 건물 안 방 이름이라 통째로 버린다(학습관자료실·종합자료실·교양정보실). 낱말이 하나뿐이면 두지 않는다 */
export const SUBFACILITY_LAST_WORD = /(?:자료실|정보실|열람실)$/;
/** 괄호 안이 이 말이면 분관 표식이다: 논현문화마루도서관(분관) */
export const BRANCH_MARKERS: readonly string[] = ["분관"];
/** 분관 이름 앞에서 본관 이름이 끝나는 말(마포평생학습관아현분관 → 아현) */
export const MAIN_NAME_ENDS: readonly string[] = ["도서관", "학습관", "교육문화관", "교육문화회관"];

/** 기관 종류 끝말 → kind 칸. 긴 것부터 맞춘다 */
export const KIND_WORDS: readonly string[] = [
  "학생교육문화회관",
  "학생교육문화관",
  "학생교육문화원",
  "학생복지회관",
  "교육문화회관",
  "교육문화관",
  "교육문화원",
  "평생교육관",
  "평생교육원",
  "평생학습관",
  "기념회관",
  "학생회관",
  "복지회관",
  "정보센터",
  "도서관마을",
];
/** 이용 대상 끝말 → usage 칸. 고유 이름 뒤에 붙을 때만 뗀다(어린이생태학습처럼 앞에 있으면 남김) */
export const USAGE_WORDS: readonly string[] = ["어린이청소년", "어린이영어", "어린이", "청소년", "영어"];
/** 이것만 남으면 고유 이름이 아니다 → kind 칸으로 옮기고 지역을 작은 글자로 단다 */
export const GENERIC_WORDS: readonly string[] = ["중앙", "시민", "구민", "군민", "공공", "정보", "문화정보", "평생학습", "기적의", "본관", "작은", "종합"];

/** 큰 글자가 이 칸인데 작은 글자를 못 찾으면(지역도 모름) 원래 이름: "중앙도서관"만으로는 어디인지 모른다 */
export const NEEDS_SMALL: readonly BigSlot[] = ["kind", "usage"];

/** 큰 글자가 이보다 짧으면(1글자) 줄이지 않고 원래 이름 */
export const MIN_BIG_LENGTH = 2;
