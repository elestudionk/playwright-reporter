import { describe, expect, it } from "vitest";

import { addSignal, classifyFailure, describeResponse, emptySignals, parseSignals, SIGNALS_MAX } from "./origin";

const signals = (patch: Partial<ReturnType<typeof emptySignals>>) => ({ ...emptySignals(), browser: true, page: true, ...patch });

describe("classifyFailure", () => {
  it("a 5xx response is a backend failure, with the response as evidence", () => {
    expect(classifyFailure(signals({ serverErrors: ["POST /api/pay → 500"] }))).toEqual({
      origin: "backend",
      evidence: ["POST /api/pay → 500"],
    });
  });

  it("a 5xx response wins over a page error it probably caused", () => {
    const cause = classifyFailure(signals({ serverErrors: ["GET /api/x → 502"], pageErrors: ["TypeError: x is undefined"] }));
    expect(cause.origin).toBe("backend");
  });

  it("a browser context without a page only talks to an API: backend", () => {
    expect(classifyFailure(signals({ page: false })).origin).toBe("backend");
  });

  it("without a browser context nothing was observed: unknown", () => {
    expect(classifyFailure(emptySignals())).toEqual({ origin: "unknown", evidence: [] });
  });

  it("an uncaught page error without a 5xx is a frontend failure", () => {
    expect(classifyFailure(signals({ pageErrors: ["TypeError: x is undefined"] }))).toEqual({
      origin: "frontend",
      evidence: ["TypeError: x is undefined"],
    });
  });

  it("never guesses: a page with no errors is unknown", () => {
    expect(classifyFailure(signals({}))).toEqual({ origin: "unknown", evidence: [] });
  });
});

describe("describeResponse", () => {
  it("leaves the query string out", () => {
    expect(describeResponse("GET", "https://app.test/api/users?email=a@b.c", 500)).toBe("GET /api/users → 500");
  });
});

describe("addSignal", () => {
  it("keeps the first line, once, up to the limit", () => {
    const list: string[] = [];
    addSignal(list, "TypeError: boom\n    at stack");
    addSignal(list, "TypeError: boom");
    expect(list).toEqual(["TypeError: boom"]);
    for (let index = 0; index < SIGNALS_MAX + 3; index++) addSignal(list, `error ${index}`);
    expect(list).toHaveLength(SIGNALS_MAX);
  });
});

describe("parseSignals", () => {
  it("reads what the test attached", () => {
    const attached = signals({ serverErrors: ["GET /x → 500"] });
    expect(parseSignals(JSON.stringify(attached))).toEqual(attached);
  });

  it("is null for a missing or broken attachment", () => {
    expect(parseSignals(undefined)).toBeNull();
    expect(parseSignals("not json")).toBeNull();
    expect(parseSignals("null")).toBeNull();
  });

  it("drops entries that are not text", () => {
    expect(parseSignals('{"browser":true,"page":true,"serverErrors":[1,"GET /x → 500"],"pageErrors":"no"}')).toEqual({
      browser: true,
      page: true,
      serverErrors: ["GET /x → 500"],
      pageErrors: [],
    });
  });
});
