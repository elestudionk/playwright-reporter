import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

/**
 * Playwright reporter for nk.proof.
 *
 * On start it sends every test (keyed by file › describe › title, or by an
 * `nkproof` annotation: a case code such as "PROOF-TC-003" links the test to
 * that case), then each final outcome with its `test.step`s and failure
 * screenshot, and finally closes the run. It never fails the test run: if nk.proof can't be reached it only
 * warns, so the CI gate depends on the tests alone.
 *
 * Configuration (reporter options win over environment variables):
 *   url / NKPROOF_URL         nk.proof origin, e.g. https://proof.nk.studio
 *   token / NKPROOF_TOKEN     the project's automation token (nkp_…)
 *   runId / NKPROOF_RUN_ID    a run nk.proof queued (button "Correr", schedules)
 *   source / NKPROOF_SOURCE   pr | deploy | schedule | dispatch | local
 *   environment / NKPROOF_ENVIRONMENT, prNumber / NKPROOF_PR,
 *   branch / NKPROOF_BRANCH, commitSha / NKPROOF_COMMIT, baseUrl / NKPROOF_BASE_URL
 */

export interface NkproofReporterOptions {
  url?: string;
  token?: string;
  runId?: string;
  source?: "pr" | "deploy" | "schedule" | "dispatch" | "local";
  environment?: string;
  prNumber?: number | string;
  branch?: string;
  commitSha?: string;
  baseUrl?: string;
  /** Run name in nk.proof; defaults to one built from the source. */
  name?: string;
}

interface ReportedResult {
  key: string;
  status: TestResult["status"];
  durationMs: number;
  error: string | null;
  steps: { title: string; status: "passed" | "failed" }[];
}

const BATCH_SIZE = 10;
const FLUSH_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 30_000;

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function log(message: string): void {
  console.log(`[nk.proof] ${message}`);
}

export default class NkproofReporter implements Reporter {
  private readonly url: string | undefined;
  private readonly token: string | undefined;
  private readonly options: NkproofReporterOptions;
  private rootDir = process.cwd();
  private runId: string | null = null;
  private runUrl: string | null = null;
  private resultIds = new Map<string, string>();
  private queue: ReportedResult[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Every request goes through this chain, so they reach nk.proof in order. */
  private chain: Promise<void> = Promise.resolve();
  private disabled = false;

  constructor(options: NkproofReporterOptions = {}) {
    this.options = options;
    this.url = (options.url ?? env("NKPROOF_URL"))?.replace(/\/+$/, "");
    this.token = options.token ?? env("NKPROOF_TOKEN");
    if (!this.url || !this.token) {
      this.disabled = true;
      log("Sin NKPROOF_URL o NKPROOF_TOKEN: los resultados no se reportan.");
    }
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    if (this.disabled) return;
    this.rootDir = config.rootDir;
    const seen = new Set<string>();
    const tests = suite.allTests().flatMap((test) => {
      const key = this.keyOf(test);
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          key,
          title: test.title,
          file: this.fileOf(test),
          line: test.location.line,
          suitePath: this.describesOf(test),
          tags: test.tags,
        },
      ];
    });
    if (tests.length === 0) return;

    const github = env("GITHUB_SERVER_URL") && env("GITHUB_REPOSITORY") && env("GITHUB_RUN_ID");
    const configBaseUrl = config.projects.find((project) => project.use.baseURL)?.use.baseURL;
    const body = {
      runId: this.options.runId ?? env("NKPROOF_RUN_ID") ?? null,
      name: this.options.name ?? null,
      source: this.options.source ?? env("NKPROOF_SOURCE") ?? (env("GITHUB_ACTIONS") ? "dispatch" : "local"),
      environment: this.options.environment ?? env("NKPROOF_ENVIRONMENT") ?? null,
      baseUrl: this.options.baseUrl ?? env("NKPROOF_BASE_URL") ?? configBaseUrl ?? null,
      commitSha: this.options.commitSha ?? env("NKPROOF_COMMIT") ?? env("GITHUB_SHA") ?? null,
      branch: this.options.branch ?? env("NKPROOF_BRANCH") ?? env("GITHUB_HEAD_REF") ?? env("GITHUB_REF_NAME") ?? null,
      prNumber: Number(this.options.prNumber ?? env("NKPROOF_PR")) || null,
      externalUrl: github
        ? `${env("GITHUB_SERVER_URL")}/${env("GITHUB_REPOSITORY")}/actions/runs/${env("GITHUB_RUN_ID")}`
        : null,
      tests,
    };

    this.enqueue(async () => {
      const started = await this.request<{ runId: string; runUrl: string; results: Record<string, string> }>(
        "/api/automation/runs",
        body,
      );
      if (!started) {
        this.disabled = true;
        return;
      }
      this.runId = started.runId;
      this.runUrl = started.runUrl;
      this.resultIds = new Map(Object.entries(started.results));
      const linked = this.resultIds.size;
      log(`Reportando ${tests.length} tests (${linked} vinculados a casos) en ${started.runUrl}`);
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (this.disabled) return;
    // With retries, only the last attempt counts.
    const final = result.status === "passed" || result.status === "skipped" || result.retry >= test.retries;
    if (!final) return;

    const key = this.keyOf(test);
    const expectedFailure = test.expectedStatus === "failed" && result.status === "failed";
    const screenshot = result.attachments.find(
      (attachment) => attachment.name === "screenshot" && attachment.path && attachment.contentType.startsWith("image/"),
    )?.path;

    this.enqueue(async () => {
      if (!this.runId) return;
      // Only tests linked to a case have a result (and can keep a screenshot).
      const resultId = this.resultIds.get(key);
      this.queue.push({
        key,
        status: expectedFailure ? "passed" : result.status,
        durationMs: result.duration,
        error: expectedFailure ? null : (result.error?.message ?? result.error?.value ?? null),
        steps: result.steps.filter((step) => step.category === "test.step").map((step: TestStep) => ({
          title: step.title,
          status: step.error ? "failed" : "passed",
        })),
      });
      if (resultId && result.status !== "passed" && screenshot) await this.uploadScreenshot(resultId, screenshot);
      if (this.queue.length >= BATCH_SIZE) await this.flush();
      else this.scheduleFlush();
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.chain;
    if (this.disabled || !this.runId) return;
    await this.flush();
    const finished = await this.request<{ verdict: string; runUrl: string }>(
      `/api/automation/runs/${this.runId}/finish`,
      { status: result.status },
    );
    if (!finished) return;

    const verdict = finished.verdict === "passed" ? "Pasa" : finished.verdict === "failed" ? "No pasa" : "En curso";
    log(`Veredicto: ${verdict} · ${finished.runUrl}`);
    const summary = env("GITHUB_STEP_SUMMARY");
    if (summary) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(summary, `### nk.proof: ${verdict}\n\n[Ver la ejecución en nk.proof](${finished.runUrl})\n`).catch(
        () => undefined,
      );
    }
  }

  // -------------------------------------------------------------------------

  /** `nkproof` annotation if present, else "file › describe › title". */
  private keyOf(test: TestCase): string {
    const annotated = test.annotations.find((annotation) => annotation.type === "nkproof")?.description?.trim();
    if (annotated) return annotated;
    return [this.fileOf(test), ...this.describesOf(test), test.title].join(" › ");
  }

  private fileOf(test: TestCase): string {
    return path.relative(this.rootDir, test.location.file).split(path.sep).join("/");
  }

  private describesOf(test: TestCase): string[] {
    const titles: string[] = [];
    for (let parent: Suite | undefined = test.parent; parent && parent.type === "describe"; parent = parent.parent) {
      if (parent.title) titles.unshift(parent.title);
    }
    return titles;
  }

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch((error: unknown) => {
      log(`Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueue(() => this.flush());
    }, FLUSH_DELAY_MS);
  }

  private async flush(): Promise<void> {
    if (!this.runId || this.queue.length === 0) return;
    const results = this.queue.splice(0);
    await this.request(`/api/automation/runs/${this.runId}/results`, { results });
  }

  private async uploadScreenshot(resultId: string, filePath: string): Promise<void> {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(await readFile(filePath))], { type: "image/png" }), path.basename(filePath));
      await this.request(`/api/automation/results/${resultId}/attachments`, form);
    } catch (error) {
      log(`No se pudo subir la captura: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** POSTs to nk.proof; returns the JSON answer, or null (after a warning) on any failure. */
  private async request<T>(pathname: string, body: unknown): Promise<T | null> {
    try {
      const isForm = body instanceof FormData;
      const response = await fetch(`${this.url}${pathname}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(isForm ? {} : { "content-type": "application/json" }),
        },
        body: isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const answer = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!response.ok) {
        log(`nk.proof respondió ${response.status}: ${answer?.error ?? "sin detalle"}`);
        return null;
      }
      return answer;
    } catch (error) {
      log(`No se pudo contactar a nk.proof: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
