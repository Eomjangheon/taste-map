import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// 로컬 실행 시 .env.local 로드 (CI는 워크플로 env로 주입됨)
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
