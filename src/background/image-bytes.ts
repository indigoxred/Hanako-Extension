import type { ExtensionImageCandidate } from "./hanako-client.js";

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
  fetcher: typeof fetch = fetch
): Promise<ImageBytesPayload | undefined> {
  if (!image.url || !isHttpUrl(image.url)) {
    return undefined;
  }

  const response = await fetcher(image.url, {
    credentials: "include",
    redirect: "follow"
  });

  if (!response.ok) {
    return undefined;
  }

  const mediaType = normalizeMediaType(response.headers.get("content-type"));

  if (!mediaType.startsWith("image/")) {
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
  const payload = await fetcher(image).catch(() => undefined);
  return payload ? { ...image, ...payload } : image;
}

function normalizeMediaType(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function isHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
