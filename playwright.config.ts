import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (`npm run build` first) so the service
// worker and offline cache are exercised.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  // Each test drives 2–3 browser contexts doing real crypto; more parallel
  // workers starve WebKit on Windows and turn waits into timeouts.
  workers: 3,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["iPhone 14"] } },
    // Playwright has no mobile emulation for Firefox; use a phone-sized viewport.
    { name: "firefox", use: { browserName: "firefox", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
