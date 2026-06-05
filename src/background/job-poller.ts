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
}

export interface WaitForJobCompletionInput extends PollJobInput {
  delayMs?: number;
  maxAttempts?: number;
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
  maxAttempts = 60
}: WaitForJobCompletionInput): Promise<WaitForJobCompletionResult> {
  let latest = await pollJobOnce({ baseUrl, fetch: fetcher, jobId });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (latest.job.status === "completed") {
      return { detail: latest, status: "completed" };
    }

    if (latest.job.status === "failed" || latest.job.status === "cancelled") {
      return { detail: latest, status: "failed" };
    }

    if (attempt < maxAttempts) {
      await delay(delayMs);
      latest = await pollJobOnce({ baseUrl, fetch: fetcher, jobId });
    }
  }

  return { detail: latest, status: "timeout" };
}

async function delay(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
