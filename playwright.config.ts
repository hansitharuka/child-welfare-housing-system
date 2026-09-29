import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "si-LK",
    timezoneId: "Asia/Colombo",
  },
  projects: [
    {
      name: "chromium",
      // Screens are designed for office desktops first (UI-2).
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // CI tests the standalone production build (run `npm run build` first); locally the dev server is used.
    command: process.env.CI ? "npm run start:standalone" : `npm run dev -- -p ${PORT}`,
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
