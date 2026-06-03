import { normalizeBaseUrl } from "./hanako-client.js";

export interface PollJobInput {
  jobId: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export async function pollJobOnce({
  baseUrl,
  fetch: fetcher = fetch,
  jobId
}: PollJobInput): Promise<unknown> {
  const response = await fetcher(
    `${normalizeBaseUrl(baseUrl)}/api/extension/jobs/${encodeURIComponent(jobId)}`
  );

  if (!response.ok) {
    throw new Error(`Hanako extension job poll failed with ${response.status}`);
  }

  return response.json();
}
