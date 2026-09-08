import { test, expect } from "@playwright/test";

// T15 완료 조건 스모크: 계정 없이 기록 생성·조회 + 새로고침 후 유지
// T53부터 작품 검색이 계약 API(/api/works)를 타므로 검색 스택 환경변수가 필요하다
const hasEnv =
  Boolean(process.env.TWITCH_CLIENT_ID) &&
  Boolean(process.env.TMDB_READ_TOKEN) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

test("게스트 기록이 저장되고 새로고침해도 유지된다 (T15 완료 조건)", async ({
  page,
}) => {
  test.skip(!hasEnv, "검색 API 환경변수가 없는 환경에서는 건너뜀");

  await page.goto("/records");

  await page.getByTestId("work-search").fill("스타듀");
  await page.getByTestId("work-results").locator("button").first().click();
  await page.getByTestId("quick-in_progress").click();

  const list = page.getByTestId("record-list");
  await expect(list.locator("> li")).toHaveCount(1);
  await expect(list).toContainText("보는 중");

  // 새로고침 후에도 유지 (IndexedDB 영속성)
  await page.reload();
  await expect(list.locator("> li")).toHaveCount(1);
  await expect(list).toContainText("보는 중");
});
