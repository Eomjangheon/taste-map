// 통합 작품 검색 — T13
//
// 흐름(이슈 체크리스트): **자체 DB 우선 조회 → 없으면 외부 API 조회·적재 후 반환(온디맨드)**.
// 자체 DB 에 결과가 있으면 외부 호출을 하지 않는다. 외부 API 호출을 아끼고 응답이 빨라지는 대신,
// 카탈로그에 일부만 들어와 있는 시리즈는 나머지가 바로 안 보인다("Portal" 로 검색하면 이미 적재된
// Portal 만 나온다). 더 넓게 보고 싶으면 매체 필터를 바꾸거나 더 구체적인 제목으로 검색한다.
//
// 매체별 소스(§3.3): game → IGDB, movie·tv → TMDB.

import { searchLocalWorks, type CatalogWork } from "@/lib/catalog/title-ko";
import { matchRank, titleContains } from "@/lib/catalog/normalize";
import { upsertGameWorks, upsertTitleWorks, type WorkRow } from "@/lib/catalog/works";
import { coverUrl, searchGames } from "@/lib/igdb/games";
import { candidatePosterUrl, searchTitles } from "@/lib/tmdb/titles";
import { posterUrl as derivedPosterUrl } from "@/lib/works/poster";

export type MediaFilter = "all" | "game" | "movie" | "tv";

/** 계약된 검색 결과 1건 (docs/contract.md §4) */
export type WorkSearchResult = {
  id: string;
  mediaType: string;
  /** 화면에 그대로 쓰는 제목 — 한국어 제목이 있으면 그것 */
  title: string;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  /** 없을 수 있다. works 에 포스터 컬럼이 없어 조회 시점에 유도한다 */
  coverUrl: string | null;
  parentWorkId: string | null;
  externalIds: Record<string, unknown>;
  source: string;
};

const MEDIA_OF: Record<MediaFilter, string[]> = {
  all: ["game", "movie", "tv"],
  game: ["game"],
  movie: ["movie"],
  tv: ["tv"],
};

function toResult(work: CatalogWork | WorkRow, cover: string | null): WorkSearchResult {
  return {
    id: work.id,
    mediaType: work.media_type,
    title: work.title_ko ?? work.canonical_title,
    canonicalTitle: work.canonical_title,
    titleKo: work.title_ko,
    releaseYear: work.release_year,
    coverUrl:
      cover ??
      // 게임은 steam_appid 로 커버를 유도할 수 있다 (B 가 T41 에서 만든 헬퍼를 재사용한다)
      derivedPosterUrl({ media_type: work.media_type, external_ids: work.external_ids ?? null }),
    parentWorkId: work.parent_work_id,
    externalIds: work.external_ids ?? {},
    source: work.source,
  };
}

/** 자체 카탈로그 조회 — 정규화 비교로 한 번 더 거른다 (DB ilike 는 띄어쓰기 차이를 못 잡는다) */
async function fromCatalog(query: string, media: MediaFilter, limit: number) {
  const rows = await searchLocalWorks(query, MEDIA_OF[media], limit * 3);
  return rows
    .filter((w) => titleContains(w.canonical_title, query) || titleContains(w.title_ko ?? "", query))
    .sort(
      (a, b) =>
        Math.min(matchRank(a.canonical_title, query), matchRank(a.title_ko ?? "", query)) -
        Math.min(matchRank(b.canonical_title, query), matchRank(b.title_ko ?? "", query))
    )
    .slice(0, limit)
    .map((w) => toResult(w, null));
}

/** 외부 API 조회 + 적재. 매체 필터에 맞는 소스만 호출한다 */
async function fromExternal(query: string, media: MediaFilter, limit: number) {
  const results: WorkSearchResult[] = [];

  if (media === "all" || media === "game") {
    const candidates = await searchGames(query, limit);
    if (candidates.length > 0) {
      const { works } = await upsertGameWorks(candidates);
      works.forEach((work, i) => {
        if (!work) return;
        const c = candidates[i];
        results.push(toResult(work, c?.coverImageId ? coverUrl(c.coverImageId) : null));
      });
    }
  }

  if (media === "all" || media === "movie" || media === "tv") {
    const candidates = await searchTitles(query, limit);
    const wanted = candidates.filter(
      (c) => media === "all" || c.mediaType === media
    );
    if (wanted.length > 0) {
      const { works } = await upsertTitleWorks(wanted);
      works.forEach((work, i) => {
        if (!work) return;
        results.push(toResult(work, candidatePosterUrl(wanted[i])));
      });
    }
  }

  return results
    .sort((a, b) => matchRank(a.title, query) - matchRank(b.title, query))
    .slice(0, limit);
}

/** 작품 1건 + 그룹핑 관계 (상세 화면·상세 API 용) */
export type WorkDetail = WorkSearchResult & {
  /** 상위 작품 (DLC 의 본편, 시즌의 시리즈). §3.1 상 별개 작품이며 그룹핑 전용이다 */
  parent: WorkSearchResult | null;
  /** 하위 작품 (DLC·시즌 등) */
  children: WorkSearchResult[];
};

export async function getWorkDetail(id: string): Promise<WorkDetail | null> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const COLUMNS =
    "id, media_type, canonical_title, title_ko, release_year, external_ids, parent_work_id, source";

  const { data, error } = await supabaseAdmin().from("works").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`작품 조회 실패: ${error.message}`);
  if (!data) return null;
  const work = data as WorkRow;

  let parent: WorkSearchResult | null = null;
  if (work.parent_work_id) {
    const { data: p } = await supabaseAdmin()
      .from("works")
      .select(COLUMNS)
      .eq("id", work.parent_work_id)
      .maybeSingle();
    if (p) parent = toResult(p as WorkRow, null);
  }

  const { data: kids } = await supabaseAdmin()
    .from("works")
    .select(COLUMNS)
    .eq("parent_work_id", work.id)
    .order("release_year", { ascending: true })
    .limit(50);

  return {
    ...toResult(work, null),
    parent,
    children: ((kids ?? []) as WorkRow[]).map((k) => toResult(k, null)),
  };
}

export type WorkSearchResponse = {
  query: string;
  media: MediaFilter;
  results: WorkSearchResult[];
  /** 결과가 어디서 왔는지 — 온디맨드 적재가 일어났는지 화면에서 확인하기 위한 값 */
  origin: "catalog" | "external" | "none";
};

/**
 * 통합 검색. 자체 카탈로그를 먼저 보고, 비어 있을 때만 외부 API 로 나간다.
 */
export async function searchWorks(
  query: string,
  media: MediaFilter = "all",
  limit = 20
): Promise<WorkSearchResponse> {
  const q = query.trim();
  if (!q) return { query: q, media, results: [], origin: "none" };

  const local = await fromCatalog(q, media, limit);
  if (local.length > 0) return { query: q, media, results: local, origin: "catalog" };

  const external = await fromExternal(q, media, limit);
  return {
    query: q,
    media,
    results: external,
    origin: external.length > 0 ? "external" : "none",
  };
}
