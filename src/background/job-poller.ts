import { normalizeBaseUrl } from "./hanako-client.js";
import { browserFetch } from "./browser-fetch.js";

export interface PollJobInput {
  jobId: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface ExtensionJobPollDetail {
  error?: {
    message?: string;
  };
  job: {
    id: string;
    status?: string;
  };
  pages?: Array<{
    id: string;
    renderedAssetId?: string;
  }>;
  progress?: ExtensionJobProgressEvent[];
}

export interface ExtensionJobProgressEvent {
  createdAt?: string;
  label?: string;
  message?: string;
  status?: string;
  step?: string;
}

export interface ExtensionJobPhaseDescription {
  message: string;
  phase: string;
}

export interface WaitForJobCompletionInput extends PollJobInput {
  delayMs?: number;
  maxAttempts?: number;
  onProgress?: (
    phase: ExtensionJobPhaseDescription,
    detail: ExtensionJobPollDetail
  ) => Promise<void> | void;
  requiredRenderedPages?: number;
}

export type WaitForJobCompletionResult =
  | { detail: ExtensionJobPollDetail; status: "completed" }
  | { detail: ExtensionJobPollDetail; status: "failed" }
  | { detail: ExtensionJobPollDetail; status: "timeout" };

export async function pollJobOnce({
  baseUrl,
  fetch: fetcher = browserFetch,
  jobId
}: PollJobInput): Promise<ExtensionJobPollDetail> {
  const response = await fetcher(
    `${normalizeBaseUrl(baseUrl)}/api/extension/jobs/${encodeURIComponent(jobId)}`
  );

  if (!response.ok) {
    throw new Error(`Hanako extension job poll failed with ${response.status}`);
  }

  return (await response.json()) as ExtensionJobPollDetail;
}

export function createRenderedPageUrl(input: {
  baseUrl: string;
  jobId: string;
  pageId: string;
}): string {
  return `${normalizeBaseUrl(input.baseUrl)}/api/jobs/${encodeURIComponent(
    input.jobId
  )}/pages/${encodeURIComponent(input.pageId)}/rendered`;
}

export async function waitForJobCompletion({
  baseUrl,
  delayMs = 2_000,
  fetch: fetcher = browserFetch,
  jobId,
  maxAttempts = 60,
  onProgress,
  requiredRenderedPages = 0
}: WaitForJobCompletionInput): Promise<WaitForJobCompletionResult> {
  let latest = await pollJobOnce({ baseUrl, fetch: fetcher, jobId });
  await onProgress?.(describeJobPhase(latest), latest);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (latest.job.status === "completed") {
      if (hasRequiredRenderedPages(latest, requiredRenderedPages)) {
        return { detail: latest, status: "completed" };
      }
    }

    if (latest.job.status === "failed" || latest.job.status === "cancelled") {
      return { detail: latest, status: "failed" };
    }

    if (attempt < maxAttempts) {
      await delay(delayMs);
      latest = await pollJobOnce({ baseUrl, fetch: fetcher, jobId });
      await onProgress?.(describeJobPhase(latest), latest);
    }
  }

  return { detail: latest, status: "timeout" };
}

export function describeJobPhase(
  detail: ExtensionJobPollDetail
): ExtensionJobPhaseDescription {
  const latestProgress = latestProgressEvent(detail.progress ?? []);

  if (latestProgress?.step) {
    return {
      message:
        latestProgress.message?.trim() ||
        latestProgress.label?.trim() ||
        humanizeIdentifier(latestProgress.step),
      phase: latestProgress.step
    };
  }

  const status = detail.job.status || "running";

  return {
    message: `Hanako job is ${humanizeIdentifier(status)}`,
    phase: status
  };
}

function hasRequiredRenderedPages(
  detail: ExtensionJobPollDetail,
  requiredRenderedPages: number
): boolean {
  if (requiredRenderedPages <= 0) {
    return true;
  }

  return (
    (detail.pages ?? []).filter((page) => Boolean(page.renderedAssetId))
      .length >= requiredRenderedPages
  );
}

function latestProgressEvent(
  progress: ExtensionJobProgressEvent[]
): ExtensionJobProgressEvent | undefined {
  return [...progress]
    .filter((event) => event.step)
    .sort(
      (left, right) =>
        timestampMillis(left.createdAt) - timestampMillis(right.createdAt)
    )
    .at(-1);
}

function timestampMillis(value: string | undefined): number {
  const timestamp = Date.parse(value ?? "");

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function humanizeIdentifier(value: string): string {
  return value.replace(/[_-]+/g, " ");
}

async function delay(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
