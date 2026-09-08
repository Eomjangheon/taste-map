import { test, expect } from "@playwright/test";

// T53 완료 조건 스모크: 기록 입력 검색이 계약 API(/api/works)를 소비한다.
// 외부 온디맨드 적재(시드에 없는 최신작)는 실행마다 dev 카탈로그가 자라므로
// 자동화하지 않는다 — 사람 검수 항목(프리뷰에서 최근 개봉작 검색).
const hasEnv =
  Boolean(process.env.TWITCH_CLIENT_ID) &&
  Boolean(process.env.TMDB_READ_TOKEN) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

test("기록 입력 검색이 /api/works 를 소비한다 (T53 완료 조건)", async ({
  page,
}) => {
  test.skip(!hasEnv, "검색 API 환경변수가 없는 환경에서는 건너뜀");

  await page.goto("/records");

  // 2글자 미만은 호출하지 않는다 (계약 규약) — 네트워크 요청 자체가 없어야 함
  let called = 0;
  await page.route("**/api/works?*", (route) => {
    called++;
    route.continue();
  });
  await page.getByTestId("work-search").fill("기");
  await page.waitForTimeout(700); // 디바운스(400ms)보다 길게 대기
  expect(called).toBe(0);
  await expect(page.getByTestId("work-results")).toHaveCount(0);

  // 2글자 이상 → API 호출 → 결과 표시 (카탈로그 히트 경로)
  await page.getByTestId("work-search").fill("기생충");
  const results = page.getByTestId("work-results");
  await expect(results).toContainText("기생충");
  expect(called).toBeGreaterThan(0);
  await expect(results).toContainText("영화");

  // 결과 선택 → 즉시 저장까지 이어진다 (T16 흐름 위에서 동작)
  await results.locator("button", { hasText: "기생충" }).first().click();
  await page.getByTestId("quick-completed").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
  await expect(page.getByTestId("record-list")).toContainText("기생충");
});

test("IME 조합 중에도 입력값이 유지된다 (WEB-53 검수 버그 회귀 방지)", async ({
  page,
}) => {
  test.skip(!hasEnv, "검색 API 환경변수가 없는 환경에서는 건너뜀");

  await page.goto("/records");
  // 한글 IME 조합 시퀀스 시뮬레이션: compositionstart 후 input 이벤트.
  // 버그 패턴(조합 중 setQuery 건너뜀)이면 React가 controlled value를 ""로 되돌려 입력이 사라진다.
  await page.evaluate(() => {
    const inp = document.querySelector(
      '[data-testid="work-search"]'
    ) as HTMLInputElement;
    inp.focus();
    inp.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    // 2글자여야 조합 중 상태 변경(로딩 표시)이 리렌더를 일으켜 구버그가 드러난다
    setter.call(inp, "기생");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByTestId("work-search")).toHaveValue("기생"); // 조합 중 입력 유지

  // 조합 확정 → 그 값으로 검색이 발사된다
  await page.evaluate(() => {
    const inp = document.querySelector(
      '[data-testid="work-search"]'
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(inp, "기생충");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "기생충" })
    );
  });
  await expect(page.getByTestId("work-search")).toHaveValue("기생충");
  await expect(page.getByTestId("work-results")).toContainText("기생충");
});
