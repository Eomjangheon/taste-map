// CSV 가져오기 — 매칭 파이프라인 (T20, 서버 전용)
//
// Steam(T19)과 결정적으로 다른 점: **외부 ID 가 없다.** Letterboxd 는 TMDB id 를 주지 않으므로
// §5.3 ① 경로를 아예 탈 수 없고, 전량이 ②(제목+연도) · ③(유사도) · ④(스킵)로 내려온다.
// T43 측정 보고서가 "90% 목표의 실제 관문은 CSV 쪽"이라고 한 이유가 이것이다.
//
// 그래서 여기서는 **카탈로그를 채우는 일**이 매칭 규칙만큼 중요하다.
//   1. 자체 카탈로그를 먼저 본다 (공짜)
//   2. 없으면 TMDB 에서 찾아 적재한다 (온디맨드 — 스킵 직전에 한 번 더)
//   3. 그 다음 엔진에 넘긴다

import { searchLocalWorks } from "@/lib/catalog/title-ko";
import { upsertTitleWorks, type WorkRow } from "@/lib/catalog/works";
import { searchTitles } from "@/lib/tmdb/titles";
import { matchAll, type CatalogEntry } from "@/lib/matching/engine";
import { toReviewItems, type ReviewItem, type ReviewSource } from "@/lib/matching/review";
import type { CsvRow } from "@/lib/import/csv";

/**
 * 화면이 한 번에 보내는 행 수. Steam(50)보다 작다 —
 * CSV 는 행마다 TMDB 검색이 붙을 수 있어서 한 청크가 훨씬 무겁다.
 */
export const CSV_CHUNK_SIZE = 25;

function toCatalogEntry(row: WorkRow): CatalogEntry {
  return {
    id: row.id,
    mediaType: row.media_type,
    canonicalTitle: row.canonical_title,
    titleKo: row.title_ko,
    releaseYear: row.release_year,
    externalIds: row.external_ids ?? {},
  };
}

export type CsvChunkResult = {
  items: ReviewItem[];
  /** 자체 카탈로그에서 재료를 찾은 행 수 */
  fromCatalog: number;
  /** TMDB 에서 새로 적재한 행 수 */
  fromTmdb: number;
};

/**
 * CSV 한 청크를 매칭해 확인 화면 항목으로 돌려준다.
 */
export async function matchCsvChunk(rows: CsvRow[]): Promise<CsvChunkResult> {
  if (rows.length === 0) return { items: [], fromCatalog: 0, fromTmdb: 0 };

  const catalog = new Map<string, CatalogEntry>();
  let fromCatalog = 0;
  let fromTmdb = 0;

  // 1. 자체 카탈로그 먼저
  const missing: CsvRow[] = [];
  for (const row of rows) {
    const local = await searchLocalWorks(row.title, ["movie"], 5);
    if (local.length === 0) {
      missing.push(row);
      continue;
    }
    for (const work of local) catalog.set(work.id, toCatalogEntry(work as WorkRow));
    fromCatalog += 1;
  }

  // 2. 없는 것만 TMDB 에 묻고 적재한다.
  //    ⚠ 여기서 적재하지 않으면 매칭할 대상 자체가 없어 전량 ④ 스킵이 된다.
  for (const row of missing) {
    const found = await searchTitles(row.title, 5);
    const movies = found.filter((c) => c.mediaType === "movie");
    if (movies.length === 0) continue;
    const { works } = await upsertTitleWorks(movies);
    for (const work of works) {
      if (work) catalog.set(work.id, toCatalogEntry(work));
    }
    fromTmdb += 1;
  }

  // 3. 엔진. 연도가 있으므로 ②(완전 일치)와 ③(연도 ±1)이 제대로 동작한다
  const sources: ReviewSource[] = rows.map((row) => ({
    key: row.key,
    title: row.title,
    year: row.year,
    mediaType: "movie",
  }));

  const results = matchAll(
    rows.map((row) => ({ title: row.title, year: row.year, mediaType: "movie" })),
    [...catalog.values()]
  );

  return { items: toReviewItems(sources, results), fromCatalog, fromTmdb };
}
