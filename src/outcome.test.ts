import { describe, expect, it } from "vitest";

import { OutcomeMerger, inBatches, type ReportedOutcome } from "./outcome";

function outcome(status: ReportedOutcome["status"], error: string | null = null): ReportedOutcome {
  return { key: "login", status, durationMs: 100, error, cause: null, steps: [] };
}

describe("OutcomeMerger", () => {
  it("passes a test that runs once straight through", () => {
    const merger = new OutcomeMerger(new Map([["login", 1]]));
    expect(merger.add(outcome("passed"))).toEqual(outcome("passed"));
  });

  it("waits for every project that runs the test and keeps the worst outcome", () => {
    const merger = new OutcomeMerger(new Map([["login", 2]]));
    expect(merger.add(outcome("failed", "chromium: timeout"))).toBeNull();
    expect(merger.add(outcome("passed"))).toEqual(outcome("failed", "chromium: timeout"));
  });

  it("a later failure beats an earlier pass", () => {
    const merger = new OutcomeMerger(new Map([["login", 2]]));
    merger.add(outcome("passed"));
    expect(merger.add(outcome("timedOut", "firefox"))?.status).toBe("timedOut");
  });

  it("ranks failed over interrupted over passed over skipped", () => {
    const merger = new OutcomeMerger(new Map([["login", 4]]));
    merger.add(outcome("skipped"));
    merger.add(outcome("passed"));
    merger.add(outcome("interrupted"));
    expect(merger.add(outcome("failed"))?.status).toBe("failed");
  });

  it("hands over what is still waiting when the run ends", () => {
    const merger = new OutcomeMerger(new Map([["login", 3]]));
    merger.add(outcome("passed"));
    expect(merger.drain()).toEqual([outcome("passed")]);
    expect(merger.drain()).toEqual([]);
  });

  it("reports tests it was not told about right away", () => {
    const merger = new OutcomeMerger(new Map());
    expect(merger.add(outcome("passed"))).toEqual(outcome("passed"));
  });
});

describe("inBatches", () => {
  it("splits a long queue into requests of at most `size`", () => {
    const sizes = inBatches(Array.from({ length: 250 }, (_, index) => index), 10).map((batch) => batch.length);
    expect(sizes).toHaveLength(25);
    expect(Math.max(...sizes)).toBe(10);
  });

  it("keeps the order and sends nothing for an empty queue", () => {
    expect(inBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(inBatches([], 10)).toEqual([]);
  });
});
