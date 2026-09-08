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
