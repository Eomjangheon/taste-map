// Steam 가져오기 — 매칭 파이프라인 (T19, 서버 전용)
//
// 순서 (§5.3 ① 경로를 실제로 성립시키는 부분)
//   1. appid → IGDB 게임 id 역매핑 (T11 `findGamesBySteamAppIds` — WEB-3 에서 95.3% 실측)
//   2. 그 게임들을 카탈로그에 적재 (온디맨드 — 없으면 매칭할 대상 자체가 없다)
//   3. 남은 건은 제목으로 한 번 더 IGDB 검색·적재 → **스킵 직전에 카탈로그를 채운다**
//      (T43 측정 보고서의 보완 방향 1: "병목은 매칭 규칙이 아니라 카탈로그 커버리지다")
//   4. 엔진(T43)에 넘긴다. appid 가 붙은 건은 ① 로 즉시 확정된다
//
// **왜 청크로 도나**: 수백 건을 한 요청에서 처리하면 (a) Vercel 함수 실행 시간에 걸리고
// (b) 화면이 몇 분간 멈춘 것처럼 보인다. 화면이 50건씩 끊어 부르고 그때마다 진행률을 올린다.

import { findGamesBySteamAppIds, getGamesByIgdbIds, searchGames } from "@/lib/igdb/games";
import { upsertGameWorks, type WorkRow } from "@/lib/catalog/works";
import { searchLocalWorks } from "@/lib/catalog/title-ko";
import { matchAll, type CatalogEntry } from "@/lib/matching/engine";
import { toReviewItems, type ReviewItem, type ReviewSource } from "@/lib/matching/review";
import type { OwnedGame } from "@/lib/steam/client";

/** 화면이 한 번에 보내는 청크 크기. 늘리면 진행률이 뚝뚝 끊긴다 */
export const CHUNK_SIZE = 50;

/**
 * appid 로 못 찾은 건을 제목 검색으로 되살리는 시도의 상한.
 * 검색 1건 = IGDB 요청 1회(4 req/s 제한)라 무제한으로 두면 청크가 하염없이 길어진다.
 * WEB-3 실측상 236건 중 미매칭이 11건이므로 50건 청크에서는 보통 2~3건이다.
 */
const NAME_FALLBACK_LIMIT = 15;

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

/** 같은 작품이 두 경로로 들어와도 카탈로그 목록에 한 번만 남게 한다 */
function mergeEntries(target: Map<string, CatalogEntry>, rows: (WorkRow | null)[]) {
  for (const row of rows) {
    if (row) target.set(row.id, toCatalogEntry(row));
  }
}

export type SteamChunkResult = {
  items: ReviewItem[];
  /** appid 로 IGDB 게임을 찾은 수 — ① 경로가 실제로 얼마나 먹었는지 */
  byAppId: number;
  /** 제목 검색으로 되살린 수 */
  byName: number;
};

/**
 * 보유 게임 한 청크를 매칭해 확인 화면 항목으로 돌려준다.
 */
export async function matchSteamChunk(games: OwnedGame[]): Promise<SteamChunkResult> {
  if (games.length === 0) return { items: [], byAppId: 0, byName: 0 };

  const catalog = new Map<string, CatalogEntry>();

  // 1~2. appid → IGDB → 카탈로그 적재
  const appIdToIgdb = await findGamesBySteamAppIds(games.map((g) => g.appId));
  const igdbIds = [...appIdToIgdb.values()];
  if (igdbIds.length > 0) {
    const candidates = await getGamesByIgdbIds(igdbIds);
    const { works } = await upsertGameWorks(candidates);
    mergeEntries(catalog, works);
  }

  // 3. appid 로 못 찾은 건 — 제목으로 한 번 더 본다.
  //    먼저 자체 카탈로그(공짜), 그래도 없으면 IGDB 검색(요청 발생).
  const leftovers = games.filter((g) => !appIdToIgdb.has(g.appId));
  let byName = 0;

  for (const game of leftovers.slice(0, NAME_FALLBACK_LIMIT)) {
    const local = await searchLocalWorks(game.name, ["game"], 5);
    for (const row of local) catalog.set(row.id, toCatalogEntry(row as WorkRow));
    if (local.length > 0) continue;

    const found = await searchGames(game.name, 3);
    if (found.length === 0) continue;
    const { works } = await upsertGameWorks(found);
    mergeEntries(catalog, works);
    byName += 1;
  }

  // 4. 엔진에 넘긴다. Steam 은 출시 연도를 주지 않으므로 year 는 null 이다 —
  //    엔진은 그때 ② 를 '제목이 유일할 때만', ③ 을 '유사도 85% 이상일 때만' 으로 좁힌다.
  const sources: ReviewSource[] = games.map((g) => ({
    key: `steam-${g.appId}`,
    title: g.name,
    year: null,
    mediaType: "game",
    playtimeMinutes: g.playtimeMinutes,
  }));

  const results = matchAll(
    games.map((g) => ({
      title: g.name,
      year: null,
      mediaType: "game",
      externalIds: { steam_appid: g.appId },
    })),
    [...catalog.values()]
  );

  return {
    items: toReviewItems(sources, results),
    byAppId: appIdToIgdb.size,
    byName,
  };
}
