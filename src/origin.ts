/**
 * Where a failure comes from, judged only from what the browser saw during
 * the test. It never guesses: without evidence the origin is "unknown".
 */

/** What the `test` fixtures of this package observe while a test runs. */
export interface FailureSignals {
  /** Whether the test got a browser context (false when the browser never started). */
  browser: boolean;
  /** Whether the test created a page in that context. */
  page: boolean;
  /** Responses with a 5xx status, as "METHOD /path → status". */
  serverErrors: string[];
  /** Uncaught JavaScript errors of the pages. */
  pageErrors: string[];
}

export type FailureOrigin = "backend" | "frontend" | "unknown";

export interface FailureCause {
  origin: FailureOrigin;
  /** What supports the origin, most relevant first; empty for "unknown". */
  evidence: string[];
}

/** Name of the attachment that carries the signals from the test to the reporter. */
export const SIGNALS_ATTACHMENT = "nkproof-signals";

/** How many entries of each kind are kept: enough to point at the problem. */
export const SIGNALS_MAX = 5;
const EVIDENCE_MAX_LENGTH = 300;

export function emptySignals(): FailureSignals {
  return { browser: false, page: false, serverErrors: [], pageErrors: [] };
}

/** Adds `entry` once, shortened, while there is room. */
export function addSignal(list: string[], entry: string): void {
  const text = entry.split("\n")[0]!.trim().slice(0, EVIDENCE_MAX_LENGTH);
  if (text && list.length < SIGNALS_MAX && !list.includes(text)) list.push(text);
}

/** "METHOD /path → status": the query string is left out, it can carry personal data. */
export function describeResponse(method: string, url: string, status: number): string {
  let target = url;
  try {
    target = new URL(url).pathname;
  } catch {
    target = url.split("?")[0]!;
  }
  return `${method} ${target} → ${status}`;
}

/**
 * - a 5xx response: the server failed, so "backend" (even if the page also
 *   threw, which is usually a consequence);
 * - a browser context but no page: the test only talks to an API with the
 *   session of that context, so "backend". Without a context nothing is
 *   known (the browser may not even have started), so that stays "unknown";
 * - an uncaught JavaScript error and no 5xx: "frontend";
 * - anything else (e.g. a wrong value with every response OK): "unknown".
 */
export function classifyFailure(signals: FailureSignals): FailureCause {
  if (signals.serverErrors.length > 0) return { origin: "backend", evidence: signals.serverErrors };
  if (signals.browser && !signals.page) return { origin: "backend", evidence: ["El test solo llama a la API: no abrió ninguna página."] };
  if (signals.pageErrors.length > 0) return { origin: "frontend", evidence: signals.pageErrors };
  return { origin: "unknown", evidence: [] };
}

/** The signals a test attached, or null when it attached none (or something else). */
export function parseSignals(body: string | undefined): FailureSignals | null {
  if (!body) return null;
  try {
    const value = JSON.parse(body) as Partial<FailureSignals> | null;
    if (!value || typeof value !== "object") return null;
    const list = (items: unknown) =>
      Array.isArray(items) ? items.filter((item): item is string => typeof item === "string").slice(0, SIGNALS_MAX) : [];
    return { browser: value.browser === true, page: value.page === true, serverErrors: list(value.serverErrors), pageErrors: list(value.pageErrors) };
  } catch {
    return null;
  }
}
