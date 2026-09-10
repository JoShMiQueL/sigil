import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    browserName: "chromium",
    launchOptions: {
      // In CI, use Playwright's bundled Chromium. Locally, use system Chromium.
      executablePath: process.env.CI ? undefined : "/usr/bin/chromium-browser",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  webServer: [
    {
      command: "pnpm --filter @sigilpanel/api start",
      url: "http://localhost:3000/health",
      reuseExistingServer: true,
      timeout: 30000,
      env: { NODE_ENV: "development" },
    },
    {
      command: "pnpm --filter @sigilpanel/panel preview",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
