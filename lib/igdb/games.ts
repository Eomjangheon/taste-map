// IGDB 게임 조회 — T11
// 검색 결과와 steam_appid 역방향 조회를 Work 후보로 정규화한다.
// Work 로의 적재(중복 방지 포함)는 lib/catalog/works.ts 가 담당한다.

import { STEAM_SOURCE_ID, igdbQuery, igdbQueryWithFallback } from "./client";

/** 커버 이미지 URL 규칙 (docs/igdb.md) — 저장하지 않고 조회 시점에 조립한다 */
const IMAGE_BASE = "https://images.igdb.com/igdb/image/upload";
export function coverUrl(imageId: string, size: "t_cover_small" | "t_cover_big" = "t_cover_big") {
  return `${IMAGE_BASE}/${size}/${imageId}.jpg`;
}

/**
 * IGDB game_type. 과거에는 `category` 숫자였고 현재는 `game_types` 참조로 옮겨가는 중이라
 * 숫자와 객체({ id, type }) 두 형태가 모두 올 수 있다 (T3 §4 의 필드 이관과 같은 맥락).
 */
const GAME_TYPE_NAMES: Record<number, string> = {
  0: "main_game",
  1: "dlc_addon",
  2: "expansion",
  3: "bundle",
  4: "standalone_expansion",
  5: "mod",
  6: "episode",
  7: "season",
  8: "remake",
  9: "remaster",
  10: "expanded_game",
  11: "port",
  12: "fork",
  13: "pack",
  14: "update",
};

type IgdbGameType = number | { id?: number; type?: string } | null;

type IgdbGame = {
  id: number;
  name?: string;
  first_release_date?: number;
  game_type?: IgdbGameType;
  parent_game?: number | { id: number; name?: string; first_release_date?: number } | null;
  cover?: { image_id?: string } | null;
  external_games?: Array<{ uid?: string; external_game_source?: number }> | null;
};

/** Work 로 적재하기 직전의 정규화된 게임 1건 */
export type GameCandidate = {
  igdbId: number;
  title: string;
  releaseYear: number | null;
  gameType: string | null;
  steamAppId: number | null;
  coverImageId: string | null;
  /**
   * §3.1 상 별개 Work 이지만 UI 그룹핑용으로 상위 작품을 연결한다.
   * steamAppId 는 부모를 새로 만들기 전 기존 행과 대조하는 데 쓴다 —
   * 없으면 시드처럼 steam_appid 만 있는 부모 행을 못 알아보고 중복을 만든다.
   */
  parent: {
    igdbId: number;
    title: string;
    releaseYear: number | null;
    steamAppId: number | null;
  } | null;
};

function releaseYear(unixSeconds?: number): number | null {
  if (!unixSeconds) return null;
  const year = new Date(unixSeconds * 1000).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

function gameTypeName(value: IgdbGameType): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return GAME_TYPE_NAMES[value] ?? String(value);
  if (typeof value.type === "string") return value.type;
  if (typeof value.id === "number") return GAME_TYPE_NAMES[value.id] ?? String(value.id);
  return null;
}

/**
 * uid 는 소스 간 공유되므로 external_game_source 필터가 필수다 (T3 §4).
 * 확장 응답에는 소스 필드가 없을 수도 있어, 그 경우 steam_appid 를 비운다 — 틀린 값보다 없는 값이 낫다.
 */
function steamAppId(game: IgdbGame): number | null {
  const rows = game.external_games ?? [];
  for (const row of rows) {
    if (row.external_game_source !== STEAM_SOURCE_ID) continue;
    const parsed = Number(row.uid);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function toCandidate(game: IgdbGame): GameCandidate | null {
  if (!game.id || !game.name) return null;

  const parentRaw = game.parent_game;
  let parent: GameCandidate["parent"] = null;
  if (parentRaw && typeof parentRaw === "object" && parentRaw.id && parentRaw.id !== game.id) {
    // 자기 자신이 부모로 잡히는 케이스가 실재한다 (T3: The Stanley Parable) — 무시한다
    parent = {
      igdbId: parentRaw.id,
      title: parentRaw.name ?? `IGDB ${parentRaw.id}`,
      releaseYear: releaseYear(parentRaw.first_release_date),
      steamAppId: null, // enrichParents 가 채운다 (중첩 확장으로는 못 가져온다)
    };
  }

  return {
    igdbId: game.id,
    title: game.name,
    releaseYear: releaseYear(game.first_release_date),
    gameType: gameTypeName(game.game_type ?? null),
    steamAppId: steamAppId(game),
    coverImageId: game.cover?.image_id ?? null,
    parent,
  };
}

/** APICalypse 문자열 리터럴 이스케이프 */
function escapeSearch(term: string) {
  return term.split("\\").join("\\\\").split('"').join('\\"');
}

/**
 * 제목으로 IGDB 검색. 필드 조합을 풍부한 것부터 시도한다 —
 * 사라진 필드를 쓴 쿼리는 에러 대신 조용히 0건을 주기 때문이다 (T3 §3-3).
 */
export async function searchGames(term: string, limit = 10): Promise<GameCandidate[]> {
  const q = escapeSearch(term.trim());
  if (!q) return [];

  const common = `search "${q}"; limit ${limit};`;
  const bodies = [
    `fields id,name,first_release_date,game_type,parent_game.id,parent_game.name,parent_game.first_release_date,cover.image_id,external_games.uid,external_games.external_game_source; ${common}`,
    `fields id,name,first_release_date,game_type,parent_game.id,parent_game.name,cover.image_id; ${common}`,
    `fields id,name,first_release_date,cover.image_id; ${common}`,
  ];

  const { rows } = await igdbQueryWithFallback<IgdbGame>("games", bodies);
  const candidates = rows.map(toCandidate).filter((c): c is GameCandidate => c !== null);
  return enrichParents(candidates);
}

/**
 * 검색 결과에 없는 부모 작품의 steam_appid 를 따로 조회해 채운다.
 * parent_game 중첩 확장으로는 부모의 external_games 까지 가져올 수 없어서, id 로 한 번 더 묻는다.
 * 이게 없으면 steam_appid 만 있는 기존 부모 행(시드 등)을 못 알아보고 부모를 중복 생성한다.
 */
async function enrichParents(candidates: GameCandidate[]): Promise<GameCandidate[]> {
  const ownIds = new Set(candidates.map((c) => c.igdbId));
  const parentIds = [
    ...new Set(
      candidates
        .map((c) => c.parent?.igdbId)
        .filter((id): id is number => typeof id === "number" && !ownIds.has(id))
    ),
  ];
  if (parentIds.length === 0) return candidates;

  const rows = await igdbQuery<IgdbGame>(
    "games",
    `fields id,external_games.uid,external_games.external_game_source; where id = (${parentIds.join(",")}); limit ${parentIds.length};`
  );
  const appIdByGame = new Map(rows.map((row) => [row.id, steamAppId(row)]));

  return candidates.map((c) =>
    c.parent ? { ...c, parent: { ...c.parent, steamAppId: appIdByGame.get(c.parent.igdbId) ?? null } } : c
  );
}

/**
 * steam_appid → IGDB 게임 역방향 조회 (T19 가져오기가 소비한다).
 * 소스 필터 없이 uid 만 쓰면 다른 스토어의 게임이 조용히 붙는다 (T3 §4).
 * 4 req/s 제한은 client.ts 가 처리하므로 여기서는 200개씩 묶기만 한다.
 */
export async function findGamesBySteamAppIds(appIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const unique = [...new Set(appIds.filter((id) => Number.isInteger(id) && id > 0))];

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const list = chunk.map((id) => `"${id}"`).join(",");
    const rows = await igdbQuery<{ uid?: string; game?: number | { id: number } }>(
      "external_games",
      `fields uid,game; where external_game_source = ${STEAM_SOURCE_ID} & uid = (${list}); limit 500;`
    );
    for (const row of rows) {
      const appId = Number(row.uid);
      const gameId = typeof row.game === "object" ? row.game?.id : row.game;
      if (Number.isInteger(appId) && typeof gameId === "number") result.set(appId, gameId);
    }
  }
  return result;
}

/**
 * IGDB 게임 id → 적재 가능한 후보 (T19 가져오기가 `findGamesBySteamAppIds` 다음에 쓴다).
 *
 * `searchGames` 와 같은 필드 조합·같은 폴백을 쓴다 — 사라진 필드를 쓴 쿼리는 에러 대신
 * 조용히 0건을 주기 때문이다 (T3 §3-3). 검색이 아니라 id 조회라는 점만 다르다.
 */
export async function getGamesByIgdbIds(igdbIds: number[]): Promise<GameCandidate[]> {
  const unique = [...new Set(igdbIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return [];

  const candidates: GameCandidate[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const common = `where id = (${chunk.join(",")}); limit ${chunk.length};`;
    const { rows } = await igdbQueryWithFallback<IgdbGame>("games", [
      `fields id,name,first_release_date,game_type,parent_game.id,parent_game.name,parent_game.first_release_date,cover.image_id,external_games.uid,external_games.external_game_source; ${common}`,
      `fields id,name,first_release_date,game_type,parent_game.id,parent_game.name,cover.image_id; ${common}`,
      `fields id,name,first_release_date,cover.image_id; ${common}`,
    ]);
    candidates.push(...rows.map(toCandidate).filter((c): c is GameCandidate => c !== null));
  }
  return enrichParents(candidates);
}
