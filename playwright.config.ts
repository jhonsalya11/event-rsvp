import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Local sandboxed dev host only: Playwright's own downloaded Chromium
    // build is missing system libs (libatk-1.0.so.0 etc.) that need sudo
    // to install, which isn't available here. Set PLAYWRIGHT_CHROME_PATH
    // to a working Chrome/Chromium binary to work around it locally.
    // Unset in CI — GitHub Actions runs `playwright install --with-deps`
    // and uses Playwright's own browser normally.
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
