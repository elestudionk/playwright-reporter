import { defineConfig, devices } from "@playwright/test";
import type { NkproofOptions } from "@nkstudio/playwright-reporter/test";

/**
 * Example config for a client project. BASE_URL is set by the workflow
 * (the deploy preview, or the URL chosen in nk.proof).
 */
export default defineConfig<NkproofOptions>({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [[process.env.CI ? "github" : "list"], ["@nkstudio/playwright-reporter"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // If the app marks when it is interactive (e.g. <html data-hydrated> set
    // after hydration), openPage waits for it. Without it, it waits for load.
    // readySelector: "html[data-hydrated]",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
