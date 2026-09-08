// TMDB API 클라이언트 — T12
//
// 인증은 v4 read access token(Bearer). 키는 환경변수로만 주입한다 (AGENTS.md 금지 규칙 2).
// 이 파일은 서버에서만 import 한다.
//
// 라이선스 의무 (docs/external-apis.md): 비상업적 무료 사용의 조건은 **TMDB 출처 표기**다.
// TMDB 데이터가 보이는 화면에는 출처를 노출해야 한다.

const API_BASE = "https://api.themoviedb.org/3";

/** 이미지 호스트 — /3/configuration 으로 실측 확인 (2026-09-07) */
export const IMAGE_BASE = "https://image.tmdb.org/t/p";

/** 과도한 연속 호출을 피하기 위한 최소 간격. IGDB(4 req/s)만큼 빡빡하지는 않다. */
const MIN_INTERVAL_MS = 60;

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

function readToken() {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) {
    throw new TmdbError("TMDB_READ_TOKEN 환경변수가 없습니다 (docs/tmdb.md 참고)");
  }
  return token;
}

export function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_TOKEN);
}

// 호출 직렬화 + 최소 간격 (IGDB 클라이언트와 같은 방식)
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
  queue = run.catch(() => undefined);
  return run;
}

/**
 * TMDB GET 요청. `language=ko-KR` 은 호출부에서 필요한 곳에만 붙인다.
 * 빈 결과를 성공으로 취급하지 않는 것은 호출부 책임이다.
 */
export async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await schedule(() =>
    fetch(url, {
      headers: { Authorization: `Bearer ${readToken()}`, Accept: "application/json" },
      cache: "no-store",
    })
  );

  const text = await res.text();
  if (!res.ok) {
    throw new TmdbError(`TMDB ${path} HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TmdbError(`TMDB ${path} 응답이 JSON 이 아닙니다: ${text.slice(0, 200)}`);
  }
}

/**
 * 포스터 URL 규칙 (docs/tmdb.md).
 * poster_path 는 앞에 슬래시가 붙은 형태로 온다(예: `/abc.jpg`).
 */
export function posterUrl(posterPath: string, size: "w185" | "w342" | "w500" = "w342") {
  return `${IMAGE_BASE}/${size}${posterPath}`;
}
