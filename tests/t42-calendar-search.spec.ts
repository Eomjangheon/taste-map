import { test, expect } from "@playwright/test";

// T42 완료 조건 스모크: 캘린더 뷰 + 내 기록 검색 + 뷰 3종 전환 시 필터 유지
test("캘린더 뷰 + 기록 검색 + 뷰 전환 필터 유지 (T42 완료 조건)", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );

  await page.goto("/library?demo=1");
  const count = page.getByTestId("filtered-count");
  await expect(count).toHaveText("200");

  // ── 내 기록 제목 검색: 띄어쓰기 무시 ("스타듀밸리" → "스타듀 밸리") ──
  await page.getByTestId("record-search").fill("스타듀밸리");
  await expect(count).not.toHaveText("200");
  const searchCount = Number(await count.textContent());
  expect(searchCount).toBeGreaterThan(0);
  await page.getByTestId("view-list").click();
  await expect(page.getByTestId("library-list")).toContainText("스타듀 밸리");
  await page.getByTestId("filter-reset").click();
  await expect(count).toHaveText("200");

  // ── 필터 걸고 뷰 3종 전환해도 건수(=필터 상태)가 유지된다 ──
  await page.getByTestId("filter-media-game").click();
  await expect(count).not.toHaveText("200");
  const gameCount = await count.textContent();
  await page.getByTestId("view-grid").click();
  await expect(count).toHaveText(gameCount!);
  await page.getByTestId("view-calendar").click();
  await expect(count).toHaveText(gameCount!);
  await page.getByTestId("view-list").click();
  await expect(count).toHaveText(gameCount!);

  // ── 캘린더: 기록 있는 날 배지 → 일자 탭 → 그날 기록 목록 ──
  await page.getByTestId("view-calendar").click();
  await expect(page.getByTestId("calendar-view")).toBeVisible();
  const daysWithRecords = page.getByTestId("cal-day-has");
  await expect(daysWithRecords.first()).toBeVisible();
  await daysWithRecords.first().click();
  const dayCount = Number(await page.getByTestId("cal-day-count").textContent());
  expect(dayCount).toBeGreaterThan(0);
  await expect(
    page.getByTestId("library-list").locator("li")
  ).toHaveCount(dayCount);

  // ── 월 이동: 이전 달로 가면 달 표시가 바뀐다 ──
  const caption = page.locator(".rdp-month_caption").first();
  const before = await caption.textContent();
  await page.locator(".rdp-button_previous").click();
  await expect(caption).not.toHaveText(before!);
});
