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
      executablePath: "/usr/bin/chromium-browser",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  webServer: [
    {
      command: "pnpm --filter @sigilpanel/api dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: "pnpm --filter @sigilpanel/panel dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
