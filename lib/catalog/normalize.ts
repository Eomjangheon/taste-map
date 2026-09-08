// 제목 정규화 — T13 에서 만들고 매칭 엔진(T18·T43)이 같은 규칙을 공유한다.
//
// 명세서 §5.3 "제목 정규화 규칙": 대소문자 통일, 특수문자·공백 제거.
// (한/영 교차 대조는 T14 매핑을 읽는 조회가 담당하고, 부제·시즌 토큰 분리는 T18 이 여기에 덧붙인다.)
//
// ⚠ **정규식 `\w`/`\W`/`\b` 를 쓰지 않는다.** 한글에 오작동한다 — `\W` 는 한글을 전부 지워서
//   한글 검색어가 빈 문자열이 되고, 그러면 "모든 제목과 일치"하는 것처럼 보인다.
//   WEB-16 검수에서 실제로 터진 버그이며 AGENTS.md 규칙으로 올라가 있다.
//   문자 판별에는 유니코드 속성 클래스 `\p{L}`·`\p{N}` (+`u` 플래그)만 쓴다.

/**
 * 비교용 정규화. 글자와 숫자만 남기고 소문자로 통일한다.
 *
 * ```
 * normalizeTitle("The Witcher 3: Wild Hunt") === "thewitcher3wildhunt"
 * normalizeTitle("오징어 게임 : 시즌 1")      === "오징어게임시즌1"
 * ```
 *
 * 유니코드 정규화(NFC)를 먼저 걸어, 자모가 분리된 한글(맥에서 붙여넣은 텍스트 등)과
 * 완성형 한글이 같은 문자열이 되게 한다.
 */
export function normalizeTitle(input: string): string {
  return input.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 정규화 후 완전히 같은가 (§5.3 매칭 키 ②의 제목 부분) */
export function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a);
  return left.length > 0 && left === normalizeTitle(b);
}

/**
 * 검색어가 제목에 포함되는가. 정규화한 뒤 비교하므로 띄어쓰기·문장부호가 달라도 걸린다.
 * 빈 검색어는 항상 false — 빈 문자열은 모든 문자열에 포함되므로 전체 매칭이 되어버린다.
 */
export function titleContains(haystack: string, needle: string): boolean {
  const q = normalizeTitle(needle);
  if (q.length === 0) return false;
  return normalizeTitle(haystack).includes(q);
}

/**
 * 검색 결과 정렬용 점수. 낮을수록 먼저 온다.
 * 완전 일치 → 접두 일치 → 부분 일치 순으로, 같은 등급 안에서는 제목이 짧은 쪽을 앞에 둔다
 * ("Portal" 검색에 "Portal 2: Community Edition" 보다 "Portal" 이 먼저 와야 한다).
 */
export function matchRank(title: string, query: string): number {
  const t = normalizeTitle(title);
  const q = normalizeTitle(query);
  if (q.length === 0 || !t.includes(q)) return 900 + t.length;
  if (t === q) return 0 + t.length;
  if (t.startsWith(q)) return 100 + t.length;
  return 300 + t.length;
}

// ---------------------------------------------------------------- T18: 제목 분해
//
// §5.3 "제목 정규화 규칙" 의 세 번째 항목 — **부제·시즌 표기 분리** (`종이의 집 파트4` → 본제 + 시즌 토큰).
// 매칭 엔진(T43)이 소비한다. T13 검색이 쓰는 `normalizeTitle()` 과 같은 파일·같은 규칙이며,
// 여기서도 문자 판별은 `\p{L}`·`\p{N}` 만 쓴다(위 경고 참조).
//
// ⚠ **에디션·시즌은 떼어내되 버리지 않는다.** 계약 문서 §2 동일성 7케이스에서
//   시즌(1)·리마스터(2)·감독판(3)·리메이크(6)는 **별개 works** 다.
//   토큰을 지워서 같은 제목으로 만들어버리면 `엘든 링` 과 `엘든 링 리마스터` 가 한 작품이 된다.
//   그래서 분리한 값을 비교 키(`key`)에 도로 넣는다 — 분리의 목적은 '표기 차이 흡수'이지
//   '다른 판본 병합'이 아니다.

/** 분해 결과 1건 */
export type TitleParts = {
  /** 입력 원문 */
  raw: string;
  /** 시즌·에디션 토큰을 떼어낸 본제 (원문 형태 유지) */
  base: string;
  /** 본제에서 부제까지 뗀 앞부분. **후보 넓히기 전용 — 동일성 판단에 쓰지 않는다** */
  head: string;
  /** 부제(`본제: 부제` 의 뒷부분). 없으면 null */
  subtitle: string | null;
  /** 시즌·파트 번호. 없으면 null. **동일성의 일부다** (계약 7케이스 1) */
  season: number | null;
  /** 에디션 라벨. 정렬·중복 제거된 목록. **동일성의 일부다** (계약 7케이스 2·3·6) */
  editions: string[];
  /** 비교 키 = 정규화 본제 + 시즌 + 에디션 */
  key: string;
};

/** 숫자 표기 통일 — `Part Two` · `파트 2` · `Part II` 가 모두 2 가 된다 */
const WORD_NUMBER: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9, 십: 10,
};

function toNumber(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return WORD_NUMBER[t] ?? null;
}

// 시즌·파트 토큰. 숫자·영문 서수·로마 숫자를 함께 받는다.
// ⚠ 아래 패턴들은 `\b` 를 쓴다. AGENTS.md 가 금지한 것은 **문자를 지우는** `\W`·`[^\w]` 이고,
//   여기서 `\b` 는 영어 토큰(`season`·`part`·`edition`)의 경계를 잡는 앵커일 뿐 한글을 건드리지 않는다.
//   한글은 `\w` 가 아니므로 `오징어 게임season2` 같은 붙은 표기에서도 경계가 정상적으로 잡힌다.
// ⚠ 여기에 `Chapter`·`Episode` 를 넣지 않는다 — 게임 제목의 부제로 흔해서
//   (`Hitman: Episode 1` 이 아니라 `Life is Strange: Chapter 2` 류) 시즌으로 오인한다.
const SEASON_PATTERNS: RegExp[] = [
  /\b(?:season|part)\s*[.:]?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|i{1,3}|iv|vi{0,3}|ix|x)\b/iu,
  /(?:시즌|파트|시리즈)\s*[.:]?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|i{1,3}|iv|vi{0,3}|ix|x|[일이삼사오육칠팔구십])/iu,
  /(\d+)\s*기(?![가-힣])/u, // "2기"
];

// 에디션 표기 → 정규 라벨. **긴 표기를 먼저 본다** (`game of the year edition` 이 `edition` 보다 앞).
// 값이 같은 라벨로 모이는 표기는 같은 판본으로 취급한다 (`Redux` = `Remastered`).
const EDITION_PATTERNS: [RegExp, string][] = [
  [/\b(?:game of the year|goty)(?:\s+edition)?\b/iu, "goty"],
  [/\bdirector'?s\s+cut\b|감독판/iu, "directors-cut"],
  [/\bextended\s+(?:edition|cut)\b|확장판/iu, "extended"],
  [/\bdefinitive(?:\s+edition)?\b/iu, "definitive"],
  [/\bremaster(?:ed)?\b|\bredux\b|리마스터(?:드)?/iu, "remaster"],
  [/\bremake\b|리메이크/iu, "remake"],
  [/\banniversary(?:\s+edition)?\b|주년\s*기념(?:판)?/iu, "anniversary"],
  [/\bcomplete(?:\s+edition)?\b/iu, "complete"],
  [/\bdeluxe(?:\s+edition)?\b/iu, "deluxe"],
  [/\bultimate(?:\s+edition)?\b/iu, "ultimate"],
  [/\benhanced(?:\s+edition)?\b/iu, "enhanced"],
  [/\bspecial\s+edition\b/iu, "special"],
  [/\blegendary\s+edition\b/iu, "legendary"],
  [/\bgold\s+edition\b/iu, "gold"],
  [/\bclassic\s+edition\b/iu, "classic"],
];

/** 상표 기호·이형 대시·괄호를 공백으로 눕힌다 (`Horizon Zero Dawn™ Complete Edition`) */
function flatten(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[™®©]/gu, " ")
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

/** 토큰을 떼어낸 자리에 남는 구분자 찌꺼기(`Squid Game :`, `Metro 2033 -`)를 정리한다 */
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[\s:;,\-–—/|]+|[\s:;,\-–—/|]+$/gu, "")
    .trim();
}

/**
 * 제목을 본제·부제·시즌·에디션으로 분해한다.
 *
 * ```
 * splitTitle("종이의 집 파트4").season          === 4
 * splitTitle("Dune: Part Two").base             === "Dune"
 * splitTitle("오징어 게임: Season 2").season     === 2
 * splitTitle("Metro 2033 Redux").editions       === ["remaster"]
 * splitTitle("The Witcher 3: Wild Hunt").head   === "The Witcher 3"
 * ```
 *
 * 같은 작품인지는 `base` 가 아니라 `key` 로 비교한다 — 시즌·에디션이 키에 들어 있다.
 */
export function splitTitle(raw: string): TitleParts {
  let work = flatten(raw);

  let season: number | null = null;
  for (const pattern of SEASON_PATTERNS) {
    const hit = work.match(pattern);
    if (!hit) continue;
    const value = toNumber(hit[1]);
    if (value === null) continue;
    season = value;
    work = work.replace(pattern, " ");
    break;
  }

  const editions: string[] = [];
  for (const [pattern, label] of EDITION_PATTERNS) {
    if (!pattern.test(work)) continue;
    work = work.replace(pattern, " ");
    if (!editions.includes(label)) editions.push(label);
  }

  const base = tidy(work);
  // 부제 구분자: 콜론(`A: B`) 또는 공백으로 둘러싼 대시(`A - B`). `Spider-Man` 은 걸리지 않는다.
  const cut = base.match(/^(.*?)\s*(?::|\s-\s)\s*(.+)$/u);
  const head = cut ? tidy(cut[1]) : base;
  const subtitle = cut ? tidy(cut[2]) : null;

  return {
    raw,
    base,
    head: head || base,
    subtitle: subtitle || null,
    season,
    editions: [...editions].sort(),
    key: `${normalizeTitle(base)}|s${season ?? 0}|${[...editions].sort().join("+")}`,
  };
}

/**
 * 표기 차이를 흡수한 뒤에도 같은 작품인가 (§5.3 매칭 키 ②의 제목 부분).
 *
 * `titlesMatch()` 와 달리 시즌·에디션 표기가 달라도 **같은 판본이면** 참이다
 * (`오징어 게임 시즌 2` = `Squid Game Season 2` 는 아니다 — 언어가 다르면 T14 매핑이 필요하다.
 *  여기서 흡수하는 것은 `Season 2` / `시즌2` / `Part II` 같은 **표기** 차이다).
 */
export function sameWorkTitle(a: string, b: string): boolean {
  const left = splitTitle(a);
  if (normalizeTitle(left.base).length === 0) return false;
  return left.key === splitTitle(b).key;
}
