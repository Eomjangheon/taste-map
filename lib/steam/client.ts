// Steam Web API 클라이언트 — T19
//
// 실패 모양은 전부 WEB-3 선행 검증에서 **실제로 받아본 것**이다
// (`steam-verify/verify.mjs`, `steam-verify/report/`). 추측으로 쓰지 않았다.
//   · 비공개 프로필: HTTP **200** + `response: {}` — game_count 자체가 없다. 에러가 아니라 빈 성공이다
//   · 키 무효·차단: HTTP 403
//   · steamid 형식 오류: HTTP 500 (400 이 아니다)
//   · 커뮤니티 XML 우회로는 죽었다 — Valve 가 익명 요청을 /login 으로 돌린다. 정식 키가 필수다
//
// 키는 환경변수로만 주입한다 (AGENTS.md 금지 규칙 2). **이 파일은 서버에서만 import 한다.**

import type { SteamFailure } from "@/lib/steam/guide";

const OWNED_GAMES_URL = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const VANITY_URL = "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/";

export class SteamError extends Error {
  constructor(
    readonly code: SteamFailure,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "SteamError";
  }
}

export function hasSteamKey(): boolean {
  return Boolean(process.env.STEAM_API_KEY);
}

function apiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    throw new SteamError(
      "no-key",
      "STEAM_API_KEY 환경변수가 없습니다 (서버 설정 문제입니다)"
    );
  }
  return key;
}

/** SteamID64 는 7656119… 로 시작하는 17자리다 */
function isSteamId64(value: string): boolean {
  return /^7656119\d{10}$/.test(value);
}

/**
 * 입력에서 맞춤 URL 이름(vanity)을 뽑는다.
 * 받는 모양: `https://steamcommunity.com/id/이름/`, `steamcommunity.com/id/이름`, 그냥 `이름`
 */
function vanityOf(input: string): string | null {
  const byUrl = input.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i);
  if (byUrl) return decodeURIComponent(byUrl[1]);
  // URL 이 아니고 숫자도 아니면 이름 그 자체로 본다 (Steam 맞춤 URL 규칙: 영숫자·_·-)
  if (/^[A-Za-z0-9_-]{2,32}$/.test(input)) return input;
  return null;
}

/**
 * 프로필 URL 또는 SteamID64 → SteamID64.
 *
 * MVP 는 OpenID 로그인 없이 ID 입력 방식이다(이슈 지시). 정확도는 같고 흐름이 단순하다.
 */
export async function resolveSteamId(rawInput: string): Promise<string> {
  const input = rawInput.trim();
  if (!input) throw new SteamError("bad-input", "SteamID 또는 프로필 주소를 입력해 주세요");

  // ① 숫자 ID 그 자체
  if (isSteamId64(input)) return input;

  // ② /profiles/<id64> 형태
  const byProfile = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (byProfile && isSteamId64(byProfile[1])) return byProfile[1];

  // ③ /id/<vanity> 또는 이름만 → Steam 에 물어본다
  const vanity = vanityOf(input);
  if (!vanity) {
    throw new SteamError(
      "bad-input",
      "SteamID64(17자리 숫자)나 프로필 주소로 보이지 않습니다"
    );
  }

  const url = new URL(VANITY_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("vanityurl", vanity);

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 403) {
    throw new SteamError("no-key", "Steam API 키가 거부됐습니다 (403)", 403);
  }
  if (!res.ok) {
    throw new SteamError("steam-error", `Steam 응답 오류 (HTTP ${res.status})`, res.status);
  }

  const body = (await res.json()) as { response?: { success?: number; steamid?: string } };
  // success: 1 = 찾음, 42 = 없음
  const steamId = body.response?.steamid;
  if (body.response?.success !== 1 || !steamId || !isSteamId64(steamId)) {
    throw new SteamError(
      "vanity-not-found",
      `'${vanity}' 라는 맞춤 프로필 주소를 찾지 못했습니다`
    );
  }
  return steamId;
}

/** 보유 게임 1건 — 필요한 것만 남긴 모양 */
export type OwnedGame = {
  appId: number;
  name: string;
  /** 누적 플레이 시간(분). Steam 은 출시 연도를 주지 않는다 */
  playtimeMinutes: number;
};

export type OwnedLibrary = {
  steamId: string;
  total: number;
  games: OwnedGame[];
  /** 플레이 시간 0분인 게임 수 — 화면에서 그대로 보여준다 (§5.3 status 규정 관련) */
  neverPlayed: number;
};

/**
 * 보유 게임 전체를 가져온다.
 *
 * `include_played_free_games=1` 을 붙인다 — 안 붙이면 무료 게임이 통째로 빠진다.
 * `include_appinfo=1` 이 있어야 제목이 온다(없으면 appid 만 온다).
 */
export async function getOwnedGames(steamId: string): Promise<OwnedLibrary> {
  const url = new URL(OWNED_GAMES_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "1");
  url.searchParams.set("include_played_free_games", "1");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });

  if (res.status === 403) {
    throw new SteamError("no-key", "Steam API 키가 거부됐습니다 (403)", 403);
  }
  if (res.status === 500) {
    // WEB-3 에서 확인: steamid 형식이 틀리면 400 이 아니라 500 이 온다
    throw new SteamError("bad-input", "Steam 이 이 ID 를 읽지 못했습니다", 500);
  }
  if (!res.ok) {
    throw new SteamError("steam-error", `Steam 응답 오류 (HTTP ${res.status})`, res.status);
  }

  const text = await res.text();
  let body: { response?: { game_count?: number; games?: unknown[] } };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // 장애 시 HTML 이 온다
    throw new SteamError("steam-error", "Steam 이 JSON 이 아닌 응답을 보냈습니다");
  }

  const response = body.response ?? {};
  // **비공개 프로필의 진짜 모양** — 200 인데 response 가 비어 있다 (WEB-3 실측)
  if (response.game_count === undefined && !Array.isArray(response.games)) {
    throw new SteamError(
      "private",
      "프로필이 비공개이거나 보유 게임을 볼 수 없습니다"
    );
  }

  const raw = (response.games ?? []) as Array<{
    appid?: number;
    name?: string;
    playtime_forever?: number;
  }>;

  const games: OwnedGame[] = raw
    .filter((g): g is { appid: number; name?: string; playtime_forever?: number } =>
      Number.isInteger(g.appid)
    )
    .map((g) => ({
      appId: g.appid,
      name: (g.name ?? "").trim() || `Steam 앱 ${g.appid}`,
      playtimeMinutes: Math.max(0, Math.round(g.playtime_forever ?? 0)),
    }));

  return {
    steamId,
    total: response.game_count ?? games.length,
    games,
    neverPlayed: games.filter((g) => g.playtimeMinutes === 0).length,
  };
}
