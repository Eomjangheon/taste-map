// 게임 카탈로그 적재 — T11
//
// 계약(docs/contract.md §1): works 쓰기 소유는 A. 이 단계에서는 source='official' 만 만든다.
// §3.1 동일성 규칙: DLC·리마스터·시즌은 **별개 Work** 이고, parent_work_id 는 UI 그룹핑 전용이다
//   (동일성 판단에 쓰지 않는다 — §3.2 설계 주석).
//
// 중복 방지 방식: external_ids->>'igdb' 로 기존 행을 먼저 조회하고 없는 것만 insert 한다.
// ⚠ 같은 게임을 동시에 두 번 검색하면 이론적으로 경합이 가능하다. 근본 해결은
//   works.external_ids->>'igdb' 유니크 인덱스이며, 스키마 변경이므로 contract.md §5 절차
//   (제안 → 합의 → 문서 갱신 → 마이그레이션 → 사람이 적용)를 거쳐야 한다. T12 도 같은 것이 필요하다.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GameCandidate } from "@/lib/igdb/games";

const COLUMNS = "id, media_type, canonical_title, title_ko, release_year, external_ids, parent_work_id, source";

export type WorkRow = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
  release_year: number | null;
  external_ids: Record<string, unknown>;
  parent_work_id: string | null;
  source: string;
};

type NewWork = Omit<WorkRow, "id">;

function igdbIdOf(row: WorkRow): number | null {
  const value = row.external_ids?.igdb;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function findByIgdbIds(igdbIds: number[]): Promise<Map<number, WorkRow>> {
  const found = new Map<number, WorkRow>();
  if (igdbIds.length === 0) return found;

  const { data, error } = await supabaseAdmin()
    .from("works")
    .select(COLUMNS)
    .in("external_ids->>igdb", igdbIds.map(String));
  if (error) throw new Error(`works 조회 실패: ${error.message}`);

  for (const row of (data ?? []) as WorkRow[]) {
    const id = igdbIdOf(row);
    if (id !== null) found.set(id, row);
  }
  return found;
}

/**
 * steam_appid 로도 한 번 더 대조한다.
 * igdb id 없이 먼저 들어온 행(시드·T19 가져오기 등)을 못 알아보면 같은 게임이 두 행이 된다 —
 * 실제로 마이그레이션 0001 의 Stardew Valley 시드에서 재현됐다.
 */
async function findBySteamAppIds(appIds: number[]): Promise<Map<number, WorkRow>> {
  const found = new Map<number, WorkRow>();
  if (appIds.length === 0) return found;

  const { data, error } = await supabaseAdmin()
    .from("works")
    .select(COLUMNS)
    .eq("media_type", "game")
    .in("external_ids->>steam_appid", appIds.map(String));
  if (error) throw new Error(`works 조회 실패(steam_appid): ${error.message}`);

  for (const row of (data ?? []) as WorkRow[]) {
    const appId = Number(row.external_ids?.steam_appid);
    if (Number.isInteger(appId)) found.set(appId, row);
  }
  return found;
}

function toNewWork(candidate: GameCandidate, parentWorkId: string | null): NewWork {
  const externalIds: Record<string, unknown> = { igdb: candidate.igdbId };
  if (candidate.steamAppId) externalIds.steam_appid = candidate.steamAppId;

  return {
    media_type: "game",
    canonical_title: candidate.title,
    // 한국어 제목은 IGDB 가 신뢰할 수 없다 (§3.3) — 수동 매핑 테이블(T14)이 채운다
    title_ko: null,
    release_year: candidate.releaseYear,
    external_ids: externalIds,
    parent_work_id: parentWorkId,
    source: "official",
  };
}

async function insertWorks(rows: NewWork[]): Promise<WorkRow[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabaseAdmin().from("works").insert(rows).select(COLUMNS);
  if (error) throw new Error(`works 적재 실패: ${error.message}`);
  return (data ?? []) as WorkRow[];
}

/** 기존 행에 정보가 비어 있을 때만 채운다. 이미 있는 값은 덮어쓰지 않는다. */
async function backfill(existing: WorkRow, candidate: GameCandidate): Promise<WorkRow> {
  const patch: Partial<WorkRow> = {};

  if (existing.release_year === null && candidate.releaseYear !== null) {
    patch.release_year = candidate.releaseYear;
  }

  const externalIds = { ...existing.external_ids };
  let idsChanged = false;
  // steam_appid 로 찾은 행에는 igdb id 가 없다 — 다음 검색부터는 igdb 로 바로 붙게 채워준다
  if (!externalIds.igdb) {
    externalIds.igdb = candidate.igdbId;
    idsChanged = true;
  }
  if (candidate.steamAppId && !externalIds.steam_appid) {
    externalIds.steam_appid = candidate.steamAppId;
    idsChanged = true;
  }
  if (idsChanged) patch.external_ids = externalIds;

  if (Object.keys(patch).length === 0) return existing;

  const { data, error } = await supabaseAdmin()
    .from("works")
    .update(patch)
    .eq("id", existing.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`works 갱신 실패: ${error.message}`);
  return data as WorkRow;
}

export type UpsertResult = {
  works: WorkRow[];
  /** 이번 호출에서 새로 만든 Work 수 (부모 포함) */
  created: number;
  /** 이미 있어서 재사용한 Work 수 */
  existing: number;
};

/**
 * 검색 결과를 works 에 적재하고, 검색된 게임에 대응하는 Work 를 검색 순서대로 돌려준다.
 * 부모 작품(DLC·리마스터의 본편)도 함께 적재해 parent_work_id 를 연결한다.
 */
export async function upsertGameWorks(candidates: GameCandidate[]): Promise<UpsertResult> {
  if (candidates.length === 0) return { works: [], created: 0, existing: 0 };

  const parents = new Map<number, GameCandidate["parent"]>();
  for (const c of candidates) {
    if (c.parent && !candidates.some((other) => other.igdbId === c.parent!.igdbId)) {
      parents.set(c.parent.igdbId, c.parent);
    }
  }

  const wanted = [...new Set([...candidates.map((c) => c.igdbId), ...parents.keys()])];
  const known = await findByIgdbIds(wanted);

  // igdb id 로 못 찾은 것은 steam_appid 로 한 번 더 대조한다 (시드·가져오기로 먼저 들어온 행)
  const steamLookup = candidates.filter((c) => c.steamAppId && !known.has(c.igdbId));
  if (steamLookup.length > 0) {
    const bySteam = await findBySteamAppIds(steamLookup.map((c) => c.steamAppId!));
    const claimed = new Set([...known.values()].map((row) => row.id));
    for (const c of steamLookup) {
      const row = bySteam.get(c.steamAppId!);
      // 한 행을 두 후보가 가져가지 않게 한다
      if (row && !claimed.has(row.id)) {
        known.set(c.igdbId, row);
        claimed.add(row.id);
      }
    }
  }

  let created = 0;

  // 1) 부모 먼저 — 자식의 parent_work_id 를 채우려면 id 가 필요하다
  const missingParents = [...parents.values()].filter((p) => p && !known.has(p.igdbId));
  const parentRows = await insertWorks(
    missingParents.map((p) =>
      toNewWork(
        {
          igdbId: p!.igdbId,
          title: p!.title,
          releaseYear: p!.releaseYear,
          gameType: null,
          steamAppId: null,
          coverImageId: null,
          parent: null,
        },
        null
      )
    )
  );
  for (const row of parentRows) {
    const id = igdbIdOf(row);
    if (id !== null) known.set(id, row);
    created += 1;
  }

  // 2) 검색 결과 본체
  const missing = candidates.filter((c) => !known.has(c.igdbId));
  const inserted = await insertWorks(
    missing.map((c) => toNewWork(c, c.parent ? (known.get(c.parent.igdbId)?.id ?? null) : null))
  );
  for (const row of inserted) {
    const id = igdbIdOf(row);
    if (id !== null) known.set(id, row);
    created += 1;
  }

  // 3) 이미 있던 행은 빈 칸만 채운다
  let existing = 0;
  for (const c of candidates) {
    const row = known.get(c.igdbId);
    if (!row) continue;
    if (!missing.some((m) => m.igdbId === c.igdbId)) {
      existing += 1;
      known.set(c.igdbId, await backfill(row, c));
    }
  }

  const works = candidates
    .map((c) => known.get(c.igdbId))
    .filter((row): row is WorkRow => row !== undefined);

  return { works, created, existing };
}

/** 카탈로그 전체 건수 — 중복 생성 여부를 화면에서 바로 확인하기 위한 값 */
export async function countWorks(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("works")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`works 건수 조회 실패: ${error.message}`);
  return count ?? 0;
}
