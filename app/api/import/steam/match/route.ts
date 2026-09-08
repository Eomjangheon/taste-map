// Steam 가져오기 매칭 — T19 (가져오기 2단계, 청크 단위)
//
//   POST /api/import/steam/match  { "games": [{ appId, name, playtimeMinutes }, ...] }
//
// 화면이 라이브러리를 50건씩 끊어 보내고, 응답이 올 때마다 진행률을 올린다.
// 한 요청에서 수백 건을 돌리면 함수 실행 시간에 걸리고 화면도 멈춘 것처럼 보인다.

import { NextResponse } from "next/server";
import { IgdbError } from "@/lib/igdb/client";
import { CHUNK_SIZE, matchSteamChunk } from "@/lib/steam/import";
import type { OwnedGame } from "@/lib/steam/client";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"];

/** 신뢰할 수 없는 입력이므로 필요한 필드만 좁혀서 받는다 */
function parseGames(raw: unknown): OwnedGame[] | null {
  if (!Array.isArray(raw)) return null;
  const games: OwnedGame[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { appId, name, playtimeMinutes } = item as Record<string, unknown>;
    if (!Number.isInteger(appId) || (appId as number) <= 0) return null;
    if (typeof name !== "string") return null;
    games.push({
      appId: appId as number,
      name: name.slice(0, 300),
      playtimeMinutes:
        typeof playtimeMinutes === "number" && Number.isFinite(playtimeMinutes)
          ? Math.max(0, Math.round(playtimeMinutes))
          : 0,
    });
  }
  return games;
}

export async function POST(request: Request) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `환경변수가 비어 있습니다: ${missing.join(", ")}`, missingEnv: missing },
      { status: 503 }
    );
  }

  let body: { games?: unknown };
  try {
    body = (await request.json()) as { games?: unknown };
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다" }, { status: 400 });
  }

  const games = parseGames(body.games);
  if (!games) {
    return NextResponse.json(
      { error: "games 는 { appId, name, playtimeMinutes } 배열이어야 합니다" },
      { status: 400 }
    );
  }
  if (games.length > CHUNK_SIZE) {
    return NextResponse.json(
      { error: `한 번에 ${CHUNK_SIZE}건까지 보낼 수 있습니다 (받은 건수: ${games.length})` },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await matchSteamChunk(games));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: error instanceof IgdbError ? 502 : 500 });
  }
}
