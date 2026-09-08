import { test, expect } from "@playwright/test";

// T44 완료 조건 스모크:
//   매칭 결과를 넣으면 확인 UX 3종(자동 확정 통보 / 후보 선택 / 스킵 목록)이 배포 URL 에서 동작한다.
// DB 를 읽지 않는 화면이라 환경변수 없이도 돌아간다 — CI 에서 skip 되지 않는다.

test("확인 UX 3종이 한 화면에 나온다 (T44 완료 조건)", async ({ page }) => {
  await page.goto("/import/review");

  // 세 상태가 섞여 있고, 각각 0건이 아니다
  await expect(page.getByTestId("review-summary")).toBeVisible();
  for (const id of ["count-auto", "count-choose", "count-skip"]) {
    const value = Number(await page.getByTestId(id).innerText());
    expect(value, id).toBeGreaterThan(0);
  }

  // ① 자동 확정: 결과만 통보 — 기본은 접혀 있고 펼치면 '원본 → 확정 작품' 이 보인다
  await expect(page.getByTestId("auto-list")).toHaveCount(0);
  await page.getByTestId("auto-toggle").click();
  await expect(page.getByTestId("auto-item").first()).toBeVisible();

  // ② 후보 선택: 후보는 3개 이하 (§5.3 UX 규격)
  const firstChoose = page.getByTestId("choose-item").first();
  await expect(firstChoose).toBeVisible();
  expect(await firstChoose.getByTestId("candidate").count()).toBeLessThanOrEqual(3);

  // ③ 스킵 목록: 일괄 표시
  await expect(page.getByTestId("skip-item").first()).toBeVisible();
});

test("애매 건은 탭 1회로 선택되고 남은 건수가 줄어든다", async ({ page }) => {
  await page.goto("/import/review");

  const items = page.getByTestId("choose-item");
  const total = await items.count();
  expect(total).toBeGreaterThan(0);
  await expect(page.getByTestId("remaining-count")).toContainText(`${total}건 남음`);

  // 탭 1회 = 선택 완료. 카드가 접히고 고른 작품이 보인다
  const first = items.first();
  await first.getByTestId("candidate").first().click();
  await expect(first.getByTestId("choose-resolved")).toBeVisible();
  await expect(first).toHaveAttribute("data-resolved", "true");
  await expect(page.getByTestId("remaining-count")).toContainText(`${total - 1}건 남음`);

  // 잘못 골랐으면 되돌릴 수 있다
  await first.getByTestId("choose-undo").click();
  await expect(first.getByTestId("candidate").first()).toBeVisible();
  await expect(page.getByTestId("remaining-count")).toContainText(`${total}건 남음`);
});

test("건너뛴 건은 추가 대상에서 빠진다", async ({ page }) => {
  await page.goto("/import/review");

  const autoCount = Number(await page.getByTestId("count-auto").innerText());
  const confirm = page.getByTestId("confirm-import");
  // 아무것도 고르지 않았으면 자동 확정분만 추가된다
  await expect(confirm).toContainText(`${autoCount}건`);

  // 1건 선택 → 추가 대상 1건 증가
  await page.getByTestId("choose-item").first().getByTestId("candidate").first().click();
  await expect(confirm).toContainText(`${autoCount + 1}건`);

  // 1건 건너뛰기 → 추가 대상은 그대로
  await page.getByTestId("choose-item").nth(1).getByTestId("candidate-skip").click();
  await expect(confirm).toContainText(`${autoCount + 1}건`);

  await confirm.click();
  await expect(page.getByTestId("confirm-done")).toContainText(`${autoCount + 1}건`);
});
