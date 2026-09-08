// CSV 가져오기 매칭 — T20 (청크 단위)
//
//   POST /api/import/csv/match  { "rows": [{ key, title, year, ... }, ...] }
//
// **파일은 서버로 올리지 않는다.** 파싱은 브라우저에서 끝내고 필요한 열만 보낸다 —
// 유저의 감상 기록 전체를 서버 로그에 흘리지 않기 위해서다.
// 매칭은 청크로 돈다(§T19 와 같은 이유: 함수 실행 시간 + 진행률).

import { NextResponse } from "next/server";
import { TmdbError } from "@/lib/tmdb/client";
import { CSV_CHUNK_SIZE, matchCsvChunk } from "@/lib/import/match-csv";
import type { CsvRow } from "@/lib/import/csv";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "TMDB_READ_TOKEN"];

/** 신뢰할 수 없는 입력이므로 필요한 필드만 좁혀서 받는다 */
function parseRows(raw: unknown): CsvRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: CsvRow[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { key, title, year } = item as Record<string, unknown>;
    if (typeof key !== "string" || typeof title !== "string" || title.trim() === "") return null;
    rows.push({
      key: key.slice(0, 64),
      title: title.slice(0, 300),
      year: typeof year === "number" && Number.isInteger(year) ? year : null,
      mediaType: "movie",
      // 매칭에 쓰지 않는 값(별점·감상일)은 서버로 보내지 않는다 — 화면이 들고 있다가 저장할 때 쓴다
      rating: null,
      consumedAt: null,
      rewatch: false,
    });
  }
  return rows;
}

export async function POST(request: Request) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `환경변수가 비어 있습니다: ${missing.join(", ")}`, missingEnv: missing },
      { status: 503 }
    );
  }

  let body: { rows?: unknown };
  try {
    body = (await request.json()) as { rows?: unknown };
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다" }, { status: 400 });
  }

  const rows = parseRows(body.rows);
  if (!rows) {
    return NextResponse.json(
      { error: "rows 는 { key, title, year } 배열이어야 합니다" },
      { status: 400 }
    );
  }
  if (rows.length > CSV_CHUNK_SIZE) {
    return NextResponse.json(
      { error: `한 번에 ${CSV_CHUNK_SIZE}행까지 보낼 수 있습니다 (받은 행: ${rows.length})` },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await matchCsvChunk(rows));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: error instanceof TmdbError ? 502 : 500 });
  }
}
