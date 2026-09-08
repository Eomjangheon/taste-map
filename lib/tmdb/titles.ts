// TMDB 영화·드라마 조회 — T12
//
// §3.1 D5: **TV 시즌은 별개 Work**다. 시리즈는 parent_work_id 로 그룹핑만 하고
// 동일성 판단에는 쓰지 않는다(§3.2 설계 주석).
//
// ⚠ TMDB 의 movie id 와 tv id 는 서로 다른 네임스페이스다. 같은 숫자가 영화에도 드라마에도 있다.
//   그래서 중복 대조는 반드시 media_type 과 함께 해야 한다.

import { posterUrl, tmdbGet } from "./client";

type TmdbMovie = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
};

type TmdbTv = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

type TmdbSeason = {
  id: number;
  name?: string;
  season_number: number;
  air_date?: string | null;
  poster_path?: string | null;
};

export type TitleCandidate = {
  mediaType: "movie" | "tv";
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  /** works.external_ids 에 그대로 들어간다 */
  externalIds: Record<string, number>;
  /** 시즌 Work 일 때 상위 시리즈. §3.1 상 별개 Work 이고 그룹핑 전용이다 */
  parent: TitleCandidate | null;
  /** 화면 표시용 라벨 (movie / tv / tv-season) */
  kind: "movie" | "tv-series" | "tv-season";
};

function year(date?: string | null): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isInteger(y) && y > 1800 ? y : null;
}

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/**
 * language=ko-KR 로 받은 지역화 제목과 원제를 비교해 title_ko 를 정한다.
 * 한국어 번역이 없으면 TMDB 는 지역화 필드에 원제를 그대로 돌려준다 — 그때는 null 로 둔다.
 * 원제 자체가 한국어인 작품(한국 영화)은 canonical 이 곧 한국어 제목이므로 역시 null.
 */
function koreanTitle(localized: string | undefined, original: string | undefined): string | null {
  if (!localized || !original) return null;
  if (localized === original) return null;
  return HANGUL.test(localized) ? localized : null;
}

function movieToCandidate(m: TmdbMovie): TitleCandidate | null {
  const canonical = m.original_title || m.title;
  if (!m.id || !canonical) return null;
  return {
    mediaType: "movie",
    canonicalTitle: canonical,
    titleKo: koreanTitle(m.title, m.original_title),
    releaseYear: year(m.release_date),
    posterPath: m.poster_path ?? null,
    externalIds: { tmdb: m.id },
    parent: null,
    kind: "movie",
  };
}

function seriesToCandidate(t: TmdbTv): TitleCandidate | null {
  const canonical = t.original_name || t.name;
  if (!t.id || !canonical) return null;
  return {
    mediaType: "tv",
    canonicalTitle: canonical,
    titleKo: koreanTitle(t.name, t.original_name),
    releaseYear: year(t.first_air_date),
    posterPath: t.poster_path ?? null,
    externalIds: { tmdb: t.id },
    parent: null,
    kind: "tv-series",
  };
}

/**
 * 시즌을 별개 Work 로 만든다.
 * canonical 은 언어에 흔들리지 않게 `원제: Season N` 으로 고정하고,
 * 한국어 제목은 TMDB 가 준 시즌 이름(`시즌 4`, `파트 4` 등)을 붙인다.
 * 시즌 id 는 시리즈 id 와 별개로 유일하므로 중복 대조 키로 쓴다.
 */
function seasonToCandidate(series: TitleCandidate, s: TmdbSeason): TitleCandidate {
  // 원제가 이미 한국어인 작품(한국 드라마)은 title_ko 가 null 이다.
  // 그때 canonical(`오징어 게임: Season 1`)만 남으면 한/영 혼용이 되므로, 원제를 한국어 기준으로 삼는다.
  const koBase = series.titleKo ?? (HANGUL.test(series.canonicalTitle) ? series.canonicalTitle : null);
  const seasonKo = koBase && s.name ? `${koBase}: ${s.name}` : null;
  return {
    mediaType: "tv",
    canonicalTitle: `${series.canonicalTitle}: Season ${s.season_number}`,
    titleKo: seasonKo,
    releaseYear: year(s.air_date) ?? series.releaseYear,
    posterPath: s.poster_path ?? series.posterPath,
    // 시즌에는 시리즈 tmdb id 를 넣지 않는다 — 시리즈 행과 같은 값이 되어 중복 대조가 서로를 물어버린다.
    // 시리즈와의 관계는 parent_work_id 가 표현한다.
    externalIds: { tmdb_season_id: s.id },
    parent: series,
    kind: "tv-season",
  };
}

/** 검색 결과에 붙일 포스터 URL (저장하지 않고 조회 시점에 조립한다) */
export function candidatePosterUrl(c: TitleCandidate) {
  return c.posterPath ? posterUrl(c.posterPath) : null;
}

/**
 * 영화·드라마를 함께 검색한다.
 * 드라마는 시즌이 있으면 **시즌마다 별개 Work** 를 만들고 시리즈를 부모로 붙인다.
 * 특별편(시즌 0)은 제외한다 — 시즌 개념과 맞지 않아 카탈로그 노이즈가 된다.
 */
export async function searchTitles(term: string, perType = 5): Promise<TitleCandidate[]> {
  const query = term.trim();
  if (!query) return [];
  const params = { query, language: "ko-KR", include_adult: "false" };

  const movies = await tmdbGet<{ results?: TmdbMovie[] }>("/search/movie", params);
  const shows = await tmdbGet<{ results?: TmdbTv[] }>("/search/tv", params);

  const out: TitleCandidate[] = [];
  for (const m of (movies.results ?? []).slice(0, perType)) {
    const c = movieToCandidate(m);
    if (c) out.push(c);
  }

  for (const t of (shows.results ?? []).slice(0, perType)) {
    const series = seriesToCandidate(t);
    if (!series) continue;

    // 시즌 목록은 상세 조회에만 들어 있다
    const detail = await tmdbGet<{ seasons?: TmdbSeason[] }>(`/tv/${series.externalIds.tmdb}`, {
      language: "ko-KR",
    });
    const seasons = (detail.seasons ?? []).filter((s) => s.season_number >= 1);

    if (seasons.length === 0) {
      out.push(series);
      continue;
    }
    for (const s of seasons) out.push(seasonToCandidate(series, s));
  }

  return out;
}
