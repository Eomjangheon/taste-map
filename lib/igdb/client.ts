// IGDB(Twitch) API 클라이언트 — T11
//
// 실측 근거는 T3 검증 리포트(`steam-verify/report/WEB-3-comment.md` §4, 2026-09-03):
//   · `external_games.category` 는 제거됐다. 남아 있는 쿼리는 에러 대신 **조용히 0건**을 준다.
//     → 현재 필드는 `external_game_source` 이고, `external_game_sources` 에서 Steam = 1 이다.
//   · uid 는 소스 간 공유된다. 소스 필터 없이 uid 만으로 조회하면 다른 스토어의 엉뚱한 게임이 붙는다.
//   · 레이트리밋 4 req/s.
//
// 키는 환경변수로만 주입한다 (AGENTS.md 금지 규칙 2). 이 파일은 서버에서만 import 한다.

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_BASE = "https://api.igdb.com/v4";

/** external_game_sources 에서 실측 확인한 Steam 소스 id (T3) */
export const STEAM_SOURCE_ID = 1;

/** 4 req/s 제한 대응. T3 검증 스크립트와 같은 간격(300ms)을 쓴다. */
const MIN_INTERVAL_MS = 300;

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "IgdbError";
  }
}

function credentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new IgdbError(
      "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET 환경변수가 없습니다 (docs/igdb.md 참고)"
    );
  }
  return { clientId, clientSecret };
}

export function hasIgdbCredentials() {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

// ---------------------------------------------------------------- 토큰 캐싱
// 초보 함정: 토큰을 캐싱하지 않고 매 요청 발급하면 즉시 차단된다 (T11 체크리스트).
// 모듈 스코프에 캐싱하고, 동시 요청이 중복 발급하지 않도록 진행 중 Promise 를 공유한다.

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

/** 만료 60초 전에는 미리 갱신한다 */
const TOKEN_SAFETY_MS = 60_000;

async function requestToken(): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const url = new URL(TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new IgdbError(`Twitch 토큰 발급 실패 HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  let body: { access_token?: string; expires_in?: number };
  try {
    body = JSON.parse(text);
  } catch {
    throw new IgdbError(`Twitch 토큰 응답이 JSON 이 아닙니다: ${text.slice(0, 200)}`);
  }
  if (!body.access_token) {
    throw new IgdbError("Twitch 토큰 응답에 access_token 이 없습니다");
  }

  // expires_in 은 초 단위. 없으면 보수적으로 1시간으로 본다.
  const ttlMs = (body.expires_in ?? 3600) * 1000;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + ttlMs };
  return body.access_token;
}

export async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MS > Date.now()) {
    return cachedToken.value;
  }
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = requestToken();
  try {
    return await tokenInFlight;
  } finally {
    tokenInFlight = null;
  }
}

/** 401 을 만나면 캐시를 버리고 한 번만 재발급한다 */
function invalidateToken() {
  cachedToken = null;
}

// ------------------------------------------------------------- 레이트리밋
// 호출을 직렬화하고 최소 간격을 보장한다. 병렬 호출이 순간적으로 4 req/s 를 넘지 않게 하는 것이 목적.

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  // 한 호출이 실패해도 큐가 끊기지 않게 한다
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------- 쿼리
/**
 * APICalypse 쿼리 1건. 호출은 직렬화되며 4 req/s 제한을 지킨다.
 * 빈 배열은 "결과 없음"일 수도 있고 "필드가 사라져서 조용히 실패"일 수도 있다 (T3 §3-3).
 * 호출부에서 반드시 명시적으로 검사한다.
 */
export async function igdbQuery<T = Record<string, unknown>>(
  endpoint: string,
  body: string,
  { retryOn401 = true }: { retryOn401?: boolean } = {}
): Promise<T[]> {
  const { clientId } = credentials();
  const token = await getToken();

  const res = await schedule(() =>
    fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body,
      cache: "no-store",
    })
  );

  if (res.status === 401 && retryOn401) {
    invalidateToken();
    return igdbQuery<T>(endpoint, body, { retryOn401: false });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new IgdbError(`IGDB ${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  try {
    return JSON.parse(text) as T[];
  } catch {
    throw new IgdbError(`IGDB ${endpoint} 응답이 JSON 이 아닙니다: ${text.slice(0, 200)}`);
  }
}

/**
 * 필드 조합을 풍부한 것부터 순서대로 시도한다.
 * IGDB 는 스키마가 옮겨가는 중이고, 사라진 필드를 쓴 쿼리는 400 을 주거나 조용히 0건을 준다 (T3).
 * 하나라도 결과가 있으면 그 조합을 채택하고, 전부 0건이면 마지막 결과(빈 배열)를 돌려준다.
 */
export async function igdbQueryWithFallback<T = Record<string, unknown>>(
  endpoint: string,
  bodies: string[]
): Promise<{ rows: T[]; variantIndex: number }> {
  let lastError: unknown = null;
  for (let i = 0; i < bodies.length; i += 1) {
    try {
      const rows = await igdbQuery<T>(endpoint, bodies[i]);
      if (rows.length > 0) return { rows, variantIndex: i };
      // 0건이면 다음(더 단순한) 조합을 시도한다 — 필드 소실로 인한 조용한 실패일 수 있다
      lastError = null;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return { rows: [], variantIndex: bodies.length - 1 };
}
