import { test, expect } from "@playwright/test";

// T15 완료 조건 스모크: 계정 없이 기록 생성·조회 + 새로고침 후 유지
test("게스트 기록이 저장되고 새로고침해도 유지된다 (T15 완료 조건)", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀 (작품 목록 필요)"
  );

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
