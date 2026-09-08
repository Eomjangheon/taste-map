// 한국어 제목 수동 보정 — T14
//
// 표본 조사(docs/t14-title-ko-survey.md) 결론:
//   · TMDB(영화·드라마)는 결손 0%. 표기가 지저분한 예외만 보정하면 된다.
//   · IGDB(게임)는 대형작 60%·인디 90% 결손이고, 있는 값조차 유저 투고 별칭(사펑·젤다 야숨)이라
//     쓸 수 없다. **게임에 한국어 제목을 붙이는 경로는 이 보정이 유일하다.**
//
// 방식: 별도 테이블을 만들지 않고 `works.title_ko` 를 직접 채운다(스키마 변경 없음).
// 외부 ID ↔ 한국어 제목 대응은 works 행 자체(`external_ids` + `title_ko`)가 이미 갖고 있다.
//
// ⚠ 카탈로그 재적재가 이 값을 덮지 않아야 한다. `upsertWorks` 의 backfill 은
//   **비어 있을 때만** 채우므로 운영자가 넣은 값은 보존된다 (lib/catalog/works.ts).

import { supabaseAdmin } from "@/lib/supabase-admin";

const COLUMNS =
  "id, media_type, canonical_title, title_ko, release_year, external_ids, parent_work_id, source";

export type CatalogWork = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
  release_year: number | null;
  external_ids: Record<string, unknown>;
  parent_work_id: string | null;
  source: string;
};

/** 한국어 제목이 비어 있는 작품 — 운영자 화면의 작업 목록 */
export async function listMissingTitleKo(
  mediaType?: string,
  limit = 50
): Promise<CatalogWork[]> {
  let q = supabaseAdmin()
    .from("works")
    .select(COLUMNS)
    .is("title_ko", null)
    .order("canonical_title")
    .limit(limit);
  if (mediaType) q = q.eq("media_type", mediaType);

  const { data, error } = await q;
  if (error) throw new Error(`결손 목록 조회 실패: ${error.message}`);
  return (data ?? []) as CatalogWork[];
}

/** 한국어 제목 등록·수정. 빈 문자열이면 지운다(잘못 넣었을 때 되돌리는 경로) */
export async function setTitleKo(workId: string, titleKo: string): Promise<CatalogWork> {
  const value = titleKo.trim();
  const { data, error } = await supabaseAdmin()
    .from("works")
    .update({ title_ko: value === "" ? null : value })
    .eq("id", workId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`한국어 제목 저장 실패: ${error.message}`);
  return data as CatalogWork;
}

/** PostgREST `or` 필터에서 값을 끊어먹는 문자를 막는다 */
function escapeFilterValue(term: string) {
  return term.split(/[,()]/).join(" ").split("\\").join(" ").trim();
}

/**
 * 자체 카탈로그를 제목으로 먼저 조회한다 (원제·한국어 제목 양쪽).
 *
 * 이게 T14 완료 조건의 핵심이다 — 한국어 제목을 등록하면 **그 한국어로 검색해도 찾아져야** 한다.
 * 외부 API 는 한국어 질의를 이해하지 못한다(IGDB 는 특히). 등록한 값은 우리 DB 에만 있다.
 *
 * 매칭 엔진(T18·T43)의 한/영 교차 대조도 결국 이 조회를 쓴다.
 */
export async function searchLocalWorks(
  term: string,
  mediaTypes?: string[],
  limit = 10
): Promise<CatalogWork[]> {
  const value = escapeFilterValue(term);
  if (!value) return [];

  let q = supabaseAdmin()
    .from("works")
    .select(COLUMNS)
    .or(`canonical_title.ilike.%${value}%,title_ko.ilike.%${value}%`)
    .limit(limit);
  if (mediaTypes?.length) q = q.in("media_type", mediaTypes);

  const { data, error } = await q;
  if (error) throw new Error(`자체 카탈로그 조회 실패: ${error.message}`);
  return (data ?? []) as CatalogWork[];
}
