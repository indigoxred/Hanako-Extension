export interface ExtensionHanakoClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface ExtensionImageCandidate {
  url: string;
  pageUrl?: string;
  width?: number;
  height?: number;
  domIndex?: number;
}

export interface ExtensionJobDetail {
  job: {
    id: string;
    status?: string;
    source?: string;
  };
  pages?: unknown[];
}

export interface TranslateImageInput extends ExtensionHanakoClientOptions {
  image: ExtensionImageCandidate;
  targetLanguage: string;
}

export interface TranslatePageInput extends ExtensionHanakoClientOptions {
  images: ExtensionImageCandidate[];
  targetLanguage: string;
}

export async function checkHanakoConnection({
  baseUrl,
  fetch: fetcher = fetch
}: ExtensionHanakoClientOptions): Promise<boolean> {
  const response = await fetcher(`${normalizeBaseUrl(baseUrl)}/healthz`);
  return response.ok;
}

export async function translateImage({
  baseUrl,
  fetch: fetcher = fetch,
  image,
  targetLanguage
}: TranslateImageInput): Promise<ExtensionJobDetail> {
  return postExtensionJob({
    baseUrl,
    body: { image, targetLanguage },
    endpoint: "/api/extension/translate-image",
    fetch: fetcher
  });
}

export async function translatePage({
  baseUrl,
  fetch: fetcher = fetch,
  images,
  targetLanguage
}: TranslatePageInput): Promise<ExtensionJobDetail> {
  return postExtensionJob({
    baseUrl,
    body: { images, targetLanguage },
    endpoint: "/api/extension/translate-page",
    fetch: fetcher
  });
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function postExtensionJob(input: {
  baseUrl: string;
  body: unknown;
  endpoint: string;
  fetch: typeof fetch;
}): Promise<ExtensionJobDetail> {
  const response = await input.fetch(
    `${normalizeBaseUrl(input.baseUrl)}${input.endpoint}`,
    {
      body: JSON.stringify(input.body),
      headers: { "content-type": "application/json" },
      method: "POST"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Hanako extension job request failed with ${response.status}`
    );
  }

  return (await response.json()) as ExtensionJobDetail;
}
