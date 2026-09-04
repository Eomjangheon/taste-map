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

  // 작품 목록 로드 대기 후 첫 작품 선택
  const workSelect = page.getByTestId("work-select");
  await expect(async () => {
    const count = await workSelect.locator("option").count();
    expect(count).toBeGreaterThan(1);
  }).toPass({ timeout: 10_000 });
  await workSelect.selectOption({ index: 1 });
  await page.getByTestId("status-select").selectOption("in_progress");
  await page.getByTestId("save-record").click();

  const list = page.getByTestId("record-list");
  await expect(list.locator("li")).toHaveCount(1);
  await expect(list).toContainText("보는 중");

  // 새로고침 후에도 유지 (IndexedDB 영속성)
  await page.reload();
  await expect(list.locator("li")).toHaveCount(1);
  await expect(list).toContainText("보는 중");
});
