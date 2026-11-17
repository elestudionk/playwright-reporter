/**
 * What a test declares about its case, so nk.proof can build a case a person
 * can follow: a description, preconditions, test data, and the expected result
 * of each step. The details are static annotations on the test; the expected
 * results are annotations `step()` adds while the test runs.
 */

export interface CaseDetails {
  /** One sentence with the goal: what the case checks and why it matters. */
  description?: string;
  /** The exact state before step 1: user and permissions, data that must exist, starting screen. */
  preconditions?: string;
  /** Concrete values the case uses (see docs/qa-guia-casos.md for the field format). */
  testData?: string;
}

export interface Annotation {
  type: string;
  description?: string;
}

const DETAIL_TYPES = {
  description: "nkproof-description",
  preconditions: "nkproof-preconditions",
  testData: "nkproof-test-data",
} as const satisfies Record<keyof CaseDetails, string>;

/** Added by `step()` with the step's action and expected result. */
export const STEP_ANNOTATION = "nkproof-step";

/** Annotations for `test(title, { annotation: caseDetails({...}) }, body)`. Empty fields are left out. */
export function caseDetails(details: CaseDetails): Annotation[] {
  return (Object.keys(DETAIL_TYPES) as (keyof CaseDetails)[]).flatMap((field) => {
    const value = details[field]?.trim();
    return value ? [{ type: DETAIL_TYPES[field], description: value }] : [];
  });
}

/** The case details a test declared, or null when it declared none. */
export function detailsOf(annotations: readonly Annotation[]): Required<CaseDetails> | null {
  const read = (type: string) => annotations.find((annotation) => annotation.type === type)?.description?.trim() ?? "";
  const details = {
    description: read(DETAIL_TYPES.description),
    preconditions: read(DETAIL_TYPES.preconditions),
    testData: read(DETAIL_TYPES.testData),
  };
  return Object.values(details).some(Boolean) ? details : null;
}

export function stepAnnotation(action: string, expected: string): Annotation {
  return { type: STEP_ANNOTATION, description: JSON.stringify({ action, expected }) };
}

function parseStep(annotation: Annotation): { action: string; expected: string } | null {
  if (annotation.type !== STEP_ANNOTATION || !annotation.description) return null;
  try {
    const value = JSON.parse(annotation.description) as unknown;
    if (!value || typeof value !== "object") return null;
    const { action, expected } = value as Record<string, unknown>;
    return typeof action === "string" && typeof expected === "string" ? { action, expected } : null;
  } catch {
    return null;
  }
}

/**
 * Adds to each reported step the expected result its `step()` declared,
 * matching by text in order (a repeated text takes the next one). A plain
 * `test.step` has no expected result: null.
 */
export function withExpected<T extends { title: string }>(
  steps: readonly T[],
  annotations: readonly Annotation[],
): (T & { expected: string | null })[] {
  const pending = annotations.map(parseStep).filter((step): step is { action: string; expected: string } => step !== null);
  return steps.map((step) => {
    const index = pending.findIndex((declared) => declared.action === step.title);
    const expected = index === -1 ? null : pending.splice(index, 1)[0]!.expected.trim() || null;
    return { ...step, expected };
  });
}
