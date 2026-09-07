import { test, expect } from "@playwright/test";

// T16 완료 조건 스모크: 2단 기록 — 1단계(작품+상태 즉시 저장) + 2단계(별점·감상문)
test("2단 기록: 띄어쓰기 무시 검색 → 즉시 저장 → 별점·감상문 (T16 완료 조건)", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );

  await page.goto("/records");

  // 1단계: 띄어쓰기·문장부호가 틀린 검색어로도 찾아진다 (WEB-4 관찰 반영)
  // 실제 제목은 "너의 이름은." — 붙여 쓰고 마침표 없이 검색
  await page.getByTestId("work-search").fill("너의이름은");
  const results = page.getByTestId("work-results");
  await expect(results).toContainText("너의 이름은");
  // 필터가 실제로 걸러내는지 확인 — 무관한 제목이 나오면 안 됨 (한글 전체 삭제 버그 회귀 방지)
  await expect(results).not.toContainText("겨울왕국");
  await expect(results.locator("button")).toHaveCount(1);
  await results.locator("button").first().click();

  // 상태 탭 = 즉시 저장 (여기서 종료 가능)
  await page.getByTestId("quick-completed").click();
  await expect(page.getByTestId("save-message")).toContainText("기록 완료");

  // 2단계(선택): 저장 직후 자동으로 열린 상세에서 별점 반 개 단위 + 감상문
  await page.getByTestId("star-3.5").click();
  await page.getByTestId("note-input").fill("명작. 노래가 계속 맴돈다");
  await page.getByTestId("save-detail").click();

  const list = page.getByTestId("record-list");
  await expect(list).toContainText("★ 3.5");
  await expect(list).toContainText("명작");

  // 새로고침 후에도 2단계 내용 유지
  await page.reload();
  await expect(list).toContainText("★ 3.5");
  await expect(list).toContainText("봤어요");
});
