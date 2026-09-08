// 카탈로그 적재 — T11(IGDB) · T12(TMDB) 공용
//
// 계약(docs/contract.md §1): works 쓰기 소유는 A. 이 단계에서는 source='official' 만 만든다.
// §3.1 동일성 규칙: DLC·리마스터·**시즌**은 별개 Work 이고, parent_work_id 는 UI 그룹핑 전용이다
//   (동일성 판단에 쓰지 않는다 — §3.2 설계 주석).
//
// 중복 방지: 후보마다 지정한 external_ids 키들로 기존 행을 먼저 찾고 없는 것만 insert 한다.
// ⚠ 대조는 반드시 **media_type 과 함께** 한다. TMDB 의 movie id 와 tv id 는 네임스페이스가 달라
//   같은 숫자가 영화에도 드라마에도 존재한다.
// ⚠ 동시 요청 경합은 막지 못한다. 근본 해결은 external_ids 키별 유니크 인덱스이며,
//   스키마 변경이므로 contract.md §5 절차(제안 → 합의 → 문서 갱신 → 마이그레이션 → 사람이 적용)를 거쳐야 한다.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GameCandidate } from "@/lib/igdb/games";
import type { TitleCandidate } from "@/lib/tmdb/titles";

const COLUMNS =
  "id, media_type, canonical_title, title_ko, release_year, external_ids, parent_work_id, source";

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

/** 적재 직전의 매체 중립 후보 1건 */
export type WorkCandidate = {
  mediaType: "game" | "movie" | "tv" | "book" | "custom";
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  externalIds: Record<string, string | number>;
  /** 기존 행을 찾을 때 대조할 external_ids 키. 앞에 있는 키가 우선한다 */
  matchKeys: string[];
  /** §3.1 상 별개 Work 이지만 UI 그룹핑용으로 연결할 상위 작품 */
  parent: WorkCandidate | null;
};

type NewWork = Omit<WorkRow, "id">;

// ------------------------------------------------------------------ 조회
/**
 * (media_type, external_ids 키) 조합별로 묶어서 조회한다.
 * 후보 객체 자체를 Map 키로 써서 어떤 키로 매칭됐든 후보 ↔ 행을 이어준다.
 */
async function findExisting(candidates: WorkCandidate[]): Promise<Map<WorkCandidate, WorkRow>> {
  const found = new Map<WorkCandidate, WorkRow>();
  if (candidates.length === 0) return found;

  // { "media|key" : Map<값, 후보[]> }
  const groups = new Map<string, Map<string, WorkCandidate[]>>();
  for (const c of candidates) {
    for (const key of c.matchKeys) {
      const value = c.externalIds[key];
      if (value === undefined || value === null) continue;
      const group = `${c.mediaType}|${key}`;
      if (!groups.has(group)) groups.set(group, new Map());
      const byValue = groups.get(group)!;
      const v = String(value);
      byValue.set(v, [...(byValue.get(v) ?? []), c]);
    }
  }

  const claimed = new Set<string>();
  for (const [group, byValue] of groups) {
    const [mediaType, key] = group.split("|");
    const { data, error } = await supabaseAdmin()
      .from("works")
      .select(COLUMNS)
      .eq("media_type", mediaType)
      .in(`external_ids->>${key}`, [...byValue.keys()]);
    if (error) throw new Error(`works 조회 실패(${group}): ${error.message}`);

    for (const row of (data ?? []) as WorkRow[]) {
      const value = String(row.external_ids?.[key] ?? "");
      for (const c of byValue.get(value) ?? []) {
        // 이미 앞선 키로 찾은 후보는 건너뛰고, 한 행을 두 후보가 가져가지도 않게 한다
        if (found.has(c) || claimed.has(row.id)) continue;
        found.set(c, row);
        claimed.add(row.id);
      }
    }
  }
  return found;
}

// ------------------------------------------------------------------ 쓰기
function toNewWork(c: WorkCandidate, parentWorkId: string | null): NewWork {
  return {
    media_type: c.mediaType,
    canonical_title: c.canonicalTitle,
    title_ko: c.titleKo,
    release_year: c.releaseYear,
    external_ids: { ...c.externalIds },
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

/** 기존 행에 비어 있는 것만 채운다. 이미 있는 값은 덮어쓰지 않는다. */
async function backfill(existing: WorkRow, c: WorkCandidate): Promise<WorkRow> {
  const patch: Partial<WorkRow> = {};

  if (existing.release_year === null && c.releaseYear !== null) patch.release_year = c.releaseYear;
  if (!existing.title_ko && c.titleKo) patch.title_ko = c.titleKo;

  // 다른 키로 찾아낸 행에는 이번 소스의 id 가 없다 — 채워두면 다음부터 바로 붙는다
  const externalIds = { ...existing.external_ids };
  let idsChanged = false;
  for (const [key, value] of Object.entries(c.externalIds)) {
    if (externalIds[key] === undefined || externalIds[key] === null) {
      externalIds[key] = value;
      idsChanged = true;
    }
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
  /** 후보와 **같은 길이·같은 순서**. 적재에 실패한 자리는 null 이다 */
  works: (WorkRow | null)[];
  /** 이번 호출에서 새로 만든 수 (부모 포함) */
  created: number;
  /** 이미 있어서 재사용한 수 (후보 기준) */
  existing: number;
};

/** insert 가 돌려준 행을 후보와 짝짓는다. DB 가 넣은 순서대로 준다는 보장이 없으므로 외부 id 로 맞춘다 */
function attachRows(
  candidates: WorkCandidate[],
  rows: WorkRow[],
  known: Map<WorkCandidate, WorkRow>
) {
  for (const c of candidates) {
    const row = rows.find((r) =>
      c.matchKeys.some(
        (k) =>
          c.externalIds[k] !== undefined &&
          r.external_ids?.[k] !== undefined &&
          String(r.external_ids[k]) === String(c.externalIds[k])
      )
    );
    if (row) known.set(c, row);
  }
}

/**
 * 후보를 works 에 적재하고 후보 순서대로 행을 돌려준다.
 * 부모 작품(DLC 의 본편, 시즌의 시리즈)도 함께 적재해 parent_work_id 를 연결한다.
 */
export async function upsertWorks(candidates: WorkCandidate[]): Promise<UpsertResult> {
  if (candidates.length === 0) return { works: [], created: 0, existing: 0 };

  // 후보와 같은 대조 경로를 타도록 부모도 후보 목록에 넣는다.
  // 한쪽만 대조하면 다른 소스 id 로 이미 들어와 있던 부모 행을 못 알아보고 중복이 생긴다 (T11 에서 겪음).
  const sameWork = (a: WorkCandidate, b: WorkCandidate) =>
    a.mediaType === b.mediaType &&
    a.matchKeys.some((k) => b.externalIds[k] !== undefined && a.externalIds[k] === b.externalIds[k]);

  const parentCandidates: WorkCandidate[] = [];
  for (const c of candidates) {
    const p = c.parent;
    if (!p) continue;
    if (candidates.some((other) => sameWork(p, other))) continue;
    if (parentCandidates.some((other) => sameWork(p, other))) continue;
    parentCandidates.push(p);
  }

  const all = [...parentCandidates, ...candidates];
  const known = await findExisting(all);
  let created = 0;

  // 1) 부모 먼저 — 자식의 parent_work_id 를 채우려면 id 가 필요하다
  const missingParents = parentCandidates.filter((p) => !known.has(p));
  const parentRows = await insertWorks(missingParents.map((p) => toNewWork(p, null)));
  attachRows(missingParents, parentRows, known);
  created += parentRows.length;

  // 부모가 검색 결과 안에 있었던 경우도 연결할 수 있게, 부모 후보 → 행 조회를 한 번에 푼다
  const parentRowOf = (p: WorkCandidate): string | null => {
    const direct = known.get(p);
    if (direct) return direct.id;
    const twin = all.find((c) => c !== p && sameWork(p, c) && known.has(c));
    return twin ? known.get(twin)!.id : null;
  };

  // 2) 후보 본체
  const missing = candidates.filter((c) => !known.has(c));
  const rows = await insertWorks(
    missing.map((c) => toNewWork(c, c.parent ? parentRowOf(c.parent) : null))
  );
  attachRows(missing, rows, known);
  created += rows.length;

  // 3) 이미 있던 행은 빈 칸만 채운다 (부모 행 포함)
  let existing = 0;
  for (const c of all) {
    const row = known.get(c);
    if (!row) continue;
    if (missing.includes(c) || missingParents.includes(c)) continue;
    if (candidates.includes(c)) existing += 1;
    known.set(c, await backfill(row, c));
  }

  return {
    works: candidates.map((c) => known.get(c) ?? null),
    created,
    existing,
  };
}

// ------------------------------------------------------- IGDB 어댑터 (T11)
/** GameCandidate → WorkCandidate. igdb id 와 steam_appid 양쪽으로 대조한다 */
function fromGame(c: GameCandidate): WorkCandidate {
  const externalIds: Record<string, string | number> = { igdb: c.igdbId };
  if (c.steamAppId) externalIds.steam_appid = c.steamAppId;
  return {
    mediaType: "game",
    canonicalTitle: c.title,
    // 한국어 제목은 IGDB 가 신뢰할 수 없다 (§3.3) — 수동 매핑 테이블(T14)이 채운다
    titleKo: null,
    releaseYear: c.releaseYear,
    externalIds,
    matchKeys: ["igdb", "steam_appid"],
    parent: c.parent
      ? {
          mediaType: "game",
          canonicalTitle: c.parent.title,
          titleKo: null,
          releaseYear: c.parent.releaseYear,
          externalIds: c.parent.steamAppId
            ? { igdb: c.parent.igdbId, steam_appid: c.parent.steamAppId }
            : { igdb: c.parent.igdbId },
          matchKeys: ["igdb", "steam_appid"],
          parent: null,
        }
      : null,
  };
}

export async function upsertGameWorks(candidates: GameCandidate[]): Promise<UpsertResult> {
  return upsertWorks(candidates.map(fromGame));
}

// ------------------------------------------------------- TMDB 어댑터 (T12)
/**
 * TitleCandidate → WorkCandidate.
 * 시즌은 `tmdb_season_id` 로만 대조한다. 시리즈 id(`tmdb`)로 대조하면
 * 같은 시리즈의 시즌 행들이 서로를 같은 작품으로 물어버린다.
 */
function fromTitle(c: TitleCandidate): WorkCandidate {
  return {
    mediaType: c.mediaType,
    canonicalTitle: c.canonicalTitle,
    titleKo: c.titleKo,
    releaseYear: c.releaseYear,
    externalIds: c.externalIds,
    matchKeys: c.kind === "tv-season" ? ["tmdb_season_id"] : ["tmdb"],
    parent: c.parent ? fromTitle(c.parent) : null,
  };
}

export async function upsertTitleWorks(candidates: TitleCandidate[]): Promise<UpsertResult> {
  return upsertWorks(candidates.map(fromTitle));
}

/** 카탈로그 전체 건수 — 중복 생성 여부를 화면에서 바로 확인하기 위한 값 */
export async function countWorks(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("works")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`works 건수 조회 실패: ${error.message}`);
  return count ?? 0;
}
