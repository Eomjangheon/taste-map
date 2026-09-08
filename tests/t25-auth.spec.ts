import { test, expect } from "@playwright/test";

// T25 완료 조건 스모크: 로그인 → 세션 유지 → 로그아웃 (dev DB 시드 유저 사용, T9)
// 가입 흐름은 CI마다 유저가 쌓이므로 자동화하지 않는다 — 사람 검수 항목.
test("로그인·세션 유지·로그아웃 (T25 완료 조건)", async ({ page }) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Supabase 환경변수가 없는 환경에서는 건너뜀"
  );

  // 틀린 비밀번호 → 친절한 에러
  await page.goto("/auth");
  await page.getByTestId("auth-email").fill("seed1@taste.local");
  await page.getByTestId("auth-password").fill("wrong-password");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-error")).toContainText("맞지 않아요");

  // 로그인 → /records 로 리다이렉트, 계정 위젯에 이메일 표시
  await page.getByTestId("auth-password").fill("seedpass123!");
  await page.getByTestId("auth-submit").click();
  await page.waitForURL("**/records");
  await expect(page.getByTestId("account-email")).toHaveText(
    "seed1@taste.local"
  );

  // 새로고침해도 세션 유지
  await page.reload();
  await expect(page.getByTestId("account-email")).toHaveText(
    "seed1@taste.local"
  );

  // /auth 재방문 시 '내 계정' 화면
  await page.goto("/auth");
  await expect(page.getByTestId("session-email")).toHaveText(
    "seed1@taste.local"
  );

  // 로그아웃 → 로그인 링크로 복귀
  await page.getByTestId("logout-button").click();
  await page.goto("/records");
  await expect(page.getByTestId("login-link")).toBeVisible();
});
