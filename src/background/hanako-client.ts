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

export interface GlossaryScope {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface GlossaryScopesResponse {
  scopes: GlossaryScope[];
}

export interface ExtensionGlossarySelection {
  autoGlossaryStorageScopeId?: string | null;
  glossaryScopeIds?: string[];
}

export interface TranslateImageInput extends ExtensionHanakoClientOptions {
  autoGlossaryStorageScopeId?: string | null;
  glossaryScopeIds?: string[];
  image: ExtensionImageCandidate;
  mode?: "auto" | "review";
  targetLanguage: string;
}

export interface TranslatePageInput extends ExtensionHanakoClientOptions {
  autoGlossaryStorageScopeId?: string | null;
  glossaryScopeIds?: string[];
  images: ExtensionImageCandidate[];
  mode?: "auto" | "review";
  targetLanguage: string;
}

export interface GetGlossaryScopesInput extends ExtensionHanakoClientOptions {
  targetLanguage?: string;
}

export async function checkHanakoConnection({
  baseUrl,
  fetch: fetcher = browserFetch
}: ExtensionHanakoClientOptions): Promise<boolean> {
  const response = await fetcher(`${normalizeBaseUrl(baseUrl)}/healthz`);
  return response.ok;
}

export async function getGlossaryScopes({
  baseUrl,
  fetch: fetcher = browserFetch,
  targetLanguage
}: GetGlossaryScopesInput): Promise<GlossaryScopesResponse> {
  const params = new URLSearchParams();

  if (targetLanguage?.trim()) {
    params.set("targetLanguage", targetLanguage.trim());
  }

  const query = params.toString();
  const response = await fetcher(
    `${normalizeBaseUrl(baseUrl)}/api/glossary/scopes${query ? `?${query}` : ""}`
  );

  if (!response.ok) {
    throw new Error(`Hanako glossary scope request failed with ${response.status}`);
  }

  return (await response.json()) as GlossaryScopesResponse;
}

export async function translateImage({
  autoGlossaryStorageScopeId,
  baseUrl,
  fetch: fetcher = browserFetch,
  glossaryScopeIds,
  image,
  mode = "auto",
  targetLanguage
}: TranslateImageInput): Promise<ExtensionJobDetail> {
  return postExtensionJob({
    baseUrl,
    body: {
      ...glossarySelectionPayload({
        autoGlossaryStorageScopeId,
        glossaryScopeIds
      }),
      image: toUploadImage(image),
      mode,
      targetLanguage
    },
    endpoint: "/api/extension/translate-image",
    fetch: fetcher
  });
}

export async function translatePage({
  autoGlossaryStorageScopeId,
  baseUrl,
  fetch: fetcher = browserFetch,
  glossaryScopeIds,
  images,
  mode = "auto",
  targetLanguage
}: TranslatePageInput): Promise<ExtensionJobDetail> {
  return postExtensionJob({
    baseUrl,
    body: {
      ...glossarySelectionPayload({
        autoGlossaryStorageScopeId,
        glossaryScopeIds
      }),
      images: images.map(toUploadImage),
      mode,
      targetLanguage
    },
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

function glossarySelectionPayload(
  selection: ExtensionGlossarySelection
): ExtensionGlossarySelection {
  const glossaryScopeIds = compactStringArray(selection.glossaryScopeIds);
  const autoGlossaryStorageScopeId = stringOrNull(
    selection.autoGlossaryStorageScopeId
  );

  return {
    ...(autoGlossaryStorageScopeId ? { autoGlossaryStorageScopeId } : {}),
    ...(glossaryScopeIds.length > 0 ? { glossaryScopeIds } : {})
  };
}

function compactStringArray(value: string[] | undefined): string[] {
  return [
    ...new Set(
      (value ?? []).flatMap((item) => {
        const trimmed = item.trim();
        return trimmed ? [trimmed] : [];
      })
    )
  ];
}

function stringOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
