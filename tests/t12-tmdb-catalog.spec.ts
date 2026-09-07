import { test, expect } from "@playwright/test";

// T12 완료 조건 스모크:
//   영화·드라마 제목으로 검색하면 한국어 제목과 포스터가 포함된 Work 가 적재되고,
//   시즌이 있는 드라마는 시즌별 별개 Work 로 저장된다.
const hasEnv =
  Boolean(process.env.TMDB_READ_TOKEN) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const TERM = "오징어 게임";

test("영화·드라마 검색 → 한국어 제목·포스터·시즌별 별개 Work (T12 완료 조건)", async ({ page }) => {
  test.skip(!hasEnv, "TMDB / Supabase secret key 환경변수가 없는 환경에서는 건너뜀");
  test.setTimeout(90_000);

  await page.goto("/catalog/titles");

  async function search() {
    await page.getByTestId("title-search-input").fill(TERM);
    await page.getByTestId("title-search-submit").click();
    await expect(page.getByTestId("title-works-total")).toBeVisible({ timeout: 60_000 });
  }

  await search();
  await expect(page.getByTestId("title-error")).toHaveCount(0);

  const results = page.getByTestId("title-result");
  expect(await results.count()).toBeGreaterThan(0);

  // 한국어 제목이 화면에 보인다
  await expect(results.filter({ hasText: "오징어 게임" }).first()).toBeVisible();

  // 시즌이 별개 항목으로 저장된다
  const seasons = results.filter({ hasText: "드라마 시즌" });
  expect(await seasons.count()).toBeGreaterThan(1);
  await expect(seasons.first()).toContainText("시리즈 연결됨");

  // 포스터 이미지가 실제로 로드된다 (디코딩까지 기다린다 — 표시만으로는 로드 성공을 알 수 없다)
  const poster = results.first().locator("img").first();
  await expect(poster).toBeVisible();
  await expect
    .poll(async () => poster.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  const total = Number(await page.getByTestId("title-works-total").textContent());

  // 재검색해도 중복 생성되지 않는다
  await search();
  await expect(page.getByTestId("title-created")).toHaveText("0");
  expect(Number(await page.getByTestId("title-works-total").textContent())).toBe(total);
});
