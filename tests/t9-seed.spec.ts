import { test, expect } from "@playwright/test";

// T9 완료 조건 스모크: 시드 적용 후 카탈로그 50건 이상이 화면에 보인다
test("카탈로그에 작품 50건 이상이 있다 (T9 완료 조건)", async ({ page }) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );
  await page.goto("/");
  const countText = await page.getByTestId("works-count").textContent();
  expect(Number(countText)).toBeGreaterThanOrEqual(50);
});
