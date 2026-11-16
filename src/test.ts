import { test as base, expect, type Page } from "@playwright/test";

import { SIGNALS_ATTACHMENT, addSignal, describeResponse, emptySignals, type FailureSignals } from "./origin";

/**
 * Playwright's `test` for projects reported to nk.proof. Import `test` and
 * `expect` from "@estudio-nk/playwright-reporter/test" instead of
 * "@playwright/test":
 *
 * - Deploy previews load without the toolbars Netlify and Vercel inject. They
 *   are not part of the app and keep the network busy (the Netlify Drawer
 *   streams videos), so a test never fails because of them.
 * - `openPage(url)` opens a page and waits until it is ready to use: until
 *   `readySelector` is on the page when the project sets it, otherwise until
 *   the page has loaded. Use it instead of `page.goto` plus
 *   `waitForLoadState("networkidle")`, which Playwright discourages: any
 *   request that keeps going (analytics, a chat widget, polling) makes it hang.
 * - When a test fails, what the browser saw (5xx responses, uncaught page
 *   errors, whether it used a page at all) is attached to it, and the
 *   reporter turns that into the failure's origin: backend, frontend or unknown.
 */

/** Requests of the deploy-preview toolbars: the Netlify Drawer and the Vercel Toolbar. */
export const PREVIEW_TOOLBAR_URLS = ["**/.netlify/scripts/cdp*", "https://app.netlify.com/**", "https://vercel.live/**"];

export interface NkproofOptions {
  /**
   * CSS selector that appears once the app is interactive, e.g.
   * "html[data-hydrated]" set by the app after hydration. Without it,
   * `openPage` waits for the load event.
   */
  readySelector: string | undefined;
}

/** Waits for `readySelector` with the test's own timeout (hydration can be slow on a busy CI runner). */
async function waitUntilReady(page: Page, readySelector: string | undefined): Promise<void> {
  if (readySelector) await page.locator(readySelector).waitFor({ state: "attached" });
}

export interface NkproofFixtures {
  /** Opens `url` (relative to baseURL) and waits until the page is ready to use. */
  openPage: (url: string) => Promise<void>;
  /** Reloads the page and waits until it is ready to use. */
  reloadPage: () => Promise<void>;
}

interface InternalFixtures {
  /** What the browser sees during the test; attached when the test fails. */
  nkproofSignals: FailureSignals;
}

// Fixtures receive `provide` (Playwright's `use`, renamed so React's hook lint leaves it alone).
export const test = base.extend<NkproofFixtures & NkproofOptions & InternalFixtures>({
  readySelector: [undefined, { option: true }],
  // Automatic and independent of the browser: a test that never gets a
  // context still reports that nothing was observed.
  nkproofSignals: [
    async ({}, provide, testInfo) => {
      const signals = emptySignals();
      await provide(signals);
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach(SIGNALS_ATTACHMENT, { body: JSON.stringify(signals), contentType: "application/json" });
      }
    },
    { auto: true },
  ],
  context: async ({ context, nkproofSignals }, provide) => {
    for (const url of PREVIEW_TOOLBAR_URLS) await context.route(url, (route) => route.abort());
    context.on("response", (response) => {
      if (response.status() >= 500) {
        addSignal(nkproofSignals.serverErrors, describeResponse(response.request().method(), response.url(), response.status()));
      }
    });
    context.on("weberror", (webError) => addSignal(nkproofSignals.pageErrors, webError.error().message));
    context.on("page", () => {
      nkproofSignals.page = true;
    });
    nkproofSignals.browser = true;
    await provide(context);
  },
  openPage: async ({ page, readySelector }, provide) => {
    await provide(async (url) => {
      await page.goto(url);
      await waitUntilReady(page, readySelector);
    });
  },
  reloadPage: async ({ page, readySelector }, provide) => {
    await provide(async () => {
      await page.reload();
      await waitUntilReady(page, readySelector);
    });
  },
});

export { expect };
