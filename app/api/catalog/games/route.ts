// 게임 카탈로그 온디맨드 조회·적재 — T11
//
// ⚠ 이 엔드포인트의 시그니처는 아직 계약이 아니다. 도메인 간 '작품 조회·검색 API' 는
//   T13 에서 확정하고 docs/contract.md §4 에 기록한다 (그전까지 B 는 시드로 개발한다).
//   여기서는 T11 완료 조건을 화면에서 확인하기 위한 A 트랙 내부 경로로만 쓴다.

import { NextResponse } from "next/server";
import { IgdbError } from "@/lib/igdb/client";
import { coverUrl, searchGames } from "@/lib/igdb/games";
import { countWorks, upsertGameWorks } from "@/lib/catalog/works";
import { searchLocalWorks } from "@/lib/catalog/title-ko";

/** 이 경로가 요구하는 환경변수 (.env.example 과 같은 이름) */
const REQUIRED_ENV = [
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const;

// Next 16 에서 Route Handler 는 기본적으로 캐시되지 않는다 (node_modules/next/dist/docs 15-route-handlers).
// 캐싱은 옵트인이므로 여기서 별도 설정을 하지 않는다 — 13/14 시절 암묵 캐싱 가정 금지 (AGENTS.md).

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다" }, { status: 400 });
  }

  // 어떤 변수가 비었는지 이름으로 짚어준다 — 뭉뚱그리면 엉뚱한 키를 의심하게 된다.
  // 값은 절대 응답에 싣지 않는다 (이름과 존재 여부만).
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `환경변수가 비어 있습니다: ${missing.join(", ")} — .env.local 에 채우고 서버를 재시작하세요 (docs/igdb.md)`,
        missingEnv: missing,
      },
      { status: 503 }
    );
  }

  try {
    // 자체 카탈로그 우선 조회 — T14 로 등록한 한국어 제목은 우리 DB 에만 있다.
    // IGDB 는 한국어 질의를 이해하지 못하므로 이 단계가 없으면 등록해도 검색되지 않는다.
    const local = await searchLocalWorks(query, ["game"]);

    const candidates = await searchGames(query);

    // 빈 결과를 명시적으로 다룬다 — "에러 안 났으니 성공"은 성립하지 않는다 (T3 §3 조용한 실패).
    if (candidates.length === 0) {
      return NextResponse.json({
        query,
        results: local.map((work) => ({
          id: work.id,
          canonicalTitle: work.canonical_title,
          titleKo: work.title_ko,
          releaseYear: work.release_year,
          mediaType: work.media_type,
          igdbId: work.external_ids?.igdb ?? null,
          steamAppId: work.external_ids?.steam_appid ?? null,
          parentWorkId: work.parent_work_id,
          gameType: null,
          coverUrl: null,
          fromCatalog: true,
        })),
        created: 0,
        existing: 0,
        totalWorks: await countWorks(),
        note:
          local.length > 0
            ? "IGDB 검색은 0건이지만 자체 카탈로그에서 찾았습니다 (한국어 제목 등록분)."
            : "IGDB 검색 결과가 0건입니다. 제목 철자 또는 IGDB 스키마 변경(필드 소실)을 의심하세요.",
      });
    }

    const { works, created, existing } = await upsertGameWorks(candidates);

    // works 는 candidates 와 같은 길이·순서다 (적재 실패 자리는 null)
    const pairs = works
      .map((work, i) => ({ work, candidate: candidates[i] }))
      .filter((p): p is { work: NonNullable<typeof p.work>; candidate: (typeof candidates)[number] } =>
        p.work !== null
      );

    const fromIgdb = pairs.map(({ work, candidate }) => {
      return {
          id: work.id,
          canonicalTitle: work.canonical_title,
          titleKo: work.title_ko,
          releaseYear: work.release_year,
          mediaType: work.media_type,
          igdbId: work.external_ids?.igdb ?? null,
          steamAppId: work.external_ids?.steam_appid ?? null,
          parentWorkId: work.parent_work_id,
          gameType: candidate.gameType ?? null,
          // 커버는 저장하지 않고 조회 시점에 조립한다 (docs/igdb.md)
        coverUrl: candidate.coverImageId ? coverUrl(candidate.coverImageId) : null,
        fromCatalog: false,
      };
    });

    // 외부 결과에 이미 있는 작품은 빼고, 자체 카탈로그에서만 나온 것을 앞에 붙인다
    const seen = new Set(fromIgdb.map((r) => r.id));
    const localOnly = local
      .filter((work) => !seen.has(work.id))
      .map((work) => ({
        id: work.id,
        canonicalTitle: work.canonical_title,
        titleKo: work.title_ko,
        releaseYear: work.release_year,
        mediaType: work.media_type,
        igdbId: work.external_ids?.igdb ?? null,
        steamAppId: work.external_ids?.steam_appid ?? null,
        parentWorkId: work.parent_work_id,
        gameType: null,
        coverUrl: null,
        fromCatalog: true,
      }));

    return NextResponse.json({
      query,
      results: [...localOnly, ...fromIgdb],
      created,
      existing,
      totalWorks: await countWorks(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof IgdbError ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
