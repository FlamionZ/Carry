import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

// Runs against the production build (`npm run build` first) so the service
// worker, offline cache and production response headers are exercised.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  // Each test drives 2–3 browser contexts doing real crypto. On a busy desktop
  // with little free memory, more parallel workers turn waits into timeouts.
  workers: CI ? 3 : 2,
  expect: { timeout: 15_000 },
  forbidOnly: CI,
  // One retry on CI; a test that needs it is reported as flaky, not hidden.
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"] } },
    // WebKit is the heaviest engine here; two of its multi-phone tests at once
    // stalled clicks for minutes under memory pressure.
    { name: "webkit", use: { ...devices["iPhone 14"] }, workers: 1 },
    // Playwright has no mobile emulation for Firefox; use a phone-sized viewport.
    { name: "firefox", use: { browserName: "firefox", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !CI,
  },
});
