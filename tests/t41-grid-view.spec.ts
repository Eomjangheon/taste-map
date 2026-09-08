import { test, expect } from "@playwright/test";

// T41 완료 조건 스모크: 그리드 뷰 + 필터 연동 + 페이지네이션 + 빈 상태 화면
test("그리드 뷰: 포스터 카드 + 더 보기 + 필터 연동 (T41 완료 조건)", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );

  await page.goto("/library?demo=1");

  // 기본 뷰 = 그리드, 첫 페이지 32장
  const grid = page.getByTestId("library-grid");
  await expect(grid).toBeVisible();
  await expect(page.getByTestId("grid-card")).toHaveCount(32);
  await expect(page.getByTestId("filtered-count")).toHaveText("200");

  // 더 보기 → 다음 페이지가 붙는다
  await page.getByTestId("grid-more").click();
  await expect(page.getByTestId("grid-card")).toHaveCount(64);

  // 필터 연동(T17 모듈): 영화만 → 카드 수가 줄고 페이지가 리셋된다
  await page.getByTestId("filter-media-movie").click();
  await expect(page.getByTestId("filtered-count")).not.toHaveText("200");
  const movieCount = Number(
    await page.getByTestId("filtered-count").textContent()
  );
  expect(movieCount).toBeGreaterThan(0);
  await expect(page.getByTestId("grid-card")).toHaveCount(
    Math.min(movieCount, 32)
  );

  // 영화는 아직 포스터 소스가 없어 플레이스홀더 타일(제목 표시)로 보인다
  await expect(page.getByTestId("poster-placeholder").first()).toBeVisible();

  // 뷰 전환에도 필터 유지 (T42 요구 선반영)
  await page.getByTestId("view-list").click();
  await expect(page.getByTestId("library-list")).toBeVisible();
  await expect(page.getByTestId("filtered-count")).toHaveText(
    String(movieCount)
  );

  // 기록 0건 빈 상태 화면 + 기록 유도
  await page.goto("/library");
  await expect(page.getByTestId("empty-screen")).toContainText(
    "아직 기록이 없어요"
  );
  await expect(page.getByTestId("empty-screen")).toContainText(
    "첫 작품 기록하기"
  );
});
