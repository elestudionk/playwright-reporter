import type { TestResult } from "@playwright/test/reporter";

import type { FailureCause } from "./origin";

/** One test's final outcome, as sent to nk.proof. */
export interface ReportedOutcome {
  key: string;
  status: TestResult["status"];
  durationMs: number;
  error: string | null;
  /** Origin of the failure; null when the test passed or attached no signals. */
  cause: FailureCause | null;
  steps: { title: string; status: "passed" | "failed" }[];
}

/** Higher is worse: a failure anywhere is what the case's result must show. */
const SEVERITY: Record<TestResult["status"], number> = {
  skipped: 0,
  passed: 1,
  interrupted: 2,
  timedOut: 3,
  failed: 3,
};

/**
 * Turns the runs of one test into one outcome. With several Playwright
 * projects (e.g. chromium and firefox) the same test, and so the same key,
 * ends once per project; nk.proof keeps the last outcome it receives, so a
 * chromium failure followed by a firefox pass would read as passed. This
 * holds each key until every project ran it and keeps the worst outcome.
 */
export class OutcomeMerger {
  private readonly waiting = new Map<string, { outcome: ReportedOutcome; seen: number }>();

  /** `expected`: how many tests share each key (one per project that runs it). */
  constructor(private readonly expected: Map<string, number>) {}

  /** The merged outcome once every run of its key ended, else null. */
  add(outcome: ReportedOutcome): ReportedOutcome | null {
    const held = this.waiting.get(outcome.key);
    const merged = held && SEVERITY[held.outcome.status] >= SEVERITY[outcome.status] ? held.outcome : outcome;
    const seen = (held?.seen ?? 0) + 1;
    if (seen >= (this.expected.get(outcome.key) ?? 1)) {
      this.waiting.delete(outcome.key);
      return merged;
    }
    this.waiting.set(outcome.key, { outcome: merged, seen });
    return null;
  }

  /** Outcomes still waiting for a project that never ran (e.g. an interrupted run). */
  drain(): ReportedOutcome[] {
    const outcomes = [...this.waiting.values()].map((entry) => entry.outcome);
    this.waiting.clear();
    return outcomes;
  }
}

/** `items` in order, `size` at a time: nk.proof caps how many results one request carries. */
export function inBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size));
  return batches;
}
