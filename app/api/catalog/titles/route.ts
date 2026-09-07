// 영화·드라마 카탈로그 온디맨드 조회·적재 — T12
//
// ⚠ 이 엔드포인트의 시그니처는 아직 계약이 아니다. 도메인 간 '작품 조회·검색 API' 는
//   T13 에서 확정하고 docs/contract.md §4 에 기록한다.

import { NextResponse } from "next/server";
import { TmdbError } from "@/lib/tmdb/client";
import { candidatePosterUrl, searchTitles } from "@/lib/tmdb/titles";
import { countWorks, upsertTitleWorks } from "@/lib/catalog/works";

/** 이 경로가 요구하는 환경변수 (.env.example 과 같은 이름) */
const REQUIRED_ENV = ["TMDB_READ_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

// Next 16 에서 Route Handler 는 기본적으로 캐시되지 않는다 — 캐싱은 옵트인이므로 별도 설정을 하지 않는다.

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다" }, { status: 400 });
  }

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `환경변수가 비어 있습니다: ${missing.join(", ")} — .env.local 에 채우고 서버를 재시작하세요 (docs/tmdb.md)`,
        missingEnv: missing,
      },
      { status: 503 }
    );
  }

  try {
    const candidates = await searchTitles(query);

    // 빈 결과를 명시적으로 다룬다 — "에러 안 났으니 성공"은 성립하지 않는다
    if (candidates.length === 0) {
      return NextResponse.json({
        query,
        results: [],
        created: 0,
        existing: 0,
        totalWorks: await countWorks(),
        note: "TMDB 검색 결과가 0건입니다. 제목 철자를 확인하세요.",
      });
    }

    const { works, created, existing } = await upsertTitleWorks(candidates);

    // works 는 candidates 와 같은 길이·순서다 (적재 실패 자리는 null)
    const pairs = works
      .map((work, i) => ({ work, candidate: candidates[i] }))
      .filter((p): p is { work: NonNullable<typeof p.work>; candidate: (typeof candidates)[number] } =>
        p.work !== null
      );

    return NextResponse.json({
      query,
      results: pairs.map(({ work, candidate }) => {
        return {
          id: work.id,
          canonicalTitle: work.canonical_title,
          titleKo: work.title_ko,
          releaseYear: work.release_year,
          mediaType: work.media_type,
          kind: candidate.kind,
          externalIds: work.external_ids,
          parentWorkId: work.parent_work_id,
          // 포스터는 저장하지 않고 조회 시점에 조립한다 (docs/tmdb.md)
          posterUrl: candidatePosterUrl(candidate),
        };
      }),
      created,
      existing,
      totalWorks: await countWorks(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof TmdbError ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
