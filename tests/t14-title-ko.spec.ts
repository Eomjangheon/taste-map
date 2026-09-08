import { test, expect } from "@playwright/test";

// T14 완료 조건 스모크:
//   결손 작품에 한국어 제목을 등록하면 검색에서 즉시 반영된다.
//   (등록한 한국어로 검색해도 찾아져야 한다 — IGDB 는 한국어 질의를 이해하지 못한다)
const hasEnv =
  Boolean(process.env.TWITCH_CLIENT_ID) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

test("한국어 제목 등록 → 그 한국어로 검색됨 (T14 완료 조건)", async ({ page }) => {
  test.skip(!hasEnv, "IGDB / Supabase secret key 환경변수가 없는 환경에서는 건너뜀");
  test.setTimeout(90_000);

  // 충돌하지 않는 고유 한국어 제목 — 재실행 가능해야 한다
  const unique = `테스트한글제목${Date.now()}`;
  let touchedWorkId: string | null = null;

  try {
    // 1) 결손 목록에서 게임 1건을 고른다
    await page.goto("/admin/title-ko");
    await page.getByTestId("media-filter").selectOption("game");
    const rows = page.getByTestId("missing-row");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    touchedWorkId = await rows.first().getAttribute("data-work-id");

    // 2) 한국어 제목을 등록한다
    await rows.first().getByTestId("title-ko-input").fill(unique);
    await rows.first().getByTestId("title-ko-save").click();
    await expect(page.getByTestId("saved-row").filter({ hasText: unique })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("admin-error")).toHaveCount(0);

    // 3) 등록한 한국어로 카탈로그를 검색하면 그 작품이 나온다
    await page.goto("/catalog/games");
    await page.getByTestId("catalog-search-input").fill(unique);
    await page.getByTestId("catalog-search-submit").click();
    await expect(page.getByTestId("works-total")).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByTestId("catalog-result").filter({ hasText: unique }).first()
    ).toBeVisible();
  } finally {
    // dev 카탈로그에 더미 제목을 남기지 않는다 (빈 문자열 = 지우기)
    if (touchedWorkId) {
      await page.request.patch("/api/admin/title-ko", {
        data: { workId: touchedWorkId, titleKo: "" },
      });
    }
  }
});
