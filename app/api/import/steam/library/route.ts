// Steam 라이브러리 조회 — T19 (가져오기 1단계)
//
//   POST /api/import/steam/library  { "input": "<프로필 URL 또는 SteamID64>" }
//
// 매칭은 여기서 하지 않는다. 먼저 "몇 개인지" 를 빠르게 돌려줘야 화면이 진행률을 그릴 수 있다.
// 매칭은 화면이 `/api/import/steam/match` 를 청크로 부르며 진행한다.
//
// 계약 문서 §4 의 오류 형태를 따른다: `{ error, missingEnv? }`.
// 여기에 화면이 사유별 안내를 고르기 위한 `code` 를 더한다 (Steam 전용 필드 — works API 계약과 무관).

import { NextResponse } from "next/server";
import { getOwnedGames, resolveSteamId, SteamError } from "@/lib/steam/client";

export async function POST(request: Request) {
  if (!process.env.STEAM_API_KEY) {
    return NextResponse.json(
      {
        error: "STEAM_API_KEY 환경변수가 비어 있습니다",
        code: "no-key",
        missingEnv: ["STEAM_API_KEY"],
      },
      { status: 503 }
    );
  }

  let input: unknown;
  try {
    input = ((await request.json()) as { input?: unknown }).input;
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다", code: "bad-input" }, { status: 400 });
  }

  if (typeof input !== "string" || input.trim() === "") {
    return NextResponse.json(
      { error: "SteamID 또는 프로필 주소를 입력해 주세요", code: "bad-input" },
      { status: 400 }
    );
  }

  try {
    const steamId = await resolveSteamId(input);
    const library = await getOwnedGames(steamId);
    return NextResponse.json(library);
  } catch (error) {
    if (error instanceof SteamError) {
      // 비공개·입력 오류는 유저가 고칠 수 있는 상황이라 4xx, 키·장애는 5xx
      const status =
        error.code === "bad-input" || error.code === "vanity-not-found"
          ? 400
          : error.code === "private"
            ? 403
            : error.code === "no-key"
              ? 503
              : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, code: "steam-error" }, { status: 500 });
  }
}
