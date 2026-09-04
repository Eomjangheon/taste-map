import { test, expect } from "@playwright/test";

// T7 스모크 — 이후 모든 이슈는 자기 완료 조건 스모크를 이 폴더에 추가한다 (AGENTS.md)

test("홈 화면이 렌더링된다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /취향 지도/ })).toBeVisible();
});

test("DB에서 작품 1건이 보인다 (T7 완료 조건)", async ({ page }) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );
  await page.goto("/");
  await expect(page.getByTestId("db-status")).toHaveText("ok");
  await expect(page.getByTestId("first-work")).toBeVisible();
});
