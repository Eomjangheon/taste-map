// 작품 매칭 엔진 — T43 (매칭 2/3), §5.3
//
// **DB 를 모른다.** 카탈로그를 인자로 받는 순수 함수라서 픽스처(T18)로 정확도를 재현 측정할 수 있고,
// Steam(T19)·CSV(T20)는 works 를 읽어 `CatalogEntry[]` 로 넘겨주기만 하면 된다.
//
// 매칭 키 우선순위 (§5.3 — 순서를 바꾸지 않는다)
//   ① 외부 ID 직접 대응 (steam_appid·tmdb·tmdb_season_id·igdb·isbn) → 즉시 확정
//   ② 정규화 제목 + 연도 완전 일치                                   → 자동 확정
//   ③ 제목 유사도 + 연도 ±1                                         → 후보 3개 제시
//   ④ 미발견                                                        → 스킵 목록
//
// 목표는 500건 중 450건(약 90%) 자동 확정이며 **100% 자동화가 아니다.** 애매하면 ③으로 내려보내
// 사람이 한 번 누르게 하는 편이 조용히 틀리는 것보다 낫다 — 확인 UX(T44)가 그래서 존재한다.
//
// ⚠ `parent_work_id` 는 동일성 판단에 쓰지 않는다 (계약 §2). 여기서는 아예 읽지 않는다.

import { distance } from "fastest-levenshtein";
import { normalizeTitle, splitTitle } from "@/lib/catalog/normalize";

/** 매칭 대상 카탈로그 1건 — works 행에서 매칭에 필요한 필드만 */
export type CatalogEntry = {
  id: string;
  mediaType: string;
  canonicalTitle: string;
  /** 한국어 제목 (T14). **한/영 교차 대조가 여기서 일어난다** */
  titleKo: string | null;
  releaseYear: number | null;
  externalIds: Record<string, unknown>;
};

/** 가져오기가 준 1행 */
export type MatchInput = {
  title: string;
  year: number | null;
  mediaType: string;
  externalIds?: Record<string, unknown>;
};

export type MatchCandidate = {
  entry: CatalogEntry;
  /** 0~1. 1 이면 정규화 제목이 완전히 같다 */
  score: number;
  /** 왜 후보로 올라왔는지 — 확인 UX(T44)가 그대로 보여준다 */
  reason: string;
};

export type MatchResult =
  /** ①② 자동 확정 */
  | { path: "external-id" | "title-year"; entry: CatalogEntry; candidates: MatchCandidate[] }
  /** ③ 사람이 고른다 */
  | { path: "similar"; entry: null; candidates: MatchCandidate[] }
  /** ④ 스킵 목록 */
  | { path: "skip"; entry: null; candidates: [] };

/** 대조할 외부 ID 키 — 앞에 있을수록 우선 (§5.3 ①) */
const ID_KEYS = ["steam_appid", "tmdb_season_id", "tmdb", "igdb", "isbn"] as const;

/** 후보로 올릴 최소 유사도. 연도를 모르면 더 엄격하게 본다 */
const SIMILARITY_FLOOR = 0.6;
const SIMILARITY_FLOOR_NO_YEAR = 0.85;
/** §5.3 UX 규격: 후보 3개 */
const MAX_CANDIDATES = 3;

// ------------------------------------------------------------------ 색인
export type CatalogIndex = {
  entries: CatalogEntry[];
  /** `media|key|값` → 항목 */
  byExternalId: Map<string, CatalogEntry>;
};

function idSlot(mediaType: string, key: string, value: unknown) {
  return `${mediaType}|${key}|${String(value)}`;
}

/**
 * 카탈로그를 한 번만 훑어 색인을 만든다. 수백 건을 가져올 때 행마다 전수 조회하지 않기 위해서다.
 *
 * ⚠ 외부 ID 대조는 반드시 **media_type 과 함께** 한다 — TMDB 의 영화 id 와 드라마 id 는
 *   네임스페이스가 달라 같은 숫자가 양쪽에 존재한다 (계약 §4-1).
 */
export function buildIndex(entries: CatalogEntry[]): CatalogIndex {
  const byExternalId = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    for (const key of ID_KEYS) {
      const value = entry.externalIds?.[key];
      if (value === undefined || value === null || value === "") continue;
      const slot = idSlot(entry.mediaType, key, value);
      // 먼저 들어온 행을 유지한다 — 같은 외부 ID 를 가진 중복 행이 있어도 결과가 흔들리지 않게
      if (!byExternalId.has(slot)) byExternalId.set(slot, entry);
    }
  }
  return { entries, byExternalId };
}

// ------------------------------------------------------------------ 유사도
/**
 * 0~1 유사도. **거리 계산은 라이브러리(fastest-levenshtein)가 한다** — 직접 구현하지 않는다(T43 지시).
 *
 * 여기서 더하는 것은 거리 자체가 아니라 이 도메인의 사정 하나다:
 * 한쪽이 다른 쪽을 통째로 품는 제목(`Metro` ⊂ `Metro 2033`,
 * `Justice League` ⊂ `Zack Snyder's Justice League`)은 글자 수 차이 때문에 레벤슈타인 점수가
 * 낮게 나오지만 실제로는 사람이 바로 알아보는 후보다. 그래서 **후보로 올릴 만큼만** 끌어올린다.
 */
function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  const base = 1 - distance(a, b) / longest;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const contained = short.length >= 4 && short.length / long.length >= 0.4 && long.includes(short);
  return contained ? Math.max(base, 0.75) : base;
}

/** 이 항목이 들고 있는 제목 표기 전부 (원제 + 한국어 제목) */
function titlesOf(entry: CatalogEntry): string[] {
  return [entry.canonicalTitle, entry.titleKo].filter((t): t is string => Boolean(t && t.trim()));
}

/** 정규화 제목이 완전히 같은가 — 한/영 교차 대조 포함 (T14 의 title_ko 가 여기서 쓰인다) */
function titleKeyMatches(input: MatchInput, entry: CatalogEntry): boolean {
  const key = splitTitle(input.title).key;
  return titlesOf(entry).some((t) => splitTitle(t).key === key);
}

function bestSimilarity(input: MatchInput, entry: CatalogEntry): number {
  const mine = splitTitle(input.title);
  let best = 0;
  for (const title of titlesOf(entry)) {
    const theirs = splitTitle(title);
    // 시즌이 어긋나면 다른 작품이다 (계약 §2 케이스 1) — 후보로도 올리지 않는다
    if (mine.season !== theirs.season) continue;
    const score =
      theirs.key === mine.key
        ? 1
        : similarity(normalizeTitle(mine.base), normalizeTitle(theirs.base));
    best = Math.max(best, score);
  }
  return best;
}

function yearGap(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.abs(a - b);
}

// ------------------------------------------------------------------ 본체
/**
 * 1행을 매칭한다. 카탈로그가 커도 되도록 색인을 미리 받는다.
 */
export function matchOne(input: MatchInput, index: CatalogIndex): MatchResult {
  // ① 외부 ID 직접 대응 → 즉시 확정
  for (const key of ID_KEYS) {
    const value = input.externalIds?.[key];
    if (value === undefined || value === null || value === "") continue;
    const hit = index.byExternalId.get(idSlot(input.mediaType, key, value));
    if (hit) {
      return {
        path: "external-id",
        entry: hit,
        candidates: [{ entry: hit, score: 1, reason: `${key} 일치` }],
      };
    }
  }

  const sameMedia = index.entries.filter((e) => e.mediaType === input.mediaType);

  // ② 정규화 제목 + 연도 완전 일치 → 자동 확정
  const exact = sameMedia.filter((e) => titleKeyMatches(input, e));
  if (input.year !== null) {
    const withYear = exact.filter((e) => e.releaseYear === input.year);
    if (withYear.length === 1) {
      return {
        path: "title-year",
        entry: withYear[0],
        candidates: [{ entry: withYear[0], score: 1, reason: "제목·연도 완전 일치" }],
      };
    }
  } else if (exact.length === 1) {
    // 연도를 모르는 경로(Steam)는 **제목이 유일할 때만** 자동 확정한다.
    // 같은 제목이 여러 해에 걸쳐 있으면(리메이크 등) 사람이 골라야 한다.
    return {
      path: "title-year",
      entry: exact[0],
      candidates: [{ entry: exact[0], score: 1, reason: "제목 완전 일치 (연도 정보 없음)" }],
    };
  }

  // ③ 제목 유사도 + 연도 ±1 → 후보 제시
  const floor = input.year === null ? SIMILARITY_FLOOR_NO_YEAR : SIMILARITY_FLOOR;
  const candidates: MatchCandidate[] = [];
  for (const entry of sameMedia) {
    const gap = yearGap(input.year, entry.releaseYear);
    if (gap !== null && gap > 1) continue;
    const score = bestSimilarity(input, entry);
    if (score < floor) continue;
    const reason =
      score === 1
        ? gap === 0
          ? "제목 일치 (판본 표기 차이)"
          : "제목 일치, 연도 1년 차이"
        : `제목 유사 ${Math.round(score * 100)}%`;
    candidates.push({ entry, score, reason });
  }

  if (candidates.length > 0) {
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        (yearGap(input.year, a.entry.releaseYear) ?? 9) - (yearGap(input.year, b.entry.releaseYear) ?? 9)
    );
    return { path: "similar", entry: null, candidates: candidates.slice(0, MAX_CANDIDATES) };
  }

  // ④ 미발견
  return { path: "skip", entry: null, candidates: [] };
}

/** 여러 행을 한 번에. 색인은 한 번만 만든다 */
export function matchAll(inputs: MatchInput[], entries: CatalogEntry[]): MatchResult[] {
  const index = buildIndex(entries);
  return inputs.map((input) => matchOne(input, index));
}

/** ①② 는 사람 손이 필요 없다 = 자동 확정 (§5.3 목표 지표의 분자) */
export function isAutoConfirmed(result: MatchResult): boolean {
  return result.path === "external-id" || result.path === "title-year";
}
