import { test, expect } from "@playwright/test";

// T13 완료 조건 스모크:
//   배포 URL에서 세 매체(게임·영화·드라마) 모두 검색 → 상세가 동작한다.
const hasEnv =
  Boolean(process.env.TWITCH_CLIENT_ID) &&
  Boolean(process.env.TMDB_READ_TOKEN) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// 매체별로 카탈로그에 이미 있거나 외부에서 가져올 수 있는 제목
const CASES: { media: "game" | "movie" | "tv"; term: string }[] = [
  { media: "game", term: "Stardew" },
  { media: "movie", term: "Interstellar" },
  { media: "tv", term: "Chernobyl" },
];

test("세 매체 모두 검색 → 상세 (T13 완료 조건)", async ({ page }) => {
  test.skip(!hasEnv, "IGDB / TMDB / Supabase 환경변수가 없는 환경에서는 건너뜀");
  test.setTimeout(180_000);

  for (const { media, term } of CASES) {
    await page.goto("/search");
    await page.getByTestId(`media-${media}`).click();
    await page.getByTestId("search-input").fill(term);

    // 디바운스 + 외부 조회를 기다린다
    const results = page.getByTestId("search-result");
    await expect(results.first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("search-error")).toHaveCount(0);

    const count = Number(await page.getByTestId("result-count").textContent());
    expect(count).toBeGreaterThan(0);

    // 첫 결과의 상세로 이동
    await results.first().click();
    await expect(page.getByTestId("detail-title")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("detail-meta")).toBeVisible();
    // 기록 버튼 자리가 B 의 기록 입력으로 연결된다
    await expect(page.getByTestId("detail-record-link")).toHaveAttribute("href", "/records");
    expect(page.url()).toContain("/works/");
  }
});

test("2글자 미만은 검색하지 않는다 (디바운스·과호출 방지)", async ({ page }) => {
  test.skip(!hasEnv, "환경변수가 없는 환경에서는 건너뜀");
  await page.goto("/search");
  await page.getByTestId("search-input").fill("a");
  await expect(page.getByTestId("result-count")).toHaveCount(0);
});
