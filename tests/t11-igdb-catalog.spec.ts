import { test, expect } from "@playwright/test";

// T11 완료 조건 스모크:
//   게임 제목으로 검색하면 IGDB에서 조회·적재되어 works 에 쌓이고,
//   같은 게임을 두 번 검색해도 중복 생성되지 않는다.
const hasEnv =
  Boolean(process.env.TWITCH_CLIENT_ID) &&
  Boolean(process.env.TWITCH_CLIENT_SECRET) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const TERM = "Stardew Valley";

test("게임 검색 → 적재 → 재검색 시 중복 생성 없음 (T11 완료 조건)", async ({ page }) => {
  test.skip(!hasEnv, "IGDB / Supabase service_role 환경변수가 없는 환경에서는 건너뜀");
  test.setTimeout(60_000);

  await page.goto("/catalog/games");

  async function search() {
    await page.getByTestId("catalog-search-input").fill(TERM);
    await page.getByTestId("catalog-search-submit").click();
    await expect(page.getByTestId("works-total")).toBeVisible({ timeout: 30_000 });
  }

  // 1회차: 결과가 나오고 카탈로그에 쌓인다
  await search();
  await expect(page.getByTestId("catalog-error")).toHaveCount(0);
  expect(await page.getByTestId("catalog-result").count()).toBeGreaterThan(0);
  const totalAfterFirst = Number(await page.getByTestId("works-total").textContent());
  expect(totalAfterFirst).toBeGreaterThan(0);

  // 2회차: 같은 검색어 → 신규 적재 0건, 총 건수 그대로
  await search();
  await expect(page.getByTestId("catalog-created")).toHaveText("0");
  expect(Number(await page.getByTestId("works-total").textContent())).toBe(totalAfterFirst);
});
