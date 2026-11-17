import { describe, expect, it } from "vitest";

import { STEP_ANNOTATION, caseDetails, detailsOf, stepAnnotation, withExpected } from "./case";

describe("caseDetails", () => {
  it("turns the case details into annotations, leaving out the empty ones", () => {
    expect(caseDetails({ description: " Checks X. ", preconditions: "", testData: "Monto: −100" })).toEqual([
      { type: "nkproof-description", description: "Checks X." },
      { type: "nkproof-test-data", description: "Monto: −100" },
    ]);
  });
});

describe("detailsOf", () => {
  it("reads the case details back from a test's annotations", () => {
    const annotations = [
      { type: "nkproof", description: "pulse.PAG-04" },
      ...caseDetails({ description: "Checks X.", preconditions: "Usuario Finanzas.", testData: "Monto: −100" }),
    ];
    expect(detailsOf(annotations)).toEqual({ description: "Checks X.", preconditions: "Usuario Finanzas.", testData: "Monto: −100" });
  });

  it("returns null when the test declares no details", () => {
    expect(detailsOf([{ type: "nkproof", description: "pulse.PAG-04" }])).toBeNull();
  });
});

describe("withExpected", () => {
  it("pairs each step with the expected result its step() declared", () => {
    const annotations = [stepAnnotation("Crear un pago de −100", "Responde 422."), stepAnnotation("Pedir los pagos", "No está el pago.")];
    const steps = [
      { title: "Crear un pago de −100", status: "passed" as const },
      { title: "Pedir los pagos", status: "failed" as const },
    ];
    expect(withExpected(steps, annotations)).toEqual([
      { title: "Crear un pago de −100", status: "passed", expected: "Responde 422." },
      { title: "Pedir los pagos", status: "failed", expected: "No está el pago." },
    ]);
  });

  it("pairs repeated step texts in order", () => {
    const annotations = [stepAnnotation("Tocar «Guardar»", "Aparece «Guardado»."), stepAnnotation("Tocar «Guardar»", "No cambia nada.")];
    const steps = [
      { title: "Tocar «Guardar»", status: "passed" as const },
      { title: "Tocar «Guardar»", status: "passed" as const },
    ];
    expect(withExpected(steps, annotations).map((step) => step.expected)).toEqual(["Aparece «Guardado».", "No cambia nada."]);
  });

  it("leaves the expected result null for a plain test.step and ignores malformed annotations", () => {
    const annotations = [{ type: STEP_ANNOTATION, description: "not json" }, { type: STEP_ANNOTATION }];
    expect(withExpected([{ title: "Abrir la lista", status: "passed" as const }], annotations)).toEqual([
      { title: "Abrir la lista", status: "passed", expected: null },
    ]);
  });
});
