import { test, expect } from "@playwright/test";

// T17 완료 조건 스모크: 리스트 뷰 + 매체·상태·기간 필터가 데모 200건 기준 동작
test("리스트 뷰: 매체·상태·기간 필터 (T17 완료 조건)", async ({ page }) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );

  await page.goto("/library?demo=1");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await page.getByTestId("view-list").click(); // T41부터 기본 뷰는 그리드

  const count = page.getByTestId("filtered-count");
  await expect(count).toHaveText("200");

  // 매체 필터: 게임만 남고, 개수가 줄어든다
  await page.getByTestId("filter-media-game").click();
  await expect(count).not.toHaveText("200"); // 필터 반영 렌더 대기
  const gameCount = Number(await count.textContent());
  expect(gameCount).toBeGreaterThan(0);
  expect(gameCount).toBeLessThan(200);
  const mediaBadges = await page.getByTestId("row-media").allTextContents();
  expect(mediaBadges.length).toBe(gameCount);
  expect(mediaBadges.every((t) => t === "게임")).toBe(true);

  // 상태 필터 중첩: 게임 + 봤어요
  await page.getByTestId("filter-status-completed").click();
  const doneCount = Number(await count.textContent());
  expect(doneCount).toBeGreaterThan(0);
  expect(doneCount).toBeLessThanOrEqual(gameCount);
  await expect(page.getByTestId("library-list")).toContainText("봤어요");
  await expect(page.getByTestId("library-list")).not.toContainText("중도하차");

  // 기간 필터 중첩: 최근 30일 — 더 좁아진다 (감상일 기준)
  await page.getByTestId("filter-period").selectOption("last30");
  const recentCount = Number(await count.textContent());
  expect(recentCount).toBeLessThan(doneCount);

  // 필터 초기화 → 다시 200건
  await page.getByTestId("filter-reset").click();
  await expect(count).toHaveText("200");

  // 기록 0건 빈 상태: 데모가 아닌 새 브라우저 상태 (T41에서 전용 화면으로 승격)
  await page.goto("/library");
  await expect(page.getByTestId("empty-screen")).toContainText(
    "아직 기록이 없어요"
  );
});
