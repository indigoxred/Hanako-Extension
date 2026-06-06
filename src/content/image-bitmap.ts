export interface CapturedImageBytes {
  bytesBase64: string;
  mediaType: string;
  name?: string;
}

export interface LocatedImageElementRect {
  height: number;
  left: number;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
}

export async function captureImageBytesBySource(
  sourceUrl: string,
  documentRef: Document = document
): Promise<CapturedImageBytes | undefined> {
  const image = Array.from(documentRef.querySelectorAll("img")).find(
    (candidate) => imageMatchesSource(candidate, sourceUrl, documentRef)
  );

  return image ? captureImageBitmapFromElement(image, documentRef) : undefined;
}

export function locateImageElementBySource(
  sourceUrl: string,
  documentRef: Document = document
): LocatedImageElementRect | undefined {
  const image = Array.from(documentRef.querySelectorAll("img")).find(
    (candidate) => imageMatchesSource(candidate, sourceUrl, documentRef)
  );

  if (!image) {
    return undefined;
  }

  const rect = image.getBoundingClientRect();
  const view = documentRef.defaultView ?? window;

  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    viewportHeight: view.innerHeight,
    viewportWidth: view.innerWidth,
    width: rect.width
  };
}

export async function captureImageBitmapFromElement(
  image: HTMLImageElement,
  documentRef: Document = document
): Promise<CapturedImageBytes | undefined> {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  try {
    const canvas = documentRef.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/png");

    if (!blob) {
      return undefined;
    }

    const name = nameFromImage(image, documentRef);

    return {
      bytesBase64: arrayBufferToBase64(await blob.arrayBuffer()),
      mediaType: blob.type || "image/png",
      ...(name ? { name } : {})
    };
  } catch {
    return undefined;
  }
}

function imageMatchesSource(
  image: HTMLImageElement,
  sourceUrl: string,
  documentRef: Document
): boolean {
  const sources = [
    image.currentSrc,
    image.src,
    image.getAttribute("src") ?? undefined
  ].filter(
    (source): source is string => source !== undefined && source.length > 0
  );

  return sources.some(
    (source) =>
      source === sourceUrl ||
      toAbsoluteUrl(source, documentRef) ===
        toAbsoluteUrl(sourceUrl, documentRef)
  );
}

function toAbsoluteUrl(
  rawUrl: string,
  documentRef: Document
): string | undefined {
  try {
    return new URL(rawUrl, documentRef.location.href).href;
  } catch {
    return undefined;
  }
}

function nameFromImage(
  image: HTMLImageElement,
  documentRef: Document
): string | undefined {
  const rawUrl = image.currentSrc || image.src || image.getAttribute("src");

  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl, documentRef.location.href);
    const rawName = url.pathname.split("/").filter(Boolean).at(-1);
    return rawName
      ? decodeURIComponent(rawName).replace(/[^A-Za-z0-9._-]+/g, "_")
      : undefined;
  } catch {
    return undefined;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: string
): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), mediaType);
  });
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
