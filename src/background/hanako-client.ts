import { browserFetch } from "./browser-fetch.js";

export interface ExtensionHanakoClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface ExtensionImageCandidate {
  url: string;
  bytesBase64?: string;
  mediaType?: string;
  name?: string;
  pageUrl?: string;
  width?: number;
  height?: number;
  domIndex?: number;
  domId?: string;
}

export interface ExtensionJobDetail {
  job: {
    id: string;
    status?: string;
    source?: string;
  };
  pages?: unknown[];
  progress?: Array<{
    createdAt?: string;
    label?: string;
    message?: string;
    status?: string;
    step?: string;
  }>;
}

export interface TranslateImageInput extends ExtensionHanakoClientOptions {
  image: ExtensionImageCandidate;
  mode?: "auto" | "review";
  targetLanguage: string;
}

export interface TranslatePageInput extends ExtensionHanakoClientOptions {
  images: ExtensionImageCandidate[];
  mode?: "auto" | "review";
  targetLanguage: string;
}

export async function checkHanakoConnection({
  baseUrl,
  fetch: fetcher = browserFetch
}: ExtensionHanakoClientOptions): Promise<boolean> {
  const response = await fetcher(`${normalizeBaseUrl(baseUrl)}/healthz`);
  return response.ok;
}

export async function translateImage({
  baseUrl,
  fetch: fetcher = browserFetch,
  image,
  mode = "auto",
  targetLanguage
}: TranslateImageInput): Promise<ExtensionJobDetail> {
  return postExtensionJob({
    baseUrl,
    body: { image: toUploadImage(image), mode, targetLanguage },
    endpoint: "/api/extension/translate-image",
    fetch: fetcher
  });
}

export async function translatePage({
  baseUrl,
  fetch: fetcher = browserFetch,
  images,
  mode = "auto",
  targetLanguage
}: TranslatePageInput): Promise<ExtensionJobDetail> {
  return postExtensionJob({
    baseUrl,
    body: { images: images.map(toUploadImage), mode, targetLanguage },
    endpoint: "/api/extension/translate-page",
    fetch: fetcher
  });
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function toUploadImage(
  image: ExtensionImageCandidate
): ExtensionImageCandidate {
  if (!image.bytesBase64) {
    return image;
  }

  const uploadImage: Partial<ExtensionImageCandidate> = { ...image };
  delete uploadImage.url;
  return uploadImage as ExtensionImageCandidate;
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
