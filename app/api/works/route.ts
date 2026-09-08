// 작품 조회·검색 API — T13
//
// **이 시그니처가 도메인 간 계약이다** (docs/contract.md §4).
// B(기록·수집)는 works 를 직접 읽지 말고 이 경로로만 조회한다.
// 변경은 contract.md §5 절차(제안 → 합의 → 문서 갱신)를 거친다.
//
//   GET /api/works?q=<검색어>&media=<all|game|movie|tv>&limit=<1..50>
//
// 자체 카탈로그를 먼저 보고, 비어 있을 때만 외부 API(IGDB·TMDB)로 나가 적재한 뒤 돌려준다.

import { NextResponse } from "next/server";
import { searchWorks, type MediaFilter } from "@/lib/catalog/search";
import { IgdbError } from "@/lib/igdb/client";
import { TmdbError } from "@/lib/tmdb/client";

const MEDIA: MediaFilter[] = ["all", "game", "movie", "tv"];

/** 매체에 따라 필요한 환경변수가 다르다 — 게임만 검색할 때 TMDB 키를 요구하지 않는다 */
function missingEnvFor(media: MediaFilter): string[] {
  const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  if (media === "all" || media === "game") need.push("TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET");
  if (media === "all" || media === "movie" || media === "tv") need.push("TMDB_READ_TOKEN");
  return need.filter((name) => !process.env[name]);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const mediaParam = (params.get("media") ?? "all") as MediaFilter;
  const limitParam = Number(params.get("limit") ?? 20);

  if (!query) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다" }, { status: 400 });
  }
  if (!MEDIA.includes(mediaParam)) {
    return NextResponse.json(
      { error: `media 는 ${MEDIA.join(" | ")} 중 하나여야 합니다` },
      { status: 400 }
    );
  }
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;

  const missing = missingEnvFor(mediaParam);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `환경변수가 비어 있습니다: ${missing.join(", ")}`,
        missingEnv: missing,
      },
      { status: 503 }
    );
  }

  try {
    return NextResponse.json(await searchWorks(query, mediaParam, limit));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof IgdbError || error instanceof TmdbError ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
