import type { ExtensionImageCandidate } from "./hanako-client.js";
import { browserFetch } from "./browser-fetch.js";

export interface ImageBytesPayload {
  bytesBase64: string;
  mediaType: string;
  name?: string;
}

export type FetchImageBytes = (
  image: ExtensionImageCandidate
) => Promise<ImageBytesPayload | undefined>;

export async function fetchImageBytes(
  image: ExtensionImageCandidate,
  fetcher: typeof fetch = browserFetch
): Promise<ImageBytesPayload | undefined> {
  if (!image.url || !isHttpUrl(image.url)) {
    return undefined;
  }

  const response = await fetcher(image.url, {
    credentials: "omit",
    redirect: "follow",
    ...referrerInitFor(image.pageUrl)
  });

  if (!response.ok) {
    return undefined;
  }

  const mediaType = normalizeMediaType(response.headers.get("content-type"));

  if (!isSupportedImageMediaType(mediaType)) {
    return undefined;
  }

  return {
    bytesBase64: arrayBufferToBase64(await response.arrayBuffer()),
    mediaType,
    ...(nameFromUrl(image.url) ? { name: nameFromUrl(image.url) } : {})
  };
}

export async function withImageBytes(
  image: ExtensionImageCandidate,
  fetcher: FetchImageBytes = fetchImageBytes
): Promise<ExtensionImageCandidate> {
  if (hasSupportedImageBytes(image)) {
    return image;
  }

  const payload = await fetcher(image).catch(() => undefined);
  return payload ? { ...image, ...payload } : image;
}

export async function withRequiredImageBytes(
  image: ExtensionImageCandidate,
  fetcher: FetchImageBytes = fetchImageBytes
): Promise<ExtensionImageCandidate> {
  if (hasSupportedImageBytes(image)) {
    return image;
  }

  const payload = await fetcher(image).catch(() => undefined);

  if (!payload) {
    throw new Error("The extension could not extract bytes for this image");
  }

  return { ...image, ...payload };
}

function hasSupportedImageBytes(image: ExtensionImageCandidate): boolean {
  return Boolean(
    image.bytesBase64 &&
    image.mediaType &&
    isSupportedImageMediaType(normalizeMediaType(image.mediaType))
  );
}

function normalizeMediaType(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSupportedImageMediaType(mediaType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(mediaType);
}

function isHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function referrerInitFor(
  pageUrl: string | undefined
): Pick<RequestInit, "referrer" | "referrerPolicy"> {
  if (!pageUrl || !isHttpUrl(pageUrl)) {
    return {};
  }

  return {
    referrer: pageUrl,
    referrerPolicy: "no-referrer-when-downgrade"
  };
}

function nameFromUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const rawName = url.pathname.split("/").filter(Boolean).at(-1);
    return rawName
      ? decodeURIComponent(rawName).replace(/[^A-Za-z0-9._-]+/g, "_")
      : undefined;
  } catch {
    return undefined;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
