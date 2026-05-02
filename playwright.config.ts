import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "tests/report", open: "never" }]],
  use: {
    baseURL: "http://localhost:5000",
    headless: false,          // show the browser window
    slowMo: 300,              // slight slow-mo so it's visually followable
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
