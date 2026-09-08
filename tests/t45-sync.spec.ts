import { test, expect } from "@playwright/test";

// T45 완료 조건 스모크: 게스트 기록 → 로그인 → 계정으로 일괄 업로드 → 서버에서 유지
// 전용 계정 e2e@taste.local 사용 (시드 유저 기록 오염 방지, dev_seed 참고).
// 계정 삭제는 계정이 사라져 재실행이 불가능하므로 자동화하지 않는다 — 사람 검수 항목
// (프리뷰에서 임시 가입 계정으로 확인).
test("게스트 기록이 로그인 시 계정으로 옮겨진다 (T45 완료 조건)", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );

  // 1) 게스트로 기록 1건 생성 (로컬 저장)
  await page.goto("/records");
  await page.getByTestId("work-search").fill("스타듀밸리");
  await page
    .getByTestId("work-results")
    .locator("button", { hasText: "스타듀 밸리" })
    .first()
    .click();
  await page.getByTestId("quick-completed").click();
  await expect(page.getByTestId("save-message")).toContainText("기록 완료");

  // 2) 로그인 → /records 리다이렉트 → 업로드 안내 + 기록이 계정 저장소에서 보인다
  await page.goto("/auth");
  await page.getByTestId("auth-email").fill("e2e@taste.local");
  await page.getByTestId("auth-password").fill("seedpass123!");
  await page.getByTestId("auth-submit").click();
  await page.waitForURL("**/records");
  await expect(page.getByTestId("save-message")).toContainText(
    "계정으로 옮겼어요"
  );
  const list = page.getByTestId("record-list");
  await expect(list).toContainText("스타듀 밸리");

  // 3) 새로고침해도 서버에서 그대로 읽힌다
  await page.reload();
  await expect(list).toContainText("스타듀 밸리");
  await expect(page.getByTestId("account-email")).toHaveText("e2e@taste.local");

  // 4) 정리 겸 서버 삭제 확인 — 기록 삭제 후 빈 상태 (다음 실행의 멱등성 보장)
  page.once("dialog", (d) => d.accept());
  await list.locator("button", { hasText: "삭제" }).first().click();
  await expect(list).toContainText("아직 기록이 없습니다");

  // 5) 로그아웃하면 게스트 로컬(업로드 후 비워짐)로 돌아간다
  await page.getByTestId("logout-button").click();
  await expect(page.getByTestId("login-link")).toBeVisible();
  await expect(list).toContainText("아직 기록이 없습니다");
});
